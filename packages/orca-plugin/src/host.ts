// 组装 wingline-core 需要的依赖：本地账本 + Orca 客户端。
// 与 wl CLI 用同一套 core 函数与同一条审计链；插件只是另一条入口。
import fs from 'node:fs'
import path from 'node:path'

import {
  attention,
  auditedCommands,
  auditedWriteCommands,
  coreAuditTable,
  createCallLog,
  createOrcaClient,
  createOrcaRunner,
  listTasks,
  plainText,
  ps,
  readTimeline,
  Registry,
  signalSummary,
  createSpecFacade,
  initTeamCmd,
  type AttentionReport,
  type PsRow,
  type SpecForEdit,
  type TaskRow,
  type TimelineEvent,
  showTask,
  resolveOrcaExecutable,
  winglineHome,
  type CommandDeps
} from '@weiping/wingline-core'

function which(name: string, env: NodeJS.ProcessEnv): string | null {
  const pathVar = env.PATH ?? ''
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        // 继续找下一个
      }
    }
  }
  return null
}

/** 一次性构造 deps；worker 生命周期内复用同一份。 */
export function createDeps(env: NodeJS.ProcessEnv = process.env): CommandDeps {
  const home = winglineHome(env)
  const exe = resolveOrcaExecutable({ env, platform: process.platform, which: (n) => which(n, env) })
  const runner = createOrcaRunner(exe, createCallLog(path.join(home, 'logs')))
  return {
    orca: createOrcaClient(runner),
    registry: Registry.open(path.join(home, 'state.db')),
    warn: (msg: string) => console.warn('[wingline]', msg),
    verifiedOrca: '>=1.4.214 <1.5.0',
    multilineSafe: !exe.viaCmd,
    home,
    orcaPath: exe.cmdPath ?? exe.file,
    env,
    now: () => new Date(),
    monotonic: () => performance.now()
  }
}

export function teamSummaries(deps: CommandDeps): Array<{
  name: string
  status: 'up' | 'stopped'
  runId: string | null
  posts: number
  specPath: string
}> {
  return deps.registry.listTeams().map((row) => ({
    name: row.name,
    status: row.status,
    runId: row.runId,
    posts: deps.registry.listPosts(row.name).length,
    specPath: row.specPath
  }))
}

export interface PostDto {
  address: string
  agent: string
  status: PsRow['status']
  handle: string | null
  isLead: boolean
}

/** 岗位列表：走 core 的 ps()（同一套口径：live / uncertain / offline 与 handle 解析）。 */
export async function postDtos(deps: CommandDeps, team: string): Promise<PostDto[]> {
  const rows = await ps(deps, { team })
  return rows.map((r) => ({
    address: r.address,
    agent: r.agent,
    status: r.status,
    handle: r.handle,
    isLead: r.isLead
  }))
}

/** 把 Orca 窗口切到某个岗位的终端。岗位不在线（终端已退出）时给出原因，不碰过期 handle。 */
export async function openPostTerminal(
  deps: CommandDeps,
  address: string
): Promise<{ navigated: boolean; handle: string | null; reason: string | null }> {
  const team = address.split('@')[1]
  if (!team) return { navigated: false, handle: null, reason: '岗位地址格式不对' }
  // ps() 会把当前活着的终端 handle 写回注册表；以它的实时状态为准，
  // 不直接信注册表里的 handle——终端退出后那个 handle 是过期残留（switch 会报 terminal_exited）。
  const rows = await ps(deps, { team })
  const post = rows.find((r) => r.address === address)
  if (!post) return { navigated: false, handle: null, reason: '岗位不存在' }
  if (post.status !== 'live' || post.handle === null) {
    return { navigated: false, handle: null, reason: `${address} 不在线（${post.status}），先 wl up 或 wl restore` }
  }
  const res = await deps.orca.terminalSwitch({ handle: post.handle })
  return { navigated: res.navigated, handle: post.handle, reason: null }
}

// ── P1 只读：收件箱与任务看板 ───────────────────────────────────

export interface InboxDto {
  team: string
  pending: number
  dispatcher: { state: string }
  frozen: Array<{ post: string; reason: string; frozenAt: string }>
  signals: Array<{ post: string; signal: string; level: number; summary: string | null; since: string | null }>
  questions: Array<{ messageId: string; asker: string; body: string; options: string[]; relayedAt: string }>
  stale: Array<{ taskId: string; title: string; reason: string; owner: string | null; command: string }>
  warnings: string[]
  unavailable: string[]
}

