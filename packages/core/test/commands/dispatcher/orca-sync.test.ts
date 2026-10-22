import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { warningsOf } from '../../../src/commands/dispatcher/attention.js'
import { initialState } from '../../../src/commands/dispatcher/loop.js'
import {
  postLine, postWorkspaceStatus, SIGNAL_LABEL, summarize, syncOrca, syncWorktreeForPost,
} from '../../../src/commands/dispatcher/orca-sync.js'
import type { ScanSnapshot } from '../../../src/commands/dispatcher/signals.js'
import type { TaskRow } from '../../../src/commands/task/query.js'
import { WinglineError } from '../../../src/errors.js'
import type { DoneVerdictRow } from '../../../src/registry/registry.js'
import { specHash } from '../../../src/spec/hash.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

let restore = () => {}
beforeEach(() => {
  restore = setWorktreeSupport({ workspaceStatus: true, comment: true, commentMax: null })
})
afterEach(() => restore())

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1', status: 'dispatched', title: '实现登录', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo',
  assigneeHandle: 'term-b', dispatchId: 'ctx-1', epoch: 1, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, ...over,
})
const builder = { address: 'builder@duo', handle: 'term-b' }
const noVerdict = () => null
const sentForReview = (post = 'builder@duo', result: string | null = JSON.stringify({ outcome: 'done', closure: { kind: 'sent_for_review' } })): DoneVerdictRow =>
  ({ taskId: 'P', epoch: 1, post, verdict: 'passed', gateFailures: 0, dispatchId: 'd', reportFrom: 'h', body: null, result, finishedAt: 'T', createdAt: 'T' }) as DoneVerdictRow
const reviewTasks = [
  task({ id: 'P', status: 'completed', epoch: 1, assigneeHandle: null }),
  task({ id: 'R', kind: 'review', status: 'ready', parentId: 'P', claimedBy: 'checker@duo', assigneeHandle: null, epoch: 0 }),
]

test.each([
  ['dispatched to its handle', [task()], noVerdict, 'in-progress'],
  ['open review child whose parent verdict is sent_for_review by this post', reviewTasks, () => sentForReview(), 'in-review'],
  ['only ready tasks claimed by it', [task({ status: 'ready', assigneeHandle: null })], noVerdict, 'todo'],
  ['nothing open', [task({ status: 'completed' })], noVerdict, 'completed'],
] as const)('post status: %s → %s', (_name, tasks, verdictOf, expected) => {
  expect(postWorkspaceStatus(builder, [...tasks], verdictOf)).toBe(expected)
})

test('dispatched beats in-review; handle null never matches in-progress', () => {
  expect(postWorkspaceStatus(builder, [...reviewTasks, task({ id: 'T2' })], () => sentForReview())).toBe('in-progress')
  expect(postWorkspaceStatus({ ...builder, handle: null }, [task({ assigneeHandle: null })], noVerdict)).toBe('completed')
  expect(postWorkspaceStatus({ ...builder, handle: null }, [task()], noVerdict)).toBe('completed')
})

test('in-review needs the verdict to be finished, by this post, and a sent_for_review closure', () => {
  const unfinished = { ...sentForReview(), finishedAt: null } as DoneVerdictRow
  expect(postWorkspaceStatus(builder, reviewTasks, () => unfinished)).toBe('completed')
  expect(postWorkspaceStatus(builder, reviewTasks, () => sentForReview('checker@duo'))).toBe('completed')
  expect(postWorkspaceStatus(builder, reviewTasks, () => sentForReview('builder@duo', JSON.stringify({ closure: { kind: 'completed' } })))).toBe('completed')
  const finishedReview = [reviewTasks[0]!, { ...reviewTasks[1]!, status: 'completed' as const }]
  expect(postWorkspaceStatus(builder, finishedReview, () => sentForReview())).toBe('completed')
})

test('an unparsable verdict result does not count as in-review', () => {
  expect(postWorkspaceStatus(builder, reviewTasks, () => sentForReview('builder@duo', '{not json'))).toBe('completed')
  expect(postWorkspaceStatus(builder, reviewTasks, () => sentForReview('builder@duo', null))).toBe('completed')
})

