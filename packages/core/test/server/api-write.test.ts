import { expect, test } from 'vitest'
import { Router } from '../../src/server/http.js'
import { consoleCommands, registerWriteRoutes } from '../../src/server/api-write.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { WinglineError } from '../../src/errors.js'

test('POST send maps {post, message} to send({address, message}) and invalidates the snapshot', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands(d)
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
  const cmds = consoleCommands(d)
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

test('every write route is audited with console: prefix and actor human', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands(d)
  const r = new Router()
  registerWriteRoutes(r, cmds)

  // 1. send
  await r.match('POST', '/api/teams/duo/send')!.h({
    deps: d, params: { team: 'duo' }, query: new URLSearchParams(), body: { post: 'builder', message: 'msg' },
  })
  expect(deps.registry.listAudit('duo').at(-1)!.command).toBe('console: send')

  // 2. freeze
  await r.match('POST', '/api/teams/duo/posts/builder/freeze')!.h({
    deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: { reason: 'break' },
  })
  expect(deps.registry.listAudit('duo').at(-1)!.command).toBe('console: dispatcher freeze')

  // 3. unfreeze
  await r.match('POST', '/api/teams/duo/posts/builder/unfreeze')!.h({
    deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: {},
  })
  expect(deps.registry.listAudit('duo').at(-1)!.command).toBe('console: dispatcher unfreeze')

  // 4. hush
  await r.match('POST', '/api/teams/duo/posts/builder/hush')!.h({
    deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: { forMs: 60000 },
  })
  expect(deps.registry.listAudit('duo').at(-1)!.command).toBe('console: dispatcher hush')

  // 5. unhush
  await r.match('POST', '/api/teams/duo/posts/builder/unhush')!.h({
    deps: d, params: { team: 'duo', post: 'builder' }, query: new URLSearchParams(), body: {},
  })
  expect(deps.registry.listAudit('duo').at(-1)!.command).toBe('console: dispatcher unhush')
})

test('an uncertain send returns error with retry and retryRequest', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  o.failSendOnce = new WinglineError('uncertain', 'terminal_send_unconfirmed', '发送未获确认', {
    hint: '稍后重试',
    detail: { retryRequest: 'req-123' },
  })
  const d = { ...deps, orca: cachedOrca(o) }
  const cmds = consoleCommands(d)
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
