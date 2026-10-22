import { expect, test, vi } from 'vitest'
import { advancePatrol, MAX_RERUNS, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS } from '../../../src/commands/dispatcher/advance.js'
import type { SignalHit } from '../../../src/commands/dispatcher/signals.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { clock, FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

const hit = (over: Partial<SignalHit> = {}): SignalHit => ({ post: 'checker@duo', signal: 'no_progress', taskId: 't1', minutes: 25, ...over })
function world(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca(); const s = seedRunningTeam(o, { now: c.now, yaml })
  const ctx = () => ({ team: s.registry.getTeam('duo')!, spec: loadTeamSpec(s.registry.getTeam('duo')!.specPath) })
  const ops = { doneTask: vi.fn(async () => ({ outcome: 'done' as const })), recoverTask: vi.fn(async () => ({ status: 'dispatched' as const, epoch: 1 })) }
  const scan = async (hits: SignalHit[], observeOnly = false) => advancePatrol(s.deps, ctx(), hits, { observeOnly, ops: ops as never })
  const lvl = (h: SignalHit = hit()) => s.registry.getPatrolState('duo', h.post, h.signal, h.taskId)?.level
  return { c, o, ...s, ctx, ops, scan, lvl }
}
const P = PATROL_INTERVAL_MS

