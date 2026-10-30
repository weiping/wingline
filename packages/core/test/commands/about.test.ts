import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { about } from '../../src/commands/about.js'
import { WinglineError } from '../../src/errors.js'
import { draftPathOf } from '../../src/spec/draft.js'
import type { AutostartSys } from '../../src/commands/autostart/index.js'
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

// ---- Task 9：about 带上 autostart 状态 ----

/** darwin 下的可控宿主：LaunchAgents 路径落在临时 homeDir 下（不存在→installed:false），日志读不到→logTail:[]；exec 在 darwin 上不会被调用。 */
const darwinSys: AutostartSys = {
  platform: 'darwin', homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wl-autostart-')), uid: 501,
  node: '/n', script: '/s', exec: async () => ({ code: 0, stdout: '', stderr: '' }), fs,
}

test('about 带上 autostart：取得到时 supported:true 并展开 AutostartStatus 与平台信息', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const r = await about(deps, { version: '1', consoleFile: null, autostartSys: darwinSys })
  expect(r.autostart.supported).toBe(true)
  if (!r.autostart.supported) return
  expect(r.autostart).toMatchObject({
    installed: false, platform: 'darwin',
    location: path.posix.join(darwinSys.homeDir, 'Library', 'LaunchAgents', 'wingline.restore.plist'),
    command: [], commandMissing: [], logTail: [], linger: undefined,
    logPath: path.posix.join(deps.home, 'logs', 'autostart.log'),
  })
})

test('about 的 autostart 取不到（平台不支持）时 supported:false 且带 reason，不抛错', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const r = await about(deps, { version: '1', consoleFile: null, autostartSys: { ...darwinSys, platform: 'win32' } })
  expect(r.autostart.supported).toBe(false)
  if (r.autostart.supported) return
  expect(r.autostart.reason).toContain('暂不支持')
  // 其余各项不受影响
  expect(r.items.find((i) => i.key === 'wingline.version')).toMatchObject({ value: '1' })
})
