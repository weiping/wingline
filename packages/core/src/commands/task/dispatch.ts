import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import type { Actor } from './identity.js'
import { isOwnTerminal } from './identity.js'
import { ledgered } from './ledger.js'
import { logTask } from './log.js'
import { neutralize, notifyPost, type NotifyResult } from './notify.js'
import { findTask, fetchTasks, type TaskRow } from './query.js'

export type Delivery = 'notified' | 'notified_unconfirmed' | 'not_notified' | 'self' | 'queued'
export type DispatchOutcome =
  | { status: 'dispatched'; dispatchId: string; self: boolean; replayed: boolean }
  | { status: 'queued'; busyWith: string }

type Target = { address: string; handle: string }
type Dispatched = Extract<DispatchOutcome, { status: 'dispatched' }>

/** Orca 限定每个岗位终端同时只有一个进行中的派发。 */
export const isBusyError = (err: unknown): boolean =>
  err instanceof WinglineError && err.kind === 'orca' && err.code === 'runtime_error' && err.message.includes('already has an active dispatch')

export const SPEC_FOOTER = '完成后运行 wl task done <本任务 id>（不要直接用 orca orchestration send 上报）'

export function taskSpec(deps: CommandDeps, head: string): string {
  return deps.multilineSafe ? `${head}\n\n${SPEC_FOOTER}` : `${head}。${SPEC_FOOTER}`
}

const dispatchKey = (taskId: string, epoch: number) => `dispatch:${taskId}:${epoch}`

async function busyWith(deps: CommandDeps, team: string, taskId: string, handle: string): Promise<string | null> {
  const tasks = await fetchTasks(deps, team)
  return tasks.find((t) => t.id !== taskId && t.status === 'dispatched' && t.assigneeHandle === handle)?.id ?? null
}

/** 上一轮派发结束（任务回到 ready）：epoch +1，并把上一轮留下的未收尾判定收尾为 abandoned。 */
function bumpRound(deps: CommandDeps, team: string, task: TaskRow): void {
  const { registry } = deps
  const old = registry.getVerdict(task.id, task.epoch)
  const next = registry.bumpEpoch(team, task.id, task.epoch, old?.verdict === 'escalate')
  if (old && old.finishedAt === null) registry.finishVerdict(task.id, task.epoch, { outcome: 'abandoned' })
  logTask(deps, { team, taskId: task.id, actor: null, action: 'epoch_bump', epoch: next, detail: { from: task.epoch } })
}

async function aliveHandle(deps: CommandDeps, handle: string): Promise<boolean> {
  return (await deps.orca.terminalList()).some((t) => t.handle === handle)
}

async function ledgerDispatch(deps: CommandDeps, team: string, task: TaskRow, target: Target, canBump: boolean): Promise<DispatchOutcome> {
  try {
    const r = await ledgered(deps, {
      key: dispatchKey(task.id, task.epoch),
      team,
      build: (t) => ({ task: task.id, to: target.handle, from: t.coordinatorHandle!, self: isOwnTerminal(deps, target.handle) }),
      call: async ({ self, ...a }): Promise<Dispatched> => {
        const sent = await deps.orca.dispatch(a)
        return { status: 'dispatched', dispatchId: sent.dispatchId, self, replayed: sent.replayed }
      },
      beforeReplay: async (stored) => ((await aliveHandle(deps, stored.to)) ? 'replay' : 'settle'),
    })
    deps.registry.setDispatchedAt(team, task.id, deps.now().toISOString())
    return r.replayed ? confirmReplay(deps, team, task, target, r, canBump) : r
  } catch (err) {
    const other = isBusyError(err) ? await busyWith(deps, team, task.id, target.handle) : null
    if (other) return { status: 'queued', busyWith: other }
    throw err
  }
}

/** 重放的结果可能是上一轮的：任务此刻回到 ready 就进入新一轮（只一次）。 */
async function confirmReplay(deps: CommandDeps, team: string, task: TaskRow, target: Target, r: Dispatched, canBump: boolean): Promise<DispatchOutcome> {
  const now = await findTask(deps, team, task.id)
  if (now.status !== 'ready' || !canBump) return r
  bumpRound(deps, team, now)
  return dispatchRound(deps, team, task.id, target, false)
}

async function dispatchRound(deps: CommandDeps, team: string, taskId: string, target: Target, canBump: boolean): Promise<DispatchOutcome> {
  const task = await findTask(deps, team, taskId)
  const row = deps.registry.getRequest(dispatchKey(taskId, task.epoch))
  if (row?.state === 'done') {
    if (task.status !== 'ready' || !canBump) return JSON.parse(row.receipt!) as DispatchOutcome
    bumpRound(deps, team, task)
    return dispatchRound(deps, team, taskId, target, false)
  }
  if (!row) {
    if (task.status !== 'ready') throw new WinglineError('input', 'task_not_open', `任务 ${taskId} 状态为 ${task.status}，不能派发`)
    const other = await busyWith(deps, team, taskId, target.handle)
    if (other) return { status: 'queued', busyWith: other }
  }
  return ledgerDispatch(deps, team, task, target, canBump)
}

export function dispatchTo(deps: CommandDeps, team: string, taskId: string, target: Target): Promise<DispatchOutcome> {
  return dispatchRound(deps, team, taskId, target, true)
}

const newTaskLine = (id: string, title: string) =>
  `[雁阵] 你有新任务 ${id}：${title}。查看：wl task show ${id}；完成后运行：wl task done ${id}（不要直接用 orca orchestration send 上报）`
const queuedLine = (id: string, title: string) => `[雁阵] 你有排队任务 ${id}：${title}，手上的任务完成后运行 wl task start ${id}`

const DELIVERY = { notified: 'notified', notified_unconfirmed: 'notified_unconfirmed', not_notified: 'not_notified' } as const

/** 派发之后告诉对方（spec 第 7.3 节）。 */
export async function announce(
  deps: CommandDeps,
  team: string,
  task: { id: string; title: string },
  target: { address: string },
  d: DispatchOutcome,
  actor: Actor | null,
): Promise<{ delivery: Delivery; reason?: NotifyResult['reason']; busyWith?: string }> {
  const log = (action: 'start' | 'queued' | 'notify', detail?: unknown) => logTask(deps, { team, taskId: task.id, actor, action, detail })
  const title = neutralize(task.title, 80)
  if (d.status === 'queued') {
    log('queued', { busyWith: d.busyWith })
    log('notify', await notifyPost(deps, target.address, queuedLine(task.id, title)))
    return { delivery: 'queued', busyWith: d.busyWith }
  }
  if (d.self) {
    log('start', { delivery: 'self', dispatchId: d.dispatchId })
    return { delivery: 'self' }
  }
  log('start', { dispatchId: d.dispatchId })
  const n = await notifyPost(deps, target.address, newTaskLine(task.id, title))
  log('notify', n)
  return n.reason ? { delivery: DELIVERY[n.outcome], reason: n.reason } : { delivery: DELIVERY[n.outcome] }
}
