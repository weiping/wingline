import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { SPEC_FOOTER } from '../../../src/commands/task/dispatch.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { WinglineError } from '../../../src/errors.js'
import type { Registry } from '../../../src/registry/registry.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { bypassReport, FakeOrca, seedRunningTeam } from '../fake-client.js'

// gate 命令通过环境变量拿计数文件和退出码，避免在命令字符串里嵌 Windows 路径；每跑一次往文件追加一个字符
const GATE = 'node -e "require(\'fs\').appendFileSync(process.env.WL_GATE_LOG,\'x\');console.log(process.cwd());process.exit(+process.env.WL_GATE_EXIT)"'
const gates = (post = 'builder') => `gates:\n  ${post}: '${GATE.replace(/'/g, "''")}'\n`
const yaml = (links = '') => DUO_YAML + gates() + links
let gateLog: string
const gateRuns = () => (fs.existsSync(gateLog) ? fs.readFileSync(gateLog, 'utf8').length : 0)
beforeEach(() => {
  gateLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gl-')), 'log')
  process.env.WL_GATE_LOG = gateLog; process.env.WL_GATE_EXIT = '0'
})
/** builder 名下一个已派发的任务（term-b），返回 { o, deps, registry, id }。 */
async function dispatched(links = '', env: NodeJS.ProcessEnv = { ORCA_TERMINAL_HANDLE: 'term-b' }, y = yaml(links)) {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: y, env })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  o.orch.length = 0; o.calls.length = 0
  return { o, ...s, id }
}
const rt = () => new WinglineError('orca', 'runtime_timeout', 't')
const unreachable = (o: FakeOrca) => o.faults.push({ method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'
const AUDITOR = DUO_YAML + '  - id: auditor\n    agent: claude\n    worktree: current\n' + gates() + 'links:\n  builder:\n    reviewed_by: [checker, auditor]\n'
const addAuditor = (o: FakeOrca, registry: Registry) => {
  registry.upsertPost({ address: 'auditor@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-a', status: 'live', isLead: false })
  o.terminals.push({ handle: 'term-a', title: 'auditor@duo', connected: true, worktreeId: 'w' })
}

test('not your task → not_your_task', async () => {
  const { deps, id } = await dispatched()
  await expect(doneTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'not_your_task' })
})
test('gate passes, no links: one worker_done(succeeded) from the post\'s own handle; closure completed; gate ran in the post worktree', async () => {
  const { o, deps, registry, id } = await dispatched()
  const r = await doneTask(deps, { id })
  expect(r).toEqual({ outcome: 'done', closure: { kind: 'completed' }, linkedTasks: [] })
  expect(o.callsOf('workerDone')).toEqual([{ taskId: id, dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', body: expect.stringContaining(fs.realpathSync(os.tmpdir())), run: 'run-1', from: 'term-b', retryRequest: expect.any(String) }])
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('done')
})
test('--as builder from checker\'s terminal reports with builder\'s handle (locatePost), not the caller\'s', async () => {
  const { o, deps, id } = await dispatched('', { ORCA_TERMINAL_HANDLE: 'term-c' })
  await doneTask(deps, { id, as: 'builder@duo' })
  expect(o.callsOf('workerDone')[0]).toMatchObject({ from: 'term-b' })
})
test('reviewed_by with two targets: report first, then one child per target, each dispatched and notified; closure sent_for_review', async () => {
  const { o, deps, registry, id } = await dispatched('', undefined, AUDITOR); addAuditor(o, registry)
  const r = await doneTask(deps, { id })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('taskCreate'))
  const creates = o.callsOf('taskCreate')
  expect(creates).toHaveLength(2); expect(creates[0]!.retryRequest).not.toBe(creates[1]!.retryRequest)
  expect(creates[0]!.spec).toContain(SPEC_FOOTER)
  expect(o.callsOf('dispatch').map((d) => d.to)).toEqual(['term-c', 'term-a'])
  expect(r.linkedTasks!.map((l) => [l.target, l.delivery])).toEqual([['checker@duo', 'notified'], ['auditor@duo', 'notified']])
  expect(r.closure).toEqual({ kind: 'sent_for_review', targets: ['checker@duo', 'auditor@duo'] })
  for (const l of r.linkedTasks!) expect(registry.getTaskExt(l.taskId)).toMatchObject({ kind: 'review', claimedBy: l.target, readySince: expect.any(String) })
})
test('hands_to: closure handed_to; the child is kind work', async () => {
  const { deps, registry, id } = await dispatched('links:\n  builder:\n    hands_to: [checker]\n')
  const r = await doneTask(deps, { id })
  expect(r.closure).toEqual({ kind: 'handed_to', targets: ['checker@duo'] })
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.kind).toBe('work')
})
test('a review task\'s done does not trigger links (mutual review stays finite)', async () => {
  const links = 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n'
  const { o, deps, registry } = await dispatched(links)
  const { id: rev } = await o.taskCreate({ spec: 's', taskTitle: '评审：x', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: rev, team: 'duo', tags: [], kind: 'review', claimedBy: 'checker@duo' })
  await o.dispatch({ task: rev, to: 'term-c', from: 'coord-1' }); o.orch.length = 0
  expect(await doneTask(deps, { id: rev, as: 'checker@duo' })).toEqual({ outcome: 'done', closure: { kind: 'completed' }, linkedTasks: [] })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('link target offline: child created and owned by the target, not dispatched (skipped_offline), done still succeeds', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'skipped_offline' }])
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')).toEqual([])
})
test('link target busy: child queued (still ready, owned by the target), queued line sent', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  const { id: other } = await o.taskCreate({ spec: 's', taskTitle: 'x', run: 'run-1', from: 'coord-1' })
  await o.dispatch({ task: other, to: 'term-c', from: 'coord-1' })
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'queued' }])
  expect(o.tasks.find((t) => t.id === r.linkedTasks![0]!.taskId)!.status).toBe('ready')
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: expect.stringContaining('排队任务') })
})
test('gate fails under budget: gate_failed with the output file, no Orca call, count +1, task_log gate_failed', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  const r = await doneTask(deps, { id })
  expect(r).toEqual({ outcome: 'gate_failed', gateOutputPath: path.join(deps.home, 'logs', 'duo', `gate-${id}-0-1.txt`) })
  expect(o.orch).toEqual([])
  expect(registry.getTaskExt(id)!.gateFailures).toBe(1)
  expect(registry.listTaskLog(id).at(-1)!.action).toBe('gate_failed')
})
test('gate fails exactly at the budget: worker_done(failed) BEFORE gate-create; question cites the output file; blocked; gate recorded; closure escalated', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  const r = await doneTask(deps, { id })
  expect(r).toMatchObject({ outcome: 'escalated', gateId: 'gate-1', closure: { kind: 'escalated' } })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('gateCreate'))
  expect(o.callsOf('workerDone')[0]).toMatchObject({ outcome: 'failed', subject: 'gate failed' })
  expect(o.callsOf('gateCreate')[0]).toMatchObject({ task: id, question: expect.stringMatching(/连续 3 次[\s\S]*gate-.*-0-3\.txt/) })
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('blocked')
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
})
test('escalated: the lead is notified once when the lead is someone else', async () => {
  process.env.WL_GATE_EXIT = '1'
  const y = DUO_YAML + gates('checker')
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: y, env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  s.registry.incrementGateFailures('duo', id); s.registry.incrementGateFailures('duo', id)
  await doneTask(s.deps, { id })
  expect(o.sent.filter((m) => m.handle === 'term-b').map((m) => m.text)).toEqual([expect.stringContaining('wl task resolve gate-1')])
})

