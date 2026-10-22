import { expect, test } from 'vitest'
import type { AttentionReport, TimelineEvent } from '@wingline/core'
import { renderAttention, renderTimelineEvent } from '../src/output.js'

const at = '2026-10-16T10:00:00.000Z'
const event = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  at, source: 'command', actor: 'human', action: 'send', target: 'builder@duo', outcome: 'ok', detail: null, id: 'command:1', ...over,
})

test('control characters in actor, action and target cannot forge extra timeline rows', () => {
  const forged = 'human\n2026-10-16 09:00:00  命令  wl up  ok  -'
  const line = renderTimelineEvent(event({ actor: forged, action: 'send\n任务  claim', target: 'a\r\nb\tc' }))
  expect(line.split('\n')).toHaveLength(1)
  expect(line).not.toMatch(/[\x00-\x1f\x7f]/)
})

test('a normal event keeps its columns', () => {
  expect(renderTimelineEvent(event())).toContain('human  send  builder@duo')
})

test('an empty actor renders as the dash placeholder', () => {
  expect(renderTimelineEvent(event({ actor: '' }))).toContain('命令  -  send')
})

const report = (over: Partial<AttentionReport> = {}): AttentionReport => ({
  team: 'duo',
  dispatcher: { state: 'running', pid: 1, heartbeatAt: at, ageMs: 1000 } as AttentionReport['dispatcher'],
  frozen: [{ post: 'checker@duo', reason: '卡住', frozenAt: at, skippedChildren: 0 }],
  signals: [], questions: [], stale: [], unavailable: [], warnings: [],
  ...over,
})

test('renderAttention prints a 告警 section first only when there are warnings', () => {
  expect(renderAttention(report())).not.toContain('告警')
  const out = renderAttention(report({ warnings: ['有未应用的规格草稿：/t/team.draft.yaml', 'Orca 同步已停止：/w/a'] }))
  expect(out.startsWith('告警：\n  有未应用的规格草稿：/t/team.draft.yaml\n  Orca 同步已停止：/w/a\n')).toBe(true)
  expect(out.indexOf('告警')).toBeLessThan(out.indexOf('冻结的岗位'))
})
