import { WinglineError } from '../../errors.js'
import { ORCA_WORKTREE_SUPPORT } from '../../orca/client.js'
import type { WorkspaceStatus } from '../../orca/types.js'
import type { DoneVerdictRow, PatrolSignal, PostRow, TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import { plainText } from '../../view/plain-text.js'
import type { CommandDeps } from '../deps.js'
import { fetchTasks, type TaskRow } from '../task/query.js'
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
  const full = rows.map((r) => r.line).join('\n')
  if (full.length <= maxLen) return { status, comment: full }
  let end = maxLen - 1
  const last = full.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1 // 别把代理对从中间切开
  return { status, comment: `${full.slice(0, end)}…` }
}

/**
 * 岗位地址 → worktree 绝对路径。`path:` 直接去前缀；其余选择器（如 current）每轮每个选择器只问一次 Orca。
 * 解析失败的岗位不在结果里（本轮跳过，不计入同步失败）。
 */
export async function resolveWorktrees(deps: CommandDeps, posts: PostRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const resolved = new Map<string, string | null>()
  for (const p of posts) {
    if (p.worktree.startsWith('path:')) {
      out.set(p.address, p.worktree.slice('path:'.length))
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
    const path = resolved.get(p.worktree)
    if (path) out.set(p.address, path)
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
  return summarize(rows, Math.min(COMMENT_MAX, ORCA_WORKTREE_SUPPORT.commentMax ?? COMMENT_MAX))
}

/** 只在值变化时写；失败记 fail_count 与事件，连续 MAX_FAILS 次后停手（调度员重启时清零）。 */
async function writeGroup(deps: CommandDeps, ctx: Ctx, worktree: string, want: { status?: WorkspaceStatus; comment?: string }): Promise<void> {
  const prev = deps.registry.getOrcaSync(worktree)
  if ((prev?.failCount ?? 0) >= MAX_FAILS) return
  const change = {
    ...(want.status !== undefined && want.status !== prev?.status ? { status: want.status } : {}),
    ...(want.comment !== undefined && want.comment !== prev?.comment ? { comment: want.comment } : {}),
  }
  if (Object.keys(change).length === 0) return
  const team = ctx.team.name
  try {
    await deps.orca.worktreeSet({ worktree: `path:${worktree}`, ...change })
    deps.registry.putOrcaSync({
      worktree, team, status: change.status ?? prev?.status ?? null, comment: change.comment ?? prev?.comment ?? null,
      writtenAt: deps.now().toISOString(), failCount: 0,
    })
  } catch (err) {
    deps.registry.putOrcaSync({
      worktree, team, status: prev?.status ?? null, comment: prev?.comment ?? null, writtenAt: prev?.writtenAt ?? null, failCount: (prev?.failCount ?? 0) + 1,
    })
    deps.registry.appendPatrolEvent({ team, action: 'orca_sync', outcome: 'failed', detail: { worktree, error: err instanceof WinglineError ? err.code : 'error' } })
  }
}

async function syncGroups(deps: CommandDeps, ctx: Ctx, tasks: TaskRow[], on: Switches, only?: string): Promise<void> {
  const paths = await resolveWorktrees(deps, deps.registry.listPosts(ctx.team.name))
  for (const [worktree, addresses] of groupByWorktree(ctx, paths)) {
    if (only !== undefined && !addresses.includes(only)) continue
    const c = composeGroup(deps, ctx, tasks, addresses)
    await writeGroup(deps, ctx, worktree, { ...(on.status ? { status: c.status } : {}), ...(on.comment ? { comment: c.comment } : {}) })
  }
}

function recordFailure(deps: CommandDeps, team: string, err: unknown): void {
  deps.registry.appendPatrolEvent({ team, action: 'orca_sync', outcome: `failed:${err instanceof WinglineError ? err.code : 'error'}` })
}

/**
 * 每次巡查扫描末尾把岗位所在 worktree 的工作区状态与卡片注释同步到 Orca（展示用，永不抛出）。
 * observeOnly（重启后第一轮）不写，也不动 orca_sync。
 */
export async function syncOrca(deps: CommandDeps, ctx: Ctx, snap: ScanSnapshot, o: { observeOnly: boolean }): Promise<void> {
  const on = switchesOf(ctx.spec)
  if (o.observeOnly || (!on.status && !on.comment)) return
  try {
    await syncGroups(deps, ctx, snap.tasks, on)
  } catch (err) {
    recordFailure(deps, ctx.team.name, err)
  }
}

/** 通知 / 恢复之后重新算该岗位所在 worktree 并按同一规则写入（原来的 worktreeComment 路径）。永不抛出。 */
export async function syncWorktreeForPost(deps: CommandDeps, ctx: Ctx, post: string): Promise<void> {
  const on = switchesOf(ctx.spec)
  if (!on.status && !on.comment) return
  try {
    await syncGroups(deps, ctx, await fetchTasks(deps, ctx.team.name), on, post)
  } catch (err) {
    recordFailure(deps, ctx.team.name, err)
  }
}