// —— 绕过 wl 直接上报（spec 第 10 节 done 第 3 步）——
test('bypassed + gate passes: no second report, links still created, verdict bypassed', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  await bypassReport(o, id); o.orch.length = 0
  const r = await doneTask(deps, { id })
  expect(r).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review', targets: ['checker@duo'] } })
  expect(o.callsOf('workerDone')).toEqual([])
  expect(o.callsOf('taskCreate')).toHaveLength(1)
  expect(registry.getVerdict(id, 0)).toMatchObject({ verdict: 'bypassed', finishedAt: expect.any(String) })
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('bypass_detected')
})
test('bypassed + gate fails: gate_failed_after_bypass, no gate created, no task_done row, the lead is told how to reopen', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched(REVIEW, { ORCA_TERMINAL_HANDLE: 'term-c' }, DUO_YAML + gates('checker') + 'links:\n  checker:\n    reviewed_by: [builder]\n')
  registry.setClaimedBy('duo', id, 'checker@duo'); o.tasks.find((t) => t.id === id)!.assigneeHandle = 'term-c'
  await bypassReport(o, id); o.orch.length = 0
  expect(await doneTask(deps, { id })).toMatchObject({ outcome: 'gate_failed_after_bypass' })
  expect(o.orch).toEqual([])
  expect(registry.getVerdict(id, 0)).toBeNull()
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: expect.stringContaining(`wl task escalate ${id} --reopen`) })
})