/** 收件箱：走 core 的 attention()（CLI / 控制台 / TUI 同一口径）。 */
export async function inboxDto(deps: CommandDeps, team: string): Promise<InboxDto> {
  const r: AttentionReport = await attention(deps, team)
  return {
    team: r.team,
    pending: r.frozen.length + r.signals.length + r.questions.length + r.stale.length + r.warnings.length,
    dispatcher: { state: r.dispatcher.state },
    frozen: r.frozen.map((f) => ({ post: f.post, reason: f.reason, frozenAt: f.frozenAt })),
    signals: r.signals.map((s) => ({
      post: s.post,
      signal: s.signal,
      level: s.level,
      summary: s.summary,
      since: s.since
    })),
    questions: r.questions.map((q) => ({
      messageId: q.messageId,
      asker: q.asker,
      body: q.body,
      options: q.options,
      relayedAt: q.relayedAt
    })),
    stale: r.stale.map((s) => ({ taskId: s.taskId, title: s.title, reason: s.reason, owner: s.owner, command: s.command })),
    warnings: r.warnings,
    unavailable: r.unavailable
  }
}

export interface TaskDto {
  id: string
  status: string
  title: string
  kind: string
  tags: string[]
  claimedBy: string | null
  epoch: number
  gateFailures: number
  readySince: string | null
  dispatchedAt: string | null
}

/** 任务看板：走 core 的 listTasks()（同 CLI `wl task list`）。 */
export async function taskDtos(deps: CommandDeps, team: string): Promise<TaskDto[]> {
  const rows: TaskRow[] = await listTasks(deps, { team })
  return rows.map((t) => ({
    id: t.id,
    status: t.status,
    title: t.title,
    kind: t.kind,
    tags: t.tags,
    claimedBy: t.claimedBy,
    epoch: t.epoch,
    gateFailures: t.gateFailures,
    readySince: t.readySince,
    dispatchedAt: t.dispatchedAt
  }))
}

// ── 岗位详情（时间线 + 任务历史） ───────────────────────────────

export interface PostDetailDto {
  address: string
  status: PsRow['status']
  isLead: boolean
  handle: string | null
  sessionId: string | null
  currentTask: { id: string; title: string; status: string } | null
  queued: Array<{ id: string; title: string; status: string }>
  signals: Array<{ signal: string; level: number; summary: string | null; since: string | null }>
  frozen: { reason: string; frozenAt: string } | null
  hushedUntil: string | null
  events: TimelineEventDto[]
}

export interface TimelineEventDto {
  id: string
  at: string
  source: string
  actor: string
  action: string
  target: string | null
  outcome: string | null
}

export function timelineDto(events: TimelineEvent[]): TimelineEventDto[] {
  return events.map((e) => ({
    id: e.id,
    at: e.at,
    source: e.source,
    actor: e.actor,
    action: e.action,
    target: e.target,
    outcome: e.outcome
  }))
}

/**
 * 岗位详情：与控制台岗位详情页同一口径（当前任务、排队、信号、冻结、静音、
 * 按岗位过滤的时间线 50 条）。终端预览另有 post.preview。
 */
export async function postDetailDto(deps: CommandDeps, team: string, address: string): Promise<PostDetailDto> {
  const rows = await ps(deps, { team })
  const pRow = rows.find((p) => p.address === address)
  if (!pRow) throw new Error(`岗位 ${address} 不存在`)

  const allTasks: TaskRow[] = await listTasks(deps, { team })
  const currentTask = allTasks.find((t) => t.claimedBy === address && t.status === 'dispatched') ?? null
  const queued = allTasks.filter((t) => t.claimedBy === address && t.status === 'ready')

  const signals = deps.registry
    .listPatrolState(team)
    .filter((s) => s.post === address && !s.clearedAt && s.level >= 1)
    .map((s) => ({ signal: s.signal, level: s.level, summary: signalSummary(s), since: s.since }))
  const frozen = deps.registry.getFrozen(address)
  const hushedUntil = deps.registry.hushedUntil(address)
  const logRes = await readTimeline(deps, { team, post: address, limit: 50 })

  return {
    address,
    status: pRow.status,
    isLead: pRow.isLead,
    handle: pRow.handle,
    sessionId: deps.registry.getPost(address)?.sessionId ?? null,
    currentTask: currentTask && { id: currentTask.id, title: currentTask.title, status: currentTask.status },
    queued: queued.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    signals,
    frozen: frozen && { reason: frozen.reason, frozenAt: frozen.frozenAt },
    hushedUntil,
    events: timelineDto(logRes.events)
  }
}

export interface TaskDetailDto {
  id: string
  team: string
  status: string
  title: string
  kind: string
  tags: string[]
  plan: string | null
  claimedBy: string | null
  epoch: number
  gateFailures: number
  outcome: string | null
  reportedBy: string | null
  gateId: string | null
  gateOutput: string | null
  result: string | null
  history: Array<{ at: string; actor: string; action: string; detail: string | null }>
}