test('SIGNAL_LABEL names every patrol signal', () => {
  expect(Object.keys(SIGNAL_LABEL).sort()).toEqual([
    'bypassed', 'call_uncertain', 'dead_assignee', 'done_unfinished', 'gate_streak', 'no_progress', 'overdue', 'owner_idle', 'waiting_answer', 'waiting_approval',
  ])
  expect(SIGNAL_LABEL.no_progress).toBe('无进展')
})

test('postLine formats task, idle, signal and frozen', () => {
  expect(postLine('builder', task(), { signal: 'no_progress', frozen: true })).toBe('builder：实现登录（进行中，第 2 轮） ⚠ 无进展 ❄ 已冻结')
  expect(postLine('reviewer', null, { signal: null, frozen: false })).toBe('reviewer：空闲')
  expect(postLine('b', task({ status: 'ready', epoch: 0 }), { signal: null, frozen: false })).toBe('b：实现登录（排队，第 1 轮）')
  expect(postLine('b', task({ status: 'blocked' }), { signal: 'waiting_approval', frozen: false })).toBe('b：实现登录（阻塞，第 2 轮） ⚠ 等待批准')
})

test('control sequences in a task title are stripped from the comment', () => {
  const line = postLine('builder', task({ title: 'a\x1b]0;x\x07b\nc' }), { signal: null, frozen: false })
  expect(line).toBe('builder：ab c（进行中，第 2 轮）')
  expect(line).not.toMatch(/[\x00-\x1f]/)
})

test('comment longer than 500 chars is cut to 500 ending with …', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ status: 'todo' as const, line: `post${i}：${'长'.repeat(30)}` }))
  const out = summarize(rows, 500)
  expect(out.comment).toHaveLength(500)
  expect(out.comment.endsWith('…')).toBe(true)
  expect(summarize([{ status: 'todo', line: 'a' }], 500)).toEqual({ status: 'todo', comment: 'a' })
  expect(summarize(rows, 120).comment).toHaveLength(120)
})

test('summarize takes the highest-priority status', () => {
  const s = (...st: Array<'todo' | 'in-progress' | 'in-review' | 'completed'>) => summarize(st.map((status) => ({ status, line: status })), 500).status
  expect(s('completed', 'todo')).toBe('todo')
  expect(s('todo', 'in-progress')).toBe('in-progress')
  expect(s('in-progress', 'in-review', 'completed')).toBe('in-review')
  expect(s('completed')).toBe('completed')
})

const snapOf = (tasks: TaskRow[]) => ({ now: new Date(), tasks }) as unknown as ScanSnapshot
const PATROL_ON = 'patrol:\n  worktree_comment: true\n'

function world(yaml = DUO_YAML + PATROL_ON) {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { yaml })
  const ctx = () => ({ team: s.registry.getTeam('duo')!, spec: loadTeamSpec(s.registry.getTeam('duo')!.specPath) })
  const sync = (tasks: TaskRow[], observeOnly = false) => syncOrca(s.deps, ctx(), snapOf(tasks), { observeOnly })
  const syncEvents = () => s.registry.listPatrolEvents('duo').filter((e) => e.action === 'orca_sync')
  return { o, ...s, ctx, sync, syncEvents }
}
const TMP = `path:${os.tmpdir()}`
/** `/w/a` 经归一后的写法：Windows 上是 `\w\a`，代码里归组和 orca_sync 的键都用这个。 */
const WA = path.normalize('/w/a')

test('two posts on one worktree: priority wins and the comment has one line each', async () => {
  const w = world()
  await w.sync([task(), task({ id: 't2', status: 'ready', claimedBy: 'checker@duo', assigneeHandle: null, epoch: 0 })])
  expect(w.o.comments).toEqual([
    { worktree: TMP, status: 'in-progress', comment: 'builder：实现登录（进行中，第 2 轮）\nchecker：实现登录（排队，第 1 轮）' },
  ])
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ team: 'duo', status: 'in-progress', failCount: 0 })
})

