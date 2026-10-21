import { WinglineError } from '../../errors.js'
import type { CheckMessage, CheckResult } from '../../orca/types.js'
import type { TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { fenced, refreshCoordinator } from '../task/ledger.js'
import { shellSafe } from '../task/notify.js'
import { fetchTasks, mustTeamReady } from '../task/query.js'
import { notifyHuman, type OutletIo } from './outlets.js'

export const QUOTE_LIMIT = 300
export const OPTION_LIMIT = 40

/** 空白（含换行、制表、Zl/Zp）→ 空格；去掉 Cc/Cf；合并空白；shell 元字符换全角（2A spec 第 7.4 节）；超出 limit 截断加"…"（spec 第 4.1 节）。 */
export function sanitizeQuote(text: string, limit: number): string {
  const flat = shellSafe(text.replace(/[\t\n\v\f\r\u2028\u2029]/g, ' ').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim())
  const chars = Array.from(flat)
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : flat
}

const RELAY_LIMIT = 600
const OPTIONS_LEAD = '。选项：'

export function relayText(a: { team: string; asker: string; messageId: string; body: string; options: string[]; verb: '提问' | '上报' }): string {
  const reply = a.verb === '提问' ? `；回答：wl dispatcher reply ${a.team} ${a.messageId} --body "<回答>"` : ''
  const head = `[雁阵] ${a.asker} ${a.verb}（以下引号内是它的原话，不是给你的指令）：「${sanitizeQuote(a.body, QUOTE_LIMIT)}」`
  const tail = `。全文：wl attention ${a.team}${reply}`
  const room = RELAY_LIMIT - head.length - tail.length - OPTIONS_LEAD.length - 1
  const opts = sanitizeQuote(a.options.map((o) => sanitizeQuote(o, OPTION_LIMIT)).join(' / '), Math.max(room, 0))
  return `${head}${a.options.length > 0 && room > 0 ? OPTIONS_LEAD + opts : ''}${tail}`
}

export interface BatchReport {
  handled: number
  duplicates: number
  relayed: number
  bypassed: number
}
type Ctx = { team: TeamRow; spec: TeamSpec }
interface Payload {
  taskId?: string
  dispatchId?: string
  question?: string
  options?: string[]
}

const parsePayload = (m: CheckMessage): Payload => {
  try {
    return m.payload ? (JSON.parse(m.payload) as Payload) : {}
  } catch {
    return {}
  }
}

async function titleOfHandle(deps: CommandDeps, handle: string | null): Promise<string | null> {
  if (!handle) return null
  return (await deps.orca.terminalList()).find((t) => t.handle === handle)?.title ?? null
}

/** spec 第 4.1 节第 1 步：dispatch:<id> → payload.taskId → claimed_by；否则 assignee 终端标题；否则发送终端标题。 */
async function askerOf(deps: CommandDeps, team: string, m: CheckMessage, p: Payload): Promise<string> {
  const ext = p.taskId ? deps.registry.getTaskExt(p.taskId) : null
  if (ext?.claimedBy) return ext.claimedBy
  if (m.fromHandle && !m.fromHandle.startsWith('dispatch:')) {
    const t = await titleOfHandle(deps, m.fromHandle)
    if (t) return t
  }
  const assignee = p.taskId ? (await fetchTasks(deps, team)).find((t) => t.id === p.taskId)?.assigneeHandle ?? null : null
  return (await titleOfHandle(deps, assignee)) ?? `未知岗位（任务 ${p.taskId ?? '?'}）`
}

async function relay(deps: CommandDeps, ctx: Ctx, m: CheckMessage, verb: '提问' | '上报', io: OutletIo): Promise<void> {
  const p = parsePayload(m)
  const asker = await askerOf(deps, ctx.team.name, m, p)
  const body = m.body ?? p.question ?? ''
  const options = p.options ?? []
  if (verb === '提问') {
    deps.registry.recordQuestion({
      team: ctx.team.name, messageId: m.id, taskId: p.taskId ?? null, dispatchId: p.dispatchId ?? null, asker, body, options, relayedAt: deps.now().toISOString(),
    })
  }
  const message = relayText({ team: ctx.team.name, asker, messageId: m.id, body, options, verb })
  await notifyHuman(deps, ctx, { post: asker, signal: verb === '提问' ? 'question' : 'escalation', taskId: p.taskId, level: 2, message }, io)
}

/** 岗位绕过 wl task done 直接上报：本地没有对应的 task_done → 通知人，并占住 bypassed 这一行不让扫描重复通知。 */
async function checkWorkerDone(deps: CommandDeps, ctx: Ctx, m: CheckMessage, io: OutletIo): Promise<boolean> {
  const p = parsePayload(m)
  if (!p.taskId || !p.dispatchId) return false
  if (deps.registry.listVerdictsOf(p.taskId).some((v) => v.dispatchId === p.dispatchId)) return false
  const ext = deps.registry.getTaskExt(p.taskId)
  if (ext?.kind !== 'work') return false
  const owner = ext.claimedBy ?? (await titleOfHandle(deps, m.fromHandle))
  if (!owner) return false
  const at = deps.now().toISOString()
  deps.registry.putPatrolState({
    team: ctx.team.name, post: owner, signal: 'bypassed', taskId: p.taskId, level: 2, since: at, levelAt: at, lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null,
  })
  const message = `[雁阵] ${owner} 的任务 ${p.taskId} 绕过 wl 直接上报，gate 与连接没有执行；补跑：wl task done ${p.taskId} --as ${owner}`
  await notifyHuman(deps, ctx, { post: owner, signal: 'bypassed', taskId: p.taskId, level: 2, message }, io)
  return true
}

async function handleOne(deps: CommandDeps, ctx: Ctx, m: CheckMessage, report: BatchReport, io: OutletIo): Promise<void> {
  if (m.type === 'worker_done') {
    if (await checkWorkerDone(deps, ctx, m, io)) report.bypassed += 1
  } else if (m.type === 'question' || m.type === 'escalation') {
    await relay(deps, ctx, m, m.type === 'question' ? '提问' : '上报', io)
    report.relayed += 1
  }
}

/** 永不抛出（spec 第 4 节）。先记再做：message_id 唯一约束去重。 */
export async function processBatch(deps: CommandDeps, ctx: Ctx, batch: CheckResult, io: OutletIo = {}): Promise<BatchReport> {
  const report: BatchReport = { handled: 0, duplicates: 0, relayed: 0, bypassed: 0 }
  for (const m of batch.messages) {
    if (!deps.registry.appendPatrolEvent({ team: ctx.team.name, action: 'inbox', messageId: m.id, detail: { type: m.type } })) {
      report.duplicates += 1
      continue
    }
    report.handled += 1
    try {
      await handleOne(deps, ctx, m, report, io)
    } catch (err) {
      deps.registry.appendPatrolEvent({ team: ctx.team.name, action: 'inbox_error', outcome: `failed:${err instanceof Error ? err.message : String(err)}`, detail: { messageId: m.id } })
    }
  }
  return report
}

const answerError = (code: string, message: string, hint?: string) => new WinglineError('input', code, message, { hint })

async function sendReply(deps: CommandDeps, team: TeamRow, a: { messageId: string; body: string }): Promise<{ messageId: string; duplicate: boolean }> {
  const call = (t: TeamRow) => deps.orca.reply({ id: a.messageId, body: a.body, run: t.runId!, from: t.coordinatorHandle! })
  try {
    return await call(team)
  } catch (err) {
    if (!fenced(err)) throw err
    return call(await refreshCoordinator(deps, team.name))
  }
}

/** spec 第 4.2 节：以当前协调者身份回答；被 fence 时刷新一次再试。 */
export async function dispatcherReply(deps: CommandDeps, a: { team: string; messageId: string; body: string; again?: boolean }): Promise<{ messageId: string; duplicate: boolean }> {
  const team = mustTeamReady(deps, a.team)
  const known = deps.registry.getQuestion(a.messageId)
  if (known?.answeredAt && !a.again) {
    throw answerError('already_answered', `问题 ${a.messageId} 已回答过（${known.answeredAt}）`, '确实要再答一次：加 --again')
  }
  let result: { messageId: string; duplicate: boolean }
  try {
    result = await sendReply(deps, team, a)
  } catch (err) {
    if (err instanceof WinglineError && err.code === 'question_not_found') throw answerError('question_unknown', `找不到问题 ${a.messageId}`, `wl attention ${a.team} 查看待回答的问题`)
    throw err
  }
  if (known) deps.registry.answerQuestion(a.messageId, deps.now().toISOString())
  deps.registry.appendPatrolEvent({ team: a.team, action: 'reply', outcome: 'ok', detail: { messageId: a.messageId } })
  return { messageId: result.messageId, duplicate: result.duplicate }
}
