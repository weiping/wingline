import { expect, test } from 'vitest'
import { createTask } from '../../../src/commands/task/create.js'
import { SPEC_FOOTER } from '../../../src/commands/task/dispatch.js'
import { planTask } from '../../../src/commands/task/plan.js'
import { WinglineError } from '../../../src/errors.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

test('create without --post: task-create via P2, ready, task_ext kind work with ready_since, spec carries the footer, task_log create', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: '顺手记下', tags: ['bug'] })
  expect(o.callsOf('taskCreate')[0]).toEqual({ spec: `human: 顺手记下\n\n${SPEC_FOOTER}`, taskTitle: '顺手记下', run: 'run-1', from: 'coord-1', retryRequest: expect.any(String) })
  expect(o.callsOf('dispatch')).toEqual([])
  expect(registry.getTaskExt(r.id)).toMatchObject({ tags: ['bug'], kind: 'work', claimedBy: null, readySince: expect.any(String) })
  expect(registry.listTaskLog(r.id).map((l) => l.action)).toEqual(['create'])
})
test('on Windows (.cmd, multiline unsafe) the spec is one line', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { multilineSafe: false })
  await createTask(deps, { team: 'duo', title: 't', as: 'builder@duo' })
  expect(o.callsOf('taskCreate')[0]!.spec).toBe(`builder@duo: t。${SPEC_FOOTER}`)
})
test('create --post: claimed_by = post, dispatched (no inject) and notified', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(registry.getTaskExt(r.id)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')[0]).toEqual({ task: r.id, to: 'term-c', from: 'coord-1', retryRequest: expect.any(String) })
  expect(r.delivery).toBe('notified')
})
test('create --post on a busy post: task created and owned, queued, queued line sent', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const first = await createTask(deps, { team: 'duo', title: 'a', post: 'checker@duo' })
  const r = await createTask(deps, { team: 'duo', title: 'b', post: 'checker@duo' })
  expect(r).toMatchObject({ delivery: 'queued', busyWith: first.id })
  expect(o.tasks.find((t) => t.id === r.id)!.status).toBe('ready')
})
test('create --post: dispatch uncertain → hint carries --retry-request; rerun with it does not create a second task', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`), detail: { retryRequest: id } })
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo', retryRequest: id })
  expect(o.tasks).toHaveLength(1)
  expect(o.tasks[0]).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('create timed out, then the coordinator changed: --retry-request replays with the original --from, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await createTask(deps, { team: 'duo', title: 't' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err.hint).toContain('--from coord-1')
  await o.runUse({ id: 'run-1', from: 'term-dsp' }); registry.updateCoordinatorHandle('duo', 'term-dsp')
  const r = await createTask(deps, { team: 'duo', title: 't', retryRequest: id })
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ retryRequest: id, from: 'coord-1' })
  expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
})
test('create --post on an offline post fails before task-create', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_offline' })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('planTask writes the plan under the team lock and logs it; terminal tasks are rejected', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push({ id: 'p1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null },
               { id: 'p2', status: 'completed', title: 'b', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  registry.insertTaskExt({ taskId: 'p1', team: 'duo', tags: [], kind: 'work' }); registry.insertTaskExt({ taskId: 'p2', team: 'duo', tags: [], kind: 'work' })
  await planTask(deps, { id: 'p1', text: '先读代码' })
  expect(registry.getTaskExt('p1')!.plan).toBe('先读代码')
  expect(registry.listTaskLog('p1').map((l) => l.action)).toEqual(['plan'])
  await expect(planTask(deps, { id: 'p2', text: 'x' })).rejects.toMatchObject({ code: 'task_terminal' })
})

test('create with --parent passes it to task-create; two creates without --retry-request make two tasks', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const a = await createTask(deps, { team: 'duo', title: 't', parent: 'task-0' })
  const b = await createTask(deps, { team: 'duo', title: 't' })
  expect(o.callsOf('taskCreate')[0]).toMatchObject({ parent: 'task-0' })
  expect(o.callsOf('taskCreate')[1]).not.toHaveProperty('parent')
  expect(a.id).not.toBe(b.id); expect(o.tasks).toHaveLength(2)
})
test('create records the actor: human by default, explicit --as in the spec head and in task_log', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const h = await createTask(deps, { team: 'duo', title: 't' })
  const e = await createTask(deps, { team: 'duo', title: 't', as: 'builder@duo' })
  expect(registry.listTaskLog(h.id)[0]).toMatchObject({ actor: 'human', actorSource: 'human', action: 'create' })
  expect(registry.listTaskLog(e.id)[0]).toMatchObject({ actor: 'builder@duo', actorSource: 'explicit' })
  expect(o.callsOf('taskCreate')[1]!.spec).toContain('builder@duo: t')
})
test('create preflight: unreachable Orca / no Run / unknown team fail before any Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(createTask(deps, { team: 'ghost', title: 't' })).rejects.toMatchObject({ code: 'team_unknown' })
  o.reachable = false
  await expect(createTask(deps, { team: 'duo', title: 't' })).rejects.toMatchObject({ kind: 'orca', code: 'runtime_unavailable' })
  o.reachable = true; registry.setRunId('duo', null)
  await expect(createTask(deps, { team: 'duo', title: 't' })).rejects.toMatchObject({ code: 'run_not_ready' })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('the same --retry-request with a different title → retry_request_args_changed before any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await createTask(deps, { team: 'duo', title: 'one' }).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await expect(createTask(deps, { team: 'duo', title: 'two', retryRequest: id })).rejects.toMatchObject({ code: 'retry_request_args_changed' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('create --post: a dispatch uncertainty names the original coordinator in the hint', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' }).catch((e) => e)
  expect(err.hint).toContain('--from coord-1')
})
test('create --post at a confirmation prompt: the task is still dispatched, delivery not_notified with the reason, nothing typed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'Do you want to proceed? (y/n)')
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(r).toMatchObject({ delivery: 'not_notified', reason: 'at_prompt' })
  expect(o.tasks.find((t) => t.id === r.id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(o.sent).toEqual([])
})
test('create --post by the post itself (caller\'s own terminal) is delivered as self, nothing typed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(r.delivery).toBe('self'); expect(o.sent).toEqual([])
})
test('plan: unknown task → task_not_found; a failed task is terminal; a later plan overwrites; a dispatched task accepts a plan', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const base = { title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null }
  o.tasks.push({ id: 'p1', status: 'dispatched', ...base, assigneeHandle: 'term-b', dispatchId: 'ctx-1' }, { id: 'p3', status: 'failed', ...base })
  registry.insertTaskExt({ taskId: 'p1', team: 'duo', tags: [], kind: 'work' }); registry.insertTaskExt({ taskId: 'p3', team: 'duo', tags: [], kind: 'work' })
  await expect(planTask(deps, { id: 'ghost', text: 'x' })).rejects.toMatchObject({ code: 'task_not_found' })
  await expect(planTask(deps, { id: 'p3', text: 'x' })).rejects.toMatchObject({ code: 'task_terminal' })
  await planTask(deps, { id: 'p1', text: '第一版' }); await planTask(deps, { id: 'p1', text: '第二版\n含换行' })
  expect(registry.getTaskExt('p1')!.plan).toBe('第二版\n含换行')
  expect(registry.listTaskLog('p1').map((l) => l.action)).toEqual(['plan', 'plan'])
  expect(registry.getTaskExt('p3')!.plan).toBeNull()
})
test('create --post at a frozen post is rejected before any Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'test' })
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen', hint: expect.stringContaining('wl dispatcher unfreeze checker@duo') })
  expect(o.orch).toEqual([])
})
