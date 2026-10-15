// 审查方测试（spec 第 6.1、6.2、6.4 节）：分级推进的边界。
import { expect, test, vi } from 'vitest'
import { MAX_BACKOFF_MS, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, advancePatrol } from '../../../src/commands/dispatcher/advance.js'
import type { SignalHit } from '../../../src/commands/dispatcher/signals.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, clock, seedRunningTeam } from '../fake-client.js'

const P = PATROL_INTERVAL_MS
const hit = (over: Partial<SignalHit> = {}): SignalHit => ({ post: 'checker@duo', signal: 'no_progress', taskId: 't1', minutes: 25, ...over })
function world(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca(); const s = seedRunningTeam(o, { now: c.now, yaml })
  const ctx = () => ({ team: s.registry.getTeam('duo')!, spec: loadTeamSpec(s.registry.getTeam('duo')!.specPath) })
  const ops = { doneTask: vi.fn(async () => ({ outcome: 'done' as const })), recoverTask: vi.fn(async () => ({ status: 'dispatched' as const, epoch: 1 })) }
  const scan = (hits: SignalHit[], observeOnly = false) => advancePatrol(s.deps, ctx(), hits, { observeOnly, ops: ops as never })
  const row = (h: SignalHit = hit()) => s.registry.getPatrolState('duo', h.post, h.signal, h.taskId)
  const events = (action: string) => s.registry.listPatrolEvents('duo').filter((e) => e.action === action)
  return { c, o, ...s, ops, scan, row, events }
}
/** 推到指定级别：每轮之间隔一个周期。 */
async function climb(w: ReturnType<typeof world>, h: SignalHit, rounds: number) { for (let i = 0; i < rounds; i++) { await w.scan([h]); w.c.advance(P) } }

test('constants: 5-minute interval, 1-hour revive window, 4-hour backoff cap', () => {
  expect([P, REVIVE_WINDOW_MS, MAX_BACKOFF_MS]).toEqual([300_000, 3_600_000, 14_400_000])
})

test('a scan with no hits and no rows does nothing and sends nothing', async () => {
  const w = world(); await w.scan([])
  expect(w.registry.listPatrolState('duo')).toEqual([]); expect(w.o.calls.filter((c) => c === 'terminalSend')).toEqual([])
})

test('the level-1 nudge is a single line that does not start with y/1 and carries the real minutes and the commands', async () => {
  const w = world(); await climb(w, hit({ minutes: 37 }), 2)
  const t = w.o.sent[0]!.text
  expect(t).not.toMatch(/[\r\n]/); expect(t).not.toMatch(/^\s*[yY1]/)
  expect(t).toContain('37 分钟'); expect(t).toContain('wl task done t1'); expect(t).toContain('wl task escalate t1')
})

test('owner_idle nudge goes to the owner terminal and names start and release', async () => {
  const w = world(); await climb(w, hit({ signal: 'owner_idle', taskId: 'i1', minutes: 45 }), 2)
  expect(w.o.sent[0]).toMatchObject({ handle: 'term-c', text: expect.stringContaining('wl task start i1') })
  expect(w.o.sent[0]!.text).toContain('wl task release i1')
})

test('a hushed post is not typed to, but the level still advances (level is written before acting)', async () => {
  const w = world(); w.registry.hush('duo', 'checker@duo', new Date(w.c.now().getTime() + 86_400_000).toISOString())
  await climb(w, hit(), 2)
  expect(w.row()!.level).toBe(1); expect(w.o.sent).toEqual([])
  expect(w.events('nudge').map((e) => e.outcome)).toEqual(['skip_hushed'])
})

test('an action that throws still leaves the new level written, and the next subject is processed', async () => {
  const w = world(); w.ops.doneTask.mockRejectedValue(new Error('kaboom'))
  const u = hit({ post: 'builder@duo', signal: 'done_unfinished', taskId: 'u', epoch: 0 })
  const i = hit({ signal: 'owner_idle', taskId: 'i' })
  await climb(w, u, 1); await w.scan([u, i]); w.c.advance(P); await w.scan([u, i])
  expect(w.row(u)!.level).toBeGreaterThanOrEqual(1)
  expect(w.row(i)!.level).toBe(1)
})

test('next_due_at follows P × 2^notify_count and is capped at 4 hours', async () => {
  const w = world(); const h = hit({ signal: 'waiting_approval' })
  await climb(w, h, 2)                                                          // 0 → 2
  const gaps: number[] = []
  for (let i = 0; i < 80; i++) {
    const before = w.events('notify').length
    await w.scan([h])
    if (w.events('notify').length > before && w.row(h)!.nextDueAt) gaps.push(Date.parse(w.row(h)!.nextDueAt!) - w.c.now().getTime())
    w.c.advance(P)
  }
  const distinct = [...new Set(gaps)]
  expect(distinct.slice(0, 3)).toEqual([2 * P, 4 * P, 8 * P])
  expect(Math.max(...distinct)).toBe(MAX_BACKOFF_MS)
})

test('clearing a nudged no_progress row nulls last_nudged_at and records a cleared event', async () => {
  const w = world(); await climb(w, hit(), 2)
  expect(w.row()!.lastNudgedAt).not.toBeNull()
  await w.scan([])
  expect(w.row()).toMatchObject({ clearedAt: w.c.now().toISOString(), lastNudgedAt: null })
  expect(w.events('cleared')).toHaveLength(1)
})

test('revive exactly at the 1-hour mark resumes at the old level', async () => {
  const w = world(); await climb(w, hit(), 3)                                 // level 2
  await w.scan([]); w.c.advance(REVIVE_WINDOW_MS); await w.scan([hit()])
  expect(w.row()!.level).toBe(2)
})

