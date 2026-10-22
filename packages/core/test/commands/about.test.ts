import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { about } from '../../src/commands/about.js'
import { WinglineError } from '../../src/errors.js'
import { draftPathOf } from '../../src/spec/draft.js'
import { FakeOrca, mkDeps, seedRunningTeam } from './fake-client.js'

const item = (r: Awaited<ReturnType<typeof about>>, key: string) => r.items.find((i) => i.key === key)

test('about reports each item with its source (WINGLINE_ORCA → env, default home → default)', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o, { env: { WINGLINE_ORCA: '/opt/orca' }, orcaPath: '/opt/orca' })
  const r = await about(deps, { version: '1.2.3', consoleFile: null })
  expect(item(r, 'wingline.version')).toMatchObject({ value: '1.2.3' })
  expect(item(r, 'orca.path')).toMatchObject({ value: '/opt/orca', source: 'env', note: 'WINGLINE_ORCA' })
  expect(item(r, 'orca.version')).toMatchObject({ source: 'orca' })
  expect(item(r, 'orca.verified')).toMatchObject({ value: true })
  expect(item(r, 'home.path')).toMatchObject({ value: deps.home, source: 'default' })
  expect(item(r, 'registry.migration')).toMatchObject({ source: 'registry', value: expect.any(Number) })
  expect(item(r, 'logs.bytes')).toMatchObject({ source: 'file', value: 0 })

  const other = mkDeps(o, { env: { ORCA_CLI_COMMAND: '/x/orca', WINGLINE_HOME: '/h' }, orcaPath: '/x/orca', home: '/h' })
  const r2 = await about(other.deps, { version: '1', consoleFile: null })
  expect(item(r2, 'orca.path')).toMatchObject({ source: 'env', note: 'ORCA_CLI_COMMAND' })
  expect(item(r2, 'home.path')).toMatchObject({ value: '/h', source: 'env', note: 'WINGLINE_HOME' })
  expect(item(await about(mkDeps(o, { env: {} }).deps, { version: '1', consoleFile: null }), 'orca.path')).toMatchObject({ source: 'default' })
})

test('about keeps the other items when orca --version fails', async () => {
  const o = new FakeOrca()
  o.faults.push({ method: 'version', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const { deps } = mkDeps(o)
  const r = await about(deps, { version: '1.2.3', consoleFile: null })
  expect(item(r, 'orca.version')).toMatchObject({ value: null, source: 'orca', note: 'runtime_unavailable' })
  expect(item(r, 'orca.verified')).toMatchObject({ value: null })
  expect(item(r, 'wingline.version')).toMatchObject({ value: '1.2.3' })
})

test('about adds the logs size and the console server entry', async () => {
  const o = new FakeOrca()
  const { deps, home } = mkDeps(o)
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true })
  fs.writeFileSync(path.join(home, 'logs', 'a.log'), '12345')
  fs.writeFileSync(path.join(home, 'logs', 'b.log'), '678')
  const r = await about(deps, { version: '1', consoleFile: { pid: 42, port: 5173, startedAt: 'T', controlKey: 'secret' } })
  expect(item(r, 'logs.bytes')).toMatchObject({ value: 8 })
  expect(item(r, 'console.pid')).toMatchObject({ value: 42, source: 'file' })
  expect(item(r, 'console.port')).toMatchObject({ value: 5173 })
  expect(JSON.stringify(r)).not.toContain('secret')
})

test('about lists each team with spec path, status, draft flag and dispatcher state', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const specPath = registry.getTeam('duo')!.specPath
  expect((await about(deps, { version: '1', consoleFile: null })).teams).toEqual([{ name: 'duo', specPath, status: 'up', draft: false, dispatcher: 'never' }])
  fs.writeFileSync(draftPathOf(specPath), 'x')
  expect((await about(deps, { version: '1', consoleFile: null })).teams[0]).toMatchObject({ draft: true })
})
