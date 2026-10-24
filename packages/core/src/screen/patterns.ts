import { createHash } from 'node:crypto'
import { classifyPreview, type ScreenState } from '../commands/task/notify.js'
import { parseResetTime } from './reset-time.js'

/** 画面信号只看屏幕最后这么多行（`guard` 仍只看最后 8 行，见 classifyPreview）。 */
export const SIGNAL_TAIL_LINES = 40

export type ScreenSignal =
  | { kind: 'context_low'; percent: number | null; notice: string; noticeHash: string }
  | { kind: 'usage_limit'; resetsAt: Date | null; autoResume: 'armed' | 'cancelled' | null; notice: string; noticeHash: string }

/*
 * 模式依据 claude 2.1.310 程序本体里的提示模板（见 spikes/REPORT.md “3D-2（块 c）探针 2（部分）”），**不是屏幕截图**：
 * 版面位置、重置时间的写法都是假设（provisional），取到真实画面后用 spikes/phase-3d2.ts sample 核对。
 * 一律锚定行首（允许前导空白与 ⎿ ⏺ ● · 这类符号）：对话正文里引用的提示文字前面有别的字，不会触发；
 * 窄面板把长行截断成 … 时，不完整的行也匹配不上。
 */
const LEAD = '^[\\s⎿⏺●·]*'
const CONTEXT_LOW = new RegExp(`${LEAD}Context low \\((\\d{1,3})% remaining\\)`)
const USAGE_LIMIT = [
  new RegExp(`${LEAD}You've hit your (?:session|weekly|Opus|Sonnet|Fable|usage credit|monthly spend) limit\\b`),
  new RegExp(`${LEAD}You're out of (?:extra )?usage`),
]
const AUTO_ARMED = new RegExp(`${LEAD}(?:Usage limit reached(?: again)? · )?[Cc]ontinuing automatically`)
const AUTO_CANCELLED = new RegExp(`${LEAD}Automatic continue cancelled`)

const hashOf = (notice: string): string => createHash('sha256').update(notice).digest('hex').slice(0, 12)

/** 自下而上找第一个满足 test 的行。 */
function lastMatch<T>(lines: string[], test: (line: string) => T | null): T | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const hit = test(lines[i]!)
    if (hit !== null) return hit
  }
  return null
}

function contextLow(lines: string[]): ScreenSignal | null {
  return lastMatch(lines, (line) => {
    const m = CONTEXT_LOW.exec(line)
    if (!m) return null
    const notice = line.trim()
    return { kind: 'context_low' as const, percent: Number(m[1]), notice, noticeHash: hashOf(notice) }
  })
}

function usageLimit(lines: string[], now: Date): ScreenSignal | null {
  const notice = lastMatch(lines, (line) => (USAGE_LIMIT.some((p) => p.test(line)) ? line.trim() : null))
  if (notice === null) return null
  // 同一屏上谁更靠下，谁说了算（取消之后又重新武装，反之亦然）
  const auto = lastMatch<'armed' | 'cancelled'>(lines, (line) => (AUTO_ARMED.test(line) ? 'armed' : AUTO_CANCELLED.test(line) ? 'cancelled' : null))
  return { kind: 'usage_limit', resetsAt: parseResetTime(notice, now), autoResume: auto, notice, noticeHash: hashOf(notice) }
}

/**
 * 纯函数：`guard` 与 classifyPreview 完全一致（最后 8 行）；信号只对有模式行的 agent（目前只有 claude）产生。
 * 同一 kind 在窗口里多处命中取最靠底部的一处；两种信号同时存在时 context_low 在前。
 */
export function detectScreen(agent: string, text: string, now: Date): { guard: ScreenState; signals: ScreenSignal[] } {
  const normalized = text.replace(/\r\n?/g, '\n')
  const guard = classifyPreview(normalized)
  if (agent !== 'claude') return { guard, signals: [] }
  const lines = normalized.split('\n').slice(-SIGNAL_TAIL_LINES)
  return { guard, signals: [contextLow(lines), usageLimit(lines, now)].filter((s): s is ScreenSignal => s !== null) }
}
