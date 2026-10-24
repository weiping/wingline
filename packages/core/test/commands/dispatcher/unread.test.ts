import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { attention, warningsOf } from '../../../src/commands/dispatcher/attention.js'
import { attentionKeys, markUnread } from '../../../src/commands/dispatcher/unread.js'
import { takeSnapshot, type ScanSnapshot } from '../../../src/commands/dispatcher/signals.js'
import type { StaleItem } from '../../../src/commands/task/query.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

let restore = () => {}
beforeEach(() => {
  restore = setWorktreeSupport({ workspaceStatus: true, comment: true, commentMax: null, unread: true })
})
afterEach(() => restore())

const LEAD_WORKTREE = `path:${os.tmpdir()}`
const stale = (taskId: string, over: Partial<StaleItem> = {}): StaleItem =>
  ({ taskId, title: taskId, reason: 'dead_assignee', owner: 'builder@duo', since: null, command: `wl task recover ${taskId}`, ...over }) as StaleItem
const question = (messageId: string) => ({ team: 'duo', messageId, taskId: 't9', dispatchId: 'ctx-9', asker: 'checker@duo', body: 'q', options: [], relayedAt: 'T', answeredAt: null })
const snapWith = (p: { stale?: StaleItem[]; openQuestions?: ReturnType<typeof question>[] } = {}) =>
  ({ now: new Date(), stale: p.stale ?? [], openQuestions: p.openQuestions ?? [] }) as unknown as ScanSnapshot

function world(yaml = DUO_YAML) {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { yaml })
  const ctx = () => ({ team: s.registry.getTeam('duo')!, spec: loadTeamSpec(s.registry.getTeam('duo')!.specPath) })
  const failures = { count: 0 }
  const mark = (snap: ScanSnapshot, observeOnly = false) => markUnread(s.deps, ctx(), snap, { observeOnly, failures })
  const marks = () => o.comments.filter((c) => c.unread === true)
  const events = (action: string) => s.registry.listPatrolEvents('duo').filter((e) => e.action === action)
  const failNext = (n: number) => { for (let i = 0; i < n; i++) o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') }) }
  return { o, ...s, ctx, failures, mark, marks, events, failNext }
}

test('attentionKeys: one key per entry kind, gate items keyed by gate id, cleared and level-0 signals ignored', () => {
  const row = { team: 'duo', post: 'builder@duo', signal: 'no_progress' as const, taskId: 't1', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null }
  const keys = attentionKeys({
    stale: [stale('t1'), stale('t2', { gateId: 'g7' })],
    questions: [question('msg-1')],
    frozen: [{ post: 'checker@duo' }],
    signals: [row, { ...row, signal: 'owner_idle', level: 0 }, { ...row, signal: 'overdue', clearedAt: 'T' }],
  })
  expect(keys.sort()).toEqual(['frozen:checker@duo', 'gate:g7', 'question:msg-1', 'signal:no_progress:builder@duo:t1', 'stale:t1'])
})

test('3D: context_low and usage_limit rows never produce an unread key (they are already told to the lead and shown by wl attention)', () => {
  const row = { team: 'duo', post: 'builder@duo', taskId: '', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null }
  const keys = attentionKeys({
    stale: [], questions: [], frozen: [],
    signals: [{ ...row, signal: 'usage_limit' }, { ...row, signal: 'context_low', taskId: 'sk-0123456789ab' }, { ...row, signal: 'no_progress', taskId: 't1' }],
  })
  expect(keys).toEqual(['signal:no_progress:builder@duo:t1'])
})

test('a new attention key marks the lead worktree once; the same keys do not mark again', async () => {
  const w = world()
  await w.mark(snapWith({ stale: [stale('t1')] }))
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.marks()).toEqual([{ worktree: LEAD_WORKTREE, unread: true }])
  expect(w.registry.listUnreadMarks('duo')).toEqual(['stale:t1'])
  await w.mark(snapWith({ stale: [stale('t1'), stale('t2')] }))
  expect(w.marks()).toHaveLength(2)
})

