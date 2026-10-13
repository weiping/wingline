export interface TerminalSummary {
  handle: string
  title: string | null
  connected: boolean
  worktreeId: string
}

export type SendStage = 'input_accepted' | 'turn_started'

export interface SendResult {
  accepted: boolean
  stages: SendStage[]
}

export interface CloseResult {
  ptyKilled: boolean
}

export interface OrcaClient {
  version(): Promise<string>
  status(): Promise<{ reachable: boolean }>
  runCreate(a: { objective: string; retryRequest: string }): Promise<{ runId: string }>
  terminalList(a?: { worktree?: string }): Promise<TerminalSummary[]>
  terminalCreate(a: { worktree: string; title: string; command: string }): Promise<{ handle: string }>
  terminalWait(a: { handle: string; forState: 'tui-idle'; timeoutMs: number }): Promise<{ satisfied: boolean }>
  terminalSend(a: { handle: string; text: string; enter: true; waitSubmitSec: number; retryRequest: string }): Promise<SendResult>
  terminalClose(a: { handle: string }): Promise<CloseResult>
  workerList(a: { runId: string }): Promise<unknown[]>
}
