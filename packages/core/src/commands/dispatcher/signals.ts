import type { TerminalSummary, WorkerView } from '../../orca/types.js'
import type { DoneVerdictRow, PatrolSignal, PatrolStateRow, QuestionRow, TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { screenGuard, type ScreenState } from '../task/notify.js'
import { fetchTasks, gatherStaleInput, staleReasons, type StaleItem, type TaskRow } from '../task/query.js'

export const NUDGE_GRACE_MS = 300_000
const DONE_UNFINISHED_GRACE_MS = 120_000
const MINUTE_MS = 60_000

export interface ScanSnapshot {
  now: Date
  lead: string
  tasks: TaskRow[]
  byHandle: ReadonlyMap<string, TerminalSummary>
  byTitle: ReadonlyMap<string, TerminalSummary>
  /** worker-list 失败时为 null。 */
  workers: WorkerView[] | null
  stale: StaleItem[]
  /** 只对候选 handle 调用过 screenGuard。 */
  screens: ReadonlyMap<string, ScreenState | 'offline'>
  openQuestions: QuestionRow[]
  lastLogAt: ReadonlyMap<string, string>
  lastVerdictAt: ReadonlyMap<string, string>
  streakAfterCursor: ReadonlyMap<string, DoneVerdictRow[]>
  unfinished: DoneVerdictRow[]
  wokeAt: Date | null
}

export interface SignalHit {
  post: string
  signal: PatrolSignal
  taskId: string
  minutes?: number
  command?: string
  question?: string
  messageId?: string
  count?: number
  /** done_unfinished：要续跑的那一轮。 */
  epoch?: number
  /** dead_assignee：主人岗位终端是否存活。 */
  ownerAlive?: boolean
}

export interface Ladder {
  levels: readonly number[]
  repeat: boolean
}
/** spec 第 5.2 节最后一列；键的声明顺序就是输出顺序。 */
export const LADDERS: Readonly<Record<PatrolSignal, Ladder>> = {
  no_progress: { levels: [0, 1, 2, 3], repeat: true },
  waiting_approval: { levels: [0, 2], repeat: true },
  waiting_answer: { levels: [0, 2], repeat: true },
  dead_assignee: { levels: [0, 2], repeat: true },
  owner_idle: { levels: [0, 1, 2], repeat: true },
  overdue: { levels: [0, 2], repeat: false },
  done_unfinished: { levels: [0, 1, 2], repeat: false },
  bypassed: { levels: [0, 2], repeat: false },
  call_uncertain: { levels: [0, 2], repeat: false },
  gate_streak: { levels: [0, 2, 3], repeat: true },
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0)

async function quietScreens(
  deps: CommandDeps,
  spec: TeamSpec,
  tasks: TaskRow[],
  byHandle: Map<string, TerminalSummary>,
  now: Date,
  onProgress: () => void,
): Promise<Map<string, ScreenState | 'offline'>> {
  const screens = new Map<string, ScreenState | 'offline'>()
  for (const t of tasks.filter((x) => x.status === 'dispatched' && x.assigneeHandle)) {
    const term = byHandle.get(t.assigneeHandle!)
    if (!term || screens.has(term.handle)) continue
    const lastOut = term.lastOutputAt ?? ms(t.dispatchedAt)
    if ((now.getTime() - lastOut) / MINUTE_MS > spec.patrol.promptMinutes) {
      screens.set(term.handle, await screenGuard(deps, term.handle))
      onProgress()
    }
  }
  return screens
}

async function workersOrNull(deps: CommandDeps, runId: string): Promise<WorkerView[] | null> {
  try {
    return await deps.orca.workerList({ run: runId })
  } catch {
    return null
  }
}

function localHistory(deps: CommandDeps, spec: TeamSpec, tasks: TaskRow[]) {
  const lastLogAt = new Map<string, string>()
  const lastVerdictAt = new Map<string, string>()
  for (const t of tasks.filter((x) => x.status === 'dispatched')) {
    const log = deps.registry.listTaskLog(t.id).at(-1)
    if (log) lastLogAt.set(t.id, log.at)
    const verdict = deps.registry.listVerdictsOf(t.id).at(-1)
    if (verdict) lastVerdictAt.set(t.id, verdict.createdAt)
  }
  const streakAfterCursor = new Map<string, DoneVerdictRow[]>()
  for (const p of spec.posts) {
    const address = `${p.id}@${spec.name}`
    const cursor = deps.registry.getCursor(address)
    streakAfterCursor.set(address, cursor ? deps.registry.listFinishedVerdictsAfter(address, cursor) : [])
  }
  return { lastLogAt, lastVerdictAt, streakAfterCursor }
}

/** 一次 taskList、一次 terminalList（必需，失败则抛出）；worker-list（可选）；候选 handle 的 terminal show；本地表。 */
export async function takeSnapshot(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec }, o: { wokeAt: Date | null; onProgress?: () => void }): Promise<ScanSnapshot> {
  const { team, spec } = ctx
  const now = deps.now()
  const progress = o.onProgress ?? (() => {})
  const tasks = await fetchTasks(deps, team.name)
  progress()
  const terminals = await deps.orca.terminalList()
  progress()
  const byHandle = new Map(terminals.map((t) => [t.handle, t]))
  const input = await gatherStaleInput(deps, team.name, { tasks, terminals })
  const workers = await workersOrNull(deps, team.runId!)
  progress()
  return {
    now, lead: `${spec.lead}@${team.name}`, tasks, byHandle,
    byTitle: new Map(terminals.filter((t) => t.title).map((t) => [t.title!, t])),
    workers,
    stale: staleReasons(input, now, { ownerIdleMinutes: spec.patrol.ownerIdleMinutes, uncertainMinutes: 1 }),
    screens: await quietScreens(deps, spec, tasks, new Map(byHandle), now, progress),
    openQuestions: deps.registry.listOpenQuestions(team.name),
    unfinished: deps.registry.listUnfinishedVerdicts(team.name),
    wokeAt: o.wokeAt,
    ...localHistory(deps, spec, tasks),
  }
}

