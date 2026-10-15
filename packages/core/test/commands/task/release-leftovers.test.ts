import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createTask } from '../../../src/commands/task/create.js'
import { escalateTask, recoverTask } from '../../../src/commands/task/escalate.js'
import { runGate } from '../../../src/commands/task/gate-exec.js'
import { screenGuard } from '../../../src/commands/task/notify.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { listStale } from '../../../src/commands/task/query.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'

// —— A-M1：并发的 done / recover / escalate ——
test('A-M1: two concurrent wl task done runs both finish (no internal/request_already_done exit) and the reviewer is notified once', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { yaml: DUO_YAML + REVIEW, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const { id } = await createTask(deps, { team: 'duo', title: 'T', post: 'builder@duo' })
  o.sent.length = 0
  const results = await Promise.allSettled([doneTask(deps, { id }), doneTask(deps, { id })])
  for (const r of results) {
    if (r.status === 'rejected') expect((r.reason as WinglineError).code).not.toBe('request_already_done')
  }
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  expect(o.sent.filter((m) => m.handle === 'term-c' && m.text.includes('新任务'))).toHaveLength(1)
})
test('A-M1: two concurrent recover runs on the same dead-assignee task: no internal error, one gate', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-old', from: 'coord-1' })
  const results = await Promise.allSettled([recoverTask(deps, { id }), recoverTask(deps, { id })])
  for (const r of results) if (r.status === 'rejected') expect((r.reason as WinglineError).kind).not.toBe('internal')
  expect(o.gates.size).toBe(1)
  expect(results.some((r) => r.status === 'fulfilled')).toBe(true)
})
test('A-M1: two concurrent escalate runs with the same --retry-request make one gate and tell the lead once', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  const results = await Promise.allSettled([escalateTask(deps, { id, reason: 'x', retryRequest: 'rid-1' }), escalateTask(deps, { id, reason: 'x', retryRequest: 'rid-1' })])
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  expect(o.gates.size).toBe(1)
  expect(o.sent.filter((m) => m.handle === 'term-b')).toHaveLength(1)
})

// —— A-M5：被打断的 oneshot 行要能被 --stale 找到，并给出带 --retry-request 的重跑命令 ——
test('A-M5: a pending oneshot:<id> row left by a killed `wl task create` is listed by --stale with the rebuilt create command and its --retry-request', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.openIntent('oneshot:rid-c', 'rid-c', { spec: 'human: 修 bug\n\nfooter', taskTitle: '修 bug', run: 'run-1', from: 'coord-1', tags: ['a', 'b'], post: 'checker@duo' })
  const later = new Date(Date.now() + 10 * 60_000); deps.now = () => later
  const item = (await listStale(deps, 'duo')).find((x) => x.reason === 'call_uncertain' && x.command.includes('--retry-request rid-c'))!
  expect(item).toBeDefined()
  for (const frag of ['wl task create duo', '--title', '修 bug', '--post checker@duo', '--tags a,b']) expect(item.command).toContain(frag)
})
test('A-M5: the same for a killed `wl task escalate`; a fresh (< 1 minute) oneshot row is not reported, and a done one never is', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  registry.openIntent('oneshot:rid-e', 'rid-e', { task: id, question: '卡住了', from: 'coord-1' })
  registry.openIntent('oneshot:rid-done', 'rid-done', { spec: 's', taskTitle: 'x', run: 'run-1', from: 'coord-1', tags: [], post: null })
  registry.finishRequest('oneshot:rid-done', 'done', { id: 'task-9', replayed: false })
  expect((await listStale(deps, 'duo')).filter((x) => x.command.includes('rid-e'))).toEqual([])               // too fresh
  const later = new Date(Date.now() + 10 * 60_000); deps.now = () => later
  const items = await listStale(deps, 'duo')
  const esc = items.find((x) => x.command.includes('--retry-request rid-e'))!
  expect(esc.command).toContain(`wl task escalate ${id}`); expect(esc.command).toContain('--reason'); expect(esc.command).toContain('卡住了')
  expect(items.some((x) => x.command.includes('rid-done'))).toBe(false)
})

// —— B-M6：真机的终端不存在错误码是 terminal_handle_stale ——
test('B-M6: screenGuard maps the real terminal_handle_stale to offline; the never-observed terminal_not_found and a worktree selector_not_found are just unknown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const fault = (code: string) => o.faults.push({ method: 'terminalShow', when: 'before', error: new WinglineError('orca', code, 'x') })
  fault('terminal_handle_stale'); expect(await screenGuard(deps, 'term-c')).toBe('offline')
  fault('terminal_not_found'); expect(await screenGuard(deps, 'term-c')).toBe('unknown')
  fault('selector_not_found'); expect(await screenGuard(deps, 'term-c')).toBe('unknown')
})

// —— Ctrl-C：中断 wl task done 时，gate 的进程组要被一起杀掉 ——
test('Ctrl-C: SIGINT during a running gate kills the gate\'s process group (no orphan), resolves promptly, and leaves no signal handler behind', async () => {
  if (process.platform === 'win32') return
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-sig-'))
  const pidFile = path.join(dir, 'pid')
  process.env.WL_PID_FILE = pidFile
  const cmd = 'node -e "require(\'fs\').writeFileSync(process.env.WL_PID_FILE,String(process.pid));setTimeout(()=>{},60000)"'
  const before = process.listenerCount('SIGINT')
  const started = Date.now()
  const pending = runGate(cmd, { cwd: dir, timeoutMs: 4000 })
  await new Promise((res) => setTimeout(res, 500))
  process.emit('SIGINT')
  const r = await pending
  expect(Date.now() - started).toBeLessThan(3000)
  expect(r).toMatchObject({ passed: false, timedOut: false })
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  await new Promise((res) => setTimeout(res, 300))
  expect(() => process.kill(pid, 0)).toThrow()
  expect(process.listenerCount('SIGINT')).toBe(before)
})