// —— 重跑安全（spec 第 12 节逐条） ——
test('report landed but returned runtime_timeout: settled in the same command; gate ran once; child created once', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'workerDone', when: 'after', error: rt() })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(gateRuns()).toBe(1)
  const reports = o.callsOf('workerDone')
  expect(reports).toHaveLength(2); expect(reports[1]!.retryRequest).toBe(reports[0]!.retryRequest)
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('report landed + timeout and request-show unreachable: exit-3 kind, no child yet; the rerun replays the report, skips the gate, then links', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'workerDone', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(o.callsOf('taskCreate')).toEqual([])
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(gateRuns()).toBe(1)
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('child task-create landed but returned runtime_timeout: no second child', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'taskCreate', when: 'after', error: rt() })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('child dispatch landed but returned runtime_timeout: done finishes, not task_not_open', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'dispatch', when: 'after', error: rt() })
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(o.tasks.find((t) => t.parentId === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
})
// R5-2：被拒的上报记进 Orca 账本，同 id 重放永远拿回同一个拒绝
test('report rejected (worker_identity_changed, recorded by Orca): row dropped, exit-2 kind; the rerun tries a NEW id instead of replaying the rejection', async () => {
  const { o, deps, registry, id } = await dispatched()
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-x', body: null })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'orca', code: 'worker_identity_changed', hint: expect.stringContaining('wl task recover') })
  expect(registry.getRequest(`done:${id}:0:report`)).toBeNull()
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'worker_identity_changed' })
  const ids = o.callsOf('workerDone').map((a) => a.retryRequest)
  expect(new Set(ids).size).toBe(2)
})
test('child dispatch row uncertain and the target terminal was rebuilt: the rerun dispatches to the new handle', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'dispatch', when: 'transport', error: new WinglineError('orca', 'runtime_unavailable', 'x') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.tasks.find((t) => t.parentId === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
})
test('two reviewers: one target\'s child dispatch uncertain, the other finished its review before the rerun → rerun finishes, the finished target is not touched', async () => {
  const { o, deps, registry, id } = await dispatched('', undefined, AUDITOR); addAuditor(o, registry)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't'), match: (a) => a.to === 'term-a' }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  const checkerChild = o.tasks.find((t) => t.parentId === id && t.assigneeHandle === 'term-c')!
  await o.workerDone({ taskId: checkerChild.id, dispatchId: checkerChild.dispatchId!, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-c' })
  o.orch.length = 0
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(r.linkedTasks!.map((l) => [l.target, l.delivery])).toEqual([['checker@duo', 'notified'], ['auditor@duo', 'notified']])
  expect(o.callsOf('dispatch').map((d) => d.to)).toEqual(['term-a'])
  expect(o.callsOf('taskCreate')).toEqual([])
  expect(registry.getTaskExt(checkerChild.id)!.epoch).toBe(0)
  expect(gateRuns()).toBe(1)
  expect(registry.getVerdict(id, 0)!.finishedAt).not.toBeNull()
})
test('escalate interrupted before gate-create: rerun keeps the verdict, the count and the question text', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  o.faults.push({ method: 'gateCreate', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  process.env.WL_GATE_EXIT = '0'
  expect(await doneTask(deps, { id })).toMatchObject({ outcome: 'escalated', gateId: 'gate-1' })
  expect(gateRuns()).toBe(1)
  expect(registry.getTaskExt(id)!.gateFailures).toBe(3)
  expect(new Set(o.callsOf('gateCreate').map((g) => g.question)).size).toBe(1)
})
test('resumeEpoch only continues an existing unfinished verdict: never runs the gate, never judges a new round', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  await expect(doneTask(deps, { id, resumeEpoch: 0 })).rejects.toMatchObject({ code: 'verdict_missing' })
  expect(gateRuns()).toBe(0); expect(o.orch).toEqual([])
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-b', body: null })
  await expect(doneTask(deps, { id, resumeEpoch: 1 })).rejects.toMatchObject({ code: 'verdict_missing' })
  expect((await doneTask(deps, { id, resumeEpoch: 0 })).outcome).toBe('done')
  expect(gateRuns()).toBe(0)
})
test('rerun after everything finished reports the stored result (replayed) and makes no Orca call', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  const first = await doneTask(deps, { id })
  o.orch.length = 0
  expect(await doneTask(deps, { id })).toEqual({ ...first, replayed: true })
  expect(o.orch).toEqual([])
})
test('coordinator changed between attempts: the child\'s task-create is reissued with the new coordinator', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-2' })
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
})
test('when multilineSafe is false, a multi-line gate output stays in the file and --body is one line', async () => {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { multilineSafe: false, env: { ORCA_TERMINAL_HANDLE: 'term-b' }, yaml: DUO_YAML + 'gates:\n  builder: \'node -e "console.log(1);console.log(2)"\'\n' })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  await doneTask(s.deps, { id })
  const body = o.callsOf('workerDone')[0]!.body as string
  expect(body).not.toMatch(/[\r\n]/)
  const file = body.replace(/^gate 输出见 /, '')
  expect(file).toBe(path.join(s.deps.home, 'logs', 'duo', `gate-${id}-0-1.txt`))
  expect(fs.readFileSync(file, 'utf8')).toMatch(/1\r?\n2/)
})

