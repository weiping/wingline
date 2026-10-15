import { expect, test } from 'vitest'
import { reassignTask } from '../../../src/commands/task/claim.js'
import { createTask } from '../../../src/commands/task/create.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { escalateTask, recoverTask, resolveGate } from '../../../src/commands/task/escalate.js'
import { gateBody } from '../../../src/commands/task/gate-exec.js'
import { neutralize } from '../../../src/commands/task/notify.js'
import { planTask } from '../../../src/commands/task/plan.js'
import { listStale, listTasks, staleReasons, type StaleInput, type TaskRow } from '../../../src/commands/task/query.js'
import { startTask } from '../../../src/commands/task/start.js'
import { down } from '../../../src/commands/down.js'
import { up } from '../../../src/commands/up.js'
import { WinglineError } from '../../../src/errors.js'
import { createOrcaClient } from '../../../src/orca/client.js'
import type { OrcaRunner } from '../../../src/orca/run.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../fake-client.js'

const rt = () => new WinglineError('orca', 'runtime_timeout', 't')
const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
const unreachable = (o: FakeOrca) => o.faults.push({ method: 'requestShow', when: 'before', error: ru() })
const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'

// —— A-I1：重放的派发行要跟着当前目标走 ——
test('A-I1: a never-landed uncertain dispatch row is not replayed to the OLD post after the task was reassigned', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: rt() }); unreachable(o)
  const err = await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' }).catch((e) => e)
  expect(err.kind).toBe('uncertain')
  const id = o.tasks[0]!.id
  await reassignTask(s.deps, { id, to: 'checker@duo' })
  s.deps.env.ORCA_TERMINAL_HANDLE = 'term-c'
  await startTask(s.deps, { id }).catch(() => {})
  const t = o.tasks.find((x) => x.id === id)!
  expect(t.assigneeHandle === 'term-b').toBe(false)            // never the old post's terminal
  expect(t).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(o.sent.filter((m) => m.handle === 'term-c' && m.text.includes('新任务'))).toHaveLength(1)
})

// —— A-I2：更早 epoch 留下的 open 行不能永远算 call_uncertain ——
test('A-I2: an uncertain done:report row of an earlier epoch is not reported as call_uncertain once the task has moved on and completed', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' })
  o.faults.push({ method: 'workerDone', when: 'before', error: rt() }); unreachable(o)
  expect((await doneTask(s.deps, { id }).catch((e) => e)).kind).toBe('uncertain')
  const g = await escalateTask(s.deps, { id, reason: 'stuck' })
  await resolveGate(s.deps, { gateId: g.gateId, resolution: 'retry' })
  await startTask(s.deps, { id })
  expect((await doneTask(s.deps, { id })).outcome).toBe('done')
  const later = new Date(Date.now() + 10 * 60_000)
  s.deps.now = () => later
  expect((await listStale(s.deps, 'duo')).filter((x) => x.reason === 'call_uncertain')).toEqual([])
})

// —— A-I3：fence 之后的 reissue 要对旧 id 做比较后交换，并发不能建出两个子任务 ——
test('A-I3: two concurrent wl task done with a stale coordinator create exactly one review child', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: DUO_YAML + REVIEW, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' })
  o.terminals.push({ handle: 'coord-2', title: 'zsh', connected: true, worktreeId: 'w' })
  o.coordinator = 'coord-2'                                         // someone else took the role; the registry still says coord-1
  await Promise.allSettled([doneTask(s.deps, { id }), doneTask(s.deps, { id })])
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})

// —— A-I4：create --post 在任务建出之后失败：错误必须带任务 id 和重跑方式 ——
test('A-I4: create --post whose dispatch fails definitively after the task exists reports the task id (or returns not_dispatched); a natural rerun cannot silently duplicate', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('orca', 'runtime_error', 'terminal term-b already has an active dispatch') })
  const r = await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' }).catch((e) => e)
  const id = o.tasks[0]!.id
  if (r instanceof Error) {
    const text = `${r.message} ${(r as WinglineError).hint ?? ''}`
    expect(text).toContain(id); expect(text).toContain('--retry-request')
  } else {
    expect(r).toMatchObject({ id })
    expect(r.delivery).not.toBe('notified')
  }
})

