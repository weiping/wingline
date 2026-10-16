// 审查方测试（spec 第 5.2、6.1 节）：信号判定边界（纯函数）。
import { expect, test } from 'vitest'
import { LADDERS, NUDGE_GRACE_MS, detectSignals, type ScanSnapshot, type SignalHit } from '../../../src/commands/dispatcher/signals.js'
import type { StaleItem, TaskRow } from '../../../src/commands/task/query.js'
import type { TerminalSummary } from '../../../src/orca/types.js'
import type { DoneVerdictRow, PatrolStateRow, Verdict } from '../../../src/registry/registry.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'

const NOW = new Date('2026-10-15T12:00:00.000Z')
const min = (m: number) => NOW.getTime() - m * 60_000
const iso = (m: number) => new Date(min(m)).toISOString()
const SPEC = loadTeamSpec(mkTeam(DUO_YAML))
const BUDGET = loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  task:\n    max_minutes: 60\n'))
const row = (over: Partial<TaskRow> = {}): TaskRow => ({ id: 't1', status: 'dispatched', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'checker@duo', assigneeHandle: 'term-c', dispatchId: 'ctx-1', epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: iso(60), result: null, ...over })
const term = (handle: string, title: string, lastOutputAt: number | null): TerminalSummary => ({ handle, title, connected: true, worktreeId: 'w', lastOutputAt })
function snap(over: Partial<ScanSnapshot> & { terms?: TerminalSummary[] } = {}): ScanSnapshot {
  const terms = over.terms ?? [term('term-b', 'builder@duo', min(0)), term('term-c', 'checker@duo', min(25))]
  return { now: NOW, lead: 'builder@duo', tasks: [row()], byHandle: new Map(terms.map((t) => [t.handle, t])), byTitle: new Map(terms.map((t) => [t.title!, t])),
    workers: [], stale: [], screens: new Map([['term-c', 'clear']]), openQuestions: [], lastLogAt: new Map(), lastVerdictAt: new Map(), streakAfterCursor: new Map(), unfinished: [], wokeAt: null, ...over } as ScanSnapshot
}
const sigs = (h: SignalHit[]) => h.map((x) => `${x.post}/${x.signal}/${x.taskId}`)
const st = (over: Partial<PatrolStateRow>): PatrolStateRow => ({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 1, since: iso(30), levelAt: iso(10), lastNudgedAt: iso(10), notifyCount: 0, nextDueAt: null, clearedAt: null, ...over })
const quietC = (m: number) => [term('term-b', 'builder@duo', min(0)), term('term-c', 'checker@duo', min(m))]

test('grace window is 5 minutes', () => { expect(NUDGE_GRACE_MS).toBe(300_000) })

test('ladders match spec 5.2: who may be nudged, who may be frozen', () => {
  const nudgers = Object.entries(LADDERS).filter(([, l]) => l.levels.includes(1)).map(([s]) => s).sort()
  const freezers = Object.entries(LADDERS).filter(([, l]) => l.levels.includes(3)).map(([s]) => s).sort()
  expect(freezers).toEqual(['gate_streak', 'no_progress'])
  expect(nudgers).toEqual(['done_unfinished', 'no_progress', 'owner_idle'])
  for (const l of Object.values(LADDERS)) expect(l.levels[0]).toBe(0)
})

test('a ready (not dispatched) task never produces no_progress', () => {
  expect(detectSignals(snap({ tasks: [row({ status: 'ready', assigneeHandle: null, dispatchId: null })] }), SPEC, [])).toEqual([])
})

test('at a prompt but quiet for less than prompt_minutes → nothing at all (neither approval nor no_progress)', () => {
  expect(detectSignals(snap({ terms: quietC(3), screens: new Map([['term-c', 'at_prompt']]) }), SPEC, [])).toEqual([])
})

test('at a prompt for exactly prompt_minutes → not yet waiting_approval', () => {
  expect(detectSignals(snap({ terms: quietC(5), screens: new Map([['term-c', 'at_prompt']]) }), SPEC, [])).toEqual([])
})

test('at a prompt and quiet long enough for no_progress too → only waiting_approval', () => {
  expect(sigs(detectSignals(snap({ terms: quietC(40), screens: new Map([['term-c', 'at_prompt']]) }), SPEC, []))).toEqual(['checker@duo/waiting_approval/t1'])
})

test('screen unknown (terminal show failed) does not block no_progress', () => {
  expect(sigs(detectSignals(snap({ screens: new Map([['term-c', 'unknown']]) }), SPEC, []))).toEqual(['checker@duo/no_progress/t1'])
})

