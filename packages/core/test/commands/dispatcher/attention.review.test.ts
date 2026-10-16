// 审查方测试（spec 第 2、6.5 节）：wl attention 与 dispatcher status。
import { expect, test } from 'vitest'
import { attention, dispatcherStatus } from '../../../src/commands/dispatcher/attention.js'
import { WinglineError } from '../../../src/errors.js'
import type { PatrolStateRow } from '../../../src/registry/registry.js'
import { FakeOrca, clock, seedRunningTeam } from '../fake-client.js'

const st = (over: Partial<PatrolStateRow>): PatrolStateRow => ({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, ...over })

test('signals: only uncleared rows with level ≥ 1, highest level first', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.putPatrolState(st({ taskId: 'a', level: 0 }))
  registry.putPatrolState(st({ taskId: 'b', level: 1 }))
  registry.putPatrolState(st({ taskId: 'c', level: 3 }))
  registry.putPatrolState(st({ taskId: 'd', level: 2, clearedAt: 'Z' }))
  registry.putPatrolState(st({ taskId: 'e', level: 2, signal: 'waiting_answer' }))
  expect((await attention(deps, 'duo')).signals.map((s) => s.taskId)).toEqual(['c', 'e', 'b'])
})

test('answered questions are not listed; open ones keep their full body', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const long = '第一行\n' + 'x'.repeat(2000)
  registry.recordQuestion({ team: 'duo', messageId: 'm1', taskId: 't', dispatchId: 'd', asker: 'checker@duo', body: long, options: [], relayedAt: 'T' })
  registry.recordQuestion({ team: 'duo', messageId: 'm2', taskId: 't', dispatchId: 'd', asker: 'checker@duo', body: 'b', options: [], relayedAt: 'T' })
  registry.answerQuestion('m2', 'T2')
  const r = await attention(deps, 'duo')
  expect(r.questions.map((q) => q.messageId)).toEqual(['m1'])
  expect(r.questions[0]!.body).toBe(long)
})

test('stale includes blocked_waiting (pending gates) with its resolve command', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  const { id: gate } = await o.gateCreate({ task: id, question: 'q', from: 'coord-1' }); registry.recordGate(gate, 'duo', id)
  const r = await attention(deps, 'duo')
  expect(r.stale.find((s) => s.reason === 'blocked_waiting')).toMatchObject({ taskId: id, command: expect.stringContaining(gate) })
})

test('frozen posts carry the number of children skipped while frozen', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  for (const n of [1, 2]) { const k = `done:p${n}:0:delivered:checker@duo`; registry.beginRequest(k); registry.finishRequest(k, 'done', { target: 'checker@duo', taskId: `c${n}`, delivery: 'skipped_frozen' }) }
  const k = 'done:p3:0:delivered:checker@duo'; registry.beginRequest(k); registry.finishRequest(k, 'done', { target: 'checker@duo', taskId: 'c3', delivery: 'dispatched' })
  expect((await attention(deps, 'duo')).frozen).toEqual([expect.objectContaining({ post: 'checker@duo', skippedChildren: 2 })])
})

test('final-review m10: skipped count and the unfreeze list only cover the current freeze, not earlier ones', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const skip = (n: number) => { const k = `done:p${n}:0:delivered:checker@duo`; registry.beginRequest(k); registry.finishRequest(k, 'done', { target: 'checker@duo', taskId: `c${n}`, delivery: 'skipped_frozen' }) }
  skip(1); c.advance(60_000)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' }); c.advance(60_000)
  skip(2)
  expect((await attention(deps, 'duo')).frozen).toEqual([expect.objectContaining({ skippedChildren: 1 })])
})

