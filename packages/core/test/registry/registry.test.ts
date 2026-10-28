import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry, type PatrolStateRow, type PostRow, type TeamRow } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-reg-')), 'sub', 'state.db')

const team: TeamRow = { name: 'duo', specPath: '/s/team.yaml', specHash: 'h'.repeat(64), runId: null, coordinatorHandle: null, status: 'up' }
const post = (over: Partial<PostRow> = {}): PostRow => ({
  address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: null, status: 'offline', isLead: true,
  sessionMarker: null, sessionId: null, sessionAt: null, ...over,
})

test('migrates a fresh db (creating its directory) to the latest user_version', () => {
  const file = tmpDb()
  Registry.open(file).close()
  const raw = new DatabaseSync(file)
  expect((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length)
  expect((raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal')
  raw.close()
})

test('reopening does not re-run migrations', () => {
  const file = tmpDb()
  Registry.open(file).close()
  expect(() => Registry.open(file).close()).not.toThrow()
})

test('team and post round trip', () => {
  const r = Registry.open(tmpDb())
  expect(r.getTeam('duo')).toBeNull()
  r.upsertTeam(team)
  r.upsertPost(post())
  r.upsertPost(post({ address: 'checker@duo', isLead: false, agent: 'codex' }))
  expect(r.getTeam('duo')).toEqual(team)
  expect(r.listPosts('duo').map((p) => p.address)).toEqual(['builder@duo', 'checker@duo'])
  expect(r.listPosts('duo')[0]).toEqual(post())
  r.setPostHandle('builder@duo', 'term-1')
  r.setPostStatus('builder@duo', 'live')
  expect(r.listPosts('duo')[0]).toMatchObject({ handle: 'term-1', status: 'live' })
  r.upsertTeam({ ...team, status: 'stopped', runId: 'run-1' })
  expect(r.getTeam('duo')).toMatchObject({ status: 'stopped', runId: 'run-1' })
  r.close()
})

test('foreign keys are enforced: a post needs its team', () => {
  const r = Registry.open(tmpDb())
  expect(() => r.upsertPost(post())).toThrow()
})

test('request lifecycle and 16KB truncation', () => {
  const r = Registry.open(tmpDb())
  expect(r.getRequest('a')).toBeNull()
  r.beginRequest('a')
  expect(r.getRequest('a')).toEqual({ state: 'pending', receipt: null, retryRequest: null, args: null, updatedAt: expect.any(String) })
  r.finishRequest('a', 'done', { blob: 'x'.repeat(40000) })
  const got = r.getRequest('a')!
  expect(got.state).toBe('done')
  expect(got.receipt!.length).toBeLessThanOrEqual(16384)
})

test('beginRequest on a done request throws; on uncertain it restarts as pending', () => {
  const r = Registry.open(tmpDb())
  r.beginRequest('a')
  r.finishRequest('a', 'uncertain')
  r.beginRequest('a')
  expect(r.getRequest('a')!.state).toBe('pending')
  r.finishRequest('a', 'done')
  expect(() => r.beginRequest('a')).toThrow(expect.objectContaining({ kind: 'internal', code: 'request_already_done' }))
})

test('withTeamLock rejects a second holder while the first is alive, and releases afterwards', async () => {
  const file = tmpDb()
  const a = Registry.open(file)
  const b = Registry.open(file)
  await a.withTeamLock('duo', async () => {
    await expect(b.withTeamLock('duo', () => 1)).rejects.toMatchObject({ kind: 'input', code: 'team_busy' })
    await expect(a.withTeamLock('duo', () => 1)).rejects.toMatchObject({ code: 'team_busy' })
  })
  expect(await b.withTeamLock('duo', () => 'ok')).toBe('ok')
})

test('withTeamLock releases the lock when fn throws', async () => {
  const r = Registry.open(tmpDb())
  await expect(r.withTeamLock('duo', () => { throw new Error('boom') })).rejects.toThrow('boom')
  expect(await r.withTeamLock('duo', () => 'again')).toBe('again')
})

test('different teams do not block each other', async () => {
  const r = Registry.open(tmpDb())
  await r.withTeamLock('a', async () => {
    expect(await r.withTeamLock('b', () => 'ok')).toBe('ok')
  })
})

test('stale lock from a dead pid is taken over', async () => {
  const file = tmpDb()
  const r = Registry.open(file)
  const dead = 2 ** 22 - 1 // 超出常见 pid_max 的值，进程必不存在
  const raw = new DatabaseSync(file)
  raw.prepare('INSERT INTO locks(team, pid, at) VALUES (?, ?, ?)').run('duo', dead, new Date().toISOString())
  raw.close()
  expect(await r.withTeamLock('duo', () => 'took over')).toBe('took over')
})

test('listTeams and getPost', () => {
  const r = Registry.open(tmpDb())
  r.upsertTeam(team)
  r.upsertTeam({ ...team, name: 'alpha' })
  r.upsertPost(post())
  expect(r.listTeams().map((t) => t.name)).toEqual(['alpha', 'duo'])
  expect(r.getPost('builder@duo')).toEqual(post())
  expect(r.getPost('ghost@duo')).toBeNull()
})

const running: TeamRow = { ...team, runId: 'run-1', coordinatorHandle: 'coord-1' }

test('teams round-trips coordinatorHandle; updateCoordinatorHandle touches only that column', () => {
  const r = Registry.open(tmpDb())
  r.upsertTeam(running)
  r.upsertTeam({ ...running, status: 'stopped' })              // 另一个进程刚 wl down
  r.updateCoordinatorHandle('duo', 'coord-2')
  expect(r.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'coord-2', status: 'stopped' })
  r.setRunId('duo', null)
  expect(r.getTeam('duo')).toMatchObject({ runId: null, coordinatorHandle: 'coord-2', status: 'stopped' })
})
test('intent ledger: open is insert-if-absent, reissue replaces id+args, drop deletes, listOpenRequests filters by prefix', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('dispatch:t1:0', 'id-1', { a: 1 })
  r.openIntent('dispatch:t1:0', 'id-2', { a: 2 })   // 已存在：不覆盖
  expect(r.getRequest('dispatch:t1:0')).toMatchObject({ state: 'pending', receipt: null, retryRequest: 'id-1', args: JSON.stringify({ a: 1 }) })
  r.finishRequest('dispatch:t1:0', 'uncertain', { error: 'timeout' })
  r.openIntent('done:t2:0:report', 'id-9', {})
  expect(r.listOpenRequests('dispatch:t1:').map((x) => x.id)).toEqual(['dispatch:t1:0'])
  r.reissueIntent('dispatch:t1:0', 'id-3', { a: 3 })
  expect(r.getRequest('dispatch:t1:0')).toMatchObject({ state: 'pending', retryRequest: 'id-3', args: JSON.stringify({ a: 3 }), receipt: null })
  r.dropRequest('dispatch:t1:0')
  expect(r.getRequest('dispatch:t1:0')).toBeNull()
})
test('insertTaskExt is idempotent (a replayed Orca result lands on an existing row)', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo', readySince: '2026-10-15T00:00:00.000Z' })
  expect(() => r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'review' })).not.toThrow()
  expect(r.getTaskExt('t1')).toEqual({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', epoch: 0, gateFailures: 0, readySince: '2026-10-15T00:00:00.000Z', dispatchedAt: null })
})
// 复审四 A-I6：Orca 界面里直接建的任务没有 task_ext 行，setter 不能静默影响 0 行
test('every task_ext setter inserts a default row when none exists', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.setClaimedBy('duo', 'ui-1', 'builder@duo')
  r.setPlan('duo', 'ui-2', 'p')
  expect(r.incrementGateFailures('duo', 'ui-3')).toBe(1)
  r.setReadySince('duo', 'ui-4', 'T'); r.setDispatchedAt('duo', 'ui-5', 'T')
  expect(r.bumpEpoch('duo', 'ui-6', 0, false)).toBe(1)
  expect(r.getTaskExt('ui-1')).toMatchObject({ team: 'duo', kind: 'work', tags: [], claimedBy: 'builder@duo', epoch: 0 })
  expect(r.getTaskExt('ui-2')!.plan).toBe('p')
  expect(r.getTaskExt('ui-6')!.epoch).toBe(1)
})
test('bumpEpoch is compare-and-set: a second bump from the same epoch does nothing and reports the current epoch', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  r.incrementGateFailures('duo', 't1'); r.incrementGateFailures('duo', 't1')
  expect(r.bumpEpoch('duo', 't1', 0, true)).toBe(1)
  expect(r.bumpEpoch('duo', 't1', 0, true)).toBe(1)              // 另一个进程已经加过
  expect(r.getTaskExt('t1')).toMatchObject({ epoch: 1, gateFailures: 0 })
})
test('recordVerdict: first writer wins; escalate also pins gate_failures in the same transaction', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  const base = { taskId: 't1', epoch: 0, post: 'builder@duo', dispatchId: 'ctx-1', reportFrom: 'term-b', body: 'out' }
  const first = r.recordVerdict({ ...base, verdict: 'escalate', gateFailures: 3 })
  expect(r.recordVerdict({ ...base, verdict: 'passed', gateFailures: 0 })).toEqual(first)
  expect(first).toMatchObject({ verdict: 'escalate', gateFailures: 3, result: null, finishedAt: null, createdAt: expect.any(String) })
  expect(r.getTaskExt('t1')!.gateFailures).toBe(3)
  expect(r.listUnfinishedVerdicts('duo').map((v) => v.taskId)).toEqual(['t1'])
  r.finishVerdict('t1', 0, { outcome: 'escalated' })
  expect(r.getVerdict('t1', 0)).toMatchObject({ result: JSON.stringify({ outcome: 'escalated' }), finishedAt: expect.any(String) })
  expect(r.listUnfinishedVerdicts('duo')).toEqual([])
})
test('a bypassed verdict stores empty dispatch id and report-from', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  const v = r.recordVerdict({ taskId: 't1', epoch: 0, post: 'builder@duo', verdict: 'bypassed', gateFailures: 0, dispatchId: '', reportFrom: '', body: null })
  expect(v).toMatchObject({ verdict: 'bypassed', dispatchId: '', reportFrom: '' })
  expect(r.listVerdictsOf('t1')).toHaveLength(1)
})
test('gates map gate id to team and task; recordGate is idempotent', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.recordGate('gate-1', 'duo', 't1')
  expect(() => r.recordGate('gate-1', 'duo', 't1')).not.toThrow()
  expect(r.getGate('gate-1')).toEqual({ team: 'duo', taskId: 't1' })
  expect(r.listGates('duo')).toEqual([{ gateId: 'gate-1', taskId: 't1' }])
  expect(r.getGate('ghost')).toBeNull()
})
test('task_log is append-only and ordered; object detail is stored as JSON', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'human', actorSource: 'human', action: 'create' })
  r.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'builder@duo', actorSource: 'implicit', action: 'start', detail: { delivery: 'self' } })
  expect(r.listTaskLog('t1').map((x) => [x.action, x.actorSource, x.detail])).toEqual([['create', 'human', null], ['start', 'implicit', '{"delivery":"self"}']])
})
test('listOpenRequests returns only pending/uncertain rows and matches the prefix literally', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('dispatch:t1:0', 'a', {}); r.openIntent('dispatch:t1:1', 'b', {}); r.openIntent('dispatch:t1:2', 'c', {})
  r.openIntent('dispatch:t10:0', 'd', {})
  r.finishRequest('dispatch:t1:1', 'uncertain')
  r.finishRequest('dispatch:t1:2', 'done')
  const open = r.listOpenRequests('dispatch:t1:')
  expect(open.map((x) => [x.id, x.state])).toEqual([['dispatch:t1:0', 'pending'], ['dispatch:t1:1', 'uncertain']])
  expect(open[0]!.updatedAt).toEqual(expect.any(String))
})
test('bumpEpoch keeps gate_failures unless asked to reset; a passed verdict leaves task_ext.gate_failures alone', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.incrementGateFailures('duo', 't1')
  expect(r.bumpEpoch('duo', 't1', 0, false)).toBe(1)
  expect(r.getTaskExt('t1')).toMatchObject({ epoch: 1, gateFailures: 1 })
  r.recordVerdict({ taskId: 't1', epoch: 1, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'c', reportFrom: 'x', body: null })
  expect(r.getTaskExt('t1')!.gateFailures).toBe(1)
})
test('verdicts of different epochs coexist and are listed per task', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  const v = { taskId: 't1', post: 'builder@duo', verdict: 'passed' as const, gateFailures: 0, dispatchId: 'c', reportFrom: 'x', body: null }
  r.recordVerdict({ ...v, epoch: 0 }); r.recordVerdict({ ...v, epoch: 1 })
  expect(r.listVerdictsOf('t1').map((x) => x.epoch)).toEqual([0, 1])
  expect(r.getVerdict('t1', 2)).toBeNull()
})
test('reopening keeps data written to the new tables (migrations are not re-applied)', () => {
  const file = tmpDb()
  const a = Registry.open(file); a.upsertTeam(running)
  a.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['x'], kind: 'work' })
  a.recordGate('g1', 'duo', 't1')
  a.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'human', actorSource: 'human', action: 'create' })
  a.close()
  const b = Registry.open(file)
  expect(b.getTaskExt('t1')!.tags).toEqual(['x'])
  expect(b.getGate('g1')).not.toBeNull()
  expect(b.listTaskLog('t1')).toHaveLength(1)
})

