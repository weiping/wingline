import http from 'node:http'
import type { AddressInfo } from 'node:net'
import crypto from 'node:crypto'
import type { CommandDeps } from '../commands/deps.js'
import { cachedOrca, type CachedOrca } from '../view/snapshot.js'
import { WinglineError } from '../errors.js'
import { Auth, checkHost, checkWrite, safeEqual, sessionCookie } from './auth.js'
import { assertWebBuilt, serveStatic } from './static.js'
import { Router, statusOf, writeEnvelope } from './http.js'
import { registerReadRoutes } from './api-read.js'
import { consoleCommands, registerWriteRoutes } from './api-write.js'
import { TeamFeeds } from './sse.js'

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
  const teams = deps.registry.listTeams()
  for (const t of teams) {
    const posts = deps.registry.listPosts(t.name)
    const lead = posts.find((p) => p.isLead) ?? posts[0]
    if (lead?.worktree) return lead.worktree
  }
  throw new WinglineError('input', 'console_no_worktree', '没有运行中的团队，无法确定工作区', {
    hint: '使用 --worktree <选择器> 指定工作区',
  })
}

export async function createConsoleServer(
  deps: CommandDeps,
  o: { port?: number; webRoot: string; now?: () => number },
): Promise<ConsoleServer> {
  assertWebBuilt(o.webRoot)

  const auth = new Auth({ now: o.now })
  const controlKey = crypto.randomBytes(32).toString('base64url')
  const cached = cachedOrca(deps.orca)
  const serverDeps = { ...deps, orca: cached }

  const router = new Router()
  registerReadRoutes(router)
  registerWriteRoutes(router, consoleCommands(serverDeps))

  const feeds = new TeamFeeds(serverDeps)

  let serverPort = 0

  const server = http.createServer(async (req, res) => {
    // 1. checkHost
    if (!checkHost(req.headers.host, serverPort)) {
      res.writeHead(421)
      res.end('Misdirected Request')
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    // 2. /auth
    if (url.pathname === '/auth') {
      const token = url.searchParams.get('token') ?? ''
      const sessionRes = auth.redeem(token)
      if (!sessionRes) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html><html><body><h1>链接已失效，请运行 wl console --link</h1></body></html>`)
        return
      }
      res.writeHead(200, {
        'Set-Cookie': sessionCookie(sessionRes.sid),
        'Content-Type': 'text/html; charset=utf-8',
      })
      res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head><body>跳转中...</body></html>`)
      return
    }

    // 3. /_control/link
    if (url.pathname === '/_control/link' && req.method === 'POST') {
      const key = req.headers['x-control-key']
      if (typeof key !== 'string' || !safeEqual(key, controlKey)) {
        res.writeHead(403)
        res.end()
        return
      }
      const loginToken = auth.issueLoginToken()
      const link = `http://127.0.0.1:${serverPort}/auth?token=${loginToken}`
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ url: link }))
      return
    }

    // 4. Check session for /api/*
    const sess = auth.session(req.headers.cookie)

    if (url.pathname === '/api/session') {
      if (!sess) {
        writeEnvelope(res, 401, { ok: false, error: { kind: 'auth', code: 'unauthenticated', message: '未登录' } })
        return
      }
      const teams = deps.registry.listTeams().map((t) => t.name)
      writeEnvelope(res, 200, {
        ok: true,
        result: {
          csrfToken: sess.csrf,
          version: '1.0.0',
          teams,
        },
      })
      return
    }

    // 5. SSE: /api/teams/:team/events
    const sseMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/events$/)
    if (sseMatch) {
      if (!sess) {
        res.writeHead(401)
        res.end()
        return
      }
      const team = sseMatch[1]!
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      const lastEventId = req.headers['last-event-id'] as string | undefined
      const unsub = await feeds.subscribe(team, (chunk) => res.write(chunk), lastEventId)
      req.on('close', () => unsub())
      return
    }

    // 6. Router API
    const match = router.match(req.method ?? 'GET', url.pathname)
    if (match) {
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

        // Read body ≤ 64 KB
        let received = 0
        const chunks: Buffer[] = []
        let tooLarge = false

        await new Promise<void>((resolve, reject) => {
          req.on('data', (c) => {
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
          writeEnvelope(res, 413, {
            ok: false,
            error: { kind: 'input', code: 'body_too_large', message: '请求体超过 64 KB 上限' },
          })
          return
        }

        const rawStr = Buffer.concat(chunks).toString('utf8')
        try {
          body = rawStr ? JSON.parse(rawStr) : {}
        } catch {
          writeEnvelope(res, 400, {
            ok: false,
            error: { kind: 'input', code: 'invalid_json', message: 'JSON 格式错误' },
          })
          return
        }
      }

      try {
        const result = await match.h({
          deps: serverDeps,
          params: match.params,
          query: url.searchParams,
          body,
        })
        writeEnvelope(res, 200, { ok: true, result })
      } catch (err: any) {
        const st = statusOf(err)
        writeEnvelope(res, st, {
          ok: false,
          error: {
            kind: err?.kind ?? 'internal',
            code: err?.code ?? 'unknown',
            message: err?.message ?? String(err),
            hint: err?.hint,
            retry: err?.hint,
            retryRequest: err?.detail?.retryRequest,
          },
        })
      }
      return
    }

    // 7. Static files / SPA fallback
    serveStatic(o.webRoot, url.pathname, res)
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(o.port ?? 0, '127.0.0.1', () => {
      serverPort = (server.address() as AddressInfo).port
      resolve()
    })
    server.on('error', reject)
  })

  return {
    port: serverPort,
    controlKey,
    loginUrl() {
      const token = auth.issueLoginToken()
      return `http://127.0.0.1:${serverPort}/auth?token=${token}`
    },
    async close() {
      feeds.closeAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
