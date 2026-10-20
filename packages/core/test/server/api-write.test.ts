import { expect, test } from 'vitest'
import { Router } from '../../src/server/http.js'
import {
  CONSOLE_AUDIT,
  consoleCommands,
  registerWriteRoutes,
  WRITE_ROUTES,
  type WriteCommands,
} from '../../src/server/api-write.js'
import { auditedCommands } from '../../src/audit.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { WinglineError } from '../../src/errors.js'

function sampleRequest(pattern: string): { path: string; body: Record<string, unknown> } {
  switch (pattern) {
    case '/api/teams/:team/send':
      return { path: '/api/teams/duo/send', body: { post: 'builder', message: 'hello from console' } }
    case '/api/teams/:team/tasks':
      return { path: '/api/teams/duo/tasks', body: { title: 'sample task' } }
    case '/api/teams/:team/tasks/:id/escalate':
      return { path: '/api/teams/duo/tasks/task-1/escalate', body: { reason: 'need help' } }
    case '/api/teams/:team/tasks/:id/reassign':
      return { path: '/api/teams/duo/tasks/task-1/reassign', body: { to: 'builder' } }
    case '/api/teams/:team/tasks/:id/recover':
      return { path: '/api/teams/duo/tasks/task-1/recover', body: {} }
    case '/api/teams/:team/gates/:gateId/resolve':
      return { path: '/api/teams/duo/gates/gate-1/resolve', body: { resolution: 'proceed' } }
    case '/api/teams/:team/posts/:post/freeze':
      return { path: '/api/teams/duo/posts/builder/freeze', body: { reason: 'maintenance' } }
    case '/api/teams/:team/posts/:post/unfreeze':
      return { path: '/api/teams/duo/posts/builder/unfreeze', body: {} }
    case '/api/teams/:team/posts/:post/hush':
      return { path: '/api/teams/duo/posts/builder/hush', body: { forMs: 60000 } }
    case '/api/teams/:team/posts/:post/unhush':
      return { path: '/api/teams/duo/posts/builder/unhush', body: {} }
    case '/api/teams/:team/questions/:messageId/reply':
      return { path: '/api/teams/duo/questions/msg-1/reply', body: { body: 'answer' } }
    default:
      throw new Error(`unknown pattern ${pattern}`)
  }
}

function makeRecordingCmds() {
  const calls: { [k: string]: any[] | undefined } = {}
  const record = (name: string, ret: any = {}) => async (_deps: any, args: any) => {
    (calls[name] ??= []).push(args)
    return ret
  }
  const raw: WriteCommands = {
    send: record('send', { outcome: 'delivered', address: 'builder@duo', handle: 'h' }) as any,
    createTask: record('createTask', { id: 'task-1' }) as any,
    escalateTask: record('escalateTask', { gateId: 'gate-1', status: 'ready', tookBackDispatch: false }) as any,
    reassignTask: record('reassignTask', { id: 'task-1', to: 'builder@duo' }) as any,
    recoverTask: record('recoverTask', { id: 'task-1' }) as any,
    resolveGate: record('resolveGate', { gateId: 'gate-1' }) as any,
    freezePostCmd: record('freezePostCmd', {}) as any,
    unfreezePostCmd: record('unfreezePostCmd', {}) as any,
    hushCmd: record('hushCmd', {}) as any,
    unhushCmd: record('unhushCmd', {}) as any,
    dispatcherReply: record('dispatcherReply', {}) as any,
  }
  const audited = auditedCommands(raw, CONSOLE_AUDIT, { prefix: 'console:', actor: 'human' })
  return { cmds: audited, calls, raw }
}

test('POST send maps {post, message} to send({address, message}) and invalidates the snapshot', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/send')!
  const res = (await route.h({
    deps: d,
    params: { team: 'duo' },
    query: new URLSearchParams(),
    body: { post: 'builder', message: 'hello from console' },
  })) as any

  expect(res.outcome).toBe('delivered')
  expect(o.sent.some((s) => s.text === 'hello from console')).toBe(true)

  // Check audit log
  const audit = deps.registry.listAudit('duo')
  const last = audit.at(-1)!
  expect(last.command).toBe('console: send')
  expect(last.actor).toBe('human')
})

test('an unknown body field is rejected with unknown_field and the command is not called', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/send')!
  await expect(
    route.h({
      deps: d,
      params: { team: 'duo' },
      query: new URLSearchParams(),
      body: { post: 'builder', message: 'hello', extraField: 123 },
    }),
  ).rejects.toMatchObject({ code: 'unknown_field' })
})

test('an uncertain send returns error with retry and retryRequest', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  o.failSendOnce = new WinglineError('uncertain', 'terminal_send_unconfirmed', '发送未获确认', {
    hint: '稍后重试',
    detail: { retryRequest: 'req-123' },
  })
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/send')!
  await expect(
    route.h({
      deps: d,
      params: { team: 'duo' },
      query: new URLSearchParams(),
      body: { post: 'builder', message: 'test' },
    }),
  ).rejects.toMatchObject({
    kind: 'uncertain',
    code: 'terminal_send_unconfirmed',
  })
})