test('listOpenRequests treats _ and % in the prefix literally (not as LIKE wildcards)', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('dispatch:t_1:0', 'a', {}); r.openIntent('dispatch:tx1:0', 'b', {}); r.openIntent('dispatch:t%1:0', 'c', {})
  expect(r.listOpenRequests('dispatch:t_1:').map((x) => x.id)).toEqual(['dispatch:t_1:0'])
  expect(r.listOpenRequests('dispatch:t%').map((x) => x.id)).toEqual(['dispatch:t%1:0'])
  expect(r.listOpenRequests('DISPATCH:').map((x) => x.id)).toEqual([])
})

test('a phase-1 database (user_version 1, with rows) upgrades in place and keeps its data', () => {
  const file = tmpDb()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  raw.exec(MIGRATIONS[0]!)
  raw.exec('PRAGMA user_version = 1')
  raw.prepare("INSERT INTO teams(name, spec_path, spec_hash, run_id, status, updated_at) VALUES ('duo','/s','h',NULL,'up','T')").run()
  raw.prepare("INSERT INTO requests(id, state, receipt, updated_at) VALUES ('old','done','{}','T')").run()
  raw.close()
  const r = Registry.open(file)
  expect(r.getTeam('duo')).toMatchObject({ name: 'duo', coordinatorHandle: null, status: 'up' })
  expect(r.getRequest('old')).toMatchObject({ state: 'done', receipt: '{}', retryRequest: null, args: null })
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  expect(r.getTaskExt('t1')).not.toBeNull()
})

