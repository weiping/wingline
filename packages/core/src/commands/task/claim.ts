import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { requireActor, resolveActor, type Actor } from './identity.js'
import { logTask } from './log.js'
import { neutralize, notifyPost, type NotifyResult } from './notify.js'
import { taskPreflight } from './preflight.js'
import { findTask, findTaskAnywhere, type TaskRow } from './query.js'
import { isPostFrozen } from './frozen.js'

const teamOfAddress = (address: string) => address.slice(address.indexOf('@') + 1)
const fail = (code: string, message: string, hint?: string) => new WinglineError('input', code, message, { hint })

async function actorInTeam(deps: CommandDeps, as?: string): Promise<{ actor: Actor; team: string }> {
  const actor = await requireActor(deps, as)
  return { actor, team: teamOfAddress(actor.address) }
}

export async function claimTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<void> {
  const { actor, team } = await actorInTeam(deps, a.as)
  const { spec } = await taskPreflight(deps, team)
  const post = spec.posts.find((p) => `${p.id}@${team}` === actor.address)
  if (!post) throw fail('post_unknown', `${actor.address} 不是团队 ${team} 的岗位`)
  if (!post.selfClaim) throw fail('self_claim_disabled', `岗位 ${actor.address} 没有开启 self_claim`, '在 team.yaml 里给该岗位加 self_claim: true')
  await deps.registry.withTeamLock(team, async () => {
    const task = await findTask(deps, team, a.id)
    if (task.status !== 'ready' || task.claimedBy) throw fail('task_not_open', `任务 ${a.id} 不是未认领的 ready 任务`)
    if (task.tags.length > 0 && !task.tags.some((t) => post.tags.includes(t))) {
      throw fail('tags_mismatch', `任务标签 ${task.tags.join(',')} 与岗位标签 ${post.tags.join(',') || '(无)'} 不相交`)
    }
    deps.registry.setClaimedBy(team, a.id, actor.address)
    logTask(deps, { team, taskId: a.id, actor, action: 'claim' })
  })
}

function assertReleasable(task: TaskRow, actor: Actor): void {
  if (task.claimedBy !== actor.address) throw fail('not_claimed_by_you', `任务 ${task.id} 不是你认领的`)
  if (task.status === 'dispatched') {
    throw fail('task_dispatched', `任务 ${task.id} 已派发`, '先 wl task escalate <id> 收回派发，或完成后 wl task done')
  }
  if (task.status === 'completed' || task.status === 'failed') throw fail('task_terminal', `任务 ${task.id} 已结束`)
}

export async function releaseTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<void> {
  const { actor, team } = await actorInTeam(deps, a.as)
  await taskPreflight(deps, team)
  await deps.registry.withTeamLock(team, async () => {
    assertReleasable(await findTask(deps, team, a.id), actor)
    deps.registry.setClaimedBy(team, a.id, null)
    deps.registry.setReadySince(team, a.id, deps.now().toISOString())
    logTask(deps, { team, taskId: a.id, actor, action: 'release' })
  })
}

export async function reassignTask(deps: CommandDeps, a: { id: string; to: string; as?: string }): Promise<{ notify: NotifyResult }> {
  const { team: row, task } = await findTaskAnywhere(deps, a.id)
  const { spec } = await taskPreflight(deps, row.name)
  if (!spec.posts.some((p) => `${p.id}@${row.name}` === a.to)) throw fail('post_unknown', `${a.to} 不是团队 ${row.name} 的岗位`)
  if (isPostFrozen(deps, a.to)) throw fail('post_frozen', `岗位 ${a.to} 已冻结`)
  const actor = await resolveActor(deps, a.as)
  await deps.registry.withTeamLock(row.name, async () => {
    const now = await findTask(deps, row.name, a.id)
    if (now.status === 'dispatched') throw fail('task_dispatched', `任务 ${a.id} 已派发`, '先 wl task escalate <id> 收回派发')
    if (now.status === 'completed' || now.status === 'failed') throw fail('task_terminal', `任务 ${a.id} 已结束`)
    deps.registry.setClaimedBy(row.name, a.id, a.to)
    if (now.status === 'ready') deps.registry.setReadySince(row.name, a.id, deps.now().toISOString())
    logTask(deps, { team: row.name, taskId: a.id, actor, action: 'reassign', detail: { from: now.claimedBy, to: a.to } })
  })
  const line = `[雁阵] 任务 ${a.id} 转给了你：${neutralize(task.title, 80)}。查看：wl task show ${a.id}；准备好后运行：wl task start ${a.id}`
  return { notify: await notifyPost(deps, a.to, line) }
}
