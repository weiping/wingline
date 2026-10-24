import type { HandlerContext, Router } from './http.js'
import { checkParam } from './http.js'
import { ps, type PsRow } from '../commands/ps.js'
import { dispatcherHealth } from '../commands/dispatcher/lifecycle.js'
import { attention, dispatcherStatus } from '../commands/dispatcher/attention.js'
import { signalSummary } from '../commands/dispatcher/signal-summary.js'
import { listTasks, showTask } from '../commands/task/query.js'
import { listStale, type TaskRow } from '../commands/task/query.js'
import { readTimeline } from '../commands/log.js'
import { postAddress } from '../commands/deps.js'
import { plainText } from '../view/plain-text.js'
import type { FrozenRow, PatrolStateRow } from '../registry/registry.js'
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

async function teamSummary(ctx: HandlerContext, name: string) {
  const posts = await ps(ctx.deps, { team: name })
  const disp = dispatcherHealth(ctx.deps, name).state
  const att = await attention(ctx.deps, name)
  const attentionCount = (disp === 'stale' ? 1 : 0) +
    att.frozen.length +
    att.signals.length +
    att.questions.length +
    att.stale.length +
    att.warnings.length
  return {
    name,
    postsCount: posts.length,
    dispatcher: disp,
    attentionCount,
  }
}

function registerTeamRoutes(r: Router): void {
  // GET /api/teams
  r.get('/api/teams', async (ctx: HandlerContext) => {
    const teams = ctx.deps.registry.listTeams().map((t) => t.name)
    const result = await Promise.all(teams.map((name) => teamSummary(ctx, name)))
    return { teams: result }
  })

  // GET /api/teams/:team
  r.get('/api/teams/:team', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    const posts = await ps(ctx.deps, { team })
    const disp = await dispatcherStatus(ctx.deps, team)
    const runId = ctx.deps.registry.getTeam(team)?.runId ?? null
    // 移除 sessionMarker，只留 sessionId
    const cleanPosts = posts.map((p) => {
      const row = ctx.deps.registry.getPost(p.address)
      return {
        ...p,
        sessionId: row?.sessionId ?? null,
      }
    })
    return {
      team,
      runId,
      dispatcher: disp,
      posts: cleanPosts,
    }
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
      throw new (await import('../errors.js')).WinglineError('input', 'invalid_param', `岗位 ${address} 不存在`)
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
    const limitStr = ctx.query.get('limit')
    const limit = limitStr ? parseInt(limitStr, 10) : undefined

    return await readTimeline(ctx.deps, { team, task, post, since, source, limit })
  })
}

export function registerReadRoutes(r: Router): void {
  registerTeamRoutes(r)
  registerTaskRoutes(r)
  registerPostRoutes(r)
  registerLogRoute(r)
}
