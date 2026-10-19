import { expect, test } from 'vitest'
import { Auth, checkHost, checkWrite, safeEqual, sessionCookie } from '../../src/server/auth.js'

test('a login token redeems once; the second use and an expired token fail', () => {
  let now = 1_000_000
  const auth = new Auth({ now: () => now })
  const token = auth.issueLoginToken()

  const res1 = auth.redeem(token)
  expect(res1).not.toBeNull()
  expect(res1?.sid).toBeTruthy()

  // Second use fails
  expect(auth.redeem(token)).toBeNull()

  // Expired token fails (5 mins = 300,000 ms)
  const token2 = auth.issueLoginToken()
  now += 300_001
  expect(auth.redeem(token2)).toBeNull()
})

test('session cookie carries HttpOnly, SameSite=Strict and Path=/', () => {
  expect(sessionCookie('abc')).toBe('wl_sid=abc; HttpOnly; SameSite=Strict; Path=/')
})

test('sessions expire after 12 hours', () => {
  let now = 1_000_000
  const auth = new Auth({ now: () => now })
  const token = auth.issueLoginToken()
  const { sid } = auth.redeem(token)!

  expect(auth.session(`wl_sid=${sid}`)).not.toBeNull()

  // 12 hours = 12 * 3600 * 1000 = 43_200_000 ms
  now += 43_200_001
  expect(auth.session(`wl_sid=${sid}`)).toBeNull()
})

test('host check accepts 127.0.0.1:<port> and localhost:<port> only', () => {
  expect(checkHost('127.0.0.1:4100', 4100)).toBe(true)
  expect(checkHost('localhost:4100', 4100)).toBe(true)
  expect(checkHost('evil.example:4100', 4100)).toBe(false)
  expect(checkHost('127.0.0.1:9999', 4100)).toBe(false)
  expect(checkHost(undefined, 4100)).toBe(false)
})

test.each([
  ['missing csrf header', { origin: 'http://127.0.0.1:4100', 'content-type': 'application/json' }],
  ['wrong origin', { origin: 'http://evil', 'x-wingline-token': 'C', 'content-type': 'application/json' }],
  ['form content type', { origin: 'http://127.0.0.1:4100', 'x-wingline-token': 'C', 'content-type': 'text/plain' }],
  ['csrf mismatch', { origin: 'http://127.0.0.1:4100', 'x-wingline-token': 'WRONG', 'content-type': 'application/json' }],
])('write is forbidden on %s', (_n, headers) => {
  expect(checkWrite({ method: 'POST', headers: headers as any }, 4100, { csrf: 'C' })).toBe('forbidden')
})

test('write with origin matching localhost is ok', () => {
  const headers = {
    origin: 'http://localhost:4100',
    'x-wingline-token': 'C',
    'content-type': 'application/json',
  }
  expect(checkWrite({ method: 'POST', headers: headers as any }, 4100, { csrf: 'C' })).toBe('ok')
})

test('write without a session is unauthenticated', () => {
  const headers = {
    origin: 'http://127.0.0.1:4100',
    'x-wingline-token': 'C',
    'content-type': 'application/json',
  }
  expect(checkWrite({ method: 'POST', headers: headers as any }, 4100, null)).toBe('unauthenticated')
})

test('safeEqual handles matching and non-matching strings', () => {
  expect(safeEqual('abc', 'abc')).toBe(true)
  expect(safeEqual('abc', 'abd')).toBe(false)
  expect(safeEqual('abc', 'ab')).toBe(false)
})
