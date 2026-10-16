import { expect, test } from 'vitest'
import { WinglineError } from '../../src/errors.js'
import { createOrcaClient } from '../../src/orca/client.js'
import type { OrcaRunner, RunOptions } from '../../src/orca/run.js'

function clientWith(results: Record<string, unknown>, text = '') {
  const calls: string[][] = []
  const opts: Array<RunOptions | undefined> = []
  const runner: OrcaRunner = {
    async json<T>(args: string[], o?: RunOptions) {
      calls.push(args)
      opts.push(o)
      return results[args.slice(0, 2).join(' ')] as T
    },
    async text(args) {
      calls.push(args)
      return text
    },
  }
  return { client: createOrcaClient(runner), calls, opts }
}

test('version trims the plain-text output', async () => {
  const { client, calls } = clientWith({}, '1.4.214\n')
  expect(await client.version()).toBe('1.4.214')
  expect(calls[0]).toEqual(['--version'])
})

test('status reads runtime.reachable', async () => {
  const { client } = clientWith({ 'status': { runtime: { reachable: false } } })
  expect(await client.status()).toEqual({ reachable: false })
})

test('terminalCreate builds argv (no --retry-request: Orca rejects it) and reads result.terminal.handle', async () => {
  const { client, calls } = clientWith({ 'terminal create': { terminal: { handle: 'term-7' } } })
  expect(
    await client.terminalCreate({ worktree: 'current', title: 'builder@duo', command: 'claude --model opus' }),
  ).toEqual({ handle: 'term-7' })
  expect(calls[0]).toEqual([
    'terminal', 'create', '--worktree', 'current', '--title', 'builder@duo', '--command', 'claude --model opus',
  ])
})

test('terminalList asks for visual layouts and resolves each terminal title from its tab', async () => {
  const { client, calls } = clientWith({
    'terminal list': {
      terminals: [
        { handle: 'h1', tabId: 't1', title: 'user@host: /repo', connected: true, worktreeId: 'w', extra: 1 },
        { handle: 'h2', tabId: 't2', title: 'zsh', connected: false, worktreeId: 'w' },
      ],
      visualLayouts: [
        { root: { type: 'group', tabs: [{ tabId: 't1', title: 'builder@duo', panes: { type: 'terminal', handle: 'h1' } }] } },
        { root: { type: 'split', children: [{ type: 'group', tabs: [{ tabId: 't2', title: 'checker@duo', panes: { type: 'terminal' } }] }] } },
      ],
    },
  })
  expect(await client.terminalList({ worktree: 'w' })).toEqual([
    { handle: 'h1', title: 'builder@duo', connected: true, worktreeId: 'w', lastOutputAt: null },
    { handle: 'h2', title: 'checker@duo', connected: false, worktreeId: 'w', lastOutputAt: null },
  ])
  expect(calls[0]).toEqual(['terminal', 'list', '--include-visual-layouts', '--worktree', 'w'])
})

test("terminalList: a terminal whose tab is not in any layout (headless, tabId 'pty:…') keeps its own title, which then is the custom one", async () => {
  const { client } = clientWith({
    'terminal list': {
      terminals: [
        { handle: 'h1', tabId: 'pty:10', title: 'builder@duo', connected: true, worktreeId: 'w' },
        { handle: 'h2', tabId: 'pty:11', title: 'user@host: ~/repo', connected: true, worktreeId: 'w' },
      ],
      visualLayouts: [],
    },
  })
  expect((await client.terminalList()).map((t) => t.title)).toEqual(['builder@duo', 'user@host: ~/repo'])
})

test('terminalWait passes --for tui-idle --timeout-ms 60000 and widens the process timeout', async () => {
  const { client, calls, opts } = clientWith({ 'terminal wait': { wait: { satisfied: true } } })
  expect(await client.terminalWait({ handle: 'h', forState: 'tui-idle', timeoutMs: 60000 })).toEqual({ satisfied: true })
  expect(calls[0]).toEqual(['terminal', 'wait', '--terminal', 'h', '--for', 'tui-idle', '--timeout-ms', '60000'])
  expect(opts[0]!.timeoutMs).toBeGreaterThan(60000)
})

