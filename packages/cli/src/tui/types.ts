import type { AttentionReport, PsRow, TaskRow, TimelineEvent, TimelineSource, WriteCommands } from '@weiping/wingline-core'
import type { LineInput } from './input.js'
import type { ScreenOut } from './screen.js'

export type View = 'overview' | 'inbox' | 'timeline'

/** 时间线过滤：`source:` / `post:` / `task:` 三选一。 */
export interface TimelineFilterSpec {
  source?: TimelineSource
  post?: string
  task?: string
}

/** 等用户按 y 确认后才执行的一次写操作。args 原样交给核心命令。 */
export interface PendingAction {
  command: keyof WriteCommands
  args: Record<string, unknown>
  label: string
}

export interface Step {
  prompt: string
  /** 留空也算数（比如静音时长）。 */
  optional?: boolean
}

/** 操作菜单里的一项：依次问完 steps，再由 build 给出要执行的操作；build 返回字符串表示输入有误。 */
export interface MenuItem {
  label: string
  steps: Step[]
  build(values: string[]): PendingAction | string
}

export interface TuiData {
  team: string
  posts: PsRow[]
  attention: AttentionReport
  tasks: TaskRow[]
  /** 最旧的在前。 */
  timeline: TimelineEvent[]
  /** 静音中的岗位地址。 */
  hushed: string[]
}

export interface TuiState {
  view: View
  selected: number
  menu: { items: MenuItem[]; selected: number } | null
  /** 正在逐项回答的操作。 */
  flow: { item: MenuItem; values: string[] } | null
  input: LineInput | null
  inputKind: 'flow' | 'filter' | null
  confirm: PendingAction | null
  filter: TimelineFilterSpec | null
  help: boolean
  status: string
  /** 结果不确定的上一次写操作（带 retryRequest），R 原样重试。 */
  lastUncertain: PendingAction | null
  /** 最近一次读取失败，显示的数据可能过期。 */
  stale: boolean
}

export type Effect = { kind: 'run'; action: PendingAction } | { kind: 'refresh' } | { kind: 'quit' }

export interface TuiInput {
  isTTY?: boolean
  on(event: 'data', fn: (chunk: Buffer | string) => void): unknown
  off(event: 'data', fn: (chunk: Buffer | string) => void): unknown
  setRawMode?(mode: boolean): unknown
  setEncoding?(enc: string): unknown
  resume?(): unknown
  pause?(): unknown
}

export interface TuiOutput extends ScreenOut {
  isTTY?: boolean
  on(event: 'resize', fn: () => void): unknown
  off(event: 'resize', fn: () => void): unknown
}

export interface TuiIo {
  stdin: TuiInput
  stdout: TuiOutput
}