test('final-review m6: repeated warnings are grouped by action+outcome with a count', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  for (let i = 0; i < 40; i++) registry.appendPatrolEvent({ team: 'duo', action: 'loop_error', outcome: 'failed:runtime_unavailable' })
  registry.appendPatrolEvent({ team: 'duo', action: 'loop_error', outcome: 'failed:error' })
  registry.appendPatrolEvent({ team: 'duo', action: 'spec_reload_failed', outcome: 'failed:links_cycle' })
  expect((await dispatcherStatus(deps, 'duo')).warnings).toEqual([
    'loop_error: failed:runtime_unavailable ×40', 'loop_error: failed:error', 'spec_reload_failed: failed:links_cycle',
  ])
})

test('a signal row shows the command recorded with its latest action, or null', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.putPatrolState(st({ signal: 'dead_assignee', taskId: 'd', level: 2 }))
  registry.putPatrolState(st({ signal: 'waiting_approval', taskId: 'w', level: 2 }))
  registry.appendPatrolEvent({ team: 'duo', post: 'checker@duo', signal: 'dead_assignee', taskId: 'd', action: 'notify', detail: { command: 'wl task recover d' } })
  const r = await attention(deps, 'duo')
  expect(Object.fromEntries(r.signals.map((s) => [s.taskId, s.command]))).toEqual({ d: 'wl task recover d', w: null })
})

test('Orca down (terminal list fails): local sections intact, unavailable names the reason', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.putPatrolState(st({ level: 2 }))
  o.faults.push({ method: 'terminalList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const r = await attention(deps, 'duo')
  expect(r.signals).toHaveLength(1)
  expect(r.unavailable.join(' ')).toContain('runtime_unavailable')
})

test('attention on an unknown team → team_unknown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(attention(deps, 'ghost')).rejects.toMatchObject({ code: 'team_unknown' })
})

test('attention reports the dispatcher as stale when its heartbeat is old', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  let release!: () => void
  void registry.withTeamLock('dispatcher:duo', () => { registry.heartbeat('dispatcher:duo'); return new Promise<void>((r) => { release = r }) }, { takeoverAfterMs: 600_000 })
  c.advance(9 * 60_000)
  expect((await attention(deps, 'duo')).dispatcher.state).toBe('stale')
  release(); await new Promise((r) => setImmediate(r))
})

test('dispatcherStatus counts frozen and hushed posts (expired hushes excluded) and attention items', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  registry.hush('duo', 'builder@duo', new Date(c.now().getTime() + 60_000).toISOString())
  registry.hush('duo', 'checker@duo', new Date(c.now().getTime() - 60_000).toISOString())
  registry.putPatrolState(st({ level: 2 }))
  const s = await dispatcherStatus(deps, 'duo')
  expect(s).toMatchObject({ frozen: 1, hushed: 1 })
  expect(s.attentionItems).toBeGreaterThanOrEqual(2)
})

test('dispatcherStatus warnings only cover the last 24 hours', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  registry.appendPatrolEvent({ team: 'duo', action: 'spec_reload_failed', outcome: 'failed:old' })
  c.advance(25 * 3_600_000)
  registry.appendPatrolEvent({ team: 'duo', action: 'spec_reload_failed', outcome: 'failed:new' })
  const w = (await dispatcherStatus(deps, 'duo')).warnings.join(' ')
  expect(w).toContain('new'); expect(w).not.toContain('old')
})

test('end to end: a dead_assignee notice raised by the patrol shows up in attention with its recover command', async () => {
  const { advancePatrol, PATROL_INTERVAL_MS } = await import('../../../src/commands/dispatcher/advance.js')
  const { loadTeamSpec } = await import('../../../src/spec/load.js')
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const ctx = { team: registry.getTeam('duo')!, spec: loadTeamSpec(registry.getTeam('duo')!.specPath) }
  const h = { post: 'checker@duo', signal: 'dead_assignee' as const, taskId: 'd1', command: 'wl task recover d1', ownerAlive: true }
  await advancePatrol(deps, ctx, [h], { observeOnly: false }); c.advance(PATROL_INTERVAL_MS)
  await advancePatrol(deps, ctx, [h], { observeOnly: false })
  expect((await attention(deps, 'duo')).signals).toEqual([expect.objectContaining({ signal: 'dead_assignee', level: 2, command: 'wl task recover d1' })])
})
