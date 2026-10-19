// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup } from '@testing-library/preact'
import { ApiError, api, errorText } from '../src/api.js'
import { Fail, mockApi, SESSION } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('api.post sends the CSRF token from /api/session as a header and the body as JSON', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams/duo/send': () => ({ outcome: 'delivered' }),
  })
  await expect(api.post('/api/teams/duo/send', { post: 'builder', message: 'hi' })).resolves.toEqual({ outcome: 'delivered' })
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.headers['X-Wingline-Token']).toBe('tok')
  expect(post.body).toEqual({ post: 'builder', message: 'hi' })
})

test('a 504 uncertain response becomes an ApiError that carries retryRequest', async () => {
  mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams/duo/posts/builder/unfreeze': () => {
      throw new Fail(504, { kind: 'uncertain', code: 'orca_timeout', message: '结果不确定', retryRequest: 'rq-1' })
    },
  })
  const err = await api.post('/api/teams/duo/posts/builder/unfreeze', {}).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({ status: 504, kind: 'uncertain', code: 'orca_timeout', retryRequest: 'rq-1' })
})

test('a 401 is ApiError with code unauthenticated, and errorText points at wl console --link', async () => {
  mockApi({
    'GET /api/teams': () => {
      throw new Fail(401, { kind: 'auth', code: 'unauthenticated', message: '未登录' })
    },
  })
  const err = await api.get('/api/teams').catch((e: unknown) => e)
  expect(err).toMatchObject({ status: 401, code: 'unauthenticated' })
  expect(errorText(err)).toContain('wl console --link')
})

test('the built page has no inline script or style attributes (CSP style-src self)', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  // 从仓库根目录运行（pnpm test）；jsdom 下 import.meta.url 不是 file: 地址，不能用它定位
  const index = path.resolve('packages/cli/dist/web/index.html')
  if (!fs.existsSync(index)) return // 未构建时跳过（先运行 pnpm build）
  const html = fs.readFileSync(index, 'utf8')
  expect(html).not.toMatch(/\sstyle=/)
  expect(html).not.toMatch(/<script>(?!<\/script>)/)
})
