/** 控制台 HTTP API 的薄封装：统一信封、CSRF 头、错误类型。 */

export class ApiError extends Error {
  readonly kind: string
  readonly code: string
  readonly status: number
  readonly hint?: string
  readonly retry?: string
  readonly retryRequest?: string
  /** 服务端只外露 detail.errors（规格校验错误列表）。 */
  readonly detail?: { errors?: Array<{ path: Array<string | number>; code: string; message: string; line: number | null }> }

  constructor(
    status: number,
    body: { kind: string; code: string; message: string; hint?: string; retry?: string; retryRequest?: string; detail?: ApiError['detail'] },
  ) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.kind = body.kind
    this.code = body.code
    this.hint = body.hint
    this.retry = body.retry
    this.retryRequest = body.retryRequest
    this.detail = body.detail
  }
}

interface ErrorBody { kind: string; code: string; message: string; hint?: string; retry?: string; retryRequest?: string; detail?: ApiError['detail'] }
type Envelope<T> = { ok: true; result: T } | { ok: false; error: ErrorBody }

let csrf: Promise<string> | null = null

async function call<T>(method: 'GET' | 'POST', path: string, body?: object, headers: Record<string, string> = {}): Promise<T> {
  const init: RequestInit = { method, headers: { ...headers }, credentials: 'same-origin' }
  if (body !== undefined) {
    init.headers = { ...headers, 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(path, init)
  let env: Envelope<T>
  try {
    env = (await res.json()) as Envelope<T>
  } catch {
    throw new ApiError(res.status, { kind: 'internal', code: 'bad_response', message: `服务返回了无法识别的内容（HTTP ${res.status}）` })
  }
  if (!env.ok) {
    const code = res.status === 401 ? 'unauthenticated' : env.error.code
    throw new ApiError(res.status, { ...env.error, code })
  }
  return env.result
}

/** 首次写请求前从 /api/session 取 CSRF token；失败时清掉缓存，下次重取。 */
function csrfToken(): Promise<string> {
  csrf ??= call<{ csrfToken: string }>('GET', '/api/session').then(
    (s) => s.csrfToken,
    (err: unknown) => {
      csrf = null
      throw err
    },
  )
  return csrf
}

export const api = {
  get<T>(path: string): Promise<T> {
    return call<T>('GET', path)
  },
  async post<T>(path: string, body: object): Promise<T> {
    const token = await csrfToken()
    return call<T>('POST', path, body, { 'X-Wingline-Token': token })
  },
}

/** 测试用：清掉模块级的 CSRF 缓存。 */
export function resetApiForTests(): void {
  csrf = null
}

/** 把任意错误转成给人看的一句话（含 hint）。 */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'unauthenticated') return '会话已过期，请运行 wl console --link 获取新链接'
    return err.hint ? `${err.message}（${err.hint}）` : err.message
  }
  return err instanceof Error ? err.message : String(err)
}

export const isUnauthenticated = (err: unknown): boolean => err instanceof ApiError && err.code === 'unauthenticated'

/** 团队没有 Run 时后端回 run_not_ready：按中性提示处理，不走红色错误块（规格第 3.3.4 条）。 */
export const notReady = (e: Error | null): boolean => e !== null && e instanceof ApiError && e.code === 'run_not_ready'
