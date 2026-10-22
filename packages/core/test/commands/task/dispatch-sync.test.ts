import os from 'node:os'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createTask } from '../../../src/commands/task/create.js'
import { startTask } from '../../../src/commands/task/start.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML, SELF_CLAIM_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

// 派发之后立刻把岗位所在 worktree 的工作区状态同步到 Orca，不等下一轮巡查（最慢要 10 分钟才第一次写）。
const TMP = `path:${os.tmpdir()}`

let restore = () => {}
beforeEach(() => {
  restore = setWorktreeSupport({ workspaceStatus: true, comment: true, commentMax: null })
})
afterEach(() => restore())

const seed = (yaml = DUO_YAML) => {
  const o = new FakeOrca()
  const made = seedRunningTeam(o, { yaml })
  return { o, ...made }
}

/** 持住 `dispatcher:duo` 的锁，表示调度员正在运行；返回释放函数。 */
function dispatcherRunning(registry: ReturnType<typeof seed>['registry']): () => void {
  let release = () => {}
  void registry.withTeamLock('dispatcher:duo', () => {
    registry.heartbeat('dispatcher:duo')
    return new Promise<void>((res) => { release = res })
  })
  return () => release()
}

test('create --post with the dispatcher running: the worktree status becomes in-progress right away', async () => {
  const { o, deps, registry } = seed()
  const stop = dispatcherRunning(registry)
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(o.comments).toEqual([{ worktree: TMP, status: 'in-progress' }])
  stop()
})

test('create without --post dispatches nothing and writes nothing', async () => {
  const { o, deps, registry } = seed()
  const stop = dispatcherRunning(registry)
  await createTask(deps, { team: 'duo', title: 't' })
  expect(o.comments).toEqual([])
  stop()
})

test('no dispatcher running: no write (nobody would clear it later)', async () => {
  const { o, deps } = seed()
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(o.comments).toEqual([])
})

test('a queued dispatch (post already busy) does not write again', async () => {
  const { o, deps, registry } = seed()
  const stop = dispatcherRunning(registry)
  await createTask(deps, { team: 'duo', title: 'a', post: 'checker@duo' })
  o.comments.length = 0
  const r = await createTask(deps, { team: 'duo', title: 'b', post: 'checker@duo' })
  expect(r.delivery).toBe('queued')
  expect(o.comments).toEqual([])
  stop()
})

test('the comment is written too when patrol.worktree_comment is on', async () => {
  const { o, deps, registry } = seed(DUO_YAML + 'patrol:\n  worktree_comment: true\n')
  const stop = dispatcherRunning(registry)
  await createTask(deps, { team: 'duo', title: '写登录', post: 'checker@duo' })
  expect(o.comments).toHaveLength(1)
  expect(o.comments[0]).toMatchObject({ worktree: TMP, status: 'in-progress' })
  expect(o.comments[0]!.comment).toContain('checker：')
  expect(o.comments[0]!.comment).toContain('写登录')
  stop()
})

test('switches off in the spec: nothing is written', async () => {
  const { o, deps, registry } = seed(DUO_YAML + 'patrol:\n  workspace_status: false\n')
  const stop = dispatcherRunning(registry)
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(o.comments).toEqual([])
  stop()
})

test('a failed write never fails the dispatch; it is recorded as an orca_sync event', async () => {
  const { o, deps, registry } = seed()
  const stop = dispatcherRunning(registry)
  o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(r.delivery).toBe('notified')
  expect(o.tasks[0]).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(registry.listPatrolEvents('duo').filter((e) => e.action === 'orca_sync' && e.outcome === 'failed')).toHaveLength(1)
  stop()
})

test('wl task start (a claimed ready task) also syncs right away', async () => {
  const { o, deps, registry } = seed(SELF_CLAIM_YAML)
  const stop = dispatcherRunning(registry)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' }); registry.setPlan('duo', id, 'p')
  await startTask(deps, { id, as: 'builder@duo' })
  expect(o.comments).toEqual([{ worktree: TMP, status: 'in-progress' }])
  stop()
})