test('terminalSend reads send.accepted, prompt.stages and Orca\'s mutation request id; no --retry-request', async () => {
  const { client, calls } = clientWith({
    'terminal send': {
      send: { accepted: true, prompt: { stages: ['input_accepted', 'turn_started'] } },
      mutation: { requestId: 'req-1', replayed: false },
    },
  })
  expect(await client.terminalSend({ handle: 'h', text: 'hi', enter: true, waitSubmitSec: 10 })).toEqual({
    accepted: true,
    stages: ['input_accepted', 'turn_started'],
    requestId: 'req-1',
  })
  expect(calls[0]).toEqual(['terminal', 'send', '--terminal', 'h', '--text', 'hi', '--enter', '--wait-submit', '10'])
})

test('terminalSend appends --retry-request only when given', async () => {
  const { client, calls } = clientWith({ 'terminal send': { send: { accepted: true } } })
  await client.terminalSend({ handle: 'h', text: 'hi', enter: true, waitSubmitSec: 10, retryRequest: 'req-1' })
  expect(calls[0]).toEqual(['terminal', 'send', '--terminal', 'h', '--text', 'hi', '--enter', '--wait-submit', '10', '--retry-request', 'req-1'])
})

test('terminalSend defaults stages to [] and requestId to null when absent', async () => {
  const { client } = clientWith({ 'terminal send': { send: { accepted: true } } })
  expect(await client.terminalSend({ handle: 'h', text: 'x', enter: true, waitSubmitSec: 10 })).toEqual({ accepted: true, stages: [], requestId: null })
})

test('terminalClose reads close.ptyKilled', async () => {
  const { client, calls } = clientWith({ 'terminal close': { close: { ptyKilled: true } } })
  expect(await client.terminalClose({ handle: 'h' })).toEqual({ ptyKilled: true })
  expect(calls[0]).toEqual(['terminal', 'close', '--terminal', 'h'])
})

test("terminalWait: Orca reports a wait timeout as an ok:false 'timeout' error, which means not satisfied", async () => {
  const runner: OrcaRunner = {
    async json() { throw new WinglineError('orca', 'timeout', 'timeout') },
    async text() { return '' },
  }
  expect(await createOrcaClient(runner).terminalWait({ handle: 'h', forState: 'tui-idle', timeoutMs: 1 })).toEqual({ satisfied: false })
})

test('terminalWait: other Orca errors still propagate', async () => {
  const runner: OrcaRunner = {
    async json() { throw new WinglineError('orca', 'terminal_not_found', 'gone') },
    async text() { return '' },
  }
  await expect(createOrcaClient(runner).terminalWait({ handle: 'h', forState: 'tui-idle', timeoutMs: 1 })).rejects.toMatchObject({ code: 'terminal_not_found' })
})