// —— B-I1：blocked_waiting / call_uncertain 的 resolve 命令要指向真正的（最新的）gate ——
test('B-I1: after escalate → resolve → start → escalate again, --stale names the latest gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  const g1 = await escalateTask(deps, { id, reason: 'one' })
  await resolveGate(deps, { gateId: g1.gateId, resolution: 'retry' })
  await startTask(deps, { id, as: 'builder@duo' })
  const g2 = await escalateTask(deps, { id, reason: 'two' })
  const item = (await listStale(deps, 'duo')).find((s) => s.reason === 'blocked_waiting')!
  expect(item.gateId).toBe(g2.gateId)
  expect(item.command).toContain(`wl task resolve ${g2.gateId}`)
})
const NOW = new Date('2026-10-15T12:00:00.000Z')
const row = (over: Partial<TaskRow>): TaskRow => ({ id: 't', status: 'blocked', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, ...over })
test('B-I1: an uncertain resolve:<gate> row names the gate from its own key, not the first gate of the task', () => {
  const input: StaleInput = {
    team: 'duo', tasks: [row({})], alive: new Set(), unfinished: [], verdicts: new Map(),
    open: [{ id: 'resolve:gate-2', state: 'uncertain', updatedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() }],
    gates: [{ gateId: 'gate-1', taskId: 't' }, { gateId: 'gate-2', taskId: 't' }],
  }
  const uncertain = staleReasons(input, NOW).find((x) => x.reason === 'call_uncertain')!
  expect(uncertain.command).toContain('wl task resolve gate-2')
})

// —— B-I2：gateBody 要同时防 \r ——
test('B-I2: a gate output with a bare carriage return is not sent as the --body on a multiline-unsafe platform', () => {
  expect(gateBody('progress 10%\rprogress 100%', '/f', false)).toBe('gate 输出见 /f')
})

// —— B-I3：create --post 必须是本团队岗位 ——
test('B-I3: create --post for a post that is not in the team spec → post_unknown, before any Orca write', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-s', title: 'builder@solo', connected: true, worktreeId: 'wt-1' })
  await expect(createTask(deps, { team: 'duo', title: 'x', post: 'builder@solo' })).rejects.toMatchObject({ code: 'post_unknown' })
  expect(o.callsOf('taskCreate')).toEqual([])
})

// —— A-M3：down 不能把并发刷新过的协调者写回旧值 ——
test('A-M3: wl down --close does not overwrite a coordinator handle refreshed while it was closing terminals', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const realClose = o.terminalClose.bind(o)
  o.terminalClose = async (a) => { registry.updateCoordinatorHandle('duo', 'coord-9'); return realClose(a) }
  await down(deps, { team: 'duo', close: true })
  expect(registry.getTeam('duo')).toMatchObject({ coordinatorHandle: 'coord-9', status: 'stopped' })
})
test('A-M3: wl down (no --close) keeps the coordinator handle and run id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await down(deps, { team: 'duo', close: false })
  expect(registry.getTeam('duo')).toMatchObject({ coordinatorHandle: 'coord-1', runId: 'run-1', status: 'stopped' })
})

// —— A-M2：wl up --new-run 重跑安全 ——
test('A-M2: rerunning `wl up --new-run` after an uncertain run-create does not create a second Run', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = mkTeam(DUO_YAML)
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  expect((await up(deps, { specPath: p, newRun: true })).run).toMatchObject({ outcome: 'uncertain' })
  await up(deps, { specPath: p, newRun: true })
  expect(o.runs).toHaveLength(1)
})

// —— B-M1：run-list 分页 ——
test('B-M1: run-list with a non-null nextCursor is followed or refused — never silently treated as complete', async () => {
  const calls: string[][] = []
  const page = (runs: unknown[], nextCursor: string | null) => ({ runs, nextCursor })
  const mkRun = (id: string) => ({ id, objective: 'wingline:duo', coordinator_handle: 'h', created_at: 'T' })
  const runner: OrcaRunner = {
    async json<T>(args: string[]) { calls.push(args); return (args.some((a) => a.includes('cur-1')) ? page([mkRun('run-2')], null) : page([mkRun('run-1')], 'cur-1')) as T },
    async text() { return '' },
  }
  const r = await createOrcaClient(runner).runList().catch((e) => e)
  if (r instanceof Error) return                                           // failing closed is acceptable
  expect(calls.length).toBeGreaterThan(1)
  expect(r.map((x) => x.id)).toEqual(['run-1', 'run-2'])
})