test('a key that disappears and comes back counts as new', async () => {
  const w = world()
  await w.mark(snapWith({ stale: [stale('t1')] }))
  await w.mark(snapWith())
  expect(w.registry.listUnreadMarks('duo')).toEqual([])
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.marks()).toHaveLength(2)
})

test('the first scan after a restart only records the existing keys', async () => {
  const w = world()
  await w.mark(snapWith({ stale: [stale('t1')] }), true)
  expect(w.o.comments).toEqual([])
  expect(w.registry.listUnreadMarks('duo')).toEqual(['stale:t1'])
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.o.comments).toEqual([])
})

test('patrol.unread_mark: false never calls worktreeSet and never records keys', async () => {
  const w = world(DUO_YAML + 'patrol:\n  unread_mark: false\n')
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.o.comments).toEqual([])
  expect(w.registry.listUnreadMarks('duo')).toEqual([])
})

test('Orca without unread support (ORCA_WORKTREE_SUPPORT.unread = false) never calls worktreeSet', async () => {
  setWorktreeSupport({ unread: false })
  const w = world()
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.o.comments).toEqual([])
})

test('the mark is its own worktreeSet call: no comment, no status, and orca_sync is untouched', async () => {
  const w = world()
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.o.comments).toEqual([{ worktree: LEAD_WORKTREE, unread: true }])
  expect(w.registry.listOrcaSync('duo')).toEqual([])
})

test('a failing worktreeSet records nothing and retries next round; 3 failures in a row stop the run', async () => {
  const w = world()
  w.failNext(3)
  for (let round = 1; round <= 3; round++) {
    await w.mark(snapWith({ stale: [stale('t1')] }))
    expect(w.failures.count).toBe(round)
    expect(w.registry.listUnreadMarks('duo')).toEqual([])
  }
  expect(w.events('unread_mark').map((e) => e.outcome)).toEqual(['failed:boom', 'failed:boom', 'failed:boom'])
  expect(w.events('unread_gave_up')).toHaveLength(1)

  await w.mark(snapWith({ stale: [stale('t1')] })) // 第 4 轮：不再尝试（尝试的话 fake 会成功并留下一次标记）
  expect(w.marks()).toEqual([])
  expect(w.failures.count).toBe(3)
  expect(warningsOf(w.deps, 'duo', w.ctx().spec).filter((x) => x.includes('未读标记'))).toHaveLength(1)
})

test('a success resets the consecutive-failure count', async () => {
  const w = world()
  w.failNext(2)
  await w.mark(snapWith({ stale: [stale('t1')] }))
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.failures.count).toBe(2)
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.failures.count).toBe(0)
  expect(w.marks()).toHaveLength(1)
})

test('after the dispatcher restarts, the give-up warning is gone and marking is tried again', async () => {
  const w = world()
  w.failNext(3)
  for (let i = 0; i < 3; i++) await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(warningsOf(w.deps, 'duo', w.ctx().spec).some((x) => x.includes('未读标记'))).toBe(true)

  w.failures.count = 0 // 新的调度员运行
  await w.mark(snapWith({ stale: [stale('t1')] }), true) // 重启后的第一轮：只记录现有键（t1 此后算已见过）
  expect(warningsOf(w.deps, 'duo', w.ctx().spec).some((x) => x.includes('未读标记'))).toBe(false)
  expect(w.marks()).toEqual([])
  await w.mark(snapWith({ stale: [stale('t1'), stale('t2')] })) // 之后出现的新键又能标记了
  expect(w.marks()).toHaveLength(1)
})

test('a lead worktree that cannot be resolved: no mark, no key, an unread_skipped event, not a failure', async () => {
  const w = world()
  w.registry.upsertPost({ ...w.registry.getPost('builder@duo')!, worktree: 'current' })
  w.o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await w.mark(snapWith({ stale: [stale('t1')] }))
  expect(w.o.comments).toEqual([])
  expect(w.registry.listUnreadMarks('duo')).toEqual([])
  expect(w.events('unread_skipped')).toHaveLength(1)
  expect(w.failures.count).toBe(0)
})