const m = (requestId: string, replayed = false) => ({ mutation: { requestId, replayed } })
test('runCreate / runUse / runShow read run.coordinator_handle; runUse has no --retry-request', async () => {
  const { client, calls } = clientWith({
    'orchestration run-create': { run: { id: 'run-1', coordinator_handle: 'h1' }, ...m('r1') },
    'orchestration run-use': { run: { id: 'run-1', coordinator_handle: 'h2' }, ...m('r2') },
    'orchestration run-show': { run: { id: 'run-1', coordinator_handle: 'h2' } },
  })
  expect(await client.runCreate({ objective: 'wingline:duo', from: 'h1', retryRequest: 'rid' })).toEqual({ id: 'run-1', coordinatorHandle: 'h1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'run-create', '--objective', 'wingline:duo', '--from', 'h1', '--retry-request', 'rid'])
  expect(await client.runUse({ id: 'run-1', from: 'h2' })).toEqual({ coordinatorHandle: 'h2' })
  expect(calls[1]).toEqual(['orchestration', 'run-use', '--id', 'run-1', '--from', 'h2'])
  expect(await client.runShow({ id: 'run-1' })).toEqual({ coordinatorHandle: 'h2' })
  expect(calls[2]).toEqual(['orchestration', 'run-show', '--id', 'run-1'])
})
test('runList maps runs; requestShow reads state', async () => {
  const { client, calls } = clientWith({
    'orchestration run-list': { runs: [{ id: 'run-1', objective: 'wingline:duo', coordinator_handle: 'h1', created_at: '2026-10-15 01:00:00' }] },
    'orchestration request-show': { state: 'completed', receipt: {} },
  })
  expect(await client.runList()).toEqual([{ id: 'run-1', objective: 'wingline:duo', coordinatorHandle: 'h1', createdAt: '2026-10-15 01:00:00' }])
  expect(await client.requestShow({ request: 'rid' })).toEqual({ state: 'completed', receipt: {} })
  expect(calls[1]).toEqual(['orchestration', 'request-show', '--request', 'rid'])
})
test('taskCreate passes quotes/newline/中文 verbatim and appends --parent / --retry-request only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration task-create': { task: { id: 't1' }, ...m('x', true) } })
  expect(await client.taskCreate({ spec: 'a: 修"bug"\n中文', taskTitle: 't', run: 'run-1', from: 'c' })).toEqual({ id: 't1', replayed: true })
  expect(calls[0]).toEqual(['orchestration', 'task-create', '--spec', 'a: 修"bug"\n中文', '--task-title', 't', '--run', 'run-1', '--from', 'c'])
  await client.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'c', parent: 't0', retryRequest: 'rid' })
  expect(calls[1]!.slice(-4)).toEqual(['--parent', 't0', '--retry-request', 'rid'])
})
test('taskList maps fields; blocked/terminal tasks without assignee keys map to null', async () => {
  const { client } = clientWith({ 'orchestration task-list': { tasks: [
    { id: 't1', status: 'blocked', task_title: 'x', spec: 's', parent_id: null, result: null },
    { id: 't2', status: 'dispatched', task_title: 'y', spec: 's', parent_id: 't1', assignee_handle: 'h2', dispatch_id: 'ctx-1', result: null },
  ] } })
  expect(await client.taskList({ run: 'run-1' })).toEqual([
    { id: 't1', status: 'blocked', title: 'x', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null },
    { id: 't2', status: 'dispatched', title: 'y', spec: 's', parentId: 't1', assigneeHandle: 'h2', dispatchId: 'ctx-1', result: null },
  ])
})
test('dispatch never sends --inject; reads dispatch.id and replayed', async () => {
  const { client, calls } = clientWith({ 'orchestration dispatch': { dispatch: { id: 'ctx-1' }, injected: false, ...m('rid') } })
  expect(await client.dispatch({ task: 't1', to: 'h2', from: 'c', retryRequest: 'rid' })).toEqual({ dispatchId: 'ctx-1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c', '--retry-request', 'rid'])
})
test('workerDone argv, --body only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration send': { message: {}, ...m('rid') } })
  expect(await client.workerDone({ taskId: 't1', dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', run: 'run-1', from: 'h2', retryRequest: 'rid' })).toEqual({ replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', 't1', '--dispatch-id', 'ctx-1', '--subject', 'gate passed', '--run', 'run-1', '--from', 'h2', '--retry-request', 'rid'])
})
test('gateCreate / gateResolve argv', async () => {
  const { client, calls } = clientWith({ 'orchestration gate-create': { gate: { id: 'gate-1' }, ...m('a') }, 'orchestration gate-resolve': { gate: {}, ...m('b') } })
  expect(await client.gateCreate({ task: 't1', question: 'q', from: 'c', retryRequest: 'a' })).toEqual({ id: 'gate-1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'gate-create', '--task', 't1', '--question', 'q', '--from', 'c', '--retry-request', 'a'])
  await client.gateResolve({ id: 'gate-1', resolution: 'retry', from: 'c', retryRequest: 'b' })
  expect(calls[1]).toEqual(['orchestration', 'gate-resolve', '--id', 'gate-1', '--resolution', 'retry', '--from', 'c', '--retry-request', 'b'])
})
test('terminalShow reads preview (empty when missing); worktreeShow reads the path', async () => {
  const { client, calls } = clientWith({
    'terminal show': { terminal: { handle: 'h1', title: 'builder@duo', connected: true, preview: 'line1\n❯ ' } },
    'worktree show': { worktree: { path: '/repo/wt' } },
  })
  expect(await client.terminalShow({ handle: 'h1' })).toEqual({ handle: 'h1', title: 'builder@duo', connected: true, preview: 'line1\n❯ ' })
  expect(calls[0]).toEqual(['terminal', 'show', '--terminal', 'h1'])
  expect(await client.worktreeShow({ worktree: 'id:w1' })).toEqual({ path: '/repo/wt' })
  expect(calls[1]).toEqual(['worktree', 'show', '--worktree', 'id:w1'])
})
test('workerDone appends --body only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration send': { message: {}, ...m('rid', true) } })
  expect(await client.workerDone({ taskId: 't1', dispatchId: 'ctx-1', outcome: 'failed', subject: 's', body: 'out\nput', run: 'run-1', from: 'h2' })).toEqual({ replayed: true })
  expect(calls[0]).toEqual(['orchestration', 'send', '--type', 'worker_done', '--outcome', 'failed', '--task-id', 't1', '--dispatch-id', 'ctx-1', '--subject', 's', '--body', 'out\nput', '--run', 'run-1', '--from', 'h2'])
})
test('requestShow defaults receipt to null; absent and pending states pass through', async () => {
  const { client } = clientWith({ 'orchestration request-show': { state: 'absent' } })
  expect(await client.requestShow({ request: 'rid' })).toEqual({ state: 'absent', receipt: null })
})
test('terminalShow defaults preview to an empty string', async () => {
  const { client } = clientWith({ 'terminal show': { terminal: { handle: 'h1', title: null, connected: false } } })
  expect(await client.terminalShow({ handle: 'h1' })).toEqual({ handle: 'h1', title: null, connected: false, preview: '' })
})
test('runCreate / dispatch / gateCreate omit --retry-request when not given', async () => {
  const { client, calls } = clientWith({
    'orchestration run-create': { run: { id: 'r', coordinator_handle: 'h' } },
    'orchestration dispatch': { dispatch: { id: 'd' } },
    'orchestration gate-create': { gate: { id: 'g' } },
  })
  await client.runCreate({ objective: 'o', from: 'h' })
  await client.dispatch({ task: 't', to: 'h2', from: 'c' })
  await client.gateCreate({ task: 't', question: 'q', from: 'c' })
  for (const c of calls) expect(c).not.toContain('--retry-request')
  expect(calls[1]).not.toContain('--inject')
})

