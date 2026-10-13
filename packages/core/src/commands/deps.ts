import { WinglineError } from '../errors.js'
import type { OrcaClient } from '../orca/types.js'
import type { Registry } from '../registry/registry.js'
import { inRange } from './version-range.js'

export interface CommandDeps {
  orca: OrcaClient
  registry: Registry
  warn: (msg: string) => void
  /** 已验证的 Orca 版本范围，形如 ">=1.4.214 <1.5.0"。 */
  verifiedOrca: string
  /** 探针 run-lifetime 的结论：false 时不创建 Run。 */
  createRun: boolean
  /** 经 Windows .cmd 包装时为 false：换行无法安全传递。 */
  multilineSafe: boolean
  home: string
}

export type Step = 'run' | 'create' | 'wait' | 'brief' | 'send' | 'close'

export const postAddress = (post: string, team: string) => `${post}@${team}`

/**
 * `<team>:<post>:<step>:<hash8>`。同一岗位前一轮生命周期已完成（终端被关后重建）时，
 * 用 gen 后缀换新 id，避免 Orca 按旧 id 回放旧回执。
 */
export function requestId(team: string, post: string, step: Step, hash: string, gen = 0): string {
  return `${team}:${post}:${step}:${hash.slice(0, 8)}${gen > 0 ? `-${gen}` : ''}`
}

export async function preflight(deps: CommandDeps): Promise<{ version: string }> {
  const version = await deps.orca.version()
  if (!inRange(version, deps.verifiedOrca)) {
    deps.warn(`Orca ${version} 不在已验证范围 ${deps.verifiedOrca} 内，继续执行但行为可能不一致`)
  }
  const { reachable } = await deps.orca.status()
  if (!reachable) {
    throw new WinglineError('orca', 'runtime_unavailable', 'Orca 未运行或不可达', { hint: '运行 orca open 启动 Orca' })
  }
  return { version }
}