test('a revived row does not act in the same scan, and waits a full interval before the next level', async () => {
  const w = world(); await climb(w, hit(), 2)                                 // level 1
  await w.scan([]); w.c.advance(P); const n = w.o.sent.length
  await w.scan([hit()]); expect(w.o.sent.length).toBe(n)
  w.c.advance(P - 1); await w.scan([hit()]); expect(w.row()!.level).toBe(1)
  w.c.advance(1); await w.scan([hit()]); expect(w.row()!.level).toBe(2)
})

test('observe-only scan: new rows are inserted, existing rows do not advance, nothing is sent', async () => {
  const w = world(); await climb(w, hit(), 2)                                 // level 1
  const n = w.o.sent.length
  await w.scan([hit(), hit({ taskId: 't2' })], true)
  expect(w.row()!.level).toBe(1); expect(w.row(hit({ taskId: 't2' }))!.level).toBe(0); expect(w.o.sent.length).toBe(n)
})

test('a bypassed row already at level 2 (put by the inbox) is not notified again by the scan', async () => {
  const w = world(); const at = w.c.now().toISOString()
  w.registry.putPatrolState({ team: 'duo', post: 'checker@duo', signal: 'bypassed', taskId: 'b', level: 2, since: at, levelAt: at, lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  await climb(w, hit({ signal: 'bypassed', taskId: 'b' }), 6)
  expect(w.events('notify')).toEqual([])
})

test('overdue: the human text names the task id without the #epoch suffix', async () => {
  const w = world(); await climb(w, hit({ signal: 'overdue', taskId: 't1#3', minutes: 75 }), 2)
  const t = w.o.sent.at(-1)!.text
  expect(t).toContain('t1'); expect(t).not.toContain('#3'); expect(t).toContain('wl attention duo')
})

test('waiting_answer notice quotes the question and gives the reply command', async () => {
  const w = world(); await climb(w, hit({ signal: 'waiting_answer', question: '用 a 还是 b？', messageId: 'msg-7' }), 2)
  expect(w.o.sent.at(-1)!.text).toMatch(/用 a 还是 b？.*wl dispatcher reply duo msg-7/)
})

test('done_unfinished: verdict_missing clears the signal without notifying anyone', async () => {
  const w = world(); w.ops.doneTask.mockRejectedValue(new WinglineError('input', 'verdict_missing', 'gone'))
  const u = hit({ post: 'builder@duo', signal: 'done_unfinished', taskId: 'u', epoch: 0 })
  await climb(w, u, 2)
  expect(w.row(u)!.clearedAt).not.toBeNull(); expect(w.events('notify')).toEqual([])
})

test('done_unfinished: success records rerun_done and clears; reruns are one interval apart (no exponential backoff)', async () => {
  const w = world(); w.ops.doneTask.mockRejectedValueOnce(new WinglineError('uncertain', 'orca_timeout', 't'))
  const u = hit({ post: 'builder@duo', signal: 'done_unfinished', taskId: 'u', epoch: 1 })
  await w.scan([u]); w.c.advance(P); await w.scan([u])                     // 第 1 次：失败
  expect(w.ops.doneTask).toHaveBeenCalledTimes(1)
  w.c.advance(P); await w.scan([u])                                       // 一个周期后第 2 次：成功
  expect(w.ops.doneTask).toHaveBeenCalledTimes(2)
  expect(w.events('rerun_done').map((e) => e.outcome)).toContain('ok')
  expect(w.row(u)!.clearedAt).not.toBeNull()
})

test('dead_assignee with auto_recover but owner offline → notify, never recover', async () => {
  const w = world(DUO_YAML + 'patrol:\n  auto_recover: true\n')
  await climb(w, hit({ signal: 'dead_assignee', taskId: 'd', command: 'wl task recover d', ownerAlive: false }), 3)
  expect(w.ops.recoverTask).not.toHaveBeenCalled()
  expect(w.events('notify').length).toBeGreaterThanOrEqual(1)
})

test('auto recover is not attempted on the first (observing) scan, only after one full interval', async () => {
  const w = world(DUO_YAML + 'patrol:\n  auto_recover: true\n'); const h = hit({ signal: 'dead_assignee', taskId: 'd', command: 'wl task recover d', ownerAlive: true })
  await w.scan([h]); w.c.advance(P - 1); await w.scan([h])
  expect(w.ops.recoverTask).not.toHaveBeenCalled()
  w.c.advance(1); await w.scan([h])
  expect(w.ops.recoverTask).toHaveBeenCalledTimes(1)
})

test('freeze writes frozen_posts with reason/signal and tells the lead how to unfreeze', async () => {
  const w = world(); await climb(w, hit(), 4)
  expect(w.registry.getFrozen('checker@duo')).toMatchObject({ signal: 'no_progress', reason: expect.stringContaining('no_progress') })
  expect(w.o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: expect.stringContaining('wl dispatcher unfreeze checker@duo') })
})

test('a frozen post\'s rows keep getting observed (attention can see them) but no actions', async () => {
  const w = world(); w.registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  await climb(w, hit({ signal: 'waiting_approval', taskId: 'a' }), 4)
  expect(w.row(hit({ signal: 'waiting_approval', taskId: 'a' }))).not.toBeNull()
  expect(w.events('notify')).toEqual([])
})

test('two signals on the same post advance independently', async () => {
  const w = world(); const a = hit(); const b = hit({ signal: 'overdue', taskId: 't1#0' })
  await w.scan([a]); w.c.advance(P); await w.scan([a, b]); w.c.advance(P); await w.scan([a, b])
  expect([w.row(a)!.level, w.row(b)!.level]).toEqual([2, 2])
})
