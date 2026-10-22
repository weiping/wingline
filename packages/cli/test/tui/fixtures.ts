import type { AttentionReport, PsRow, QuestionRow, TimelineEvent } from '@wingline/core'
import type { TuiData } from '../../src/tui/types.js'

export const posts: PsRow[] = [
  { address: 'builder@duo', agent: 'claude', status: 'live', handle: 'term-b', worktree: 'current', isLead: true },
  { address: 'checker@duo', agent: 'codex', status: 'live', handle: 'term-c', worktree: 'current', isLead: false },
]

export const question = (over: Partial<QuestionRow> = {}): QuestionRow => ({
  team: 'duo', messageId: 'msg-1', asker: 'checker@duo', body: '用哪个库？', options: ['a', 'b'], taskId: 't1', dispatchId: 'ctx-1', relayedAt: 'R', answeredAt: null, ...over,
})

export const attentionOf = (over: Partial<AttentionReport> = {}): AttentionReport => ({
  team: 'duo',
  dispatcher: { state: 'running', pid: 1, heartbeatAt: null, ageMs: 12_000 },
  frozen: [], signals: [], questions: [], stale: [], unavailable: [], warnings: [],
  ...over,
})

export const event = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  at: '2026-10-22T10:00:00.000Z', source: 'command', actor: 'human', action: 'send', target: 'builder@duo', outcome: 'ok', detail: null, id: 'command:1', ...over,
})

export const dataOf = (over: Partial<TuiData> = {}): TuiData => ({
  team: 'duo', posts, attention: attentionOf(), tasks: [], timeline: [], hushed: [], ...over,
})
