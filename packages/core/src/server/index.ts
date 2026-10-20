import http from 'node:http'
import type { AddressInfo } from 'node:net'
import crypto from 'node:crypto'
import type { CommandDeps } from '../commands/deps.js'
import { cachedOrca, type CachedOrca } from '../view/snapshot.js'
import { WinglineError } from '../errors.js'
import { Auth, checkHost, checkWrite, safeEqual, sessionCookie } from './auth.js'
import { assertWebBuilt, SECURITY_HEADERS, serveStatic } from './static.js'
import { checkParam, type Handler, Router, statusOf, writeEnvelope } from './http.js'
import { registerReadRoutes } from './api-read.js'
import { consoleCommands, registerWriteRoutes } from './api-write.js'
import { TeamFeeds } from './sse.js'

type Session = { sid: string; csrf: string }

export * from './auth.js'
export * from './static.js'
export * from './http.js'
export * from './api-read.js'
export * from './api-write.js'
export * from './sse.js'
export * from './control.js'

export interface ConsoleServer {
  port: number
  controlKey: string
  loginUrl(): string
  close(): Promise<void>
}

export async function openTab(deps: CommandDeps, url: string, worktree: string): Promise<'opened' | 'unsupported'> {
  try {
    await deps.orca.tabCreate({ url, worktree })
    return 'opened'
  } catch {
    return 'unsupported'
  }
}

export function consoleWorktree(deps: CommandDeps, override?: string): string {
  if (override) return override
  const teams = deps.registry.listTeams().filter((t) => t.status === 'up')
  for (const t of teams) {
    const posts = deps.registry.listPosts(t.name)
    const lead = posts.find((p) => p.isLead) ?? posts[0]
    if (lead?.worktree) return lead.worktree
  }
  throw new WinglineError('input', 'console_no_worktree', '没有运行中的团队，无法确定工作区', {
    hint: '使用 --worktree <选择器> 指定工作区',
  })
}

function errorEnvelope(err: any): { ok: false; error: Record<string, unknown> } {
  return {
    ok: false,
    error: {
      kind: err?.kind ?? 'internal',
      code: err?.code ?? 'unknown',
      message: err?.message ?? String(err),
      hint: err?.hint,
      retry: err?.hint,
      retryRequest: err?.detail?.retryRequest,
    },
  }
}

function respondError(res: http.ServerResponse, err: unknown): void {
  if (res.destroyed) return
  if (res.headersSent) {
    res.destroy()
  } else {
    writeEnvelope(res, statusOf(err), errorEnvelope(err))
  }
}

async function readBody(req: http.IncomingMessage): Promise<{ body: unknown; tooLarge: boolean }> {
  let received = 0
  const chunks: Buffer[] = []
  let tooLarge = false

  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => {
      received += c.length
      if (received > 64 * 1024) {
        tooLarge = true
      } else {
        chunks.push(c)
      }
    })
    req.on('end', () => resolve())
    req.on('error', reject)
  })

  if (tooLarge) {
    return { body: null, tooLarge: true }
  }

  const rawStr = Buffer.concat(chunks).toString('utf8')
  try {
    const body = rawStr ? JSON.parse(rawStr) : {}
    return { body, tooLarge: false }
  } catch {
    throw new WinglineError('input', 'invalid_json', 'JSON 格式错误')
  }
}

function handleAuth(req: http.IncomingMessage, res: http.ServerResponse, auth: Auth, url: URL): boolean {
  if (url.pathname !== '/auth') return false
  const token = url.searchParams.get('token') ?? ''
  const sessionRes = auth.redeem(token)
  if (!sessionRes) {
    res.writeHead(401, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    })
    res.end('<!DOCTYPE html><html><body><h1>链接已失效，请运行 wl console --link</h1></body></html>')
    return true
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Set-Cookie': sessionCookie(sessionRes.sid),
    'Content-Type': 'text/html; charset=utf-8',
  })
  res.end('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head><body>跳转中...</body></html>')
  return true
}

function handleControl(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  auth: Auth,
  controlKey: string,
  serverPort: number,
  url: URL,
): boolean {
  if (url.pathname !== '/_control/link' || req.method !== 'POST') return false
  const key = req.headers['x-control-key']
  if (typeof key !== 'string' || !safeEqual(key, controlKey)) {
    res.writeHead(403, SECURITY_HEADERS)
    res.end()
    return true
  }
  const loginToken = auth.issueLoginToken()
  const link = `http://127.0.0.1:${serverPort}/auth?token=${loginToken}`
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify({ url: link }))
  return true
}

function handleSession(
  res: http.ServerResponse,
  deps: CommandDeps,
  sess: Session | null,
  version: string,
): void {
  if (!sess) {
    writeEnvelope(res, 401, { ok: false, error: { kind: 'auth', code: 'unauthenticated', message: '未登录' } })
    return
  }
  const teams = deps.registry.listTeams().map((t) => t.name)
  writeEnvelope(res, 200, {
    ok: true,
    result: {
      csrfToken: sess.csrf,
      version,
      teams,
    },
  })
}

