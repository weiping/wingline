import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry, type PostRow, type TeamRow } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-reg-')), 'sub', 'state.db')

const team: TeamRow = { name: 'duo', specPath: '/s/team.yaml', specHash: 'h'.repeat(64), runId: null, coordinatorHandle: null, status: 'up' }
const post = (over: Partial<PostRow> = {}): PostRow => ({
  address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: null, status: 'offline', isLead: true, ...over,
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
