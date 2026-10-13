import { expect, test } from 'vitest'
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

test('terminalCreate builds argv and reads result.terminal.handle', async () => {
  const { client, calls } = clientWith({ 'terminal create': { terminal: { handle: 'term-7' } } })
  expect(
    await client.terminalCreate({ worktree: 'current', title: 'builder@duo', command: 'claude --model opus', retryRequest: 'duo:builder:create:abcd1234' }),
  ).toEqual({ handle: 'term-7' })
  expect(calls[0]).toEqual([
    'terminal', 'create', '--worktree', 'current', '--title', 'builder@duo',
    '--command', 'claude --model opus', '--retry-request', 'duo:builder:create:abcd1234',
  ])
})

test('terminalList maps terminals and passes --worktree when given', async () => {
  const { client, calls } = clientWith({
    'terminal list': { terminals: [{ handle: 'h', title: null, connected: true, worktreeId: 'w', extra: 1 }] },
  })
  expect(await client.terminalList({ worktree: 'w' })).toEqual([{ handle: 'h', title: null, connected: true, worktreeId: 'w' }])
  expect(calls[0]).toEqual(['terminal', 'list', '--worktree', 'w'])
})

test('terminalWait passes --for tui-idle --timeout-ms 60000 and widens the process timeout', async () => {
  const { client, calls, opts } = clientWith({ 'terminal wait': { wait: { satisfied: true } } })
  expect(await client.terminalWait({ handle: 'h', forState: 'tui-idle', timeoutMs: 60000 })).toEqual({ satisfied: true })
  expect(calls[0]).toEqual(['terminal', 'wait', '--terminal', 'h', '--for', 'tui-idle', '--timeout-ms', '60000'])
  expect(opts[0]!.timeoutMs).toBeGreaterThan(60000)
})

test('terminalSend reads accepted and prompt.stages', async () => {
  const { client, calls } = clientWith({
    'terminal send': { accepted: true, prompt: { stages: ['input_accepted', 'turn_started'] } },
  })
  expect(await client.terminalSend({ handle: 'h', text: 'hi', enter: true, waitSubmitSec: 10, retryRequest: 'r' })).toEqual({
    accepted: true,
    stages: ['input_accepted', 'turn_started'],
  })
  expect(calls[0]).toEqual(['terminal', 'send', '--terminal', 'h', '--text', 'hi', '--enter', '--wait-submit', '10', '--retry-request', 'r'])
})

test('terminalSend defaults stages to [] when prompt is absent', async () => {
  const { client } = clientWith({ 'terminal send': { accepted: true } })
  expect((await client.terminalSend({ handle: 'h', text: 'x', enter: true, waitSubmitSec: 10, retryRequest: 'r' })).stages).toEqual([])
})

test('terminalClose reads close.ptyKilled', async () => {
  const { client, calls } = clientWith({ 'terminal close': { close: { ptyKilled: true } } })
  expect(await client.terminalClose({ handle: 'h' })).toEqual({ ptyKilled: true })
  expect(calls[0]).toEqual(['terminal', 'close', '--terminal', 'h'])
})

test('runCreate passes --objective and --retry-request, reads run id', async () => {
  const { client, calls } = clientWith({ 'orchestration run-create': { run: { id: 'run-1' } } })
  expect(await client.runCreate({ objective: 'wingline:duo', retryRequest: 'duo::run:abcd1234' })).toEqual({ runId: 'run-1' })
  expect(calls[0]).toEqual(['orchestration', 'run-create', '--objective', 'wingline:duo', '--retry-request', 'duo::run:abcd1234'])
})

test('workerList passes --run and returns workers', async () => {
  const { client, calls } = clientWith({ 'orchestration worker-list': { workers: [{ a: 1 }] } })
  expect(await client.workerList({ runId: 'run-1' })).toEqual([{ a: 1 }])
  expect(calls[0]).toEqual(['orchestration', 'worker-list', '--run', 'run-1'])
})
