import { WinglineError } from '../errors.js'
import type { AuditRow, PatrolEvent, TaskLogRow } from '../registry/registry.js'
import { parseDuration } from './dispatcher/controls.js'
import type { CommandDeps } from './deps.js'

/** 时间线的三个来源：任务日志、巡查事件、审计（命令）事件。 */
export type TimelineSource = 'task' | 'patrol' | 'command'

export interface TimelineEvent {
  at: string
  source: TimelineSource
  actor: string
  action: string
  target: string | null
  outcome: string | null
  detail: unknown
  /** 形如 `task:12`：来源 + 该来源的行 id。3B 的 SSE 事件 id 直接用它。 */
  id: string
}

/** 每个来源已读到第几行；follow 只发比它新的。 */
export interface LogCursor {
  task: number
  patrol: number
  command: number
}

export interface TimelineFilter {
  team: string
  /** 只留这个任务的行（任意 epoch）。 */
  task?: string
  /** 只留这个岗位的行（actor 或 target 命中即可）。 */
  post?: string
  /** 时长（90s、15m、2h）或 ISO 时间；解析在读的时候做，用 deps.now() 当基准。 */
  since?: string
  /** 只留最新 n 条；默认 200。 */
  limit?: number
  source?: TimelineSource
}

/** 同一时刻的排序：任务 → 巡查 → 命令，再按各来源的行 id。 */
const SOURCE_ORDER: Record<TimelineSource, number> = { task: 0, patrol: 1, command: 2 }
const DEFAULT_LIMIT = 200
const PRUNE_DAYS = 30
const DAY_MS = 86_400_000
const EMPTY_CURSOR: LogCursor = { task: 0, patrol: 0, command: 0 }

const rowNo = (id: string) => Number(id.slice(id.indexOf(':') + 1))