async function handleSse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  team: string,
  sess: Session | null,
  feeds: TeamFeeds,
  sseClients: Set<http.ServerResponse>,
): Promise<void> {
  if (!sess) {
    res.writeHead(401, SECURITY_HEADERS)
    res.end()
    return
  }

  try {
    checkParam('team', team)
    let closed = req.destroyed || res.destroyed
    let unsub: (() => void) | undefined
    req.on('close', () => {
      closed = true
      unsub?.()
      sseClients.delete(res)
    })

    const lastEventId = req.headers['last-event-id'] as string | undefined
    unsub = await feeds.subscribe(team, (chunk) => res.write(chunk), lastEventId)

    if (closed || req.destroyed || res.destroyed) {
      unsub()
      sseClients.delete(res)
      return
    }

    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
    })
    res.flushHeaders()
    sseClients.add(res)
  } catch (err) {
    respondError(res, err)
  }
}

async function handleRouter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  match: { h: Handler; params: Record<string, string> },
  sess: Session | null,
  serverDeps: CommandDeps & { orca: CachedOrca },
  serverPort: number,
): Promise<void> {
  if (!sess) {
    writeEnvelope(res, 401, { ok: false, error: { kind: 'auth', code: 'unauthenticated', message: '未登录' } })
    return
  }

  let body: any = null
  if (req.method === 'POST') {
    const check = checkWrite({ method: req.method ?? 'GET', headers: req.headers }, serverPort, sess)
    if (check !== 'ok') {
      writeEnvelope(res, check === 'unauthenticated' ? 401 : 403, {
        ok: false,
        error: { kind: 'auth', code: check, message: '请求校验失败' },
      })
      return
    }

    const { body: parsedBody, tooLarge } = await readBody(req)
    if (tooLarge) {
      writeEnvelope(res, 413, {
        ok: false,
        error: { kind: 'input', code: 'body_too_large', message: '请求体超过 64 KB 上限' },
      })
      return
    }
    body = parsedBody
  }

  try {
    const result = await match.h({
      deps: serverDeps,
      params: match.params,
      query: url.searchParams,
      body,
    })
    writeEnvelope(res, 200, { ok: true, result })
  } catch (err) {
    respondError(res, err)
  }
}

interface ServerContext {
  auth: Auth
  controlKey: string
  serverPort: number
  deps: CommandDeps
  serverDeps: CommandDeps & { orca: CachedOrca }
  router: Router
  feeds: TeamFeeds
  sseClients: Set<http.ServerResponse>
  webRoot: string
  version: string
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, ctx: ServerContext): Promise<void> {
  if (!checkHost(req.headers.host, ctx.serverPort)) {
    res.writeHead(421, SECURITY_HEADERS)
    res.end('Misdirected Request')
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (handleAuth(req, res, ctx.auth, url)) return
  if (handleControl(req, res, ctx.auth, ctx.controlKey, ctx.serverPort, url)) return

  const sess = ctx.auth.session(req.headers.cookie)

  if (url.pathname === '/api/session') {
    handleSession(res, ctx.deps, sess, ctx.version)
    return
  }

  const sseMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/events$/)
  if (sseMatch) {
    await handleSse(req, res, sseMatch[1]!, sess, ctx.feeds, ctx.sseClients)
    return
  }

  const match = ctx.router.match(req.method ?? 'GET', url.pathname)
  if (match) {
    await handleRouter(req, res, url, match, sess, ctx.serverDeps, ctx.serverPort)
    return
  }

  serveStatic(ctx.webRoot, url.pathname, res)
}

function buildRouter(_serverDeps: CommandDeps & { orca: CachedOrca }): Router {
  const router = new Router()
  registerReadRoutes(router)
  registerWriteRoutes(router, consoleCommands())
  return router
}

async function listenServer(server: http.Server, port: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port)
    })
    server.on('error', reject)
  })
}

async function closeServer(
  server: http.Server,
  feeds: TeamFeeds,
  sseClients: Set<http.ServerResponse>,
): Promise<void> {
  feeds.closeAll()
  for (const res of sseClients) {
    res.destroy()
  }
  const closePromise = new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  server.closeAllConnections()
  await closePromise
}

export async function createConsoleServer(
  deps: CommandDeps,
  o: {
    port?: number
    webRoot: string
    /** /api/session 回给前端的 CLI 版本号；不传就是 'dev'。 */
    version?: string
    now?: () => number
    sse?: { timelineMs?: number; snapshotMs?: number; pingMs?: number }
  },
): Promise<ConsoleServer> {
  assertWebBuilt(o.webRoot)

  const auth = new Auth({ now: o.now })
  const controlKey = crypto.randomBytes(32).toString('base64url')
  const cached = cachedOrca(deps.orca)
  const serverDeps = { ...deps, orca: cached }
  const router = buildRouter(serverDeps)
  const feeds = new TeamFeeds(serverDeps, o.sse)
  const sseClients = new Set<http.ServerResponse>()

  let serverPort = 0
  const server = http.createServer((req, res) => {
    req.on('error', (err) => deps.warn(`request error: ${String(err)}`))
    res.on('error', (err) => deps.warn(`response error: ${String(err)}`))
    void handle(req, res, {
      auth,
      controlKey,
      serverPort,
      deps,
      serverDeps,
      router,
      feeds,
      sseClients,
      webRoot: o.webRoot,
      version: o.version ?? 'dev',
    }).catch((err) => respondError(res, err))
  })

  serverPort = await listenServer(server, o.port ?? 0)

  return {
    port: serverPort,
    controlKey,
    loginUrl() {
      const token = auth.issueLoginToken()
      return `http://127.0.0.1:${serverPort}/auth?token=${token}`
    },
    close: () => closeServer(server, feeds, sseClients),
  }
}
