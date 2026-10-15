import { expect, test } from 'vitest'
import { claimTask } from '../../../src/commands/task/claim.js'
import { createTask } from '../../../src/commands/task/create.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { escalateTask, recoverTask, resolveGate } from '../../../src/commands/task/escalate.js'
import { planTask } from '../../../src/commands/task/plan.js'
import { fetchTasks, listStale, listTasks } from '../../../src/commands/task/query.js'
import { startTask } from '../../../src/commands/task/start.js'
import { up } from '../../../src/commands/up.js'
import { SELF_CLAIM_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, bypassReport, mkDeps } from '../fake-client.js'

const FLOW_YAML = SELF_CLAIM_YAML + `gates:\n  builder: 'node -e "process.exit(0)"'\nlinks:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n`
const NOPLAN = SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false')

test('up → create → claim → plan → start → done → review child → checker done; mutual review terminates', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML) })                       // builder=term-1（lead，协调者），checker=term-2
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  const { id } = await createTask(deps, { team: 'duo', title: '实现登录', tags: ['backend'] })
  await claimTask(asB, { id }); await planTask(asB, { id, text: '先读代码' })
  expect(await startTask(asB, { id })).toEqual({ delivery: 'self' })
  const r1 = await doneTask(asB, { id })
  expect(r1).toMatchObject({ outcome: 'done', linkedTasks: [{ target: 'checker@duo', delivery: 'notified' }], closure: { kind: 'sent_for_review' } })
  const reviewId = r1.linkedTasks![0]!.taskId
  expect((await listTasks(asC, { team: 'duo', mine: true })).map((t) => t.id)).toEqual([reviewId])
  expect(await doneTask(asC, { id: reviewId })).toMatchObject({ outcome: 'done', linkedTasks: [] })
  expect((await fetchTasks(deps, 'duo')).map((t) => t.status)).toEqual(['completed', 'completed'])
  expect(await listStale(deps, 'duo')).toEqual([])
})
test('reviewer busy: the review child is queued; after the reviewer finishes its current task, start succeeds', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }; const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  const { id: busy } = await createTask(deps, { team: 'duo', title: '手上的活', post: 'checker@duo' })
  const { id } = await createTask(deps, { team: 'duo', title: '实现登录', post: 'builder@duo' })
  const r = await doneTask(asB, { id })
  expect(r.linkedTasks![0]!.delivery).toBe('queued')
  await doneTask(asC, { id: busy })
  expect(await startTask(asC, { id: r.linkedTasks![0]!.taskId })).toEqual({ delivery: 'self' })
})
test('escalate → resolve → owner restarts: new epoch, fresh gate budget, done succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: mkTeam(NOPLAN) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  const { gateId } = await escalateTask(deps, { id, reason: '先停一下' })
  await resolveGate(deps, { gateId, resolution: 'retry' })
  await startTask(asB, { id })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
test('the post\'s terminal is closed mid-task: Orca reverts it to ready, the owner\'s next start re-dispatches to the new terminal', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const specPath = mkTeam(NOPLAN)
  await up(deps, { specPath })
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  await o.terminalClose({ handle: 'term-1' })
  await up(deps, { specPath })                                           // 重建 builder → term-3；协调者 reclaimed 到 term-3
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-3' } }
  await startTask(asB, { id })
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
test('dispatched to a dead handle (Orca restarted): wl up reports it, list --stale shows it, recover re-dispatches, done succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const specPath = mkTeam(NOPLAN)
  await up(deps, { specPath })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-gone', from: 'term-1' })
  expect((await up(deps, { specPath })).deadAssignees).toEqual([expect.objectContaining({ taskId: id, command: `wl task recover ${id}` })])
  expect((await listStale(deps, 'duo')).map((s) => s.reason)).toEqual(['dead_assignee'])
  await recoverTask(deps, { id })
  expect((await doneTask({ ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }, { id })).outcome).toBe('done')
})
test('a post bypasses wl and reports directly: list --stale shows bypassed; wl task done fills in the gate and the links', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML.replace('plan_first: true', 'plan_first: false')) })
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  await bypassReport(o, id)
  expect((await listStale(deps, 'duo')).map((s) => [s.taskId, s.reason])).toEqual([[id, 'bypassed']])
  const r = await doneTask({ ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }, { id })
  expect(r).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review' } })
  expect((await listStale(deps, 'duo')).filter((s) => s.taskId === id)).toEqual([])
})
test('three failing gates escalate to the lead; resolve + restart gives a fresh budget; the passing gate then closes the task and the review child completes it', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const gate = `node -e "process.exit(+process.env.WL_FLOW_EXIT)"`
  const y = SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false') + `gates:\n  builder: '${gate}'\nlinks:\n  builder:\n    reviewed_by: [checker]\n`
  await up(deps, { specPath: mkTeam(y) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  process.env.WL_FLOW_EXIT = '1'
  expect((await doneTask(asB, { id })).outcome).toBe('gate_failed')
  expect((await doneTask(asB, { id })).outcome).toBe('gate_failed')
  const esc = await doneTask(asB, { id })
  expect(esc).toMatchObject({ outcome: 'escalated', gateId: expect.any(String) })
  expect(registry.getTaskExt(id)!.gateFailures).toBe(3)
  await resolveGate(deps, { gateId: esc.gateId!, resolution: 'retry' })
  await startTask(asB, { id })
  expect(registry.getTaskExt(id)).toMatchObject({ epoch: 1, gateFailures: 0 })
  process.env.WL_FLOW_EXIT = '0'
  const done = await doneTask(asB, { id })
  expect(done).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review' } })
  const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  expect((await doneTask(asC, { id: done.linkedTasks![0]!.taskId })).outcome).toBe('done')
  expect(await listStale(deps, 'duo')).toEqual([])
})
test('rerunning wl task done after completion is a no-op that reports the stored result', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  const y = SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false') + `links:\n  builder:\n    hands_to: [checker]\n`
  await up(deps, { specPath: mkTeam(y) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  const first = await doneTask(asB, { id })
  expect(first.closure).toEqual({ kind: 'handed_to', targets: ['checker@duo'] })
  o.orch.length = 0
  expect(await doneTask(asB, { id })).toEqual({ ...first, replayed: true })
  expect(o.orch).toEqual([])
})
