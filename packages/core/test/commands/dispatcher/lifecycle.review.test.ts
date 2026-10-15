// 审查方测试（spec 第 2、2.1、2.2 节）：调度员生命周期。
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  HEARTBEAT_STALE_MS, HEARTBEAT_TAKEOVER_MS, dispatcherDown, dispatcherHealth, dispatcherLaunchCommand, dispatcherUp,
} from '../../../src/commands/dispatcher/lifecycle.js'
import type { Registry } from '../../../src/registry/registry.js'
import { FakeOrca, clock, seedRunningTeam } from '../fake-client.js'

const P = { node: '/usr/bin/node', script: '/opt/wl/main.js', team: 'duo', home: '/h', orca: '/o' }
const noSleep = async () => {}

function holdLock(registry: Registry) {
  let release!: () => void
  void registry.withTeamLock('dispatcher:duo', () => { registry.heartbeat('dispatcher:duo'); return new Promise<void>((r) => { release = r }) }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
  return async () => { release(); await new Promise((r) => setImmediate(r)) }
}
function forgeLock(home: string, pid: number, at: string, hb: string | null) {
  const raw = new DatabaseSync(path.join(home, 'state.db'))
  raw.prepare('INSERT OR REPLACE INTO locks(team, pid, at, heartbeat_at) VALUES (?, ?, ?, ?)').run('dispatcher:duo', pid, at, hb)
  raw.close()
}

test('thresholds: display stale at 180 s, takeover at 600 s (spec 2.2)', () => {
  expect(HEARTBEAT_STALE_MS).toBe(180_000)
  expect(HEARTBEAT_TAKEOVER_MS).toBe(600_000)
})

test('POSIX: a home path with spaces and quotes stays one shell word; the team is not quoted', () => {
  const cmd = dispatcherLaunchCommand({ platform: 'darwin', ...P, home: "/Users/a b/it's" })
  expect(cmd).toBe("'/usr/bin/node' '/opt/wl/main.js' dispatcher run duo --home '/Users/a b/it'\\''s' --orca '/o'")
  const r = spawnSync('sh', ['-c', `printf '%s\\n' ${cmd.replace(/^'\/usr\/bin\/node' /, '')}`], { encoding: 'utf8' })
  if (r.status === 0) expect(r.stdout.split('\n')).toContain("/Users/a b/it's")
})

test('POSIX: $ and backticks inside single quotes are not expanded', () => {
  const cmd = dispatcherLaunchCommand({ platform: 'linux', ...P, orca: '/o/$HOME/`id`' })
  expect(cmd).toContain("--orca '/o/$HOME/`id`'")
})

test('Windows: the first word is bare node (not process.execPath), even when node path is given', () => {
  const cmd = dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: true, ...P, node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\wl\\main.js', home: 'C:\\h', orca: 'C:\\o.exe' })
  expect(cmd.startsWith('node "C:\\wl\\main.js" ')).toBe(true)
  expect(cmd).not.toContain('Program Files')
})

test.each(['script', 'orca'] as const)('Windows: a %% in %s (not only home) is refused', (field) => {
  expect(() => dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: true, ...P, [field]: 'C:\\a%PATH%b' }))
    .toThrow(expect.objectContaining({ code: 'dispatcher_launch_unsupported', kind: 'input' }))
})

test('Windows refusal hint names the manual method: a terminal titled dispatcher@<team> running wl dispatcher run <team>', () => {
  try { dispatcherLaunchCommand({ platform: 'win32', nodeOnPath: false, ...P }); expect.unreachable() } catch (e: any) {
    expect(e.hint).toContain('dispatcher@duo'); expect(e.hint).toContain('wl dispatcher run duo')
  }
})

test('health: a dead pid with a fresh heartbeat is stale (pid matters, not only the heartbeat)', () => {
  const c = clock(); const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { now: c.now })
  const now = c.now().toISOString()
  forgeLock(deps.home, spawnSync(process.execPath, ['-e', '']).pid!, now, now)
  expect(dispatcherHealth(deps, 'duo').state).toBe('stale')
})

