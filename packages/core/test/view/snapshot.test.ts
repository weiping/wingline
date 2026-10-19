import { expect, test } from 'vitest'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../commands/fake-client.js'
import { attention } from '../../src/commands/dispatcher/attention.js'
import { listTasks } from '../../src/commands/task/query.js'
import { ps } from '../../src/commands/ps.js'

test('core queries run through the decorator share one Orca call per kind within ttl', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  await Promise.all([ps(d, { team: 'duo' }), attention(d, 'duo'), listTasks(d, { team: 'duo' })])
  expect(o.calls.filter((c) => c === 'taskList')).toHaveLength(1)
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(1)
})

test('after ttl, or after any write method, the next read calls Orca again', async () => {
  const o = new FakeOrca()
  let now = 1000
  const cached = cachedOrca(o, { ttlMs: 5000, now: () => now })
  o.terminals.push({ handle: 't1', title: 't1', connected: true, worktreeId: 'wt1' })

  await cached.terminalList()
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(1)

  // Within TTL
  now += 2000
  await cached.terminalList()
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(1)

  // After TTL
  now += 4000
  await cached.terminalList()
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(2)

  // Write method invalidates immediately
  await cached.terminalClose({ handle: 't1' })
  await cached.terminalList()
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(3)
})

test('a failed read is not cached', async () => {
  const o = new FakeOrca()
  const cached = cachedOrca(o)
  o.failListOnce = true
  await expect(cached.taskList({ run: 'run-1' })).rejects.toThrow()
  // Next call succeeds and does not throw cached rejection
  const res = await cached.taskList({ run: 'run-1' })
  expect(res).toEqual([])
})
