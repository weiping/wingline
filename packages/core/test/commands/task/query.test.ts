import fs from 'node:fs'
import { expect, test } from 'vitest'
import { isPostFrozen } from '../../../src/commands/task/frozen.js'
import { logTask } from '../../../src/commands/task/log.js'
import { taskPreflight } from '../../../src/commands/task/preflight.js'
import {
  DEFAULT_STALE, fetchTasks, findTask, findTaskAnywhere, gatherStaleInput, listStale, listTasks, mustTeamReady, showTask, staleReasons,
  type StaleInput, type TaskRow,
} from '../../../src/commands/task/query.js'
import type { OrchestrationTask } from '../../../src/orca/types.js'
import type { DoneVerdictRow } from '../../../src/registry/registry.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const task = (over: Partial<OrchestrationTask>): OrchestrationTask => ({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null, ...over })
test('taskPreflight: unreachable Orca, unknown team, no Run, missing spec, changed spec', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(taskPreflight(deps, 'ghost')).rejects.toMatchObject({ code: 'team_unknown' })
  o.reachable = false
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ kind: 'orca', hint: expect.stringContaining('orca open') })
  expect(await taskPreflight(deps, 'duo', { orca: false })).toMatchObject({ team: { name: 'duo' } })
  o.reachable = true
  const t = registry.getTeam('duo')!
  fs.writeFileSync(t.specPath, fs.readFileSync(t.specPath, 'utf8').replace('model: opus', 'model: sonnet'))   // 团队运行期间改了规格
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'team_spec_changed', hint: expect.stringContaining('wl down') })
  fs.rmSync(t.specPath)
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'spec_not_found' })
  registry.setRunId('duo', null)
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'run_not_ready' })
})
test('fetchTasks merges Orca rows with task_ext', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({}))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo', readySince: 'T0' })
  expect(await fetchTasks(deps, 'duo')).toEqual([{ id: 't1', status: 'ready', title: 'a', parentId: null, tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: 'T0', dispatchedAt: null, result: null }])
})
test('list --mine filters by claimed_by, --tags is strict intersection, --status accepts blocked', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'a' }), task({ id: 'b', status: 'blocked' }), task({ id: 'c' }))
  registry.insertTaskExt({ taskId: 'a', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo' })
  registry.insertTaskExt({ taskId: 'b', team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  registry.insertTaskExt({ taskId: 'c', team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  expect((await listTasks(deps, { team: 'duo', mine: true, as: 'builder@duo' })).map((t) => t.id)).toEqual(['a', 'b'])
  expect((await listTasks(deps, { team: 'duo', tags: ['backend'] })).map((t) => t.id)).toEqual(['a'])
  expect((await listTasks(deps, { team: 'duo', status: 'blocked' })).map((t) => t.id)).toEqual(['b'])
})
test('findTaskAnywhere finds the owning team; unknown id → task_not_found', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 't9' })); registry.insertTaskExt({ taskId: 't9', team: 'duo', tags: [], kind: 'work' })
  expect((await findTaskAnywhere(deps, 't9')).team.name).toBe('duo')
  await expect(findTaskAnywhere(deps, 'ghost')).rejects.toMatchObject({ code: 'task_not_found' })
})
test('show --history lists task_log in order with explicit/implicit source', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({}))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  logTask(deps, { team: 'duo', taskId: 't1', actor: null, action: 'create' })
  logTask(deps, { team: 'duo', taskId: 't1', actor: { address: 'builder@duo', explicit: true }, action: 'claim' })
  const s = await showTask(deps, { id: 't1', history: true })
  expect(s.history!.map((h) => [h.action, h.actor, h.actorSource])).toEqual([['create', 'human', 'human'], ['claim', 'builder@duo', 'explicit']])
})

