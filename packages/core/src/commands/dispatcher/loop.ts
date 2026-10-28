import path from 'node:path'
import { WinglineError } from '../../errors.js'
import { pruneCallLogs } from '../../log/call-log.js'
import type { TeamRow } from '../../registry/registry.js'
import { specHash } from '../../spec/hash.js'
import { loadTeamSpec, type TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { pruneGateOutputs } from '../task/gate-exec.js'
import { fenced } from '../task/ledger.js'
import { mustTeamReady } from '../task/query.js'
import { advancePatrol, PATROL_INTERVAL_MS, type PatrolOps } from './advance.js'
import { processBatch } from './inbox.js'
import { HEARTBEAT_TAKEOVER_MS } from './lifecycle.js'
import type { OutletIo } from './outlets.js'
import { syncOrca } from './orca-sync.js'
import { advanceScreenSignals } from './screen-signals.js'
import { markUnread } from './unread.js'
import { detectSignals, syncCursors, takeSnapshot } from './signals.js'

export const CHECK_WAIT_MS = 60_000
export const WAKE_GAP_MS = 60_000
export const BACKOFF_START_MS = 5_000
export const BACKOFF_MAX_MS = 60_000
export const CHECK_FAILURES_BEFORE_DROP = 3
export const CHECK_RERECORD_MS = 10 * 60_000
const EVENT_KEEP_MS = 30 * 24 * 3_600_000
/** 只读轮询只记摘要（spec 第 8 节）。 */
export const READ_ONLY_CALLS: ReadonlyArray<readonly [string, string]> = [
  ['orchestration', 'check'], ['orchestration', 'task-list'], ['orchestration', 'worker-list'], ['orchestration', 'run-show'],
  ['orchestration', 'request-show'], ['terminal', 'list'], ['terminal', 'show'], ['terminal', 'read'],
]

export interface LoopState {
  team: TeamRow
  /** null：还没有一份校验过的规格（启动时读不到或哈希对不上）；此时只维持心跳与收件箱，不处理消息、不巡查，每轮重试加载（spec 第 8 节：规格问题从不让调度员退出）。 */
  spec: TeamSpec | null
  /** 规格加载失败的事件是否已记过（避免每轮重复记）。 */
  specFailureLogged: boolean
  specHash: string
  /** 由 runDispatcherLoop 置真；为真时 heartbeat 返回 false 即退出。 */
  locked: boolean
  lastScanAt: number
  lastWall: number
  lastMono: number
  wokeAt: number | null
  observeOnlyNextScan: boolean
  /** 未读标记的连续失败计数（本次运行内存里的；放弃时另记 unread_gave_up 事件供 wl attention 读取）。 */
  unreadFailures: { count: number }
  pendingAck: string | null
  checkFailures: number
  backoffMs: number
  logDay: string
  /** 上一次 check 是否成功；只在结果变化时记事件。 */
  lastCheckOk: boolean | null
  /** 最近一次写 check_* 事件的时间；结果没变时每 CHECK_RERECORD_MS 重记一次，让"上次检查"保持新鲜。 */
  lastCheckEventAt: number
}
export interface LoopOpts {
  signal?: AbortSignal
  sleep?: (ms: number) => Promise<void>
  ops?: PatrolOps
  io?: OutletIo
  waitMs?: number
}
export interface LoopResult {
  check: 'ok' | 'fenced' | 'failed' | 'lost'
  scanned: boolean
  woke: boolean
}

const lockKey = (team: string) => `dispatcher:${team}`
const defaultSleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))
const dayOf = (d: Date) => d.toISOString().slice(0, 10)
const codeOf = (err: unknown) => (err instanceof WinglineError ? err.code : 'error')

function superseded(deps: CommandDeps, team: string): WinglineError {
  deps.registry.appendPatrolEvent({ team, action: 'superseded', outcome: 'ok' })
  return new WinglineError('input', 'dispatcher_superseded', `调度员锁已被另一个进程接管，退出`)
}

/** 本进程持有的锁行被别人接管 → 抛 dispatcher_superseded；没有锁行（直接调用）不检查。 */
function beat(deps: CommandDeps, team: string, mustHold: boolean): void {
  const ok = deps.registry.heartbeat(lockKey(team))
  if (!ok && mustHold) throw superseded(deps, team)
}