test('check builds argv (ack before wait) and maps every field', async () => {
  const { client, calls } = clientWith({ 'orchestration check': {
    runId: 'run-1', deliveryId: 'dlv-2', count: 1, replayed: false, acknowledged: 'dlv-1', timedOut: false, cancelled: false, connectionLost: false,
    messages: [{ id: 'msg-1', type: 'question', from_handle: 'dispatch:ctx-1', subject: 's', body: 'b', payload: '{"x":1}', thread_id: 'msg-1', created_at: 'T' }],
  } })
  expect(await client.check({ terminal: 'term-dsp', run: 'run-1', ack: 'dlv-1', wait: true, timeoutMs: 60000 })).toEqual({
    deliveryId: 'dlv-2', count: 1, replayed: false, acknowledged: 'dlv-1', timedOut: false, cancelled: false, connectionLost: false,
    messages: [{ id: 'msg-1', type: 'question', fromHandle: 'dispatch:ctx-1', subject: 's', body: 'b', payload: '{"x":1}', threadId: 'msg-1', createdAt: 'T' }],
  })
  expect(calls[0]).toEqual(['orchestration', 'check', '--terminal', 'term-dsp', '--run', 'run-1', '--ack', 'dlv-1', '--wait', '--timeout-ms', '60000'])
})