// —— 补充：身份/状态前置、预算、gate 环境、牵头岗通知、记录 ——
test('task dispatched to another handle → not_dispatched_to_you; a task that went back to ready → task_not_dispatched pointing at wl task start; no owner → not_your_task', async () => {
  const { o, deps, id } = await dispatched()
  o.tasks.find((t) => t.id === id)!.assigneeHandle = 'term-c'
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'not_dispatched_to_you' })
  o.tasks.find((t) => t.id === id)!.assigneeHandle = 'term-b'
  await o.terminalClose({ handle: 'term-b' })
  o.terminals.push({ handle: 'term-b', title: 'builder@duo', connected: true, worktreeId: 'w' })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'task_not_dispatched', hint: expect.stringContaining('wl task start') })
  const { id: ui } = await o.taskCreate({ spec: 's', taskTitle: 'ui', run: 'run-1', from: 'coord-1' })
  await expect(doneTask(deps, { id: ui })).rejects.toMatchObject({ code: 'not_your_task' })
  expect(gateRuns()).toBe(0)
})
test('a post with no gate passes without running anything and writes no output file; the report has no body', async () => {
  const { o, deps, id } = await dispatched('', undefined, DUO_YAML)
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(gateRuns()).toBe(0)
  expect(o.callsOf('workerDone')[0]).not.toHaveProperty('body')
  expect(fs.existsSync(path.join(deps.home, 'logs', 'duo'))).toBe(false)
})
test('failures under budget accumulate (output file per attempt), the third escalates; a later pass records the failure count it saw', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  const r1 = await doneTask(deps, { id }); const r2 = await doneTask(deps, { id })
  expect([r1.gateOutputPath, r2.gateOutputPath]).toEqual([1, 2].map((n) => path.join(deps.home, 'logs', 'duo', `gate-${id}-0-${n}.txt`)))
  expect(o.orch).toEqual([])
  process.env.WL_GATE_EXIT = '0'
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(registry.getVerdict(id, 0)).toMatchObject({ verdict: 'passed', gateFailures: 2 })
})
test('budgets.task.max_gate_failures: 1 escalates on the first failure', async () => {
  process.env.WL_GATE_EXIT = '1'
  const y = DUO_YAML + gates() + 'budgets:\n  task:\n    max_gate_failures: 1\n'
  const { o, deps, id } = await dispatched('', undefined, y)
  expect((await doneTask(deps, { id })).outcome).toBe('escalated')
  expect(o.callsOf('gateCreate')[0]!.question).toMatch(/连续 1 次/)
})
test('budgets.task.gate_timeout_seconds: a hung gate is killed, counts as a failure, and the output file says so', async () => {
  const y = DUO_YAML + 'gates:\n  builder: \'node -e "setTimeout(()=>{},60000)"\'\nbudgets:\n  task:\n    gate_timeout_seconds: 1\n'
  const { o, deps, registry, id } = await dispatched('', undefined, y)
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('gate_failed')
  expect(fs.readFileSync(r.gateOutputPath!, 'utf8')).toContain('gate 超时')
  expect(registry.getTaskExt(id)!.gateFailures).toBe(1)
  expect(o.orch).toEqual([])
})
test('the post worktree cannot be read → gate_cwd_unknown before anything runs or is written', async () => {
  const { o, deps, registry, id } = await dispatched()
  registry.upsertPost({ ...registry.getPost('builder@duo')!, worktree: 'id:w1' })
  o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'selector_not_found', 'x') })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'gate_cwd_unknown' })
  expect(gateRuns()).toBe(0); expect(o.orch).toEqual([]); expect(registry.getVerdict(id, 0)).toBeNull()
})
test('escalated when the caller IS the lead: no notification typed into its own terminal', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  await doneTask(deps, { id })
  expect(o.sent).toEqual([])
})
test('escalated with the lead at a prompt: still escalated, the notice is simply not typed', async () => {
  process.env.WL_GATE_EXIT = '1'
  const y = DUO_YAML + gates('checker')
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: y, env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  s.registry.incrementGateFailures('duo', id); s.registry.incrementGateFailures('duo', id)
  o.previews.set('term-b', 'Allow this edit? (y/n)')
  expect((await doneTask(s.deps, { id })).outcome).toBe('escalated')
  expect(o.sent.filter((m) => m.handle === 'term-b')).toEqual([])
})
test('the verdict row is finished with the stored result (closure included) and the task_log records done / escalate', async () => {
  const a = await dispatched(REVIEW)
  const r = await doneTask(a.deps, { id: a.id })
  expect(JSON.parse(a.registry.getVerdict(a.id, 0)!.result!)).toMatchObject({ outcome: 'done', closure: r.closure })
  expect(a.registry.listTaskLog(a.id).map((l) => l.action)).toContain('done')
  process.env.WL_GATE_EXIT = '1'
  const b = await dispatched()
  b.registry.incrementGateFailures('duo', b.id); b.registry.incrementGateFailures('duo', b.id)
  await doneTask(b.deps, { id: b.id })
  expect(b.registry.listTaskLog(b.id).map((l) => l.action)).toContain('escalate')
})
test('every link target gets a delivery record under done:<task>:<epoch>:delivered:<target>, including skipped ones', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  await doneTask(deps, { id })
  expect(registry.getRequest(`done:${id}:0:delivered:checker@duo`)!.state).toBe('done')
})
test('the child task is parented to the original, titled with its kind, and its spec names the target and the original id', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  await doneTask(deps, { id })
  expect(o.callsOf('taskCreate')[0]).toMatchObject({ parent: id, taskTitle: '评审：实现登录', spec: expect.stringContaining(`评审（checker@duo）：${id}`) })
})
test('only a successful report precedes links: a failed report (rejection) creates no child and runs the gate only once per command', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-x', body: null })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'worker_identity_changed' })
  expect(o.callsOf('taskCreate')).toEqual([])
  expect(gateRuns()).toBe(0)
})
