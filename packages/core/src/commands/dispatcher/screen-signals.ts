import { createHash } from 'node:crypto'
import type { PatrolStateRow, PostRow, Registry, TeamRow } from '../../registry/registry.js'
import { detectScreen, type ScreenSignal } from '../../screen/patterns.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { notifyHuman, typeTo, type OutletIo } from './outlets.js'
import type { ScanSnapshot } from './signals.js'

/** context_low 清除后再次出现，距上次通知不足这么久只恢复行、不再通知（百分比在阈值附近抖动，或压缩后又逼近上限）。 */
export const CONTEXT_RENOTIFY_MS = 3_600_000
/** 画面上有“继续自动进行”的提示时，到点不发“继续”，改为延期这么久再看。 */
export const AUTO_RESUME_GRACE_MS = 600_000
const GRACE_AFTER_RESET_MS = 120_000
const UNKNOWN_RESET_MS = 3_600_000
const MAX_EXTENSIONS = 3
const MAX_RESUME_TRIES = 3

type Ctx = { team: TeamRow; spec: TeamSpec }
interface Env {
  deps: CommandDeps
  ctx: Ctx
  snap: ScanSnapshot
  io: OutletIo
  /** 重启后第一轮：只建观察行（level 0），不通知、不暂停、不处理到点。 */
  observeOnly: boolean
  now: Date
}
type ContextSig = Extract<ScreenSignal, { kind: 'context_low' }>
type UsageSig = Extract<ScreenSignal, { kind: 'usage_limit' }>

const ms = (iso?: unknown): number => (typeof iso === 'string' ? Date.parse(iso) : 0)
const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const detailOf = (r: PatrolStateRow | null | undefined): Record<string, unknown> => r?.detail ?? {}

/** 用量上限的暂停期内：no_progress / owner_idle / overdue 只观察、不升级（advance.ts 的 step 调用）。首轮的观察行（level 0）不暂停。 */
export function isUsagePaused(registry: Registry, team: string, post: string, now: Date): boolean {
  const r = registry.getPatrolState(team, post, 'usage_limit', '')
  return !!r && !r.clearedAt && r.level >= 1 && r.nextDueAt !== null && ms(r.nextDueAt) > now.getTime()
}

/** 会话键：会话标记的哈希，不是原文（AttentionReport.signals 会带出整行，原文标记违反 3A §4.3）。 */
const sessionKey = (p: PostRow): string => `sk-${createHash('sha256').update(`${p.sessionMarker ?? ''}:${p.sessionId ?? ''}`).digest('hex').slice(0, 12)}`

function put(e: Env, row: PatrolStateRow): void {
  e.deps.registry.putPatrolState(row)
}

function event(e: Env, post: string, signal: string, taskId: string, action: string, outcome?: string): void {
  e.deps.registry.appendPatrolEvent({ team: e.ctx.team.name, post, signal, taskId, action, outcome })
}

function fresh(e: Env, p: PostRow, signal: 'context_low' | 'usage_limit', taskId: string, level: number, detail: Record<string, unknown>): PatrolStateRow {
  const at = e.now.toISOString()
  return {
    team: e.ctx.team.name, post: p.address, signal, taskId, level, since: at, levelAt: at,
    lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, detail,
  }
}

function clear(e: Env, row: PatrolStateRow): void {
  put(e, { ...row, clearedAt: e.now.toISOString() })
  event(e, row.post, row.signal, row.taskId, 'cleared')
}

async function tellContext(e: Env, p: PostRow, key: string, sig: ContextSig): Promise<void> {
  const left = sig.percent === null ? '不多' : `${sig.percent}%`
  await notifyHuman(e.deps, e.ctx, {
    post: p.address, signal: 'context_low', taskId: key, level: 1, message: `[雁阵] ${p.address} 上下文剩余 ${left}，可能即将自动压缩或需要换会话`,
  }, e.io)
}

