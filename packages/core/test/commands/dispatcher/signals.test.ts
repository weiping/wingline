import { expect, test } from 'vitest'
import { detectSignals, syncCursors, takeSnapshot, type ScanSnapshot, type SignalHit } from '../../../src/commands/dispatcher/signals.js'
import type { StaleItem, TaskRow } from '../../../src/commands/task/query.js'
import type { ScreenState } from '../../../src/commands/task/notify.js'
import { WinglineError } from '../../../src/errors.js'
import type { TerminalSummary } from '../../../src/orca/types.js'
import type { DoneVerdictRow, PatrolStateRow, Verdict } from '../../../src/registry/registry.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

const NOW = new Date('2026-10-15T12:00:00.000Z')
const min = (m: number) => NOW.getTime() - m * 60_000
const iso = (m: number) => new Date(min(m)).toISOString()
const SPEC = loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  task:\n    max_minutes: 60\n'))
const row = (over: Partial<TaskRow>): TaskRow => ({ id: 't1', status: 'dispatched', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'checker@duo', assigneeHandle: 'term-c', dispatchId: 'ctx-1', epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: iso(30), result: null, ...over })
const term = (handle: string, title: string, lastOutputAt: number | null): TerminalSummary => ({ handle, title, connected: true, worktreeId: 'w', lastOutputAt })
function snap(over: Partial<ScanSnapshot> & { terms?: TerminalSummary[] } = {}): ScanSnapshot {
  const terms = over.terms ?? [term('term-b', 'builder@duo', min(0)), term('term-c', 'checker@duo', min(25))]
  return { now: NOW, lead: 'builder@duo', tasks: [row({})], byHandle: new Map(terms.map((t) => [t.handle, t])), byTitle: new Map(terms.map((t) => [t.title!, t])),
    workers: [], stale: [], screens: new Map<string, ScreenState | 'offline'>([['term-c', 'clear']]), openQuestions: [], lastLogAt: new Map(), lastVerdictAt: new Map(), streakAfterCursor: new Map(), unfinished: [], wokeAt: null, ...over }
}
const sig = (h: SignalHit[]) => h.map((x) => [x.post, x.signal, x.taskId])
const st = (over: Partial<PatrolStateRow>): PatrolStateRow => ({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 1, since: iso(10), levelAt: iso(10), lastNudgedAt: iso(10), notifyCount: 0, nextDueAt: null, clearedAt: null, ...over })

