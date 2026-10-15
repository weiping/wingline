// 审查方测试（spec 第 3、8、9 节）：主循环。
import { expect, test } from 'vitest'
import { PATROL_INTERVAL_MS } from '../../../src/commands/dispatcher/advance.js'
import { HEARTBEAT_TAKEOVER_MS } from '../../../src/commands/dispatcher/lifecycle.js'
import {
  BACKOFF_MAX_MS, BACKOFF_START_MS, CHECK_WAIT_MS, WAKE_GAP_MS, connectDispatcher, initialState, loopOnce, runDispatcherLoop, type LoopState,
} from '../../../src/commands/dispatcher/loop.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, ask, clock, seedRunningTeam } from '../fake-client.js'

function dsp(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca()
  const s = seedRunningTeam(o, { now: c.now, monotonic: c.monotonic, yaml, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  const slept: number[] = []
  const sleep = async (ms: number) => { slept.push(ms); c.advance(ms) }
  const start = async () => { const team = await connectDispatcher(s.deps, 'duo', 'term-dsp', { sleep }); return initialState(s.deps, team, loadTeamSpec(team.specPath)) }
  const once = (st: LoopState) => loopOnce(s.deps, 'term-dsp', st, { sleep, waitMs: 1 })
  return { c, o, ...s, slept, sleep, start, once }
}
const fail = () => new WinglineError('orca', 'runtime_unavailable', 'x')
const events = (w: ReturnType<typeof dsp>, a: string) => w.registry.listPatrolEvents('duo').filter((e) => e.action === a)

test('constants: 60 s check wait, 60 s wake gap, 5→60 s backoff', () => {
  expect([CHECK_WAIT_MS, WAKE_GAP_MS, BACKOFF_START_MS, BACKOFF_MAX_MS]).toEqual([60_000, 60_000, 5_000, 60_000])
})

test('check is called with --wait and the spec timeout by default', async () => {
  const w = dsp(); const st = await w.start()
  await loopOnce(w.deps, 'term-dsp', st, { sleep: w.sleep })
  expect(w.o.callsOf('check')[0]).toMatchObject({ terminal: 'term-dsp', run: 'run-1', wait: true, timeoutMs: 60_000 })
})

test('connect backoff doubles from 5 s and is capped at 60 s', async () => {
  const w = dsp()
  for (let i = 0; i < 6; i++) w.o.faults.push({ method: 'runUse', when: 'before', error: fail() })
  await connectDispatcher(w.deps, 'duo', 'term-dsp', { sleep: w.sleep })
  expect(w.slept).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
})

test('connect writes only coordinator_handle (status, run id and spec hash untouched)', async () => {
  const w = dsp(); const before = w.registry.getTeam('duo')!
  await connectDispatcher(w.deps, 'duo', 'term-dsp', { sleep: w.sleep })
  expect(w.registry.getTeam('duo')).toEqual({ ...before, coordinatorHandle: 'term-dsp' })
})

test('check failure backoff doubles and resets after a success', async () => {
  const w = dsp(); const st = await w.start()
  for (let i = 0; i < 3; i++) w.o.faults.push({ method: 'check', when: 'before', error: fail() })
  for (let i = 0; i < 4; i++) await w.once(st)
  expect(w.slept.slice(-3)).toEqual([5_000, 10_000, 20_000])
  w.o.faults.push({ method: 'check', when: 'before', error: fail() })
  await w.once(st)
  expect(w.slept.at(-1)).toBe(5_000)
})

test('two check failures keep the pending ack; the third drops it', async () => {
  const w = dsp(); const st = await w.start()
  w.o.postMessage({ type: 'status' }); await w.once(st)
  const ack = st.pendingAck
  w.o.faults.push({ method: 'check', when: 'before', error: fail() }, { method: 'check', when: 'before', error: fail() })
  await w.once(st); await w.once(st)
  expect(st.pendingAck).toBe(ack)
  w.o.faults.push({ method: 'check', when: 'before', error: fail() })
  await w.once(st)
  expect(st.pendingAck).toBeNull()
})

test('a connectionLost batch is not processed', async () => {
  const w = dsp(); const st = await w.start()
  w.o.connectionLostOnce = true
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await w.o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' }); ask(w.o, id, 'q?')
  expect((await w.once(st)).check).toBe('lost')
  expect(w.registry.listOpenQuestions('duo')).toEqual([])
})

test('a replayed batch (no ack reached Orca) is handled once: dedupe by message id', async () => {
  const w = dsp(); const st = await w.start()
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await w.o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' }); ask(w.o, id, 'q?')
  await w.once(st)
  st.pendingAck = null                                                  // 模拟 ack 没送达
  await w.once(st)
  expect(w.o.sent.filter((s) => s.text.includes('提问'))).toHaveLength(1)
})

test('fenced: a fenced_reclaim event is recorded and the registry coordinator is ours again', async () => {
  const w = dsp(); const st = await w.start()
  await w.o.runUse({ id: 'run-1', from: 'term-other' })
  await w.once(st)
  expect(events(w, 'fenced_reclaim')).toHaveLength(1)
  expect(w.registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})

test('patrol keeps its wall-clock rhythm while check is fenced every round', async () => {
  const w = dsp(); const st = await w.start()
  let scans = 0
  for (let i = 0; i < 4; i++) {
    w.o.coordinator = 'term-thief'                                       // 每轮都被抢
    w.c.advance(PATROL_INTERVAL_MS)
    if ((await w.once(st)).scanned) scans += 1
  }
  expect(scans).toBe(4)
})

test('scan fires at exactly one interval after the previous one', async () => {
  const w = dsp(); const st = await w.start()
  w.c.advance(PATROL_INTERVAL_MS - 1); expect((await w.once(st)).scanned).toBe(false)
  w.c.advance(1); expect((await w.once(st)).scanned).toBe(true)
})

test('a wake makes the next scan observe-only even if it happens rounds later, and floors no_progress at wokeAt', async () => {
  const w = dsp(); const st = await w.start()
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await w.o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' })
  w.o.terminals.find((t) => t.handle === 'term-c')!.lastOutputAt = w.c.now().getTime()
  w.c.advance(PATROL_INTERVAL_MS); await w.once(st)                   // 第一轮只观察（启动）
  w.c.sleepJump(8 * 3_600_000)                                         // 睡了一晚
  expect((await w.once(st)).woke).toBe(true)
  w.c.advance(PATROL_INTERVAL_MS); await w.once(st)
  expect(w.registry.listPatrolState('duo').filter((r) => r.signal === 'no_progress')).toEqual([])
})

test('heartbeat is refreshed after a long check (not only at the start of the round)', async () => {
  const w = dsp()
  await w.registry.withTeamLock('dispatcher:duo', async () => {
    const st = await w.start(); st.locked = true
    w.o.onCheck = () => { w.c.advance(59_000) }
    await w.once(st)
    expect(w.registry.getLock('dispatcher:duo')!.heartbeatAt).toBe(w.c.now().toISOString())
  }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
})

test('spec reload: an unchanged spec_hash never reloads; a reload failure is recorded once, not every round', async () => {
  const w = dsp(); const st = await w.start()
  await w.once(st); await w.once(st)
  expect(events(w, 'spec_reload')).toEqual([])
  w.registry.upsertTeam({ ...w.registry.getTeam('duo')!, specHash: 'f'.repeat(64) })
  await w.once(st); await w.once(st); await w.once(st)
  expect(events(w, 'spec_reload_failed')).toHaveLength(1)
})

test('runDispatcherLoop: run_not_found is fatal and the lock row is removed on exit', async () => {
  const w = dsp()
  w.o.faults.push({ method: 'runUse', when: 'before', error: new WinglineError('orca', 'run_not_found', 'gone') })
  await expect(runDispatcherLoop(w.deps, 'duo', { sleep: w.sleep })).rejects.toMatchObject({ code: 'run_not_found' })
  expect(w.registry.getLock('dispatcher:duo')).toBeNull()
})

test('runDispatcherLoop: dispatcher_not_in_orca happens before taking the lock (a running dispatcher is not disturbed)', async () => {
  const w = dsp()
  await w.registry.withTeamLock('dispatcher:duo', async () => {
    await expect(runDispatcherLoop({ ...w.deps, env: {} }, 'duo', { sleep: w.sleep })).rejects.toMatchObject({ code: 'dispatcher_not_in_orca' })
    expect(w.registry.getLock('dispatcher:duo')!.pid).toBe(process.pid)
  }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
})

test('runDispatcherLoop survives an unexpected exception in a round and keeps going', async () => {
  const w = dsp(); const ac = new AbortController()
  let n = 0
  w.o.onCheck = () => { n += 1; if (n === 1) throw new TypeError('bug'); if (n >= 3) ac.abort() }
  await runDispatcherLoop(w.deps, 'duo', { signal: ac.signal, sleep: w.sleep, waitMs: 1 })
  expect(n).toBeGreaterThanOrEqual(3)
  expect(w.registry.getLock('dispatcher:duo')).toBeNull()
})

test('fenced and the reclaim run-use keeps failing: rounds back off instead of spinning on check + run-use', async () => {
  const w = dsp(); const st = await w.start()
  w.o.coordinator = 'term-thief'
  for (let i = 0; i < 5; i++) w.o.faults.push({ method: 'runUse', when: 'before', error: fail() })
  for (let i = 0; i < 5; i++) expect((await w.once(st)).check).toBe('fenced')
  expect(w.slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(5 * BACKOFF_START_MS)
})