test('N6: reissueIntent with expectedOld is compare-and-swap: a stale expectation changes nothing and reports false; a matching one swaps and reports true', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('k', 'id-1', { a: 1 })
  expect(r.reissueIntent('k', 'id-2', { a: 2 }, 'not-the-current-id')).toBe(false)
  expect(r.getRequest('k')).toMatchObject({ retryRequest: 'id-1', args: JSON.stringify({ a: 1 }) })
  expect(r.reissueIntent('k', 'id-2', { a: 2 }, 'id-1')).toBe(true)
  expect(r.getRequest('k')).toMatchObject({ state: 'pending', retryRequest: 'id-2', args: JSON.stringify({ a: 2 }) })
  expect(r.reissueIntent('missing', 'x', {}, 'y')).toBe(false)
})

test('A-M4: a second opener that lost the migration race re-reads user_version after taking the write lock and does not re-run migration 2', async () => {
  const file = tmpDb(); fs.mkdirSync(path.dirname(file), { recursive: true })
  const phase1 = new DatabaseSync(file); phase1.exec(MIGRATIONS[0]!); phase1.exec('PRAGMA user_version = 1'); phase1.close()
  // opener A (another process) holds BEGIN IMMEDIATE with migration 2 applied but not yet committed
  const script = `
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(process.argv[1])
    db.exec('PRAGMA busy_timeout = 5000'); db.exec('PRAGMA journal_mode = WAL')
    db.exec('BEGIN IMMEDIATE'); db.exec(process.argv[2]); db.exec('PRAGMA user_version = 2')
    console.log('locked')
    setTimeout(() => { db.exec('COMMIT'); db.close() }, 700)`
  const child = spawn(process.execPath, ['-e', script, file, MIGRATIONS[1]!], { stdio: ['ignore', 'pipe', 'inherit'] })
  const exited = new Promise<number | null>((res) => child.on('exit', res))
  await new Promise<void>((res, rej) => { child.stdout.once('data', () => res()); child.once('error', rej) })
  // opener B reads user_version = 1 (A has not committed), then waits for the lock; it must not re-apply the migration
  const b = Registry.open(file)
  expect(b.getTeam('nobody')).toBeNull()
  b.close()
  expect(await exited).toBe(0)
  const raw = new DatabaseSync(file)
  expect((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length)
  raw.close()
})

test('4-a: a database written by a newer wingline (user_version above this code\'s migrations) is refused with registry_too_new, not opened silently; the current version still opens', () => {
  const file = tmpDb(); fs.mkdirSync(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  for (const m of MIGRATIONS) raw.exec(m)
  raw.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
  raw.close()
  expect(() => Registry.open(file)).toThrow(expect.objectContaining({ code: 'registry_too_new', hint: expect.any(String) }))
  const ok = tmpDb(); Registry.open(ok).close()
  expect(() => Registry.open(ok).close()).not.toThrow()
})

// ---- 阶段 2B：心跳、巡查状态、冻结、静默、游标、提问、巡查事件 ----
const running2b: TeamRow = { ...team, runId: 'run-1', coordinatorHandle: 'coord-1' }
test('withTeamLock with takeoverAfterMs takes over only after the long threshold; the superseded holder learns it from heartbeat()', async () => {
  let t = Date.parse('2026-10-15T10:00:00Z')
  const r = Registry.open(tmpDb(), { now: () => new Date(t) })
  let release!: () => void
  const held = r.withTeamLock('dispatcher:duo', () => new Promise<void>((res) => { release = res }), { takeoverAfterMs: 600_000 })
  r.heartbeat('dispatcher:duo')
  t += 181_000
  await expect(r.withTeamLock('dispatcher:duo', () => 1, { takeoverAfterMs: 600_000 })).rejects.toMatchObject({ code: 'team_busy' })
  t += 420_000
  let inner = false
  await r.withTeamLock('dispatcher:duo', () => { inner = r.heartbeat('dispatcher:duo') }, { takeoverAfterMs: 600_000 })
  expect(inner).toBe(true)
  release(); await held
})
test('heartbeat() reports false when this process does not hold the row', () => {
  const r = Registry.open(tmpDb())
  expect(r.heartbeat('dispatcher:duo')).toBe(false)
})
test('heartbeat updates only the row this process holds; getLock exposes it', async () => {
  const r = Registry.open(tmpDb())
  await r.withTeamLock('dispatcher:duo', () => { r.heartbeat('dispatcher:duo'); expect(r.getLock('dispatcher:duo')).toMatchObject({ pid: process.pid, heartbeatAt: expect.any(String) }) })
  expect(r.getLock('dispatcher:duo')).toBeNull()
})
test('patrol_state is keyed by (team, post, signal, task) and round-trips every column', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running2b)
  const row: PatrolStateRow = { team: 'duo', post: 'builder@duo', signal: 'no_progress', taskId: 't1', level: 1, since: 'A', levelAt: 'B', lastNudgedAt: 'B', notifyCount: 0, nextDueAt: null, clearedAt: null }
  r.putPatrolState(row); r.putPatrolState({ ...row, taskId: 't2', level: 0 }); r.putPatrolState({ ...row, signal: 'gate_streak', taskId: '' })
  expect(r.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')).toEqual({ ...row, detail: null }) // 读出来的行总带 detail（普通信号为 null）
  expect(r.listPatrolState('duo')).toHaveLength(3)
  r.putPatrolState({ ...row, level: 2, notifyCount: 1, clearedAt: 'C' })
  expect(r.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')).toMatchObject({ level: 2, notifyCount: 1, clearedAt: 'C' })
})
test('freeze is idempotent and records the signal; hush/unhush; cursor', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running2b)
  r.freezePost({ post: 'builder@duo', team: 'duo', reason: 'patrol', signal: 'no_progress' })
  r.freezePost({ post: 'builder@duo', team: 'duo', reason: 'again' })
  expect(r.getFrozen('builder@duo')).toMatchObject({ reason: 'patrol', signal: 'no_progress' })
  expect(r.listFrozen('duo').map((f) => f.post)).toEqual(['builder@duo'])
  r.unfreezePost('builder@duo'); expect(r.getFrozen('builder@duo')).toBeNull()
  r.hush('duo', 'checker@duo', 'U'); expect(r.hushedUntil('checker@duo')).toBe('U')
  expect(r.listHushes('duo')).toEqual([{ post: 'checker@duo', until: 'U' }])
  r.unhush('checker@duo'); expect(r.hushedUntil('checker@duo')).toBeNull()
  expect(r.getCursor('builder@duo')).toBeNull(); r.setCursor('duo', 'builder@duo', 'T'); expect(r.getCursor('builder@duo')).toBe('T')
})
test('questions: insert-if-absent, open list, answer', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running2b)
  const q = { team: 'duo', messageId: 'msg-1', taskId: 't1', dispatchId: 'ctx-1', asker: 'checker@duo', body: '用哪个？', options: ['a', 'b'], relayedAt: 'T' }
  expect(r.recordQuestion(q)).toBe(true); expect(r.recordQuestion(q)).toBe(false)
  expect(r.listOpenQuestions('duo').map((x) => x.messageId)).toEqual(['msg-1'])
  r.answerQuestion('msg-1', 'T2')
  expect(r.listOpenQuestions('duo')).toEqual([]); expect(r.getQuestion('msg-1')!.answeredAt).toBe('T2')
})
test('patrol_events: message_id is unique per team (dedupe); events without one never conflict; prune', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running2b)
  expect(r.appendPatrolEvent({ team: 'duo', action: 'relay', messageId: 'msg-1' })).toBe(true)
  expect(r.appendPatrolEvent({ team: 'duo', action: 'relay', messageId: 'msg-1' })).toBe(false)
  expect(r.appendPatrolEvent({ team: 'duo', action: 'wake' })).toBe(true)
  expect(r.appendPatrolEvent({ team: 'duo', action: 'wake' })).toBe(true)
  expect(r.listPatrolEvents('duo')).toHaveLength(3)
  expect(r.prunePatrolEvents('9999')).toBe(3)
})
test('listFinishedVerdictsAfter: only finished rows after the cursor, oldest first', () => {
  let t = Date.parse('2026-10-15T10:00:00Z')
  const r = Registry.open(tmpDb(), { now: () => new Date(t) }); r.upsertTeam(running2b)
  for (const id of ['a', 'b', 'c']) {
    r.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work' })
    r.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'escalate', gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null })
  }
  r.finishVerdict('a', 0, {}); t += 1000; const cut = new Date(t).toISOString(); t += 1000; r.finishVerdict('b', 0, {})
  expect(r.listFinishedVerdictsAfter('builder@duo', null).map((v) => v.taskId)).toEqual(['a', 'b'])
  expect(r.listFinishedVerdictsAfter('builder@duo', cut).map((v) => v.taskId)).toEqual(['b'])
})
test('listDeliveries reads the done:*:delivered:<target> ledger rows', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running2b)
  r.claimRequest('done:t1:0:delivered:checker@duo', { target: 'checker@duo', taskId: 'c1', delivery: 'skipped_frozen' })
  r.claimRequest('done:t2:0:delivered:builder@duo', { target: 'builder@duo', taskId: 'c2', delivery: 'sent' })
  expect(r.listDeliveries('checker@duo')).toEqual([{ key: 'done:t1:0:delivered:checker@duo', target: 'checker@duo', taskId: 'c1', delivery: 'skipped_frozen', at: expect.any(String) }])
  expect(r.listDeliveries('checker@duo', '9999')).toEqual([])
})

