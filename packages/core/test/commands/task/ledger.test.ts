import { expect, test } from 'vitest'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { WinglineError } from '../../../src/errors.js'
import { fenced, indeterminate, ledgered, oneShot, refreshCoordinator, TRANSPORT_CODES } from '../../../src/commands/task/ledger.js'
import type { Registry } from '../../../src/registry/registry.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const rt = () => new WinglineError('orca', 'runtime_timeout', 'Timed out waiting for the Orca runtime')
const ru = () => new WinglineError('orca', 'runtime_unavailable', 'Start the Orca app first')
const timeout = () => new WinglineError('uncertain', 'orca_timeout', 'Orca 调用超过 120000 ms，结果不确定')
const createCall = (deps: CommandDeps, o: FakeOrca, key = 'k') => ledgered(deps, {
  key, team: 'duo',
  build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
  call: (a) => o.taskCreate(a),
})

test('writes pending with id+args before the call, done after; a second call never reaches Orca', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  let during: unknown
  o.onMutate = () => { during ??= registry.getRequest('k') }
  const r1 = await createCall(deps, o)
  expect(during).toMatchObject({ state: 'pending', retryRequest: expect.any(String), args: expect.stringContaining('coord-1') })
  expect(registry.getRequest('k')!.state).toBe('done')
  const before = o.orch.length
  expect(await createCall(deps, o)).toEqual(r1)
  expect(o.orch.length).toBe(before)
})
// 复审四 A-C1：首次调用已落地、却返回传输码。旧逻辑把新行删掉，重跑建出第二个对象。
test.each(['runtime_timeout', 'runtime_unavailable', 'remote_runtime_unavailable', 'invalid_runtime_response'])(
  'landed but returned %s → request-show completed → same-id replay settles it in the same command, one object', async (code) => {
    const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
    o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('orca', code, 'x') })
    const r = await createCall(deps, o)
    expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
    const ids = o.callsOf('taskCreate').map((a) => a.retryRequest)
    expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
    expect(o.callsOf('requestShow')).toHaveLength(1)
    expect(registry.getRequest('k')!.state).toBe('done')
  })
