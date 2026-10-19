import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { PATROL_INTERVAL_MS } from '../../../src/commands/dispatcher/advance.js'
import { HEARTBEAT_TAKEOVER_MS } from '../../../src/commands/dispatcher/lifecycle.js'
import { BACKOFF_START_MS, connectDispatcher, initialState, loopOnce, runDispatcherLoop, WAKE_GAP_MS, type LoopOpts, type LoopResult, type LoopState } from '../../../src/commands/dispatcher/loop.js'
import { WinglineError } from '../../../src/errors.js'
import { specHash } from '../../../src/spec/hash.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML } from '../../spec/helpers.js'
import { ask, clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

function dsp(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca(); const s = seedRunningTeam(o, { now: c.now, monotonic: c.monotonic, yaml, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  const sleep = async (ms: number) => { c.advance(ms) }
  const start = async () => { const team = await connectDispatcher(s.deps, 'duo', 'term-dsp', { sleep }); return initialState(s.deps, team, loadTeamSpec(team.specPath)) }
  return { c, o, ...s, sleep, start, once: (st: LoopState, more: Partial<LoopOpts> = {}) => loopOnce(s.deps, 'term-dsp', st, { sleep, waitMs: 1, ...more }) }
}
test('connect: run-use from its own handle, only the coordinator column is written; transient errors back off and retry; run_not_found is fatal', async () => {
  const w = dsp()
  w.o.faults.push({ method: 'runUse', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  w.registry.upsertTeam({ ...w.registry.getTeam('duo')!, status: 'stopped' })
  const t0 = w.c.now().getTime()
  expect((await connectDispatcher(w.deps, 'duo', 'term-dsp', { sleep: w.sleep })).coordinatorHandle).toBe('term-dsp')
  expect(w.c.now().getTime() - t0).toBe(BACKOFF_START_MS)
  expect(w.registry.getTeam('duo')).toMatchObject({ coordinatorHandle: 'term-dsp', status: 'stopped' })
  w.o.faults.push({ method: 'runUse', when: 'before', error: new WinglineError('orca', 'run_not_found', 'gone') })
  await expect(connectDispatcher(w.deps, 'duo', 'term-dsp', { sleep: w.sleep })).rejects.toMatchObject({ code: 'run_not_found' })
})
test('a batch is handled once and its ack rides on the next check', async () => {
  const w = dsp(); const st = await w.start()
  w.o.postMessage({ type: 'worker_done', fromHandle: 'term-c', payload: '{}' })
  await w.once(st); expect(st.pendingAck).toBe('dlv-1')
  await w.once(st)
  expect(w.o.callsOf('check').map((c) => c.ack)).toEqual([undefined, 'dlv-1'])
  expect(st.pendingAck).toBeNull()
})
test('fenced: the pending ack is dropped, the identity is reclaimed, the redelivered message is not handled twice', async () => {
  const w = dsp(); const st = await w.start()
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await w.o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' }); ask(w.o, id, '用哪个？')
  await w.once(st)
  await w.o.runUse({ id: 'run-1', from: 'term-other' })
  expect((await w.once(st)).check).toBe('fenced')
  expect(st.pendingAck).toBeNull()
  expect(w.o.coordinator).toBe('term-dsp')
  await w.once(st)
  expect(w.o.sent.filter((s) => s.text.includes('提问'))).toHaveLength(1)
})
test('check keeps failing: after 3 failures the pending ack is dropped; patrol still scans on the wall clock', async () => {
  const w = dsp(); const st = await w.start()
  w.o.postMessage({ type: 'worker_done', payload: '{}' }); await w.once(st)
  for (let i = 0; i < 3; i++) w.o.faults.push({ method: 'check', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const results: LoopResult[] = []
  for (let i = 0; i < 3; i++) { w.c.advance(PATROL_INTERVAL_MS / 2); results.push(await w.once(st)) }
  expect(results.map((r) => r.check)).toEqual(['failed', 'failed', 'failed'])
  expect(results.some((r) => r.scanned)).toBe(true)
  expect(st.pendingAck).toBeNull()
})
test('connectionLost keeps the pending ack for the next round (double ack is harmless)', async () => {
  const w = dsp(); const st = await w.start()
  w.o.postMessage({ type: 'worker_done', payload: '{}' }); await w.once(st)
  w.o.connectionLostOnce = true
  await w.once(st); expect(st.pendingAck).toBe('dlv-1')
})
test('the first scan happens one interval after start and only observes; the next one may act', async () => {
  const w = dsp(); const st = await w.start()
  const { id } = await w.o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  w.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await w.o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' })
  w.o.terminals.find((t) => t.handle === 'term-c')!.lastOutputAt = w.c.now().getTime() - 3_600_000
  expect((await w.once(st)).scanned).toBe(false)
  w.c.advance(PATROL_INTERVAL_MS); expect((await w.once(st)).scanned).toBe(true)
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', id)!.level).toBe(0)
  w.c.advance(PATROL_INTERVAL_MS); await w.once(st)
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', id)!.level).toBe(1)
})
test('wall clock running ahead of the monotonic clock is a wake-up; a merely slow round is not', async () => {
  const w = dsp(); const st = await w.start()
  w.c.advance(10 * 60_000)
  expect((await w.once(st)).woke).toBe(false)
  w.c.sleepJump(WAKE_GAP_MS + 1)
  const r = await w.once(st)
  expect(r.woke).toBe(true); expect(st.observeOnlyNextScan).toBe(true)
  expect(w.registry.listPatrolEvents('duo').map((e) => e.action)).toContain('wake')
})
test('every round writes the heartbeat on the lock row', async () => {
  const w = dsp()
  await w.registry.withTeamLock('dispatcher:duo', async () => {
    const st = await w.start(); w.c.advance(1000); await w.once(st)
    expect(w.registry.getLock('dispatcher:duo')!.heartbeatAt).toBe(w.c.now().toISOString())
  }, { takeoverAfterMs: HEARTBEAT_TAKEOVER_MS })
})
test('a superseded dispatcher (heartbeat reports the row is no longer ours) stops with dispatcher_superseded', async () => {
  const w = dsp(); const st = await w.start(); st.locked = true
  await expect(w.once(st)).rejects.toMatchObject({ code: 'dispatcher_superseded' })
})
test('final-review m3: an unchanged check result is re-recorded at most once per 10 minutes, so "last check" stays fresh', async () => {
  const w = dsp(); const st = await w.start()
  const checks = () => w.registry.listPatrolEvents('duo').filter((e) => e.action === 'check_ok')
  await w.once(st); expect(checks()).toHaveLength(1)
  w.c.advance(60_000); await w.once(st); expect(checks()).toHaveLength(1)
  w.c.advance(10 * 60_000); await w.once(st)
  expect(checks()).toHaveLength(2)
  expect(checks()[1]!.at).toBe(w.c.now().toISOString())
})
test('spec reload follows teams.spec_hash: a valid new spec is adopted; a broken one keeps the old spec and is recorded', async () => {
  const w = dsp(); const st = await w.start()
  const t = w.registry.getTeam('duo')!
  fs.writeFileSync(t.specPath, fs.readFileSync(t.specPath, 'utf8') + 'patrol:\n  no_progress_minutes: 7\n')
  w.registry.upsertTeam({ ...t, specHash: specHash(loadTeamSpec(t.specPath)) })
  await w.once(st); expect(st.spec!.patrol.noProgressMinutes).toBe(7)
  fs.writeFileSync(t.specPath, 'posts: [')
  w.registry.upsertTeam({ ...w.registry.getTeam('duo')!, specHash: 'h'.repeat(64) })
  await w.once(st); expect(st.spec!.patrol.noProgressMinutes).toBe(7)
  expect(w.registry.listPatrolEvents('duo').map((e) => e.action)).toContain('spec_reload_failed')
})
test('task-list failing makes the scan skip (recorded) but lastScanAt still advances', async () => {
  const w = dsp(); const st = await w.start()
  w.c.advance(PATROL_INTERVAL_MS)
  w.o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await w.once(st)
  expect(st.lastScanAt).toBe(w.c.now().getTime())
  expect(w.registry.listPatrolEvents('duo').map((e) => e.action)).toContain('scan_skipped')
})
test('a new day prunes call logs, gate outputs and old patrol events', async () => {
  const w = dsp(); const st = await w.start()
  const logs = path.join(w.deps.home, 'logs'); fs.mkdirSync(path.join(logs, 'duo'), { recursive: true })
  fs.writeFileSync(path.join(logs, '2026-10-01.jsonl'), '')
  const old = path.join(logs, 'duo', 'gate-t-0-1.txt'); fs.writeFileSync(old, 'x'); fs.utimesSync(old, new Date('2026-10-01'), new Date('2026-10-01'))
  // 3A spec §6.4：审计事件同保留 30 天，调度员循环每日也清理一次。
  // fake clock 起点 2026-10-15T10:00:00Z；造一条早于 now-30 天的 audit，跨天后应当被删。
  const now = w.c.now()
  const oldAuditAt = new Date(now.getTime() - 31 * 24 * 3_600_000).toISOString()
  const freshAt = new Date(now.getTime() - 1 * 3_600_000).toISOString()
  w.registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'a@duo', outcome: 'ok', at: oldAuditAt })
  w.registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'a@duo', outcome: 'ok', at: oldAuditAt })
  w.registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'a@duo', outcome: 'ok', at: freshAt })
  const beforeIds = w.registry.listAudit('duo', { limit: 100 }).map((a) => a.id)
  const oldIds = beforeIds.slice(0, 2)
  const freshId = beforeIds[2]
  w.c.advance(24 * 3_600_000); await w.once(st)
  expect(fs.existsSync(path.join(logs, '2026-10-01.jsonl'))).toBe(false); expect(fs.existsSync(old)).toBe(false)
  const remaining = w.registry.listAudit('duo', { limit: 100 })
  expect(remaining.map((a) => a.id)).toContain(freshId)
  for (const id of oldIds) expect(remaining.map((a) => a.id)).not.toContain(id)
  expect(remaining.every((a) => Date.parse(a.at) >= Date.parse(new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString()))).toBe(true)
})
test.each([
  ['unreadable spec file', (p: string) => fs.writeFileSync(p, 'posts: [')],
  ['spec edited after wl up (hash mismatch)', (p: string) => fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + 'patrol:\n  no_progress_minutes: 7\n')],
])('final-review m5: %s at startup does not stop the dispatcher; it records spec_reload_failed once and keeps checking', async (_n, damage) => {
  const w = dsp(); const t = w.registry.getTeam('duo')!
  const original = fs.readFileSync(t.specPath, 'utf8')
  damage(t.specPath)
  const ac = new AbortController(); let checks = 0
  w.o.onCheck = async () => { checks += 1; if (checks === 3) ac.abort() }
  await runDispatcherLoop(w.deps, 'duo', { signal: ac.signal, sleep: w.sleep, waitMs: 1 })
  expect(checks).toBe(3)
  expect(w.registry.listPatrolEvents('duo').filter((e) => e.action === 'spec_reload_failed')).toHaveLength(1)
  expect(w.registry.getLock('dispatcher:duo')).toBeNull()
  // 文件恢复后下一轮自愈
  fs.writeFileSync(t.specPath, original)
  const team = await connectDispatcher(w.deps, 'duo', 'term-dsp', { sleep: w.sleep })
  const st = initialState(w.deps, team, null)
  await w.once(st)
  expect(st.spec).not.toBeNull()
  expect(w.registry.listPatrolEvents('duo').map((e) => e.action)).toContain('spec_reload')
})
test('final-review m5: initialState itself checks a passed spec against teams.spec_hash', async () => {
  const w = dsp(); const t = w.registry.getTeam('duo')!
  fs.writeFileSync(t.specPath, fs.readFileSync(t.specPath, 'utf8') + 'patrol:\n  no_progress_minutes: 7\n')
  const st = initialState(w.deps, t, loadTeamSpec(t.specPath))
  expect(st.spec).toBeNull()
  expect(w.registry.listPatrolEvents('duo').filter((e) => e.action === 'spec_reload_failed')).toEqual([expect.objectContaining({ outcome: 'failed:team_spec_changed' })])
})
test('runDispatcherLoop: outside Orca → dispatcher_not_in_orca; a second one → team_busy; it releases its lock on abort', async () => {
  const w = dsp()
  await expect(runDispatcherLoop({ ...w.deps, env: {} }, 'duo', {})).rejects.toMatchObject({ code: 'dispatcher_not_in_orca' })
  const ac = new AbortController()
  let entered!: () => void; const inLoop = new Promise<void>((r) => { entered = r })
  let gate!: () => void; const hold = new Promise<void>((r) => { gate = r })
  w.o.onCheck = async () => { entered(); await hold }
  const running = runDispatcherLoop(w.deps, 'duo', { signal: ac.signal, sleep: w.sleep, waitMs: 1 })
  await inLoop
  await expect(runDispatcherLoop(w.deps, 'duo', { sleep: w.sleep })).rejects.toMatchObject({ code: 'team_busy' })
  ac.abort(); w.o.onCheck = undefined; gate()
  await running
  expect(w.registry.getLock('dispatcher:duo')).toBeNull()
})
