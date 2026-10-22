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
  expect(MIGRATIONS.length).toBe(5)

  expect(r.getOrcaSync('/w/a')).toBeNull()
  r.putOrcaSync({ worktree: '/w/a', team: 'duo', status: 'todo', comment: 'c', writtenAt: 'T1', failCount: 2 })
  r.putOrcaSync({ worktree: '/w/b', team: 'duo', status: null, comment: null, writtenAt: null, failCount: 3 })
  r.putOrcaSync({ worktree: '/w/other', team: 'other', status: null, comment: null, writtenAt: null, failCount: 3 })
  expect(r.getOrcaSync('/w/a')).toEqual({ worktree: '/w/a', team: 'duo', status: 'todo', comment: 'c', writtenAt: 'T1', failCount: 2 })
  r.putOrcaSync({ worktree: '/w/a', team: 'duo', status: 'completed', comment: 'd', writtenAt: 'T2', failCount: 0 })
  expect(r.getOrcaSync('/w/a')).toMatchObject({ status: 'completed', failCount: 0 })
  expect(r.listOrcaSync('duo').map((x) => x.worktree)).toEqual(['/w/a', '/w/b'])

  r.resetOrcaSyncFailures('duo')
  expect(r.listOrcaSync('duo').map((x) => x.failCount)).toEqual([0, 0])
  expect(r.getOrcaSync('/w/other')).toMatchObject({ failCount: 3 })
  r.close()
})
