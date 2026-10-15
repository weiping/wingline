import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { locatePost } from '../locate.js'

export type ScreenState = 'clear' | 'at_prompt' | 'shell' | 'unknown'

/** 逐条对应 spec 第 7.4 节：agent 或包装器正停在需要人确认的画面上。 */
export const PROMPT_PATTERNS: readonly RegExp[] = [
  /\(y\/n\)/i,
  /\[y\/n\]/i,
  /\(yes\/no\)/i,
  /^\s*[❯>›]\s*\d+[.)]/,
  /do you want to/i,
  /would you like to/i,
  /\ballow /i,
  /\bapprove/i,
  /press enter/i,
  /esc to cancel/i,
  /trust (this|the) (folder|files|directory)/i,
  /continue\?/i,
  /\?\s*$/,
]

/** 终端已退回 shell：在那里打字会执行命令。只看最后一个非空行。 */
const SHELL_PROMPT = /(?:[$%#]\s*$)|(?:^PS .*>\s*$)|(?:^[A-Za-z]:\\.*>\s*$)/

export const SCREEN_TAIL_LINES = 8
const WAIT_SUBMIT_SEC = 10

/** 纯函数：取 preview 最后 8 行，任一行命中 PROMPT_PATTERNS → at_prompt；空 → unknown；否则 clear。 */
export function classifyPreview(preview: string): ScreenState {
  const lines = preview.split('\n')
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
  if (lines.length === 0) return 'unknown'
  const tail = lines.slice(-SCREEN_TAIL_LINES)
  if (tail.some((line) => PROMPT_PATTERNS.some((p) => p.test(line)))) return 'at_prompt'
  if (SHELL_PROMPT.test(tail[tail.length - 1]!)) return 'shell'
  return 'clear'
}

const FULL_WIDTH: Record<string, string> = { '`': '｀', $: '＄', ';': '；', '|': '｜', '&': '＆', '<': '＜', '>': '＞', '\\': '＼' }

/** 外来文本插进通知前：去控制字符、换行变空格，并把 shell 元字符换成全角（spec 第 7.4 节）。 */
export function neutralize(text: string, limit: number): string {
  const flat = text.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '')
  const safe = flat.replace(/[`$;|&<>\\]/g, (c) => FULL_WIDTH[c]!)
  const chars = Array.from(safe)
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : safe
}

/** terminal show：终端不存在 → 'offline'；调用失败 → 'unknown'；否则 classifyPreview。 */
export async function screenGuard(deps: CommandDeps, handle: string): Promise<ScreenState | 'offline'> {
  try {
    return classifyPreview((await deps.orca.terminalShow({ handle })).preview)
  } catch (err) {
    return err instanceof WinglineError && err.code === 'terminal_not_found' ? 'offline' : 'unknown'
  }
}

export type NotifyOutcome = 'notified' | 'notified_unconfirmed' | 'not_notified'
export interface NotifyResult {
  outcome: NotifyOutcome
  reason?: 'at_prompt' | 'screen_unknown' | 'post_offline' | 'send_failed'
}

const REFUSED = { at_prompt: 'at_prompt', shell: 'screen_unknown', unknown: 'screen_unknown', offline: 'post_offline' } as const

/** 永不抛出。text 必须是单行、≤ 600 字符。不写 requests 行：通知不重试（spec 第 7.3 节）。 */
export async function notifyPost(deps: CommandDeps, address: string, text: string): Promise<NotifyResult> {
  try {
    const located = await locatePost(deps.orca, address)
    if (!located) return { outcome: 'not_notified', reason: 'post_offline' }
    const screen = await screenGuard(deps, located.handle)
    if (screen !== 'clear') return { outcome: 'not_notified', reason: REFUSED[screen] }
    const sent = await deps.orca.terminalSend({ handle: located.handle, text, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC })
    return { outcome: sent.stages.includes('turn_started') ? 'notified' : 'notified_unconfirmed' }
  } catch (err) {
    deps.warn(`通知 ${address} 失败：${err instanceof Error ? err.message : String(err)}`)
    return { outcome: 'not_notified', reason: 'send_failed' }
  }
}