test('worker-list available and silent overrides a stale local open question (answered in the Orca UI)', () => {
  const q = { team: 'duo', messageId: 'm', taskId: 't1', dispatchId: 'ctx-1', asker: 'checker@duo', body: 'b', options: [], relayedAt: iso(30), answeredAt: null }
  const hits = detectSignals(snap({ workers: [{ dispatchId: 'ctx-1', taskId: 't1', terminalHandle: 'term-c', dispatchStatus: 'dispatched', attention: [], liveness: 'live' }], openQuestions: [q] }), SPEC, [])
  expect(hits.map((h) => h.signal)).toEqual(['no_progress'])
})

test('a local open question for an older dispatch of the same task does not mean waiting_answer now', () => {
  const q = { team: 'duo', messageId: 'm', taskId: 't1', dispatchId: 'ctx-0', asker: 'checker@duo', body: 'b', options: [], relayedAt: iso(90), answeredAt: null }
  expect(detectSignals(snap({ workers: null, openQuestions: [q] }), SPEC, []).map((h) => h.signal)).toEqual(['no_progress'])
})

test('waiting_answer also suppresses waiting_approval', () => {
  const w = [{ dispatchId: 'ctx-1', taskId: 't1', terminalHandle: 'term-c', dispatchStatus: 'dispatched', attention: ['input'], liveness: 'live' }]
  expect(detectSignals(snap({ workers: w, terms: quietC(40), screens: new Map([['term-c', 'at_prompt']]) }), SPEC, []).map((h) => h.signal)).toEqual(['waiting_answer'])
})

test('the assignee terminal gone → no no_progress / waiting_* for that task (dead_assignee territory)', () => {
  expect(detectSignals(snap({ terms: [term('term-b', 'builder@duo', min(0))] }), SPEC, [])).toEqual([])
})

test('a dispatched task without claimed_by is attributed by the assignee terminal title', () => {
  expect(sigs(detectSignals(snap({ tasks: [row({ claimedBy: null })] }), SPEC, []))).toEqual(['checker@duo/no_progress/t1'])
})

test('no lastOutputAt at all: dispatched_at is the floor', () => {
  expect(detectSignals(snap({ terms: [term('term-c', 'checker@duo', null)], tasks: [row({ dispatchedAt: iso(10) })] }), SPEC, [])).toEqual([])
  expect(sigs(detectSignals(snap({ terms: [term('term-c', 'checker@duo', null)], tasks: [row({ dispatchedAt: iso(21) })] }), SPEC, []))).toEqual(['checker@duo/no_progress/t1'])
})

test('custom no_progress_minutes is honoured', () => {
  const s = loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 60\n'))
  expect(detectSignals(snap(), s, [])).toEqual([])
})

test('after a nudge: output exactly at nudge + grace is still not recovery; 1 ms later it is', () => {
  const nudged = [st({ lastNudgedAt: iso(10), levelAt: iso(10) })]
  const at = (ms: number) => [term('term-c', 'checker@duo', min(10) + ms)]
  expect(detectSignals(snap({ terms: at(NUDGE_GRACE_MS) }), SPEC, nudged).map((h) => h.signal)).toEqual(['no_progress'])
  expect(detectSignals(snap({ terms: at(NUDGE_GRACE_MS + 1) }), SPEC, nudged)).toEqual([])
})

test('after a nudge, a new task_done row or a changed dispatch is progress', () => {
  const nudged = [st({ lastNudgedAt: iso(3), levelAt: iso(3) })]
  expect(detectSignals(snap({ terms: quietC(2), lastVerdictAt: new Map([['t1', iso(1)]]) }), SPEC, nudged)).toEqual([])
})

test('after a nudge, the task being re-dispatched (new dispatch after level_at) is progress (spec 6.1: dispatch_id changed)', () => {
  const nudged = [st({ lastNudgedAt: iso(8), levelAt: iso(8) })]
  const redispatched = [row({ dispatchId: 'ctx-2', dispatchedAt: iso(1) })]
  expect(detectSignals(snap({ tasks: redispatched, terms: quietC(30) }), SPEC, nudged)).toEqual([])
})

test('a nudged row for another task does not hold this task in the "needs evidence" mode', () => {
  const other = [st({ taskId: 't9', lastNudgedAt: iso(3), levelAt: iso(3) })]
  expect(detectSignals(snap({ terms: quietC(2) }), SPEC, other)).toEqual([])
})

test('owner_idle from staleReasons maps to the owner with its waiting minutes (busy-owner suppression lives in staleReasons)', () => {
  const stale: StaleItem[] = [{ taskId: 'i', title: 'I', reason: 'owner_idle', owner: 'checker@duo', since: iso(40), command: 'wl task start i --as checker@duo' }]
  expect(detectSignals(snap({ stale, tasks: [], terms: quietC(0) }), SPEC, [])).toEqual([{ post: 'checker@duo', signal: 'owner_idle', taskId: 'i', minutes: 40, command: 'wl task start i --as checker@duo' }])
})

