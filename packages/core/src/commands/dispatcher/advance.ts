import { WinglineError } from '../../errors.js'
import type { PatrolSignal, PatrolStateRow, TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { doneTask } from '../task/done.js'
import { recoverTask } from '../task/escalate.js'
import { sanitizeQuote } from './inbox.js'
import { notifyHuman, typeTo, worktreeComment, type OutletIo } from './outlets.js'
import { LADDERS, type SignalHit } from './signals.js'

export const PATROL_INTERVAL_MS = 300_000
export const REVIVE_WINDOW_MS = 3_600_000
export const MAX_BACKOFF_MS = 14_400_000
export const MAX_RERUNS = 3

export interface PatrolOps {
  doneTask: typeof doneTask
  recoverTask: typeof recoverTask
}
interface Env {
  deps: CommandDeps
  ctx: { team: TeamRow; spec: TeamSpec }
  now: Date
  ops: PatrolOps
  io: OutletIo
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0)
const keyOf = (post: string, signal: string, taskId: string) => `${post}\u0000${signal}\u0000${taskId}`
const baseId = (taskId: string) => taskId.replace(/#\d+$/, '')

const ladderFor = (signal: PatrolSignal, spec: TeamSpec): readonly number[] =>
  signal === 'dead_assignee' && spec.patrol.autoRecover ? [0, 1, 2] : LADDERS[signal].levels

function nudgeText(h: SignalHit): string {
  const id = baseId(h.taskId)
  if (h.signal === 'owner_idle') return `[雁阵] 你有待开始的任务 ${id}（已等待 ${h.minutes ?? '?'} 分钟）：wl task start ${id}；不打算做就 wl task release ${id}`
  return `[雁阵] 巡查提示：任务 ${id} 已经 ${h.minutes ?? '?'} 分钟没有输出。还在做就忽略这条；做完了运行 wl task done ${id}；卡住了运行 wl task escalate ${id} --reason "<原因>"（会收回这次派发，交给人决定）`
}

function noticeBody(h: SignalHit, team: string): string {
  const id = baseId(h.taskId)
  const n = h.minutes ?? '?'
  switch (h.signal) {
    case 'no_progress': return `${h.post} 的任务 ${id} 已 ${n} 分钟没有输出，已提示但未恢复`
    case 'waiting_approval': return `${h.post} 停在确认或选择提示上（任务 ${id}），需要人去处理`
    case 'waiting_answer':
      return h.messageId
        ? `${h.post} 在等回答：「${sanitizeQuote(h.question ?? '', 100)}」；wl dispatcher reply ${team} ${h.messageId} --body "<回答>"`
        : `${h.post} 在等回答（任务 ${id}）`
    case 'dead_assignee': return `${h.post} 的任务 ${id} 派给了已不存在的终端：${h.command}`
    case 'owner_idle': return `${h.post} 有 ${n} 分钟没开始的任务 ${id}：${h.command}`
    case 'overdue': return `${h.post} 的任务 ${id} 已超过预期时长（${n} 分钟）`
    case 'done_unfinished': return `${h.post} 的任务 ${id} 已上报但没收尾，自动重跑 ${MAX_RERUNS} 次未成功：${h.command}`
    case 'bypassed': return `${h.post} 的任务 ${id} 绕过 wl 直接上报：${h.command}`
    case 'call_uncertain': return `任务 ${id} 有一次结果不确定的调用：${h.command}`
    case 'gate_streak': return `${h.post} 最近连续 ${h.count ?? '?'} 个任务以 gate 失败收场`
  }
}

const noticeText = (h: SignalHit, team: string) => `[雁阵] ${noticeBody(h, team)}。详情：wl attention ${team}`
const freezeText = (h: SignalHit) => `[雁阵] ${h.post} 已冻结（${h.signal}），不会再分配新任务。解除：wl dispatcher unfreeze ${h.post}`

function put(e: Env, row: PatrolStateRow): PatrolStateRow {
  e.deps.registry.putPatrolState(row)
  return row
}

function event(e: Env, h: { post: string; signal: string; taskId: string }, action: string, outcome?: string): void {
  e.deps.registry.appendPatrolEvent({ team: e.ctx.team.name, post: h.post, signal: h.signal, taskId: h.taskId, action, outcome })
}

function freshRow(e: Env, h: SignalHit): PatrolStateRow {
  const at = e.now.toISOString()
  return {
    team: e.ctx.team.name, post: h.post, signal: h.signal, taskId: h.taskId, level: 0, since: at, levelAt: at,
    lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null,
  }
}

async function clearRow(e: Env, row: PatrolStateRow): Promise<void> {
  const at = e.now.toISOString()
  put(e, { ...row, clearedAt: at, lastNudgedAt: null })
  event(e, row, 'cleared')
  if (row.level >= 2) await worktreeComment(e.deps, e.ctx, row.post, `雁阵：${row.post} 已恢复（${at}）`)
}

async function announce(e: Env, h: SignalHit, level: number, message: string): Promise<void> {
  await notifyHuman(e.deps, e.ctx, { post: h.post, signal: h.signal, taskId: h.taskId, level, message }, e.io)
  await worktreeComment(e.deps, e.ctx, h.post, `雁阵：${h.post} ${h.signal}（${e.now.toISOString()}）`)
}

/** 第 1 级提示；岗位其实停在提示上时，把 no_progress 改判为 waiting_approval。 */
async function nudge(e: Env, h: SignalHit, row: PatrolStateRow): Promise<void> {
  const outcome = await typeTo(e.deps, e.ctx.team.name, h.post, nudgeText(h), { action: 'nudge', signal: h.signal, taskId: h.taskId })
  const at = e.now.toISOString()
  if (outcome === 'skip_prompt' && h.signal === 'no_progress') {
    put(e, { ...row, level: 0, clearedAt: at, lastNudgedAt: null })
    put(e, freshRow(e, { ...h, signal: 'waiting_approval' }))
  } else if (outcome === 'ok' || outcome === 'unconfirmed') {
    put(e, { ...row, lastNudgedAt: at })
  }
}

async function autoRecover(e: Env, h: SignalHit): Promise<void> {
  if (!h.ownerAlive) return announce(e, h, 2, noticeText(h, e.ctx.team.name))
  try {
    await e.ops.recoverTask(e.deps, { id: h.taskId })
    event(e, h, 'recover', 'ok')
  } catch (err) {
    event(e, h, 'recover', `failed:${(err as { code?: string }).code ?? 'error'}`)
  }
}

async function act(e: Env, h: SignalHit, level: number, row: PatrolStateRow): Promise<void> {
  const team = e.ctx.team.name
  if (level === 1) {
    if (h.signal === 'dead_assignee') return autoRecover(e, h)
    return nudge(e, h, row)
  }
  if (level === 2) return announce(e, h, 2, noticeText(h, team))
  e.deps.registry.freezePost({ post: h.post, team, reason: `patrol: ${h.signal}`, signal: h.signal })
  event(e, h, 'freeze', 'ok')
  await announce(e, h, 3, freezeText(h))
}

/** done_unfinished 的第 1 级：每个到期的周期重跑一次 wl task done（只续跑），第 MAX_RERUNS 次仍失败 → 通知人。 */
async function rerun(e: Env, h: SignalHit, row: PatrolStateRow): Promise<void> {
  const at = e.now.getTime()
  const r = put(e, { ...row, level: 1, levelAt: row.level === 0 ? e.now.toISOString() : row.levelAt, notifyCount: row.notifyCount + 1, nextDueAt: new Date(at + PATROL_INTERVAL_MS).toISOString() })
  try {
    await e.ops.doneTask(e.deps, { id: h.taskId, as: h.post, resumeEpoch: h.epoch })
  } catch (err) {
    const code = err instanceof WinglineError ? err.code : 'error'
    event(e, h, 'rerun_done', `failed:${code}`)
    if (code === 'verdict_missing') return clearRow(e, r)
    if (r.notifyCount < MAX_RERUNS) return
    put(e, { ...r, level: 2, levelAt: e.now.toISOString(), nextDueAt: null })
    return announce(e, h, 2, noticeText(h, e.ctx.team.name))
  }
  event(e, h, 'rerun_done', 'ok')
  await clearRow(e, r)
}

async function advance(e: Env, h: SignalHit, row: PatrolStateRow): Promise<void> {
  if (h.signal === 'done_unfinished' && (row.level === 0 || (row.level === 1 && row.notifyCount < MAX_RERUNS))) return rerun(e, h, row)
  const next = ladderFor(h.signal, e.ctx.spec).find((l) => l > row.level)
  const leadFrozen = next === 3 && h.post === `${e.ctx.spec.lead}@${e.ctx.team.name}` && !e.ctx.spec.patrol.freezeLead
  if (next !== undefined && !leadFrozen) {
    const entered = put(e, { ...row, level: next, levelAt: e.now.toISOString(), nextDueAt: null })
    return act(e, h, next, entered)
  }
  if (!LADDERS[h.signal].repeat) return
  const count = row.notifyCount + 1
  const backoff = Math.min(PATROL_INTERVAL_MS * 2 ** count, MAX_BACKOFF_MS)
  const repeated = put(e, { ...row, notifyCount: count, nextDueAt: new Date(e.now.getTime() + backoff).toISOString() })
  await act(e, h, repeated.level, repeated)
}

async function step(e: Env, h: SignalHit, row: PatrolStateRow | null, observeOnly: boolean): Promise<void> {
  const now = e.now.getTime()
  if (!row || (row.clearedAt && now - ms(row.clearedAt) > REVIVE_WINDOW_MS)) {
    put(e, freshRow(e, h))
    return event(e, h, 'observe')
  }
  if (row.clearedAt) {
    put(e, { ...row, clearedAt: null, levelAt: e.now.toISOString(), lastNudgedAt: null })
    return
  }
  if (e.deps.registry.getFrozen(h.post)) return
  if (observeOnly || now - ms(row.levelAt) < PATROL_INTERVAL_MS || (row.nextDueAt && now < ms(row.nextDueAt))) return
  await advance(e, h, row)
}

/** spec 第 6.1、6.2、6.4 节。每个主体互相隔离；level 在动作之前写入。 */
export async function advancePatrol(
  deps: CommandDeps,
  ctx: { team: TeamRow; spec: TeamSpec },
  hits: SignalHit[],
  o: { observeOnly: boolean; ops?: PatrolOps; io?: OutletIo },
): Promise<void> {
  const e: Env = { deps, ctx, now: deps.now(), ops: o.ops ?? { doneTask, recoverTask }, io: o.io ?? {} }
  const rows = new Map(deps.registry.listPatrolState(ctx.team.name).map((r) => [keyOf(r.post, r.signal, r.taskId), r]))
  const hitKeys = new Set(hits.map((h) => keyOf(h.post, h.signal, h.taskId)))
  for (const [k, r] of rows) {
    if (!r.clearedAt && !hitKeys.has(k)) await clearRow(e, r)
  }
  for (const h of hits) {
    try {
      await step(e, h, rows.get(keyOf(h.post, h.signal, h.taskId)) ?? null, o.observeOnly)
    } catch (err) {
      event(e, h, 'error', err instanceof Error ? err.message : String(err))
    }
  }
}
