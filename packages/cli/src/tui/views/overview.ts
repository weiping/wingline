import { eventLine, type Row } from '../items.js'
import type { TuiData } from '../types.js'

export const RECENT_EVENTS = 8

export const marker = (selected: boolean) => (selected ? '> ' : '  ')

/** 总览：岗位表，底部最近 8 条时间线。选中行用 `> ` 标出，不用任何终端样式。 */
export function overviewBody(rows: Row[], selected: number, data: TuiData): string[] {
  const lines = [`岗位（${rows.length}）`, ...rows.map((r, i) => `${marker(i === selected)}${r.text}`)]
  if (rows.length === 0) lines.push('  还没有岗位')
  lines.push('', '最近事件')
  const recent = data.timeline.slice(-RECENT_EVENTS)
  lines.push(...(recent.length ? recent.map((e) => `  ${eventLine(e)}`) : ['  暂无']))
  return lines
}
