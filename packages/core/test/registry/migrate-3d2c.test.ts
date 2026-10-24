import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry, type PatrolStateRow } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-mig3d2c-')), 'state.db')
/** 3D-1 落地时的注册表：前 6 条迁移（第 6 条是 unread_marks）。 */
const THREE_D1 = 6

const row = (over: Partial<PatrolStateRow> = {}): PatrolStateRow => ({
  team: 'duo', post: 'checker@duo', signal: 'usage_limit', taskId: '', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, ...over,
})

test('a 3D-1 database upgrades, gains patrol_state.detail and keeps existing rows with detail null', () => {
  const file = tmpDb()
  const raw = new DatabaseSync(file)
  for (const m of MIGRATIONS.slice(0, THREE_D1)) raw.exec(m)
  raw.exec(`PRAGMA user_version = ${THREE_D1}`)
  raw.prepare("INSERT INTO teams(name, spec_path, spec_hash, run_id, coordinator_handle, status, updated_at) VALUES ('duo','/s','h',NULL,NULL,'up','T')").run()
  raw.prepare("INSERT INTO patrol_state(team, post, signal, task_id, level, since, level_at) VALUES ('duo','builder@duo','no_progress','t1',1,'A','A')").run()
  raw.close()

  const r = Registry.open(file)
  expect(r.schemaVersion()).toBe(MIGRATIONS.length)
  expect(MIGRATIONS.length).toBeGreaterThan(THREE_D1)
  expect(r.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')).toMatchObject({ level: 1, detail: null })
  r.close()
})

test('detail round-trips as an object, can be replaced, and a row written without it reads back as null', () => {
  const r = Registry.open(tmpDb())
  r.putPatrolState(row({ detail: { resetsAt: '2026-10-16T07:00:00.000Z', noticeHash: 'abc123def456', extensions: 0 } }))
  expect(r.getPatrolState('duo', 'checker@duo', 'usage_limit', '')!.detail).toEqual({ resetsAt: '2026-10-16T07:00:00.000Z', noticeHash: 'abc123def456', extensions: 0 })
  r.putPatrolState(row({ detail: { extensions: 1 } }))
  expect(r.getPatrolState('duo', 'checker@duo', 'usage_limit', '')!.detail).toEqual({ extensions: 1 })
  r.putPatrolState(row({ post: 'builder@duo', signal: 'no_progress', taskId: 't1' }))
  expect(r.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')!.detail).toBeNull()
  expect(r.listPatrolState('duo').map((x) => [x.signal, x.detail !== null])).toEqual(expect.arrayContaining([['usage_limit', true], ['no_progress', false]]))
  r.close()
})

test('resetPatrolForPost (unfreeze) clears the ordinary rows but leaves the screen-signal rows alone', () => {
  const r = Registry.open(tmpDb())
  r.putPatrolState(row({ signal: 'usage_limit', detail: { extensions: 0 } }))
  r.putPatrolState(row({ signal: 'context_low', taskId: 'sk-0123456789ab', detail: { percent: 5 } }))
  r.putPatrolState(row({ signal: 'no_progress', taskId: 't1', level: 2 }))
  r.resetPatrolForPost('checker@duo', 'NOW')
  expect(r.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')).toMatchObject({ level: 0, clearedAt: 'NOW' })
  expect(r.getPatrolState('duo', 'checker@duo', 'usage_limit', '')).toMatchObject({ level: 1, clearedAt: null })
  expect(r.getPatrolState('duo', 'checker@duo', 'context_low', 'sk-0123456789ab')).toMatchObject({ level: 1, clearedAt: null })
  r.close()
})