/** context_low：提示持续显示期间同一会话只通知一次；会话换了旧行清除；清除后再次出现复用同一行，1 小时内不重复通知。 */
async function handleContext(e: Env, p: PostRow, sig: ContextSig | undefined): Promise<void> {
  const key = sessionKey(p)
  const rows = e.deps.registry.listPatrolState(e.ctx.team.name).filter((r) => r.post === p.address && r.signal === 'context_low')
  for (const r of rows) if (r.taskId !== key && !r.clearedAt) clear(e, r)
  const mine = rows.find((r) => r.taskId === key) ?? null
  if (!sig) {
    if (mine && !mine.clearedAt) clear(e, mine)
    return
  }
  const detail = { ...detailOf(mine), percent: sig.percent, noticeHash: sig.noticeHash }
  if (!mine) {
    if (e.observeOnly) return void put(e, fresh(e, p, 'context_low', key, 0, detail)) // 首轮只观察
    put(e, fresh(e, p, 'context_low', key, 1, { ...detail, notifiedAt: e.now.toISOString() }))
    return tellContext(e, p, key, sig)
  }
  const sinceNotice = e.now.getTime() - ms(detailOf(mine).notifiedAt)
  const owesNotice = mine.level === 0 || (!!mine.clearedAt && sinceNotice >= CONTEXT_RENOTIFY_MS)
  if (!owesNotice || e.observeOnly) return void put(e, { ...mine, clearedAt: null, detail }) // 只更新百分比 / 恢复行
  put(e, { ...mine, level: 1, clearedAt: null, detail: { ...detail, notifiedAt: e.now.toISOString() } })
  await tellContext(e, p, key, sig)
}

const dueAt = (e: Env, resetsAt: unknown): string =>
  new Date(typeof resetsAt === 'string' ? ms(resetsAt) + GRACE_AFTER_RESET_MS : e.now.getTime() + UNKNOWN_RESET_MS).toISOString()

async function tellUsage(e: Env, p: PostRow, resetsAt: unknown): Promise<void> {
  const when = typeof resetsAt === 'string' ? `预计 ${hhmm(new Date(resetsAt))} 重置` : '重置时间未知，先按 1 小时后复查'
  await notifyHuman(e.deps, e.ctx, {
    post: p.address, signal: 'usage_limit', taskId: '', level: 1, message: `[雁阵] ${p.address} 用量已用完，${when}；期间不会提醒它`,
  }, e.io)
}

/** 识别到一条新的用量上限提示：首轮只建 level 0 的观察行，之后直接 level 1 并通知。 */
async function identify(e: Env, p: PostRow, sig: UsageSig): Promise<void> {
  const detail = { resetsAt: sig.resetsAt?.toISOString() ?? null, noticeHash: sig.noticeHash, autoResume: sig.autoResume, extensions: 0, resumeTries: 0 }
  if (e.observeOnly) return void put(e, fresh(e, p, 'usage_limit', '', 0, detail))
  put(e, { ...fresh(e, p, 'usage_limit', '', 1, detail), nextDueAt: dueAt(e, detail.resetsAt) })
  event(e, p.address, 'usage_limit', '', 'identified')
  await tellUsage(e, p, detail.resetsAt)
}

async function promote(e: Env, p: PostRow, row: PatrolStateRow): Promise<void> {
  const d = detailOf(row)
  put(e, { ...row, level: 1, levelAt: e.now.toISOString(), nextDueAt: dueAt(e, d.resetsAt) })
  event(e, p.address, 'usage_limit', '', 'identified')
  await tellUsage(e, p, d.resetsAt)
}