test('path:/w/a and current resolving to /w/a are grouped and written once', async () => {
  const w = world()
  for (const [post, worktree] of [['builder@duo', 'path:/w/a'], ['checker@duo', 'current']] as const) {
    w.registry.upsertPost({ ...w.registry.getPost(post)!, worktree })
  }
  w.o.worktreePaths.set('current', '/w/a')
  await w.sync([task()])
  expect(w.o.comments).toHaveLength(1)
  expect(w.o.comments[0]).toMatchObject({ worktree: `path:${WA}`, status: 'in-progress' })
  expect(w.o.comments[0]!.comment!.split('\n')).toHaveLength(2)
  expect(w.o.calls.filter((c) => c === 'worktreeShow')).toHaveLength(1)
})

test('worktreeShow is called once per selector per scan; a failing selector skips its post without counting a failure', async () => {
  const w = world()
  for (const post of ['builder@duo', 'checker@duo']) w.registry.upsertPost({ ...w.registry.getPost(post)!, worktree: 'current' })
  await w.sync([task()])
  expect(w.o.calls.filter((c) => c === 'worktreeShow')).toHaveLength(1)

  const f = world()
  for (const post of ['builder@duo', 'checker@duo']) f.registry.upsertPost({ ...f.registry.getPost(post)!, worktree: 'current' })
  f.o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await f.sync([task()])
  expect(f.o.comments).toEqual([])
  expect(f.registry.listOrcaSync('duo')).toEqual([])
  expect(f.syncEvents()).toEqual([])
})

test('writes only when status or comment changed', async () => {
  const w = world()
  await w.sync([task()])
  await w.sync([task()])
  expect(w.o.comments).toHaveLength(1)
  await w.sync([task({ title: '改了标题' })])
  expect(w.o.comments).toHaveLength(2)
  await w.sync([task({ title: '改了标题', status: 'ready', assigneeHandle: null })])
  expect(w.o.comments).toHaveLength(3)
  expect(w.o.comments[2]).toMatchObject({ status: 'todo' })
})

test("another team's row on the same worktree neither suppresses nor causes writes", async () => {
  const w = world()
  w.registry.putOrcaSync({ worktree: os.tmpdir(), team: 'other', status: 'completed', comment: '别的团队写的', writtenAt: 'T', failCount: 3 })
  await w.sync([task()])
  await w.sync([task()])
  expect(w.o.comments).toHaveLength(1)
  expect(w.registry.getOrcaSync(os.tmpdir(), 'other')).toMatchObject({ status: 'completed', comment: '别的团队写的', failCount: 3 })
})

test('worktree paths are normalised before grouping (trailing slash, dot segments)', async () => {
  const w = world()
  w.registry.upsertPost({ ...w.registry.getPost('builder@duo')!, worktree: 'path:/w/a/' })
  w.registry.upsertPost({ ...w.registry.getPost('checker@duo')!, worktree: 'path:/w/./a' })
  await w.sync([task()])
  expect(w.o.comments).toHaveLength(1)
  expect(w.o.comments[0]).toMatchObject({ worktree: `path:${WA}` })
  expect(w.registry.getOrcaSync(WA, 'duo')).not.toBeNull()
})

test('one scan counts a failing worktree once even when the post-notice sync and the end-of-scan sync both try', async () => {
  const w = world()
  const round = { failed: new Set<string>() }
  w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  await syncWorktreeForPost(w.deps, w.ctx(), 'builder@duo', round)
  await syncOrca(w.deps, w.ctx(), snapOf([task()]), { observeOnly: false, round })
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 1 })
  expect(w.syncEvents()).toHaveLength(1)
  expect(w.o.faults).toHaveLength(1) // 第二次根本没去试
  await w.sync([task()]) // 下一轮（新的 round）才再试一次
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 2 })
})

test('a failure event carries the worktree and the error code', async () => {
  const w = world()
  w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  await syncWorktreeForPost(w.deps, w.ctx(), 'builder@duo')
  expect(w.syncEvents()[0]).toMatchObject({ outcome: 'failed', detail: { worktree: os.tmpdir(), error: 'boom' } })
  const f = world()
  f.o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await syncWorktreeForPost(f.deps, f.ctx(), 'builder@duo')
  expect(f.syncEvents()[0]).toMatchObject({ outcome: 'failed:runtime_unavailable', detail: { error: 'runtime_unavailable' } })
})

