import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-mig3c-')), 'state.db')

test('migration from a 3B database adds orca_sync and keeps existing rows', () => {
  const file = tmpDb()
  const raw = new DatabaseSync(file)
  for (const m of MIGRATIONS.slice(0, 4)) raw.exec(m)
  raw.exec('PRAGMA user_version = 4')
  raw.prepare("INSERT INTO teams(name, spec_path, spec_hash, run_id, coordinator_handle, status, updated_at) VALUES ('duo','/s','h',NULL,NULL,'up','T')").run()
  raw.close()

  const r = Registry.open(file)
  expect(r.getTeam('duo')).toMatchObject({ name: 'duo', specHash: 'h' })
  expect(r.schemaVersion()).toBe(MIGRATIONS.length)
  expect(MIGRATIONS.length).toBeGreaterThanOrEqual(5)

  expect(r.getOrcaSync('/w/a', 'duo')).toBeNull()
  r.putOrcaSync({ worktree: '/w/a', team: 'duo', status: 'todo', comment: 'c', writtenAt: 'T1', failCount: 2 })
  r.putOrcaSync({ worktree: '/w/b', team: 'duo', status: null, comment: null, writtenAt: null, failCount: 3 })
  r.putOrcaSync({ worktree: '/w/other', team: 'other', status: null, comment: null, writtenAt: null, failCount: 3 })
  expect(r.getOrcaSync('/w/a', 'duo')).toEqual({ worktree: '/w/a', team: 'duo', status: 'todo', comment: 'c', writtenAt: 'T1', failCount: 2 })
  r.putOrcaSync({ worktree: '/w/a', team: 'duo', status: 'completed', comment: 'd', writtenAt: 'T2', failCount: 0 })
  expect(r.getOrcaSync('/w/a', 'duo')).toMatchObject({ status: 'completed', failCount: 0 })
  expect(r.listOrcaSync('duo').map((x) => x.worktree)).toEqual(['/w/a', '/w/b'])

  r.resetOrcaSyncFailures('duo')
  expect(r.listOrcaSync('duo').map((x) => x.failCount)).toEqual([0, 0])
  expect(r.getOrcaSync('/w/other', 'other')).toMatchObject({ failCount: 3 })
  r.close()
})

test('two teams on one worktree keep separate rows instead of overwriting each other', () => {
  const r = Registry.open(tmpDb())
  r.putOrcaSync({ worktree: '/w/a', team: 'duo', status: 'todo', comment: 'x', writtenAt: 'T1', failCount: 0 })
  r.putOrcaSync({ worktree: '/w/a', team: 'trio', status: 'completed', comment: 'y', writtenAt: 'T2', failCount: 3 })
  expect(r.getOrcaSync('/w/a', 'duo')).toMatchObject({ status: 'todo', comment: 'x', failCount: 0 })
  expect(r.getOrcaSync('/w/a', 'trio')).toMatchObject({ status: 'completed', comment: 'y', failCount: 3 })
  r.resetOrcaSyncFailures('trio')
  expect(r.getOrcaSync('/w/a', 'duo')).toMatchObject({ failCount: 0 })
  expect(r.getOrcaSync('/w/a', 'trio')).toMatchObject({ failCount: 0 })
  r.close()
})
