import { expect, test } from 'vitest'
import { dispatcherDown, dispatcherHealth, dispatcherLaunchCommand, dispatcherUp, HEARTBEAT_STALE_MS, HEARTBEAT_TAKEOVER_MS } from '../../../src/commands/dispatcher/lifecycle.js'
import type { Registry } from '../../../src/registry/registry.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

const L = { node: '/usr/bin/node', script: "/opt/it's/main.js", team: 'duo', home: '/home/u/.wingline', orca: '/usr/local/bin/orca' }
test('POSIX launch command single-quotes every path and passes --home/--orca explicitly', () => {
  expect(dispatcherLaunchCommand({ platform: 'linux', ...L }))
    .toBe("'/usr/bin/node' '/opt/it'\\''s/main.js' dispatcher run duo --home '/home/u/.wingline' --orca '/usr/local/bin/orca'")
})
test('Windows launch command uses node from PATH and double-quotes the paths (spaces are fine)', () => {
  const w = { node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\wl\\dist\\main.js', team: 'duo', home: 'C:\\Users\\a b\\.wingline', orca: 'C:\\Users\\a b\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.cmd' }
  expect(dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: true, ...w }))
    .toBe('node "C:\\wl\\dist\\main.js" dispatcher run duo --home "C:\\Users\\a b\\.wingline" --orca "C:\\Users\\a b\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.cmd"')
})
test.each([['%'], ['$'], ['"'], ['`']])('Windows path containing %s → dispatcher_launch_unsupported with the manual method', (ch) => {
  expect(() => dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: true, ...L, home: `C:\\h${ch}x` }))
    .toThrow(expect.objectContaining({ code: 'dispatcher_launch_unsupported', hint: expect.stringContaining('wl dispatcher run duo') }))
})
test('Windows without node on PATH → dispatcher_launch_unsupported', () => {
  expect(() => dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: false, ...L })).toThrow(expect.objectContaining({ code: 'dispatcher_launch_unsupported' }))
})
/** 模拟调度员进程起来了：持有 dispatcher:<team> 锁并写一次心跳；返回释放函数。 */
const fakeRunning = (registry: Registry) => {
  let release!: () => void
  void registry.withTeamLock('dispatcher:duo', () => { registry.heartbeat('dispatcher:duo'); return new Promise<void>((res) => { release = res }) }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
  return () => release()
}
test('dispatcherHealth: never / running / stale (old heartbeat) / stopped', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  expect(dispatcherHealth(deps, 'duo').state).toBe('never')
  const release = fakeRunning(registry)
  expect(dispatcherHealth(deps, 'duo')).toMatchObject({ state: 'running', pid: process.pid })
  c.advance(HEARTBEAT_STALE_MS + 1)
  expect(dispatcherHealth(deps, 'duo').state).toBe('stale')
  release(); await new Promise((r) => setImmediate(r))
  registry.appendPatrolEvent({ team: 'duo', action: 'wake' })
  expect(dispatcherHealth(deps, 'duo').state).toBe('stopped')
})
test('final-review m4: manual events (freeze/hush) do not make a never-started dispatcher "stopped"; its own events do', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  for (const action of ['freeze', 'hush', 'unhush', 'unfreeze', 'notify', 'claim']) registry.appendPatrolEvent({ team: 'duo', action })
  expect(dispatcherHealth(deps, 'duo').state).toBe('never')
  registry.appendPatrolEvent({ team: 'duo', action: 'check_ok' })
  expect(dispatcherHealth(deps, 'duo').state).toBe('stopped')
})
test("dispatcherUp creates dispatcher@<team> on the lead's registered worktree and waits for the heartbeat", async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.onCreate = () => { fakeRunning(registry) }
  expect(await dispatcherUp(deps, { team: 'duo', platform: 'linux', sleep: async () => {} })).toMatchObject({ address: 'dispatcher@duo', outcome: 'started' })
  expect(o.created[0]).toMatchObject({ title: 'dispatcher@duo', worktree: registry.getPost('builder@duo')!.worktree, command: expect.stringContaining(`dispatcher run duo --home '${deps.home}'`) })
})
test('dispatcherUp: no heartbeat within the confirmation window → dispatcher_start_unconfirmed (exit-3 kind), not recreated next time', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(dispatcherUp(deps, { team: 'duo', platform: 'linux', confirmMs: 3, pollMs: 1, sleep: async () => {} })).rejects.toMatchObject({ kind: 'uncertain', code: 'dispatcher_start_unconfirmed' })
  await expect(dispatcherUp(deps, { team: 'duo', platform: 'linux' })).rejects.toMatchObject({ code: 'dispatcher_stale' })
  expect(o.created).toHaveLength(1)
})
test('dispatcherUp: already running → already_running without touching Orca; terminal present but stale → dispatcher_stale, nothing typed', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const release = fakeRunning(registry)
  o.calls.length = 0
  expect(await dispatcherUp(deps, { team: 'duo' })).toEqual({ address: 'dispatcher@duo', outcome: 'already_running' })
  expect(o.calls).toEqual([])
  release(); await new Promise((r) => setImmediate(r))
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  await expect(dispatcherUp(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'dispatcher_stale', hint: expect.stringContaining('wl dispatcher down duo --close') })
  expect(o.sent).toEqual([])
})
test('dispatcherUp before the team has a Run → run_not_ready', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.setRunId('duo', null)
  await expect(dispatcherUp(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'run_not_ready' })
})
test('dispatcherDown: noop without --close; closes, then already_gone; the coordinator is not handed back', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' }); registry.updateCoordinatorHandle('duo', 'term-dsp')
  expect(await dispatcherDown(deps, { team: 'duo', close: false })).toEqual({ address: 'dispatcher@duo', outcome: 'noop' })
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'closed' })
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'already_gone' })
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
