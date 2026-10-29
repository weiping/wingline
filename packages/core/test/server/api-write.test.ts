import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { Router, statusOf } from '../../src/server/http.js'
import { draftPathOf, fileHash } from '../../src/spec/draft.js'
import { DUO_YAML } from '../spec/helpers.js'
import {
  auditedWriteCommands,
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

/** 全部写路由的样例请求（唯一真相源）：加路由只补一行表项，sampleRequest 保持一行查表。 */
const ROUTE_SAMPLES: Record<string, { path: string; body: Record<string, unknown> }> = {
  '/api/teams/:team/send': { path: '/api/teams/duo/send', body: { post: 'builder', message: 'hello from console' } },
  '/api/teams/:team/tasks': { path: '/api/teams/duo/tasks', body: { title: 'sample task' } },
  '/api/teams/:team/tasks/:id/escalate': { path: '/api/teams/duo/tasks/task-1/escalate', body: { reason: 'need help' } },
  '/api/teams/:team/tasks/:id/reassign': { path: '/api/teams/duo/tasks/task-1/reassign', body: { to: 'builder' } },
  '/api/teams/:team/tasks/:id/recover': { path: '/api/teams/duo/tasks/task-1/recover', body: {} },
  '/api/teams/:team/tasks/:id/claim': { path: '/api/teams/duo/tasks/task-1/claim', body: { as: 'builder@duo' } },
  '/api/teams/:team/tasks/:id/release': { path: '/api/teams/duo/tasks/task-1/release', body: { as: 'builder@duo' } },
  '/api/teams/:team/tasks/:id/plan': { path: '/api/teams/duo/tasks/task-1/plan', body: { as: 'builder@duo', text: '先读代码再改' } },
  '/api/teams/:team/tasks/:id/start': { path: '/api/teams/duo/tasks/task-1/start', body: { as: 'builder@duo' } },
  '/api/teams/:team/tasks/:id/done': { path: '/api/teams/duo/tasks/task-1/done', body: { as: 'builder@duo' } },
  '/api/teams/:team/gates/:gateId/resolve': { path: '/api/teams/duo/gates/gate-1/resolve', body: { resolution: 'proceed' } },
  '/api/teams/:team/posts/:post/freeze': { path: '/api/teams/duo/posts/builder/freeze', body: { reason: 'maintenance' } },
  '/api/teams/:team/posts/:post/unfreeze': { path: '/api/teams/duo/posts/builder/unfreeze', body: {} },
  '/api/teams/:team/posts/:post/hush': { path: '/api/teams/duo/posts/builder/hush', body: { forMs: 60000 } },
  '/api/teams/:team/posts/:post/unhush': { path: '/api/teams/duo/posts/builder/unhush', body: {} },
  '/api/teams/:team/questions/:messageId/reply': { path: '/api/teams/duo/questions/msg-1/reply', body: { body: 'answer' } },
  '/api/teams/:team/spec': { path: '/api/teams/duo/spec', body: { yaml: 'version: 1\n', baseHash: null, running: true } },
  '/api/teams/:team/spec/discard-draft': { path: '/api/teams/duo/spec/discard-draft', body: {} },
  '/api/teams/:team/up': { path: '/api/teams/duo/up', body: { draft: true } },
  '/api/teams/:team/down': { path: '/api/teams/duo/down', body: { close: true } },
  '/api/teams/:team/restore': { path: '/api/teams/duo/restore', body: {} },
  '/api/teams/:team/dispatcher/up': { path: '/api/teams/duo/dispatcher/up', body: {} },
  '/api/teams/:team/dispatcher/down': { path: '/api/teams/duo/dispatcher/down', body: { close: true } },
  '/api/teams': { path: '/api/teams', body: { mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' } },
  '/api/autostart/install': { path: '/api/autostart/install', body: { waitOrca: '15m' } },
  '/api/autostart/uninstall': { path: '/api/autostart/uninstall', body: {} },
}

function sampleRequest(pattern: string): { path: string; body: Record<string, unknown> } {
  const sample = ROUTE_SAMPLES[pattern]
  if (!sample) throw new Error(`unknown pattern ${pattern}`)
  return sample
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
    claimTask: record('claimTask') as any,
    releaseTask: record('releaseTask') as any,
    planTask: record('planTask') as any,
    startTask: record('startTask', { delivery: 'self' }) as any,
    doneTask: record('doneTask', { outcome: 'done' }) as any,
    freezePostCmd: record('freezePostCmd', {}) as any,
    unfreezePostCmd: record('unfreezePostCmd', {}) as any,
    hushCmd: record('hushCmd', {}) as any,
    unhushCmd: record('unhushCmd', {}) as any,
    dispatcherReply: record('dispatcherReply', {}) as any,
    saveSpecCmd: record('saveSpecCmd', { wrote: 'draft', path: '/t/team.draft.yaml', hash: 'h' }) as any,
    discardDraftCmd: record('discardDraftCmd', { discarded: false }) as any,
    up: record('up', { team: 'duo', posts: [], run: {} }) as any,
    down: record('down', { team: 'duo', posts: [] }) as any,
    restore: record('restore', { team: 'duo', dryRun: false, posts: [], dispatcher: {}, tasks: [] }) as any,
    dispatcherUp: record('dispatcherUp', { address: 'dispatcher@duo', outcome: 'started' }) as any,
    dispatcherDown: record('dispatcherDown', { address: 'dispatcher@duo', outcome: 'noop' }) as any,
    initTeamCmd: record('initTeamCmd', { team: 'duo', specPath: '/t/duo/team.yaml', created: true }) as any,
    autostartInstall: record('autostartInstall', { platform: 'darwin', file: '/f', command: 'c', logPath: '/l', waitOrca: '15m' }) as any,
    autostartUninstall: record('autostartUninstall', { file: '/f', removed: true }) as any,
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

/** 审计前缀循环按 listAudit(':team') 断言，只适用于带 :team 参数的路由；init/autostart 的审计另有专门用例。 */
const TEAM_SCOPED_ROUTES = WRITE_ROUTES.filter((s) => s.check.includes('team'))

test.each(TEAM_SCOPED_ROUTES)('$pattern：审计行带 console: 前缀；actor 取 as（无 as 记 human）', async (spec) => {
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
  expect(last.actor).toBe(typeof sample.body.as === 'string' ? sample.body.as : 'human')
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

test('POST reassign 的 to=123（非字符串） → 400 invalid_param', async () => {
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
      body: { to: 123 },
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

test('gates resolve 的 reassign=123（非字符串） → 400 invalid_param', async () => {
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
      body: { resolution: 'proceed', reassign: 123 },
    }),
  ).rejects.toMatchObject({
    kind: 'input',
    code: 'invalid_param',
  })
})

test('retryRequest 下传契约：仅 send、createTask、escalateTask 下传，其余 23 条不向下传', async () => {
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
  expect(calls.claimTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.releaseTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.planTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.startTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.doneTask!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.freezePostCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.unfreezePostCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.hushCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.unhushCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.dispatcherReply!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.saveSpecCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.discardDraftCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.up!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.down!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.restore!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.dispatcherUp!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.dispatcherDown!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.initTeamCmd!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.autostartInstall!.at(-1)?.retryRequest).toBeUndefined()
  expect(calls.autostartUninstall!.at(-1)?.retryRequest).toBeUndefined()
})

test.each([
  ['/api/teams/:team/up', '/api/teams/duo/up', { draft: true }, 'up', { team: 'duo', draft: true, newRun: undefined, adoptRun: undefined }],
  ['/api/teams/:team/down', '/api/teams/duo/down', { close: true }, 'down', { team: 'duo', close: true }],
  ['/api/teams/:team/restore', '/api/teams/duo/restore', { dryRun: true, noTasks: true, sessions: { builder: 's-1' } }, 'restore', { team: 'duo', dryRun: true, noTasks: true, sessions: { builder: 's-1' } }],
  ['/api/teams/:team/dispatcher/up', '/api/teams/duo/dispatcher/up', {}, 'dispatcherUp', { team: 'duo' }],
  ['/api/teams/:team/dispatcher/down', '/api/teams/duo/dispatcher/down', {}, 'dispatcherDown', { team: 'duo', close: true }],
  ['/api/teams', '/api/teams', { mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' }, 'initTeamCmd', { mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo', dir: undefined, specPath: undefined }],
  ['/api/autostart/install', '/api/autostart/install', { waitOrca: '15m' }, 'autostartInstall', { waitOrca: '15m' }],
  ['/api/autostart/uninstall', '/api/autostart/uninstall', {}, 'autostartUninstall', undefined],
])('写路由 %s 调到了对应的 core 命令', async (_pattern, path, body, name, expected) => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)

  const route = r.match('POST', path)!
  const res = await route.h({ deps: d, params: route.params, query: new URLSearchParams(), body })
  expect(res).toBeDefined()
  expect(calls[name]!.at(-1)).toEqual(expected)
})

/** 任务执行流 5 条路由共用的测试底座：录制命令 + 可复用的 POST。 */
function taskFlowHarness(verb: string) {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)
  const route = r.match('POST', `/api/teams/duo/tasks/task-1/${verb}`)!
  const post = (body: unknown) => route.h({ deps: d, params: route.params, query: new URLSearchParams(), body })
  return { post, calls }
}

test.each([
  ['claim', {}],
  ['release', {}],
  ['plan', { text: '先读代码再改' }],
  ['start', {}],
  ['done', {}],
])('任务执行流 %s 的路由可达并带上了 as', async (verb, extra) => {
  const { post, calls } = taskFlowHarness(verb)
  const res = await post({ as: 'builder@duo', ...extra })
  expect(res).toBeDefined()
  expect(calls[`${verb}Task`]!.at(-1)).toMatchObject({ id: 'task-1', as: 'builder@duo', ...extra })
})

test('as 不带 @ 时按本团队岗位解释成完整地址', async () => {
  const { post, calls } = taskFlowHarness('claim')
  await post({ as: 'builder' })
  expect(calls.claimTask!.at(-1)).toMatchObject({ id: 'task-1', as: 'builder@duo' })
})

test('as 必须属于该团队，跨团队的 as 被拒绝', async () => {
  const { post, calls } = taskFlowHarness('claim')
  await expect(post({ as: 'builder@other' })).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  expect(calls.claimTask).toBeUndefined()
})

test('as 缺省或格式不对时报 invalid_param', async () => {
  const { post } = taskFlowHarness('claim')
  await expect(post({})).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  await expect(post({ as: 'bad name' })).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
})

test('plan 的 text 缺省或为空白时报 invalid_param', async () => {
  const { post, calls } = taskFlowHarness('plan')
  await expect(post({ as: 'builder@duo' })).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  await expect(post({ as: 'builder@duo', text: '   ' })).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  expect(calls.planTask).toBeUndefined()
})

test('未启动的团队启动调度员时给出可读提示，而不是 500', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.setRunId('duo', null)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerWriteRoutes(r, consoleCommands())

  const route = r.match('POST', '/api/teams/duo/dispatcher/up')!
  const err = await route.h({ deps: d, params: route.params, query: new URLSearchParams(), body: {} }).then(
    () => undefined,
    (e) => e,
  )
  expect(err).toMatchObject({ kind: 'input', code: 'run_not_ready' })
  expect(statusOf(err)).toBe(400)
})

function realSpecHarness(over: { running?: boolean } = {}) {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  if (over.running === false) registry.setTeamStatus('duo', 'stopped')
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerWriteRoutes(r, consoleCommands())
  const specPath = registry.getTeam('duo')!.specPath
  const post = (path: string, body: unknown) => {
    const route = r.match('POST', path)!
    return route.h({ deps: d, params: route.params, query: new URLSearchParams(), body }) as Promise<any>
  }
  return { post, deps, specPath }
}

const NEW_YAML = DUO_YAML.replace('model: opus', 'model: sonnet')

test('POST spec writes the draft for a running team; the audit row has the console: prefix and no yaml', async () => {
  const { post, deps, specPath } = realSpecHarness()
  const res = await post('/api/teams/duo/spec', { yaml: NEW_YAML, baseHash: null, running: true })
  expect(res).toMatchObject({ wrote: 'draft', path: draftPathOf(specPath) })
  expect(fs.readFileSync(draftPathOf(specPath), 'utf8')).toBe(NEW_YAML)
  const row = deps.registry.listAudit('duo').at(-1)!
  expect(row.command).toBe('console: spec save')
  expect(row.actor).toBe('human')
  expect(JSON.stringify(row)).not.toContain('sonnet')
  expect(JSON.stringify(row)).toContain(res.hash.slice(0, 16))
})

test('POST spec: 409-class spec_conflict on stale baseHash and when running differs; spec_invalid carries detail.errors', async () => {
  const { post, specPath } = realSpecHarness()
  fs.writeFileSync(draftPathOf(specPath), `${DUO_YAML}# x\n`)
  await expect(post('/api/teams/duo/spec', { yaml: NEW_YAML, baseHash: null, running: true })).rejects.toMatchObject({ code: 'spec_conflict' })
  await expect(post('/api/teams/duo/spec', { yaml: NEW_YAML, baseHash: fileHash(specPath), running: false })).rejects.toMatchObject({ code: 'spec_conflict' })
  const bad = await post('/api/teams/duo/spec', { yaml: DUO_YAML.replace('lead: builder', 'lead: ghost'), baseHash: fileHash(draftPathOf(specPath)), running: true }).catch((e) => e)
  expect(bad).toMatchObject({ code: 'spec_invalid', detail: { errors: [{ code: 'lead_unknown' }] } })
})

test('POST spec rejects a non-string yaml and a non-boolean running before calling the command', async () => {
  const { post } = realSpecHarness()
  await expect(post('/api/teams/duo/spec', { yaml: 1, baseHash: null, running: true })).rejects.toMatchObject({ code: 'invalid_param' })
  await expect(post('/api/teams/duo/spec', { yaml: NEW_YAML, baseHash: null, running: 'yes' })).rejects.toMatchObject({ code: 'invalid_param' })
  await expect(post('/api/teams/duo/spec', { yaml: NEW_YAML, baseHash: 5, running: true })).rejects.toMatchObject({ code: 'invalid_param' })
})

test('discard-draft returns { discarded } and is audited', async () => {
  const { post, deps, specPath } = realSpecHarness()
  expect(await post('/api/teams/duo/spec/discard-draft', {})).toEqual({ discarded: false })
  fs.writeFileSync(draftPathOf(specPath), NEW_YAML)
  expect(await post('/api/teams/duo/spec/discard-draft', {})).toEqual({ discarded: true })
  expect(deps.registry.listAudit('duo').map((r) => r.command)).toEqual(['console: spec discard-draft', 'console: spec discard-draft'])
})

test("auditedWriteCommands('tui:') writes audit rows with the tui: prefix", async () => {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const cmds = auditedWriteCommands('tui:')
  await cmds.discardDraftCmd(deps, { team: 'duo' })
  expect(registry.listAudit('duo').at(-1)).toMatchObject({ command: 'tui: spec discard-draft', actor: 'human' })
  expect(consoleCommands).toBeTypeOf('function')
})

function routeHarness(pattern: string) {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordGate('gate-1', 'duo', 'task-1')
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)
  const sample = sampleRequest(pattern)
  const route = r.match('POST', sample.path)!
  const call = (retryRequest: unknown) => route.h({ deps: d, params: route.params, query: new URLSearchParams(), body: { ...sample.body, retryRequest } })
  const total = () => Object.values(calls).reduce((n, a) => n + (a?.length ?? 0), 0)
  return { call, total }
}

