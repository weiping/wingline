import type { PatrolStateRow } from '../../registry/registry.js'
import { LADDERS } from './signals.js'

const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** usage_limit 的预计重置时刻（本地 HH:MM）；detail 里没有或不是时间 → null。 */
export function resetClock(r: Pick<PatrolStateRow, 'signal' | 'detail'>): string | null {
  const at = r.signal === 'usage_limit' ? r.detail?.resetsAt : null
  const d = typeof at === 'string' ? new Date(at) : null
  return d && !Number.isNaN(d.getTime()) ? hhmm(d) : null
}

/** 画面信号给人看的一句话（服务端算好，网页 / CLI / TUI 都直接显示，不各自解析 detail）；普通信号没有。 */
export function signalSummary(r: Pick<PatrolStateRow, 'signal' | 'detail'>): string | null {
  if (r.signal === 'context_low') return typeof r.detail?.percent === 'number' ? `剩余 ${r.detail.percent}%` : '剩余不多'
  if (r.signal !== 'usage_limit') return null
  const clock = resetClock(r)
  return `${clock ? `预计 ${clock} 重置` : '重置时间未知'}${r.detail?.autoResume === 'armed' ? '；重置后会自动继续' : ''}`
}

/** 同一岗位同一等级时谁排前面：用量用完最要紧，其次按梯子的声明顺序，上下文快满排最后。 */
export function signalRank(signal: string): number {
  if (signal === 'usage_limit') return 0
  const i = Object.keys(LADDERS).indexOf(signal)
  return i >= 0 ? i + 1 : Number.MAX_SAFE_INTEGER
}

/** 一个岗位要在注释里标哪一个信号：等级高的优先，同级按 signalRank。 */
export function topSignal<T extends Pick<PatrolStateRow, 'signal' | 'level'>>(rows: readonly T[]): T | undefined {
  return [...rows].sort((a, b) => b.level - a.level || signalRank(a.signal) - signalRank(b.signal))[0]
}