// ---- 阶段 3A：会话列、审计事件、afterId 游标 ----
const seededRegistry = () => {
  const r = Registry.open(tmpDb())
  r.upsertTeam(running2b)
  r.upsertPost(post())
  return r
}

test('setSessionMarker stores marker and time and clears a cached session id', () => {
  const r = seededRegistry()
  r.setSessionId('builder@duo', 'old-id')
  expect(r.getPost('builder@duo')).toMatchObject({ sessionId: 'old-id' })
  r.setSessionMarker('builder@duo', 'WLS-0a1b2c3d', '2026-10-16T00:00:00.000Z')
  expect(r.getPost('builder@duo')).toMatchObject({ sessionMarker: 'WLS-0a1b2c3d', sessionId: null, sessionAt: '2026-10-16T00:00:00.000Z' })
  r.close()
})

test('audit rows round-trip; limit keeps the newest n in ascending order; afterId pages forward', () => {
  const r = seededRegistry()
  for (let i = 1; i <= 5; i++) r.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok', detail: { i } })
  expect(r.listAudit('duo').map((a) => a.id)).toEqual([1, 2, 3, 4, 5])
  expect(r.listAudit('duo', { limit: 2 }).map((a) => JSON.parse(a.detail!).i)).toEqual([4, 5])
  expect(r.listAudit('duo', { afterId: 3 }).map((a) => a.id)).toEqual([4, 5])
  expect(r.listAudit('other')).toEqual([])
  r.close()
})

