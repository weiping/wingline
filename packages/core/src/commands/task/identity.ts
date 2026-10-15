import { WinglineError } from '../../errors.js'
import type { ActorSource } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'
import { locatePost } from '../locate.js'

/** handle 只在隐式解析时已知。 */
export interface Actor {
  address: string
  explicit: boolean
  handle?: string
}

/** --as 优先；否则用 ORCA_TERMINAL_HANDLE 按终端标题找岗位（标题必须是已登记岗位）；都不成立 → null（人）。 */
export async function resolveActor(deps: CommandDeps, as?: string): Promise<Actor | null> {
  if (as) return { address: as, explicit: true }
  const handle = deps.env.ORCA_TERMINAL_HANDLE
  if (!handle) return null
  const terminal = (await deps.orca.terminalList()).find((t) => t.handle === handle)
  if (!terminal?.title || !deps.registry.getPost(terminal.title)) return null
  return { address: terminal.title, explicit: false, handle }
}

export async function requireActor(deps: CommandDeps, as?: string): Promise<Actor> {
  const actor = await resolveActor(deps, as)
  if (actor) return actor
  throw new WinglineError('input', 'actor_required', '无法确定你是哪个岗位', {
    hint: '在岗位终端里运行，或加 --as <岗位地址>；Windows 上未验证 Orca 是否设置 ORCA_TERMINAL_HANDLE',
  })
}

/** 显式 → locatePost（绝不用调用者自己的终端）；隐式 → 已知的 handle。 */
export async function resolveHandle(deps: CommandDeps, actor: Actor): Promise<string> {
  if (!actor.explicit && actor.handle) return actor.handle
  const located = await locatePost(deps.orca, actor.address)
  if (!located) {
    throw new WinglineError('input', 'post_offline', `岗位 ${actor.address} 没有在线终端`, { hint: '先执行 wl up 拉起团队' })
  }
  return located.handle
}

export const isOwnTerminal = (deps: CommandDeps, handle: string): boolean => deps.env.ORCA_TERMINAL_HANDLE === handle

/** task_log 用：null → human。 */
export function actorOf(actor: Actor | null): { actor: string; actorSource: ActorSource } {
  if (!actor) return { actor: 'human', actorSource: 'human' }
  return { actor: actor.address, actorSource: actor.explicit ? 'explicit' : 'implicit' }
}
