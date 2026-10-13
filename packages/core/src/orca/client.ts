import type { OrcaRunner } from './run.js'
import type { OrcaClient, SendStage, TerminalSummary } from './types.js'

/** terminal wait 自带超时；进程级超时多留一点余量，避免先于 Orca 自己的超时回执杀掉它。 */
const WAIT_PROCESS_SLACK_MS = 15_000

export function createOrcaClient(runner: OrcaRunner): OrcaClient {
  return {
    async version() {
      return (await runner.text(['--version'])).trim()
    },

    async status() {
      const r = await runner.json<{ runtime: { reachable: boolean } }>(['status'])
      return { reachable: r.runtime.reachable }
    },

    async runCreate(a) {
      const r = await runner.json<{ run: { id: string } }>([
        'orchestration', 'run-create', '--objective', a.objective, '--retry-request', a.retryRequest,
      ])
      return { runId: r.run.id }
    },

    async terminalList(a) {
      const args = ['terminal', 'list', ...(a?.worktree ? ['--worktree', a.worktree] : [])]
      const r = await runner.json<{ terminals: TerminalSummary[] }>(args)
      return r.terminals.map(({ handle, title, connected, worktreeId }) => ({ handle, title, connected, worktreeId }))
    },

    async terminalCreate(a) {
      const r = await runner.json<{ terminal: { handle: string } }>([
        'terminal', 'create', '--worktree', a.worktree, '--title', a.title,
        '--command', a.command, '--retry-request', a.retryRequest,
      ])
      return { handle: r.terminal.handle }
    },

    async terminalWait(a) {
      const r = await runner.json<{ wait: { satisfied: boolean } }>(
        ['terminal', 'wait', '--terminal', a.handle, '--for', a.forState, '--timeout-ms', String(a.timeoutMs)],
        { timeoutMs: a.timeoutMs + WAIT_PROCESS_SLACK_MS },
      )
      return { satisfied: r.wait.satisfied }
    },

    async terminalSend(a) {
      const r = await runner.json<{ accepted: boolean; prompt?: { stages?: SendStage[] } }>([
        'terminal', 'send', '--terminal', a.handle, '--text', a.text, '--enter',
        '--wait-submit', String(a.waitSubmitSec), '--retry-request', a.retryRequest,
      ])
      return { accepted: r.accepted, stages: r.prompt?.stages ?? [] }
    },

    async terminalClose(a) {
      const r = await runner.json<{ close: { ptyKilled: boolean } }>(['terminal', 'close', '--terminal', a.handle])
      return { ptyKilled: r.close.ptyKilled }
    },

    async workerList(a) {
      const r = await runner.json<{ workers: unknown[] }>(['orchestration', 'worker-list', '--run', a.runId])
      return r.workers
    },
  }
}