test('afterId + limit pages forward from the cursor (earliest rows first), so a long gap never skips rows', () => {
  const r = seededRegistry()
  // 行数取小：Windows 上逐行落盘很慢，分页逻辑与行数无关
  for (let i = 1; i <= 30; i++) r.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: null, outcome: 'ok' })
  expect(r.listAudit('duo', { limit: 10 })[0]!.id).toBe(21)
  const page = r.listAudit('duo', { afterId: 5, limit: 10 })
  expect([page[0]!.id, page[page.length - 1]!.id, page.length]).toEqual([6, 15, 10])
  expect(r.listAudit('duo', { afterId: 0, limit: 3 }).map((a) => a.id)).toEqual([1, 2, 3])
  r.close()
})

test('pruneAudit deletes rows older than the cutoff', () => {
  const r = seededRegistry()
  r.appendAudit({ team: 'duo', at: '2026-09-01T00:00:00.000Z', actor: 'human', command: 'send', target: null, outcome: 'ok' })
  r.appendAudit({ team: 'duo', at: '2026-10-01T00:00:00.000Z', actor: 'human', command: 'send', target: null, outcome: 'ok' })
  expect(r.pruneAudit('2026-09-15T00:00:00.000Z')).toBe(1)
  expect(r.listAudit('duo').map((a) => a.at)).toEqual(['2026-10-01T00:00:00.000Z'])
  r.close()
})

