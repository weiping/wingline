import type { OrcaClient, SendResult, TerminalSummary } from '../../src/orca/types.js'
import { Registry } from '../../src/registry/registry.js'
import type { CommandDeps } from '../../src/commands/deps.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface SentMessage { handle: string; text: string; retryRequest: string }

/** 可编排的假 OrcaClient：记录调用序列，终端列表随 create/close 变化。 */
export class FakeOrca implements OrcaClient {
  calls: string[] = []
  terminals: TerminalSummary[] = []
  versionText = '1.4.222'
  reachable = true
  waitSatisfied = true
  sendStages: SendResult['stages'] = ['input_accepted', 'turn_started']
  ptyKilled = true
  created: Array<{ worktree: string; title: string; command: string; retryRequest: string }> = []
  sent: SentMessage[] = []
  runCreates: Array<{ objective: string; retryRequest: string }> = []
  private n = 0
  onCreate?: () => void | Promise<void>
  sendError?: Error | (() => Error)
  failSendOnce?: Error

  async version() { this.calls.push('version'); return this.versionText }
  async status() { this.calls.push('status'); return { reachable: this.reachable } }
  async runCreate(a: { objective: string; retryRequest: string }) {
    this.calls.push('runCreate'); this.runCreates.push(a); return { runId: 'run-1' }
  }
  async terminalList() { this.calls.push('terminalList'); return this.terminals.map((t) => ({ ...t })) }
  async terminalCreate(a: { worktree: string; title: string; command: string; retryRequest: string }) {
    this.calls.push('terminalCreate'); this.created.push(a)
    await this.onCreate?.()
    const handle = `term-${++this.n}`
    this.terminals.push({ handle, title: a.title, connected: true, worktreeId: 'wt-1' })
    return { handle }
  }
  async terminalWait() { this.calls.push('terminalWait'); return { satisfied: this.waitSatisfied } }
  async terminalSend(a: { handle: string; text: string; retryRequest: string }) {
    this.calls.push('terminalSend')
    this.sent.push({ handle: a.handle, text: a.text, retryRequest: a.retryRequest })
    if (this.failSendOnce) { const e = this.failSendOnce; this.failSendOnce = undefined; throw e }
    return { accepted: true, stages: this.sendStages }
  }
  async terminalClose(a: { handle: string }) {
    this.calls.push('terminalClose')
    if (this.ptyKilled) this.terminals = this.terminals.filter((t) => t.handle !== a.handle)
    return { ptyKilled: this.ptyKilled }
  }
  async workerList() { this.calls.push('workerList'); return [] }
}

export function mkDeps(orca: FakeOrca, over: Partial<CommandDeps> = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const registry = Registry.open(path.join(home, 'state.db'))
  const warnings: string[] = []
  const deps: CommandDeps = {
    orca, registry, warn: (m) => warnings.push(m),
    verifiedOrca: '>=1.4.214 <1.5.0', createRun: true, multilineSafe: true, home, ...over,
  }
  return { deps, warnings, registry, home }
}