const RECOVERY = new Set(['passed', 'bypassed'])

/** 没有游标的岗位以 now 为起点；游标之后出现 passed/bypassed 时推进到最后一条。 */
export function syncCursors(deps: CommandDeps, team: string, posts: string[], snap: ScanSnapshot): void {
  for (const post of posts) {
    if (!deps.registry.getCursor(post)) {
      deps.registry.setCursor(team, post, snap.now.toISOString())
      continue
    }
    const last = (snap.streakAfterCursor.get(post) ?? []).filter((v) => RECOVERY.has(v.verdict)).at(-1)
    if (last?.finishedAt) deps.registry.setCursor(team, post, last.finishedAt)
  }
}

type Pat = { state: PatrolStateRow[] }
const minutesOf = (snap: ScanSnapshot, fromMs: number) => Math.floor((snap.now.getTime() - fromMs) / MINUTE_MS)

function ownerOf(snap: ScanSnapshot, t: TaskRow): string | null {
  return t.claimedBy ?? snap.byHandle.get(t.assigneeHandle ?? '')?.title ?? null
}

function waitingAnswer(snap: ScanSnapshot, t: TaskRow, post: string): SignalHit | null {
  const q = snap.openQuestions.find((x) => x.dispatchId === t.dispatchId)
  const viaWorker = snap.workers?.some((w) => w.dispatchId === t.dispatchId && w.attention.includes('input')) ?? false
  if (!(snap.workers ? viaWorker : q)) return null
  return { post, signal: 'waiting_answer', taskId: t.id, ...(q ? { question: q.body, messageId: q.messageId } : {}) }
}

/** 提示过且行未清除时需要进展证据才算恢复（spec 第 6.1 节）。 */
function hasProgress(snap: ScanSnapshot, t: TaskRow, row: PatrolStateRow, lastOut: number): boolean {
  const levelAt = ms(row.levelAt)
  if (lastOut > Math.max(levelAt, ms(row.lastNudgedAt) + NUDGE_GRACE_MS)) return true
  // 重新派发（dispatch_id 变了）也是进展：dispatched_at 晚于进入当前级别的时间
  return ms(snap.lastLogAt.get(t.id)) > levelAt || ms(snap.lastVerdictAt.get(t.id)) > levelAt || ms(t.dispatchedAt) > levelAt
}

