import type { TaskAction } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'
import { actorOf, type Actor } from './identity.js'

/** task_log 的唯一写入口；epoch 缺省取 task_ext 当前值（没有 ext 行为 0）。 */
export function logTask(
  deps: CommandDeps,
  e: { team: string; taskId: string; actor: Actor | null; action: TaskAction; detail?: unknown; epoch?: number },
): void {
  deps.registry.appendTaskLog({
    team: e.team,
    taskId: e.taskId,
    epoch: e.epoch ?? deps.registry.getTaskExt(e.taskId)?.epoch ?? 0,
    ...actorOf(e.actor),
    action: e.action,
    detail: e.detail,
  })
}