test.each(WRITE_ROUTES)('$pattern rejects a malformed retryRequest before calling the command', async (spec) => {
  const h = routeHarness(spec.pattern)
  for (const bad of [123, {}, '', 'a b', 'x'.repeat(129)]) {
    await expect(h.call(bad)).rejects.toMatchObject({ code: 'invalid_param' })
  }
  expect(h.total()).toBe(0)
})

test('a UUID and an Orca-style id are accepted as retryRequest', async () => {
  const h = routeHarness('/api/teams/:team/send')
  await expect(h.call('6f1c2a9e-3b4d-4e5f-8a7b-0c1d2e3f4a5b')).resolves.toBeDefined()
  await expect(h.call('req-1')).resolves.toBeDefined()
})

/** /api/teams 走真实 initTeamCmd：写进 deps.home 的临时目录并登记注册表（只写文件，不碰系统服务）。 */
function realTeamHarness() {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerWriteRoutes(r, consoleCommands())
  const post = (p: string, body: unknown) => {
    const route = r.match('POST', p)!
    return route.h({ deps: d, params: route.params, query: new URLSearchParams(), body }) as Promise<any>
  }
  return { post, deps }
}

test('POST /api/teams 用模板新建团队并落 console: init 审计', async () => {
  const { post, deps } = realTeamHarness()
  const res = await post('/api/teams', { mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' })
  expect(res).toMatchObject({ team: 'my-team', created: true })
  expect(deps.registry.getTeam('my-team')?.specPath).toBe(path.join(deps.home, 'teams', 'my-team', 'team.yaml'))
  expect(deps.registry.listAudit('my-team').at(-1)).toMatchObject({ command: 'console: init', actor: 'human' })
})

test('POST /api/teams 拒绝未知字段与非法模板', async () => {
  const { post } = realTeamHarness()
  await expect(post('/api/teams', { mode: 'template', name: 'x', repo: '/r', template: 'nope' })).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  await expect(post('/api/teams', { mode: 'template', name: 'x', repo: '/r', what: 1 })).rejects.toMatchObject({ kind: 'input', code: 'unknown_field' })
})

test('POST /api/teams 的非法 mode 在路由层即被拒绝，不会调到命令', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)
  const route = r.match('POST', '/api/teams')!
  await expect(
    route.h({ deps: d, params: route.params, query: new URLSearchParams(), body: { mode: 'bogus', name: 'x', repo: '/r' } }),
  ).rejects.toMatchObject({ kind: 'input', code: 'invalid_param' })
  expect(calls.initTeamCmd).toBeUndefined()
})

test('POST /api/autostart/install 与 /uninstall 路由可达并落 console: 审计（team 记 -）', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const { cmds, calls } = makeRecordingCmds()
  const r = new Router()
  registerWriteRoutes(r, cmds)
  const post = (p: string, body: unknown) => {
    const route = r.match('POST', p)!
    return route.h({ deps: d, params: route.params, query: new URLSearchParams(), body }) as Promise<any>
  }

  await post('/api/autostart/install', { waitOrca: '15m' })
  await post('/api/autostart/uninstall', {})
  expect(calls.autostartInstall!.at(-1)).toEqual({ waitOrca: '15m' })
  expect(calls.autostartUninstall).toEqual([undefined])
  expect(deps.registry.listAudit('-').map((row) => row.command)).toEqual(['console: autostart install', 'console: autostart uninstall'])
})
