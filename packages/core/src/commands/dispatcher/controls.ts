import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }
const DEFAULT_HUSH_MS = 30 * 60_000

/** 90s / 15m / 2h → 毫秒；其他 → duration_invalid。 */
export function parseDuration(s: string): number {
  const m = /^(\d+)([smh])$/.exec(s.trim())
  if (!m) throw new WinglineError('input', 'duration_invalid', `无法识别的时长 ${s}`, { hint: '写成 90s、15m 或 2h' })
  return Number(m[1]) * UNITS[m[2]!]!
}

function teamOf(deps: CommandDeps, address: string): string {
  const team = address.slice(address.indexOf('@') + 1)
  if (!deps.registry.getTeam(team)) throw new WinglineError('input', 'team_unknown', `团队 ${team} 未登记`)
  return team
}

function knownPost(deps: CommandDeps, address: string): string {
  const team = teamOf(deps, address)
  if (!deps.registry.getPost(address)) throw new WinglineError('input', 'post_unknown', `${address} 不是团队 ${team} 的岗位`)
  return team
}

export async function freezePostCmd(deps: CommandDeps, a: { address: string; reason: string }): Promise<void> {
  const team = knownPost(deps, a.address)
  deps.registry.freezePost({ post: a.address, team, reason: a.reason, signal: null })
  deps.registry.appendPatrolEvent({ team, post: a.address, action: 'freeze', outcome: 'ok', detail: { reason: a.reason } })
}

async function stillReady(deps: CommandDeps, team: string, ids: string[]): Promise<Set<string>> {
  try {
    const tasks = await deps.orca.taskList({ run: deps.registry.getTeam(team)!.runId! })
    return new Set(tasks.filter((t) => t.status === 'ready').map((t) => t.id))
  } catch {
    return new Set(ids)
  }
}

/** 解冻：先重置巡查行与游标，最后删冻结行（中途崩溃仍是冻结状态，可重跑）。团队以冻结行为准——巡查可能冻结的是没登记的终端（任务派去了陌生终端），knownPost 会把它判成 post_unknown，永远解不开。 */
export async function unfreezePostCmd(deps: CommandDeps, a: { address: string }): Promise<{ skipped: Array<{ taskId: string; command: string }> }> {
  const frozen = deps.registry.getFrozen(a.address)
  if (!frozen) {
    knownPost(deps, a.address) // 没冻结：按原口径报 team_unknown / post_unknown
    throw new WinglineError('input', 'post_not_frozen', `岗位 ${a.address} 没有被冻结`)
  }
  const team = frozen.team
  const at = deps.now().toISOString()
  deps.registry.resetPatrolForPost(a.address, at)
  deps.registry.setCursor(team, a.address, at)
  const skipped = deps.registry.listDeliveries(a.address, frozen.frozenAt).filter((d) => d.delivery === 'skipped_frozen')
  const ready = await stillReady(deps, team, skipped.map((d) => d.taskId))
  deps.registry.unfreezePost(a.address)
  deps.registry.appendPatrolEvent({ team, post: a.address, action: 'unfreeze', outcome: 'ok' })
  return { skipped: skipped.filter((d) => ready.has(d.taskId)).map((d) => ({ taskId: d.taskId, command: `wl task start ${d.taskId} --as ${a.address}` })) }
}

export async function hushCmd(deps: CommandDeps, a: { address: string; forMs?: number }): Promise<{ until: string }> {
  const team = knownPost(deps, a.address)
  const until = new Date(deps.now().getTime() + (a.forMs ?? DEFAULT_HUSH_MS)).toISOString()
  deps.registry.hush(team, a.address, until)
  deps.registry.appendPatrolEvent({ team, post: a.address, action: 'hush', outcome: 'ok', detail: { until } })
  return { until }
}

export async function unhushCmd(deps: CommandDeps, a: { address: string }): Promise<void> {
  const team = knownPost(deps, a.address)
  deps.registry.unhush(a.address)
  deps.registry.appendPatrolEvent({ team, post: a.address, action: 'unhush', outcome: 'ok' })
}
