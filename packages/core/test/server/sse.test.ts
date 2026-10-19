import { expect, test } from 'vitest'
import { cursorFrom, TeamFeeds } from '../../src/server/sse.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import type { LogCursor } from '../../src/commands/log.js'

test('cursorFrom handles undefined and valid Last-Event-ID', () => {
  const start: LogCursor = { task: 10, patrol: 20, command: 30 }
  expect(cursorFrom(undefined, start)).toEqual(start)
  expect(cursorFrom('task:5', start)).toEqual({ task: 5, patrol: 20, command: 30 })
  expect(cursorFrom('patrol:15', start)).toEqual({ task: 10, patrol: 15, command: 30 })
  expect(cursorFrom('command:25', start)).toEqual({ task: 10, patrol: 20, command: 25 })
  expect(cursorFrom('invalid:format', start)).toEqual(start)
})

test('first connection gets no history; new rows after it are pushed with source:id ids', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }

  // Seed an initial event before connection
  deps.registry.appendAudit({ team: 'duo', actor: 'human', command: 'test', target: null, outcome: 'ok' })

  const writes: string[] = []
  let tickTimeline: () => Promise<void> = async () => {}

  const feeds = new TeamFeeds(d, {
    setTimer: ((fn: any, ms: number) => {
      if (ms === 2000) tickTimeline = fn
      return 1 as any
    }) as any,
    clearTimer: () => {},
  })

  const unsub = await feeds.subscribe('duo', (chunk) => writes.push(chunk))

  // Initially no history
  expect(writes).toHaveLength(0)

  // Now add an audit event after connection
  deps.registry.appendAudit({ team: 'duo', actor: 'human', command: 'after', target: null, outcome: 'ok' })
  await tickTimeline()

  expect(writes.length).toBeGreaterThan(0)
  const payload = writes.join('')
  expect(payload).toContain('event: timeline\n')
  expect(payload).toContain('id: command:2\n')
  expect(payload).toContain('"action":"after"')

  unsub()
  feeds.closeAll()
})

test('snapshot is pushed only when the hash changes', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }

  const writes: string[] = []
  let tickSnapshot: () => Promise<void> = async () => {}

  const feeds = new TeamFeeds(d, {
    setTimer: ((fn: any, ms: number) => {
      if (ms === 5000) tickSnapshot = fn
      return 1 as any
    }) as any,
    clearTimer: () => {},
  })

  const unsub = await feeds.subscribe('duo', (chunk) => writes.push(chunk))

  // First tick pushes snapshot
  await tickSnapshot()
  expect(writes.some((w) => w.includes('event: snapshot\n'))).toBe(true)
  const count1 = writes.filter((w) => w.includes('event: snapshot\n')).length
  expect(count1).toBe(1)

  // Second tick without changes pushes nothing
  await tickSnapshot()
  const count2 = writes.filter((w) => w.includes('event: snapshot\n')).length
  expect(count2).toBe(1)

  unsub()
  feeds.closeAll()
})

test('two subscribers on one team share one loop; the loop stops when both leave', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }

  let timerCount = 0
  const feeds = new TeamFeeds(d, {
    setTimer: ((fn: any) => {
      timerCount++
      return timerCount as any
    }) as any,
    clearTimer: () => {
      timerCount--
    },
  })

  const unsub1 = await feeds.subscribe('duo', () => {})
  const initialTimers = timerCount
  expect(initialTimers).toBeGreaterThan(0)

  const unsub2 = await feeds.subscribe('duo', () => {})
  // No new timers for second subscriber
  expect(timerCount).toBe(initialTimers)

  unsub1()
  expect(timerCount).toBe(initialTimers)

  unsub2()
  expect(timerCount).toBe(0)
})