test('every signal starts as observed: a first hit writes level 0 and does nothing', async () => {
  const w = world(); await w.scan([hit()])
  expect(w.lvl()).toBe(0); expect(w.o.sent).toEqual([])
})
test('levels advance only after a full interval, and never on an observe-only scan', async () => {
  const w = world(); await w.scan([hit()])
  w.c.advance(P - 1); await w.scan([hit()]); expect(w.lvl()).toBe(0)
  w.c.advance(1); await w.scan([hit()], true); expect(w.lvl()).toBe(0)
  await w.scan([hit()]); expect(w.lvl()).toBe(1)
})
test('no_progress ladder: nudge the post → notify the lead → freeze and tell the lead', async () => {
  const w = world()
  for (let i = 0; i < 4; i++) { await w.scan([hit()]); w.c.advance(P) }
  expect(w.lvl()).toBe(3)
  expect(w.o.sent.map((s) => [s.handle, s.text.slice(0, 12)])).toEqual([['term-c', '[雁阵] 巡查提示：任务'], ['term-b', '[雁阵] checker'], ['term-b', '[雁阵] checker']])
  expect(w.o.sent[0]!.text).toContain('25 分钟没有输出')
  expect(w.registry.getFrozen('checker@duo')).toMatchObject({ signal: 'no_progress' })
})
test('the stuck post is the lead: never "notify yourself", never auto-frozen (freeze_lead false), the notice repeats with exponential backoff', async () => {
  const w = world(); const h = hit({ post: 'builder@duo' })
  for (let i = 0; i < 3; i++) { await w.scan([h]); w.c.advance(P) }
  expect(w.lvl(h)).toBe(2)
  expect(w.o.sent.map((s) => s.handle)).toEqual(['term-b'])
  await w.scan([h]); expect(w.lvl(h)).toBe(2); expect(w.registry.getFrozen('builder@duo')).toBeNull()
  const notices = () => w.registry.listPatrolEvents('duo').filter((e) => e.action === 'notify').length
  const n1 = notices(); w.c.advance(P); await w.scan([h]); expect(notices()).toBe(n1)
  w.c.advance(P); await w.scan([h]); expect(notices()).toBe(n1 + 1)
})
test('freeze_lead: true lets the lead be frozen', async () => {
  const w = world(DUO_YAML + 'patrol:\n  freeze_lead: true\n'); const h = hit({ post: 'builder@duo' })
  for (let i = 0; i < 4; i++) { await w.scan([h]); w.c.advance(P) }
  expect(w.registry.getFrozen('builder@duo')).not.toBeNull()
})
test('waiting_answer and waiting_approval go straight from observed to notifying a human, never nudge, never freeze', async () => {
  const w = world()
  const hs = [hit({ signal: 'waiting_answer', question: '用哪个库？', messageId: 'msg-1' }), hit({ signal: 'waiting_approval', taskId: 't2' })]
  for (let i = 0; i < 6; i++) { await w.scan(hs); w.c.advance(P) }
  expect(w.o.sent.every((s) => s.handle === 'term-b')).toBe(true)
  expect(w.o.sent[0]!.text).toContain('wl dispatcher reply duo msg-1')
  expect(w.registry.getFrozen('checker@duo')).toBeNull()
})
test('a level-1 nudge that finds the post at a prompt reclassifies the subject as waiting_approval', async () => {
  const w = world(); w.o.previews.set('term-c', 'Allow edit? (y/n)')
  await w.scan([hit()]); w.c.advance(P); await w.scan([hit()])
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')).toMatchObject({ clearedAt: expect.any(String) })
  expect(w.lvl(hit({ signal: 'waiting_approval' }))).toBe(0)
  expect(w.o.sent).toEqual([])
})
test('a cleared signal that comes back within an hour resumes at its old level; after an hour it starts over', async () => {
  const w = world()
  for (let i = 0; i < 3; i++) { await w.scan([hit()]); w.c.advance(P) }
  await w.scan([]); expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')!.clearedAt).not.toBeNull()
  w.c.advance(P); await w.scan([hit()]); expect(w.lvl()).toBe(2)
  await w.scan([]); w.c.advance(REVIVE_WINDOW_MS + 1); await w.scan([hit()]); expect(w.lvl()).toBe(0)
})
test('a frozen post is still recorded but nothing is sent and nothing advances', async () => {
  const w = world(); w.registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  for (let i = 0; i < 3; i++) { await w.scan([hit()]); w.c.advance(P) }
  expect(w.lvl()).toBe(0); expect(w.o.sent).toEqual([])
})
test('subjects are isolated and the level is written before acting: the lead offline does not stop the next subject', async () => {
  const w = world(); w.o.terminals = w.o.terminals.filter((t) => t.title !== 'builder@duo')
  const a = hit({ signal: 'waiting_answer', taskId: 'a' }); const b = hit({ signal: 'owner_idle', taskId: 'b' })
  for (let i = 0; i < 3; i++) { await w.scan([a, b]); w.c.advance(P) }
  expect([w.lvl(a), w.lvl(b)]).toEqual([2, 2])
  expect(w.o.sent.map((s) => s.handle)).toEqual(['term-c'])
  expect(w.registry.listPatrolEvents('duo').filter((e) => e.action === 'notify').every((e) => String(e.outcome).includes('skip_offline'))).toBe(true)
})
test('done_unfinished: level 1 reruns wl task done (resume-only) up to 3 times, then notifies', async () => {
  const w = world(); w.ops.doneTask.mockRejectedValue(new WinglineError('uncertain', 'orca_timeout', 't'))
  const h = hit({ post: 'builder@duo', signal: 'done_unfinished', taskId: 'u', epoch: 0, command: 'wl task done u --as builder@duo' })
  for (let i = 0; i < 12; i++) { await w.scan([h]); w.c.advance(P) }
  expect(w.ops.doneTask).toHaveBeenCalledTimes(MAX_RERUNS)
  expect(w.ops.doneTask).toHaveBeenCalledWith(expect.anything(), { id: 'u', as: 'builder@duo', resumeEpoch: 0 })
  expect(w.lvl(h)).toBe(2)
})
test('dead_assignee: notify with the recover command by default; with auto_recover the second consecutive scan recovers', async () => {
  const w1 = world(); const h = hit({ signal: 'dead_assignee', taskId: 'd', command: 'wl task recover d', ownerAlive: true })
  for (let i = 0; i < 2; i++) { await w1.scan([h]); w1.c.advance(P) }
  expect(w1.ops.recoverTask).not.toHaveBeenCalled(); expect(w1.o.sent.at(-1)!.text).toContain('wl task recover d')
  const w2 = world(DUO_YAML + 'patrol:\n  auto_recover: true\n')
  for (let i = 0; i < 2; i++) { await w2.scan([h]); w2.c.advance(P) }
  expect(w2.ops.recoverTask).toHaveBeenCalledWith(expect.anything(), { id: 'd' })
  const w3 = world(DUO_YAML + 'patrol:\n  auto_recover: true\n')
  for (let i = 0; i < 2; i++) { await w3.scan([{ ...h, ownerAlive: false }]); w3.c.advance(P) }
  expect(w3.ops.recoverTask).not.toHaveBeenCalled()
})
test('auto_recover with a dead owner: the level-2 notice is sent once and the row moves to level 2 (no repeat of the same notice next round)', async () => {
  const w = world(DUO_YAML + 'patrol:\n  auto_recover: true\n'); const h = hit({ signal: 'dead_assignee', taskId: 'd', command: 'wl task recover d', ownerAlive: false })
  await w.scan([h]); w.c.advance(P)
  await w.scan([h])
  expect(w.ops.recoverTask).not.toHaveBeenCalled()
  expect(w.o.sent).toHaveLength(1)
  expect(w.lvl(h)).toBe(2)
})
test('once-only signals (bypassed, overdue, call_uncertain) notify once and stay quiet', async () => {
  const w = world(); const h = hit({ signal: 'overdue', taskId: 't1#0', minutes: 61 })
  for (let i = 0; i < 6; i++) { await w.scan([h]); w.c.advance(P) }
  expect(w.o.sent).toHaveLength(1)
})
test('gate_streak skips the nudge: observed → notify → freeze', async () => {
  const w = world(); const h = hit({ signal: 'gate_streak', taskId: '' })
  for (let i = 0; i < 3; i++) { await w.scan([h]); w.c.advance(P) }
  expect(w.o.sent.map((s) => s.handle)).toEqual(['term-b', 'term-b'])
  expect(w.registry.getFrozen('checker@duo')).toMatchObject({ signal: 'gate_streak' })
})
test('advance notifications go through syncWorktreeForPost instead of overwriting the comment', async () => {
  const restore = setWorktreeSupport({ workspaceStatus: false, comment: true, commentMax: null })
  try {
    const w = world(DUO_YAML + 'patrol:\n  worktree_comment: true\n'); const h = hit({ signal: 'waiting_approval' })
    await w.scan([h]); w.c.advance(P); await w.scan([h]); await w.scan([])
    // 第 2 级通知：整段注释带上 ⚠；恢复后再算一次，⚠ 消失。每岗位一行，通知不再覆盖整段
    expect(w.o.comments.map((x) => x.comment)).toEqual([
      'builder：空闲\nchecker：空闲 ⚠ 等待批准',
      'builder：空闲\nchecker：空闲',
    ])
  } finally {
    restore()
  }
})