function noProgress(snap: ScanSnapshot, spec: TeamSpec, t: TaskRow, post: string, term: TerminalSummary, p: Pat): SignalHit | null {
  const row = p.state.find((r) => r.post === post && r.signal === 'no_progress' && r.taskId === t.id && !r.clearedAt && r.lastNudgedAt)
  const rawOut = term.lastOutputAt ?? 0
  const hit: SignalHit = { post, signal: 'no_progress', taskId: t.id }
  if (row) return hasProgress(snap, t, row, rawOut) ? null : { ...hit, minutes: minutesOf(snap, Math.max(rawOut, ms(t.dispatchedAt))) }
  const lastOut = Math.max(rawOut, ms(t.dispatchedAt), snap.wokeAt?.getTime() ?? 0)
  return (snap.now.getTime() - lastOut) / MINUTE_MS > spec.patrol.noProgressMinutes ? { ...hit, minutes: minutesOf(snap, lastOut) } : null
}

function overdue(snap: ScanSnapshot, spec: TeamSpec, t: TaskRow, post: string): SignalHit[] {
  const max = spec.budgets.task.maxMinutes
  if (max === null || !t.dispatchedAt) return []
  const minutes = minutesOf(snap, ms(t.dispatchedAt))
  return (snap.now.getTime() - ms(t.dispatchedAt)) / MINUTE_MS > max ? [{ post, signal: 'overdue', taskId: `${t.id}#${t.epoch}`, minutes }] : []
}

function activeHits(snap: ScanSnapshot, spec: TeamSpec, t: TaskRow, p: Pat): SignalHit[] {
  const post = ownerOf(snap, t)
  if (!post) return []
  const hits = overdue(snap, spec, t, post)
  const term = snap.byHandle.get(t.assigneeHandle ?? '')
  if (!term) return hits
  const answer = waitingAnswer(snap, t, post)
  if (answer) return [answer, ...hits]
  const outAt = term.lastOutputAt ?? ms(t.dispatchedAt)
  if (snap.screens.get(term.handle) === 'at_prompt') {
    const quiet = (snap.now.getTime() - outAt) / MINUTE_MS > spec.patrol.promptMinutes
    return quiet ? [{ post, signal: 'waiting_approval', taskId: t.id, minutes: minutesOf(snap, outAt) }, ...hits] : hits
  }
  const np = noProgress(snap, spec, t, post, term, p)
  return np ? [np, ...hits] : hits
}

function staleHit(snap: ScanSnapshot, it: StaleItem): SignalHit | null {
  if (!it.owner) return null
  const base = { post: it.owner, taskId: it.taskId, command: it.command }
  switch (it.reason) {
    case 'dead_assignee':
      return { ...base, signal: 'dead_assignee', ownerAlive: snap.byTitle.has(it.owner) }
    case 'owner_idle':
      return { ...base, signal: 'owner_idle', minutes: minutesOf(snap, ms(it.since)) }
    case 'done_unfinished': {
      const v = snap.unfinished.find((u) => u.taskId === it.taskId)
      if (!v || snap.now.getTime() - ms(v.createdAt) <= DONE_UNFINISHED_GRACE_MS) return null
      return { ...base, post: v.post, signal: 'done_unfinished', epoch: v.epoch }
    }
    case 'bypassed':
      return { ...base, signal: 'bypassed' }
    case 'call_uncertain':
      return { ...base, signal: 'call_uncertain' }
    default:
      return null
  }
}

function gateStreaks(snap: ScanSnapshot, spec: TeamSpec): SignalHit[] {
  const hits: SignalHit[] = []
  for (const [post, rows] of snap.streakAfterCursor) {
    const lastGood = rows.findLastIndex((v) => RECOVERY.has(v.verdict))
    const count = rows.slice(lastGood + 1).filter((v) => v.verdict === 'escalate').length
    if (count >= spec.patrol.postFailureStreak) hits.push({ post, signal: 'gate_streak', taskId: '', count })
  }
  return hits
}

/** 纯函数：按信号在 LADDERS 里的声明顺序、其次按任务 id 输出。 */
export function detectSignals(snap: ScanSnapshot, spec: TeamSpec, state: PatrolStateRow[]): SignalHit[] {
  const hits = [
    ...snap.tasks.filter((t) => t.status === 'dispatched').flatMap((t) => activeHits(snap, spec, t, { state })),
    ...snap.stale.flatMap((it) => staleHit(snap, it) ?? []),
    ...gateStreaks(snap, spec),
  ]
  const order = Object.keys(LADDERS)
  return hits.sort((a, b) => order.indexOf(a.signal) - order.indexOf(b.signal) || a.taskId.localeCompare(b.taskId))
}