test('markUnread does not call attention(): no taskList / terminalList calls of its own', async () => {
  const w = world()
  const before = w.o.calls.length
  await w.mark(snapWith({ stale: [stale('t1')], openQuestions: [question('msg-1')] }))
  expect(w.o.calls.slice(before).filter((c) => c === 'taskList' || c === 'terminalList')).toEqual([])
})

test('the keys markUnread derives match the entries wl attention reports', async () => {
  const w = world()
  w.registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'patrol: no_progress' })
  w.registry.putPatrolState({ team: 'duo', post: 'builder@duo', signal: 'waiting_approval', taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  w.registry.recordQuestion(question('msg-1'))
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await w.o.dispatch({ task: id, to: 'term-gone', from: 'coord-1' })

  const report = await attention(w.deps, 'duo')
  expect(report.stale.length).toBeGreaterThan(0)
  const snap = await takeSnapshot(w.deps, w.ctx(), { wokeAt: null })
  const fromRegistry = attentionKeys({
    stale: snap.stale, questions: snap.openQuestions, frozen: w.registry.listFrozen('duo'), signals: w.registry.listPatrolState('duo'),
  })
  const fromReport = attentionKeys({ stale: report.stale, questions: report.questions, frozen: report.frozen, signals: report.signals })
  expect(fromRegistry.sort()).toEqual(fromReport.sort())
  expect(fromReport).toHaveLength(4)
})

test('warningsOf says once that Orca lacks unread support, only while patrol.unread_mark is on', () => {
  const w = world()
  setWorktreeSupport({ unread: false })
  const on = warningsOf(w.deps, 'duo', w.ctx().spec).filter((x) => x.includes('不支持未读标记'))
  expect(on).toEqual(['Orca 不支持未读标记：patrol.unread_mark 不起作用'])
  const off = loadTeamSpec(w.registry.getTeam('duo')!.specPath)
  expect(warningsOf(w.deps, 'duo', { ...off, patrol: { ...off.patrol, unreadMark: false } }).some((x) => x.includes('不支持未读标记'))).toBe(false)
})

test('unread_skipped is recorded once while the lead worktree stays unresolvable, and again after a successful mark', async () => {
  const w = world()
  w.registry.upsertPost({ ...w.registry.getPost('builder@duo')!, worktree: 'current' })
  const unresolvable = () => w.o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  for (let i = 0; i < 3; i++) { unresolvable(); await w.mark(snapWith({ stale: [stale('t1')] })) }
  expect(w.events('unread_skipped')).toHaveLength(1)

  w.o.worktreePaths.set('current', os.tmpdir())
  await w.mark(snapWith({ stale: [stale('t1')] })) // 解析得到了：标记成功
  expect(w.events('unread_mark').map((e) => e.outcome)).toEqual(['ok'])

  w.o.worktreePaths.delete('current')
  for (let i = 0; i < 2; i++) { unresolvable(); await w.mark(snapWith({ stale: [stale('t1'), stale('t2')] })) }
  expect(w.events('unread_skipped')).toHaveLength(2)
})

test('the give-up warning does not depend on how many events were written after it', async () => {
  const w = world()
  w.failNext(3)
  for (let i = 0; i < 3; i++) await w.mark(snapWith({ stale: [stale('t1')] }))
  // 逐条 appendPatrolEvent 写 2500 次在 Windows 上要几十秒（每次落盘），所以走同一个库文件、在一个事务里批量插入
  const raw = new DatabaseSync(path.join(w.home, 'state.db'))
  raw.exec('BEGIN')
  const insert = raw.prepare("INSERT INTO patrol_events(team, at, action, outcome) VALUES ('duo', ?, 'scan', 'ok')")
  for (let i = 0; i < 2500; i++) insert.run(new Date(i).toISOString())
  raw.exec('COMMIT')
  raw.close()
  expect(warningsOf(w.deps, 'duo', w.ctx().spec).some((x) => x.includes('未读标记连续'))).toBe(true)
})