test('pruneAudit with a team only deletes that team rows; without it deletes every team', () => {
  const r = seededRegistry()
  r.appendAudit({ team: 'duo', at: '2026-09-01T00:00:00.000Z', actor: 'human', command: 'send', target: null, outcome: 'ok' })
  r.appendAudit({ team: 'solo', at: '2026-09-01T00:00:00.000Z', actor: 'human', command: 'send', target: null, outcome: 'ok' })
  expect(r.pruneAudit('2026-09-15T00:00:00.000Z', 'duo')).toBe(1)
  expect(r.listAudit('solo')).toHaveLength(1)
  expect(r.listAudit('duo')).toHaveLength(0)
  expect(r.pruneAudit('2026-09-15T00:00:00.000Z', 'solo')).toBe(1)
  expect(r.listAudit('solo')).toHaveLength(0)
  r.close()
})

test('listTeamTaskLog and listPatrolEvents accept afterId', () => {
  const r = seededRegistry()
  for (let i = 0; i < 3; i++) r.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'human', actorSource: 'human', action: 'create' })
  for (let i = 0; i < 3; i++) r.appendPatrolEvent({ team: 'duo', action: 'wake' })
  expect(r.listTeamTaskLog('duo', { afterId: 1 }).map((x) => x.id)).toEqual([2, 3])
  expect(r.listPatrolEvents('duo', { afterId: 1 }).map((x) => x.id)).toEqual([2, 3])
  r.close()
})

