import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { createTask } from '../../../src/commands/task/create.js'
import { dispatchTo } from '../../../src/commands/task/dispatch.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { escalateTask, recoverTask } from '../../../src/commands/task/escalate.js'
import { gateCwd, writeGateOutput } from '../../../src/commands/task/gate-exec.js'
import { ledgered } from '../../../src/commands/task/ledger.js'
import { planTask } from '../../../src/commands/task/plan.js'
import { listStale } from '../../../src/commands/task/query.js'
import { startTask } from '../../../src/commands/task/start.js'
import { up } from '../../../src/commands/up.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, bypassReport, mkDeps, seedRunningTeam } from '../fake-client.js'

const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
const uncertain = () => new WinglineError('uncertain', 'orca_timeout', 't')
const orcaErr = (code: string) => new WinglineError('orca', code, 'x')

async function dispatchedTask(o: FakeOrca, deps: CommandDeps, to = 'term-b', owner: string | null = 'builder@duo') {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: owner })
  await o.dispatch({ task: id, to, from: 'coord-1' }); o.orch.length = 0
  return id
}

// —— M2：回执读不出 / 形状不对 → 经 request-show 定案（spec §9.1 第 2 步"回执无法解析 → 第 3 步"）——
const landedThenBroken = (deps: CommandDeps, o: FakeOrca, broken: () => Error) => {
  let first = true
  return ledgered(deps, {
    key: 'k', team: 'duo',
    build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
    call: async (a) => { const r = await o.taskCreate(a); if (first) { first = false; throw broken() } return r },
  })
}
test.each([
  ['internal/bad_json', () => new WinglineError('internal', 'bad_json', 'Orca 回执不是 JSON')],
  ['plain TypeError from a receipt-shape mismatch', () => new TypeError("Cannot read properties of undefined (reading 'id')")],
])('M2: call landed but its receipt is unreadable (%s) → request-show completed → same-id replay settles it; one task, row done', async (_n, broken) => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await landedThenBroken(deps, o, broken)
  expect(r.id).toBe(o.tasks[0]!.id); expect(o.tasks).toHaveLength(1)
  expect(registry.getRequest('k')!.state).toBe('done')
  const ids = o.callsOf('taskCreate').map((a) => a.retryRequest)
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
})
test('M2: unreadable receipt and request-show unreachable → uncertain (exit-3 kind), the row is uncertain — not left pending', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'requestShow', when: 'before', error: ru() })
  await expect(landedThenBroken(deps, o, () => new TypeError('boom'))).rejects.toMatchObject({ kind: 'uncertain' })
  expect(registry.getRequest('k')!.state).toBe('uncertain')
})
test('M2: unreadable receipt for a call that never landed → request-show absent → row dropped', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(ledgered(deps, {
    key: 'k', team: 'duo',
    build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
    call: async () => { throw new TypeError('boom before anything was sent') },
  })).rejects.toBeDefined()
  expect(registry.getRequest('k')).toBeNull()
})

// —— list --stale 不带团队：扫描所有有 Run 的团队 ——
test('listStale without a team scans every team that has a Run (and skips teams without one)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertTeam({ name: 'norun', specPath: '/x', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  const id = await dispatchedTask(o, deps, 'term-old')
  const items = await (listStale as (d: CommandDeps, team?: string) => ReturnType<typeof listStale>)(deps)
  expect(items.map((x) => [x.taskId, x.reason])).toEqual([[id, 'dead_assignee']])
})

// —— recover 返回主人，renderRecover 才能给出真实岗位地址 ——
test('recoverTask returns the owner address (null when the task has no owner)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const owned = await dispatchedTask(o, deps, 'term-old')
  expect(await recoverTask(deps, { id: owned })).toMatchObject({ status: 'dispatched', owner: 'builder@duo' })
  const orphan = await dispatchedTask(o, deps, 'term-old2', null)
  expect(await recoverTask(deps, { id: orphan })).toMatchObject({ status: 'ready', owner: null })
})

// —— gateCwd：未登记的岗位 ——
test('gateCwd for an unregistered address is post_unknown (input), not a TypeError', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(gateCwd(deps, 'ghost@duo')).rejects.toMatchObject({ kind: 'input', code: 'post_unknown' })
})

// —— writeGateOutput：清理时文件被别的进程删掉（statSync 竞态）——
test('writeGateOutput tolerates a cleanup candidate that disappears between listing and stat', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const dir = path.join(home, 'logs', 'duo'); fs.mkdirSync(dir, { recursive: true })
  fs.symlinkSync(path.join(dir, 'does-not-exist'), path.join(dir, 'gate-ghost-0-1.txt'))     // 列得出来、stat 不到
  const file = writeGateOutput(home, 'duo', 't1', 0, 1, 'out')
  expect(fs.readFileSync(file, 'utf8')).toBe('out')
})