test('only the changed parameter is sent', async () => {
  const w = world()
  await w.sync([task()])
  await w.sync([task({ title: '新标题' })])
  expect(w.o.comments[1]).toEqual({ worktree: TMP, comment: expect.stringContaining('新标题') })
})

test('first scan after start computes but does not write or touch orca_sync', async () => {
  const w = world()
  await w.sync([task()], true)
  expect(w.o.comments).toEqual([])
  expect(w.registry.listOrcaSync('duo')).toEqual([])
})

test('a failure records a patrol_events row with action orca_sync, outcome failed', async () => {
  const w = world()
  w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  await w.sync([task()])
  expect(w.syncEvents()).toEqual([expect.objectContaining({ action: 'orca_sync', outcome: 'failed', detail: { worktree: os.tmpdir(), error: 'boom' } })])
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 1, status: null, comment: null })
  await w.sync([task()])
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 0, status: 'in-progress' })
})

test('three consecutive failures stop the worktree and show a warning; dispatcher start resets fail_count', async () => {
  const w = world()
  for (let i = 0; i < 3; i++) {
    w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
    await w.sync([task()])
  }
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 3 })
  await w.sync([task()])
  expect(w.o.comments).toEqual([])
  expect(warningsOf(w.deps, 'duo', w.ctx().spec)).toContain(`Orca 同步已停止：${os.tmpdir()}（连续 3 次失败，重启调度员后重试）`)

  initialState(w.deps, w.registry.getTeam('duo')!, w.ctx().spec)
  expect(w.registry.getOrcaSync(os.tmpdir(), 'duo')).toMatchObject({ failCount: 0 })
  await w.sync([task()])
  expect(w.o.comments).toHaveLength(1)
  expect(warningsOf(w.deps, 'duo', w.ctx().spec).some((x) => x.startsWith('Orca 同步已停止'))).toBe(false)
})

test('workspace_status false sends no status; worktree_comment false sends no comment; both false makes no call', async () => {
  const noStatus = world(DUO_YAML + 'patrol:\n  workspace_status: false\n  worktree_comment: true\n')
  await noStatus.sync([task()])
  expect(noStatus.o.comments).toEqual([{ worktree: TMP, comment: expect.any(String) }])

  const noComment = world(DUO_YAML)
  await noComment.sync([task()])
  expect(noComment.o.comments).toEqual([{ worktree: TMP, status: 'in-progress' }])

  const neither = world(DUO_YAML + 'patrol:\n  workspace_status: false\n')
  await neither.sync([task()])
  expect(neither.o.comments).toEqual([])
  expect(neither.o.calls).not.toContain('worktreeShow')
})

test('an unsupported item makes no call for it', async () => {
  restore()
  restore = setWorktreeSupport({ workspaceStatus: false, comment: true })
  const w = world()
  await w.sync([task()])
  expect(w.o.comments).toEqual([{ worktree: TMP, comment: expect.any(String) }])
})

test('the comment is cut to the probed commentMax when it is below 500', async () => {
  restore()
  restore = setWorktreeSupport({ commentMax: 30 })
  const w = world()
  await w.sync([task({ title: '很长的标题'.repeat(20) })])
  expect(w.o.comments[0]!.comment).toHaveLength(30)
  expect(w.o.comments[0]!.comment!.endsWith('…')).toBe(true)
})

test('unsupported item with its switch on yields an Orca 不支持 warning', () => {
  restore()
  restore = setWorktreeSupport({ workspaceStatus: false, comment: false })
  const on = world(DUO_YAML + PATROL_ON)
  const warnings = warningsOf(on.deps, 'duo', on.ctx().spec)
  expect(warnings).toContain('Orca 不支持工作区状态：patrol.workspace_status 不起作用')
  expect(warnings).toContain('Orca 不支持卡片注释：patrol.worktree_comment 不起作用')
  const off = world(DUO_YAML + 'patrol:\n  workspace_status: false\n')
  expect(warningsOf(off.deps, 'duo', off.ctx().spec)).toEqual([])
})

