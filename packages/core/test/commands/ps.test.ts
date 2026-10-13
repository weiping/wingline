import { expect, test } from 'vitest'
import { ps } from '../../src/commands/ps.js'
import { FakeOrca, mkDeps } from './fake-client.js'

const t = (handle: string, title: string | null, connected = true) => ({ handle, title, connected, worktreeId: 'w' })

function seeded(orca: FakeOrca) {
  const m = mkDeps(orca)
  const { registry } = m
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: 'run-1', status: 'up' })
  registry.upsertPost({ address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'h1', status: 'live', isLead: true })
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'c1', status: 'live', isLead: false })
  return m
}

test('ps merges registry with terminal list and updates a changed handle only', async () => {
  const o = new FakeOrca()
  o.terminals = [t('h2', 'builder@duo'), t('c1', 'checker@duo')]
  const { deps, registry } = seeded(o)
  const rows = await ps(deps, { team: 'duo' })
  expect(rows).toEqual([
    { address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h2', worktree: 'current', isLead: true },
    { address: 'checker@duo', agent: 'codex', status: 'live', handle: 'c1', worktree: 'current', isLead: false },
  ])
  expect(registry.getPost('builder@duo')!.handle).toBe('h2')
  expect(o.calls).not.toContain('terminalCreate')
})

test('ps marks a missing terminal offline and a disconnected one uncertain; registry status untouched', async () => {
  const o = new FakeOrca()
  o.terminals = [t('c1', 'checker@duo', false)]
  const { deps, registry } = seeded(o)
  const rows = await ps(deps, {})
  expect(rows.map((r) => [r.address, r.status])).toEqual([['builder@duo', 'offline'], ['checker@duo', 'uncertain']])
  expect(registry.getPost('builder@duo')!.status).toBe('live')
})

test('ps marks duplicate terminals uncertain', async () => {
  const o = new FakeOrca()
  o.terminals = [t('a', 'builder@duo'), t('b', 'builder@duo')]
  const { deps } = seeded(o)
  expect((await ps(deps, { team: 'duo' }))[0]!.status).toBe('uncertain')
})

test('ps without team lists every team; unknown team is an input error', async () => {
  const o = new FakeOrca()
  const { deps } = seeded(o)
  expect(await ps(deps, {})).toHaveLength(2)
  await expect(ps(deps, { team: 'nope' })).rejects.toMatchObject({ kind: 'input', code: 'team_unknown' })
})

test('ps preflights: unreachable orca is an error', async () => {
  const o = new FakeOrca()
  o.reachable = false
  await expect(ps(seeded(o).deps, {})).rejects.toMatchObject({ code: 'runtime_unavailable' })
})
