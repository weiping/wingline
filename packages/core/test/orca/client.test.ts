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
    { handle: 'h1', title: 'builder@duo', connected: true, worktreeId: 'w' },
    { handle: 'h2', title: 'checker@duo', connected: false, worktreeId: 'w' },
  ])
  expect(calls[0]).toEqual(['terminal', 'list', '--include-visual-layouts', '--worktree', 'w'])
})

test('terminalList: a terminal whose tab has no layout entry has a null title', async () => {
  const { client } = clientWith({ 'terminal list': { terminals: [{ handle: 'h', tabId: 'gone', title: 'zsh', connected: true, worktreeId: 'w' }], visualLayouts: [] } })
  expect((await client.terminalList())[0]!.title).toBeNull()
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

test('terminalSend defaults stages to [] and requestId to null when absent', async () => {
  const { client } = clientWith({ 'terminal send': { send: { accepted: true } } })
  expect(await client.terminalSend({ handle: 'h', text: 'x', enter: true, waitSubmitSec: 10 })).toEqual({ accepted: true, stages: [], requestId: null })
})

test('terminalClose reads close.ptyKilled', async () => {
  const { client, calls } = clientWith({ 'terminal close': { close: { ptyKilled: true } } })
  expect(await client.terminalClose({ handle: 'h' })).toEqual({ ptyKilled: true })
  expect(calls[0]).toEqual(['terminal', 'close', '--terminal', 'h'])
})