test('no_progress: exactly at the threshold does not trigger; past it does; minutes are reported', () => {
  expect(detectSignals(snap({ terms: [term('term-c', 'checker@duo', min(20))] }), SPEC, [])).toEqual([])
  expect(detectSignals(snap(), SPEC, [])).toEqual([{ post: 'checker@duo', signal: 'no_progress', taskId: 't1', minutes: 25 }])
})
test('no_progress floors: a fresh dispatch and a recent wake both reset the clock', () => {
  expect(detectSignals(snap({ tasks: [row({ dispatchedAt: iso(5) })] }), SPEC, [])).toEqual([])
  expect(detectSignals(snap({ wokeAt: new Date(min(3)) }), SPEC, [])).toEqual([])
})
test('at a prompt (and quiet past prompt_minutes) it is waiting_approval, not no_progress', () => {
  expect(sig(detectSignals(snap({ screens: new Map([['term-c', 'at_prompt']]) }), SPEC, []))).toEqual([['checker@duo', 'waiting_approval', 't1']])
})
test('waiting_answer: worker-list input wins; without worker-list the local open question is used; either way no no_progress', () => {
  expect(sig(detectSignals(snap({ workers: [{ dispatchId: 'ctx-1', taskId: 't1', terminalHandle: 'term-c', dispatchStatus: 'dispatched', attention: ['input'], liveness: 'live' }] }), SPEC, []))).toEqual([['checker@duo', 'waiting_answer', 't1']])
  const q = { team: 'duo', messageId: 'msg-1', taskId: 't1', dispatchId: 'ctx-1', asker: 'checker@duo', body: 'b', options: [], relayedAt: iso(5), answeredAt: null }
  expect(detectSignals(snap({ workers: null, openQuestions: [q] }), SPEC, [])).toEqual([{ post: 'checker@duo', signal: 'waiting_answer', taskId: 't1', question: 'b', messageId: 'msg-1' }])
})
test('a revived row is not cleared again by output from before the revival (no clear/revive flip-flop)', () => {
  const revived = [st({ lastNudgedAt: iso(60), levelAt: iso(4) })]
  expect(sig(detectSignals(snap({ terms: [term('term-c', 'checker@duo', min(30))] }), SPEC, revived))).toEqual([['checker@duo', 'no_progress', 't1']])
  expect(detectSignals(snap({ terms: [term('term-c', 'checker@duo', min(30))] }), SPEC, [st({ lastNudgedAt: null, clearedAt: iso(1) })]).map((h) => h.signal)).toEqual(['no_progress'])
})
test('after a nudge, output inside the grace window is not recovery; output after it, or a task_log entry, is', () => {
  const nudged = [st({ lastNudgedAt: iso(3), levelAt: iso(3) })]
  const replied = [term('term-c', 'checker@duo', min(2))]
  expect(sig(detectSignals(snap({ terms: replied }), SPEC, nudged))).toEqual([['checker@duo', 'no_progress', 't1']])
  const nudgedLong = [st({ lastNudgedAt: iso(12), levelAt: iso(12) })]
  expect(detectSignals(snap({ terms: [term('term-c', 'checker@duo', min(1))] }), SPEC, nudgedLong)).toEqual([])
  expect(detectSignals(snap({ terms: replied, lastLogAt: new Map([['t1', iso(1)]]) }), SPEC, nudged)).toEqual([])
})
test('dead_assignee / owner_idle / done_unfinished / bypassed / call_uncertain come from staleReasons with their commands', () => {
  const stale: StaleItem[] = [
    { taskId: 'd', title: 'D', reason: 'dead_assignee', owner: 'checker@duo', since: null, command: 'wl task recover d' },
    { taskId: 'i', title: 'I', reason: 'owner_idle', owner: 'checker@duo', since: iso(40), command: 'wl task start i --as checker@duo' },
    { taskId: 'u', title: 'U', reason: 'done_unfinished', owner: 'builder@duo', since: null, command: 'wl task done u --as builder@duo' },
    { taskId: 'b', title: 'B', reason: 'bypassed', owner: 'builder@duo', since: null, command: 'wl task done b --as builder@duo' },
    { taskId: 'c', title: 'C', reason: 'call_uncertain', owner: 'builder@duo', since: null, command: 'wl task start c --as builder@duo' },
    { taskId: 'g', title: 'G', reason: 'blocked_waiting', owner: 'builder@duo', since: null, command: 'wl task resolve g1 …' },
  ]
  const unfinished = [{ taskId: 'u', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: null, createdAt: iso(5) } as DoneVerdictRow]
  const hits = detectSignals(snap({ tasks: [], stale, unfinished }), SPEC, [])
  expect(hits.map((h) => [h.signal, h.taskId, h.command])).toEqual([
    ['dead_assignee', 'd', 'wl task recover d'], ['owner_idle', 'i', 'wl task start i --as checker@duo'], ['done_unfinished', 'u', 'wl task done u --as builder@duo'],
    ['bypassed', 'b', 'wl task done b --as builder@duo'], ['call_uncertain', 'c', 'wl task start c --as builder@duo'],
  ])
})
test('done_unfinished younger than 2 minutes is left alone (a live wl task done may still be running)', () => {
  const stale: StaleItem[] = [{ taskId: 'u', title: 'U', reason: 'done_unfinished', owner: 'builder@duo', since: null, command: 'x' }]
  const unfinished = [{ taskId: 'u', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: null, createdAt: iso(1) } as DoneVerdictRow]
  expect(detectSignals(snap({ tasks: [], stale, unfinished }), SPEC, [])).toEqual([])
})
test('overdue uses budgets.task.max_minutes and is keyed per epoch', () => {
  expect(detectSignals(snap({ tasks: [row({ dispatchedAt: iso(61), epoch: 2 })], terms: [term('term-c', 'checker@duo', min(0))] }), SPEC, []))
    .toEqual([{ post: 'checker@duo', signal: 'overdue', taskId: 't1#2', minutes: 61 }])
})
test('gate_streak counts escalations after the cursor; reaching post_failure_streak triggers', () => {
  const v = (verdict: Verdict, m: number) => ({ taskId: `x${m}`, epoch: 0, post: 'builder@duo', verdict, gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: iso(m), createdAt: iso(m) }) as DoneVerdictRow
  const s = (rows: DoneVerdictRow[]) => detectSignals(snap({ tasks: [], streakAfterCursor: new Map([['builder@duo', rows]]) }), SPEC, [])
  expect(s([v('escalate', 30), v('escalate', 20)])).toEqual([])
  expect(sig(s([v('escalate', 30), v('escalate', 20), v('escalate', 10)]))).toEqual([['builder@duo', 'gate_streak', '']])
  expect(s([v('escalate', 40), v('escalate', 30), v('passed', 20), v('escalate', 10)])).toEqual([])
})
test('takeSnapshot calls terminal show only for quiet dispatched posts; worker-list failure yields null', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  o.terminals.find((t) => t.handle === 'term-c')!.lastOutputAt = c.now().getTime() - 10 * 60_000
  o.terminals.find((t) => t.handle === 'term-b')!.lastOutputAt = c.now().getTime()
  o.workerListError = new WinglineError('orca', 'x', 'x')
  const team = registry.getTeam('duo')!
  const s = await takeSnapshot(deps, { team, spec: loadTeamSpec(team.specPath) }, { wokeAt: null })
  expect([...s.screens.keys()]).toEqual(['term-c'])
  expect(s.workers).toBeNull()
})
// —— 3D-2（块 c）：每轮读画面 ——