/** 库里 detail 存字符串（对象会被 JSON 化）；能当 JSON 读就读，读不出按原样返回。 */
function parseDetail(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const fromTaskLog = (rows: TaskLogRow[]): TimelineEvent[] =>
  rows.map((r) => ({
    at: r.at, source: 'task', actor: r.actor, action: r.action,
    target: `${r.taskId}#${r.epoch}`, outcome: null, detail: parseDetail(r.detail), id: `task:${r.id}`,
  }))

const fromPatrol = (rows: Array<PatrolEvent & { id: number; at: string }>): TimelineEvent[] =>
  rows.map((r) => ({
    at: r.at, source: 'patrol', actor: `dispatcher@${r.team}`,
    action: r.signal ? `${r.signal}/${r.action}` : r.action,
    target: r.taskId ?? r.post ?? null, outcome: r.outcome ?? null, detail: parseDetail(r.detail), id: `patrol:${r.id}`,
  }))

const fromAudit = (rows: AuditRow[]): TimelineEvent[] =>
  rows.map((r) => ({
    at: r.at, source: 'command', actor: r.actor, action: r.command,
    target: r.target ?? null, outcome: r.outcome, detail: parseDetail(r.detail), id: `command:${r.id}`,
  }))

const sortEvents = (events: TimelineEvent[]): TimelineEvent[] =>
  [...events].sort((a, b) => a.at.localeCompare(b.at) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || rowNo(a.id) - rowNo(b.id))

/** 游标取读到的每一源最大行 id，不看过滤：被过滤掉的行也不该在 follow 里再来一次。 */
const cursorOf = (events: TimelineEvent[], base: LogCursor = EMPTY_CURSOR): LogCursor => {
  const out = { ...base }
  for (const e of events) out[e.source] = Math.max(out[e.source], rowNo(e.id))
  return out
}

function matches(e: TimelineEvent, f: TimelineFilter, since: string | undefined): boolean {
  if (f.source && e.source !== f.source) return false
  if (f.task && e.target !== f.task && !(e.target ?? '').startsWith(`${f.task}#`)) return false
  if (f.post && e.actor !== f.post && e.target !== f.post && e.actor !== `${f.post}@${f.team}` && e.target !== `${f.post}@${f.team}`) return false
  if (since !== undefined && e.at < since) return false
  return true
}

/** 每次读时间线顺手清掉本团队 30 天前的审计；清不掉只警告，不影响这一次读到什么。 */
function pruneOldAudit(deps: CommandDeps, team: string, now: Date): void {
  try {
    deps.registry.pruneAudit(new Date(now.getTime() - PRUNE_DAYS * DAY_MS).toISOString(), team)
  } catch (err) {
    deps.warn(`审计清理失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

function knownTeam(deps: CommandDeps, team: string): void {
  if (!deps.registry.getTeam(team)) throw new WinglineError('input', 'team_unknown', `团队 ${team} 未登记`, { hint: '先执行 wl up <team.yaml>' })
}

/** 时长（90s、15m、2h）或 ISO 时间 → ISO 起点；都不是就 duration_invalid。 */
export function parseSince(s: string, now: Date): string {
  try {
    return new Date(now.getTime() - parseDuration(s)).toISOString()
  } catch {
    const at = Date.parse(s)
    if (Number.isNaN(at)) {
      throw new WinglineError('input', 'duration_invalid', `无法识别的 --since ${s}`, { hint: '写成 90s、15m、2h，或一个 ISO 时间' })
    }
    return new Date(at).toISOString()
  }
}

export async function readTimeline(deps: CommandDeps, a: TimelineFilter): Promise<{ events: TimelineEvent[]; cursor: LogCursor }> {
  knownTeam(deps, a.team)
  const now = deps.now()
  const since = a.since === undefined ? undefined : parseSince(a.since, now)
  pruneOldAudit(deps, a.team, now)
  const o = since === undefined ? {} : { since }
  const all = sortEvents([
    ...fromTaskLog(deps.registry.listTeamTaskLog(a.team, o)),
    ...fromPatrol(deps.registry.listPatrolEvents(a.team, o)),
    ...fromAudit(deps.registry.listAudit(a.team, o)),
  ])
  const filtered = all.filter((e) => matches(e, a, since))
  const n = a.limit ?? DEFAULT_LIMIT
  return { events: n > 0 ? filtered.slice(-n) : [], cursor: cursorOf(all) }
}

/** 游标之后的三源行；follow 每轮调一次。 */
export async function readTimelineAfter(
  deps: CommandDeps, team: string, cursor: LogCursor, filter: Omit<TimelineFilter, 'team'> = {},
): Promise<{ events: TimelineEvent[]; cursor: LogCursor }> {
  knownTeam(deps, team)
  const since = filter.since === undefined ? undefined : parseSince(filter.since, deps.now())
  const o = since === undefined ? {} : { since }
  const all = sortEvents([
    ...fromTaskLog(deps.registry.listTeamTaskLog(team, { ...o, afterId: cursor.task })),
    ...fromPatrol(deps.registry.listPatrolEvents(team, { ...o, afterId: cursor.patrol })),
    ...fromAudit(deps.registry.listAudit(team, { ...o, afterId: cursor.command })),
  ])
  return { events: all.filter((e) => matches(e, { team, ...filter }, since)), cursor: cursorOf(all, cursor) }
}

/**
 * 先睡一轮再读，读到就发；收到信号就停。不持团队锁——锁是 restore 用的。
 * `sleep` 是给测试用的时间旋钮，真实运行用 setTimeout。
 */
export async function followTimeline(
  deps: CommandDeps,
  a: TimelineFilter & { cursor?: LogCursor },
  emit: (e: TimelineEvent) => void,
  o: { intervalMs?: number; signal: AbortSignal; sleep?: (ms: number) => Promise<void> },
): Promise<void> {
  const intervalMs = o.intervalMs ?? 2000
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let cursor = a.cursor ?? { ...EMPTY_CURSOR }
  while (!o.signal.aborted) {
    await sleep(intervalMs)
    if (o.signal.aborted) break
    const r = await readTimelineAfter(deps, a.team, cursor, a)
    cursor = r.cursor
    for (const e of r.events) emit(e)
  }
}