/** run-use 到自己；成功只更新 coordinator_handle 这一列（2A 第 5.2 节）。 */
async function claimRun(deps: CommandDeps, team: string, handle: string): Promise<TeamRow> {
  await deps.orca.runUse({ id: mustTeamReady(deps, team).runId!, from: handle })
  deps.registry.updateCoordinatorHandle(team, handle)
  return mustTeamReady(deps, team)
}

/** 审计事件清理（3A spec §6.4），只清本团队。失败只警告，不影响循环。 */
function pruneAuditBestEffort(deps: CommandDeps, team: string, before: string): void {
  try {
    deps.registry.pruneAudit(before, team)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    deps.warn(`审计清理失败（${codeOf(err)}）：${detail}`)
  }
}

export async function connectDispatcher(deps: CommandDeps, team: string, handle: string, opts: LoopOpts = {}): Promise<TeamRow> {
  const sleep = opts.sleep ?? defaultSleep
  let backoff = BACKOFF_START_MS
  for (;;) {
    if (deps.registry.getLock(lockKey(team))) beat(deps, team, true)
    try {
      return await claimRun(deps, team, handle)
    } catch (err) {
      if (codeOf(err) === 'run_not_found' || opts.signal?.aborted) throw err
      deps.registry.appendPatrolEvent({ team, action: 'connect_retry', outcome: `failed:${codeOf(err)}` })
      await sleep(backoff)
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS)
    }
  }
}

function recordSpecFailure(deps: CommandDeps, team: string, err: unknown): void {
  deps.registry.appendPatrolEvent({
    team, action: 'spec_reload_failed', outcome: `failed:${codeOf(err)}`, detail: { message: err instanceof Error ? err.message : String(err) },
  })
}

/** 启动时读规格：读不到、校验失败或哈希与 teams.spec_hash 对不上 → 记 spec_reload_failed 并返回 null，调度员照常运行（spec 第 8 节）。 */
export function loadStartupSpec(deps: CommandDeps, team: TeamRow): TeamSpec | null {
  try {
    return checkedSpec(loadTeamSpec(team.specPath), team)
  } catch (err) {
    recordSpecFailure(deps, team.name, err)
    return null
  }
}

function checkedSpec(spec: TeamSpec, team: TeamRow): TeamSpec {
  if (specHash(spec) !== team.specHash) throw new WinglineError('input', 'team_spec_changed', '规格文件在 wl up 之后又被改过')
  return spec
}

/** spec 为 null 表示启动时没有拿到可用规格（已由 loadStartupSpec 记过事件）。传入的规格也会核对哈希。 */
export function initialState(deps: CommandDeps, team: TeamRow, spec: TeamSpec | null): LoopState {
  const now = deps.now()
  // 调度员（重新）启动：此前因连续失败而停手的 Orca 同步重新尝试（3C spec 第 6.4 节）
  deps.registry.resetOrcaSyncFailures(team.name)
  let usable = spec
  let failureLogged = spec === null
  if (spec) {
    try {
      checkedSpec(spec, team)
    } catch (err) {
      recordSpecFailure(deps, team.name, err)
      usable = null
      failureLogged = true
    }
  }
  return {
    team, spec: usable, specFailureLogged: failureLogged, specHash: team.specHash, locked: false, lastScanAt: now.getTime(), lastWall: now.getTime(), lastMono: deps.monotonic(),
    wokeAt: null, observeOnlyNextScan: true, unreadFailures: { count: 0 }, pendingAck: null, checkFailures: 0, backoffMs: BACKOFF_START_MS, logDay: dayOf(now), lastCheckOk: null, lastCheckEventAt: 0,
  }
}

function detectWake(deps: CommandDeps, st: LoopState): boolean {
  const wall = deps.now().getTime()
  const mono = deps.monotonic()
  const woke = wall - st.lastWall - (mono - st.lastMono) > WAKE_GAP_MS
  if (woke) {
    st.wokeAt = wall
    st.observeOnlyNextScan = true
    deps.registry.appendPatrolEvent({ team: st.team.name, action: 'wake', outcome: 'ok' })
  }
  st.lastWall = wall
  st.lastMono = mono
  return woke
}

