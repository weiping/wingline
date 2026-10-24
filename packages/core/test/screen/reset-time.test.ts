import { expect, test } from 'vitest'
import { parseResetTime } from '../../src/screen/reset-time.js'

const iso = (d: Date | null) => d?.toISOString() ?? null
const at = (s: string) => new Date(s).toISOString()

test.each([
  ['resets 3pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-16T15:00:00+08:00'],
  ['resets 3pm', '2026-10-16T15:00:00+08:00', 'Asia/Shanghai', '2026-10-17T15:00:00+08:00'], // 正好到点：取最早的“未来”时刻，所以是明天
  ['resets 9am', '2026-10-16T10:00:00+08:00', 'Asia/Shanghai', '2026-10-17T09:00:00+08:00'], // 已过去的时刻 → 明天
  ['resets 3:30pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-16T15:30:00+08:00'],
  ['resets 15:30 (Asia/Shanghai)', '2026-10-16T01:00:00Z', undefined, '2026-10-16T15:30:00+08:00'],
  ['resets 3pm (Asia/Shanghai)', '2026-10-16T01:00:00Z', 'UTC', '2026-10-16T15:00:00+08:00'], // 文字里的时区优先于参数
  ['try again in 45m', '2026-10-16T10:00:00Z', undefined, '2026-10-16T10:45:00Z'],
  ['resets in 2h', '2026-10-16T10:00:00Z', undefined, '2026-10-16T12:00:00Z'],
  ['resets Oct 20, 3pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-20T15:00:00+08:00'], // 带日期（周限额）
  ['resets Jan 2 at 9am', '2026-12-30T10:00:00+08:00', 'Asia/Shanghai', '2027-01-02T09:00:00+08:00'], // 跨年
  ['resets 3pm (America/New_York)', '2026-11-01T12:00:00Z', undefined, '2026-11-01T20:00:00Z'], // 夏令时刚结束（EST，UTC-5）
])('parseResetTime(%j) at %s [%s] → %s', (text, now, tz, want) => {
  expect(iso(parseResetTime(text, new Date(now), tz))).toBe(at(want))
})

test('12am is midnight and 12pm is noon', () => {
  const now = new Date('2026-10-16T10:00:00Z')
  expect(iso(parseResetTime('resets 12am', now, 'UTC'))).toBe('2026-10-17T00:00:00.000Z')
  expect(iso(parseResetTime('resets 12pm', now, 'UTC'))).toBe('2026-10-16T12:00:00.000Z')
})

test('without a time zone in the text or the argument the local zone is used', () => {
  const now = new Date()
  const r = parseResetTime('resets 3pm', now)!
  expect(r.getTime()).toBeGreaterThan(now.getTime())
  expect(r.getHours()).toBe(15)
  expect(r.getMinutes()).toBe(0)
})

test('unparseable text, an impossible time or an unknown zone → null', () => {
  const now = new Date('2026-10-16T10:00:00Z')
  expect(parseResetTime('resets sometime soon', now, 'UTC')).toBeNull()
  expect(parseResetTime('resets 13pm', now, 'UTC')).toBeNull()
  expect(parseResetTime('resets 25:00', now, 'UTC')).toBeNull()
  expect(parseResetTime('resets 3pm', now, 'Mars/Olympus')).toBeNull()
  expect(parseResetTime('', now, 'UTC')).toBeNull()
})
