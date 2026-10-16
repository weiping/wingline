import { expect, test } from 'vitest'
import { freezePostCmd, hushCmd, parseDuration, unfreezePostCmd, unhushCmd } from '../../../src/commands/dispatcher/controls.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

test('parseDuration', () => {
  expect([parseDuration('90s'), parseDuration('15m'), parseDuration('2h')]).toEqual([90_000, 900_000, 7_200_000])
  expect(() => parseDuration('soon')).toThrow(expect.objectContaining({ code: 'duration_invalid' }))
})
test('freezePostCmd: team_unknown / post_unknown / frozen with an event', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(freezePostCmd(deps, { address: 'builder@ghost', reason: 'x' })).rejects.toMatchObject({ code: 'team_unknown' })
  await expect(freezePostCmd(deps, { address: 'ghost@duo', reason: 'x' })).rejects.toMatchObject({ code: 'post_unknown' })
  await freezePostCmd(deps, { address: 'builder@duo', reason: '手动冻结' })
  expect(registry.getFrozen('builder@duo')).toMatchObject({ reason: '手动冻结' })
  expect(registry.listPatrolEvents('duo').map((e) => e.action)).toEqual(['freeze'])
})
test("unfreezePostCmd: not frozen → post_not_frozen; resets that post's patrol rows to level 0, moves the cursor, lists children skipped while frozen", async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  await expect(unfreezePostCmd(deps, { address: 'checker@duo' })).rejects.toMatchObject({ code: 'post_not_frozen' })
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  registry.putPatrolState({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 3, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  const { id: child } = await o.taskCreate({ spec: 's', taskTitle: 'c', run: 'run-1', from: 'coord-1' })
  registry.beginRequest('done:t0:0:delivered:checker@duo'); registry.finishRequest('done:t0:0:delivered:checker@duo', 'done', { target: 'checker@duo', taskId: child, delivery: 'skipped_frozen' })
  expect(await unfreezePostCmd(deps, { address: 'checker@duo' })).toEqual({ skipped: [{ taskId: child, command: `wl task start ${child} --as checker@duo` }] })
  expect(registry.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')).toMatchObject({ level: 0, clearedAt: c.now().toISOString() })
  expect(registry.getCursor('checker@duo')).toBe(c.now().toISOString())
})
test('hushCmd defaults to 30 minutes; unhushCmd clears', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  expect(await hushCmd(deps, { address: 'checker@duo' })).toEqual({ until: new Date(c.now().getTime() + 1_800_000).toISOString() })
  await unhushCmd(deps, { address: 'checker@duo' })
  expect(registry.hushedUntil('checker@duo')).toBeNull()
})
