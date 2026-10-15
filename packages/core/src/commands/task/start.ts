import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { announce, dispatchTo, type Delivery } from './dispatch.js'
import { frozenError, isPostFrozen } from './frozen.js'
import { isOwnTerminal, requireActor, resolveHandle } from './identity.js'
import { taskPreflight } from './preflight.js'
import { findTask, type TaskRow } from './query.js'

const fail = (code: string, message: string, hint?: string) => new WinglineError('input', code, message, { hint })

/** 派发已落地、但账本行还没定案（pending/uncertain）：经 dispatchTo 重放，把行收成 done。 */
async function settleOpenDispatch(deps: CommandDeps, team: string, task: TaskRow, target: { address: string; handle: string }): Promise<void> {
  const row = deps.registry.getRequest(`dispatch:${task.id}:${task.epoch}`)
  if (row && row.state !== 'done') await dispatchTo(deps, team, task.id, target)
}

export async function startTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<{ delivery: Delivery; reason?: string; already?: true }> {
  const actor = await requireActor(deps, a.as)
  const team = actor.address.slice(actor.address.indexOf('@') + 1)
  const { spec } = await taskPreflight(deps, team)
  const task = await findTask(deps, team, a.id)
  if (task.claimedBy !== actor.address) throw fail('not_claimed_by_you', `任务 ${a.id} 不是 ${actor.address} 认领的`)
  const post = spec.posts.find((p) => `${p.id}@${team}` === actor.address)
  if (!post) throw fail('post_unknown', `${actor.address} 不是团队 ${team} 的岗位`)
  if (post.planFirst && !task.plan) throw fail('plan_required', `岗位 ${actor.address} 要求先写计划`, `wl task plan ${a.id} "<计划>"`)
  const handle = await resolveHandle(deps, actor)
  if (task.status === 'dispatched' && task.assigneeHandle === handle) {
    await settleOpenDispatch(deps, team, task, { address: actor.address, handle })
    return { delivery: isOwnTerminal(deps, handle) ? 'self' : 'not_notified', already: true }
  }
  if (task.status !== 'ready') throw fail('task_not_open', `任务 ${a.id} 状态为 ${task.status}，不能开始`)
  if (isPostFrozen(deps, actor.address)) throw frozenError(actor.address)
  const target = { address: actor.address, handle }
  const d = await dispatchTo(deps, team, a.id, target)
  if (d.status === 'queued') {
    throw fail('post_busy', `岗位 ${actor.address} 手上已有进行中的任务 ${d.busyWith}`, `先 wl task done 或 wl task release（进行中的任务 ${d.busyWith}）`)
  }
  return announce(deps, team, task, target, d, actor)
}
