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
  /** 经 Windows .cmd 包装时为 false：换行无法安全传递。 */
  multilineSafe: boolean
  home: string
  env: NodeJS.ProcessEnv
  now: () => Date
  /** 单调时钟（毫秒）；机器睡眠不推进它，用来区分"真的静默"与"睡过头"。 */
  monotonic: () => number
}

export type Step = 'create' | 'wait' | 'brief' | 'send' | 'close'

export const postAddress = (post: string, team: string) => `${post}@${team}`

/**
 * 本地请求账本的键 `<team>:<post>:<step>:<hash8>`（`terminal` 命令族的 --retry-request 只认 Orca 分配的 UUID；编排命令族见 commands/task/ledger.ts）。
 * 同一岗位前一轮生命周期已完成（终端被关后重建）时，用 gen 后缀开新的一行。
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

/** 同一动作再次发起（上一次已完成）要开新的账本行；未完成的沿用原行。 */
export function nextRequestId(registry: Registry, team: string, post: string, step: Step, hash: string): string {
  let gen = 0
  while (registry.getRequest(requestId(team, post, step, hash, gen))?.state === 'done') gen++
  return requestId(team, post, step, hash, gen)
}
