import { expect, test } from 'vitest'
import { advancePatrol } from '../../../src/commands/dispatcher/advance.js'
import { postLine, SIGNAL_LABEL } from '../../../src/commands/dispatcher/orca-sync.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

test('advancePatrol does not clear screen-signal rows even though detectSignals never produces them', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const base = { team: 'duo', post: 'checker@duo', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null }
  registry.putPatrolState({ ...base, signal: 'usage_limit', taskId: '', detail: { noticeHash: 'abc123def456' } })
  registry.putPatrolState({ ...base, signal: 'context_low', taskId: 'sk-0123456789ab', detail: { percent: 5 } })
  registry.putPatrolState({ ...base, signal: 'no_progress', taskId: 't1' })
  const team = registry.getTeam('duo')!
  const ctx = { team, spec: loadTeamSpec(team.specPath) }
  for (let i = 0; i < 2; i++) {
    c.advance(300_000)
    await advancePatrol(deps, ctx, [], { observeOnly: false })
  }
  expect(registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')!.clearedAt).toBeNull()
  expect(registry.getPatrolState('duo', 'checker@duo', 'context_low', 'sk-0123456789ab')!.clearedAt).toBeNull()
  expect(registry.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')!.clearedAt).not.toBeNull() // 普通信号照旧会被清除
})

test('SIGNAL_LABEL and postLine cover the screen signals', () => {
  expect(SIGNAL_LABEL.context_low).toBe('上下文快满')
  expect(SIGNAL_LABEL.usage_limit).toBe('用量用完')
  expect(postLine('checker', null, { signal: 'usage_limit', frozen: false })).toBe('checker：空闲 ⚠ 用量用完')
})
