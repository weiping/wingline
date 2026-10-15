import { expect, test } from 'vitest'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { escalateTask, recoverTask, resolveGate } from '../../../src/commands/task/escalate.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

async function dispatchedTask(o: FakeOrca, deps: CommandDeps, to = 'term-b') {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to, from: 'coord-1' }); o.orch.length = 0
  return id
}
const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
test('escalate takes a dispatched task back (blocked), records the gate, logs it and tells the lead', async () => {
  // a human caller (no post terminal): the brief's original checker caller is neither owner nor lead → not_your_task
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  expect(await escalateTask(deps, { id, reason: '卡住了' })).toEqual({ gateId: 'gate-1', status: 'blocked', tookBackDispatch: true })
  expect(o.callsOf('gateCreate')).toEqual([{ task: id, question: '卡住了', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actor])).toEqual([['escalate', 'human']])
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: expect.stringContaining('gate-1') })
})
test('escalate on a completed task needs --reopen', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  await o.workerDone({ taskId: id, dispatchId: 'ctx-1', outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-b' })
  await expect(escalateTask(deps, { id, reason: 'x' })).rejects.toMatchObject({ code: 'reopen_required' })
  expect(await escalateTask(deps, { id, reason: 'x', reopen: true })).toMatchObject({ gateId: 'gate-1' })
})
test('escalate uncertain: hint carries --retry-request; rerunning with it creates no second gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'gateCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  const err = await escalateTask(deps, { id, reason: 'x' }).catch((e) => e)
  const rid = o.callsOf('gateCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${rid}`) })
  await escalateTask(deps, { id, reason: 'x', retryRequest: rid })
  expect(o.gates.size).toBe(1)
})
test('escalate uncertain, then the coordinator changed: --retry-request replays the original --from, one gate', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'gateCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  const err = await escalateTask(deps, { id, reason: 'x' }).catch((e) => e)
  const rid = o.callsOf('gateCreate')[0]!.retryRequest as string
  expect(err.hint).toContain('--from coord-1')
  await o.runUse({ id: 'run-1', from: 'coord-2' }); registry.updateCoordinatorHandle('duo', 'coord-2')
  expect(await escalateTask(deps, { id, reason: 'x', retryRequest: rid })).toMatchObject({ gateId: 'gate-1', status: 'blocked' })
  expect(o.callsOf('gateCreate').at(-1)).toMatchObject({ retryRequest: rid, from: 'coord-1' })
  expect(o.gates.size).toBe(1)
})
test('escalate by a post that is neither the owner nor the lead → not_your_task; the lead and a human may', async () => {
  const yaml3 = DUO_YAML + '  - id: auditor\n    agent: claude\n    worktree: current\n'
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { yaml: yaml3 })
  registry.upsertPost({ address: 'auditor@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-a', status: 'live', isLead: false })
  const id = await dispatchedTask(o, deps)
  await expect(escalateTask(deps, { id, reason: 'x', as: 'auditor@duo' })).rejects.toMatchObject({ code: 'not_your_task' })
  expect(await escalateTask(deps, { id, reason: 'x', as: 'builder@duo' })).toMatchObject({ gateId: 'gate-1' })
})
test('escalate on an unknown task → task_not_found', async () => {
  await expect(escalateTask(seedRunningTeam(new FakeOrca()).deps, { id: 'ghost', reason: 'x' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('resolve: Orca puts the task back to ready; owner unchanged; ready_since refreshed; a bare rerun does not call Orca again', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  expect(await resolveGate(deps, { gateId, resolution: 'retry' })).toEqual({ taskId: id, status: 'ready', claimedBy: 'builder@duo' })
  expect(o.callsOf('gateResolve')).toEqual([{ id: gateId, resolution: 'retry', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getTaskExt(id)!.readySince).toEqual(expect.any(String))
  await resolveGate(deps, { gateId, resolution: 'retry' })
  expect(o.callsOf('gateResolve')).toHaveLength(1)
})
test('resolve --reassign changes the owner locally; an unknown target is rejected before Orca', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  await expect(resolveGate(deps, { gateId, resolution: 'r', reassign: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  expect(o.callsOf('gateResolve')).toEqual([])
  await resolveGate(deps, { gateId, resolution: 'reassign', reassign: 'checker@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
})
test('resolve on an unrecorded gate → gate_unknown', async () => {
  await expect(resolveGate(seedRunningTeam(new FakeOrca()).deps, { gateId: 'ghost', resolution: 'x' })).rejects.toMatchObject({ code: 'gate_unknown' })
})
test('recover: assignee alive → assignee_alive', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ code: 'assignee_alive' })
})
test('recover: dispatched to a dead handle → gate-create → gate-resolve → re-dispatched to the owner with epoch + 1', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  deps.registry.openIntent(`dispatch:${id}:0`, 'x', {}); deps.registry.finishRequest(`dispatch:${id}:0`, 'done', { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  const r = await recoverTask(deps, { id })
  expect(r).toMatchObject({ status: 'dispatched', epoch: 1, delivery: 'notified' })
  expect(o.calls.filter((c) => ['gateCreate', 'gateResolve', 'dispatch'].includes(c))).toEqual(['gateCreate', 'gateResolve', 'dispatch'])
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-b' })
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('recover')
})
test('recover interrupted after the epoch was bumped (re-dispatch uncertain): the rerun resumes from its open record instead of failing assignee_alive', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  deps.registry.openIntent(`dispatch:${id}:0`, 'x', {}); deps.registry.finishRequest(`dispatch:${id}:0`, 'done', { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'dispatched', epoch: 1 })
  expect(o.gates.size).toBe(1)
  expect(registry.getRequest(`recover:${id}:open`)).toBeNull()
})
test('recover interrupted after gate-create: the rerun continues from gate-resolve, one gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  o.faults.push({ method: 'gateResolve', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'dispatched' })
  expect(o.gates.size).toBe(1)
})
test('recover with the owner offline: back to ready, not dispatched', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'ready', reason: 'post_offline' })
})

// —— 补充 ——
test('escalate by a post that is neither owner nor lead (implicit caller) is refused before any Orca write; the owner may escalate and the lead is told once', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await dispatchedTask(o, deps)                      // owned by builder (the lead); caller is checker
  await expect(escalateTask(deps, { id, reason: 'x' })).rejects.toMatchObject({ code: 'not_your_task' })
  expect(o.callsOf('gateCreate')).toEqual([])
  const owner = seedRunningTeam(new FakeOrca(), { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const oo = owner.deps.orca as FakeOrca
  const { id: t2 } = await oo.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  owner.registry.insertTaskExt({ taskId: t2, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await oo.dispatch({ task: t2, to: 'term-c', from: 'coord-1' })
  await expect(escalateTask(owner.deps, { id: t2, reason: 'x' })).resolves.toMatchObject({ tookBackDispatch: true })
  expect(oo.sent.filter((m) => m.handle === 'term-b')).toHaveLength(1)
})
test('escalate as the lead on a task owned by someone else: allowed, and no notice is typed into the lead\'s own terminal', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  await escalateTask(deps, { id, reason: 'x', as: 'builder@duo' })
  expect(o.sent).toEqual([])
})
test('escalate on a ready task: gate created, task blocked, tookBackDispatch false; refusals make no Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  expect(await escalateTask(deps, { id, reason: 'x' })).toEqual({ gateId: 'gate-1', status: 'blocked', tookBackDispatch: false })
  const done = await dispatchedTask(o, deps)
  await o.workerDone({ taskId: done, dispatchId: 'ctx-2', outcome: 'failed', subject: 's', run: 'run-1', from: 'term-b' })
  o.orch.length = 0
  await expect(escalateTask(deps, { id: done, reason: 'x' })).rejects.toMatchObject({ code: 'reopen_required' })
  expect(o.callsOf('gateCreate')).toEqual([])
})
test('escalate with the lead at a prompt: the gate still exists and the result is returned', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.previews.set('term-b', 'Allow this edit? (y/n)')
  expect((await escalateTask(deps, { id, reason: 'x' })).gateId).toBe('gate-1')
  expect(o.sent).toEqual([])
})
test('resolve does not touch epoch or gate_failures, logs resolve as human, and an uncertain Orca result leaves the owner unchanged until the rerun', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  registry.incrementGateFailures('duo', id)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  o.faults.push({ method: 'gateResolve', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(resolveGate(deps, { gateId, resolution: 'r', reassign: 'checker@duo' })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
  await resolveGate(deps, { gateId, resolution: 'r', reassign: 'checker@duo' })
  const ids = o.callsOf('gateResolve').map((a) => a.retryRequest)
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
  expect(registry.getTaskExt(id)).toMatchObject({ claimedBy: 'checker@duo', epoch: 0, gateFailures: 1 })
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actor])).toContain(['resolve', 'human'])
  expect(registry.getRequest(`resolve:${gateId}`)!.state).toBe('done')
})
test('recover on a task that is not dispatched → assignee_alive with a hint that nothing needs recovering; unknown task → task_not_found', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ code: 'assignee_alive', hint: expect.stringContaining('不需要 recover') })
  await expect(recoverTask(deps, { id: 'ghost' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('recover uses the P1 keys recover:<task>:<dispatch_id>:gate / :resolve, records the gate, bumps the epoch once and removes the open record', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  registry.openIntent(`dispatch:${id}:0`, 'x', {}); registry.finishRequest(`dispatch:${id}:0`, 'done', { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  const r = await recoverTask(deps, { id })
  expect(registry.getRequest(`recover:${id}:ctx-1:gate`)!.state).toBe('done')
  expect(registry.getRequest(`recover:${id}:ctx-1:resolve`)!.state).toBe('done')
  expect(registry.getRequest(`recover:${id}:open`)).toBeNull()
  expect(registry.listGates('duo')).toEqual([{ gateId: 'gate-1', taskId: id }])
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(r.epoch).toBe(1)
  expect(registry.getRequest(`dispatch:${id}:1`)!.state).toBe('done')
  expect(o.callsOf('gateCreate')[0]).toMatchObject({ question: '雁阵 recover：原派发对象已不存在' })
  expect(o.callsOf('gateResolve')[0]).toMatchObject({ resolution: 'recover' })
})
test('recover while the open record exists skips the assignee-alive check even if the task now looks healthy', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  registry.openIntent(`recover:${id}:open`, 'x', {}); registry.finishRequest(`recover:${id}:open`, 'done', { dispatchId: 'ctx-1', epoch: 0 })
  // the task is dispatched to a live handle now (e.g. an earlier attempt finished the dispatch)
  o.tasks.find((t) => t.id === id)!.assigneeHandle = 'term-b'
  await expect(recoverTask(deps, { id })).resolves.toBeDefined()
})
test('recover with a busy owner → queued, epoch still bumped; with no owner → ready and no dispatch', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  const busy = (await o.taskCreate({ spec: 's', taskTitle: 'b', run: 'run-1', from: 'coord-1' })).id
  registry.insertTaskExt({ taskId: busy, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: busy, to: 'term-b', from: 'coord-1' })
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'queued', epoch: 1 })
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('ready')
  const orphan = await dispatchedTask(o, deps, 'term-old2')
  registry.setClaimedBy('duo', orphan, null)
  expect(await recoverTask(deps, { id: orphan })).toMatchObject({ status: 'ready' })
  expect(o.callsOf('dispatch').filter((d) => d.task === orphan).length).toBe(0)
  expect(registry.getRequest(`recover:${orphan}:open`)).toBeNull()
})
test('recover with the owner offline also removes the open record', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  await recoverTask(deps, { id })
  expect(registry.getRequest(`recover:${id}:open`)).toBeNull()
})
