import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../../errors.js'
import { pidAlive } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'
import { locatePost } from '../locate.js'
import { mustTeamReady } from '../task/query.js'

export const HEARTBEAT_STALE_MS = 180_000
export const HEARTBEAT_TAKEOVER_MS = 600_000

const lockKey = (team: string) => `dispatcher:${team}`
const addressOf = (team: string) => `dispatcher@${team}`

export interface DispatcherHealth {
  state: 'running' | 'stale' | 'stopped' | 'never'
  pid?: number
  heartbeatAt?: string | null
  ageMs?: number
}

/** 只有调度员循环自己会写的事件；人手动 freeze/hush 或 2A 命令写的事件不算它启动过。 */
const DISPATCHER_ACTIONS = [
  'check_ok', 'check_failed', 'scan', 'scan_skipped', 'wake', 'connect_retry', 'fenced_reclaim', 'spec_reload', 'spec_reload_failed', 'loop_error', 'superseded',
] as const

/** spec 第 2.2 节：pid 与心跳都要看。 */
export function dispatcherHealth(deps: CommandDeps, team: string): DispatcherHealth {
  const lock = deps.registry.getLock(lockKey(team))
  if (!lock) return { state: deps.registry.hasPatrolEventOf(team, DISPATCHER_ACTIONS) ? 'stopped' : 'never' }
  const ageMs = deps.now().getTime() - Date.parse(lock.heartbeatAt ?? lock.at)
  const state = pidAlive(lock.pid) && ageMs <= HEARTBEAT_STALE_MS ? 'running' : 'stale'
  return { state, pid: lock.pid, heartbeatAt: lock.heartbeatAt, ageMs }
}

const posixQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
const WINDOWS_UNSAFE = /["%$`]/

function unsupported(team: string, why: string): WinglineError {
  return new WinglineError('input', 'dispatcher_launch_unsupported', `无法自动拼出调度员的启动命令：${why}`, {
    hint: `Windows 上无法自动启动调度员：在 Orca 里手动开一个终端、标题设为 ${addressOf(team)}，在里面运行 wl dispatcher run ${team}`,
  })
}

export function dispatcherLaunchCommand(a: {
  platform: NodeJS.Platform
  node: string
  script: string
  team: string
  home: string
  orca: string
  nodeOnPath?: boolean
}): string {
  const tail = (q: (s: string) => string) => `${q(a.script)} dispatcher run ${a.team} --home ${q(a.home)} --orca ${q(a.orca)}`
  if (a.platform !== 'win32') return `${posixQuote(a.node)} ${tail(posixQuote)}`
  if (!a.nodeOnPath) throw unsupported(a.team, 'PATH 上找不到 node')
  if ([a.script, a.home, a.orca].some((p) => WINDOWS_UNSAFE.test(p))) throw unsupported(a.team, '路径含有 " % $ ` 之一')
  return `node ${tail((s) => `"${s}"`)}`
}

function nodeOnPath(deps: CommandDeps): boolean {
  const dirs = (deps.env.PATH ?? deps.env.Path ?? '').split(path.delimiter).filter(Boolean)
  return dirs.some((d) => fs.existsSync(path.join(d, 'node.exe')))
}

export interface UpArgs {
  team: string
  platform?: NodeJS.Platform
  confirmMs?: number
  pollMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

async function confirmStarted(deps: CommandDeps, a: UpArgs, handle: string): Promise<void> {
  const sleep = a.sleep ?? defaultSleep
  const pollMs = a.pollMs ?? 1000
  for (let waited = 0; waited <= (a.confirmMs ?? 30_000); waited += pollMs) {
    if (dispatcherHealth(deps, a.team).state === 'running') return
    await sleep(pollMs)
  }
  throw new WinglineError('uncertain', 'dispatcher_start_unconfirmed', '终端已创建但没看到调度员心跳', {
    hint: `orca terminal show --terminal ${handle} 看看画面上的报错`,
  })
}

/** spec 第 2.1 节。 */
export async function dispatcherUp(
  deps: CommandDeps,
  a: UpArgs,
): Promise<{ address: string; outcome: 'already_running' | 'started'; handle?: string }> {
  mustTeamReady(deps, a.team)
  const address = addressOf(a.team)
  if (dispatcherHealth(deps, a.team).state === 'running') return { address, outcome: 'already_running' }
  if (await locatePost(deps.orca, address)) {
    throw new WinglineError('input', 'dispatcher_stale', `调度员终端 ${address} 在，但进程没在跑`, {
      hint: `在那个终端里重新运行 wl dispatcher run ${a.team}，或 wl dispatcher down ${a.team} --close 后再 up`,
    })
  }
  const platform = a.platform ?? process.platform
  const command = dispatcherLaunchCommand({
    platform, node: process.execPath, script: process.argv[1] ?? '', team: a.team, home: deps.home, orca: deps.orcaPath, nodeOnPath: platform === 'win32' ? nodeOnPath(deps) : undefined,
  })
  const lead = deps.registry.listPosts(a.team).find((p) => p.isLead)!
  const { handle } = await deps.orca.terminalCreate({ worktree: lead.worktree, title: address, command })
  await confirmStarted(deps, a, handle)
  return { address, outcome: 'started', handle }
}

const CLOSE_POLL_MS = 200
const CLOSE_POLLS = 15

/** 关终端会给 run 进程发 SIGHUP，进程可能来不及自己清锁；等它死掉后替它删掉锁行，否则状态会一直显示失联。 */
async function clearDeadLock(deps: CommandDeps, team: string, sleep: (ms: number) => Promise<void>, pollMs: number): Promise<void> {
  for (let i = 0; i < CLOSE_POLLS; i += 1) {
    const lock = deps.registry.getLock(lockKey(team))
    if (!lock) return
    if (!pidAlive(lock.pid)) return deps.registry.deleteLockOf(lockKey(team), lock.pid)
    await sleep(pollMs)
  }
}

/** 不带 --close 什么也不做；带 --close 只关调度员这一个终端，不交还协调者身份（spec 第 1.1 节）。 */
export async function dispatcherDown(
  deps: CommandDeps,
  a: { team: string; close: boolean; sleep?: (ms: number) => Promise<void>; pollMs?: number },
): Promise<{ address: string; outcome: 'noop' | 'closed' | 'already_gone' }> {
  if (!deps.registry.getTeam(a.team)) throw new WinglineError('input', 'team_unknown', `团队 ${a.team} 未登记`)
  const address = addressOf(a.team)
  if (!a.close) return { address, outcome: 'noop' }
  const located = await locatePost(deps.orca, address)
  if (!located) return { address, outcome: 'already_gone' }
  await deps.orca.terminalClose({ handle: located.handle })
  await clearDeadLock(deps, a.team, a.sleep ?? defaultSleep, a.pollMs ?? CLOSE_POLL_MS)
  return { address, outcome: 'closed' }
}
