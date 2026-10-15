// 审查方测试（spec 第 3、4 节、R6）：独立于实现计划里的用例。
import { expect, test } from 'vitest'
import { createOrcaClient } from '../../src/orca/client.js'
import type { OrcaRunner, RunOptions } from '../../src/orca/run.js'
import { fixture } from '../fixture.js'

const r6 = fixture('orchestration-r6')

function clientOver(replies: Record<string, unknown>) {
  const calls: string[][] = []
  const opts: Array<RunOptions | undefined> = []
  const runner: OrcaRunner = {
    async json<T>(args: string[], o?: RunOptions) {
      calls.push(args); opts.push(o)
      return replies[args.slice(0, 2).join(' ')] as T
    },
    async text() { return '' },
  }
  return { client: createOrcaClient(runner), calls, opts }
}

test('R6 check-batch: every message field is mapped and Orca-only fields (run_id, to_handle, priority) are dropped', async () => {
  const raw = r6['check-batch'].result
  const r = await clientOver({ 'orchestration check': raw }).client.check({ terminal: 't', run: 'r' })
  expect(r.deliveryId).toBe(raw.deliveryId)
  for (const [i, m] of r.messages.entries()) {
    const src = raw.messages[i]
    expect(Object.keys(m).sort()).toEqual(['body', 'createdAt', 'fromHandle', 'id', 'payload', 'subject', 'threadId', 'type'])
    expect(m).toMatchObject({ id: src.id, type: src.type, fromHandle: src.from_handle, threadId: src.thread_id, payload: src.payload })
  }
})

test('R6 replayed batch keeps the same deliveryId and reports replayed: true', async () => {
  const a = await clientOver({ 'orchestration check': r6['check-batch'].result }).client.check({ terminal: 't', run: 'r' })
  const b = await clientOver({ 'orchestration check': r6['check-batch-replayed'].result }).client.check({ terminal: 't', run: 'r' })
  expect(b.deliveryId).toBe(a.deliveryId)
  expect(b.replayed).toBe(true)
  expect(a.replayed).toBe(false)
})

test('R6 ack + wait timeout: empty batch, acknowledged echoes the acked delivery, timedOut true', async () => {
  const r = await clientOver({ 'orchestration check': r6['check-ack-wait-timeout'].result }).client.check({ terminal: 't', run: 'r', ack: 'delivery_062b05154920', wait: true, timeoutMs: 60_000 })
  expect(r).toEqual({ deliveryId: null, messages: [], count: 0, replayed: false, acknowledged: 'delivery_062b05154920', timedOut: true, cancelled: false, connectionLost: false })
})

test('cancelled and connectionLost flags pass through unchanged (spec 第 3 节四个标志)', async () => {
  const c = await clientOver({ 'orchestration check': { deliveryId: null, messages: [], cancelled: true } }).client.check({ terminal: 't', run: 'r' })
  expect(c).toMatchObject({ cancelled: true, connectionLost: false, timedOut: false })
  const l = await clientOver({ 'orchestration check': { deliveryId: null, messages: [], connectionLost: true } }).client.check({ terminal: 't', run: 'r' })
  expect(l).toMatchObject({ connectionLost: true, cancelled: false })
})

test('check without ack/wait sends neither flag and no --timeout-ms', async () => {
  const { client, calls, opts } = clientOver({ 'orchestration check': { messages: [] } })
  await client.check({ terminal: 'term-dsp', run: 'run-1' })
  expect(calls[0]).toEqual(['orchestration', 'check', '--terminal', 'term-dsp', '--run', 'run-1'])
  expect(opts[0]).toBeUndefined()
})

test('check --wait with the spec 60 s wait gets a process timeout strictly longer than the wait (no socket race)', async () => {
  const { client, opts } = clientOver({ 'orchestration check': { messages: [] } })
  await client.check({ terminal: 't', run: 'r', wait: true, timeoutMs: 60_000 })
  expect(opts[0]!.timeoutMs!).toBeGreaterThan(60_000)
})

test('check/reply never carry --retry-request (2A spec 第 9.3 节)', async () => {
  const { client, calls } = clientOver({ 'orchestration check': { messages: [] }, 'orchestration reply': r6['reply-ok'].result })
  await client.check({ terminal: 't', run: 'r', ack: 'd', wait: true, timeoutMs: 1 })
  await client.reply({ id: 'm', body: 'b', run: 'r', from: 'f' })
  expect(calls.flat()).not.toContain('--retry-request')
})

test('R6 reply-ok: messageId is the new reply message, duplicate false', async () => {
  const r = await clientOver({ 'orchestration reply': r6['reply-ok'].result }).client.reply({ id: 'msg_7c8bf81870b1', body: 'from t3', run: 'r', from: 'c' })
  expect(r).toEqual({ messageId: 'msg_92542c5ff532', duplicate: false })
})

test('reply body with spaces, quotes and newlines is a single argv element (no shell)', async () => {
  const { client, calls } = clientOver({ 'orchestration reply': r6['reply-ok'].result })
  const body = '用 "a"\n$HOME; rm -rf /'
  await client.reply({ id: 'm', body, run: 'r', from: 'f' })
  expect(calls[0]![calls[0]!.indexOf('--body') + 1]).toBe(body)
})

test('R6 worker-list maps agentTerminalHandle to terminalHandle; pending-question attention contains input', async () => {
  const raw = r6['worker-list'].result
  const w = await clientOver({ 'orchestration worker-list': raw }).client.workerList({ run: 'r' })
  expect(w.map((x) => x.terminalHandle)).toEqual(raw.workers.map((x: any) => x.agentTerminalHandle))
  expect(w.every((x) => x.dispatchStatus.length > 0 && x.taskId.startsWith('task_'))).toBe(true)
  const pending = { workers: [{ dispatchId: 'd', taskId: 't', dispatchStatus: 'dispatched', projection: r6['worker-list-pending-question-attention'] }] }
  expect((await clientOver({ 'orchestration worker-list': pending }).client.workerList({ run: 'r' }))[0]!.attention).toContain('input')
})

test('worker-list tolerates a worker without projection (attention [], liveness null, terminalHandle null)', async () => {
  const w = await clientOver({ 'orchestration worker-list': { workers: [{ dispatchId: 'd', taskId: 't', dispatchStatus: 'dispatched' }] } }).client.workerList({ run: 'r' })
  expect(w).toEqual([{ dispatchId: 'd', taskId: 't', terminalHandle: null, dispatchStatus: 'dispatched', attention: [], liveness: null }])
})

test('terminal list fixture: lastOutputAt is a Unix-ms number when Orca reports it', async () => {
  const raw = fixture('terminal-list')
  const list = await clientOver({ 'terminal list': raw.result ?? raw }).client.terminalList()
  expect(list.some((t) => typeof t.lastOutputAt === 'number' && t.lastOutputAt > 1_600_000_000_000)).toBe(true)
  expect(list.every((t) => t.lastOutputAt === null || typeof t.lastOutputAt === 'number')).toBe(true)
})