test('health: heartbeat exactly 180 s old is still running; 1 ms later stale', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const release = holdLock(registry)
  c.advance(HEARTBEAT_STALE_MS)
  expect(dispatcherHealth(deps, 'duo').state).toBe('running')
  c.advance(1)
  expect(dispatcherHealth(deps, 'duo')).toMatchObject({ state: 'stale', ageMs: HEARTBEAT_STALE_MS + 1 })
  await release()
})

test('health only looks at its own team\'s dispatcher lock (the team lock is not a dispatcher)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await registry.withTeamLock('duo', () => { expect(dispatcherHealth(deps, 'duo').state).toBe('never') })
})

test('up: team_unknown for an unregistered team, before any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o); o.calls.length = 0
  await expect(dispatcherUp(deps, { team: 'ghost', platform: 'linux', sleep: noSleep })).rejects.toMatchObject({ code: 'team_unknown' })
  expect(o.calls).toEqual([])
})

test('up: creates exactly one terminal with the explicit --orca path, does not wait for tui-idle, returns the handle', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  let release: (() => Promise<void>) | undefined
  o.onCreate = () => { release = holdLock(registry) }
  const r = await dispatcherUp(deps, { team: 'duo', platform: 'linux', sleep: noSleep })
  expect(r).toMatchObject({ address: 'dispatcher@duo', outcome: 'started', handle: expect.any(String) })
  expect(o.created).toHaveLength(1)
  expect(o.created[0]!.command).toContain(`--orca '${deps.orcaPath}'`)
  expect(o.calls).not.toContain('terminalWait')
  expect(o.sent).toEqual([])
  await release!()
})

test('up: the heartbeat appearing on a later poll (not the first) still counts as started', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  let polls = 0; let release: (() => Promise<void>) | undefined
  const sleep = async () => { if (++polls === 3) release = holdLock(registry) }
  await expect(dispatcherUp(deps, { team: 'duo', platform: 'linux', confirmMs: 10_000, pollMs: 1000, sleep })).resolves.toMatchObject({ outcome: 'started' })
  await release!()
})

test('up: unconfirmed hint points at orca terminal show with the new handle', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const err = await dispatcherUp(deps, { team: 'duo', platform: 'linux', confirmMs: 2, pollMs: 1, sleep: noSleep }).catch((e) => e)
  const handle = o.terminals.find((t) => t.title === 'dispatcher@duo')!.handle
  expect(err).toMatchObject({ kind: 'uncertain', code: 'dispatcher_start_unconfirmed', hint: expect.stringContaining(`orca terminal show --terminal ${handle}`) })
})

test('up: a stale lock row with no terminal (process died, terminal closed) creates a new terminal', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const now = c.now().toISOString()
  forgeLock(deps.home, spawnSync(process.execPath, ['-e', '']).pid!, now, now)
  let release: (() => Promise<void>) | undefined
  o.onCreate = () => { release = holdLock(registry) }
  await expect(dispatcherUp(deps, { team: 'duo', platform: 'linux', sleep: noSleep })).resolves.toMatchObject({ outcome: 'started' })
  await release!()
})

test('up: dispatcher_stale is an input error (exit 1) and suggests rerunning the launch command', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  const err = await dispatcherUp(deps, { team: 'duo', platform: 'linux', sleep: noSleep }).catch((e) => e)
  expect(err).toMatchObject({ kind: 'input', code: 'dispatcher_stale' })
  expect(err.hint).toContain('dispatcher run duo')
  expect(o.created).toEqual([])
})

test('down --close closes only the dispatcher terminal; posts and the Run are untouched', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  await dispatcherDown(deps, { team: 'duo', close: true })
  expect(o.terminals.map((t) => t.handle).sort()).toEqual(['coord-1', 'term-b', 'term-c'])
  expect(o.orch).toEqual([])
})

test('down without --close makes no Orca call at all; unknown team → team_unknown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o); o.calls.length = 0
  await dispatcherDown(deps, { team: 'duo', close: false })
  expect(o.calls).toEqual([])
  await expect(dispatcherDown(deps, { team: 'ghost', close: true })).rejects.toMatchObject({ code: 'team_unknown' })
})
