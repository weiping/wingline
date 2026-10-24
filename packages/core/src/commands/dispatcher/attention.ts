import fs from 'node:fs'
import { WinglineError } from '../../errors.js'
import { ORCA_WORKTREE_SUPPORT } from '../../orca/client.js'
import type { PatrolStateRow, QuestionRow } from '../../registry/registry.js'
import { draftPathOf } from '../../spec/draft.js'
import { loadTeamSpec, type TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { taskPreflight } from '../task/preflight.js'
import { gatherStaleInput, staleReasons, type StaleItem } from '../task/query.js'
import { dispatcherHealth, type DispatcherHealth } from './lifecycle.js'
import { unreadGaveUp } from './unread.js'

export interface AttentionReport {
  team: string
  dispatcher: DispatcherHealth
  frozen: Array<{ post: string; reason: string; frozenAt: string; skippedChildren: number }>
  /** cleared_at 为空、level >= 1，按 level 倒序。 */
  signals: Array<PatrolStateRow & { command: string | null }>
  questions: QuestionRow[]
  stale: StaleItem[]
  /** 取不到的来源及原因。 */
  unavailable: string[]
  /** 需要人知道但不属于某个条目的提示：未应用的规格草稿、Orca 同步不可用等。 */
  warnings: string[]
}

const DAY_MS = 24 * 3_600_000

/** spec 第 6.5 节：由规格文件、注册表与常量推导，条件成立期间一直显示。 */
export function warningsOf(deps: CommandDeps, team: string, spec: TeamSpec | null): string[] {
  const specPath = deps.registry.getTeam(team)?.specPath
  if (!specPath) return []
  const draft = draftPathOf(specPath)
  const out = fs.existsSync(draft) ? [`有未应用的规格草稿：${draft}（执行 wl down ${team} 后 wl up ${specPath} --draft）`] : []
  if (spec?.patrol.workspaceStatus && !ORCA_WORKTREE_SUPPORT.workspaceStatus) out.push('Orca 不支持工作区状态：patrol.workspace_status 不起作用')
  if (spec?.patrol.worktreeComment && !ORCA_WORKTREE_SUPPORT.comment) out.push('Orca 不支持卡片注释：patrol.worktree_comment 不起作用')
  if (spec?.patrol.unreadMark && !ORCA_WORKTREE_SUPPORT.unread) out.push('Orca 不支持未读标记：patrol.unread_mark 不起作用')
  if (spec?.patrol.unreadMark && unreadGaveUp(deps, team)) out.push('Orca 未读标记连续 3 次失败：本次调度员运行期间已停止尝试（重启调度员后重试）')
  for (const s of deps.registry.listOrcaSync(team)) {
    if (s.failCount >= 3) out.push(`Orca 同步已停止：${s.worktree}（连续 3 次失败，重启调度员后重试）`)
  }
  return out
}

function specOf(deps: CommandDeps, team: string): TeamSpec | null {
  const specPath = deps.registry.getTeam(team)?.specPath
  if (!specPath) return null
  try {
    return loadTeamSpec(specPath)
  } catch (err) {
    if (err instanceof WinglineError) return null
    throw err
  }
}

function lastCommand(deps: CommandDeps, team: string, s: PatrolStateRow): string | null {
  const events = deps.registry.listPatrolEvents(team, { limit: 500 })
  const hit = events.findLast((e) => e.action === 'notify' && e.post === s.post && e.signal === s.signal && (e.taskId ?? '') === s.taskId)
  const command = (hit?.detail as { command?: string } | null | undefined)?.command
  return command ?? null
}

async function staleSource(deps: CommandDeps, team: string): Promise<{ stale: StaleItem[]; unavailable: string[] }> {
  try {
    const { spec } = await taskPreflight(deps, team, { orca: false })
    const input = await gatherStaleInput(deps, team)
    return { stale: staleReasons(input, deps.now(), { ownerIdleMinutes: spec.patrol.ownerIdleMinutes, uncertainMinutes: 1 }), unavailable: [] }
  } catch (err) {
    if (!(err instanceof WinglineError)) throw err
    return { stale: [], unavailable: [`${err.kind === 'orca' ? 'orca' : 'team'}: ${err.code}`] }
  }
}

/** spec 第 6.5 节：只读汇总；调度员没在跑也能用，取不到的来源显式列在 unavailable。 */
export async function attention(deps: CommandDeps, team: string): Promise<AttentionReport> {
  if (!deps.registry.getTeam(team)) throw new WinglineError('input', 'team_unknown', `团队 ${team} 未登记`)
  const { registry } = deps
  const frozen = registry.listFrozen(team).map((f) => ({
    ...f, skippedChildren: registry.listDeliveries(f.post, f.frozenAt).filter((d) => d.delivery === 'skipped_frozen').length,
  }))
  const signals = registry.listPatrolState(team).filter((s) => !s.clearedAt && s.level >= 1).sort((a, b) => b.level - a.level)
  return {
    team,
    dispatcher: dispatcherHealth(deps, team),
    frozen,
    signals: signals.map((s) => ({ ...s, command: lastCommand(deps, team, s) })),
    questions: registry.listOpenQuestions(team),
    ...(await staleSource(deps, team)),
    warnings: warningsOf(deps, team, specOf(deps, team)),
  }
}

export interface DispatcherStatus {
  team: string
  health: DispatcherHealth
  lastCheck: { at: string; outcome: string } | null
  lastScan: { at: string; outcome: string } | null
  frozen: number
  hushed: number
  attentionItems: number
  warnings: string[]
}

const WARNING_ACTIONS = new Set(['spec_reload_failed', 'loop_error'])

/** 同一 action+outcome 合并成一行并带次数，按首次出现的顺序。 */
function groupWarnings(events: Array<{ action: string; outcome?: string | null }>): string[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const line = `${e.action}: ${e.outcome ?? ''}`
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  return [...counts].map(([line, n]) => (n > 1 ? `${line} ×${n}` : line))
}

/** spec 第 2 节 `wl dispatcher status`。 */
export async function dispatcherStatus(deps: CommandDeps, team: string): Promise<DispatcherStatus> {
  const { registry } = deps
  const now = deps.now()
  const events = registry.listPatrolEvents(team, { limit: 500 })
  const last = (match: (action: string) => boolean) => {
    const e = events.findLast((x) => match(x.action))
    return e ? { at: e.at, outcome: e.outcome ?? 'ok' } : null
  }
  const report = await attention(deps, team)
  const since = new Date(now.getTime() - DAY_MS).toISOString()
  return {
    team,
    health: report.dispatcher,
    lastCheck: last((a) => a.startsWith('check_')),
    lastScan: last((a) => a === 'scan' || a === 'scan_skipped'),
    frozen: report.frozen.length,
    hushed: registry.listHushes(team).filter((h) => Date.parse(h.until) > now.getTime()).length,
    attentionItems: report.frozen.length + report.signals.length + report.questions.length + report.stale.length,
    warnings: groupWarnings(events.filter((e) => e.at >= since && WARNING_ACTIONS.has(e.action))),
  }
}
