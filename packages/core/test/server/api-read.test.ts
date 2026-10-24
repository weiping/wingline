import fs from 'node:fs'
import { expect, test } from 'vitest'
import { Router, statusOf } from '../../src/server/http.js'
import { registerReadRoutes } from '../../src/server/api-read.js'
import { draftPathOf } from '../../src/spec/draft.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../commands/fake-client.js'
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

test('GET /api/teams attentionCount counts warnings like the top bar does', async () => {
  const restore = setWorktreeSupport({ workspaceStatus: true, comment: true })
  try {
    const o = new FakeOrca()
    const { deps, registry } = seedRunningTeam(o)
    const spec = registry.getTeam('duo')!.specPath
    const d = { ...deps, orca: cachedOrca(o) }
    const r = new Router()
    registerReadRoutes(r)
    const count = async () => ((await r.match('GET', '/api/teams')!.h({ deps: d, params: {}, query: new URLSearchParams(), body: null })) as any).teams[0].attentionCount
    const before = await count()
    fs.writeFileSync(draftPathOf(spec), fs.readFileSync(spec, 'utf8'))
    expect(await count()).toBe(before + 1)
  } finally {
    restore()
  }
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

test.each(['Duo', '..'])('team param %s is rejected with invalid_param', async (bad) => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerReadRoutes(r)

  const route = r.match('GET', `/api/teams/${bad}`)
  expect(route).not.toBeNull()
  await expect(route!.h({ deps: d, params: route!.params, query: new URLSearchParams(), body: null })).rejects.toMatchObject({
    code: 'invalid_param',
  })
})

test('team 形如 a/b 时路由不匹配 → 落到静态资源并回 404（不是 400 invalid_param）', () => {
  const r = new Router()
  registerReadRoutes(r)

  // 路由段是 ([^/]+)，含斜杠的 team 在匹配阶段就落选，根本走不到 checkParam
  expect(r.match('GET', '/api/teams/a/b')).toBeNull()
  expect(r.match('GET', '/api/teams/a/b/tasks')).toBeNull()
  expect(r.match('GET', '/api/teams/a/b/posts/builder')).toBeNull()
  expect(r.match('GET', '/api/teams/a/b/log')).toBeNull()
})

test('no response contains a session marker', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  // 任务详情路由也要走一遍，任务本身不带标记
  o.tasks.push({ id: 'task-1', status: 'ready', title: '普通任务', spec: '', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
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
    { path: '/api/teams/duo/tasks/task-1', params: { team: 'duo', id: 'task-1' } },
    { path: '/api/teams/duo/posts/builder', params: { team: 'duo', post: 'builder' } },
    { path: '/api/teams/duo/log', params: { team: 'duo' } },
  ]

  for (const { path: p, params } of routes) {
    const m = r.match('GET', p)
    expect(m, `读路由 ${p} 应该存在`).not.toBeNull()
    const res = await m!.h({ deps: d, params, query: new URLSearchParams(), body: null })
    expect(JSON.stringify(res)).not.toContain('WLS-1234abcd')
  }
})

test('3D: post detail lists that post\'s own live signals with a summary (it used to pass the address where the team name belongs)', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router(); registerReadRoutes(r)
  const base = { team: 'duo', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null }
  registry.putPatrolState({ ...base, post: 'builder@duo', signal: 'usage_limit', taskId: '', detail: { resetsAt: null, noticeHash: 'x' } })
  registry.putPatrolState({ ...base, post: 'checker@duo', signal: 'no_progress', taskId: 't1' })                      // 别的岗位
  registry.putPatrolState({ ...base, post: 'builder@duo', signal: 'no_progress', taskId: 't0', clearedAt: 'Z' })        // 已清除
  registry.putPatrolState({ ...base, post: 'builder@duo', signal: 'owner_idle', taskId: 't2', level: 0 })              // 只是观察
  const route = r.match('GET', '/api/teams/duo/posts/builder')!
  const res = (await route.h({ deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: null })) as any
  expect(res.signals.map((s: { signal: string; summary: string | null }) => [s.signal, s.summary])).toEqual([['usage_limit', '重置时间未知']])
})