test('default patrol values keep the 2A/2B spec hash', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  workspace_status: true\n  worktree_comment: false\n')))).toBe(base)
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  workspace_status: false\n')))).not.toBe(base)
})

test('syncWorktreeForPost recomputes the post worktree with the signal and frozen marks', async () => {
  const w = world()
  w.registry.putPatrolState({ team: 'duo', post: 'checker@duo', signal: 'waiting_approval', taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  w.registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  await syncWorktreeForPost(w.deps, w.ctx(), 'checker@duo')
  expect(w.o.comments).toHaveLength(1)
  expect(w.o.comments[0]!.comment).toBe('builder：空闲 ❄ 已冻结\nchecker：空闲 ⚠ 等待批准')
})

test('a level-0 (observed only) signal is not shown', async () => {
  const w = world()
  w.registry.putPatrolState({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 0, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null })
  await syncWorktreeForPost(w.deps, w.ctx(), 'checker@duo')
  expect(w.o.comments[0]!.comment).not.toContain('⚠')
})

test('syncWorktreeForPost never throws and records a failed write', async () => {
  const w = world()
  w.o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  await expect(syncWorktreeForPost(w.deps, w.ctx(), 'checker@duo')).resolves.toBeUndefined()
  expect(w.syncEvents()).toHaveLength(1)
})

// —— 两个团队共用一个 worktree：Orca 上只有一个状态和一条注释，合并各团队最近一次算出的值 ——

/** 持住 `dispatcher:<团队>` 的锁，表示这个团队的调度员正在运行；返回释放函数。 */
function hold(w: ReturnType<typeof world>, name: string): () => void {
  let release = () => {}
  void w.registry.withTeamLock(`dispatcher:${name}`, () => {
    w.registry.heartbeat(`dispatcher:${name}`)
    return new Promise<void>((res) => { release = res })
  })
  return () => release()
}

/** 在 w 的注册表里再加一个团队：同样的 worktree，调度员的锁持住表示“正在运行”。返回它的 ctx / sync / 释放函数。 */
function addTeam(w: ReturnType<typeof world>, name: string, o: { running?: boolean; status?: 'up' | 'stopped' } = {}) {
  const specPath = mkTeam(DUO_YAML.replace('name: duo', `name: ${name}`) + PATROL_ON)
  w.registry.upsertTeam({ name, specPath, specHash: specHash(loadTeamSpec(specPath)), runId: 'run-1', coordinatorHandle: 'coord-1', status: o.status ?? 'up' })
  for (const [id, handle] of [['builder', 'term-tb'], ['checker', 'term-tc']] as const) {
    w.registry.upsertPost({
      address: `${id}@${name}`, team: name, agent: 'claude', worktree: TMP, handle, status: 'live', isLead: id === 'builder',
      sessionMarker: null, sessionId: null, sessionAt: null,
    })
  }
  const release = o.running === false ? () => {} : hold(w, name)
  const ctx = () => ({ team: w.registry.getTeam(name)!, spec: loadTeamSpec(w.registry.getTeam(name)!.specPath) })
  return { ctx, sync: (tasks: TaskRow[]) => syncOrca(w.deps, ctx(), snapOf(tasks), { observeOnly: false }), release }
}
const busyDuo = () => task()
const busyTrio = () => task({ id: 't9', title: '审查登录', claimedBy: 'builder@trio', assigneeHandle: 'term-tb' })

test('the second team to write does not hide the first one: status is the highest priority, comment lines carry the team name', async () => {
  const w = world()
  const duoUp = hold(w, 'duo')
  const trio = addTeam(w, 'trio')
  await w.sync([busyDuo()])
  expect(w.o.comments.at(-1)).toMatchObject({ status: 'in-progress', comment: 'builder：实现登录（进行中，第 2 轮）\nchecker：空闲' }) // 只有自己时没有团队名前缀
  await trio.sync([]) // trio 空闲：以前这里会把状态盖成 completed
  expect(w.o.comments.at(-1)).toEqual({
    worktree: TMP,
    status: 'in-progress',
    comment: '[duo] builder：实现登录（进行中，第 2 轮）\n[duo] checker：空闲\n[trio] builder：空闲\n[trio] checker：空闲',
  })
  trio.release()
})

test('whoever writes first, the result converges to the same merged status and comment', async () => {
  const a = world()
  const duoA = hold(a, 'duo')
  const ta = addTeam(a, 'trio')
  await ta.sync([])
  await a.sync([busyDuo()])
  const b = world()
  const duoB = hold(b, 'duo')
  const tb = addTeam(b, 'trio')
  await b.sync([busyDuo()])
  await tb.sync([])
  expect(a.o.comments.at(-1)).toEqual(b.o.comments.at(-1))
  expect(a.o.comments.at(-1)!.status).toBe('in-progress')
  ta.release(); tb.release()
})

test('when the busy team finishes, the merged status falls back and the lines are refreshed', async () => {
  const w = world()
  const duoUp = hold(w, 'duo')
  const trio = addTeam(w, 'trio')
  await w.sync([busyDuo()])
  await trio.sync([busyTrio()])
  expect(w.o.comments.at(-1)).toMatchObject({ status: 'in-progress' })
  await w.sync([]) // duo 做完了，trio 还在做
  expect(w.o.comments.at(-1)).toMatchObject({ status: 'in-progress' })
  expect(w.o.comments.at(-1)!.comment).toContain('[duo] builder：空闲')
  expect(w.o.comments.at(-1)!.comment).toContain('[trio] builder：审查登录（进行中，第 2 轮）')
  await trio.sync([]) // 都空闲了
  expect(w.o.comments.at(-1)).toMatchObject({ status: 'completed' })
  trio.release()
})

test('a team whose dispatcher is not running, or that is stopped, contributes nothing', async () => {
  const notRunning = world()
  const nr = addTeam(notRunning, 'trio', { running: false })
  await nr.sync([busyTrio()]) // 它写过一次记录，但调度员没在运行
  await notRunning.sync([])
  expect(notRunning.o.comments.at(-1)).toMatchObject({ status: 'completed', comment: 'builder：空闲\nchecker：空闲' })

  const stopped = world()
  const st = addTeam(stopped, 'trio', { status: 'stopped' })
  await st.sync([busyTrio()])
  await stopped.sync([])
  expect(stopped.o.comments.at(-1)).toMatchObject({ status: 'completed', comment: 'builder：空闲\nchecker：空闲' })
  st.release()
})

test('a team that syncs only the status adds no comment lines; a team that syncs only comments adds no status', async () => {
  const w = world(DUO_YAML) // duo：只同步状态
  const duoUp = hold(w, 'duo')
  const trio = addTeam(w, 'trio') // trio：状态与注释都同步
  await w.sync([busyDuo()])
  await trio.sync([])
  const last = w.o.comments.at(-1)!
  expect(last.status).toBe('in-progress')
  expect(last.comment).toBe('builder：空闲\nchecker：空闲') // 只有 trio 的两行，没有 duo 的，也就没有团队名前缀
  trio.release()
})

test('the merged comment is cut to the limit with a trailing ellipsis', async () => {
  const w = world()
  const duoUp = hold(w, 'duo')
  const trio = addTeam(w, 'trio')
  await w.sync([task({ title: '长'.repeat(300) })])
  await trio.sync([task({ id: 't9', title: '长'.repeat(300), claimedBy: 'builder@trio', assigneeHandle: 'term-tb' })])
  const c = w.o.comments.at(-1)!.comment!
  expect(c).toHaveLength(500)
  expect(c.endsWith('…')).toBe(true)
  expect(c.startsWith('[duo] ')).toBe(true)
  trio.release()
})

test('nothing is written again when no team’s own value changed', async () => {
  const w = world()
  const duoUp = hold(w, 'duo')
  const trio = addTeam(w, 'trio')
  await w.sync([busyDuo()])
  await trio.sync([])
  const n = w.o.comments.length
  await w.sync([busyDuo()])
  await trio.sync([])
  expect(w.o.comments).toHaveLength(n)
  trio.release()
})
