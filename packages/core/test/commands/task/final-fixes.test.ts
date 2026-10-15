import { expect, test } from 'vitest'
import { createTask } from '../../../src/commands/task/create.js'
import { dispatchTo } from '../../../src/commands/task/dispatch.js'
import { escalateTask, recoverTask, resolveGate } from '../../../src/commands/task/escalate.js'
import { gateCwd } from '../../../src/commands/task/gate-exec.js'
import { staleReasons, type StaleInput, type TaskRow } from '../../../src/commands/task/query.js'
import { startTask } from '../../../src/commands/task/start.js'
import { up } from '../../../src/commands/up.js'
import { WinglineError } from '../../../src/errors.js'
import { SELF_CLAIM_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../fake-client.js'

const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
const uncertain = () => new WinglineError('uncertain', 'orca_timeout', 't')

// —— I1 ——
test('I1: start on a task already dispatched to me whose dispatch ledger row is uncertain settles the row through dispatchTo', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  o.faults.push({ method: 'dispatch', when: 'after', error: uncertain() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(dispatchTo(deps, 'duo', id, { address: 'builder@duo', handle: 'term-b' })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(registry.getRequest(`dispatch:${id}:0`)!.state).toBe('uncertain')
  expect(await startTask(deps, { id })).toMatchObject({ already: true })
  expect(registry.getRequest(`dispatch:${id}:0`)!.state).toBe('done')
})
const NOW = new Date('2026-10-15T12:00:00.000Z')
const row = (over: Partial<TaskRow>): TaskRow => ({ id: 't', status: 'completed', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, ...over })
const input = (over: Partial<StaleInput>): StaleInput => ({ team: 'duo', tasks: [], alive: new Set(), unfinished: [], verdicts: new Map(), open: [], gates: [], ...over })
test('I1: an uncertain dispatch: row of a task that has already finished is not reported as call_uncertain', () => {
  const old = new Date(NOW.getTime() - 10 * 60_000).toISOString()
  for (const status of ['completed', 'failed'] as const) {
    const items = staleReasons(input({ tasks: [row({ status })], open: [{ id: 'dispatch:t:0', state: 'uncertain', updatedAt: old }] }), NOW)
    expect(items.filter((x) => x.reason === 'call_uncertain')).toEqual([])
  }
  const live = staleReasons(input({ tasks: [row({ status: 'ready' })], open: [{ id: 'dispatch:t:0', state: 'uncertain', updatedAt: old }] }), NOW)
  expect(live.map((x) => x.reason)).toEqual(['call_uncertain'])
})

// —— I2 ——
test('I2: a leftover recover open record does not skip assignee_alive: after the task was escalated, resolved and restarted on a live terminal, recover refuses and changes nothing', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-old', from: 'coord-1' })
  o.faults.push({ method: 'gateCreate', when: 'before', error: new WinglineError('orca', 'runtime_error', 'boom') })
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ kind: 'orca' })
  expect(registry.getRequest(`recover:${id}:open`)).not.toBeNull()          // the record survives the definite failure
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  await resolveGate(deps, { gateId, resolution: 'retry' })
  await startTask(deps, { id })                                             // now live-dispatched to term-b
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-b' })
  const gatesBefore = o.callsOf('gateCreate').length; const epochBefore = registry.getTaskExt(id)!.epoch
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ code: 'assignee_alive' })
  expect(o.callsOf('gateCreate')).toHaveLength(gatesBefore)
  expect(registry.getTaskExt(id)!.epoch).toBe(epochBefore)
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-b' })
})

// —— M1 ——
test('M1: the plan_required hint is the positional form `wl task plan <id> "<text>"`', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { yaml: SELF_CLAIM_YAML })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  const err = await startTask(deps, { id, as: 'builder@duo' }).catch((e) => e)
  expect(err).toMatchObject({ code: 'plan_required' })
  expect(err.hint).toContain(`wl task plan ${id} "`)
  expect(err.hint).not.toContain('--text')
})

// —— M3 ——
const stuckCreate = (o: FakeOrca) => o.faults.push({ method: 'taskCreate', when: 'after', error: uncertain() }, { method: 'requestShow', when: 'before', error: ru() })
test('M3: the same --retry-request with a different --post or different --tags is retry_request_args_changed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  stuckCreate(o)
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo', tags: ['a'] }).catch(() => {})
  const rid = o.callsOf('taskCreate')[0]!.retryRequest as string
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'builder@duo', tags: ['a'], retryRequest: rid })).rejects.toMatchObject({ code: 'retry_request_args_changed' })
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo', tags: ['b'], retryRequest: rid })).rejects.toMatchObject({ code: 'retry_request_args_changed' })
  await expect(createTask(deps, { team: 'duo', title: 't', tags: ['a'], retryRequest: rid })).rejects.toMatchObject({ code: 'retry_request_args_changed' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('M3: retrying the same create from a different identity is not refused (the caller address is not a compared parameter); one task results', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  stuckCreate(o)
  await createTask(deps, { team: 'duo', title: 't', tags: ['a'], as: 'builder@duo' }).catch(() => {})
  const rid = o.callsOf('taskCreate')[0]!.retryRequest as string
  const r = await createTask(deps, { team: 'duo', title: 't', tags: ['a'], as: 'checker@duo', retryRequest: rid })
  expect(r.id).toBe(o.tasks[0]!.id); expect(o.tasks).toHaveLength(1)
})

// —— M5 ——
test('M5: a post with the default "current" worktree gets its gate directory resolved once at wl up; later lookups do not re-resolve "current" against whoever is calling', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.worktreePaths.set('current', '/repo/wt')
  await up(deps, { specPath: mkTeam(SELF_CLAIM_YAML) })
  o.worktreePaths.set('current', '/somewhere/else')                          // a different invoking directory
  o.calls.length = 0
  expect(await gateCwd(deps, 'builder@duo')).toBe('/repo/wt')
  expect(o.calls).not.toContain('worktreeShow')
})
