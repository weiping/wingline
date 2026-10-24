import fs from 'node:fs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { attention, dispatcherStatus } from '../../../src/commands/dispatcher/attention.js'
import { WinglineError } from '../../../src/errors.js'
import { discardDraft, draftPathOf } from '../../../src/spec/draft.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

// 探针结论未定时 workspaceStatus 默认不支持，会多出一条“Orca 不支持”告警；这里只测草稿告警，所以假定都支持
let restoreSupport = () => {}
beforeEach(() => {
  restoreSupport = setWorktreeSupport({ workspaceStatus: true, comment: true })
})
afterEach(() => restoreSupport())

test('attention lists the draft warning when team.draft.yaml exists and drops it after discard', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const spec = registry.getTeam('duo')!.specPath
  expect((await attention(deps, 'duo')).warnings).toEqual([])
  const draft = draftPathOf(spec)
  fs.writeFileSync(draft, fs.readFileSync(spec, 'utf8'))
  expect((await attention(deps, 'duo')).warnings).toEqual([`有未应用的规格草稿：${draft}（执行 wl down duo 后 wl up ${spec} --draft）`])
  discardDraft(spec)
  expect((await attention(deps, 'duo')).warnings).toEqual([])
})

test('attention lists every source explicitly, with commands, and works with the dispatcher stopped', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'patrol: no_progress' })
  registry.putPatrolState({ team: 'duo', post: 'builder@duo', signal: 'waiting_approval', taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  registry.recordQuestion({ team: 'duo', messageId: 'msg-1', taskId: 't2', dispatchId: 'ctx-2', asker: 'checker@duo', body: '完整的问题正文', options: [], relayedAt: 'T' })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-gone', from: 'coord-1' })
  const r = await attention(deps, 'duo')
  expect(r.dispatcher.state).toBe('never')
  expect(r.frozen.map((f) => f.post)).toEqual(['checker@duo'])
  expect(r.signals.map((s) => [s.signal, s.level])).toEqual([['waiting_approval', 2]])
  expect(r.questions[0]!.body).toBe('完整的问题正文')
  expect(r.stale.map((s) => [s.reason, s.command])).toEqual([['dead_assignee', `wl task recover ${id}`]])
  expect(r.unavailable).toEqual([])
})
test('attention with Orca unreachable still shows local sources and says which part is unavailable', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const r = await attention(deps, 'duo')
  expect(r.frozen).toHaveLength(1); expect(r.stale).toEqual([])
  expect(r.unavailable).toEqual([expect.stringContaining('runtime_unavailable')])
})
test('dispatcherStatus summarizes health, last check/scan and warnings from patrol events', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.appendPatrolEvent({ team: 'duo', action: 'scan_skipped', outcome: 'failed:runtime_unavailable' })
  registry.appendPatrolEvent({ team: 'duo', action: 'spec_reload_failed', outcome: 'failed:links_cycle' })
  const s = await dispatcherStatus(deps, 'duo')
  expect(s).toMatchObject({ health: { state: 'stopped' }, lastScan: { outcome: 'failed:runtime_unavailable' }, warnings: [expect.stringContaining('links_cycle')] })
})

test('3D: screen signals carry a server-side summary, ordinary signals do not, and nothing leaks the session marker', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const base = { team: 'duo', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null }
  registry.putPatrolState({ ...base, post: 'checker@duo', signal: 'usage_limit', taskId: '', detail: { resetsAt: '2026-10-16T07:00:00.000Z', noticeHash: 'abc', autoResume: 'armed' } })
  registry.putPatrolState({ ...base, post: 'builder@duo', signal: 'usage_limit', taskId: '', detail: { resetsAt: null, noticeHash: 'def' } })
  registry.putPatrolState({ ...base, post: 'checker@duo', signal: 'context_low', taskId: 'sk-0123456789ab', detail: { percent: 5, noticeHash: 'x' } })
  registry.putPatrolState({ ...base, post: 'checker@duo', signal: 'no_progress', taskId: 't1' })
  const r = await attention(deps, 'duo')
  const summaryOf = (post: string, signal: string) => r.signals.find((s) => s.post === post && s.signal === signal)!.summary
  expect(summaryOf('checker@duo', 'usage_limit')).toMatch(/^预计 \d\d:\d\d 重置；重置后会自动继续$/)
  expect(summaryOf('builder@duo', 'usage_limit')).toBe('重置时间未知')
  expect(summaryOf('checker@duo', 'context_low')).toBe('剩余 5%')
  expect(summaryOf('checker@duo', 'no_progress')).toBeNull()
  expect(JSON.stringify(r)).not.toContain('WLS-')
})
