import path from 'node:path'
import { WinglineError } from '../../errors.js'
import { ORCA_WORKTREE_SUPPORT } from '../../orca/client.js'
import type { WorkspaceStatus } from '../../orca/types.js'
import type { DoneVerdictRow, OrcaSyncRow, PatrolSignal, PostRow, TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import { plainText } from '../../view/plain-text.js'
import type { CommandDeps } from '../deps.js'
import { fetchTasks, type TaskRow } from '../task/query.js'
import { dispatcherHealth } from './lifecycle.js'
import type { ScanSnapshot } from './signals.js'

type Ctx = { team: TeamRow; spec: TeamSpec }
type VerdictOf = (taskId: string, epoch: number) => DoneVerdictRow | null

const COMMENT_MAX = 500
const MAX_FAILS = 3
const PRIORITY: Record<WorkspaceStatus, number> = { 'in-review': 3, 'in-progress': 2, todo: 1, completed: 0 }

export const SIGNAL_LABEL: Record<PatrolSignal, string> = {
  no_progress: '无进展',
  waiting_approval: '等待批准',
  waiting_answer: '等待回答',
  dead_assignee: '执行者失联',
  owner_idle: '负责人空闲',
  overdue: '超时',
  done_unfinished: '未做完',
  bypassed: '绕过流程',
  call_uncertain: '调用结果不确定',
  gate_streak: 'gate 连续失败',
}

const TASK_LABEL: Partial<Record<TaskRow['status'], string>> = { dispatched: '进行中', ready: '排队', blocked: '阻塞' }

const isOpen = (t: TaskRow) => t.status !== 'completed' && t.status !== 'failed'

/** 父任务这一轮的结束记录是“该岗位提交审查”：已结束、出自该岗位、closure.kind 为 sent_for_review。解析失败算不满足。 */
function sentForReviewBy(v: DoneVerdictRow | null, address: string): boolean {
  if (!v?.finishedAt || v.post !== address || !v.result) return false
  try {
    return (JSON.parse(v.result) as { closure?: { kind?: string } }).closure?.kind === 'sent_for_review'
  } catch {
    return false
  }
}

function inReview(address: string, tasks: TaskRow[], verdictOf: VerdictOf): boolean {
  return tasks.some((review) => {
    if (review.kind !== 'review' || !isOpen(review) || review.parentId === null) return false
    const parent = tasks.find((t) => t.id === review.parentId)
    return parent !== undefined && sentForReviewBy(verdictOf(parent.id, parent.epoch), address)
  })
}

/** spec 第 6.2 节表格，自上而下取第一条满足的。 */
export function postWorkspaceStatus(p: { address: string; handle: string | null }, tasks: TaskRow[], verdictOf: VerdictOf): WorkspaceStatus {
  if (p.handle !== null && tasks.some((t) => t.status === 'dispatched' && t.assigneeHandle === p.handle)) return 'in-progress'
  if (inReview(p.address, tasks, verdictOf)) return 'in-review'
  if (tasks.some((t) => t.status === 'ready' && t.claimedBy === p.address)) return 'todo'
  return 'completed'
}

/** 注释里这个岗位那一行展示的任务：进行中的优先，其次排队、阻塞。 */
function currentTask(p: { address: string; handle: string | null }, tasks: TaskRow[]): TaskRow | null {
  return (
    (p.handle === null ? undefined : tasks.find((t) => t.status === 'dispatched' && t.assigneeHandle === p.handle)) ??
    tasks.find((t) => t.status === 'ready' && t.claimedBy === p.address) ??
    tasks.find((t) => t.status === 'blocked' && t.claimedBy === p.address) ??
    null
  )
}

const flat = (s: string) => plainText(s).replace(/[\r\n\t]+/g, ' ')

/** 一个岗位在注释里的一行；任务标题是外部文本，先剥控制字符、折成一行。 */
export function postLine(id: string, task: TaskRow | null, flags: { signal: PatrolSignal | null; frozen: boolean }): string {
  const head = task ? `${id}：${flat(task.title)}（${TASK_LABEL[task.status] ?? task.status}，第 ${task.epoch + 1} 轮）` : `${id}：空闲`
  return `${head}${flags.signal ? ` ⚠ ${SIGNAL_LABEL[flags.signal]}` : ''}${flags.frozen ? ' ❄ 已冻结' : ''}`
}

/** 多个岗位共用一个 worktree：状态取优先级最高的，注释每岗位一行；超长截断并以 … 结尾（… 计入长度）。 */
export function summarize(rows: Array<{ status: WorkspaceStatus; line: string }>, maxLen: number): { status: WorkspaceStatus; comment: string } {
  const status = rows.reduce<WorkspaceStatus>((best, r) => (PRIORITY[r.status] > PRIORITY[best] ? r.status : best), 'completed')
  return { status, comment: cut(rows.map((r) => r.line).join('\n'), maxLen) }
}

/** 超长截断并以 … 结尾（… 计入长度），不把代理对从中间切开。 */
function cut(full: string, maxLen: number): string {
  if (full.length <= maxLen) return full
  let end = maxLen - 1
  const last = full.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return `${full.slice(0, end)}…`
}

const commentLimit = () => Math.min(COMMENT_MAX, ORCA_WORKTREE_SUPPORT.commentMax ?? COMMENT_MAX)

/**
 * Orca 里一个 worktree 只有一个状态、一条注释，可是同一个 worktree 上可能有几个团队各自在同步。
 * 只看自己的话，后写的会盖掉先写的（忙的团队被空闲的盖成 completed）。所以写入时把其他团队最近一次算出的值合并进来：
 * 只算“团队登记为 up 且调度员正在运行”的团队，已停止或调度员不在的团队不参与，免得旧值一直顶着。
 */
function peersOf(deps: CommandDeps, ctx: Ctx, worktree: string): OrcaSyncRow[] {
  return deps.registry
    .listOrcaSyncOf(worktree)
    .filter((r) => r.team !== ctx.team.name && deps.registry.getTeam(r.team)?.status === 'up' && dispatcherHealth(deps, r.team).state === 'running')
}

/** 状态取各团队里优先级最高的。 */
function mergedStatus(own: WorkspaceStatus, peers: OrcaSyncRow[]): WorkspaceStatus {
  return [own, ...peers.map((p) => p.status as WorkspaceStatus | null)].reduce<WorkspaceStatus>((best, s) => (s && PRIORITY[s] > PRIORITY[best] ? s : best), own)
}

/** 注释：只有自己时原样；有别的团队时每行加 `[团队名] ` 前缀，按团队名排序，各方算出同一份结果。 */
function mergedComment(team: string, own: string, peers: OrcaSyncRow[]): string {
  const others = peers.filter((p) => p.comment)
  if (others.length === 0) return own
  const all = [{ team, comment: own }, ...others.map((p) => ({ team: p.team, comment: p.comment! }))].sort((a, b) => (a.team < b.team ? -1 : 1))
  return cut(all.flatMap((t) => t.comment.split('\n').map((l) => `[${t.team}] ${l}`)).join('\n'), commentLimit())
}

/**
 * 岗位地址 → worktree 绝对路径。`path:` 直接去前缀；其余选择器（如 current）每轮每个选择器只问一次 Orca。
 * 解析失败的岗位不在结果里（本轮跳过，不计入同步失败）。
 */
/** `/w/a/`、`/w/./a`、`/w/a` 是同一个 worktree：归组与 orca_sync 的键都用归一后的路径。 */
function tidy(p: string): string {
  const n = path.normalize(p)
  return n.length > 1 && n.endsWith(path.sep) ? n.slice(0, -1) : n
}

export async function resolveWorktrees(deps: CommandDeps, posts: PostRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const resolved = new Map<string, string | null>()
  for (const p of posts) {
    if (p.worktree.startsWith('path:')) {
      out.set(p.address, tidy(p.worktree.slice('path:'.length)))
      continue
    }
    if (!resolved.has(p.worktree)) {
      try {
        resolved.set(p.worktree, (await deps.orca.worktreeShow({ worktree: p.worktree })).path)
      } catch (err) {
        if (!(err instanceof WinglineError)) throw err
        resolved.set(p.worktree, null)
      }
    }
    const found = resolved.get(p.worktree)
    if (found) out.set(p.address, tidy(found))
  }
  return out
}

interface Switches {
  status: boolean
  comment: boolean
}

function switchesOf(spec: TeamSpec): Switches {
  return {
    status: spec.patrol.workspaceStatus && ORCA_WORKTREE_SUPPORT.workspaceStatus,
    comment: spec.patrol.worktreeComment && ORCA_WORKTREE_SUPPORT.comment,
  }
}

/** worktree 绝对路径 → 其上的岗位地址，按岗位在规格里的顺序。 */
function groupByWorktree(ctx: Ctx, paths: Map<string, string>): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const p of ctx.spec.posts) {
    const address = `${p.id}@${ctx.team.name}`
    const path = paths.get(address)
    if (path !== undefined) groups.set(path, [...(groups.get(path) ?? []), address])
  }
  return groups
}

