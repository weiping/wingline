import fs from 'node:fs'
import type { HandlerContext, Router } from './http.js'
import { checkParam } from './http.js'
import { WinglineError } from '../errors.js'
import { ps, type PsRow } from '../commands/ps.js'
import { dispatcherHealth } from '../commands/dispatcher/lifecycle.js'
import { attention, dispatcherStatus, pendingCount } from '../commands/dispatcher/attention.js'
import { signalSummary } from '../commands/dispatcher/signal-summary.js'
import { listTasks, showTask } from '../commands/task/query.js'
import { listStale, type TaskRow } from '../commands/task/query.js'
import { readTimeline } from '../commands/log.js'
import { postAddress } from '../commands/deps.js'
import { plainText } from '../view/plain-text.js'
import { draftPathOf } from '../spec/draft.js'
import type { FrozenRow, PatrolStateRow, PostRow, TeamRow } from '../registry/registry.js'
import type { TimelineEvent } from '../commands/log.js'

export interface PostDetail {
  address: string
  row: PsRow
  sessionId: string | null
  currentTask: TaskRow | null
  queued: TaskRow[]
  signals: Array<PatrolStateRow & { summary: string | null }>
  frozen: FrozenRow | null
  hushedUntil: string | null
  events: TimelineEvent[]
  preview: string[]
}

/** 总览摘要：未启动团队（runId === null）不碰 Orca——ps() 的 preflight 会抛错，直接给注册表口径（spec 3.3.4）。 */
async function teamSummary(ctx: HandlerContext, row: TeamRow) {
  const base = { name: row.name, status: row.status, hasDraft: fs.existsSync(draftPathOf(row.specPath)) }
  const dispatcher = dispatcherHealth(ctx.deps, row.name).state
  if (row.runId === null) {
    return { ...base, postsCount: ctx.deps.registry.listPosts(row.name).length, dispatcher, attentionCount: 0 }
  }
  const posts = await ps(ctx.deps, { team: row.name })
  const att = await attention(ctx.deps, row.name)
  return { ...base, postsCount: posts.length, dispatcher, attentionCount: pendingCount(att) }
}

/** 未启动 / Orca 不可达时的离线岗位：全部字段来自注册表，handle 一律为 null（spec 3.3.4）。 */
function offlinePosts(posts: PostRow[]): Array<PsRow & { sessionId: string | null }> {
  return posts.map((p) => ({
    address: p.address, agent: p.agent, status: 'offline', handle: null, worktree: p.worktree, isLead: p.isLead, sessionId: p.sessionId,
  }))
}

function registerTeamRoutes(r: Router): void {
  // GET /api/teams
  r.get('/api/teams', async (ctx: HandlerContext) => {
    const rows = ctx.deps.registry.listTeams()
    return { teams: await Promise.all(rows.map((row) => teamSummary(ctx, row))) }
  })

  // GET /api/teams/:team
  r.get('/api/teams/:team', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    const { registry } = ctx.deps
    const row = registry.getTeam(team)
    if (!row) throw new WinglineError('input', 'team_unknown', `没有团队 ${team}`, { hint: '先执行 wl up <team.yaml>' })
    const base = { team, runId: row.runId, status: row.status, specPath: row.specPath, hasDraft: fs.existsSync(draftPathOf(row.specPath)) }
    // 从未启动：不调 ps()/dispatcherStatus()，Orca 一次都不碰（spec 3.3.4）
    if (row.runId === null) {
      return {
        ...base, neverStarted: true,
        dispatcher: { health: { state: 'never' }, frozen: 0, hushed: 0, attentionItems: 0 },
        posts: offlinePosts(registry.listPosts(team)),
      }
    }
    let posts: Array<PsRow & { sessionId: string | null }>
    let orcaUnavailable: string | undefined
    try {
      posts = (await ps(ctx.deps, { team })).map((p) => ({ ...p, sessionId: registry.getPost(p.address)?.sessionId ?? null }))
    } catch (err) {
      // Orca 不可达：降级为离线岗位列表并附原因，其余照常返回
      if (!(err instanceof WinglineError) || err.kind !== 'orca') throw err
      orcaUnavailable = err.message
      posts = offlinePosts(registry.listPosts(team))
    }
    return { ...base, ...(orcaUnavailable !== undefined ? { orcaUnavailable } : {}), dispatcher: await dispatcherStatus(ctx.deps, team), posts }
  })

  // GET /api/teams/:team/attention
  r.get('/api/teams/:team/attention', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    return await attention(ctx.deps, team)
  })
}

