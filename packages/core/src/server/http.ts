import type { ServerResponse } from 'node:http'
import type { CommandDeps } from '../commands/deps.js'
import type { CachedOrca } from '../view/snapshot.js'
import { WinglineError } from '../errors.js'
import { SECURITY_HEADERS } from './static.js'

export const PARAM_RULES: Record<string, RegExp> = {
  team: /^[a-z0-9-]+$/,
  post: /^[a-z0-9-]+$/,
  id: /^[A-Za-z0-9_-]{1,80}$/,
  gateId: /^[A-Za-z0-9_-]{1,80}$/,
  messageId: /^[A-Za-z0-9_-]{1,80}$/,
}

export function checkParam(key: string, val: string): void {
  const rule = PARAM_RULES[key]
  if (rule && !rule.test(val)) {
    throw new WinglineError('input', 'invalid_param', `参数 ${key}=${val} 不合法`)
  }
}

export type HandlerContext = {
  deps: CommandDeps & { orca: CachedOrca }
  params: Record<string, string>
  query: URLSearchParams
  body: any
}

export type Handler = (ctx: HandlerContext) => Promise<unknown>

interface RouteEntry {
  method: string
  paramNames: string[]
  regex: RegExp
  handler: Handler
}

export class Router {
  private readonly routes: RouteEntry[] = []

  private add(method: string, pattern: string, h: Handler) {
    const paramNames: string[] = []
    const escaped = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    const regex = new RegExp(`^${escaped}$`)
    this.routes.push({ method, paramNames, regex, handler: h })
  }

  get(pattern: string, h: Handler): void {
    this.add('GET', pattern, h)
  }

  post(pattern: string, h: Handler): void {
    this.add('POST', pattern, h)
  }

  match(method: string, path: string): { h: Handler; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue
      const m = path.match(r.regex)
      if (!m) continue
      const params: Record<string, string> = {}
      r.paramNames.forEach((name, i) => {
        params[name] = m[i + 1]!
      })
      return { h: r.handler, params }
    }
    return null
  }
}

export function statusOf(err: unknown): number {
  if (err instanceof WinglineError) {
    switch (err.kind) {
      case 'input': return 400
      case 'orca': return 502
      case 'uncertain': return 504
      case 'internal': return 500
    }
  }
  return 500
}

export function writeEnvelope(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}
