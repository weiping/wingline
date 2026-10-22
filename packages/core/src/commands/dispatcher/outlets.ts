import { spawn as nodeSpawn } from 'node:child_process'
import type { TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { notifyPost, type NotifyResult } from '../task/notify.js'

export type TypeOutcome = 'ok' | 'unconfirmed' | 'skip_hushed' | 'skip_offline' | 'skip_prompt' | 'skip_unknown' | 'failed'
export interface EventMeta {
  signal?: string | null
  taskId?: string | null
  action: string
  subject?: string
}

const REASON_OUTCOME: Record<NonNullable<NotifyResult['reason']>, TypeOutcome> = {
  at_prompt: 'skip_prompt',
  screen_unknown: 'skip_unknown',
  post_offline: 'skip_offline',
  send_failed: 'failed',
}

function outcomeOf(r: NotifyResult): TypeOutcome {
  if (r.outcome === 'notified') return 'ok'
  if (r.outcome === 'notified_unconfirmed') return 'unconfirmed'
  return REASON_OUTCOME[r.reason!]
}

/** spec 第 6.2 节"往终端打字的规则"：静默 → 离线/画面（notifyPost）→ 发送；每次都记一条 patrol_events。永不抛出。 */
export async function typeTo(deps: CommandDeps, team: string, address: string, text: string, meta: EventMeta): Promise<TypeOutcome> {
  const until = deps.registry.hushedUntil(address)
  const outcome: TypeOutcome = until && Date.parse(until) > deps.now().getTime() ? 'skip_hushed' : outcomeOf(await notifyPost(deps, address, text))
  deps.registry.appendPatrolEvent({
    team, post: meta.subject ?? address, signal: meta.signal, taskId: meta.taskId, action: meta.action, outcome, detail: { to: address },
  })
  return outcome
}

export interface HumanNotice {
  post: string
  signal: string
  taskId?: string | null
  level: number
  message: string
  /** 建议的处理命令；wl attention 从最近一条 notify 事件里读它。 */
  command?: string
}
export interface OutletIo {
  fetch?: typeof fetch
  spawn?: typeof nodeSpawn
  timeoutMs?: number
}
export interface NotifyHumanResult {
  lead: TypeOutcome | 'skipped_self'
  external: 'ok' | 'failed' | 'none'
}
type Ctx = { team: TeamRow; spec: TeamSpec }

const TIMEOUT_MS = 10_000

async function postWebhook(url: string, n: HumanNotice, team: string, at: string, io: OutletIo): Promise<boolean> {
  try {
    const res = await (io.fetch ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team, post: n.post, signal: n.signal, taskId: n.taskId ?? null, level: n.level, message: n.message, at, attentionCommand: `wl attention ${team}` }),
      signal: AbortSignal.timeout(io.timeoutMs ?? TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

function runCommand(cmd: string[], message: string, io: OutletIo): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof nodeSpawn>
    try {
      child = (io.spawn ?? nodeSpawn)(cmd[0]!, [...cmd.slice(1), message], { shell: false, stdio: 'ignore' })
    } catch {
      return resolve(false)
    }
    const timer = setTimeout(() => { child.kill(); resolve(false) }, io.timeoutMs ?? TIMEOUT_MS)
    child.on('error', () => { clearTimeout(timer); resolve(false) })
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

async function notifyExternal(deps: CommandDeps, ctx: Ctx, n: HumanNotice, io: OutletIo): Promise<'ok' | 'failed' | 'none'> {
  const cfg = ctx.spec.patrol.notify
  if (!cfg) return 'none'
  const ok = 'webhook' in cfg ? await postWebhook(cfg.webhook, n, ctx.team.name, deps.now().toISOString(), io) : await runCommand(cfg.command, n.message, io)
  return ok ? 'ok' : 'failed'
}

/** spec 第 6.2 节"通知人"的三条路径；第三条（wl attention）就是这里记下的事件与 patrol_state 行。永不抛出。 */
export async function notifyHuman(deps: CommandDeps, ctx: Ctx, n: HumanNotice, io: OutletIo = {}): Promise<NotifyHumanResult> {
  const team = ctx.team.name
  const lead = `${ctx.spec.lead}@${team}`
  const toLead =
    n.post === lead ? 'skipped_self' : await typeTo(deps, team, lead, n.message, { action: 'notify_lead', subject: n.post, signal: n.signal, taskId: n.taskId })
  const external = await notifyExternal(deps, ctx, n, io)
  deps.registry.appendPatrolEvent({
    team, post: n.post, signal: n.signal, taskId: n.taskId, action: 'notify', outcome: `lead:${toLead};external:${external}`, detail: { level: n.level, message: n.message, command: n.command },
  })
  return { lead: toLead, external }
}