test('maxEventIds: newest id per source for one team, 0 where there is nothing, other teams ignored', () => {
  const r = Registry.open(':memory:')
  expect(r.maxEventIds('duo')).toEqual({ task: 0, patrol: 0, command: 0 })
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  r.upsertTeam({ name: 'solo', specPath: '/s2', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  r.appendAudit({ team: 'duo', actor: 'a', command: 'c', target: null, outcome: 'ok' })
  r.appendAudit({ team: 'duo', actor: 'a', command: 'c', target: null, outcome: 'ok' })
  r.appendAudit({ team: 'solo', actor: 'a', command: 'c', target: null, outcome: 'ok' })
  r.appendPatrolEvent({ team: 'duo', post: 'p', signal: 's', taskId: 't', action: 'a' })
  const m = r.maxEventIds('duo')
  expect(m.command).toBe(r.listAudit('duo').at(-1)!.id)
  expect(m.patrol).toBe(r.listPatrolEvents('duo').at(-1)!.id)
  expect(m.task).toBe(0)
  expect(r.maxEventIds('solo').command).toBe(r.listAudit('solo').at(-1)!.id)
})

test('pruneFinishedState drops cleared patrol rows, answered questions and settled task ledger rows, but keeps pending rows, generational keys and deliveries', () => {
  const r = Registry.open(':memory:', { now: () => new Date('2026-09-01T00:00:00.000Z') })
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  const OLD = '2026-09-01T00:00:00.000Z'
  const row = (over: Partial<PatrolStateRow> = {}): PatrolStateRow => ({
    team: 'duo', post: 'builder@duo', signal: 'no_progress', taskId: 't1', level: 0, since: 'A', levelAt: 'A',
    lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, ...over,
  })
  r.putPatrolState(row({ clearedAt: OLD }))                                        // 清除已久 → 删
  r.putPatrolState(row({ signal: 'overdue', taskId: 't2' }))                        // 仍活跃 → 留
  r.putPatrolState(row({ signal: 'usage_limit', taskId: '', clearedAt: OLD }))      // 画面信号清了也删
  r.recordQuestion({ team: 'duo', messageId: 'q-old', taskId: 't1', dispatchId: 'd', asker: 'a', body: 'b', options: [], relayedAt: OLD })
  r.answerQuestion('q-old', OLD)                                                    // 已回答且过保留期 → 删
  r.recordQuestion({ team: 'duo', messageId: 'q-open', taskId: 't2', dispatchId: 'd', asker: 'a', body: 'b', options: [], relayedAt: OLD })
  r.beginRequest('dispatch:t1:0'); r.finishRequest('dispatch:t1:0', 'done', {})      // 已定案 → 删
  r.beginRequest('oneshot:x1')                                                      // pending → 留
  r.beginRequest('done:t0:0:delivered:builder@duo'); r.finishRequest('done:t0:0:delivered:builder@duo', 'done', {}) // 交付行 → 留
  r.beginRequest('restore:duo:builder:0:create'); r.finishRequest('restore:duo:builder:0:create', 'done', {})       // 代数键 → 留
  r.pruneFinishedState('2026-10-01T00:00:00.000Z')
  expect(r.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')).toBeNull()
  expect(r.getPatrolState('duo', 'builder@duo', 'overdue', 't2')).not.toBeNull()
  expect(r.getPatrolState('duo', 'builder@duo', 'usage_limit', '')).toBeNull()
  expect(r.getQuestion('q-old')).toBeNull()
  expect(r.getQuestion('q-open')).not.toBeNull()
  expect(r.getRequest('dispatch:t1:0')).toBeNull()
  expect(r.getRequest('oneshot:x1')).not.toBeNull()
  expect(r.getRequest('done:t0:0:delivered:builder@duo')).not.toBeNull()
  expect(r.getRequest('restore:duo:builder:0:create')).not.toBeNull()
  r.close()
})

test('lastNotifyEventOf finds the newest notify of one subject regardless of newer events, treating NULL task_id as empty', () => {
  const r = Registry.open(':memory:')
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  r.appendPatrolEvent({ team: 'duo', post: 'b@duo', signal: 'no_progress', taskId: 't1', action: 'notify', detail: { command: 'old' } })
  r.appendPatrolEvent({ team: 'duo', post: 'b@duo', signal: 'no_progress', taskId: 't2', action: 'notify', detail: { command: 'other task' } })
  r.appendPatrolEvent({ team: 'duo', post: 'b@duo', signal: 'no_progress', taskId: 't1', action: 'notify', detail: { command: 'new' } })
  for (let i = 0; i < 600; i++) r.appendPatrolEvent({ team: 'duo', action: 'check_ok' })
  expect((r.lastNotifyEventOf('duo', 'b@duo', 'no_progress', 't1')!.detail as { command: string }).command).toBe('new')
  expect((r.lastNotifyEventOf('duo', 'b@duo', 'no_progress', 't2')!.detail as { command: string }).command).toBe('other task')
  r.appendPatrolEvent({ team: 'duo', post: 'c@duo', signal: 'usage_limit', taskId: null, action: 'notify', detail: { command: 'usage' } })
  expect((r.lastNotifyEventOf('duo', 'c@duo', 'usage_limit', '')!.detail as { command: string }).command).toBe('usage')
  expect(r.lastNotifyEventOf('duo', 'b@duo', 'waiting_answer', 't1')).toBeNull()
  r.close()
})

