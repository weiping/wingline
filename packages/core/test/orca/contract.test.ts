import { expect, test } from 'vitest'
import { createOrcaClient } from '../../src/orca/client.js'
import type { OrcaRunner } from '../../src/orca/run.js'
import { classifyPreview } from '../../src/commands/task/notify.js'
import { fixture } from '../fixture.js'

type Env = { ok: boolean; result: any }
const real = fixture<Record<string, Env>>('orchestration-2a')
const r6 = fixture('orchestration-r6')

/** 真实的 OrcaClient，下面接一个按命令返回"真机回执"的假 OrcaRunner。 */
function clientOver(replies: Record<string, unknown>) {
  const calls: string[][] = []
  const runner: OrcaRunner = {
    async json<T>(args: string[]) {
      calls.push(args)
      const key = args.slice(0, 2).join(' ')
      if (!(key in replies)) throw new Error(`没有 ${key} 的回执`)
      return replies[key] as T
    },
    async text() { return '' },
  }
  return { client: createOrcaClient(runner), calls }
}
const res = (key: string) => real[key]!.result

test('run-create / run-show / run-list map the real receipts; run-list finds the wingline: Runs and tolerates the legacy Run without a coordinator', async () => {
  const { client } = clientOver({ 'orchestration run-create': res('run-create'), 'orchestration run-show': res('run-show'), 'orchestration run-list': res('run-list') })
  const created = await client.runCreate({ objective: 'wingline:contract-capture', from: 'h' })
  expect(created).toMatchObject({ id: expect.stringMatching(/^run_/), coordinatorHandle: expect.stringMatching(/^term_/), replayed: false })
  expect((await client.runShow({ id: created.id })).coordinatorHandle).toBe(created.coordinatorHandle)
  const runs = await client.runList()
  const mine = runs.filter((r) => r.objective.startsWith('wingline:'))
  expect(mine.length).toBeGreaterThanOrEqual(1)
  expect(mine.every((r) => r.coordinatorHandle !== null && r.createdAt.length > 0)).toBe(true)
  expect(runs.find((r) => !r.objective.startsWith('wingline:'))).toMatchObject({ coordinatorHandle: null })
})
test('request-show: completed carries the original receipt, absent has none, and a rejected worker_done is completed with a rejection message', async () => {
  const c = await clientOver({ 'orchestration request-show': res('request-show-completed') }).client.requestShow({ request: 'x' })
  expect(c.state).toBe('completed'); expect((c.receipt as any).message.type).toBe('worker_done')
  const t = await clientOver({ 'orchestration request-show': res('request-show-completed-task-create') }).client.requestShow({ request: 'x' })
  expect((t.receipt as any).task.id).toMatch(/^task_/)
  const a = await clientOver({ 'orchestration request-show': res('request-show-absent') }).client.requestShow({ request: 'x' })
  expect(a).toEqual({ state: 'absent', receipt: null })
  const rej = await clientOver({ 'orchestration request-show': res('request-show-rejected-worker-done') }).client.requestShow({ request: 'x' })
  expect(rej.state).toBe('completed')
  expect((rej.receipt as any).message.subject).toMatch(/^Rejected worker_done/)
  expect((rej.receipt as any).lifecycle).toMatchObject({ action: 'rejected', code: 'unknown_dispatch' })
})
test('task-create (with and without --parent), dispatch, worker_done, gate-create and gate-resolve map the real receipts', async () => {
  const one = await clientOver({ 'orchestration task-create': res('task-create') }).client.taskCreate({ spec: 's', taskTitle: 't', run: 'r', from: 'h' })
  expect(one).toMatchObject({ id: expect.stringMatching(/^task_/), replayed: false })
  const child = await clientOver({ 'orchestration task-create': res('task-create-with-parent') }).client.taskCreate({ spec: 's', taskTitle: 't', run: 'r', from: 'h', parent: one.id })
  expect(child.id).toMatch(/^task_/)
  expect(res('task-create-with-parent').task.parent_id).toBe(one.id)
  expect(await clientOver({ 'orchestration dispatch': res('dispatch') }).client.dispatch({ task: 't', to: 'h', from: 'c' })).toMatchObject({ dispatchId: expect.stringMatching(/^ctx_/), replayed: false })
  expect(await clientOver({ 'orchestration send': res('worker-done') }).client.workerDone({ taskId: 't', dispatchId: 'd', outcome: 'succeeded', subject: 's', run: 'r', from: 'h' })).toEqual({ replayed: false })
  const gate = await clientOver({ 'orchestration gate-create': res('gate-create') }).client.gateCreate({ task: 't', question: 'q', from: 'c' })
  expect(gate).toMatchObject({ id: expect.stringMatching(/^gate_/), replayed: false })
  expect(await clientOver({ 'orchestration gate-resolve': res('gate-resolve') }).client.gateResolve({ id: gate.id, resolution: 'ok', from: 'c' })).toEqual({ replayed: false })
})
test('task-list: completed has the worker_report result and no assignee/dispatch, dispatched has both, blocked has neither, parent_id maps to parentId', async () => {
  const tasks = await clientOver({ 'orchestration task-list': res('task-list-mixed') }).client.taskList({ run: 'r' })
  const by = (s: string) => tasks.find((t) => t.status === s)!
  const done = by('completed')
  expect(JSON.parse(done.result!)).toMatchObject({ provenance: 'worker_report', outcome: 'succeeded' })
  expect([done.assigneeHandle, done.dispatchId]).toEqual([null, null])
  expect(by('dispatched')).toMatchObject({ assigneeHandle: expect.stringMatching(/^term_/), dispatchId: expect.stringMatching(/^ctx_/), result: null })
  expect([by('blocked').assigneeHandle, by('blocked').dispatchId]).toEqual([null, null])
  const child = tasks.find((t) => t.title === 'T2-child')!
  expect(child.parentId).toBe(done.id)
  expect(tasks.filter((t) => t.id !== child.id).every((t) => t.parentId === null)).toBe(true)
  expect(tasks.every((t) => t.title.length > 0 && t.spec.length > 0)).toBe(true)
})
test('terminal show: the real receipt gives title/connected/preview; the R6 screens classify as at_prompt and clear', async () => {
  const v = await clientOver({ 'terminal show': res('terminal-show') }).client.terminalShow({ handle: 'h' })
  expect(v).toMatchObject({ handle: 'h', connected: true, preview: expect.any(String) })
  expect(typeof v.title === 'string' || v.title === null).toBe(true)
  const prompt = await clientOver({ 'terminal show': r6['terminal-show-at-yn-prompt'] }).client.terminalShow({ handle: 'h' })
  const idle = await clientOver({ 'terminal show': r6['terminal-show-idle-claude'] }).client.terminalShow({ handle: 'h' })
  expect(classifyPreview(prompt.preview)).toBe('at_prompt')
  expect(classifyPreview(idle.preview)).toBe('clear')
})
test('worktree show gives an absolute path', async () => {
  const w = await clientOver({ 'worktree show': res('worktree-show') }).client.worktreeShow({ worktree: 'path:/x' })
  expect(w.path.startsWith('/')).toBe(true)
})
test.each(['check-batch', 'check-batch-replayed', 'check-ack-wait-timeout', 'check-wait-75s-timeout', 'check-question'])('R6 %s parses', async (k) => {
  const r = await clientOver({ 'orchestration check': (r6[k] as Env).result }).client.check({ terminal: 't', run: 'r' })
  expect(r.count).toBe(r.messages.length)
})
test('R6 check flags: replayed batch, timed-out waits', async () => {
  const get = (k: string) => clientOver({ 'orchestration check': (r6[k] as Env).result }).client.check({ terminal: 't', run: 'r' })
  expect((await get('check-batch-replayed')).replayed).toBe(true)
  expect(await get('check-wait-75s-timeout')).toMatchObject({ timedOut: true, deliveryId: null, messages: [] })
  expect(await get('check-ack-wait-timeout')).toMatchObject({ timedOut: true, acknowledged: 'delivery_062b05154920' })
})
test('R6 question message: fromHandle is dispatch:<id> and the payload names the task', async () => {
  const r = await clientOver({ 'orchestration check': (r6['check-question'] as Env).result }).client.check({ terminal: 't', run: 'r' })
  expect(r.messages[0]!.fromHandle).toBe('dispatch:ctx_2fea0dc87772')
  expect(JSON.parse(r.messages[0]!.payload!)).toMatchObject({ taskId: 'task_6eace60970a8', question: 'r6 probe question?', options: ['a', 'b'] })
})
test('R6 worker-list: attention categories and liveness come through', async () => {
  const w = await clientOver({ 'orchestration worker-list': (r6['worker-list'] as Env).result }).client.workerList({ run: 'r' })
  expect(w.map((x) => [x.attention, x.liveness])).toEqual([[[], 'live'], [['unverifiable'], 'unverifiable'], [['root_completion'], 'unverifiable']])
})