// —— B-M2：靠 run-list 找回的 Run 不能从存活终端手里拿走协调者 ——
test('B-M2: a Run adopted through run-list keeps a live coordinator (no run-use from the lead)', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  o.runs.push({ id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'term-dsp', createdAt: 'T' }); o.coordinator = 'term-dsp'
  const r = await up(deps, { specPath: mkTeam(DUO_YAML) })
  expect(r.run).toMatchObject({ runId: 'run-9' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-9', coordinatorHandle: 'term-dsp' })
})

// —— B-M7：neutralize ——
test('B-M7: neutralize never leaves a lone surrogate when truncating', () => {
  const s = neutralize('a'.repeat(79) + '😀tail', 80)
  expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(s)).toBe(false)
  expect(/(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)).toBe(false)
})
test('B-M7 (pinning): ESC/OSC, C1, bidi override/isolate and zero-width characters are stripped; shell metacharacters become full-width', () => {
  expect(neutralize('\x1b]0;x\x07‮abc​\x9b31m⁦z', 100)).toBe(']0；xabc31mz')
  expect(neutralize('a`b$(c)', 100)).toBe('a｀b＄(c)')
})

// —— B-M8：--new-run 被 deferred 时不能悄悄丢掉 ——
test('B-M8: `wl up --new-run` with the lead not ready says the flag has not been applied yet', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = mkTeam(DUO_YAML)
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-1' }); o.waitSatisfied = false
  const r = await up(deps, { specPath: p, newRun: true })
  expect(r.run!.outcome).toBe('deferred')
  expect(JSON.stringify(r.run)).toContain('--new-run')
})

// —— B-M10：done 的连接投递保留原因 ——
test('B-M10: a link delivery that was not typed (target at a prompt) keeps its reason in linkedTasks', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { yaml: DUO_YAML + REVIEW, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await createTask(deps, { team: 'duo', title: 'T', post: 'builder@duo' })
  o.previews.set('term-c', 'Allow this edit? (y/n)')
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks![0]).toMatchObject({ target: 'checker@duo', delivery: 'not_notified', reason: 'at_prompt' })
})

// —— B-M11：listTasks 不带团队时逐团队容错；--status 校验；前置先于 findTaskAnywhere ——
test('B-M11: listTasks without a team still returns the other teams when one team\'s task-list fails', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertTeam({ name: 'solo', specPath: '/x', specHash: 'h', runId: 'run-2', coordinatorHandle: 'c2', status: 'up' })
  o.tasks.push({ id: 'task-x', status: 'ready', title: 'x', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_error', 'one team is broken') })
  const rows = await listTasks(deps, {})
  expect(rows.map((t) => t.id)).toEqual(['task-x'])
})
test('B-M11: --status must be one of the Orca statuses (an unknown value is an input error, not an empty list)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(listTasks(deps, { team: 'duo', status: 'done' })).rejects.toMatchObject({ kind: 'input' })
  await expect(listTasks(deps, { team: 'duo', status: 'blocked' })).resolves.toEqual([])
})
test.each([
  ['escalate', (d: Parameters<typeof escalateTask>[0], id: string) => escalateTask(d, { id, reason: 'x' })],
  ['reassign', (d: Parameters<typeof escalateTask>[0], id: string) => reassignTask(d, { id, to: 'checker@duo' })],
  ['recover', (d: Parameters<typeof escalateTask>[0], id: string) => recoverTask(d, { id })],
  ['plan', (d: Parameters<typeof escalateTask>[0], id: string) => planTask(d, { id, text: 'x' })],
])('B-M11: %s checks that Orca is reachable before reading the task list (runtime_unavailable, not a raw task-list error)', async (_n, call) => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  o.reachable = false
  o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'some_other_error', 'raw') })
  await expect(call(deps, id)).rejects.toMatchObject({ code: 'runtime_unavailable' })
})
