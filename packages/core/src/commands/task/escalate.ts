import { WinglineError } from '../../errors.js'
import type { OrchestrationTaskStatus } from '../../orca/types.js'
import type { CommandDeps } from '../deps.js'
import { locatePost } from '../locate.js'
import { announce, bumpRound, dispatchTo, type Delivery } from './dispatch.js'
import { isPostFrozen } from './frozen.js'
import { resolveActor } from './identity.js'
import { ledgered, oneShot } from './ledger.js'
import { logTask } from './log.js'
import { neutralize, notifyPost } from './notify.js'
import { taskPreflight } from './preflight.js'
import { findTask, findTaskAnywhere, type TaskRow } from './query.js'

const fail = (code: string, message: string, hint?: string) => new WinglineError('input', code, message, { hint })
const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`

export async function escalateTask(
  deps: CommandDeps,
  a: { id: string; reason: string; reopen?: boolean; as?: string; retryRequest?: string },
): Promise<{ gateId: string; status: OrchestrationTaskStatus; tookBackDispatch: boolean }> {
  const { team, task } = await findTaskAnywhere(deps, a.id)
  const { spec } = await taskPreflight(deps, team.name)
  const actor = await resolveActor(deps, a.as)
  const lead = `${spec.lead}@${team.name}`
  if (actor && actor.address !== task.claimedBy && actor.address !== lead) {
    throw fail('not_your_task', `任务 ${a.id} 只能由主人、牵头岗或人来转人工决策`)
  }
  if ((task.status === 'completed' || task.status === 'failed') && !a.reopen) {
    throw fail('reopen_required', `任务 ${a.id} 已结束（${task.status}）`, '已终态的任务 escalate 后 resolve 会回到 ready，会在新的一轮重新走 gate 与连接；确认要重开请加 --reopen')
  }
  const gate = await oneShot(deps, {
    team: team.name,
    retryRequest: a.retryRequest,
    fromReceipt: (r) => {
      const id = (r as { gate?: { id?: string } } | null)?.gate?.id
      return id ? { id, replayed: true } : null
    },
    retryHint: (rid) => `wl task escalate ${a.id} --reason ${quote(a.reason)} --retry-request ${rid}`,
    build: (t) => ({ task: a.id, question: a.reason, from: t.coordinatorHandle! }),
    call: (x) => deps.orca.gateCreate(x),
  })
  const known = deps.registry.getGate(gate.id) !== null
  deps.registry.recordGate(gate.id, team.name, a.id)
  if (!known) logTask(deps, { team: team.name, taskId: a.id, actor, action: 'escalate', detail: { gateId: gate.id, reason: a.reason } })
  if (!known && lead !== actor?.address) {
    await notifyPost(deps, lead, `[雁阵] 任务 ${a.id} 已转人工决策（${neutralize(a.reason, 80)}）：wl task resolve ${gate.id} --resolution <决定>`)
  }
  const now = await findTask(deps, team.name, a.id)
  return { gateId: gate.id, status: now.status, tookBackDispatch: task.status === 'dispatched' }
}

export async function resolveGate(
  deps: CommandDeps,
  a: { gateId: string; resolution: string; reassign?: string; as?: string },
): Promise<{ taskId: string; status: OrchestrationTaskStatus; claimedBy: string | null }> {
  const gate = deps.registry.getGate(a.gateId)
  if (!gate) throw fail('gate_unknown', `本地没有 gate ${a.gateId} 的记录`, '只能 resolve 由雁阵建立的 gate')
  const { spec } = await taskPreflight(deps, gate.team)
  if (a.reassign && !spec.posts.some((p) => `${p.id}@${gate.team}` === a.reassign)) {
    throw fail('post_unknown', `${a.reassign} 不是团队 ${gate.team} 的岗位`)
  }
  if (a.reassign && isPostFrozen(deps, a.reassign)) throw fail('post_frozen', `岗位 ${a.reassign} 已冻结`)
  const actor = await resolveActor(deps, a.as)
  await ledgered(deps, {
    key: `resolve:${a.gateId}`,
    team: gate.team,
    build: (t) => ({ id: a.gateId, resolution: a.resolution, from: t.coordinatorHandle! }),
    call: (x) => deps.orca.gateResolve(x),
  })
  if (a.reassign) deps.registry.setClaimedBy(gate.team, gate.taskId, a.reassign)
  deps.registry.setReadySince(gate.team, gate.taskId, deps.now().toISOString())
  logTask(deps, { team: gate.team, taskId: gate.taskId, actor, action: 'resolve', detail: { gateId: a.gateId, resolution: a.resolution } })
  const task = await findTask(deps, gate.team, gate.taskId)
  return { taskId: task.id, status: task.status, claimedBy: task.claimedBy }
}

// —— recover ——

type Recorded = { dispatchId: string; epoch: number }

/** 本地记录 recover:<task>:open：存下这次 recover 针对的 dispatch_id 与 epoch，中断后据此续跑。 */
/** 记录只在这次 recover 还在进行时才算数：任务仍派在原 dispatch 上，或这一轮的 gate-create 已经走过。 */
function recordStillApplies(deps: CommandDeps, id: string, task: TaskRow, rec: Recorded): boolean {
  if (task.status === 'dispatched') return task.dispatchId === rec.dispatchId
  return deps.registry.getRequest(`recover:${id}:${rec.dispatchId}:gate`) !== null
}

async function openRecord(deps: CommandDeps, team: string, id: string): Promise<Recorded> {
  const key = `recover:${id}:open`
  const stored = deps.registry.getRequest(key)
  const task = await findTask(deps, team, id)
  if (stored?.state === 'done') {
    const rec = JSON.parse(stored.receipt!) as Recorded
    if (recordStillApplies(deps, id, task, rec)) return rec
    deps.registry.dropRequest(key)
  }
  if (task.status !== 'dispatched') throw fail('assignee_alive', `任务 ${id} 不在派发中`, '任务不在派发中，不需要 recover')
  if ((await deps.orca.terminalList()).some((t) => t.handle === task.assigneeHandle)) {
    throw fail('assignee_alive', `任务 ${id} 的执行终端仍然存活`, '终端还在，不需要 recover；若它卡住了用 wl task escalate')
  }
  const record = { dispatchId: task.dispatchId!, epoch: task.epoch }
  deps.registry.beginRequest(key)
  deps.registry.finishRequest(key, 'done', record)
  return record
}

async function reopenDispatch(deps: CommandDeps, team: string, id: string, rec: Recorded): Promise<void> {
  const gate = await ledgered(deps, {
    key: `recover:${id}:${rec.dispatchId}:gate`,
    team,
    build: (t) => ({ task: id, question: '雁阵 recover：原派发对象已不存在', from: t.coordinatorHandle! }),
    call: (x) => deps.orca.gateCreate(x),
  })
  deps.registry.recordGate(gate.id, team, id)
  await ledgered(deps, {
    key: `recover:${id}:${rec.dispatchId}:resolve`,
    team,
    build: (t) => ({ id: gate.id, resolution: 'recover', from: t.coordinatorHandle! }),
    call: (x) => deps.orca.gateResolve(x),
  })
}

type RecoverResult = { status: 'dispatched' | 'queued' | 'ready'; delivery?: Delivery; epoch: number; reason?: string; owner?: string | null }

export async function recoverTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<RecoverResult> {
  const { team } = await findTaskAnywhere(deps, a.id)
  await taskPreflight(deps, team.name)
  const rec = await openRecord(deps, team.name, a.id)
  await reopenDispatch(deps, team.name, a.id, rec)
  const actor = await resolveActor(deps, a.as)
  const owner = (await findTask(deps, team.name, a.id)).claimedBy
  const finish = async (r: Omit<RecoverResult, 'epoch' | 'owner'>): Promise<RecoverResult> => {
    deps.registry.dropRequest(`recover:${a.id}:open`)
    logTask(deps, { team: team.name, taskId: a.id, actor, action: 'recover', detail: r })
    return { ...r, owner, epoch: deps.registry.getTaskExt(a.id)?.epoch ?? rec.epoch }
  }
  if (!owner) return finish({ status: 'ready' })
  if (isPostFrozen(deps, owner)) return finish({ status: 'ready', reason: 'skipped_frozen' })
  const located = await locatePost(deps.orca, owner)
  if (!located) return finish({ status: 'ready', reason: 'post_offline' })
  const current = await findTask(deps, team.name, a.id)
  if (!deps.registry.getRequest(`dispatch:${a.id}:${rec.epoch}`) && current.epoch === rec.epoch) bumpRound(deps, team.name, current)
  const target = { address: owner, handle: located.handle }
  const d = await dispatchTo(deps, team.name, a.id, target)
  const ann = await announce(deps, team.name, current, target, d, actor)
  return finish({ status: d.status === 'queued' ? 'queued' : 'dispatched', delivery: ann.delivery })
}