test('landed + orca_timeout, and request-show itself fails → uncertain, row kept; the rerun replays the same id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('原样重跑') })
  const id = registry.getRequest('k')!.retryRequest
  expect(registry.getRequest('k')!.state).toBe('uncertain')
  await createCall(deps, o)
  expect(o.callsOf('taskCreate').map((a) => a.retryRequest)).toEqual([id, id])
  expect(o.tasks).toHaveLength(1)
})
test('never arrived (transport fault before the ledger) → request-show absent → row dropped, exit-3 kind; the rerun uses a new id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'transport', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', code: 'runtime_unavailable', hint: expect.stringContaining('原样重跑') })
  expect(registry.getRequest('k')).toBeNull()
  await createCall(deps, o)
  const ids = o.callsOf('taskCreate').map((a) => a.retryRequest)
  expect(ids[1]).not.toBe(ids[0]); expect(o.tasks).toHaveLength(1)
})
test('request-show pending → uncertain, row kept', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() })
  o.onMutate = () => { const r = registry.getRequest('k'); if (r?.retryRequest) o.pendingIds.add(r.retryRequest) }
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('稍后') })
  expect(registry.getRequest('k')!.state).toBe('uncertain')
})
// 复审四 A-I2：被拒的 worker_done 记进 Orca 账本，同 id 永远拿回同一个拒绝
test('a recorded rejection (worker_identity_changed) → row dropped, exit-2 kind; after the cause is fixed the rerun uses a new id and succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  let from = 'term-x'
  const report = () => ledgered(deps, { key: 'r', team: 'duo', build: () => ({ taskId: t, dispatchId, outcome: 'succeeded' as const, subject: 's', run: 'run-1', from }), call: (a) => o.workerDone(a) })
  await expect(report()).rejects.toMatchObject({ kind: 'orca', code: 'worker_identity_changed' })
  expect(registry.getRequest('r')).toBeNull()
  from = 'term-b'
  await report()
  const ids = o.callsOf('workerDone').map((a) => a.retryRequest)
  expect(ids[1]).not.toBe(ids[0])
  expect(o.tasks.find((x) => x.id === t)!.status).toBe('completed')
})
test('a definite error that Orca did not record (task_not_startable) → request-show absent → row dropped, exit-2 kind', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'task_not_startable', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'orca', code: 'task_not_startable' })
  expect(registry.getRequest('k')).toBeNull()
})
test('consumer_fenced: refresh coordinator (only that column), new id, retry once', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  await createCall(deps, o)
  const calls = o.callsOf('taskCreate')
  expect(calls.map((a) => a.from)).toEqual(['coord-1', 'coord-2'])
  expect(calls[1]!.retryRequest).not.toBe(calls[0]!.retryRequest)
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
  expect(o.tasks).toHaveLength(1)
})
test('fenced again after the reissue → settled (absent) → row dropped, consumer_fenced surfaces', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'consumer_fenced', 'x') },
                { method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'consumer_fenced', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'orca', code: 'consumer_fenced' })
  expect(registry.getRequest('k')).toBeNull()
})
test('a landed call replays with its ORIGINAL --from even after the coordinator changed', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  await createCall(deps, o)
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-1' })
  expect(o.tasks).toHaveLength(1)
  expect(registry.getRequest('k')!.state).toBe('done')
})
// 复审四 A-I1：派发行存下的 --to 已是死终端
test('beforeReplay → settle: absent → reissued with freshly built args (the new target), new id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  let to = 'term-c'
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to, from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a),
    beforeReplay: async (s) => (o.terminals.some((x) => x.handle === s.to) ? 'replay' : 'settle') })
  o.faults.push({ method: 'dispatch', when: 'transport', error: ru() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' }); to = 'term-c2'
  await d()
  expect(o.callsOf('dispatch').map((a) => a.to)).toEqual(['term-c', 'term-c2'])
  expect(o.tasks.find((x) => x.id === t)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
  expect(registry.getRequest('d')!.state).toBe('done')
})
test('beforeReplay → settle: completed → replays the landed call (the caller then sees replayed: true)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to: 'term-c', from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a),
    beforeReplay: async (s) => (o.terminals.some((x) => x.handle === s.to) ? 'replay' : 'settle') })
  o.faults.push({ method: 'dispatch', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' })
  expect(await d()).toMatchObject({ dispatchId: 'ctx-1', replayed: true })
})

// —— oneShot（P2）——
const fromReceipt = (r: unknown) => ((r as { task?: { id?: string } })?.task?.id ? { id: (r as { task: { id: string } }).task.id, replayed: true } : null)
const oneShotCreate = (deps: CommandDeps, o: FakeOrca, retryRequest?: string, title = 't') => oneShot(deps, {
  team: 'duo', retryRequest, fromReceipt, retryHint: (id) => `wl task create duo --title ${title} --retry-request ${id}`,
  build: (t) => ({ spec: 's', taskTitle: title, run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a),
})
const handOver = async (o: FakeOrca, registry: Registry) => { await o.runUse({ id: 'run-1', from: 'coord-2' }); registry.updateCoordinatorHandle('duo', 'coord-2') }
const stuck = (o: FakeOrca, when: 'after' | 'before') => o.faults.push({ method: 'taskCreate', when, error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })

test('oneShot: an uncertain failure prints the id; the row lives under oneshot:<id>', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after')
  const err = await oneShotCreate(deps, o).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
  expect(registry.getRequest(`oneshot:${id}`)).toMatchObject({ state: 'uncertain', retryRequest: id })
  await oneShotCreate(deps, o, id)
  expect(o.tasks).toHaveLength(1)
})
test('oneShot retry after a coordinator handover, original landed: replays the ORIGINAL --from, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await handOver(o, registry)
  const r = await oneShotCreate(deps, o, id)
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ retryRequest: id, from: 'coord-1' })
  expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
})
test('oneShot retry after a coordinator handover, original never landed: original --from is fenced → reissued with the current coordinator, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'before'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await handOver(o, registry)
  await oneShotCreate(deps, o, id)
  expect(o.callsOf('taskCreate').map((a) => a.from)).toEqual(['coord-1', 'coord-1', 'coord-2'])
  expect(o.tasks).toHaveLength(1)
})
test('oneShot: the same --retry-request with different arguments → retry_request_args_changed before any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await expect(oneShotCreate(deps, o, id, '另一个标题')).rejects.toMatchObject({ kind: 'input', code: 'retry_request_args_changed' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('oneShot with no local row (other WINGLINE_HOME): completed → adopts the original receipt, no Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  registry.dropRequest(`oneshot:${id}`); await handOver(o, registry)
  const r = await oneShotCreate(deps, o, id)
  expect(r.id).toBe(o.tasks[0]!.id)
  expect(o.callsOf('taskCreate')).toHaveLength(1)
  expect(registry.getRequest(`oneshot:${id}`)!.state).toBe('done')
})
test('oneShot with no local row: absent → a normal call with that id; pending → exit-3 kind', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await oneShotCreate(deps, o, 'fresh-id')
  expect(o.callsOf('taskCreate')[0]!.retryRequest).toBe('fresh-id')
  o.pendingIds.add('busy-id')
  await expect(oneShotCreate(deps, o, 'busy-id')).rejects.toMatchObject({ kind: 'uncertain' })
})

