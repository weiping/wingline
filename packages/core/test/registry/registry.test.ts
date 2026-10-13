import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry, type PostRow, type TeamRow } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-reg-')), 'sub', 'state.db')

const team: TeamRow = { name: 'duo', specPath: '/s/team.yaml', specHash: 'h'.repeat(64), runId: null, status: 'up' }
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
  expect(r.getRequest('a')).toEqual({ state: 'pending', receipt: null })
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
