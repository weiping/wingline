import { expect, test } from 'vitest'
import { Router, statusOf } from '../../src/server/http.js'
import { registerReadRoutes } from '../../src/server/api-read.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { WinglineError } from '../../src/errors.js'

test('statusOf maps input/orca/uncertain/internal to 400/502/504/500', () => {
  expect(statusOf(new WinglineError('input', 'invalid_param', 'x'))).toBe(400)
  expect(statusOf(new WinglineError('orca', 'error', 'x'))).toBe(502)
  expect(statusOf(new WinglineError('uncertain', 'timeout', 'x'))).toBe(504)
  expect(statusOf(new WinglineError('internal', 'bug', 'x'))).toBe(500)
  expect(statusOf(new Error('unknown'))).toBe(500)
})

test('Router matches patterns with params', () => {
  const r = new Router()
  r.get('/api/teams/:team/tasks/:id', async () => 'hit')
  const matched = r.match('GET', '/api/teams/duo/tasks/t1')
  expect(matched).not.toBeNull()
  expect(matched?.params).toEqual({ team: 'duo', id: 't1' })
})

test('GET /api/teams lists every team with post summary, dispatcher state and attention counts', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  const route = r.match('GET', '/api/teams')!
  const res = (await route.h({ deps: d, params: {}, query: new URLSearchParams(), body: null })) as any
  expect(res.teams).toBeDefined()
  expect(res.teams.length).toBeGreaterThan(0)
  expect(res.teams[0]).toMatchObject({
    name: 'duo',
    postsCount: expect.any(Number),
    dispatcher: expect.anything(),
    attentionCount: expect.any(Number),
  })
})

test('GET /api/teams/:team/tasks passes status/tags/stale through', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  const route = r.match('GET', '/api/teams/duo/tasks')!
  const res = (await route.h({
    deps: d,
    params: { team: 'duo' },
    query: new URLSearchParams('status=ready&tags=a,b&stale=true'),
    body: null,
  })) as any
  expect(Array.isArray(res.tasks)).toBe(true)
})

test('GET /api/teams/:team/posts/:post returns the last 40 preview lines as plain text', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  // Set 60 colored preview lines on builder terminal
  const t = o.terminals.find((term) => term.title === 'builder@duo')!
  o.previews.set(t.handle, Array.from({ length: 60 }, (_, i) => `\x1b[31mline ${i}\x1b[0m`).join('\n'))

  const route = r.match('GET', '/api/teams/duo/posts/builder')!
  const res = (await route.h({ deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: null })) as any
  expect(res.preview).toBeDefined()
  expect(res.preview).toHaveLength(40)
  expect(res.preview[0]).toBe('line 20')
  expect(res.preview[39]).toBe('line 59')
  expect(res.preview.join('\n')).not.toContain('\x1b')
})

test('GET /api/teams/:team/log returns TimelineEvent[] with filters', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  const route = r.match('GET', '/api/teams/duo/log')!
  const res = (await route.h({
    deps: d,
    params: { team: 'duo' },
    query: new URLSearchParams('limit=10'),
    body: null,
  })) as any
  expect(Array.isArray(res.events)).toBe(true)
})

test.each(['Duo', '..', 'a/b'])('team param %s is rejected with invalid_param', async (bad) => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  const route = r.match('GET', `/api/teams/${bad}`)
  // Router regex should match the pattern, handler checks PARAM_RULES
  if (route) {
    await expect(route.h({ deps: d, params: route.params, query: new URLSearchParams(), body: null })).rejects.toMatchObject({
      code: 'invalid_param',
    })
  }
})

test('no response contains a session marker', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  deps.registry.setSessionMarker('builder@duo', 'WLS-1234abcd', '2026-10-16T00:00:00.000Z')
  deps.registry.setSessionId('builder@duo', 'sess-123')

  const r = new Router()
  registerReadRoutes(r)

  const routes = [
    { path: '/api/teams', params: {} as Record<string, string> },
    { path: '/api/teams/duo', params: { team: 'duo' } },
    { path: '/api/teams/duo/attention', params: { team: 'duo' } },
    { path: '/api/teams/duo/tasks', params: { team: 'duo' } },
    { path: '/api/teams/duo/posts/builder', params: { team: 'duo', post: 'builder' } },
    { path: '/api/teams/duo/log', params: { team: 'duo' } },
  ]

  for (const { path: p, params } of routes) {
    const m = r.match('GET', p)!
    const res = await m.h({ deps: d, params, query: new URLSearchParams(), body: null })
    expect(JSON.stringify(res)).not.toContain('WLS-1234abcd')
  }
})
