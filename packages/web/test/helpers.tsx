import { vi } from 'vitest'
import { resetApiForTests } from '../src/api.js'

export interface Call {
  method: string
  path: string
  body: any
  headers: Record<string, string>
}

/** 让某个路由返回错误信封（status + error）。 */
export class Fail {
  constructor(
    readonly status: number,
    readonly error: Record<string, unknown>,
  ) {}
}

type Responder = (c: Call) => unknown

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 按 "METHOD /path[?query]" 或 "METHOD /path" 匹配路由；返回值记入 calls。 */
export function mockApi(routes: Record<string, Responder>): Call[] {
  const calls: Call[] = []
  resetApiForTests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase()
      const headers = { ...((init.headers as Record<string, string> | undefined) ?? {}) }
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      const call: Call = { method, path, body, headers }
      calls.push(call)
      const responder = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`]
      if (!responder) return json(404, { ok: false, error: { kind: 'input', code: 'no_route', message: `${method} ${path}` } })
      try {
        return json(200, { ok: true, result: await responder(call) })
      } catch (e) {
        if (e instanceof Fail) return json(e.status, { ok: false, error: e.error })
        throw e
      }
    }),
  )
  return calls
}

/** 替身 EventSource：测试里手动 open / fail / emit。 */
export class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly url: string
  closed = false
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private handlers = new Map<string, Array<(ev: { data: string }) => void>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: (ev: { data: string }) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn])
  }
  close(): void {
    this.closed = true
  }
  open(): void {
    this.onopen?.()
  }
  fail(): void {
    this.onerror?.()
  }
  emit(type: string, payload: unknown): void {
    for (const fn of this.handlers.get(type) ?? []) fn({ data: JSON.stringify(payload) })
  }
}

export function stubEventSource(): void {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

export const SESSION = { csrfToken: 'tok', version: '1.0.0', teams: ['duo'] }

export const attentionOf = (over: Record<string, unknown> = {}) => ({
  team: 'duo',
  dispatcher: { state: 'running', pid: 1, heartbeatAt: null, ageMs: 1000 },
  frozen: [],
  signals: [],
  questions: [],
  stale: [],
  unavailable: [],
  ...over,
})

export const teamOf = (over: Record<string, unknown> = {}) => ({
  team: 'duo',
  runId: 'run-1',
  dispatcher: {
    team: 'duo',
    health: { state: 'running', ageMs: 1000 },
    lastCheck: null,
    lastScan: null,
    frozen: 0,
    hushed: 0,
    attentionItems: 0,
    warnings: [],
  },
  posts: [
    { address: 'builder@duo', agent: 'claude', status: 'live', handle: null, worktree: 'current', isLead: true },
    { address: 'checker@duo', agent: 'codex', status: 'offline', handle: null, worktree: 'current', isLead: false },
  ],
  ...over,
})

export const eventOf = (over: Record<string, unknown>) => ({
  at: '2026-10-19T10:00:00.000Z',
  source: 'command',
  actor: 'human',
  action: 'send',
  target: 'builder@duo',
  outcome: 'ok',
  detail: null,
  id: 'command:1',
  ...over,
})
