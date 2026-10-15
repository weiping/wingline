import { expect, test } from 'vitest'
import { actorOf, isOwnTerminal, requireActor, resolveActor, resolveHandle } from '../../../src/commands/task/identity.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

test('explicit --as wins and needs no Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  o.calls.length = 0
  expect(await resolveActor(deps, 'builder@duo')).toEqual({ address: 'builder@duo', explicit: true })
  expect(o.calls).toEqual([])
})
test('implicit: ORCA_TERMINAL_HANDLE is looked up by terminal title', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await resolveActor(deps)).toEqual({ address: 'checker@duo', explicit: false, handle: 'term-c' })
})
test('a terminal whose title is not a registered post resolves to nobody → actor_required whose hint mentions --as and Windows', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-x' } })
  o.terminals.push({ handle: 'term-x', title: 'zsh', connected: true, worktreeId: 'w' })
  expect(await resolveActor(deps)).toBeNull()
  await expect(requireActor(deps)).rejects.toMatchObject({ code: 'actor_required', hint: expect.stringMatching(/--as[\s\S]*Windows/) })
})
test('resolveHandle with explicit --as uses locatePost, never the caller\'s own ORCA_TERMINAL_HANDLE', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await resolveHandle(deps, { address: 'builder@duo', explicit: true })).toBe('term-b')
})
test('resolveHandle implicit returns the env handle without an Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.calls.length = 0
  expect(await resolveHandle(deps, { address: 'checker@duo', explicit: false, handle: 'term-c' })).toBe('term-c')
  expect(o.calls).toEqual([])
})
test('explicit address with no terminal → post_offline', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  await expect(resolveHandle(deps, { address: 'builder@duo', explicit: true })).rejects.toMatchObject({ code: 'post_offline' })
})
test('actorOf maps to task_log fields', () => {
  expect(actorOf(null)).toEqual({ actor: 'human', actorSource: 'human' })
  expect(actorOf({ address: 'b@duo', explicit: true })).toEqual({ actor: 'b@duo', actorSource: 'explicit' })
  expect(actorOf({ address: 'b@duo', explicit: false, handle: 'h' })).toEqual({ actor: 'b@duo', actorSource: 'implicit' })
})

test('no --as and no ORCA_TERMINAL_HANDLE → nobody (a human at a plain shell), without any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.calls.length = 0
  expect(await resolveActor(deps)).toBeNull()
  expect(o.calls).toEqual([])
  await expect(requireActor(deps)).rejects.toMatchObject({ code: 'actor_required' })
})
test('requireActor returns the resolved actor for both explicit and implicit callers', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await requireActor(deps, 'builder@duo')).toEqual({ address: 'builder@duo', explicit: true })
  expect(await requireActor(deps)).toEqual({ address: 'checker@duo', explicit: false, handle: 'term-c' })
})
test('a stale ORCA_TERMINAL_HANDLE (no such terminal any more) resolves to nobody', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-gone' } })
  expect(await resolveActor(deps)).toBeNull()
})
test('implicit resolution only counts titles that are registered posts (the coordinator terminal is not a post)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'coord-1' } })
  expect(await resolveActor(deps)).toBeNull()
})
test('an unreachable Orca during implicit resolution propagates the error instead of silently treating the caller as human', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  o.faults.push({ method: 'terminalList', when: 'before', error: new Error('orca down') })
  await expect(resolveActor(deps)).rejects.toThrow('orca down')
})
test('isOwnTerminal compares against ORCA_TERMINAL_HANDLE only', () => {
  const o = new FakeOrca()
  expect(isOwnTerminal(seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } }).deps, 'term-b')).toBe(true)
  expect(isOwnTerminal(seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } }).deps, 'term-c')).toBe(false)
  expect(isOwnTerminal(seedRunningTeam(o).deps, 'term-b')).toBe(false)
})
