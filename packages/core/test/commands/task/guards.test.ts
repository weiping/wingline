import { expect, test } from 'vitest'
import { reassignTask } from '../../../src/commands/task/claim.js'
import { dispatchTo } from '../../../src/commands/task/dispatch.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { escalateTask, recoverTask, resolveGate } from '../../../src/commands/task/escalate.js'
import { listTasks } from '../../../src/commands/task/query.js'
import { startTask } from '../../../src/commands/task/start.js'
import { createTask } from '../../../src/commands/task/create.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const mkTask = async (o: FakeOrca, deps: ReturnType<typeof seedRunningTeam>['deps'], over: { title?: string; tags?: string[]; claimedBy?: string | null } = {}) => {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: over.title ?? 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: over.tags ?? [], kind: 'work', claimedBy: over.claimedBy === undefined ? 'builder@duo' : over.claimedBy })
  return id
}

// (1) gate_failures is reset only after an escalate verdict
test('guard 1: a terminal close followed by a redispatch (new epoch) keeps the gate-failure count', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await mkTask(o, deps)
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  await dispatchTo(deps, 'duo', id, { address: 'builder@duo', handle: 'term-b' })
  await o.terminalClose({ handle: 'term-b' })
  o.terminals.push({ handle: 'term-b2', title: 'builder@duo', connected: true, worktreeId: 'w' })
  await dispatchTo(deps, 'duo', id, { address: 'builder@duo', handle: 'term-b2' })
  expect(registry.getTaskExt(id)).toMatchObject({ epoch: 1, gateFailures: 2 })
})
test('guard 1: recover keeps the count (no escalate verdict was recorded)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const a = await mkTask(o, deps)
  registry.incrementGateFailures('duo', a)
  await o.dispatch({ task: a, to: 'term-old', from: 'coord-1' })
  await recoverTask(deps, { id: a })
  expect(registry.getTaskExt(a)).toMatchObject({ epoch: 1, gateFailures: 1 })
})
test('guard 1: a manual escalate → resolve → start keeps the count too (no escalate verdict was recorded)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const b = await mkTask(o, deps)
  registry.incrementGateFailures('duo', b); registry.incrementGateFailures('duo', b)
  await dispatchTo(deps, 'duo', b, { address: 'builder@duo', handle: 'term-b' })
  const { gateId } = await escalateTask(deps, { id: b, reason: 'manual' })
  await resolveGate(deps, { gateId, resolution: 'retry' })
  await startTask(deps, { id: b })
  expect(registry.getTaskExt(b)).toMatchObject({ epoch: 1, gateFailures: 2 })
})

// (2) bypass needs provenance === 'worker_report'
test('guard 2: a task that was completed by other means (no worker_report provenance) is not treated as bypassed: done is refused and nothing runs or is created', async () => {
  const links = 'links:\n  builder:\n    reviewed_by: [checker]\n'
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { yaml: DUO_YAML + links, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await mkTask(o, deps)
  const t = o.tasks.find((x) => x.id === id)!
  t.status = 'completed'; t.result = JSON.stringify({ provenance: 'coordinator_close', outcome: 'succeeded' })
  o.orch.length = 0
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'task_not_dispatched' })
  expect(o.callsOf('taskCreate')).toEqual([]); expect(deps.registry.getVerdict(id, 0)).toBeNull()
  t.result = null
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'task_not_dispatched' })
})

// (3) neutralize on agent-controlled text typed into terminals
const RAW = 'a $(id); `x` | y\nz'
test('guard 3: the escalate reason is neutralised before it is typed into the lead\'s terminal', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await mkTask(o, deps)
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  await escalateTask(deps, { id, reason: RAW })
  const typed = o.sent.find((m) => m.handle === 'term-b')!.text
  expect(typed).toContain('＄(id)；'); expect(typed).toContain('｀x｀')
  expect(typed).not.toMatch(/[$`;|]/); expect(typed).not.toContain('\n')
})
test('guard 3: the task title is neutralised in the reassign notice typed into the new owner\'s terminal', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await mkTask(o, deps, { title: RAW })
  await reassignTask(deps, { id, to: 'checker@duo' })
  const typed = o.sent.find((m) => m.handle === 'term-c')!.text
  expect(typed).toContain('＄(id)；'); expect(typed).not.toMatch(/[$`;|]/); expect(typed).not.toContain('\n')
})

// (4) --tags is a strict intersection (every tag)
test('guard 4: list --tags a,b returns only tasks that carry every requested tag', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const onlyA = await mkTask(o, deps, { tags: ['a'] }); const both = await mkTask(o, deps, { tags: ['a', 'b'] }); await mkTask(o, deps, { tags: ['b'] })
  expect((await listTasks(deps, { team: 'duo', tags: ['a', 'b'] })).map((t) => t.id)).toEqual([both])
  expect((await listTasks(deps, { team: 'duo', tags: ['a'] })).map((t) => t.id)).toEqual([onlyA, both])
})

// (5) concurrent done does not corrupt state
test('guard 5: two concurrent wl task done runs leave one child, one finished verdict, a completed task and a single report', async () => {
  const links = 'links:\n  builder:\n    reviewed_by: [checker]\n'
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { yaml: DUO_YAML + links, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await createTask(deps, { team: 'duo', title: 'T', post: 'builder@duo' })
  await Promise.allSettled([doneTask(deps, { id }), doneTask(deps, { id })])
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('completed')
  expect(registry.getVerdict(id, 0)!.finishedAt).not.toBeNull()
  expect(new Set(o.callsOf('workerDone').map((a) => a.retryRequest)).size).toBe(1)
})
