import { describe, expect, test } from 'vitest'
import { FakeOrca, ask, bypassReport, clock, seedRunningTeam } from '../fake-client.js'

/** 协调者 coord-1 的 Run 里有一个已派发给 builder@duo 的任务。 */
async function seededDispatched() {
  const o = new FakeOrca()
  const s = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  return { o, s, taskId: id }
}
const chk = (o: FakeOrca, over: { ack?: string } = {}) => o.check({ terminal: 'coord-1', run: 'run-1', ...over })

describe('FakeOrca inbox model (R6 delivery semantics)', () => {
  test('1. check without ack returns the same deliveryId, replayed: true', async () => {
    const o = new FakeOrca(); seedRunningTeam(o)
    o.postMessage({ type: 'worker_done' })
    const first = await chk(o)
    const again = await chk(o)
    expect(first).toMatchObject({ replayed: false, count: 1 })
    expect(again).toMatchObject({ deliveryId: first.deliveryId, replayed: true, count: 1 })
    expect(again.messages.map((m) => m.id)).toEqual(first.messages.map((m) => m.id))
  })

  test('2. acking the same deliveryId twice is harmless; the inbox drains', async () => {
    const o = new FakeOrca(); seedRunningTeam(o)
    o.postMessage({ type: 'worker_done' })
    const d = await chk(o)
    const a1 = await chk(o, { ack: d.deliveryId! })
    const a2 = await chk(o, { ack: d.deliveryId! })
    expect(a1).toMatchObject({ deliveryId: null, count: 0, acknowledged: d.deliveryId })
    expect(a2).toMatchObject({ deliveryId: null, count: 0 })
    expect(o.inbox).toEqual([])
  })

  test('3. after runUse the previous generation delivery is fenced for old and new coordinator alike; messages come back under a new deliveryId', async () => {
    const o = new FakeOrca(); seedRunningTeam(o)
    const msg = o.postMessage({ type: 'worker_done' })
    const old = await chk(o)
    await o.runUse({ id: 'run-1', from: 'coord-1' })
    await expect(chk(o, { ack: old.deliveryId! })).rejects.toMatchObject({ code: 'consumer_fenced' })
    await o.runUse({ id: 'run-1', from: 'coord-2' })
    await expect(o.check({ terminal: 'coord-2', run: 'run-1', ack: old.deliveryId! })).rejects.toMatchObject({ code: 'consumer_fenced' })
    const redelivered = await o.check({ terminal: 'coord-2', run: 'run-1' })
    expect(redelivered.deliveryId).not.toBe(old.deliveryId)
    expect(redelivered).toMatchObject({ replayed: false, count: 1 })
    expect(redelivered.messages[0]!.id).toBe(msg.id)
  })

  test('4. check only accepts the current coordinator', async () => {
    const o = new FakeOrca(); seedRunningTeam(o)
    await expect(o.check({ terminal: 'term-b', run: 'run-1' })).rejects.toMatchObject({ code: 'consumer_fenced' })
    await expect(chk(o)).resolves.toMatchObject({ count: 0 })
  })

  test('5. reply only accepts the current coordinator; answering clears the input attention in worker-list', async () => {
    const { o, taskId } = await seededDispatched()
    const q = ask(o, taskId, '用 a 还是 b？', ['a', 'b'])
    expect((await o.workerList({ run: 'run-1' }))[0]!.attention).toContain('input')
    await expect(o.reply({ id: q.id, body: 'a', run: 'run-1', from: 'term-b' })).rejects.toMatchObject({ code: 'consumer_fenced' })
    expect(await o.reply({ id: q.id, body: 'a', run: 'run-1', from: 'coord-1' })).toMatchObject({ duplicate: false })
    expect((await o.workerList({ run: 'run-1' }))[0]!.attention).not.toContain('input')
    expect(await o.reply({ id: q.id, body: 'a', run: 'run-1', from: 'coord-1' })).toMatchObject({ duplicate: true })
    await expect(o.reply({ id: 'nope', body: 'a', run: 'run-1', from: 'coord-1' })).rejects.toMatchObject({ code: 'question_not_found' })
  })

  test('6. workerDone produces one worker_done message naming the task and dispatch', async () => {
    const { o, taskId } = await seededDispatched()
    const dispatchId = o.tasks[0]!.dispatchId
    await bypassReport(o, taskId)
    const d = await chk(o)
    expect(d.messages).toHaveLength(1)
    expect(d.messages[0]).toMatchObject({ type: 'worker_done', fromHandle: 'term-b' })
    expect(JSON.parse(d.messages[0]!.payload!)).toEqual({ taskId, dispatchId, outcome: 'succeeded' })
  })

  test('check times out cleanly when empty and waiting; faults and the worktree comment log work', async () => {
    const o = new FakeOrca(); seedRunningTeam(o)
    expect(await o.check({ terminal: 'coord-1', run: 'run-1', wait: true, timeoutMs: 60000 })).toMatchObject({ timedOut: true, deliveryId: null, count: 0 })
    o.faults.push({ method: 'check', when: 'before', error: new Error('boom') })
    await expect(chk(o)).rejects.toThrow('boom')
    await o.worktreeSet({ worktree: 'id:w', comment: 'c' })
    expect(o.comments).toEqual([{ worktree: 'id:w', comment: 'c' }])
  })

  test('clock: advance moves wall and monotonic, sleepJump only the wall; seedRunningTeam takes both', () => {
    const c = clock()
    const o = new FakeOrca()
    const { deps } = seedRunningTeam(o, { now: c.now, monotonic: c.monotonic })
    const [w0, m0] = [deps.now().getTime(), deps.monotonic()]
    c.advance(1000)
    c.sleepJump(5000)
    expect([deps.now().getTime() - w0, deps.monotonic() - m0]).toEqual([6000, 1000])
  })
})
