import { WinglineError } from '../../errors.js'
import type { PatrolStateRow, QuestionRow } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'
import { taskPreflight } from '../task/preflight.js'
import { gatherStaleInput, staleReasons, type StaleItem } from '../task/query.js'
import { dispatcherHealth, type DispatcherHealth } from './lifecycle.js'

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
}

const DAY_MS = 24 * 3_600_000

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
    ...f, skippedChildren: registry.listDeliveries(f.post).filter((d) => d.delivery === 'skipped_frozen').length,
  }))
  const signals = registry.listPatrolState(team).filter((s) => !s.clearedAt && s.level >= 1).sort((a, b) => b.level - a.level)
  return {
    team,
    dispatcher: dispatcherHealth(deps, team),
    frozen,
    signals: signals.map((s) => ({ ...s, command: lastCommand(deps, team, s) })),
    questions: registry.listOpenQuestions(team),
    ...(await staleSource(deps, team)),
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
    warnings: events.filter((e) => e.at >= since && WARNING_ACTIONS.has(e.action)).map((e) => `${e.action}: ${e.outcome ?? ''}`),
  }
}