// —— staleReasons：纯函数，六类原因各一条 + 不该报的边界 ——
const NOW = new Date('2026-10-15T12:00:00.000Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const row = (over: Partial<TaskRow>): TaskRow => ({ id: 't', status: 'ready', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: null, assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, ...over })
const verdict = (over: Partial<DoneVerdictRow>): DoneVerdictRow => ({ taskId: 't', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx', reportFrom: 'h', body: null, result: null, finishedAt: null, createdAt: ago(5), ...over })
const input = (over: Partial<StaleInput>): StaleInput => ({ team: 'duo', tasks: [], alive: new Set(['term-b', 'term-c']), unfinished: [], verdicts: new Map(), open: [], gates: [], ...over })
test('staleReasons: each reason with its copy-paste command', () => {
  const report = JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded' })
  const items = staleReasons(input({
    tasks: [
      row({ id: 'u', status: 'completed', claimedBy: 'builder@duo' }),
      row({ id: 'd', status: 'dispatched', claimedBy: 'checker@duo', assigneeHandle: 'term-old' }),
      row({ id: 'i', status: 'ready', claimedBy: 'checker@duo', readySince: ago(31) }),
      row({ id: 'b', status: 'completed', claimedBy: 'builder@duo', result: report }),
      row({ id: 'g', status: 'blocked', claimedBy: 'builder@duo' }),
      row({ id: 'c', status: 'ready', claimedBy: 'builder@duo', readySince: ago(1) }),
    ],
    unfinished: [verdict({ taskId: 'u' })],
    verdicts: new Map([['u', [verdict({ taskId: 'u' })]]]),
    open: [{ id: 'dispatch:c:0', state: 'uncertain', updatedAt: ago(2) }],
    gates: [{ gateId: 'gate-7', taskId: 'g' }],
  }), NOW)
  expect(items.map((x) => [x.taskId, x.reason, x.command])).toEqual([
    ['u', 'done_unfinished', 'wl task done u --as builder@duo'],
    ['c', 'call_uncertain', 'wl task start c --as builder@duo'],
    ['d', 'dead_assignee', 'wl task recover d'],
    ['i', 'owner_idle', 'wl task start i --as checker@duo'],
    ['b', 'bypassed', 'wl task done b --as builder@duo'],
    ['g', 'blocked_waiting', 'wl task resolve gate-7 --resolution <决定>'],
  ])
})
test('staleReasons: an unfinished verdict of an older epoch is not done_unfinished', () => {
  const items = staleReasons(input({ tasks: [row({ id: 'u', status: 'dispatched', epoch: 1, claimedBy: 'builder@duo', assigneeHandle: 'term-b' })], unfinished: [verdict({ taskId: 'u', epoch: 0 })] }), NOW)
  expect(items).toEqual([])
})
test('staleReasons boundaries: owner busy is queueing not idle; a done row means not bypassed; fresh uncertain rows are not stale; review tasks are never bypassed', () => {
  const report = JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded' })
  expect(staleReasons(input({
    tasks: [
      row({ id: 'q', status: 'ready', claimedBy: 'checker@duo', readySince: ago(60) }),
      row({ id: 'w', status: 'dispatched', claimedBy: 'checker@duo', assigneeHandle: 'term-c' }),
      row({ id: 'k', status: 'completed', claimedBy: 'builder@duo', result: report }),
      row({ id: 'r', status: 'completed', kind: 'review', claimedBy: 'checker@duo', result: report }),
      row({ id: 'n', status: 'ready', claimedBy: 'builder@duo', readySince: ago(1) }),
    ],
    verdicts: new Map([['k', [verdict({ taskId: 'k', finishedAt: ago(1) })]]]),
    open: [{ id: 'dispatch:n:0', state: 'pending', updatedAt: ago(0.5) }],
  }), NOW)).toEqual([])
})

// —— 补充：前置的错误顺序、orca:false、task_log、查询边界、stale 边界 ——
test('taskPreflight order: Orca reachability first (even for an unknown team), then team, Run, spec file, spec hash', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.reachable = false
  await expect(taskPreflight(deps, 'ghost')).rejects.toMatchObject({ kind: 'orca', code: 'runtime_unavailable' })
  o.reachable = true
  const t = registry.getTeam('duo')!
  registry.setRunId('duo', null); fs.rmSync(t.specPath)
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'run_not_ready' })      // Run before spec file
  registry.setRunId('duo', 'run-1')
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'spec_not_found' })    // file before hash
})
test('taskPreflight { orca: false } never calls status, and a healthy team returns team + loaded spec', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.calls.length = 0
  const r = await taskPreflight(deps, 'duo', { orca: false })
  expect(o.calls).not.toContain('status')
  expect(r.team.name).toBe('duo'); expect(r.spec.posts.map((p) => p.id)).toEqual(['builder', 'checker'])
  await taskPreflight(deps, 'duo')
  expect(o.calls).toContain('status')
})
test('mustTeamReady: team_unknown / run_not_ready / ok', () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  expect(() => mustTeamReady(deps, 'ghost')).toThrow(expect.objectContaining({ code: 'team_unknown' }))
  expect(mustTeamReady(deps, 'duo').runId).toBe('run-1')
  registry.setRunId('duo', null)
  expect(() => mustTeamReady(deps, 'duo')).toThrow(expect.objectContaining({ code: 'run_not_ready' }))
})
test('fetchTasks: a task without a task_ext row (created in the Orca UI) gets defaults', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'ui-1', title: 'from ui' }))
  expect(await fetchTasks(deps, 'duo')).toEqual([expect.objectContaining({ id: 'ui-1', tags: [], kind: 'work', plan: null, claimedBy: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null })])
})
test('findTask: found by id within the team; unknown → task_not_found', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push(task({ id: 't1' }))
  expect((await findTask(deps, 'duo', 't1')).id).toBe('t1')
  await expect(findTask(deps, 'duo', 'nope')).rejects.toMatchObject({ code: 'task_not_found' })
})
test('findTaskAnywhere also finds a task that has no task_ext row by scanning teams that have a Run', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'ui-5' }))
  expect((await findTaskAnywhere(deps, 'ui-5')).team.name).toBe('duo')
})
test('listTasks: --mine without any identity → actor_required; status filter; a tag nobody has → empty', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'a' }), task({ id: 'b', status: 'completed' }))
  registry.insertTaskExt({ taskId: 'a', team: 'duo', tags: ['backend'], kind: 'work' })
  await expect(listTasks(deps, { team: 'duo', mine: true })).rejects.toMatchObject({ code: 'actor_required' })
  expect((await listTasks(deps, { team: 'duo', status: 'completed' })).map((t) => t.id)).toEqual(['b'])
  expect(await listTasks(deps, { team: 'duo', tags: ['frontend'] })).toEqual([])
})
test('showTask parses outcome/reportedBy from the result, takes closure from the latest task_done, and omits history unless asked', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 't1', status: 'completed', result: JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded', reportedBy: 'term-b' }) }))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  registry.recordVerdict({ taskId: 't1', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'c', reportFrom: 'term-b', body: null })
  registry.finishVerdict('t1', 0, { closure: { kind: 'handed_to', targets: ['checker@duo'] } })
  const s = await showTask(deps, { id: 't1' })
  expect(s).toMatchObject({ outcome: 'succeeded', reportedBy: 'term-b', closure: { kind: 'handed_to', targets: ['checker@duo'] } })
  expect(s.history).toBeUndefined()
})
test('showTask of an unknown id → task_not_found', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(showTask(deps, { id: 'ghost' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('logTask: epoch defaults to the task_ext epoch, an explicit epoch wins, detail objects are stored as JSON, implicit actors are marked', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  registry.bumpEpoch('duo', 't1', 0, false)
  logTask(deps, { team: 'duo', taskId: 't1', actor: { address: 'checker@duo', explicit: false, handle: 'term-c' }, action: 'start', detail: { delivery: 'self' } })
  logTask(deps, { team: 'duo', taskId: 't1', actor: null, action: 'resolve', epoch: 0 })
  logTask(deps, { team: 'duo', taskId: 'no-ext', actor: null, action: 'create' })
  const rows = registry.listTaskLog('t1')
  expect(rows.map((r) => [r.action, r.epoch, r.actorSource, r.detail])).toEqual([['start', 1, 'implicit', '{"delivery":"self"}'], ['resolve', 0, 'human', null]])
  expect(registry.listTaskLog('no-ext')[0]!.epoch).toBe(0)
})
test('isPostFrozen is false in 2A for every post', () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(isPostFrozen(deps, 'builder@duo')).toBe(false)
  expect(isPostFrozen(deps, 'ghost@duo')).toBe(false)
})
test('DEFAULT_STALE is 30 minutes idle / 1 minute uncertain', () => {
  expect(DEFAULT_STALE).toEqual({ ownerIdleMinutes: 30, uncertainMinutes: 1 })
})
test('staleReasons: call_uncertain parses the ledger key (done/recover/resolve), skips oneshot keys, and blocked_waiting carries the gate id', () => {
  const items = staleReasons(input({
    tasks: [
      row({ id: 'd1', status: 'completed', claimedBy: 'builder@duo' }),
      row({ id: 'r1', status: 'blocked', claimedBy: 'builder@duo' }),
      row({ id: 'g1', status: 'blocked', claimedBy: 'checker@duo' }),
    ],
    open: [
      { id: 'done:d1:0:report', state: 'uncertain', updatedAt: ago(5) },
      { id: 'recover:r1:ctx-1:gate', state: 'pending', updatedAt: ago(5) },
      { id: 'resolve:gate-3', state: 'uncertain', updatedAt: ago(5) },
      { id: 'oneshot:abc', state: 'uncertain', updatedAt: ago(5) },
    ],
    gates: [{ gateId: 'gate-3', taskId: 'g1' }],
  }), NOW)
  const uncertain = items.filter((x) => x.reason === 'call_uncertain')
  expect(uncertain.map((x) => x.taskId).sort()).toEqual(['d1', 'g1', 'r1'])
  expect(uncertain.find((x) => x.taskId === 'd1')!.command).toBe('wl task done d1 --as builder@duo')
  expect(uncertain.find((x) => x.taskId === 'r1')!.command).toBe('wl task recover r1')
  expect(uncertain.find((x) => x.taskId === 'g1')!.command).toMatch(/^wl task resolve gate-3 --resolution /)
  expect(items.find((x) => x.reason === 'blocked_waiting' && x.taskId === 'g1')).toMatchObject({ gateId: 'gate-3' })
})
test('staleReasons: an unowned task falls back to <主人> in the command; custom thresholds move the idle/uncertain lines; one task may appear under several reasons', () => {
  const unowned = staleReasons(input({ tasks: [row({ id: 'o', status: 'completed' })], unfinished: [verdict({ taskId: 'o' })] }), NOW)
  expect(unowned[0]!.command).toContain('<主人>')
  const t = row({ id: 'i', status: 'ready', claimedBy: 'checker@duo', readySince: ago(10) })
  expect(staleReasons(input({ tasks: [t] }), NOW)).toEqual([])
  expect(staleReasons(input({ tasks: [t] }), NOW, { ownerIdleMinutes: 5, uncertainMinutes: 1 }).map((x) => x.reason)).toEqual(['owner_idle'])
  const both = staleReasons(input({ tasks: [row({ id: 'm', status: 'completed', claimedBy: 'builder@duo' })], unfinished: [verdict({ taskId: 'm' })], open: [{ id: 'done:m:0:report', state: 'uncertain', updatedAt: ago(9) }] }), NOW)
  expect(both.map((x) => x.reason)).toEqual(['done_unfinished', 'call_uncertain'])
})
test('staleReasons: bypassed is still reported when the only verdict on file is for an older epoch', () => {
  const report = JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded' })
  const items = staleReasons(input({
    tasks: [row({ id: 'k', status: 'completed', epoch: 1, claimedBy: 'builder@duo', result: report })],
    verdicts: new Map([['k', [verdict({ taskId: 'k', epoch: 0, finishedAt: ago(100) })]]]),
  }), NOW)
  expect(items.map((x) => x.reason)).toEqual(['bypassed'])
})
test('listStale/gatherStaleInput: one taskList + one terminalList, and a task dispatched to a vanished terminal is reported', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 'x', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-old', from: 'coord-1' })
  o.calls.length = 0
  const items = await listStale(deps, 'duo')
  expect(items.map((x) => [x.taskId, x.reason, x.command])).toEqual([[id, 'dead_assignee', `wl task recover ${id}`]])
  expect(o.calls.filter((c) => c === 'taskList')).toHaveLength(1)
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(1)
  const input = await gatherStaleInput(deps, 'duo')
  expect(input.alive.has('term-b')).toBe(true); expect(input.alive.has('term-old')).toBe(false)
})