function composeGroup(deps: CommandDeps, ctx: Ctx, tasks: TaskRow[], addresses: string[]): { status: WorkspaceStatus; comment: string } {
  const signals = deps.registry.listPatrolState(ctx.team.name).filter((s) => !s.clearedAt && s.level >= 1)
  const verdictOf: VerdictOf = (id, epoch) => deps.registry.getVerdict(id, epoch)
  const rows = addresses.map((address) => {
    const p = { address, handle: deps.registry.getPost(address)?.handle ?? null }
    const top = signals.filter((s) => s.post === address).sort((a, b) => b.level - a.level)[0]
    return {
      status: postWorkspaceStatus(p, tasks, verdictOf),
      line: postLine(address.split('@')[0]!, currentTask(p, tasks), { signal: top?.signal ?? null, frozen: deps.registry.getFrozen(address) !== null }),
    }
  })
  return summarize(rows, commentLimit())
}

/** 只在值变化时写；失败记 fail_count 与事件，连续 MAX_FAILS 次后停手（调度员重启时清零）。 */
/** 一轮巡查里已经写失败的 worktree：同一轮不再重试，失败只计一次（下一轮用新的 round 再试）。 */
export interface SyncRound {
  failed: Set<string>
}

async function writeGroup(
  deps: CommandDeps, ctx: Ctx, worktree: string, want: { status?: WorkspaceStatus; comment?: string }, round?: SyncRound,
): Promise<void> {
  if (round?.failed.has(worktree)) return
  const prev = deps.registry.getOrcaSync(worktree, ctx.team.name)
  if ((prev?.failCount ?? 0) >= MAX_FAILS) return
  const change = {
    ...(want.status !== undefined && want.status !== prev?.status ? { status: want.status } : {}),
    ...(want.comment !== undefined && want.comment !== prev?.comment ? { comment: want.comment } : {}),
  }
  if (Object.keys(change).length === 0) return
  const team = ctx.team.name
  // 记录里存的是“本团队自己算出的值”（用来判断有没有变化）；写给 Orca 的是并上其他团队之后的值
  const peers = peersOf(deps, ctx, worktree)
  const send = {
    ...(change.status !== undefined ? { status: mergedStatus(change.status, peers) } : {}),
    ...(change.comment !== undefined ? { comment: mergedComment(team, change.comment, peers) } : {}),
  }
  try {
    await deps.orca.worktreeSet({ worktree: `path:${worktree}`, ...send })
    deps.registry.putOrcaSync({
      worktree, team, status: change.status ?? prev?.status ?? null, comment: change.comment ?? prev?.comment ?? null,
      writtenAt: deps.now().toISOString(), failCount: 0,
    })
  } catch (err) {
    round?.failed.add(worktree)
    deps.registry.putOrcaSync({
      worktree, team, status: prev?.status ?? null, comment: prev?.comment ?? null, writtenAt: prev?.writtenAt ?? null, failCount: (prev?.failCount ?? 0) + 1,
    })
    deps.registry.appendPatrolEvent({ team, action: 'orca_sync', outcome: 'failed', detail: { worktree, error: err instanceof WinglineError ? err.code : 'error' } })
  }
}

