import fs from 'node:fs'
import { expect, test } from 'vitest'
import { registerSpecRoutes } from '../../src/server/api-spec.js'
import { Router, statusOf } from '../../src/server/http.js'
import { draftPathOf, fileHash } from '../../src/spec/draft.js'
import { cachedOrca } from '../../src/view/snapshot.js'
import { DUO_YAML } from '../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { WinglineError } from '../../src/errors.js'

const EDITED = DUO_YAML.replace('model: opus', 'model: sonnet')

function harness() {
  const o = new FakeOrca()
  const { deps, registry } = seedRunningTeam(o)
  const d = { ...deps, orca: cachedOrca(o) }
  const r = new Router()
  registerSpecRoutes(r, { version: '9.9.9' })
  const specPath = registry.getTeam('duo')!.specPath
  const call = (method: 'GET' | 'POST', path: string, body: unknown = null) => {
    const route = r.match(method, path)!
    return route.h({ deps: d, params: route.params, query: new URLSearchParams(), body }) as Promise<any>
  }
  return { call, deps, registry, specPath }
}

test('GET spec returns parsed, hash, draft and running', async () => {
  const { call, specPath } = harness()
  const r = await call('GET', '/api/teams/duo/spec')
  expect(r).toMatchObject({ specPath, yaml: DUO_YAML, hash: fileHash(specPath), draft: null, running: true })
  expect(r.parsed.name).toBe('duo')
})

test('GET spec with a YAML syntax error gives parsed null', async () => {
  const { call, specPath } = harness()
  fs.writeFileSync(specPath, 'version: 1\n\tx: 1\n')
  expect((await call('GET', '/api/teams/duo/spec')).parsed).toBeNull()
})

test('GET spec rejects an invalid team name', async () => {
  const { call } = harness()
  await expect(call('GET', '/api/teams/Duo/spec')).rejects.toMatchObject({ code: 'invalid_param' })
})

test('validate never writes a file and returns preview null when errors exist', async () => {
  const { call, specPath } = harness()
  const bad = await call('POST', '/api/teams/duo/spec/validate', { yaml: DUO_YAML.replace('lead: builder', 'lead: ghost') })
  expect(bad.errors[0].code).toBe('lead_unknown')
  expect(bad.preview).toBeNull()
  const ok = await call('POST', '/api/teams/duo/spec/validate', { yaml: EDITED })
  expect(ok.errors).toEqual([])
  expect(ok.preview.commands[0]).toBe('wl down duo')
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})

test('validate with set applies setField and returns the new yaml and parsed', async () => {
  const { call } = harness()
  const r = await call('POST', '/api/teams/duo/spec/validate', { yaml: DUO_YAML, set: { path: ['posts', 0, 'model'], value: 'sonnet' } })
  expect(r.yaml).toBe(EDITED)
  expect(r.parsed.posts[0].model).toBe('sonnet')
})

test('validate with set on a syntax error → 400 spec_invalid', async () => {
  const { call } = harness()
  const err = await call('POST', '/api/teams/duo/spec/validate', { yaml: 'a: [x\n', set: { path: ['a'], value: 1 } }).catch((e) => e)
  expect(err).toMatchObject({ code: 'spec_invalid' })
  expect(statusOf(err)).toBe(400)
})

test('validate with yaml over 48 KB → 400 spec_too_large', async () => {
  const { call } = harness()
  const err = await call('POST', '/api/teams/duo/spec/validate', { yaml: `${DUO_YAML}# ${'a'.repeat(48 * 1024)}\n` }).catch((e) => e)
  expect(err).toMatchObject({ code: 'spec_too_large' })
  expect(statusOf(err)).toBe(400)
})

test('validate rejects unknown fields and a non-string yaml', async () => {
  const { call } = harness()
  await expect(call('POST', '/api/teams/duo/spec/validate', { yaml: DUO_YAML, extra: 1 })).rejects.toMatchObject({ code: 'unknown_field' })
  await expect(call('POST', '/api/teams/duo/spec/validate', { yaml: 5 })).rejects.toMatchObject({ code: 'invalid_param' })
})

test('validate is not audited', async () => {
  const { call, deps } = harness()
  await call('POST', '/api/teams/duo/spec/validate', { yaml: EDITED })
  expect(deps.registry.listAudit('duo')).toEqual([])
})

test('spec_conflict maps to HTTP 409', () => {
  expect(statusOf(new WinglineError('input', 'spec_conflict', 'x'))).toBe(409)
  expect(statusOf(new WinglineError('input', 'spec_invalid', 'x'))).toBe(400)
})

test('GET about returns items and teams', async () => {
  const { call } = harness()
  const r = await call('GET', '/api/about')
  expect(r.items.find((i: any) => i.key === 'wingline.version')).toMatchObject({ value: '9.9.9' })
  expect(r.teams[0]).toMatchObject({ name: 'duo', status: 'up', draft: false })
})
