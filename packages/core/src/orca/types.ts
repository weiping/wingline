/** title 是标签页的自定义标题（terminal create --title）；有界面时取自布局，无界面时取终端自己的 title。 */
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

export type OrchestrationTaskStatus = 'ready' | 'dispatched' | 'blocked' | 'completed' | 'failed'

export interface OrchestrationTask {
  id: string
  status: OrchestrationTaskStatus
  title: string
  spec: string
  parentId: string | null
  /** 终态/blocked 任务的 task-list 不带这两个键 → null。 */
  assigneeHandle: string | null
  dispatchId: string | null
  /** Orca 的 JSON 字符串原样保留。 */
  result: string | null
}

export interface RunSummary {
  id: string
  objective: string
  coordinatorHandle: string | null
  createdAt: string
}

export type RequestShowState = 'completed' | 'pending' | 'absent'

export interface TerminalView {
  handle: string
  title: string | null
  connected: boolean
  preview: string
}

export interface OrcaClient {
  version(): Promise<string>
  status(): Promise<{ reachable: boolean }>
  terminalList(a?: { worktree?: string }): Promise<TerminalSummary[]>
  terminalCreate(a: { worktree: string; title: string; command: string }): Promise<{ handle: string }>
  terminalWait(a: { handle: string; forState: 'tui-idle'; timeoutMs: number }): Promise<{ satisfied: boolean }>
  terminalSend(a: { handle: string; text: string; enter: true; waitSubmitSec: number; retryRequest?: string }): Promise<SendResult>
  terminalClose(a: { handle: string }): Promise<CloseResult>
  runCreate(a: { objective: string; from: string; retryRequest?: string }): Promise<{ id: string; coordinatorHandle: string; replayed: boolean }>
  runUse(a: { id: string; from: string }): Promise<{ coordinatorHandle: string }>
  runShow(a: { id: string }): Promise<{ coordinatorHandle: string }>
  runList(): Promise<RunSummary[]>
  /** receipt 原样（completed 时是原回执）。 */
  requestShow(a: { request: string }): Promise<{ state: RequestShowState; receipt: unknown }>
  taskCreate(a: { spec: string; taskTitle: string; run: string; from: string; parent?: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  taskList(a: { run: string }): Promise<OrchestrationTask[]>
  dispatch(a: { task: string; to: string; from: string; retryRequest?: string }): Promise<{ dispatchId: string; replayed: boolean }>
  workerDone(a: { taskId: string; dispatchId: string; outcome: 'succeeded' | 'failed'; subject: string; body?: string; run: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  gateCreate(a: { task: string; question: string; from: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  gateResolve(a: { id: string; resolution: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  terminalShow(a: { handle: string }): Promise<TerminalView>
  worktreeShow(a: { worktree: string }): Promise<{ path: string }>
}
