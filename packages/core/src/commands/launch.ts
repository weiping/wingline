import crypto from 'node:crypto'
import { WinglineError } from '../errors.js'
import type { Registry } from '../registry/registry.js'
import type { PostSpec, TeamSpec } from '../spec/load.js'
import { postAddress, requestId, type CommandDeps, type Step } from './deps.js'
import { screenGuard } from './task/notify.js'

export interface Launch {
  deps: CommandDeps
  spec: TeamSpec
  hash: string
}

const WAIT_TIMEOUT_MS = 60_000
const WAIT_SUBMIT_SEC = 10

/** 先记 pending，再调用，最后按结果记 done / uncertain / failed。ok 为 false 表示 Orca 回执未确认成功。 */
export async function recorded<T>(reg: Registry, id: string, fn: () => Promise<T>, ok: (v: T) => boolean = () => true) {
  reg.beginRequest(id)
  let value: T
  try {
    value = await fn()
  } catch (err) {
    reg.finishRequest(id, err instanceof WinglineError && err.kind === 'uncertain' ? 'uncertain' : 'failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
  const confirmed = ok(value)
  reg.finishRequest(id, confirmed ? 'done' : 'uncertain', value)
  return { confirmed, value }
}

export const stepDone = (reg: Registry, id: string) => reg.getRequest(id)?.state === 'done'

/** 终端被关后重新拉起要换新 id，否则 Orca 会按旧 id 回放旧回执。 */
export function lifetimeGen(l: Launch, post: string, located: boolean): number {
  const done = (step: Step, g: number) => stepDone(l.deps.registry, requestId(l.spec.name, post, step, l.hash, g))
  let g = 0
  while (done('create', g) && done('brief', g)) g++
  if (!located && done('create', g)) g++
  return g
}

/** 会话标记 `WLS-` + 8 位小写十六进制；restore 靠它引号精确搜索找回岗位会话（spec §4）。 */
export function newSessionMarker(rand: () => string = () => crypto.randomBytes(4).toString('hex')): string {
  return `WLS-${rand()}`
}

const MARKER_NOTE = '（雁阵用它在重启后找回本会话，无需理会）'

/** 启动包第一行之后插入标记行。标记行长度恒定，锁外的占位检查与真实标记等长。 */
export function withMarker(briefing: string, marker: string): string {
  const [first, ...rest] = briefing.split('\n')
  return [first, `会话标记：${marker}${MARKER_NOTE}`, ...rest].join('\n')
}

/** 同一代 create 已落账且注册表已有标记时沿用（中断重跑后送达的启动包与注册表一致），否则换新标记并清掉旧会话。 */
export function ensureMarker(l: Launch, post: PostSpec, gen: number): string {
  const address = postAddress(post.id, l.spec.name)
  const createDone = stepDone(l.deps.registry, requestId(l.spec.name, post.id, 'create', l.hash, gen))
  const existing = l.deps.registry.getPost(address)?.sessionMarker
  if (createDone && existing) return existing
  const marker = newSessionMarker()
  l.deps.registry.setSessionMarker(address, marker, l.deps.now().toISOString())
  return marker
}

export type StartResult = 'sent' | 'unconfirmed' | 'at_prompt' | 'shell'

/** 终端命令、发送文本、请求键由调用方给出（wl up 与 wl restore 共用这段拉起流程）。 */
export async function startPost(
  l: Launch,
  post: PostSpec,
  o: { text: string; command: string; existingHandle: string | null; keyOf: (step: Step) => string },
): Promise<StartResult> {
  const { orca, registry } = l.deps
  const address = postAddress(post.id, l.spec.name)
  const rid = o.keyOf
  let handle = o.existingHandle
  if (!handle) {
    const id = rid('create')
    const created = await recorded(registry, id, () =>
      orca.terminalCreate({ worktree: post.worktree, title: address, command: o.command }),
    )
    handle = created.value.handle
    registry.setPostHandle(address, handle)
  }
  if (!stepDone(registry, rid('wait'))) {
    const waited = await recorded(registry, rid('wait'), () => orca.terminalWait({ handle, forState: 'tui-idle', timeoutMs: WAIT_TIMEOUT_MS }), (v) => v.satisfied)
    if (!waited.confirmed) return 'unconfirmed'
  }
  const screen = await screenGuard(l.deps, handle)
  if (screen === 'at_prompt' || screen === 'shell') return screen
  const sent = await recorded(registry, rid('brief'), () =>
    orca.terminalSend({ handle: handle!, text: o.text, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC }),
    (v) => v.accepted,
  )
  return sent.confirmed ? 'sent' : 'unconfirmed'
}