/** 任务详情：与 `wl task show --history` 同一口径（showTask + history）。 */
export async function taskDetailDto(deps: CommandDeps, id: string): Promise<TaskDetailDto> {
  const t = await showTask(deps, { id, history: true })
  const team = deps.registry.getTaskExt(t.id)?.team ?? '-'
  return {
    id: t.id,
    team,
    status: t.status,
    title: t.title,
    kind: t.kind,
    tags: t.tags,
    plan: t.plan,
    claimedBy: t.claimedBy,
    epoch: t.epoch,
    gateFailures: t.gateFailures,
    outcome: t.outcome,
    reportedBy: t.reportedBy,
    gateId: t.gateId ?? null,
    gateOutput: t.gateOutput ?? null,
    result: t.result,
    history: (t.history ?? []).map((h) => ({ at: h.at, actor: h.actor, action: h.action, detail: h.detail }))
  }
}

// ── 写操作（审计走 core 的同一张表，actor=human） ─────────────────

/**
 * 插件的写命令：与控制台（`console:`）、TUI（`tui:`）共用同一张审计表，
 * 只是前缀不同（`plugin:`），执行者一律 human。
 */
export function pluginWrites() {
  return auditedWriteCommands('plugin:')
}

/** 回答岗位提问。 */
export async function replyQuestion(
  deps: CommandDeps,
  a: { team: string; messageId: string; body: string }
): Promise<{ messageId: string; duplicate: boolean }> {
  return pluginWrites().dispatcherReply(deps, a)
}

/** 冻结岗位。 */
export async function freezePost(deps: CommandDeps, a: { address: string; reason: string }): Promise<void> {
  return pluginWrites().freezePostCmd(deps, a)
}

/** 解冻岗位。 */
export async function unfreezePost(
  deps: CommandDeps,
  a: { address: string }
): Promise<{ skipped: Array<{ taskId: string; command: string }> }> {
  return pluginWrites().unfreezePostCmd(deps, a)
}

/** 拉起岗位：走 core 的 up（幂等，活终端复用、死终端重建）。 */
export async function upTeam(
  deps: CommandDeps,
  a: { team: string; draft?: boolean; newRun?: boolean; adoptRun?: string }
): Promise<unknown> {
  return pluginWrites().up(deps, a)
}

/** 认领任务（以岗位身份）。 */
export async function claimTask(deps: CommandDeps, a: { id: string; as: string }): Promise<void> {
  return pluginWrites().claimTask(deps, a)
}

/** 完成任务（以岗位身份）。 */
export async function doneTask(deps: CommandDeps, a: { id: string; as: string }): Promise<unknown> {
  return pluginWrites().doneTask(deps, a)
}

// ── 岗位终端预览 ────────────────────────────────────────────

export interface PreviewDto {
  address: string
  handle: string | null
  lines: string[]
  truncated: boolean
  error?: string
}

/**
 * 岗位终端最后若干行：先试渲染后的屏幕（source=screen），拿不到就回退到 preview 文本。
 * 与控制台岗位详情页的 40 行预览同一口径。
 */
export async function postPreview(deps: CommandDeps, address: string, lines = 40): Promise<PreviewDto> {
  const team = address.split('@')[1]
  if (!team) return { address, handle: null, lines: [], truncated: false, error: '岗位地址格式不对' }
  await ps(deps, { team })
  const post = deps.registry.getPost(address)
  if (!post?.handle) return { address, handle: null, lines: [], truncated: false, error: '岗位没有在线终端' }
  try {
    try {
      const screen = await deps.orca.terminalRead({ handle: post.handle, lines })
      const body = plainText(screen.text).split('\n').slice(-lines)
      return { address, handle: post.handle, lines: body, truncated: screen.rows < lines }
    } catch {
      const view = await deps.orca.terminalShow({ handle: post.handle })
      const body = plainText(view.preview).split('\n').slice(-lines)
      return { address, handle: post.handle, lines: body, truncated: false }
    }
  } catch (err) {
    return { address, handle: post.handle, lines: [], truncated: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 与 CLI 同一张审计表、同一 actor（human），所以插件写出来的审计行和命令行写的是同一种东西。
 * 表在 core（core/src/audit-table.ts），CLI、控制台与插件共用。
 */
export function auditedInit() {
  return auditedCommands({ init: initTeamCmd }, coreAuditTable(), { actor: 'human' })
}

export type SpecForEditDto = Pick<SpecForEdit, 'specPath' | 'yaml' | 'hash' | 'running'> & {
  hasDraft: boolean
  docKeys: string[]
}

export function specForEditDto(view: SpecForEdit): SpecForEditDto {
  return {
    specPath: view.specPath,
    yaml: view.yaml,
    hash: view.hash,
    running: view.running,
    hasDraft: view.draft !== null,
    docKeys: Object.keys(view.files)
  }
}