// —— 补充：终局规则的边界 ——
test('TRANSPORT_CODES / fenced / indeterminate classify errors', () => {
  expect([...TRANSPORT_CODES].sort()).toEqual(['invalid_runtime_response', 'remote_runtime_unavailable', 'runtime_timeout', 'runtime_unavailable'])
  expect(fenced(new WinglineError('orca', 'consumer_fenced', 'x'))).toBe(true)
  expect(fenced(new WinglineError('orca', 'task_not_startable', 'x'))).toBe(false)
  expect(fenced(new Error('consumer_fenced'))).toBe(false)
  expect(indeterminate(rt())).toBe(true)
  expect(indeterminate(timeout())).toBe(true)
  expect(indeterminate(new WinglineError('orca', 'task_not_startable', 'x'))).toBe(false)
  expect(indeterminate(new WinglineError('input', 'runtime_timeout', 'x'))).toBe(false)
})
test('a definite recorded rejection is not replayed: exactly one workerDone call reaches Orca', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  await expect(ledgered(deps, { key: 'r', team: 'duo', build: () => ({ taskId: t, dispatchId, outcome: 'succeeded' as const, subject: 's', run: 'run-1', from: 'term-x' }), call: (a) => o.workerDone(a) }))
    .rejects.toMatchObject({ code: 'worker_identity_changed' })
  expect(o.callsOf('workerDone')).toHaveLength(1)
})
test('landed + transport code, and the same-id replay also fails with a transport code → uncertain, row kept, exactly two calls', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: rt() })
  // faults are picked by `when`, not queue order: arm the transport fault only once the replay (2nd call) starts
  o.onMutate = () => { if (o.callsOf('taskCreate').length === 2) o.faults.push({ method: 'taskCreate', when: 'transport', error: ru() }) }
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain' })
  expect(o.callsOf('taskCreate')).toHaveLength(2)
  expect(registry.getRequest('k')!.state).toBe('uncertain')
  expect(o.tasks).toHaveLength(1)
})
test('an input error propagates unchanged and leaves the row pending without asking request-show', async () => {
  const err = new WinglineError('input', 'bad', 'x')
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'transport', error: err })
  await expect(createCall(deps, o)).rejects.toBe(err)
  expect(registry.getRequest('k')!.state).toBe('pending')
  expect(o.callsOf('requestShow')).toHaveLength(0)
})
test.each([
  ['internal error', () => new WinglineError('internal', 'bad_json', 'x')],
  ['non-Wingline error (e.g. a receipt-shape TypeError)', () => new TypeError('boom')],
])('spec §9.1 step 2: an %s is settled through request-show like any other failure (never landed → row dropped, exit-3 kind with the cause kept)', async (_n, mk) => {
  const err = mk()
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'transport', error: err })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', cause: err })
  expect(o.callsOf('requestShow')).toHaveLength(1)
  expect(registry.getRequest('k')).toBeNull()
})
test('consumer_fenced is retried exactly once: two fences → two taskCreate calls, no third', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  for (let i = 0; i < 3; i++) o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'consumer_fenced', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ code: 'consumer_fenced' })
  expect(o.callsOf('taskCreate')).toHaveLength(2)
})
test('build runs once on the first call and not on a plain replay of a stored row', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  let builds = 0
  const c = () => ledgered(deps, { key: 'b', team: 'duo', build: (t) => { builds++; return { spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! } }, call: (a) => o.taskCreate(a) })
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(c()).rejects.toMatchObject({ kind: 'uncertain' })
  await c()
  expect(builds).toBe(1)
})
test('a custom hint is used when the outcome is unknown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(ledgered(deps, { key: 'h', team: 'duo', build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a), hint: (_a, id) => `custom ${id}` }))
    .rejects.toMatchObject({ hint: expect.stringMatching(/^custom .+/) })
})
test('beforeReplay → replay: the stored row is replayed with the same id and original args', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  let calls = 0
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to: 'term-c', from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a),
    beforeReplay: async () => { calls++; return 'replay' as const } })
  o.faults.push({ method: 'dispatch', when: 'before', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  await d()
  expect(calls).toBe(1)
  const ids = o.callsOf('dispatch').map((a) => a.retryRequest)
  expect(ids[1]).toBe(ids[0])
})
test('beforeReplay → settle with request-show pending → uncertain, row kept, no dispatch call', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to: 'term-c', from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a), beforeReplay: async () => 'settle' as const })
  o.faults.push({ method: 'dispatch', when: 'before', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  o.pendingIds.add(registry.getRequest('d')!.retryRequest!)
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('稍后') })
  expect(o.callsOf('dispatch')).toHaveLength(1)
  expect(registry.getRequest('d')!.state).toBe('uncertain')
})
test('a done row short-circuits before beforeReplay', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  let asked = 0
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to: 'term-c', from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a), beforeReplay: async () => { asked++; return 'settle' as const } })
  const r1 = await d()
  expect(await d()).toEqual(r1)
  expect(asked).toBe(0)
})
test('refreshCoordinator reads run-show and updates only coordinator_handle', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  const t = await refreshCoordinator(deps, 'duo')
  expect(t).toMatchObject({ coordinatorHandle: 'coord-2', runId: 'run-1', status: 'up' })
  expect(registry.getTeam('duo')).toEqual(t)
})
test('oneShot: completed but fromReceipt cannot read it → retry_request_unreadable (exit-3 kind)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  registry.dropRequest(`oneshot:${id}`)
  await expect(oneShot(deps, { team: 'duo', retryRequest: id, fromReceipt: () => null, retryHint: (x) => x, build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a) }))
    .rejects.toMatchObject({ kind: 'uncertain', code: 'retry_request_unreadable' })
})
test('oneShot with no local row and a failing request-show falls through to a normal call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'requestShow', when: 'before', error: ru() })
  await oneShotCreate(deps, o, 'given-id')
  expect(o.callsOf('taskCreate')[0]!.retryRequest).toBe('given-id')
  expect(o.tasks).toHaveLength(1)
})
test('oneShot id precedence: retryRequest over id over a random uuid', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const mk = (extra: { retryRequest?: string; id?: string }) => oneShot(deps, { team: 'duo', ...extra, fromReceipt, retryHint: (x) => x, build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a) })
  await mk({ retryRequest: 'rr', id: 'ii' })
  await mk({ id: 'ii' })
  await mk({})
  const ids = o.callsOf('taskCreate').map((a) => a.retryRequest as string)
  expect(ids.slice(0, 2)).toEqual(['rr', 'ii'])
  expect(ids[2]).toMatch(/^[0-9a-f-]{36}$/)
  expect(registry.getRequest('oneshot:rr')!.state).toBe('done')
})

test('oneShot: landed + transport code and the same-id replay fails again → hint carries --retry-request <id>', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: rt() })
  o.onMutate = () => { if (o.callsOf('taskCreate').length === 2) o.faults.push({ method: 'taskCreate', when: 'transport', error: ru() }) }
  const err = await oneShotCreate(deps, o).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
})
test('oneShot: request-show pending → hint carries --retry-request <id>', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() })
  o.onMutate = () => { const id = o.callsOf('taskCreate')[0]?.retryRequest as string | undefined; if (id) o.pendingIds.add(id) }
  const err = await oneShotCreate(deps, o).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
})