// —— done：REJECT_HINT 只给"执行者身份变了"这一种拒绝 ——
test('done: a definite Orca error other than the identity rejection does not carry the recover/start hint', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'workerDone', when: 'before', error: orcaErr('runtime_error') })
  const err = await doneTask(deps, { id }).catch((e) => e)
  expect(err).toMatchObject({ kind: 'orca', code: 'runtime_error' })
  expect(err.hint ?? '').not.toContain('wl task recover')
})
test('done: the worker_identity_changed rejection keeps the recover/start hint', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await dispatchedTask(o, deps)
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-x', body: null })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'worker_identity_changed', hint: expect.stringContaining('wl task recover') })
})

// —— bypass_detected 与牵头岗通知不在重跑时重复 ——
test('bypassed task whose supplementary gate keeps failing: bypass_detected is logged once and the lead is told once across reruns', async () => {
  const o = new FakeOrca()
  const y = DUO_YAML + 'gates:\n  checker: \'node -e "process.exit(1)"\'\n'
  const { deps, registry } = seedRunningTeam(o, { yaml: y, env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await dispatchedTask(o, deps, 'term-c', 'checker@duo')
  await bypassReport(o, id)
  expect((await doneTask(deps, { id })).outcome).toBe('gate_failed_after_bypass')
  expect((await doneTask(deps, { id })).outcome).toBe('gate_failed_after_bypass')
  expect(registry.listTaskLog(id).filter((l) => l.action === 'bypass_detected')).toHaveLength(1)
  expect(o.sent.filter((m) => m.handle === 'term-b')).toHaveLength(1)
})

// —— escalate：同一个 --retry-request 重跑不重复记日志、不重复通知 ——
test('escalate rerun with the same --retry-request neither logs escalate nor notifies the lead a second time', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const first = await escalateTask(deps, { id, reason: 'x', retryRequest: 'rid-1' })
  const second = await escalateTask(deps, { id, reason: 'x', retryRequest: 'rid-1' })
  expect(second.gateId).toBe(first.gateId)
  expect(registry.listTaskLog(id).filter((l) => l.action === 'escalate')).toHaveLength(1)
  expect(o.sent.filter((m) => m.handle === 'term-b')).toHaveLength(1)
})

// —— recover 手动加 epoch：和 bumpRound 一样记 epoch_bump、收尾旧判定 ——
test('recover on a dispatch made outside wingline (no dispatch row): the extra epoch bump is logged and abandons the older unfinished verdict', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-old', body: null })
  await recoverTask(deps, { id })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('epoch_bump')
  expect(registry.getVerdict(id, 0)).toMatchObject({ result: JSON.stringify({ outcome: 'abandoned' }), finishedAt: expect.any(String) })
})

// —— plan：先做前置（Orca 不可达时报 runtime_unavailable，而不是 taskList 的错）——
test('planTask checks Orca reachability first: with Orca unreachable the error is runtime_unavailable even if task-list also fails', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.reachable = false
  o.faults.push({ method: 'taskList', when: 'before', error: orcaErr('some_other_error') })
  await expect(planTask(deps, { id, text: 'x' })).rejects.toMatchObject({ code: 'runtime_unavailable' })
})

// —— dispatchTo 只读一次 task-list（spec §7.3 复用同一次）——
test('dispatchTo reads task-list once on the happy path', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  o.calls.length = 0
  await dispatchTo(deps, 'duo', id, { address: 'builder@duo', handle: 'term-b' })
  expect(o.calls.filter((c) => c === 'taskList')).toHaveLength(1)
})

// —— start：岗位不在规格里 → post_unknown（而不是后面的 post_offline）——
test('start by an actor whose post is not in the team spec → post_unknown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'ghost@duo' })
  await expect(startTask(deps, { id, as: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
})

// —— up：lead 这轮没到位时 Run 步骤 deferred，但已建立的 runId 要带出来 ——
test('up with a stored Run and the lead not ready this round: run is deferred and still reports the stored runId', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = mkTeam(DUO_YAML)
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-1' })
  o.waitSatisfied = false
  const r = await up(deps, { specPath: p })
  expect(r.run).toEqual({ outcome: 'deferred', runId: 'run-1' })
})

// —— oneShot：pending 的提示保留"稍后"，同时带 --retry-request ——
test('create with request-show pending: the hint says to retry later and carries --retry-request <id>', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: uncertain() })
  o.onMutate = () => { const id = o.callsOf('taskCreate')[0]?.retryRequest as string | undefined; if (id) o.pendingIds.add(id) }
  const err = await createTask(deps, { team: 'duo', title: 't' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err.hint).toContain('稍后'); expect(err.hint).toContain(`--retry-request ${id}`)
})
