// 组装 wingline-core 需要的依赖：本地账本 + Orca 客户端。
// 与 wl CLI 用同一套 core 函数与同一条审计链；插件只是另一条入口。
import fs from 'node:fs'
import path from 'node:path'

import {
  attention,
  auditedCommands,
  coreAuditTable,
  createCallLog,
  createOrcaClient,
  createOrcaRunner,
  listTasks,
  ps,
  Registry,
  createSpecFacade,
  initTeamCmd,
  type AttentionReport,
  type PsRow,
  type SpecForEdit,
  type TaskRow,
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

/** 把 Orca 窗口切到某个岗位的终端；没有存活终端时返回 navigated: false。 */
export async function openPostTerminal(deps: CommandDeps, address: string): Promise<{ navigated: boolean; handle: string | null }> {
  const team = address.split('@')[1]
  if (!team) return { navigated: false, handle: null }
  // 先跑一次 ps()：它会把当前活着的终端 handle 写回注册表。
  await ps(deps, { team })
  const post = deps.registry.getPost(address)
  if (!post?.handle) return { navigated: false, handle: null }
  const res = await deps.orca.terminalSwitch({ handle: post.handle })
  return { navigated: res.navigated, handle: post.handle }
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
