import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { doneTask } from '../../../src/commands/task/done.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam, setWorktreeSupport } from '../fake-client.js'

// wl task done 收尾之后立刻同步岗位所在 worktree 的工作区状态，不等下一轮巡查（最慢 5–6 分钟）。
const TMP = `path:${os.tmpdir()}`
const GATE = 'node -e "require(\'fs\').appendFileSync(process.env.WL_GATE_LOG,\'x\');process.exit(+process.env.WL_GATE_EXIT)"'
const yaml = (links = '') => `${DUO_YAML}gates:\n  builder: '${GATE.replace(/'/g, "''")}'\n${links}`
const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'

let restore = () => {}
beforeEach(() => {
  restore = setWorktreeSupport({ workspaceStatus: true, comment: true, commentMax: null })
  process.env.WL_GATE_LOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gl-')), 'log')
  process.env.WL_GATE_EXIT = '0'
})
afterEach(() => restore())

/** builder 名下一个已派发的任务（term-b）；builder 与 checker 共用同一个 worktree。 */
async function dispatched(links = '') {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { yaml: yaml(links), env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  o.orch.length = 0; o.calls.length = 0
  return { o, ...s, id }
}

/** 持住 `dispatcher:duo` 的锁，表示调度员正在运行；返回释放函数。 */
function dispatcherRunning(registry: Awaited<ReturnType<typeof dispatched>>['registry']): () => void {
  let release = () => {}
  void registry.withTeamLock('dispatcher:duo', () => {
    registry.heartbeat('dispatcher:duo')
    return new Promise<void>((res) => { release = res })
  })
  return () => release()
}

test('done with no links, dispatcher running: the worktree status flips to completed right away', async () => {
  const { o, deps, registry, id } = await dispatched()
  const stop = dispatcherRunning(registry)
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(o.comments).toEqual([{ worktree: TMP, status: 'completed' }])
  stop()
})

test('done with reviewed_by: ends as in-review once the verdict is finished (not before)', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  const stop = dispatcherRunning(registry)
  const r = await doneTask(deps, { id })
  expect(r.closure).toEqual({ kind: 'sent_for_review', targets: ['checker@duo'] })
  // 派发评审子任务时 builder 的判定还没收尾（checker 在做 → in-progress），收尾后才是 in-review
  expect(o.comments.map((c) => c.status)).toEqual(['in-progress', 'in-review'])
  stop()
})

test('no dispatcher running: nothing is written', async () => {
  const { o, deps, id } = await dispatched()
  await doneTask(deps, { id })
  expect(o.comments).toEqual([])
})

test('gate failed: the task is still in progress, nothing is written', async () => {
  const { o, deps, registry, id } = await dispatched()
  const stop = dispatcherRunning(registry)
  process.env.WL_GATE_EXIT = '1'
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('gate_failed')
  expect(o.comments).toEqual([])
  stop()
})

test('a failed write never fails done; it is recorded as an orca_sync event', async () => {
  const { o, deps, registry, id } = await dispatched()
  const stop = dispatcherRunning(registry)
  o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'boom', 'x') })
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(registry.listPatrolEvents('duo').filter((e) => e.action === 'orca_sync' && e.outcome === 'failed')).toHaveLength(1)
  stop()
})

test('a replayed done (verdict already finished) does not write again', async () => {
  const { o, deps, registry, id } = await dispatched()
  const stop = dispatcherRunning(registry)
  await doneTask(deps, { id })
  o.comments.length = 0
  expect((await doneTask(deps, { id })).replayed).toBe(true)
  expect(o.comments).toEqual([])
  stop()
})
