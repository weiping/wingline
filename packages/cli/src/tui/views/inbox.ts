import type { Row } from '../items.js'
import { oneLine } from '../text.js'
import type { TuiData } from '../types.js'
import { marker } from './overview.js'

/** 收件箱：告警（只读）在最前，然后按分节列出可处理的条目。 */
export function inboxBody(rows: Row[], selected: number, data: TuiData): string[] {
  const a = data.attention
  const lines: string[] = []
  if (a.warnings.length) lines.push(`告警（${a.warnings.length}）`, ...a.warnings.map((w) => `  ${oneLine(w)}`), '')
  let section = ''
  rows.forEach((r, i) => {
    if (r.section !== section) {
      section = r.section ?? ''
      const count = rows.filter((x) => x.section === section).length
      lines.push(`${section}（${count}）`)
    }
    lines.push(`${marker(i === selected)}${r.text}`)
  })
  if (rows.length === 0 && a.warnings.length === 0) lines.push('没有需要处理的事项')
  if (a.unavailable.length) lines.push('', `无法读取：${a.unavailable.map(oneLine).join('；')}`)
  return lines
}
