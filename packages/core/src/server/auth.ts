import crypto from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function sessionCookie(sid: string): string {
  return `wl_sid=${sid}; HttpOnly; SameSite=Strict; Path=/`
}

export function checkHost(host: string | undefined, port: number): boolean {
  if (!host) return false
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

export function checkWrite(
  req: { method: string; headers: IncomingHttpHeaders },
  port: number,
  s: { csrf: string } | null,
): 'ok' | 'unauthenticated' | 'forbidden' {
  if (!s) return 'unauthenticated'
  const origin = req.headers.origin
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
    return 'forbidden'
  }
  const contentType = req.headers['content-type']
  if (!contentType || !contentType.toLowerCase().startsWith('application/json')) {
    return 'forbidden'
  }
  const tokenHeader = req.headers['x-wingline-token']
  if (typeof tokenHeader !== 'string' || !safeEqual(tokenHeader, s.csrf)) {
    return 'forbidden'
  }
  return 'ok'
}

interface LoginTokenEntry {
  expiresAt: number
}

interface SessionEntry {
  sid: string
  csrf: string
  expiresAt: number
}

export class Auth {
  private readonly now: () => number
  private readonly random: (n: number) => Buffer
  private readonly tokens = new Map<string, LoginTokenEntry>()
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(o: { now?: () => number; random?: (n: number) => Buffer } = {}) {
    this.now = o.now ?? (() => Date.now())
    this.random = o.random ?? ((n: number) => crypto.randomBytes(n))
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /** 清掉已过期的登录令牌与会话；每次发新令牌时顺手做，条目数本来就很少。 */
  private sweep(): void {
    const t = this.now()
    for (const [k, e] of this.tokens) if (t > e.expiresAt) this.tokens.delete(k)
    for (const [k, e] of this.sessions) if (t > e.expiresAt) this.sessions.delete(k)
  }

  /** 当前保留的条目数（测试用）。 */
  size(): { tokens: number; sessions: number } {
    return { tokens: this.tokens.size, sessions: this.sessions.size }
  }

  issueLoginToken(): string {
    this.sweep()
    const raw = this.random(32).toString('base64url')
    const h = this.hash(raw)
    // 5 分钟有效
    this.tokens.set(h, { expiresAt: this.now() + 5 * 60 * 1000 })
    return raw
  }

  redeem(token: string): { sid: string } | null {
    const h = this.hash(token)
    const entry = this.tokens.get(h)
    if (!entry) return null
    this.tokens.delete(h)
    if (this.now() > entry.expiresAt) return null

    const sid = this.random(32).toString('base64url')
    const csrf = this.random(32).toString('base64url')
    // 会话 12 小时有效
    this.sessions.set(sid, { sid, csrf, expiresAt: this.now() + 12 * 60 * 60 * 1000 })
    return { sid }
  }

  session(cookieHeader: string | undefined): { sid: string; csrf: string } | null {
    if (!cookieHeader) return null
    const match = cookieHeader.match(/(?:^|;\s*)wl_sid=([^;]+)/)
    if (!match) return null
    const sid = match[1]!
    const entry = this.sessions.get(sid)
    if (!entry) return null
    if (this.now() > entry.expiresAt) {
      this.sessions.delete(sid)
      return null
    }
    return { sid: entry.sid, csrf: entry.csrf }
  }
}
