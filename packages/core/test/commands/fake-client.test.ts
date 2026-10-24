import { WinglineError } from '../../src/errors.js'
import { expect, test } from 'vitest'
import { FakeOrca, bypassReport, mkDeps, seedRunningTeam } from './fake-client.js'

const mk = () => {
  const o = new FakeOrca()
  o.coordinator = 'coord-1'
  o.terminals = [
    { handle: 'term-b', title: 'builder@duo', connected: true, worktreeId: 'w' },
    { handle: 'term-c', title: 'checker@duo', connected: true, worktreeId: 'w' },
  ]
  return o
}
const newTask = async (o: FakeOrca, retryRequest?: string) =>
  (await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest })).id
const status = async (o: FakeOrca, id: string) => (await o.taskList({ run: 'run-1' })).find((t) => t.id === id)!

test('1. same id + same args replays the old snapshot even after the task moved on; same id + different args → request_mismatch', async () => {
  const o = mk()
  const t = await newTask(o)
  const first = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1', retryRequest: 'd1' })
  expect(first.replayed).toBe(false)
  await o.workerDone({ taskId: t, dispatchId: first.dispatchId, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-b' })
  expect((await status(o, t)).status).toBe('completed')
  expect(await o.dispatch({ task: t, to: 'term-b', from: 'coord-1', retryRequest: 'd1' })).toEqual({ dispatchId: first.dispatchId, replayed: true })
  await expect(o.dispatch({ task: t, to: 'term-c', from: 'coord-1', retryRequest: 'd1' })).rejects.toMatchObject({ kind: 'orca', code: 'request_mismatch' })
})

test('2. after a coordinator change the old --from can still replay a landed id, but a new id is fenced', async () => {
  const o = mk()
  const t = await newTask(o, 'c1')
  o.coordinator = 'coord-2'
  expect(await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).toMatchObject({ id: t, replayed: true })
  await expect(o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c2' })).rejects.toMatchObject({ code: 'consumer_fenced' })
})

test('3. a fenced call is not recorded: once the condition changes the same id executes for real', async () => {
  const o = mk()
  o.coordinator = 'coord-2'
  await expect(o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).rejects.toMatchObject({ code: 'consumer_fenced' })
  expect(o.ledger.has('c1')).toBe(false)
  o.coordinator = 'coord-1'
  expect(await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).toMatchObject({ replayed: false })
})

test('4. a rejected workerDone is ledgered (replay rethrows, request-show completed); a rejected dispatch is not (absent)', async () => {
  const o = mk()
  const t = await newTask(o)
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  const wd = { taskId: t, dispatchId, outcome: 'succeeded' as const, subject: 's', run: 'run-1', from: 'term-c', retryRequest: 'w1' }
  await expect(o.workerDone(wd)).rejects.toMatchObject({ code: 'worker_identity_changed' })
  await expect(o.workerDone(wd)).rejects.toMatchObject({ code: 'worker_identity_changed' })
  expect((await o.requestShow({ request: 'w1' })).state).toBe('completed')
  expect((await status(o, t)).status).toBe('dispatched')

  const t2 = await newTask(o)
  const again = { task: t, to: 'term-c', from: 'coord-1', retryRequest: 'd9' }
  await expect(o.dispatch(again)).rejects.toMatchObject({ code: 'task_not_startable' })
  expect(await o.requestShow({ request: 'd9' })).toEqual({ state: 'absent', receipt: null })
  expect((await status(o, t2)).status).toBe('ready')
})

test('5. an "after" fault lands the call but the caller sees an error; a "transport" fault fires before the ledger check even for a landed id', async () => {
  const o = mk()
  o.faults.push({ method: 'taskCreate', when: 'after', error: new Error('timeout') })
  await expect(o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).rejects.toThrow('timeout')
  expect((await o.taskList({ run: 'run-1' })).length).toBe(1)
  const shown = await o.requestShow({ request: 'c1' })
  expect(shown.state).toBe('completed')
  expect(shown.receipt).toMatchObject({ task: { id: expect.any(String) } })

  o.faults.push({ method: 'taskCreate', when: 'transport', error: new Error('ECONNRESET') })
  await expect(o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).rejects.toThrow('ECONNRESET')
  expect(await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).toMatchObject({ replayed: true })
  expect((await o.taskList({ run: 'run-1' })).length).toBe(1)
})

test('6. one dispatch per terminal: a second dispatch to the same handle → runtime_error and the task stays ready; after the first completes it works', async () => {
  const o = mk()
  const t1 = await newTask(o); const t2 = await newTask(o)
  const d1 = await o.dispatch({ task: t1, to: 'term-b', from: 'coord-1' })
  await expect(o.dispatch({ task: t2, to: 'term-b', from: 'coord-1' })).rejects.toMatchObject({ code: 'runtime_error', message: expect.stringContaining('already has an active dispatch') })
  expect((await status(o, t2)).status).toBe('ready')
  await o.workerDone({ taskId: t1, dispatchId: d1.dispatchId, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-b' })
  await expect(o.dispatch({ task: t2, to: 'term-b', from: 'coord-1' })).resolves.toMatchObject({ replayed: false })
})

test('7. gateCreate blocks (workerDone then inactive_dispatch, list hides assignee), gateResolve → ready, terminalClose → ready, closed handle still dispatchable', async () => {
  const o = mk()
  const t = await newTask(o)
  const d = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  const g = await o.gateCreate({ task: t, question: 'q', from: 'coord-1' })
  expect(await status(o, t)).toMatchObject({ status: 'blocked', assigneeHandle: null, dispatchId: null })
  await expect(o.workerDone({ taskId: t, dispatchId: d.dispatchId, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-b' })).rejects.toMatchObject({ code: 'inactive_dispatch' })
  await o.gateResolve({ id: g.id, resolution: 'retry', from: 'coord-1' })
  expect((await status(o, t)).status).toBe('ready')
  await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  await o.terminalClose({ handle: 'term-b' })
  expect((await status(o, t)).status).toBe('ready')
  await expect(o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })).resolves.toMatchObject({ replayed: false })
})

test('workerDone success completes/fails the task with a worker_report result; terminal tasks hide assignee and dispatch id', async () => {
  const o = mk()
  const t = await newTask(o)
  const d = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  await o.workerDone({ taskId: t, dispatchId: d.dispatchId, outcome: 'failed', subject: 's', run: 'run-1', from: 'term-b' })
  const got = await status(o, t)
  expect(got).toMatchObject({ status: 'failed', assigneeHandle: null, dispatchId: null })
  expect(JSON.parse(got.result!)).toEqual({ provenance: 'worker_report', outcome: 'failed', reportedBy: 'term-b' })
})

test('bypassReport reports as the current assignee without a retry id', async () => {
  const o = mk()
  const t = await newTask(o)
  await o.dispatch({ task: t, to: 'term-c', from: 'coord-1' })
  await bypassReport(o, t)
  expect(JSON.parse((await status(o, t)).result!)).toMatchObject({ provenance: 'worker_report', reportedBy: 'term-c' })
  expect(o.callsOf('workerDone')[0]).not.toHaveProperty('retryRequest')
})

test('a fault with match only fires for matching args and is consumed once; every read method honours a before fault', async () => {
  const o = mk()
  o.faults.push({ method: 'taskCreate', when: 'before', error: new Error('boom'), match: (a) => a.spec === 'bad' })
  await expect(o.taskCreate({ spec: 'good', taskTitle: 't', run: 'run-1', from: 'coord-1' })).resolves.toBeDefined()
  await expect(o.taskCreate({ spec: 'bad', taskTitle: 't', run: 'run-1', from: 'coord-1' })).rejects.toThrow('boom')
  await expect(o.taskCreate({ spec: 'bad', taskTitle: 't', run: 'run-1', from: 'coord-1' })).resolves.toBeDefined()
  for (const method of ['taskList', 'terminalShow', 'worktreeShow', 'runList', 'runShow', 'requestShow'] as const) {
    o.faults.push({ method, when: 'before', error: new Error(`f-${method}`) })
    await expect((o[method] as (a: never) => Promise<unknown>)({ run: 'run-1', handle: 'term-b', worktree: 'w', id: 'run-1', request: 'x' } as never)).rejects.toThrow(`f-${method}`)
  }
})

test('onMutate runs before the ledger check; orch/callsOf record mutations but not read-only calls', async () => {
  const o = mk()
  const seen: boolean[] = []
  o.onMutate = () => seen.push(o.ledger.has('c1'))
  await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })
  await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })
  expect(seen).toEqual([false, true])
  await o.taskList({ run: 'run-1' })
  expect(o.callsOf('taskCreate')).toHaveLength(2)
  expect(o.callsOf('taskList')).toEqual([])
  expect(o.orch.map((x) => x.m)).toEqual(['taskCreate', 'taskCreate'])
})

test('runCreate makes the caller the coordinator; runUse of an unknown run → run_not_found; terminalShow of a missing handle → terminal_handle_stale (real Orca), default preview', async () => {
  const o = new FakeOrca()
  o.terminals = [{ handle: 'h1', title: 'zsh', connected: true, worktreeId: 'w' }]
  const r = await o.runCreate({ objective: 'wingline:duo', from: 'h1' })
  expect(o.coordinator).toBe('h1')
  expect(await o.runList()).toEqual([expect.objectContaining({ id: r.id, objective: 'wingline:duo', coordinatorHandle: 'h1' })])
  await expect(o.runUse({ id: 'run-ghost', from: 'h2' })).rejects.toMatchObject({ code: 'run_not_found' })
  expect(await o.runUse({ id: r.id, from: 'h2' })).toEqual({ coordinatorHandle: 'h2' })
  expect(await o.terminalShow({ handle: 'h1' })).toMatchObject({ preview: '❯ ' })
  await expect(o.terminalShow({ handle: 'ghost' })).rejects.toMatchObject({ code: 'terminal_handle_stale' })
  await expect(o.gateResolve({ id: 'nope', resolution: 'x', from: 'h2' })).rejects.toMatchObject({ code: 'gate_not_found' })
})

test('seedRunningTeam registers a running duo team with a real spec hash, coordinator, run and terminals', async () => {
  const o = new FakeOrca()
  const { registry, deps } = seedRunningTeam(o)
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up', specHash: expect.stringMatching(/^[0-9a-f]{64}$/) })
  expect(registry.listPosts('duo').map((p) => [p.address, p.handle])).toEqual([['builder@duo', 'term-b'], ['checker@duo', 'term-c']])
  expect(o.coordinator).toBe('coord-1')
  expect(o.terminals.map((t) => t.handle).sort()).toEqual(['coord-1', 'term-b', 'term-c'])
  expect(deps.env).toEqual({})
  expect(deps.now()).toBeInstanceOf(Date)
  expect(mkDeps(o).deps.now).toBeTypeOf('function')
})

test('a "before" fault is taken after the ledger check: a landed id still replays while a fresh id fails', async () => {
  const o = mk()
  await newTask(o, 'c1')
  o.faults.push({ method: 'taskCreate', when: 'before', error: new Error('boom') })
  expect(await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c1' })).toMatchObject({ replayed: true })
  await expect(o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1', retryRequest: 'c2' })).rejects.toThrow('boom')
})

test('requestShow reports pending for ids in pendingIds, ahead of the ledger', async () => {
  const o = mk()
  o.pendingIds.add('p1')
  expect(await o.requestShow({ request: 'p1' })).toEqual({ state: 'pending', receipt: null })
})

test('replaying a rejected workerDone with different args is request_mismatch, not the stored rejection', async () => {
  const o = mk()
  const t = await newTask(o)
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  const base = { taskId: t, dispatchId, outcome: 'succeeded' as const, run: 'run-1', from: 'term-c', retryRequest: 'w1' }
  await expect(o.workerDone({ ...base, subject: 'a' })).rejects.toMatchObject({ code: 'worker_identity_changed' })
  await expect(o.workerDone({ ...base, subject: 'b' })).rejects.toMatchObject({ code: 'request_mismatch' })
})

test('8. (real Orca) an unknown dispatch id → unknown_dispatch, recorded: request-show is completed with a "Rejected worker_done" receipt carrying lifecycle.rejected', async () => {
  const o = mk(); const t = await newTask(o)
  await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  const wd = { taskId: t, dispatchId: 'ctx-nonexistent', outcome: 'succeeded' as const, subject: 's', run: 'run-1', from: 'term-b', retryRequest: 'w1' }
  await expect(o.workerDone(wd)).rejects.toMatchObject({ code: 'unknown_dispatch' })
  const shown = await o.requestShow({ request: 'w1' })
  expect(shown.state).toBe('completed')
  expect(shown.receipt).toMatchObject({ message: { subject: expect.stringMatching(/^Rejected worker_done/) }, lifecycle: { action: 'rejected', code: 'unknown_dispatch' } })
  expect((await status(o, t)).status).toBe('dispatched')
})
test('9. (real Orca) a duplicate worker_done on an already-completed dispatch is accepted and changes nothing', async () => {
  const o = mk(); const t = await newTask(o)
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  const wd = { taskId: t, dispatchId, outcome: 'succeeded' as const, subject: 's', run: 'run-1', from: 'term-b' }
  await o.workerDone(wd)
  const before = (await status(o, t)).result
  await expect(o.workerDone({ ...wd, outcome: 'failed' })).resolves.toEqual({ replayed: false })
  expect(await status(o, t)).toMatchObject({ status: 'completed', result: before })
})

test('screens model: terminalRead returns the last N lines; terminalShow keeps only the last 300 chars (like the real Orca); other terminals still use previews', async () => {
  const o = new FakeOrca()
  o.terminals.push({ handle: 'h1', title: 'builder@duo', connected: true, worktreeId: 'w' }, { handle: 'h2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  const screen = Array.from({ length: 60 }, (_, i) => `row ${String(i + 1).padStart(2, '0')} ${'x'.repeat(10)}`).join('\n')
  o.screens.set('h1', screen)
  const read = await o.terminalRead({ handle: 'h1', lines: 40 })
  expect(read.rows).toBe(40)
  expect(read.text.split('\n')[0]).toContain('row 21')
  expect(read.text.split('\n').at(-1)).toContain('row 60')
  const shown = await o.terminalShow({ handle: 'h1' })
  expect(shown.preview.length).toBeLessThanOrEqual(300)
  expect(shown.preview).toContain('row 60')
  expect(shown.preview).not.toContain('row 21')
  o.previews.set('h2', 'only a preview')
  expect(await o.terminalRead({ handle: 'h2', lines: 40 })).toEqual({ text: 'only a preview', rows: 1 })
  expect((await o.terminalShow({ handle: 'h2' })).preview).toBe('only a preview')
})

test('terminalRead of a missing handle is terminal_handle_stale and honours injected faults', async () => {
  const o = new FakeOrca()
  await expect(o.terminalRead({ handle: 'ghost', lines: 40 })).rejects.toMatchObject({ code: 'terminal_handle_stale' })
  o.terminals.push({ handle: 'h1', title: 't', connected: true, worktreeId: 'w' })
  o.faults.push({ method: 'terminalRead', when: 'before', error: new WinglineError('orca', 'screen_unavailable', 'x') })
  await expect(o.terminalRead({ handle: 'h1', lines: 40 })).rejects.toMatchObject({ code: 'screen_unavailable' })
})

