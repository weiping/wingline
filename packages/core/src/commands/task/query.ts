import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../../errors.js'
import type { OrchestrationTaskStatus, TerminalSummary } from '../../orca/types.js'
import type { DoneVerdictRow, RequestState, TaskKind, TaskLogRow, TeamRow } from '../../registry/registry.js'
import { loadTeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { requireActor } from './identity.js'
import { shellQuote } from './quote.js'

export interface DoneClosure {
  kind: 'completed' | 'handed_to' | 'sent_for_review' | 'escalated'
  targets?: string[]
}

export interface TaskRow {
  id: string
  status: OrchestrationTaskStatus
  title: string
  parentId: string | null
  tags: string[]
  kind: TaskKind
  plan: string | null
  claimedBy: string | null
  assigneeHandle: string | null
  dispatchId: string | null
  epoch: number
  gateFailures: number
  readySince: string | null
  dispatchedAt: string | null
  result: string | null
}

export function mustTeamReady(deps: CommandDeps, name: string): TeamRow {
  const team = deps.registry.getTeam(name)
  if (!team) throw new WinglineError('input', 'team_unknown', `团队 ${name} 未登记`, { hint: '先执行 wl up <team.yaml>' })
  if (!team.runId) throw new WinglineError('input', 'run_not_ready', `团队 ${name} 还没有建立 Run`, { hint: `先执行 wl up，处理 Run 步骤的提示` })
  return team
}

/** taskList ⋈ task_ext；没有 ext 行（在 Orca 界面里直接建的任务）时取默认值。 */
export async function fetchTasks(deps: CommandDeps, team: string): Promise<TaskRow[]> {
  const row = mustTeamReady(deps, team)
  const tasks = await deps.orca.taskList({ run: row.runId! })
  return tasks.map((t) => {
    const ext = deps.registry.getTaskExt(t.id)
    return {
      id: t.id, status: t.status, title: t.title, parentId: t.parentId,
      tags: ext?.tags ?? [], kind: ext?.kind ?? 'work', plan: ext?.plan ?? null, claimedBy: ext?.claimedBy ?? null,
      assigneeHandle: t.assigneeHandle, dispatchId: t.dispatchId,
      epoch: ext?.epoch ?? 0, gateFailures: ext?.gateFailures ?? 0, readySince: ext?.readySince ?? null, dispatchedAt: ext?.dispatchedAt ?? null,
      result: t.result,
    }
  })
}

const notFound = (id: string) => new WinglineError('input', 'task_not_found', `找不到任务 ${id}`, { hint: '用 wl task list 查看任务' })

export function pickTask(tasks: TaskRow[], id: string): TaskRow {
  const found = tasks.find((t) => t.id === id)
  if (!found) throw notFound(id)
  return found
}

export async function findTask(deps: CommandDeps, team: string, id: string): Promise<TaskRow> {
  return pickTask(await fetchTasks(deps, team), id)
}

/** task_ext.team 优先，否则遍历有 Run 的团队。 */
export async function findTaskAnywhere(deps: CommandDeps, id: string): Promise<{ team: TeamRow; task: TaskRow }> {
  const owner = deps.registry.getTaskExt(id)?.team
  const names = owner ? [owner] : deps.registry.listTeams().filter((t) => t.runId).map((t) => t.name)
  for (const name of names) {
    const task = (await fetchTasks(deps, name)).find((t) => t.id === id)
    if (task) return { team: deps.registry.getTeam(name)!, task }
  }
  throw notFound(id)
}

const TASK_STATUSES: readonly OrchestrationTaskStatus[] = ['ready', 'dispatched', 'blocked', 'completed', 'failed']

/** 不指定团队时某个团队读失败只告警，不影响其他团队。 */
async function fetchTasksTolerant(deps: CommandDeps, team: string, strict: boolean): Promise<TaskRow[]> {
  try {
    return await fetchTasks(deps, team)
  } catch (err) {
    if (strict || !(err instanceof WinglineError)) throw err
    deps.warn(`团队 ${team} 的任务读取失败：${err.message}`)
    return []
  }
}

export async function listTasks(deps: CommandDeps, a: { team?: string; mine?: boolean; status?: string; tags?: string[]; as?: string }): Promise<TaskRow[]> {
  const me = a.mine ? (await requireActor(deps, a.as)).address : null
  if (a.status && !TASK_STATUSES.includes(a.status as OrchestrationTaskStatus)) {
    throw new WinglineError('input', 'status_invalid', `未知状态 ${a.status}`, { hint: `可用：${TASK_STATUSES.join(', ')}` })
  }
  const names = a.team ? [a.team] : deps.registry.listTeams().filter((t) => t.runId).map((t) => t.name)
  const all = (await Promise.all(names.map((n) => fetchTasksTolerant(deps, n, !!a.team)))).flat()
  return all.filter(
    (t) => (me === null || t.claimedBy === me) && (!a.status || t.status === a.status) && (a.tags ?? []).every((g) => t.tags.includes(g)),
  )
}

export interface ShownTask extends TaskRow {
  outcome: string | null
  reportedBy: string | null
  closure: DoneClosure | null
  gateId?: string | null
  /** 最近一次 gate 失败的完整输出文件（`<home>/logs/<团队>/gate-<任务>-<轮>-<次>.txt`）；没有或已被 7 天清理 → null。 */
  gateOutput?: string | null
  history?: TaskLogRow[]
}

function parseJson(text: string | null): Record<string, unknown> {
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 任务最新的 gate 输出文件：按（轮次，第几次）数值最大者；目录不存在或没有匹配 → null。 */
export function latestGateOutput(home: string, team: string, taskId: string): string | null {
  const dir = path.join(home, 'logs', team)
  const re = new RegExp(`^gate-${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)-(\\d+)\\.txt$`)
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return null
  }
  const found = names.flatMap((name) => {
    const m = re.exec(name)
    return m ? [{ name, epoch: Number(m[1]), n: Number(m[2]) }] : []
  })
  found.sort((a, b) => b.epoch - a.epoch || b.n - a.n)
  return found[0] ? path.join(dir, found[0].name) : null
}

export async function showTask(deps: CommandDeps, a: { id: string; team?: string; history?: boolean }): Promise<ShownTask> {
  const task = a.team ? await findTask(deps, a.team, a.id) : (await findTaskAnywhere(deps, a.id)).task
  const report = parseJson(task.result)
  const finished = deps.registry.listVerdictsOf(a.id).filter((v) => v.result !== null)
  const latest = finished[finished.length - 1]
  const closure = (parseJson(latest?.result ?? null).closure as DoneClosure | undefined) ?? null
  const team = a.team ?? deps.registry.getTaskExt(a.id)?.team
  const gateId = task.status === 'blocked' && team ? deps.registry.listGates(team).filter((g) => g.taskId === a.id).at(-1)?.gateId ?? null : null
  return {
    ...task,
    outcome: (report.outcome as string | undefined) ?? null,
    reportedBy: (report.reportedBy as string | undefined) ?? null,
    closure,
    ...(gateId ? { gateId } : {}),
    gateOutput: team ? latestGateOutput(deps.home, team, a.id) : null,
    ...(a.history ? { history: deps.registry.listTaskLog(a.id) } : {}),
  }
}

// —— 卡住的任务（spec 第 10 节 --stale；2B 的巡查与 wl attention 复用）——

export type StaleReason = 'done_unfinished' | 'call_uncertain' | 'dead_assignee' | 'owner_idle' | 'bypassed' | 'blocked_waiting'
export interface StaleItem {
  taskId: string
  title: string
  reason: StaleReason
  owner: string | null
  since: string | null
  command: string
  gateId?: string
}
export interface StaleInput {
  team: string
  /** 该团队当前的 Run；用来把 oneshot 行归到对应团队。 */
  runId?: string | null
  tasks: TaskRow[]
  alive: ReadonlySet<string>
  unfinished: DoneVerdictRow[]
  verdicts: ReadonlyMap<string, DoneVerdictRow[]>
  open: Array<{ id: string; state: RequestState; updatedAt: string; args?: string | null }>
  gates: Array<{ gateId: string; taskId: string }>
}
export interface StaleThresholds {
  ownerIdleMinutes: number
  uncertainMinutes: number
}
export const DEFAULT_STALE: StaleThresholds = { ownerIdleMinutes: 30, uncertainMinutes: 1 }

const MINUTE_MS = 60_000
const as = (owner: string | null) => owner ?? '<主人>'
const minutesSince = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / MINUTE_MS
const item = (t: TaskRow, reason: StaleReason, since: string | null, command: string, extra: Partial<StaleItem> = {}): StaleItem => ({
  taskId: t.id, title: t.title, reason, owner: t.claimedBy, since, command, ...extra,
})

function doneUnfinished(x: StaleInput): StaleItem[] {
  return x.tasks.flatMap((t) => {
    const v = x.unfinished.find((u) => u.taskId === t.id && u.epoch === t.epoch)
    return v ? [item(t, 'done_unfinished', v.createdAt, `wl task done ${t.id} --as ${as(t.claimedBy)}`)] : []
  })
}

/** 账本键 → 任务与重跑命令；oneshot:* 不归任何任务。 */
function commandOfKey(x: StaleInput, key: string, t: TaskRow): string | null {
  const [kind] = key.split(':')
  if (kind === 'dispatch') return `wl task start ${t.id} --as ${as(t.claimedBy)}`
  if (kind === 'done') return `wl task done ${t.id} --as ${as(t.claimedBy)}`
  if (kind === 'recover') return `wl task recover ${t.id}`
  if (kind === 'resolve') return `wl task resolve ${key.split(':')[1]} --resolution <决定>`
  return null
}

function taskIdOfKey(x: StaleInput, key: string): string | undefined {
  const [kind, second] = key.split(':')
  if (kind === 'resolve') return x.gates.find((g) => g.gateId === second)?.taskId
  return kind === 'dispatch' || kind === 'done' || kind === 'recover' ? second : undefined
}

/** dispatch:<t>:<e> 与 done:<t>:<e>:… 键里的 epoch；其他键不带 epoch。 */
function epochOfKey(key: string): number {
  const [kind, , epoch] = key.split(':')
  return (kind === 'dispatch' || kind === 'done') && /^\d+$/.test(epoch ?? '') ? Number(epoch) : Number.POSITIVE_INFINITY
}

/** 被打断的 wl task create / escalate（oneshot:<id> 行）：用落盘的参数重建带 --retry-request 的重跑命令。 */
function oneshotItem(x: StaleInput, r: StaleInput['open'][number]): StaleItem[] {
  const rid = r.id.slice('oneshot:'.length)
  const a = JSON.parse(r.args ?? '{}') as { taskTitle?: string; run?: string; tags?: string[]; post?: string | null; parent?: string; task?: string; question?: string }
  if (a.taskTitle !== undefined && a.run === x.runId) {
    const flags = [a.post ? `--post ${a.post}` : '', a.tags?.length ? `--tags ${a.tags.join(',')}` : '', a.parent ? `--parent ${a.parent}` : ''].filter(Boolean)
    const command = [`wl task create ${x.team} --title ${shellQuote(a.taskTitle)}`, ...flags, `--retry-request ${rid}`].join(' ')
    return [{ taskId: rid, title: a.taskTitle, reason: 'call_uncertain', owner: a.post ?? null, since: r.updatedAt, command }]
  }
  const task = x.tasks.find((t) => t.id === a.task)
  if (!task || a.question === undefined) return []
  return [item(task, 'call_uncertain', r.updatedAt, `wl task escalate ${task.id} --reason ${shellQuote(a.question)} --retry-request ${rid}`)]
}

function callUncertain(x: StaleInput, now: Date, th: StaleThresholds): StaleItem[] {
  return x.open.flatMap((r) => {
    if (minutesSince(r.updatedAt, now) <= th.uncertainMinutes) return []
    if (r.id.startsWith('oneshot:')) return oneshotItem(x, r)
    const task = x.tasks.find((t) => t.id === taskIdOfKey(x, r.id))
    if (r.id.startsWith('dispatch:') && (task?.status === 'completed' || task?.status === 'failed')) return []
    if (task && epochOfKey(r.id) < task.epoch) return []
    const command = task ? commandOfKey(x, r.id, task) : null
    return task && command ? [item(task, 'call_uncertain', r.updatedAt, command)] : []
  })
}

function deadAssignee(x: StaleInput): StaleItem[] {
  return x.tasks
    .filter((t) => t.status === 'dispatched' && t.assigneeHandle !== null && !x.alive.has(t.assigneeHandle))
    .map((t) => item(t, 'dead_assignee', t.dispatchedAt, `wl task recover ${t.id}`))
}

function ownerIdle(x: StaleInput, now: Date, th: StaleThresholds): StaleItem[] {
  const busy = (owner: string) =>
    x.tasks.some((o) => o.status === 'dispatched' && o.claimedBy === owner)
  return x.tasks
    .filter((t) => t.status === 'ready' && t.claimedBy && t.readySince && minutesSince(t.readySince, now) > th.ownerIdleMinutes && !busy(t.claimedBy))
    .map((t) => item(t, 'owner_idle', t.readySince, `wl task start ${t.id} --as ${as(t.claimedBy)}`))
}

function bypassed(x: StaleInput): StaleItem[] {
  return x.tasks
    .filter((t) => (t.status === 'completed' || t.status === 'failed') && t.kind === 'work' && parseJson(t.result).provenance === 'worker_report')
    .filter((t) => !(x.verdicts.get(t.id) ?? []).some((v) => v.epoch === t.epoch))
    .map((t) => item(t, 'bypassed', null, `wl task done ${t.id} --as ${as(t.claimedBy)}`))
}

function blockedWaiting(x: StaleInput): StaleItem[] {
  return x.tasks.flatMap((t) => {
    const gate = t.status === 'blocked' ? x.gates.filter((g) => g.taskId === t.id).at(-1) : undefined
    return gate ? [item(t, 'blocked_waiting', null, `wl task resolve ${gate.gateId} --resolution <决定>`, { gateId: gate.gateId })] : []
  })
}

/** 纯函数；顺序固定为六类原因，同一任务可以出现多次。 */
export function staleReasons(input: StaleInput, now: Date, th: StaleThresholds = DEFAULT_STALE): StaleItem[] {
  return [
    ...doneUnfinished(input),
    ...callUncertain(input, now, th),
    ...deadAssignee(input),
    ...ownerIdle(input, now, th),
    ...bypassed(input),
    ...blockedWaiting(input),
  ]
}

/** 一次 taskList + 一次 terminalList + 本地表。 */
export async function gatherStaleInput(
  deps: CommandDeps,
  team: string,
  pre?: { tasks: TaskRow[]; terminals: TerminalSummary[] },
): Promise<StaleInput> {
  const tasks = pre?.tasks ?? (await fetchTasks(deps, team))
  const alive = new Set((pre?.terminals ?? (await deps.orca.terminalList())).map((t) => t.handle))
  const verdicts = new Map<string, DoneVerdictRow[]>()
  for (const t of tasks) if (t.status === 'completed' || t.status === 'failed') verdicts.set(t.id, deps.registry.listVerdictsOf(t.id))
  return {
    team, runId: mustTeamReady(deps, team).runId, tasks, alive, verdicts,
    unfinished: deps.registry.listUnfinishedVerdicts(team),
    open: deps.registry.listOpenRequests(''),
    gates: deps.registry.listGates(team),
  }
}

/** 阈值取自团队规格的 patrol 段；规格读不到时用默认值（扫描不因规格问题失败）。 */
function thresholdsFor(deps: CommandDeps, team: string): StaleThresholds {
  const row = deps.registry.getTeam(team)
  if (!row) return DEFAULT_STALE
  try {
    return { ...DEFAULT_STALE, ownerIdleMinutes: loadTeamSpec(row.specPath).patrol.ownerIdleMinutes }
  } catch (err) {
    if (!(err instanceof WinglineError)) throw err
    return DEFAULT_STALE
  }
}

/** 不给团队时扫描所有有 Run 的团队；某个团队扫描失败只告警，不影响其他团队。 */
export async function listStale(deps: CommandDeps, team?: string): Promise<StaleItem[]> {
  if (team) return staleReasons(await gatherStaleInput(deps, team), deps.now(), thresholdsFor(deps, team))
  const items: StaleItem[] = []
  for (const t of deps.registry.listTeams().filter((x) => x.runId)) {
    try {
      items.push(...staleReasons(await gatherStaleInput(deps, t.name), deps.now(), thresholdsFor(deps, t.name)))
    } catch (err) {
      if (!(err instanceof WinglineError)) throw err
      deps.warn(`团队 ${t.name} 的卡住任务扫描失败：${err.message}`)
    }
  }
  return items
}
