import { expect, test } from 'vitest'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { announce, dispatchTo, isBusyError, SPEC_FOOTER, taskSpec } from '../../../src/commands/task/dispatch.js'
import { WinglineError } from '../../../src/errors.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const readyTask = async (o: FakeOrca, deps: CommandDeps, owner = 'checker@duo') => {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: owner }); return id
}
const C = { address: 'checker@duo', handle: 'term-c' }
test('dispatch never injects; to another post the result is dispatched, not self; dispatched_at is written', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await readyTask(o, deps)
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  expect(o.callsOf('dispatch')).toEqual([{ task: id, to: 'term-c', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getTaskExt(id)!.dispatchedAt).toEqual(expect.any(String))
})
test('to the caller\'s own terminal: self', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await dispatchTo(deps, 'duo', await readyTask(o, deps), C)).toMatchObject({ status: 'dispatched', self: true })
})
test('target already holds a dispatched task → queued without calling dispatch and without a ledger row', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const busy = await readyTask(o, deps); await dispatchTo(deps, 'duo', busy, C)
  const id = await readyTask(o, deps)
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'queued', busyWith: busy })
  expect(o.callsOf('dispatch')).toHaveLength(1)
  expect(registry.getRequest(`dispatch:${id}:0`)).toBeNull()
})
// spec 第 7.3 节：检查与派发之间对方刚好接了别的任务
test('the target became busy between the check and the call: Orca runtime_error → request-show absent → row dropped → queued', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const other = await readyTask(o, deps); const id = await readyTask(o, deps)
  o.onMutate = () => { if (!o.tasks.some((t) => t.status === 'dispatched')) { const t = o.tasks.find((x) => x.id === other)!; t.status = 'dispatched'; t.assigneeHandle = 'term-c'; t.dispatchId = 'ctx-9' } }
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'queued', busyWith: other })
  expect(registry.getRequest(`dispatch:${id}:0`)).toBeNull()
})
test('already dispatched to the same target: no second dispatch', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C); await dispatchTo(deps, 'duo', id, C)
  expect(o.callsOf('dispatch')).toHaveLength(1)
})
test('bumping the epoch closes an unfinished verdict of the previous round as abandoned', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C)
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'checker@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-x', body: null })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })
  expect(registry.getVerdict(id, 0)).toMatchObject({ result: JSON.stringify({ outcome: 'abandoned' }), finishedAt: expect.any(String) })
})
test('task returned to ready after its terminal closed: next dispatch bumps epoch (CAS) and uses a new ledger key', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C)
  await o.terminalClose({ handle: 'term-c' })
  o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(registry.getRequest(`dispatch:${id}:1`)!.state).toBe('done')
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('epoch_bump')
})
test('this round\'s dispatch row is done and the task has since completed: stored result, no Orca write, epoch unchanged', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  const first = await dispatchTo(deps, 'duo', id, C)
  await o.workerDone({ taskId: id, dispatchId: (first as { dispatchId: string }).dispatchId, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-c' })
  o.orch.length = 0
  expect(await dispatchTo(deps, 'duo', id, C)).toMatchObject({ status: 'dispatched', dispatchId: 'ctx-1' })
  expect(o.orch).toEqual([])
  expect(registry.getTaskExt(id)!.epoch).toBe(0)
})
test('dispatch landed but returned runtime_timeout: settled as dispatched in the same call (no task_not_open)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  o.faults.push({ method: 'dispatch', when: 'after', error: new WinglineError('orca', 'runtime_timeout', 't') })
  expect(await dispatchTo(deps, 'duo', id, C)).toMatchObject({ status: 'dispatched', dispatchId: 'ctx-1', replayed: true })
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
})
test('a replayed dispatch whose task went back to ready (terminal closed) bumps epoch and dispatches once more', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  o.faults.push({ method: 'dispatch', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await expect(dispatchTo(deps, 'duo', id, C)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect(await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })).toMatchObject({ status: 'dispatched' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
})
test('no ledger row and the task is not ready → task_not_open', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await o.gateCreate({ task: id, question: 'q', from: 'coord-1' })
  await expect(dispatchTo(deps, 'duo', id, C)).rejects.toMatchObject({ code: 'task_not_open' })
})
test('announce: dispatched → new-task line through notifyPost; queued → queued line; self → nothing typed; the screen guard is respected', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const t = { id: 'task-1', title: '实现\n登录' }
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false }, null)).toEqual({ delivery: 'notified' })
  expect(o.sent.at(-1)!.text).toBe('[雁阵] 你有新任务 task-1：实现 登录。查看：wl task show task-1；完成后运行：wl task done task-1（不要直接用 orca orchestration send 上报）')
  expect(await announce(deps, 'duo', t, C, { status: 'queued', busyWith: 'task-0' }, null)).toEqual({ delivery: 'queued', busyWith: 'task-0' })
  expect(o.sent.at(-1)!.text).toContain('你有排队任务 task-1')
  const n = o.sent.length
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: true, replayed: false }, null)).toEqual({ delivery: 'self' })
  o.previews.set('term-c', 'Allow this edit? (y/n)')
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false }, null)).toEqual({ delivery: 'not_notified', reason: 'at_prompt' })
  expect(o.sent.length).toBe(n)
})