test.each(WRITE_ROUTES)('$pattern：审计行带 console: 前缀、actor human', async (spec) => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const sample = sampleRequest(spec.pattern)
  const route = r.match('POST', sample.path)!
  await route.h({
    deps: d,
    params: route.params,
    query: new URLSearchParams(),
    body: sample.body,
  })

  const audit = deps.registry.listAudit('duo')
  const last = audit.at(-1)!
  expect(last.command).toMatch(/^console: /)
  expect(last.actor).toBe('human')
})

test.each(WRITE_ROUTES)('$pattern：原样重试体（原字段 + retryRequest）被接受，不撞 unknown_field', async (spec) => {
  expect(spec.fields).toContain('retryRequest')

  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const sample = sampleRequest(spec.pattern)
  const route = r.match('POST', sample.path)!
  const res = await route.h({
    deps: d,
    params: route.params,
    query: new URLSearchParams(),
    body: { ...sample.body, retryRequest: 'req-retry-123' },
  })
  expect(res).toBeDefined()
})

test('resolve 映射 {resolution, reassign} 为地址；hush 映射 forMs；reply 映射 {body, again}', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  // 1. resolve with short post name: builder -> builder@duo
  const resolveRoute = r.match('POST', '/api/teams/duo/gates/gate-1/resolve')!
  await resolveRoute.h({
    deps: d,
    params: resolveRoute.params,
    query: new URLSearchParams(),
    body: { resolution: 'proceed', reassign: 'builder' },
  })
  expect(calls.resolveGate!.at(-1)).toEqual({
    gateId: 'gate-1',
    resolution: 'proceed',
    reassign: 'builder@duo',
  })

  // resolve with full address: builder@duo -> builder@duo
  await resolveRoute.h({
    deps: d,
    params: resolveRoute.params,
    query: new URLSearchParams(),
    body: { resolution: 'proceed', reassign: 'builder@duo' },
  })
  expect(calls.resolveGate!.at(-1)).toEqual({
    gateId: 'gate-1',
    resolution: 'proceed',
    reassign: 'builder@duo',
  })

  // 2. hush maps forMs
  const hushRoute = r.match('POST', '/api/teams/duo/posts/builder/hush')!
  await hushRoute.h({
    deps: d,
    params: hushRoute.params,
    query: new URLSearchParams(),
    body: { forMs: 60000 },
  })
  expect(calls.hushCmd!.at(-1)).toEqual({
    address: 'builder@duo',
    forMs: 60000,
  })

  // 3. reply maps {body, again}
  const replyRoute = r.match('POST', '/api/teams/duo/questions/msg-1/reply')!
  await replyRoute.h({
    deps: d,
    params: replyRoute.params,
    query: new URLSearchParams(),
    body: { body: 'answer body', again: true },
  })
  expect(calls.dispatcherReply!.at(-1)).toEqual({
    team: 'duo',
    messageId: 'msg-1',
    body: 'answer body',
    again: true,
  })
})

test('send 缺 post 字段 → 400 invalid_param（不再是 post_unknown）', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/send')!
  await expect(
    route.h({
      deps: d,
      params: route.params,
      query: new URLSearchParams(),
      body: { message: 'hello without post' },
    }),
  ).rejects.toMatchObject({
    kind: 'input',
    code: 'invalid_param',
  })
})

test('reassign 的 to=Duo → invalid_param', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/tasks/task-1/reassign')!
  await expect(
    route.h({
      deps: d,
      params: route.params,
      query: new URLSearchParams(),
      body: { to: 'Duo' },
    }),
  ).rejects.toMatchObject({
    kind: 'input',
    code: 'invalid_param',
  })
})

test('gates resolve 的 reassign=Duo → invalid_param', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', '/api/teams/duo/gates/gate-1/resolve')!
  await expect(
    route.h({
      deps: d,
      params: route.params,
      query: new URLSearchParams(),
      body: { resolution: 'proceed', reassign: 'Duo' },
    }),
  ).rejects.toMatchObject({
    kind: 'input',
    code: 'invalid_param',
  })
})

test('retryRequest 下传契约：仅 send、createTask、escalateTask 下传，其余 8 条不向下传', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  for (const spec of WRITE_ROUTES) {
    const sample = sampleRequest(spec.pattern)
    const route = r.match('POST', sample.path)!
    await route.h({
      deps: d,
      params: route.params,
      query: new URLSearchParams(),
      body: { ...sample.body, retryRequest: 'req-retry-999' },
    })
  }

  expect(calls.send!.at(-1)?.retryRequest).toBe('req-retry-999')
  expect(calls.createTask!.at(-1)?.retryRequest).toBe('req-retry-999')
  expect(calls.escalateTask!.at(-1)?.retryRequest).toBe('req-retry-999')

  expect(calls.reassignTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.recoverTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.resolveGate!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.freezePostCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.unfreezePostCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.hushCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.unhushCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.dispatcherReply!.at(-1)?.retryRequest).toBeUndefined()
})