test('check defaults missing fields; --wait gets a process timeout with slack, a plain check does not', async () => {
  const { client, opts } = clientWith({ 'orchestration check': { deliveryId: null, messages: [{ id: 'm1', type: 'worker_done' }] } })
  const r = await client.check({ terminal: 't', run: 'r', wait: true, timeoutMs: 60_000 })
  expect(r).toMatchObject({ count: 1, replayed: false, timedOut: false, cancelled: false, connectionLost: false, acknowledged: null })
  expect(r.messages[0]).toEqual({ id: 'm1', type: 'worker_done', fromHandle: null, subject: null, body: null, payload: null, threadId: null, createdAt: null })
  expect(opts[0]).toEqual({ timeoutMs: 60_000 + 15_000 })
  await client.check({ terminal: 't', run: 'r' })
  expect(opts[1]).toBeUndefined()
})

test('check --wait without timeoutMs defaults the process timeout to 60s plus slack', async () => {
  const { client, opts } = clientWith({ 'orchestration check': { messages: [] } })
  await client.check({ terminal: 't', run: 'r', wait: true })
  expect(opts[0]).toEqual({ timeoutMs: 60_000 + 15_000 })
})

test('reply / workerList / worktreeSet argv and mapping', async () => {
  const { client, calls } = clientWith({
    'orchestration reply': { message: { id: 'msg-9' }, duplicate: false },
    'orchestration worker-list': { workers: [{ dispatchId: 'ctx-1', taskId: 't1', agentTerminalHandle: 'h', dispatchStatus: 'dispatched', projection: { attention: { categories: ['input'] }, liveness: { verdict: 'live' } } }] },
    'worktree set': { worktree: {} },
  })
  expect(await client.reply({ id: 'msg-1', body: '用 a', run: 'run-1', from: 'coord' })).toEqual({ messageId: 'msg-9', duplicate: false })
  expect(calls[0]).toEqual(['orchestration', 'reply', '--id', 'msg-1', '--body', '用 a', '--run', 'run-1', '--from', 'coord'])
  expect(await client.workerList({ run: 'run-1' })).toEqual([{ dispatchId: 'ctx-1', taskId: 't1', terminalHandle: 'h', dispatchStatus: 'dispatched', attention: ['input'], liveness: 'live' }])
  expect(calls[1]).toEqual(['orchestration', 'worker-list', '--run', 'run-1'])
  await client.worktreeSet({ worktree: 'id:w', comment: 'c' })
  expect(calls[2]).toEqual(['worktree', 'set', '--worktree', 'id:w', '--comment', 'c'])
})

test('workerList tolerates a worker without projection', async () => {
  const { client } = clientWith({ 'orchestration worker-list': { workers: [{ dispatchId: 'ctx-1', taskId: 't1', dispatchStatus: 'dispatched' }] } })
  expect(await client.workerList({ run: 'r' })).toEqual([{ dispatchId: 'ctx-1', taskId: 't1', terminalHandle: null, dispatchStatus: 'dispatched', attention: [], liveness: null }])
})

test('terminalList maps lastOutputAt (a number), defaulting to null', async () => {
  const { client } = clientWith({ 'terminal list': { terminals: [
    { handle: 'a', tabId: 't1', title: 'x', connected: true, worktreeId: 'w', lastOutputAt: 1791941667225 },
    { handle: 'b', tabId: 't2', title: 'y', connected: true, worktreeId: 'w' },
  ] } })
  expect((await client.terminalList()).map((t) => t.lastOutputAt)).toEqual([1791941667225, null])
})
