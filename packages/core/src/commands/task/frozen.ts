import type { CommandDeps } from '../deps.js'

/** 阶段 2A 里恒为 false；阶段 2B 计划 Task 3 改为读 frozen_posts（调用点不用再改）。 */
export function isPostFrozen(_deps: CommandDeps, _address: string): boolean {
  return false
}
