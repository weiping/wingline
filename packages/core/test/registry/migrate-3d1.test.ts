import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-mig3d1-')), 'state.db')

/** 3C 落地时的注册表：前 5 条迁移（3C 的 orca_sync 是第 5 条）。 */
const THREE_C = 5

test('a 3C database upgrades, gains unread_marks and keeps existing rows', () => {
  const file = tmpDb()
  const raw = new DatabaseSync(file)
  for (const m of MIGRATIONS.slice(0, THREE_C)) raw.exec(m)
  raw.exec(`PRAGMA user_version = ${THREE_C}`)
  raw.prepare("INSERT INTO teams(name, spec_path, spec_hash, run_id, coordinator_handle, status, updated_at) VALUES ('duo','/s','h',NULL,NULL,'up','T')").run()
  raw.prepare('INSERT INTO orca_sync(worktree, team, status, comment, written_at, fail_count) VALUES (?, ?, ?, ?, ?, ?)').run('/w/a', 'duo', 'todo', 'c', 'T1', 2)
  raw.close()

  const r = Registry.open(file)
  expect(r.schemaVersion()).toBe(MIGRATIONS.length)
  expect(MIGRATIONS.length).toBeGreaterThan(THREE_C)
  expect(r.getTeam('duo')).toMatchObject({ name: 'duo', specHash: 'h' })
  expect(r.getOrcaSync('/w/a', 'duo')).toMatchObject({ status: 'todo', failCount: 2 })
  expect(r.listUnreadMarks('duo')).toEqual([])
  r.close()

  const check = new DatabaseSync(file)
  const cols = (check.prepare('PRAGMA table_info(unread_marks)').all() as Array<{ name: string; pk: number }>)
  expect(cols.map((c) => c.name)).toEqual(['team', 'item_key', 'marked_at'])
  expect(cols.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(['team', 'item_key'])
  check.close()
})

test('add / list / remove unread marks per team; duplicates are ignored', () => {
  const r = Registry.open(tmpDb())
  r.addUnreadMarks('duo', ['stale:t1', 'stale:t1', 'frozen:builder'], 'T1')
  r.addUnreadMarks('duo', ['stale:t1'], 'T2')
  r.addUnreadMarks('trio', ['stale:t1'], 'T3')
  expect(r.listUnreadMarks('duo')).toEqual(['frozen:builder', 'stale:t1'])
  expect(r.listUnreadMarks('trio')).toEqual(['stale:t1'])

  r.removeUnreadMarks('duo', ['stale:t1', 'does-not-exist'])
  expect(r.listUnreadMarks('duo')).toEqual(['frozen:builder'])
  expect(r.listUnreadMarks('trio')).toEqual(['stale:t1'])
  expect(r.listUnreadMarks('nobody')).toEqual([])
  r.close()
})

test('an empty key list is a no-op and a removed key can be added again', () => {
  const r = Registry.open(tmpDb())
  r.addUnreadMarks('duo', [], 'T1')
  r.removeUnreadMarks('duo', [])
  expect(r.listUnreadMarks('duo')).toEqual([])
  r.addUnreadMarks('duo', ['question:m1'], 'T1')
  r.removeUnreadMarks('duo', ['question:m1'])
  r.addUnreadMarks('duo', ['question:m1'], 'T2')
  expect(r.listUnreadMarks('duo')).toEqual(['question:m1'])
  r.close()
})
