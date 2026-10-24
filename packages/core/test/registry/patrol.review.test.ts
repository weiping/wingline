// 审查方测试（spec 第 2.2、4、6.1、6.6、7 节）：注册表边界。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry, type TeamRow } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-rev-')), 'state.db')
const team: TeamRow = { name: 'duo', specPath: '/s/team.yaml', specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up' }
const T0 = Date.parse('2026-10-15T10:00:00Z')
const KEY = 'dispatcher:duo'

/** 另一个"活着的"进程：测试进程的父进程（vitest worker 的父进程存活且 pid 不同）。 */
const otherLivePid = () => process.ppid
/** 一个已经退出的进程的 pid。 */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid!

function forgeLock(file: string, pid: number, at: string, heartbeatAt: string | null) {
  const raw = new DatabaseSync(file)
  raw.prepare('INSERT OR REPLACE INTO locks(team, pid, at, heartbeat_at) VALUES (?, ?, ?, ?)').run(KEY, pid, at, heartbeatAt)
  raw.close()
}

function world() {
  let t = T0
  const file = tmpDb()
  const r = Registry.open(file, { now: () => new Date(t) })
  r.upsertTeam(team)
  return { r, file, advance: (ms: number) => { t += ms }, iso: (ms = 0) => new Date(t + ms).toISOString() }
}

test('heartbeat() is false when another live process holds the dispatcher row, and it does not touch that row', () => {
  const w = world()
  const hb = w.iso(-1000)
  forgeLock(w.file, otherLivePid(), hb, hb)
  expect(w.r.heartbeat(KEY)).toBe(false)
  expect(w.r.getLock(KEY)).toMatchObject({ pid: otherLivePid(), heartbeatAt: hb })
})

test('takeover (spec 2.2): another live pid with a fresh heartbeat → team_busy; at exactly 600 s still busy; past 600 s → taken over', async () => {
  const w = world()
  forgeLock(w.file, otherLivePid(), w.iso(), w.iso())
  await expect(w.r.withTeamLock(KEY, () => 1, { takeoverAfterMs: 600_000 })).rejects.toMatchObject({ code: 'team_busy' })
  w.advance(600_000)
  await expect(w.r.withTeamLock(KEY, () => 1, { takeoverAfterMs: 600_000 })).rejects.toMatchObject({ code: 'team_busy' })
  w.advance(1)
  await expect(w.r.withTeamLock(KEY, () => w.r.heartbeat(KEY), { takeoverAfterMs: 600_000 })).resolves.toBe(true)
})

test('takeover reads heartbeat_at, not the acquisition time: an old lock with a recent heartbeat is not taken over', async () => {
  const w = world()
  forgeLock(w.file, otherLivePid(), w.iso(-3_600_000), w.iso(-10_000))
  await expect(w.r.withTeamLock(KEY, () => 1, { takeoverAfterMs: 600_000 })).rejects.toMatchObject({ code: 'team_busy' })
})

test('a dead holder is taken over at once even if its heartbeat is fresh', async () => {
  const w = world()
  forgeLock(w.file, deadPid(), w.iso(), w.iso())
  await expect(w.r.withTeamLock(KEY, () => 'mine', { takeoverAfterMs: 600_000 })).resolves.toBe('mine')
})

test('without takeoverAfterMs (phase 1 team locks) an ancient heartbeat from a live pid still blocks', async () => {
  const w = world()
  forgeLock(w.file, otherLivePid(), w.iso(-86_400_000), w.iso(-86_400_000))
  await expect(w.r.withTeamLock(KEY, () => 1)).rejects.toMatchObject({ code: 'team_busy' })
})

test('releasing a superseded lock does not delete the new holder\'s row', async () => {
  const w = world()
  await w.r.withTeamLock(KEY, () => { forgeLock(w.file, otherLivePid(), w.iso(), w.iso()) }, { takeoverAfterMs: 600_000 })
  expect(w.r.getLock(KEY)!.pid).toBe(otherLivePid())
})

test('the dispatcher lock and the team lock are independent keys', async () => {
  const w = world()
  await w.r.withTeamLock(KEY, () => w.r.withTeamLock('duo', () => 'both'), { takeoverAfterMs: 600_000 })
  expect(w.r.getLock(KEY)).toBeNull()
})

test('patrol_events dedupe is per team: the same message id in another team is a different message', () => {
  const w = world()
  expect(w.r.appendPatrolEvent({ team: 'duo', action: 'inbox', messageId: 'msg-1' })).toBe(true)
  expect(w.r.appendPatrolEvent({ team: 'solo', action: 'inbox', messageId: 'msg-1' })).toBe(true)
  expect(w.r.appendPatrolEvent({ team: 'duo', action: 'relay', messageId: 'msg-1' })).toBe(false)
})

test('patrol_events: detail round-trips as JSON, events are ascending, since/limit return the latest ones', () => {
  const w = world()
  w.r.appendPatrolEvent({ team: 'duo', action: 'a', detail: { command: 'wl task recover t1' } })
  w.advance(1000); w.r.appendPatrolEvent({ team: 'duo', action: 'b' })
  w.advance(1000); w.r.appendPatrolEvent({ team: 'duo', action: 'c' })
  const all = w.r.listPatrolEvents('duo')
  expect(all.map((e) => e.action)).toEqual(['a', 'b', 'c'])
  expect(JSON.stringify(all[0]!.detail)).toContain('wl task recover t1')
  expect(w.r.listPatrolEvents('duo', { limit: 1 }).map((e) => e.action)).toEqual(['c'])
  expect(w.r.listPatrolEvents('duo', { since: w.iso(-1000) }).map((e) => e.action)).toEqual(['b', 'c'])
})

test('prunePatrolEvents removes only rows strictly older than the cutoff', () => {
  const w = world()
  w.r.appendPatrolEvent({ team: 'duo', action: 'old' })
  w.advance(31 * 86_400_000)
  w.r.appendPatrolEvent({ team: 'duo', action: 'new' })
  expect(w.r.prunePatrolEvents(w.iso(-30 * 86_400_000))).toBe(1)
  expect(w.r.listPatrolEvents('duo').map((e) => e.action)).toEqual(['new'])
})

test('hush upsert extends the deadline; listHushes is per team', () => {
  const w = world()
  w.r.hush('duo', 'checker@duo', 'A'); w.r.hush('duo', 'checker@duo', 'B')
  expect(w.r.hushedUntil('checker@duo')).toBe('B')
  expect(w.r.listHushes('duo')).toEqual([{ post: 'checker@duo', until: 'B' }])
  expect(w.r.listHushes('solo')).toEqual([])
})

test('questions: options default to [] and a question without task/dispatch round-trips', () => {
  const w = world()
  expect(w.r.recordQuestion({ team: 'duo', messageId: 'm', taskId: null, dispatchId: null, asker: '未知岗位（任务 t9）', body: 'b', options: [], relayedAt: 'T' })).toBe(true)
  expect(w.r.getQuestion('m')).toEqual({ team: 'duo', messageId: 'm', taskId: null, dispatchId: null, asker: '未知岗位（任务 t9）', body: 'b', options: [], relayedAt: 'T', answeredAt: null })
  expect(w.r.getQuestion('ghost')).toBeNull()
})

test('listFinishedVerdictsAfter ignores unfinished verdicts and other posts', () => {
  const w = world()
  const rec = (id: string, post: string) => w.r.recordVerdict({ taskId: id, epoch: 0, post, verdict: 'escalate', gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null })
  rec('a', 'builder@duo'); rec('b', 'builder@duo'); rec('c', 'checker@duo')
  w.advance(1000); w.r.finishVerdict('a', 0, {}); w.r.finishVerdict('c', 0, {})
  expect(w.r.listFinishedVerdictsAfter('builder@duo', null).map((v) => v.taskId)).toEqual(['a'])
  expect(w.r.listFinishedVerdictsAfter('builder@duo', w.iso())).toEqual([])
})

test('listDeliveries: only finished done:*:delivered:<target> rows of that exact target', () => {
  const w = world()
  const put = (id: string, receipt: object, state: 'done' | 'failed' = 'done') => { w.r.beginRequest(id); w.r.finishRequest(id, state, receipt) }
  put('done:t0:0:delivered:checker@duo', { target: 'checker@duo', taskId: 'c1', delivery: 'skipped_frozen' })
  put('done:t1:0:delivered:checker@duo', { target: 'checker@duo', taskId: 'c2', delivery: 'dispatched' })
  put('done:t2:0:delivered:xchecker@duo', { target: 'xchecker@duo', taskId: 'c3', delivery: 'skipped_frozen' })
  put('done:t3:0:delivered:checker@duo', { target: 'checker@duo', taskId: 'c4', delivery: 'skipped_frozen' }, 'failed')
  w.r.beginRequest('done:t4:0:delivered:checker@duo')
  expect(w.r.listDeliveries('checker@duo').map((d) => [d.taskId, d.delivery])).toEqual([['c1', 'skipped_frozen'], ['c2', 'dispatched']])
})

test('migrating a 2A database keeps existing lock rows (heartbeat_at NULL) and adds the 2B tables', () => {
  const file = tmpDb()
  const raw = new DatabaseSync(file)
  // 2A 的注册表是前两条迁移（第 3 条起才有 patrol_state 等 2B 的表）
  for (const sql of MIGRATIONS.slice(0, 2)) raw.exec(sql)
  raw.exec('PRAGMA user_version = 2')
  raw.prepare('INSERT INTO locks(team, pid, at) VALUES (?, ?, ?)').run('duo', 1, 'T')
  raw.close()
  const r = Registry.open(file)
  expect(r.getLock('duo')).toEqual({ pid: 1, at: 'T', heartbeatAt: null })
  expect(r.listPatrolState('duo')).toEqual([])
  r.close()
})
