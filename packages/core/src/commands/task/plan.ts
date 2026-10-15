import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { resolveActor } from './identity.js'
import { logTask } from './log.js'
import { preflightTask } from './preflight.js'
import { findTask } from './query.js'

export async function planTask(deps: CommandDeps, a: { id: string; text: string }): Promise<void> {
  const { team } = await preflightTask(deps, a.id)
  const actor = await resolveActor(deps)
  await deps.registry.withTeamLock(team.name, async () => {
    const task = await findTask(deps, team.name, a.id)
    if (task.status === 'completed' || task.status === 'failed') {
      throw new WinglineError('input', 'task_terminal', `任务 ${a.id} 已结束（${task.status}），不能再写计划`)
    }
    deps.registry.setPlan(team.name, a.id, a.text)
    logTask(deps, { team: team.name, taskId: a.id, actor, action: 'plan' })
  })
}