test('dead_assignee reports ownerAlive from the owner\'s terminal', () => {
  const stale: StaleItem[] = [{ taskId: 'd', title: 'D', reason: 'dead_assignee', owner: 'checker@duo', since: null, command: 'wl task recover d' }]
  const alive = detectSignals(snap({ stale, tasks: [] }), SPEC, [])
  const gone = detectSignals(snap({ stale, tasks: [], terms: [term('term-b', 'builder@duo', min(0))] }), SPEC, [])
  expect([alive[0]!.ownerAlive, gone[0]!.ownerAlive]).toEqual([true, false])
})

test('blocked_waiting is never a patrol signal; stale items without an owner are skipped', () => {
  const stale: StaleItem[] = [
    { taskId: 'g', title: 'G', reason: 'blocked_waiting', owner: 'builder@duo', since: null, command: 'x' },
    { taskId: 'c', title: 'C', reason: 'call_uncertain', owner: null, since: null, command: 'x' },
  ]
  expect(detectSignals(snap({ stale, tasks: [] }), SPEC, [])).toEqual([])
})

test('done_unfinished exactly 2 minutes old is still left alone; 2 min + 1 s is picked up with its epoch', () => {
  const stale: StaleItem[] = [{ taskId: 'u', title: 'U', reason: 'done_unfinished', owner: 'builder@duo', since: null, command: 'x' }]
  const v = (createdAt: string) => [{ taskId: 'u', epoch: 2, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: null, createdAt } as DoneVerdictRow]
  expect(detectSignals(snap({ tasks: [], stale, unfinished: v(iso(2)) }), SPEC, [])).toEqual([])
  expect(detectSignals(snap({ tasks: [], stale, unfinished: v(new Date(min(2) - 1000).toISOString()) }), SPEC, [])[0]).toMatchObject({ signal: 'done_unfinished', epoch: 2 })
})

test('overdue: never without max_minutes; exactly max_minutes is not overdue', () => {
  const t = [row({ dispatchedAt: iso(500) })]
  expect(detectSignals(snap({ tasks: t, terms: quietC(0) }), SPEC, []).map((h) => h.signal)).toEqual([])
  expect(detectSignals(snap({ tasks: [row({ dispatchedAt: iso(60) })], terms: quietC(0) }), BUDGET, []).map((h) => h.signal)).toEqual([])
})

test('overdue and no_progress can fire together on the same task (different subjects)', () => {
  const hits = detectSignals(snap({ tasks: [row({ dispatchedAt: iso(90) })], terms: quietC(30) }), BUDGET, [])
  expect(hits.map((h) => `${h.signal}/${h.taskId}`).sort()).toEqual(['no_progress/t1', 'overdue/t1#0'])
})

test('gate_streak: a bypassed verdict also resets the streak; only this post\'s rows count', () => {
  const v = (verdict: Verdict, m: number, post = 'builder@duo') => ({ taskId: `x${m}`, epoch: 0, post, verdict, gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: iso(m), createdAt: iso(m) }) as DoneVerdictRow
  const s = (m: Map<string, DoneVerdictRow[]>) => detectSignals(snap({ tasks: [], streakAfterCursor: m }), SPEC, [])
  expect(s(new Map([['builder@duo', [v('escalate', 50), v('escalate', 40), v('bypassed', 30), v('escalate', 20), v('escalate', 10)]]]))).toEqual([])
  expect(s(new Map([['builder@duo', [v('escalate', 30), v('escalate', 20)]], ['checker@duo', [v('escalate', 10)]]]))).toEqual([])
  const custom = loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  post_failure_streak: 1\n'))
  expect(detectSignals(snap({ tasks: [], streakAfterCursor: new Map([['checker@duo', [v('escalate', 10, 'checker@duo')]]]) }), custom, []).map((h) => `${h.post}/${h.signal}/${h.taskId}`)).toEqual(['checker@duo/gate_streak/'])
})

test('detectSignals is pure: same input twice gives the same output and does not mutate the snapshot', () => {
  const s = snap(); const before = JSON.stringify([...s.byHandle.entries()])
  expect(detectSignals(s, SPEC, [])).toEqual(detectSignals(s, SPEC, []))
  expect(JSON.stringify([...s.byHandle.entries()])).toBe(before)
})

test('takeSnapshot reads task-list and terminal list exactly once each per scan (spec 5.1)', async () => {
  const { takeSnapshot } = await import('../../../src/commands/dispatcher/signals.js')
  const { FakeOrca, clock, seedRunningTeam } = await import('../fake-client.js')
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  o.calls.length = 0
  const team = registry.getTeam('duo')!
  await takeSnapshot(deps, { team, spec: loadTeamSpec(team.specPath) }, { wokeAt: null })
  expect(o.calls.filter((x) => x === 'taskList')).toHaveLength(1)
  expect(o.calls.filter((x) => x === 'terminalList')).toHaveLength(1)
})
