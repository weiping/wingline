// 阶段 2A（重新设计）探针：验证 orca orchestration task-create/task-update/dispatch/gate-create
// 在"非协调者终端"场景下的行为。只读部分见 record() 落盘；会在真实 Orca 里留下一个 Run（CLI 无法删除，
// 需要人在界面里清理，和阶段 0 的探针一样）。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/task-dispatch-probe.ts
import { setup, record, IDLE_COMMAND } from './lib.js'

async function main() {
  const { runner, client, worktree } = setup()
  const probe = 'task-dispatch-probe'

  const t1 = await client.terminalCreate({ worktree, title: 'probe-coord', command: IDLE_COMMAND })
  const t2 = await client.terminalCreate({ worktree, title: 'probe-worker', command: IDLE_COMMAND })
  record(probe, '00-terminals', { t1, t2 })

  const runCreate = await runner.json<{ run: { id: string } }>(['orchestration', 'run-create', '--objective', 'wingline 2a probe', '--from', t1.handle])
  const runId = runCreate.run.id
  record(probe, '01-run-create', runCreate)

  // 基线：协调者自己建任务（预期成立）
  let taskCreateByCoord: unknown
  try {
    taskCreateByCoord = await runner.json(['orchestration', 'task-create', '--spec', 'say OK (by coordinator)', '--task-title', 'probe task 1', '--run', runId, '--from', t1.handle])
  } catch (e) { taskCreateByCoord = { threw: String(e) } }
  record(probe, '02-task-create-by-coordinator', taskCreateByCoord)
  const task1Id = (taskCreateByCoord as any)?.task?.id

  // 关键未知 1：非协调者终端能否只凭 --run + --from 建任务
  let taskCreateByWorker: unknown
  try {
    taskCreateByWorker = await runner.json(['orchestration', 'task-create', '--spec', 'say OK (by non-coordinator)', '--task-title', 'probe task 2', '--run', runId, '--from', t2.handle])
  } catch (e) { taskCreateByWorker = { threw: String(e) } }
  record(probe, '03-task-create-by-non-coordinator', taskCreateByWorker)
  const task2Id = (taskCreateByWorker as any)?.task?.id

  const listAfterCreate = await runner.json(['orchestration', 'task-list', '--run', runId, '--json'])
  record(probe, '04-task-list-after-create', listAfterCreate)

  // 关键未知 2：dispatch 回执 / task-list 里是否能看出分配给了谁
  let dispatch1: unknown
  if (task1Id) {
    try {
      dispatch1 = await runner.json(['orchestration', 'dispatch', '--task', task1Id, '--to', t2.handle, '--from', t1.handle])
    } catch (e) { dispatch1 = { threw: String(e) } }
  }
  record(probe, '05-dispatch-task1-to-t2', dispatch1)

  const listAfterDispatch = await runner.json(['orchestration', 'task-list', '--run', runId, '--json'])
  record(probe, '06-task-list-after-dispatch', listAfterDispatch)

  // 关键未知 3：已经 dispatch 过的任务能否重新 dispatch 给别的终端（hands_to 需要）
  let redispatch: unknown
  if (task1Id) {
    try {
      redispatch = await runner.json(['orchestration', 'dispatch', '--task', task1Id, '--to', t1.handle, '--from', t1.handle])
    } catch (e) { redispatch = { threw: String(e) } }
  }
  record(probe, '07-redispatch-task1-to-t1', redispatch)

  // 关键未知 4：task-update 的 --from 是否必须等于 dispatch 的目标（worker_done 的校验是否也适用于 task-update）
  let updateByWrongActor: unknown
  if (task1Id) {
    try {
      updateByWrongActor = await runner.json(['orchestration', 'task-update', '--id', task1Id, '--status', 'completed', '--result', 'probe done (from t2, dispatch target after redispatch is t1)', '--from', t2.handle])
    } catch (e) { updateByWrongActor = { threw: String(e) } }
  }
  record(probe, '08-task-update-by-t2-after-redispatch-to-t1', updateByWrongActor)

  // gate-create：在一个未分派的任务上发起决策问题
  let gateCreate: unknown
  if (task2Id) {
    try {
      gateCreate = await runner.json(['orchestration', 'gate-create', '--task', task2Id, '--question', 'probe: 需要人工确认吗', '--options', '["ok","retry"]', '--from', t1.handle])
    } catch (e) { gateCreate = { threw: String(e) } }
  }
  record(probe, '09-gate-create', gateCreate)
  const gateList = task2Id ? await runner.json(['orchestration', 'gate-list', '--task', task2Id, '--json']).catch((e) => ({ threw: String(e) })) : null
  record(probe, '10-gate-list', gateList)

  await client.terminalClose({ handle: t1.handle })
  await client.terminalClose({ handle: t2.handle })
  record(probe, '11-closed', { t1: t1.handle, t2: t2.handle })

  console.log(`RESULT ${probe} done run=${runId} task1=${task1Id} task2=${task2Id} —— 原始回执见 spikes/out/${probe}/${process.platform}/`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
