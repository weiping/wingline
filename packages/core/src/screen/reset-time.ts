const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

interface Wall {
  y: number
  m: number
  d: number
  h: number
  mi: number
  s: number
}

function zoneOk(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 某个时刻在时区 tz 里的墙上时间。 */
function wallIn(ms: number, tz: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ms))
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour'), mi: n('minute'), s: n('second') }
}

const offsetMs = (ms: number, tz: string): number => {
  const w = wallIn(ms, tz)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000
}

/** 时区 tz 里的墙上时间 → 时刻；算两遍偏移，夏令时切换前后也对。 */
function instantOf(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = guess - offsetMs(guess, tz)
  return guess - offsetMs(first, tz)
}

/** 12 小时制（`3pm`、`3:30pm`）优先，其次 24 小时制（`15:30`）；`13pm` 这类不可能的写法 → null。 */
function parseClock(text: string): { h: number; mi: number } | null | undefined {
  const twelve = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text)
  if (twelve) {
    const h12 = Number(twelve[1])
    if (h12 < 1 || h12 > 12) return null
    return { h: (h12 % 12) + (twelve[3]!.toLowerCase() === 'pm' ? 12 : 0), mi: Number(twelve[2] ?? 0) }
  }
  const twentyFour = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text)
  return twentyFour ? { h: Number(twentyFour[1]), mi: Number(twentyFour[2]) } : undefined
}

function parseDate(text: string): { m: number; d: number } | null {
  const hit = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`, 'i').exec(text)
  return hit ? { m: MONTHS.indexOf(hit[1]!.toLowerCase()) + 1, d: Number(hit[2]) } : null
}

/**
 * 限额提示里的重置时间 → 时刻；解析不出（含 `13pm`、未知时区）→ null。
 * 支持 `in 2h` / `in 45m`；`3pm`、`3:30pm`、`15:30`，可带括号时区 `(Asia/Shanghai)`（优先于 tz 参数，再不行用本机时区）和 `Oct 20` 这样的日期。
 * 只有时刻没有日期时，取今天或明天里最早的未来时刻。
 */
export function parseResetTime(text: string, now: Date, tz?: string): Date | null {
  const rel = /\bin\s+(\d+)\s*(h|m)[a-z]*\b/i.exec(text)
  if (rel) return new Date(now.getTime() + Number(rel[1]) * (rel[2]!.toLowerCase() === 'h' ? HOUR_MS : MINUTE_MS))
  const zone = /\(([A-Za-z]+(?:\/[A-Za-z_+-]+)+|UTC|GMT)\)/.exec(text)?.[1] ?? tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const clock = parseClock(text)
  if (!clock || !zoneOk(zone)) return null
  const today = wallIn(now.getTime(), zone)
  const date = parseDate(text)
  if (date) {
    for (const y of [today.y, today.y + 1]) {
      const t = instantOf(y, date.m, date.d, clock.h, clock.mi, zone)
      const w = wallIn(t, zone)
      if (w.m !== date.m || w.d !== date.d) return null // 2 月 30 日这类
      if (t > now.getTime()) return new Date(t)
    }
    return null
  }
  for (const add of [0, 1]) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + add))
    const t = instantOf(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), clock.h, clock.mi, zone)
    if (t > now.getTime()) return new Date(t)
  }
  return null
}
