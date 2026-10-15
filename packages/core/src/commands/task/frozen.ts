import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'

export const isPostFrozen = (deps: CommandDeps, address: string): boolean => deps.registry.getFrozen(address) !== null

export const frozenError = (address: string): WinglineError =>
  new WinglineError('input', 'post_frozen', `岗位 ${address} 已冻结`, { hint: `${address} 已冻结：解除用 wl dispatcher unfreeze ${address}` })