function reloadSpec(deps: CommandDeps, st: LoopState, target: TeamRow): void {
  const team = st.team.name
  try {
    st.spec = checkedSpec(loadTeamSpec(target.specPath), target)
    st.specFailureLogged = false
    deps.registry.appendPatrolEvent({ team, action: 'spec_reload', outcome: 'ok' })
  } catch (err) {
    if (st.spec !== null || !st.specFailureLogged) recordSpecFailure(deps, team, err)
    st.specFailureLogged = true
  }
  st.specHash = target.specHash
}

function maintain(deps: CommandDeps, st: LoopState): void {
  const now = deps.now()
  if (dayOf(now) !== st.logDay) {
    pruneCallLogs(path.join(deps.home, 'logs'), now)
    pruneGateOutputs(deps.home, st.team.name, now)
    deps.registry.prunePatrolEvents(new Date(now.getTime() - EVENT_KEEP_MS).toISOString())
    // 审计事件同保留 30 天（3A spec §6.4）；调度员循环 + wl log 各清理一次。
    pruneAuditBestEffort(deps, st.team.name, new Date(now.getTime() - EVENT_KEEP_MS).toISOString())
    // 已结束状态同样只留 30 天：已清除的巡查行、已回答的提问、已定案的账本行，不清会一直涨
    deps.registry.pruneFinishedState(new Date(now.getTime() - EVENT_KEEP_MS).toISOString())
    st.logDay = dayOf(now)
  }
  const target = mustTeamReady(deps, st.team.name)
  st.team = target
  if (target.specHash !== st.specHash || st.spec === null) reloadSpec(deps, st, target)
}

async function checkFailed(st: LoopState, opts: LoopOpts, result: 'failed' | 'lost'): Promise<LoopResult['check']> {
  st.checkFailures += 1
  if (st.checkFailures >= CHECK_FAILURES_BEFORE_DROP) st.pendingAck = null
  await (opts.sleep ?? defaultSleep)(st.backoffMs)
  st.backoffMs = Math.min(st.backoffMs * 2, BACKOFF_MAX_MS)
  return result
}

async function reclaim(deps: CommandDeps, st: LoopState, handle: string, opts: LoopOpts): Promise<void> {
  st.pendingAck = null
  let outcome = 'ok'
  try {
    st.team = await claimRun(deps, st.team.name, handle)
  } catch (err) {
    outcome = `failed:${codeOf(err)}`
  }
  deps.registry.appendPatrolEvent({ team: st.team.name, action: 'fenced_reclaim', outcome })
  if (outcome === 'ok') return
  await (opts.sleep ?? defaultSleep)(st.backoffMs)
  st.backoffMs = Math.min(st.backoffMs * 2, BACKOFF_MAX_MS)
}

async function inbox(deps: CommandDeps, handle: string, st: LoopState, opts: LoopOpts): Promise<LoopResult['check']> {
  try {
    const batch = await deps.orca.check({
      terminal: handle, run: st.team.runId!, ack: st.pendingAck ?? undefined, wait: true, timeoutMs: opts.waitMs ?? CHECK_WAIT_MS,
    })
    if (batch.connectionLost) return await checkFailed(st, opts, 'lost')
    st.pendingAck = null
    st.checkFailures = 0
    st.backoffMs = BACKOFF_START_MS
    beat(deps, st.team.name, st.locked)
    if (batch.messages.length > 0 && st.spec) {
      await processBatch(deps, { team: st.team, spec: st.spec }, batch, opts.io)
      st.pendingAck = batch.deliveryId
    }
    return 'ok'
  } catch (err) {
    if (fenced(err)) {
      await reclaim(deps, st, handle, opts)
      return 'fenced'
    }
    if (err instanceof WinglineError && err.code === 'dispatcher_superseded') throw err
    return checkFailed(st, opts, 'failed')
  }
}