// 真机回执（Task 1，Orca 1.4.227）：`orca search '"<标记>"' --agent <agent> --fresh --json` 原样存档。
// codex 这条为空：探针运行时 Orca 以 agent_prompt_blocked 拦下了 prompt，会话里没有标记文本。
test('search maps the real codex receipt: an empty hit list yields no session', async () => {
  const receipt = fixture<{ ok: boolean; result: { hits: Array<unknown> } }>('search-codex')
  expect(receipt.result.hits).toEqual([])
  const { client, calls } = clientOver({ 'search "WLS-1d14cc3f"': receipt.result })
  expect(await client.search({ query: '"WLS-1d14cc3f"', agent: 'codex' })).toEqual([])
  expect(calls[0]).toEqual(['search', '"WLS-1d14cc3f"', '--agent', 'codex', '--fresh'])
})

// claude 这条命中一个会话，但命中证据里没有本次查询的标记（见 REPORT"3A 探针"一节）——
// 只把真机确实给出的字段透传，其余一律不流进 SearchHit。snippet 原样保留：findSession 靠它的高亮区间判整串。
test('search maps the real claude receipt to the five spec fields and drops the rest', async () => {
  const receipt = fixture<{ ok: boolean; result: { hits: Array<Record<string, unknown>> } }>('search-claude')
  const { client } = clientOver({ 'search "WLS-f4ce035e"': receipt.result })
  expect(await client.search({ query: '"WLS-f4ce035e"', agent: 'claude' })).toEqual([
    { sessionId: 'sess-redacted-1', cwd: '/repo/wingline', updatedAt: '2026-10-17T05:39:03.838Z', messageCount: 1941, snippet: 'usr local bin orca [[wls]] 1d14cc3f agent fresh json dev null' },
  ])
})

// 命中时的字段映射（spec 第 2 节第 1 条）：缺字段的一律 null，不留 undefined。
test('search maps hit fields and defaults missing cwd/updatedAt/messageCount/snippet to null', async () => {
  const { client } = clientOver({
    'search "WLS-shape"': { hits: [{ sessionId: 'sess-1', cwd: '/repo', updatedAt: '2026-10-17T00:00:00Z', messageCount: 12, evidence: { snippet: '会话标记：[[WLS-shape]]' } }, { sessionId: 'sess-2' }] },
  })
  expect(await client.search({ query: '"WLS-shape"', agent: 'codex' })).toEqual([
    { sessionId: 'sess-1', cwd: '/repo', updatedAt: '2026-10-17T00:00:00Z', messageCount: 12, snippet: '会话标记：[[WLS-shape]]' },
    { sessionId: 'sess-2', cwd: null, updatedAt: null, messageCount: null, snippet: null },
  ])
})