async function screensWorld() {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  o.terminals.find((t) => t.handle === 'term-c')!.lastOutputAt = c.now().getTime() - 10 * 60_000 // 静默超过 prompt_minutes：是 quietScreens 的候选
  o.terminals.find((t) => t.handle === 'term-b')!.lastOutputAt = c.now().getTime()
  o.screens.set('term-b', 'builder is idle\n❯ ')
  o.screens.set('term-c', 'Do you want to proceed?\n❯ 1. Yes')
  const team = registry.getTeam('duo')!
  const take = () => takeSnapshot(deps, { team, spec: loadTeamSpec(team.specPath) }, { wokeAt: null })
  return { o, registry, take, count: (m: string) => o.calls.filter((x) => x === m).length }
}

test('every live post\'s screen is read exactly once per scan, and the quiet-candidate check reuses it instead of calling terminalShow', async () => {
  const w = await screensWorld()
  const s = await w.take()
  expect([...s.previews!.keys()].sort()).toEqual(['term-b', 'term-c'])
  expect(s.previews!.get('term-c')).toContain('Do you want to proceed?')
  expect(w.count('terminalRead')).toBe(2)
  expect(w.count('terminalShow')).toBe(0)
  expect(s.screens.get('term-c')).toBe('at_prompt')
})

test('a post whose terminal is gone, or that has no handle, is not read', async () => {
  const w = await screensWorld()
  w.o.terminals = w.o.terminals.filter((t) => t.handle !== 'term-b')
  const s = await w.take()
  expect([...s.previews!.keys()]).toEqual(['term-c'])
  expect(w.count('terminalRead')).toBe(1)
})

test('a failing or screen_unavailable read gives that post no preview (the quiet check falls back to terminalShow), leaves the others, and never aborts the scan', async () => {
  const w = await screensWorld()
  w.o.faults.push({ method: 'terminalRead', when: 'before', match: (a) => a.handle === 'term-c', error: new WinglineError('orca', 'screen_unavailable', 'x') })
  const s = await w.take()
  expect([...s.previews!.keys()]).toEqual(['term-b'])
  expect(w.count('terminalShow')).toBe(1) // 回退：只对读失败的那个候选
  expect(s.screens.get('term-c')).toBe('at_prompt') // 回退用的是 terminalShow 的末尾 300 字符，这里足够判出确认框
})

test('syncCursors: a post without a cursor starts at now; a later pass moves it', () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  syncCursors(deps, 'duo', ['builder@duo'], snap({ now: c.now() }))
  expect(registry.getCursor('builder@duo')).toBe(c.now().toISOString())
  const pass = { taskId: 'p', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'x', reportFrom: 'h', body: null, result: null, finishedAt: 'Z-later', createdAt: 'Z' } as DoneVerdictRow
  syncCursors(deps, 'duo', ['builder@duo'], snap({ streakAfterCursor: new Map([['builder@duo', [pass]]]) }))
  expect(registry.getCursor('builder@duo')).toBe('Z-later')
})