function registerTaskRoutes(r: Router): void {
  // GET /api/teams/:team/tasks
  r.get('/api/teams/:team/tasks', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    const status = ctx.query.get('status') ?? undefined
    const tags = ctx.query.get('tags')?.split(',').filter(Boolean) ?? undefined
    const isStale = ctx.query.get('stale') === 'true'
    if (isStale) {
      const staleList = await listStale(ctx.deps, team)
      return { tasks: staleList }
    }
    return { tasks: await listTasks(ctx.deps, { team, status, tags }) }
  })

  // GET /api/teams/:team/tasks/:id
  r.get('/api/teams/:team/tasks/:id', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const id = ctx.params.id!
    checkParam('team', team)
    checkParam('id', id)
    return await showTask(ctx.deps, { id, history: true })
  })
}

// 终端 preview：失败或无 handle 时静默降级为空数组
async function loadPostPreview(ctx: HandlerContext, pRow: PsRow): Promise<string[]> {
  let preview: string[] = []
  if (pRow.handle) {
    try {
      const view = await ctx.deps.orca.terminalShow({ handle: pRow.handle })
      if (view.preview) {
        const cleaned = plainText(view.preview).split('\n')
        preview = cleaned.slice(-40)
      }
    } catch {}
  }
  return preview
}

async function buildPostDetail(
  ctx: HandlerContext,
  team: string,
  address: string,
  pRow: PsRow,
): Promise<PostDetail> {
  const dbRow = ctx.deps.registry.getPost(address)
  const sessionId = dbRow?.sessionId ?? null

  // 当前任务与排队任务
  const allTasks = await listTasks(ctx.deps, { team })
  const currentTask = allTasks.find((t) => t.claimedBy === address && t.status === 'dispatched') ?? null
  const queued = allTasks.filter((t) => t.claimedBy === address && t.status === 'ready')

  // 只列这个岗位当前在处理的信号（已清除的、只是观察的 level 0 不算）；listPatrolState 的参数是团队名，不是岗位地址
  const signals = ctx.deps.registry.listPatrolState(team)
    .filter((s) => s.post === address && !s.clearedAt && s.level >= 1)
    .map((s) => ({ ...s, summary: signalSummary(s) }))
  const frozen = ctx.deps.registry.getFrozen(address)
  const hushedUntil = ctx.deps.registry.hushedUntil(address)
  const logRes = await readTimeline(ctx.deps, { team, post: address, limit: 50 })

  // 终端 preview
  const preview = await loadPostPreview(ctx, pRow)

  const detail: PostDetail = {
    address,
    row: pRow,
    sessionId,
    currentTask,
    queued,
    signals,
    frozen,
    hushedUntil,
    events: logRes.events,
    preview,
  }
  return detail
}

function registerPostRoutes(r: Router): void {
  // GET /api/teams/:team/posts/:post
  r.get('/api/teams/:team/posts/:post', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const post = ctx.params.post!
    checkParam('team', team)
    checkParam('post', post)
    const address = postAddress(post, team)

    const posts = await ps(ctx.deps, { team })
    const pRow = posts.find((p) => p.address === address)
    if (!pRow) {
      throw new WinglineError('input', 'invalid_param', `岗位 ${address} 不存在`)
    }
    return await buildPostDetail(ctx, team, address, pRow)
  })
}

function registerLogRoute(r: Router): void {
  // GET /api/teams/:team/log
  r.get('/api/teams/:team/log', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    const task = ctx.query.get('task') ?? undefined
    const post = ctx.query.get('post') ?? undefined
    const since = ctx.query.get('since') ?? undefined
    const source = (ctx.query.get('source') as any) ?? undefined
    // 与 wl log 的 --limit 同一口径：非正整数按用法错报，而不是 NaN 静默读空
    const limitStr = ctx.query.get('limit')
    let limit: number | undefined
    if (limitStr !== null) {
      limit = Number(limitStr)
      if (!(Number.isInteger(limit) && limit >= 1)) {
        throw new WinglineError('input', 'limit_invalid', `limit ${limitStr} 无效：应为正整数`)
      }
    }

    return await readTimeline(ctx.deps, { team, task, post, since, source, limit })
  })
}

export function registerReadRoutes(r: Router): void {
  registerTeamRoutes(r)
  registerTaskRoutes(r)
  registerPostRoutes(r)
  registerLogRoute(r)
}
