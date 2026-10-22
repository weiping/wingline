import { dispatcherLine } from '../output.js'
import { rowsOf } from './items.js'
import { oneLine } from './text.js'
import type { TuiData, TuiState, View } from './types.js'
import { fit } from './width.js'
import { inboxBody } from './views/inbox.js'
import { overviewBody } from './views/overview.js'
import { timelineBody } from './views/timeline.js'

export const MIN_COLS = 40

const TABS: Array<[View, string]> = [['overview', '1 总览'], ['inbox', '2 收件箱'], ['timeline', '3 时间线']]
const KEYS_HINT = 'j/k 选择  Enter 操作  Tab 切换  ? 帮助  q 退出'
const HELP = [
  '按键',
  '  1 2 3 / Tab     切换 总览 / 收件箱 / 时间线',
  '  ↑ ↓ / j k       选中行',
  '  Enter           打开选中项的操作菜单（没有写操作的条目会显示对应的 wl 命令）',
  '  /               时间线里按 source: / post: / task: 过滤，留空清除',
  '  r               立即刷新',
  '  R               结果不确定时按原样重试上一次写操作',
  '  ?               显示 / 关闭本帮助',
  '  q / Ctrl-C      退出',
  '',
  '写操作提交前会再确认一次：按 y 执行，其他键取消。',
]

function header(s: TuiState, data: TuiData): string[] {
  const tabs = TABS.map(([v, label]) => (v === s.view ? `[${label}]` : ` ${label} `)).join(' ')
  const a = data.attention
  const pending = a.frozen.length + a.signals.length + a.questions.length + a.stale.length + a.warnings.length
  const disp = dispatcherLine(a.dispatcher) ?? '调度员：未启动'
  return [`雁阵 ${oneLine(data.team)}   ${tabs}`, `${disp}   待办 ${pending}${s.stale ? '   [数据过期]' : ''}`]
}

function footer(s: TuiState, cols: number): string[] {
  if (s.confirm) return [`确认：${oneLine(s.confirm.label)}？按 y 执行，其他键取消`]
  const status = s.status ? oneLine(s.status) : KEYS_HINT
  if (s.input) return [status, s.input.view(cols)]
  if (!s.menu) return [status]
  const items = s.menu.items.map((m, i) => `${i === s.menu!.selected ? '> ' : '  '}${m.label}`)
  return ['操作（↑↓ 选择，Enter 确认，Esc 取消）：', ...items]
}

function body(s: TuiState, data: TuiData, height: number): string[] {
  if (s.help) return HELP
  const rows = rowsOf(s.view, s, data)
  const selected = Math.max(0, Math.min(s.selected, rows.length - 1))
  if (s.view === 'overview') return overviewBody(rows, selected, data)
  return s.view === 'inbox' ? inboxBody(rows, selected, data) : timelineBody(rows, selected, s.filter, height)
}

/** 整屏内容：每行恰好 cols 列；窗口过窄只给一行提示。输出里不含任何 ANSI 序列。 */
export function renderView(s: TuiState, data: TuiData, size: { cols: number; rows: number }): string[] {
  if (size.cols < MIN_COLS) return ['窗口太窄']
  const head = header(s, data)
  const foot = footer(s, size.cols)
  const height = Math.max(1, size.rows - head.length - foot.length)
  const main = body(s, data, height).slice(0, height)
  while (main.length < height) main.push('')
  return [...head, ...main, ...foot].map((l) => fit(l, size.cols))
}