test('isBusyError is true only for an orca runtime_error that says the terminal already has an active dispatch', () => {
  expect(isBusyError(new WinglineError('orca', 'runtime_error', 'terminal term-c already has an active dispatch'))).toBe(true)
  expect(isBusyError(new WinglineError('orca', 'runtime_error', 'something else'))).toBe(false)
  expect(isBusyError(new WinglineError('orca', 'task_not_startable', 'already has an active dispatch'))).toBe(false)
  expect(isBusyError(new Error('already has an active dispatch'))).toBe(false)
})
test('taskSpec: multiline-safe → head + blank line + footer; otherwise one line joined by 。; the footer names wl task done and forbids orca send', () => {
  const o = new FakeOrca()
  expect(taskSpec(seedRunningTeam(o).deps, 'h: t')).toBe(`h: t\n\n${SPEC_FOOTER}`)
  expect(taskSpec(seedRunningTeam(o, { multilineSafe: false }).deps, 'h: t')).toBe(`h: t。${SPEC_FOOTER}`)
  expect(SPEC_FOOTER).toContain('wl task done'); expect(SPEC_FOOTER).toContain('不要直接用 orca orchestration send 上报')
})
test('a dispatch to the caller\'s own terminal does not send the self flag to Orca', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  await dispatchTo(deps, 'duo', await readyTask(o, deps), C)
  expect(o.callsOf('dispatch')[0]).not.toHaveProperty('self')
})
test('a queued result does not set dispatched_at', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await dispatchTo(deps, 'duo', await readyTask(o, deps), C)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C)
  expect(registry.getTaskExt(id)!.dispatchedAt).toBeNull()
})
test('a dispatch that never landed to a terminal that has since died is re-issued to the new target in the same epoch', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await expect(dispatchTo(deps, 'duo', id, C)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect(await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })).toMatchObject({ status: 'dispatched' })
  expect(o.callsOf('dispatch').map((a) => a.to)).toEqual(['term-c', 'term-c2'])
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
  expect(registry.getTaskExt(id)!.epoch).toBe(0)
})
test('announce logs the transition then the notification result, with the actor source', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const t = { id: 'task-1', title: 'x' }
  await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'c', self: false, replayed: false }, { address: 'builder@duo', explicit: true })
  await announce(deps, 'duo', t, C, { status: 'queued', busyWith: 'task-0' }, null)
  const log = registry.listTaskLog('task-1')
  expect(log.map((l) => [l.action, l.actorSource])).toEqual([['start', 'explicit'], ['notify', 'explicit'], ['queued', 'human'], ['notify', 'human']])
  expect(log[1]!.detail).toContain('notified')
})
test('announce neutralises the title (shell metacharacters) and caps it at 80 characters', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await announce(deps, 'duo', { id: 'task-1', title: 'a $(id); b | c' }, C, { status: 'dispatched', dispatchId: 'c', self: false, replayed: false }, null)
  expect(o.sent.at(-1)!.text).toContain('a ＄(id)； b ｜ c')
  await announce(deps, 'duo', { id: 'task-2', title: 'x'.repeat(200) }, C, { status: 'dispatched', dispatchId: 'c', self: false, replayed: false }, null)
  expect(o.sent.at(-1)!.text).toContain(`${'x'.repeat(80)}…`)
  expect(o.sent.at(-1)!.text).not.toContain('x'.repeat(81))
})
test('a queued announcement never fails the command: at a prompt it is simply not typed, delivery stays queued', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'Allow this edit? (y/n)')
  expect(await announce(deps, 'duo', { id: 't', title: 'x' }, C, { status: 'queued', busyWith: 'task-0' }, null)).toEqual({ delivery: 'queued', busyWith: 'task-0' })
  expect(o.sent).toEqual([])
})
