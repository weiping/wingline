import { filterText, type Row } from '../items.js'
import type { TimelineFilterSpec } from '../types.js'
import { marker } from './overview.js'

/** 时间线：旧的在上、新的在下，选中行默认贴着最新一条；超出屏幕高度只留选中行附近。 */
export function timelineBody(rows: Row[], selected: number, filter: TimelineFilterSpec | null, height: number): string[] {
  const head = filter ? `时间线（过滤：${filterText(filter)}，共 ${rows.length} 条）` : `时间线（共 ${rows.length} 条）`
  if (rows.length === 0) return [head, '  暂无事件']
  const room = Math.max(1, height - 1)
  const start = Math.max(0, Math.min(selected - Math.floor(room / 2), rows.length - room))
  return [head, ...rows.slice(start, start + room).map((r, i) => `${marker(start + i === selected)}${r.text}`)]
}