/** 到点：画面上还有“自动继续”（或重置时间未知而提示还在）→ 延期；否则发“继续”；发不出去最多 3 轮，之后放弃并通知人。 */
async function atDue(e: Env, p: PostRow, row: PatrolStateRow, sig: UsageSig | undefined): Promise<void> {
  const d = detailOf(row)
  const extensions = Number(d.extensions ?? 0)
  const armed = sig?.autoResume === 'armed'
  const unknownStillThere = d.resetsAt === null && sig !== undefined && sig.noticeHash === d.noticeHash
  if ((armed || unknownStillThere) && extensions < MAX_EXTENSIONS) {
    const by = armed ? AUTO_RESUME_GRACE_MS : UNKNOWN_RESET_MS
    put(e, { ...row, nextDueAt: new Date(e.now.getTime() + by).toISOString(), detail: { ...d, extensions: extensions + 1 } })
    return event(e, p.address, 'usage_limit', '', 'resume_deferred', armed ? 'auto_resume' : 'reset_unknown')
  }
  const task = e.snap.tasks.find((t) => t.status === 'dispatched' && t.claimedBy === p.address)
  const text = task ? `[雁阵] 用量已重置，请继续手上的任务 ${task.id}` : '[雁阵] 用量已重置，请继续'
  const outcome = await typeTo(e.deps, e.ctx.team.name, p.address, text, { action: 'resume_hint', signal: 'usage_limit', taskId: '' })
  if (outcome === 'ok' || outcome === 'unconfirmed') return void put(e, { ...row, clearedAt: e.now.toISOString(), detail: { ...d, resumedAt: e.now.toISOString() } })
  const tries = Number(d.resumeTries ?? 0) + 1
  if (tries < MAX_RESUME_TRIES) return void put(e, { ...row, detail: { ...d, resumeTries: tries } })
  put(e, { ...row, clearedAt: e.now.toISOString(), detail: { ...d, resumeTries: tries } })
  event(e, p.address, 'usage_limit', '', 'resume_skipped')
  await notifyHuman(e.deps, e.ctx, {
    post: p.address, signal: 'usage_limit', taskId: '', level: 1,
    message: `[雁阵] ${p.address} 用量应已重置，但画面停在选项 / 确认框上，没有自动继续，请手动处理`,
  }, e.io)
}

/** usage_limit：识别 → 暂停（isUsagePaused）→ 到点处理；清除后同 noticeHash 的提示仍留屏不再触发，不同的算新识别。 */
async function handleUsage(e: Env, p: PostRow, sig: UsageSig | undefined): Promise<void> {
  const row = e.deps.registry.getPatrolState(e.ctx.team.name, p.address, 'usage_limit', '')
  if (!row || (row.clearedAt && sig && sig.noticeHash !== detailOf(row).noticeHash)) return sig ? identify(e, p, sig) : undefined
  if (row.clearedAt || e.observeOnly) return
  if (row.level === 0) return sig ? promote(e, p, row) : clear(e, row)
  if (ms(row.nextDueAt) <= e.now.getTime()) await atDue(e, p, row, sig)
}

/**
 * 每轮巡查先于 detectSignals / advancePatrol 调用：对每个有画面的存活岗位识别 context_low 与 usage_limit 并推进它们的状态行。
 * 永不抛出；某个岗位出错只记事件，不影响其它岗位。读不到画面的岗位本轮不动（行保持原样）。
 */
export async function advanceScreenSignals(deps: CommandDeps, ctx: Ctx, snap: ScanSnapshot, o: { observeOnly: boolean; io?: OutletIo }): Promise<void> {
  const e: Env = { deps, ctx, snap, io: o.io ?? {}, observeOnly: o.observeOnly, now: deps.now() }
  for (const p of deps.registry.listPosts(ctx.team.name)) {
    const text = p.handle ? snap.previews?.get(p.handle) : undefined
    if (text === undefined) continue
    try {
      const { signals } = detectScreen(p.agent, text, e.now)
      await handleContext(e, p, signals.find((s): s is ContextSig => s.kind === 'context_low'))
      await handleUsage(e, p, signals.find((s): s is UsageSig => s.kind === 'usage_limit'))
    } catch (err) {
      event(e, p.address, 'screen_signals', '', 'screen_signals_failed', err instanceof Error ? err.message.slice(0, 120) : 'error')
    }
  }
}