async function syncGroups(deps: CommandDeps, ctx: Ctx, tasks: TaskRow[], on: Switches, o: { only?: string; round?: SyncRound }): Promise<void> {
  const paths = await resolveWorktrees(deps, deps.registry.listPosts(ctx.team.name))
  for (const [worktree, addresses] of groupByWorktree(ctx, paths)) {
    if (o.only !== undefined && !addresses.includes(o.only)) continue
    const c = composeGroup(deps, ctx, tasks, addresses)
    await writeGroup(deps, ctx, worktree, { ...(on.status ? { status: c.status } : {}), ...(on.comment ? { comment: c.comment } : {}) }, o.round)
  }
}

function recordFailure(deps: CommandDeps, team: string, err: unknown): void {
  const code = err instanceof WinglineError ? err.code : 'error'
  deps.registry.appendPatrolEvent({ team, action: 'orca_sync', outcome: `failed:${code}`, detail: { error: code } })
}

/**
 * 每次巡查扫描末尾把岗位所在 worktree 的工作区状态与卡片注释同步到 Orca（展示用，永不抛出）。
 * observeOnly（重启后第一轮）不写，也不动 orca_sync。
 */
export async function syncOrca(deps: CommandDeps, ctx: Ctx, snap: ScanSnapshot, o: { observeOnly: boolean; round?: SyncRound }): Promise<void> {
  const on = switchesOf(ctx.spec)
  if (o.observeOnly || (!on.status && !on.comment)) return
  try {
    await syncGroups(deps, ctx, snap.tasks, on, { round: o.round })
  } catch (err) {
    recordFailure(deps, ctx.team.name, err)
  }
}

/** 通知 / 恢复之后重新算该岗位所在 worktree 并按同一规则写入（原来的 worktreeComment 路径）。永不抛出。 */
export async function syncWorktreeForPost(deps: CommandDeps, ctx: Ctx, post: string, round?: SyncRound): Promise<void> {
  const on = switchesOf(ctx.spec)
  if (!on.status && !on.comment) return
  try {
    await syncGroups(deps, ctx, await fetchTasks(deps, ctx.team.name), on, { only: post, round })
  } catch (err) {
    recordFailure(deps, ctx.team.name, err)
  }
}
