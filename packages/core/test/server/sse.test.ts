import fs from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cursorFrom, TeamFeeds } from '../../src/server/sse.js'
import { draftPathOf } from '../../src/spec/draft.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../commands/fake-client.js'
import type { LogCursor } from '../../src/commands/log.js'

// 探针结论未定时 workspaceStatus 默认不支持，会多出一条“Orca 不支持”告警；这里只数草稿告警
let restoreSupport = () => {}
beforeEach(() => {
  restoreSupport = setWorktreeSupport({ workspaceStatus: true, comment: true })
})
afterEach(() => restoreSupport())

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

test('replaySnapshot hands a joining subscriber the current snapshot without waiting for a change; subscribe itself writes nothing', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  let tickSnapshot: () => Promise<void> = async () => {}
  const feeds = new TeamFeeds(d, {
    setTimer: ((fn: any, ms: number) => {
      if (ms === 5000) tickSnapshot = fn
      return 1 as any
    }) as any,
    clearTimer: () => {},
  })
  const first: string[] = []
  const unsubFirst = await feeds.subscribe('duo', (chunk) => first.push(chunk))
  await tickSnapshot()
  expect(first.some((w) => w.includes('event: snapshot\n'))).toBe(true)

  const second: string[] = []
  const unsubSecond = await feeds.subscribe('duo', (chunk) => second.push(chunk))
  expect(second).toEqual([])
  feeds.replaySnapshot('duo', (chunk) => second.push(chunk))
  expect(second.filter((w) => w.includes('event: snapshot\n'))).toHaveLength(1)
  expect(first.filter((w) => w.includes('event: snapshot\n'))).toHaveLength(1)

  unsubFirst(); unsubSecond()
  feeds.closeAll()
})

test('timeline tick 内单次读取失败只 warn，下一次 tick 照常运行', async () => {
  const o = new FakeOrca()
  const { deps, warnings } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }

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

  // 让时间线读的第一次 listAudit 抛错，只失败这一次
  const registry = deps.registry as any
  const realListAudit = registry.listAudit.bind(registry)
  let boom = true
  registry.listAudit = (...args: unknown[]) => {
    if (boom) {
      boom = false
      throw new Error('db locked')
    }
    return realListAudit(...args)
  }

  // 第一次 tick：读失败，只 warn，不写任何东西，也不炸掉循环
  await tickTimeline()
  expect(writes).toHaveLength(0)
  expect(warnings.some((w) => w.includes('SSE timeline tick error for duo'))).toBe(true)

  // 下一次 tick：游标没被污染，照常推送新事件
  deps.registry.appendAudit({ team: 'duo', actor: 'human', command: 'after', target: null, outcome: 'ok' })
  await tickTimeline()
  expect(writes.join('')).toContain('event: timeline\n')
  expect(writes.join('')).toContain('"action":"after"')

  registry.listAudit = realListAudit
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

test('SSE snapshot carries the one attention count, warnings included', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const spec = registry.getTeam('duo')!.specPath
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
  const lastCount = () => {
    const frame = writes.filter((w) => w.includes('event: snapshot\n')).pop()!
    return (JSON.parse(frame.split('\n').find((l) => l.startsWith('data: '))!.slice(6)) as { attention: number }).attention
  }
  await tickSnapshot()
  const before = lastCount()
  fs.writeFileSync(draftPathOf(spec), fs.readFileSync(spec, 'utf8'))
  await tickSnapshot()
  expect(lastCount()).toBe(before + 1)
  unsub()
  feeds.closeAll()
})

test('M-10: subscribing only asks for the newest row ids; it does not page the three event tables (cost no longer grows with history)', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  for (let i = 0; i < 5; i++) registry.appendAudit({ team: 'duo', actor: 'human', command: `c${i}`, target: null, outcome: 'ok' })
  registry.appendPatrolEvent({ team: 'duo', post: 'builder@duo', signal: 'x', taskId: 't', action: 'a' })
  const spies = [vi.spyOn(registry, 'listAudit'), vi.spyOn(registry, 'listPatrolEvents'), vi.spyOn(registry, 'listTeamTaskLog')]
  const writes: string[] = []
  let tickTimeline: () => Promise<void> = async () => {}
  const feeds = new TeamFeeds(d, { setTimer: ((fn: any, ms: number) => { if (ms === 2000) tickTimeline = fn; return 1 as any }) as any, clearTimer: () => {} })
  const unsub = await feeds.subscribe('duo', (c) => writes.push(c))
  expect(spies.map((x) => x.mock.calls.length)).toEqual([0, 0, 0])
  // the cursor is still right: nothing old is replayed, and a row written afterwards is pushed exactly once
  await tickTimeline()
  expect(writes).toHaveLength(0)
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'after', target: null, outcome: 'ok' })
  await tickTimeline()
  expect(writes.filter((w) => w.includes('event: timeline'))).toHaveLength(1)
  unsub()
})

test('a slow tick is not re-entered: while one timeline tick is in flight the next interval skips', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  const registry = deps.registry as any
  const real = registry.listTeamTaskLog.bind(registry)
  registry.listTeamTaskLog = (...args: unknown[]) => {
    calls += 1
    return gate.then(() => real(...args))
  }
  let tickTimeline: () => Promise<void> = async () => {}
  const feeds = new TeamFeeds(d, { setTimer: ((fn: any, ms: number) => { if (ms === 2000) tickTimeline = fn; return 1 as any }) as any, clearTimer: () => {} })
  const unsub = await feeds.subscribe('duo', () => {})
  const first = tickTimeline()
  const second = tickTimeline()
  expect(calls).toBe(1)
  release()
  await Promise.all([first, second])
  registry.listTeamTaskLog = real
  unsub()
  feeds.closeAll()
})

