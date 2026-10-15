import { expect, test } from 'vitest'
import { reassignTask } from '../../../src/commands/task/claim.js'
import { createTask } from '../../../src/commands/task/create.js'
import { ledgered } from '../../../src/commands/task/ledger.js'
import { startTask } from '../../../src/commands/task/start.js'
import { up } from '../../../src/commands/up.js'
import { WinglineError } from '../../../src/errors.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../fake-client.js'

const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
const rt = () => new WinglineError('orca', 'runtime_timeout', 't')
const unreachable = (o: FakeOrca) => o.faults.push({ method: 'requestShow', when: 'before', error: ru() })

// —— N1：input 错误只能丢掉"这次调用"新开的行 ——
test('N1: an input error on a rerun keeps an uncertain row left by an earlier attempt (its call may have landed); the next rerun replays the same id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const call = () => ledgered(deps, {
    key: 'k', team: 'duo',
    build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
    call: (a) => o.taskCreate(a),
  })
  o.faults.push({ method: 'taskCreate', when: 'after', error: rt() }); unreachable(o)
  expect((await call().catch((e) => e)).kind).toBe('uncertain')
  const firstId = registry.getRequest('k')!.retryRequest
  o.faults.push({ method: 'taskCreate', when: 'transport', error: new WinglineError('input', 'orca_not_found', 'ENOENT') })
  expect((await call().catch((e) => e)).code).toBe('orca_not_found')
  expect(registry.getRequest('k')).toMatchObject({ state: 'uncertain', retryRequest: firstId })
  await call()
  expect(o.tasks).toHaveLength(1)
  expect(o.callsOf('taskCreate').map((a) => a.retryRequest).every((id) => id === firstId)).toBe(true)
})
test('N1: a row opened by this very invocation is still dropped on an input error', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'transport', error: new WinglineError('input', 'cmd_newline_unsupported', 'x') })
  await expect(ledgered(deps, {
    key: 'fresh', team: 'duo',
    build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
    call: (a) => o.taskCreate(a),
  })).rejects.toMatchObject({ code: 'cmd_newline_unsupported' })
  expect(registry.getRequest('fresh')).toBeNull()
})

// —— N2：CAS 输家读到被赢家丢掉的行，不能 TypeError ——
test('N2: a concurrent loser of the reissue race whose winner already dropped the row finishes with a WinglineError, not an internal TypeError', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'coord-2', title: 'zsh', connected: true, worktreeId: 'w' })
  o.coordinator = 'coord-2'
  let n = 0; let calls = 0; let release!: () => void; const gate = new Promise<void>((r) => (release = r))
  const call = () => ledgered(deps, {
    key: 'k', team: 'duo',
    build: async (t) => { if (++n === 4) await gate; return { spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! } },
    call: async (a) => { if (++calls === 3) o.coordinator = 'coord-3'; return o.taskCreate(a) },
  })
  const p1 = call().catch((e) => e)
  const p2 = call().catch((e) => e)
  await p1
  release()
  const r2 = await p2
  expect(r2).not.toBeInstanceOf(TypeError)
  if (r2 instanceof Error) expect(r2).toBeInstanceOf(WinglineError)
})

// —— N3：run-list 被截断时，wl up 要给出能走通的下一步 ——
test('N3: a truncated run-list surfaces as a retry that names --new-run (a team that never had a Run) or --adopt-run, with the hint kept', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.faults.push({ method: 'runList', when: 'before', error: new WinglineError('orca', 'run_list_truncated', 'run-list 结果不止一页', { hint: '用 wl up --adopt-run <id> 指定要找回的 Run' }) })
  const r = await up(deps, { specPath: mkTeam(DUO_YAML) })
  expect(r.run).toBeDefined()
  expect(['failed', 'ambiguous']).toContain(r.run!.outcome)
  expect(r.run!.retry ?? '').toMatch(/--new-run|--adopt-run/)
  expect(r.run!.retry ?? '').toContain('--new-run')
})

// —— N4：已 done 的派发行不能把"新任务"打到旧岗位 ——
test('N4: rerunning create --post builder after the task was reassigned and started by checker does not type 新任务 into builder\'s terminal', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  o.faults.push({ method: 'dispatch', when: 'before', error: rt() }); unreachable(o)
  const err = await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' }).catch((e) => e)
  expect(err.kind).toBe('uncertain')
  const rid = o.callsOf('taskCreate')[0]!.retryRequest as string
  const id = o.tasks[0]!.id
  await reassignTask(s.deps, { id, to: 'checker@duo' })
  await startTask(s.deps, { id, as: 'checker@duo' })                 // from builder's terminal: dispatched to term-c, row done
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  o.sent.length = 0
  await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo', retryRequest: rid }).catch(() => {})
  expect(o.sent.filter((m) => m.handle === 'term-b' && m.text.includes('新任务'))).toEqual([])
})

// —— N5：confirmReplay 的守卫要有测试，提示要指向走得通的路 ——
test('N5: a dispatch that lands late on the old post after a reassign is refused (task_not_open) with a hint that works — escalate / resolve --reassign / start, not recover — and nothing is typed', async () => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  o.faults.push({ method: 'dispatch', when: 'before', error: rt() }); unreachable(o)
  await createTask(s.deps, { team: 'duo', title: 'T', post: 'builder@duo' }).catch(() => {})
  const rid = s.registry.getRequest(`dispatch:${o.tasks[0]!.id}:0`)!.retryRequest!
  const id = o.tasks[0]!.id
  await reassignTask(s.deps, { id, to: 'checker@duo' })
  // the original call lands late (right when start asks request-show), on the old post
  const realShow = o.requestShow.bind(o); let landed = false
  o.requestShow = async (a) => { if (!landed) { landed = true; await o.dispatch({ task: id, to: 'term-b', from: 'coord-1', retryRequest: rid }) } return realShow(a) }
  o.sent.length = 0
  const e = await startTask(s.deps, { id }).catch((x) => x)
  expect(e).toMatchObject({ code: 'task_not_open' })
  expect(e.hint).toContain('escalate'); expect(e.hint).toContain('resolve')
  expect(e.hint).not.toContain('wl task recover')
  expect(o.sent.filter((m) => m.text.includes('新任务'))).toEqual([])
})

// —— A-M2 余下的一半：--new-run 在 dropRequest 与 openIntent 之间被杀 ——
test('A-M2: killed between dropping the old run-create row and opening the new one, a later plain `wl up` must not adopt the OLD Run', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = mkTeam(DUO_YAML)
  await up(deps, { specPath: p })
  const real = registry.openIntent.bind(registry)
  registry.openIntent = (id: string, ...rest: [string, unknown]) => { if (id.endsWith(':run-create')) { registry.openIntent = real; throw new Error('killed') } return real(id, ...rest) }
  await expect(up(deps, { specPath: p, newRun: true })).rejects.toThrow('killed')
  const r = await up(deps, { specPath: p })
  expect(r.run).not.toMatchObject({ outcome: 'adopted', runId: 'run-1' })
  expect(r.run!.runId).not.toBe('run-1')
})
