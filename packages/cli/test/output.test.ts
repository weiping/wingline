import { expect, test } from 'vitest'
import type { TimelineEvent } from '@wingline/core'
import { renderTimelineEvent } from '../src/output.js'

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
