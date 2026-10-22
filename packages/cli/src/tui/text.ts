import { plainText, type TimelineEvent } from '@wingline/core'

/**
 * 外部文本（提问正文、任务标题、时间线字段……）显示前一律经这里：剥掉 ANSI/OSC 序列和控制字符，折成一行。
 * 否则一条带 `\x1b]0;…\x07` 的提问就能改掉终端标题（标题是岗位身份）或清屏。
 */
export function oneLine(s: string): string {
  return plainText(s).replace(/[\r\n\t]+/g, ' ')
}

function cleanDeep(v: unknown): unknown {
  if (typeof v === 'string') return oneLine(v)
  if (Array.isArray(v)) return v.map(cleanDeep)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [oneLine(k), cleanDeep(x)]))
  return v
}

/** 时间线事件里所有字符串（含 detail 的嵌套内容）都先清洗，再交给 renderTimelineEvent 排版。 */
export function cleanEvent(e: TimelineEvent): TimelineEvent {
  return {
    ...e,
    actor: oneLine(e.actor),
    action: oneLine(e.action),
    target: e.target === null ? null : oneLine(e.target),
    outcome: e.outcome === null ? null : oneLine(e.outcome),
    detail: cleanDeep(e.detail),
  }
}
