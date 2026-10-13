/** title 是标签页的自定义标题（terminal create --title），不是 shell 自己设置的窗口标题。 */
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
  /** Orca 为这次变更分配的请求 ID；只有它能用于 --retry-request。 */
  requestId: string | null
}

export interface CloseResult {
  ptyKilled: boolean
}

export interface OrcaClient {
  version(): Promise<string>
  status(): Promise<{ reachable: boolean }>
  terminalList(a?: { worktree?: string }): Promise<TerminalSummary[]>
  terminalCreate(a: { worktree: string; title: string; command: string }): Promise<{ handle: string }>
  terminalWait(a: { handle: string; forState: 'tui-idle'; timeoutMs: number }): Promise<{ satisfied: boolean }>
  terminalSend(a: { handle: string; text: string; enter: true; waitSubmitSec: number; retryRequest?: string }): Promise<SendResult>
  terminalClose(a: { handle: string }): Promise<CloseResult>
}
