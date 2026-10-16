import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { MIGRATIONS } from '../../src/registry/migrations.js'
import { Registry } from '../../src/registry/registry.js'

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-mig3a-')), 'state.db')

test('a 2B database (user_version 3, with a post) upgrades in place: post kept, session columns null, audit_events usable', () => {
  const file = tmpDb()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  for (const m of MIGRATIONS.slice(0, 3)) raw.exec(m)
  raw.exec('PRAGMA user_version = 3')
  raw.prepare("INSERT INTO teams(name, spec_path, spec_hash, run_id, coordinator_handle, status, updated_at) VALUES ('duo','/s','h',NULL,NULL,'up','T')").run()
  raw.prepare("INSERT INTO posts(address, team, agent, worktree, handle, status, is_lead, updated_at) VALUES ('builder@duo','duo','claude','current','term-1','live',1,'T')").run()
  raw.close()
  const r = Registry.open(file)
  expect(r.getPost('builder@duo')).toMatchObject({ address: 'builder@duo', handle: 'term-1', sessionMarker: null, sessionId: null, sessionAt: null })
  r.appendAudit({ team: 'duo', actor: 'human', command: 'restore', target: null, outcome: 'ok' })
  expect(r.listAudit('duo')).toHaveLength(1)
  r.close()
  const after = new DatabaseSync(file)
  expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length)
  after.close()
})
