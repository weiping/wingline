import { expect, test } from 'vitest'
import { down } from '../../src/commands/down.js'
import { FakeOrca, mkDeps } from './fake-client.js'

function seeded(orca: FakeOrca) {
  const m = mkDeps(orca)
  const { registry } = m
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'abcdef1234567890', runId: null, status: 'up' })
  for (const [p, lead] of [['builder', true], ['checker', false]] as const) {
    registry.upsertPost({ address: `${p}@duo`, team: 'duo', agent: 'claude', worktree: 'current', handle: p, status: 'live', isLead: lead })
  }
  orca.terminals = [
    { handle: 'b1', title: 'builder@duo', connected: true, worktreeId: 'w' },
    { handle: 'c1', title: 'checker@duo', connected: true, worktreeId: 'w' },
  ]
  return m
}

test('default down only marks the team stopped, no orca call at all', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  const r = await down(deps, { team: 'duo', close: false })
  expect(r.posts.map((p) => p.outcome)).toEqual(['stopped', 'stopped'])
  expect(o.calls).toEqual([])
  expect(registry.getTeam('duo')!.status).toBe('stopped')
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['live', 'live'])
})

test('--close marks closed when ptyKilled is true', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  const r = await down(deps, { team: 'duo', close: true })
  expect(r.posts.map((p) => p.outcome)).toEqual(['closed', 'closed'])
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['closed', 'closed'])
  expect(registry.getTeam('duo')!.status).toBe('stopped')
  expect(o.terminals).toEqual([])
})

test('--close with ptyKilled false is uncertain: all states written first, then it throws', async () => {
  const o = new FakeOrca()
  o.ptyKilled = false
  const { deps, registry } = seeded(o)
  await expect(down(deps, { team: 'duo', close: true })).rejects.toMatchObject({ kind: 'uncertain', code: 'close_unconfirmed' })
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['uncertain', 'uncertain'])
  expect(o.calls.filter((c) => c === 'terminalClose')).toHaveLength(2)
  expect(registry.getTeam('duo')!.status).toBe('stopped')
})

test('--close on a missing terminal is already_gone and recorded closed', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  o.terminals = [o.terminals[1]!]
  const r = await down(deps, { team: 'duo', close: true })
  expect(r.posts.map((p) => p.outcome)).toEqual(['already_gone', 'closed'])
  expect(registry.getPost('builder@duo')!.status).toBe('closed')
})

test('close ids are fresh after an earlier completed close', async () => {
  const o = new FakeOrca()
  const { deps } = seeded(o)
  await down(deps, { team: 'duo', close: true })
  o.terminals = [{ handle: 'b2', title: 'builder@duo', connected: true, worktreeId: 'w' }]
  const closed: string[] = []
  const orig = o.terminalClose.bind(o)
  o.terminalClose = async (a) => { closed.push(a.handle); return orig(a) }
  await down(deps, { team: 'duo', close: true })
  expect(closed).toEqual(['b2'])
})

test('unknown team is an input error', async () => {
  await expect(down(seeded(new FakeOrca()).deps, { team: 'nope', close: false })).rejects.toMatchObject({ kind: 'input', code: 'team_unknown' })
})

test('--close preflights: unreachable orca stops before any change', async () => {
  const o = new FakeOrca()
  o.reachable = false
  const { deps, registry } = seeded(o)
  await expect(down(deps, { team: 'duo', close: true })).rejects.toMatchObject({ code: 'runtime_unavailable' })
  expect(registry.getTeam('duo')!.status).toBe('up')
})