async function scan(deps: CommandDeps, st: LoopState, spec: TeamSpec, opts: LoopOpts): Promise<void> {
  const ctx = { team: st.team, spec }
  const team = st.team.name
  try {
    const snap = await takeSnapshot(deps, ctx, { wokeAt: st.wokeAt === null ? null : new Date(st.wokeAt), onProgress: () => beat(deps, team, st.locked) })
    syncCursors(deps, team, [...snap.streakAfterCursor.keys()], snap)
    beat(deps, team, st.locked)
    // 先推进画面信号（用量暂停、“继续”提示），再判普通信号：暂停与 no_progress 基线都依赖这一步的结果
    await advanceScreenSignals(deps, ctx, snap, { observeOnly: st.observeOnlyNextScan, io: opts.io })
    const hits = detectSignals(snap, spec, deps.registry.listPatrolState(team))
    const round = { failed: new Set<string>() }
    await advancePatrol(deps, ctx, hits, { observeOnly: st.observeOnlyNextScan, ops: opts.ops, io: opts.io, round })
    await syncOrca(deps, ctx, snap, { observeOnly: st.observeOnlyNextScan, round })
    await markUnread(deps, ctx, snap, { observeOnly: st.observeOnlyNextScan, failures: st.unreadFailures })
    deps.registry.appendPatrolEvent({ team, action: 'scan', outcome: 'ok', detail: { hits: hits.length } })
  } catch (err) {
    if (err instanceof WinglineError && err.code === 'dispatcher_superseded') throw err
    deps.registry.appendPatrolEvent({ team, action: 'scan_skipped', outcome: `failed:${codeOf(err)}` })
  } finally {
    st.lastScanAt = deps.now().getTime()
    st.observeOnlyNextScan = false
  }
}

function recordCheck(deps: CommandDeps, st: LoopState, check: LoopResult['check']): void {
  const ok = check === 'ok'
  const nowMs = deps.now().getTime()
  if (st.lastCheckOk === ok && nowMs - st.lastCheckEventAt < CHECK_RERECORD_MS) return
  st.lastCheckOk = ok
  st.lastCheckEventAt = nowMs
  deps.registry.appendPatrolEvent({ team: st.team.name, action: ok ? 'check_ok' : 'check_failed', outcome: ok ? 'ok' : `failed:${check}` })
}

/** spec 第 3 节的五步：心跳 → 唤醒检测 → 维护 → 收件箱 → 巡查（巡查与收件箱是否成功无关）。 */
export async function loopOnce(deps: CommandDeps, handle: string, st: LoopState, opts: LoopOpts = {}): Promise<LoopResult> {
  beat(deps, st.team.name, st.locked)
  const woke = detectWake(deps, st)
  maintain(deps, st)
  const check = await inbox(deps, handle, st, opts)
  recordCheck(deps, st, check)
  beat(deps, st.team.name, st.locked)
  const due = deps.now().getTime() - st.lastScanAt >= PATROL_INTERVAL_MS
  if (due && st.spec) await scan(deps, st, st.spec, opts)
  else if (due) st.lastScanAt = deps.now().getTime()
  return { check, scanned: due && st.spec !== null, woke }
}

export async function runDispatcherLoop(deps: CommandDeps, team: string, opts: LoopOpts = {}): Promise<void> {
  const handle = deps.env.ORCA_TERMINAL_HANDLE
  if (!handle) {
    throw new WinglineError('input', 'dispatcher_not_in_orca', '调度员必须跑在 Orca 终端里（缺少 ORCA_TERMINAL_HANDLE）', {
      hint: `用 wl dispatcher up ${team} 启动，或在 Orca 终端里运行`,
    })
  }
  await deps.registry.withTeamLock(lockKey(team), async () => {
    const connected = await connectDispatcher(deps, team, handle, opts)
    const st = initialState(deps, connected, loadStartupSpec(deps, connected))
    st.locked = true
    while (!opts.signal?.aborted) {
      try {
        await loopOnce(deps, handle, st, opts)
      } catch (err) {
        if (err instanceof WinglineError && err.code === 'dispatcher_superseded') throw err
        deps.registry.appendPatrolEvent({ team, action: 'loop_error', outcome: `failed:${codeOf(err)}` })
        await (opts.sleep ?? defaultSleep)(BACKOFF_START_MS)
      }
    }
  }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
}
