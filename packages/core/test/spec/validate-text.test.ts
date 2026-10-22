import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadTeamSpec, validateSpecText } from '../../src/spec/load.js'
import { DUO_YAML, mkTeam } from './helpers.js'

const repoDuo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../teams/duo/team.yaml')

test('validateSpecText returns parsed and no errors for teams/duo/team.yaml', () => {
  const r = validateSpecText(fs.readFileSync(repoDuo, 'utf8'), repoDuo)
  expect(r.errors).toEqual([])
  expect(r.spec).toMatchObject({ name: 'duo', lead: 'builder' })
  expect(r.parsed).toMatchObject({ name: 'duo', posts: [{ id: 'builder' }, { id: 'checker' }] })
})

test('validateSpecText on a YAML syntax error gives parsed null and one spec_invalid error with a line', () => {
  const specPath = mkTeam(DUO_YAML)
  const r = validateSpecText('version: 1\nname: duo\n\tposts: 1\n', specPath)
  expect(r.spec).toBeNull()
  expect(r.parsed).toBeNull()
  expect(r.errors).toEqual([{ path: [], code: 'spec_invalid', message: expect.any(String), line: 3 }])
})

test('validateSpecText reports links_unknown_post with its path', () => {
  const specPath = mkTeam(DUO_YAML)
  const r = validateSpecText(`${DUO_YAML}links:\n  ghost:\n    consults: [builder]\n`, specPath)
  expect(r.spec).toBeNull()
  expect(r.parsed).not.toBeNull()
  expect(r.errors).toHaveLength(1)
  expect(r.errors[0]).toMatchObject({ code: 'links_unknown_post', path: ['links', 'ghost'] })
  expect(r.errors[0]!.line).toEqual(expect.any(Number))
})

test('validateSpecText reports a schema error with the field path', () => {
  const specPath = mkTeam(DUO_YAML)
  const r = validateSpecText(DUO_YAML.replace('lead: builder', 'lead: 3'), specPath)
  expect(r.errors[0]).toMatchObject({ code: 'spec_invalid', path: ['lead'] })
})

test('validateSpecText resolves files against the spec directory', () => {
  const specPath = mkTeam(DUO_YAML)
  const r = validateSpecText(DUO_YAML.replace('briefs/checker.md', 'briefs/nope.md'), specPath)
  expect(r.errors[0]).toMatchObject({ code: 'file_missing', path: ['posts', 1, 'brief', 0] })
})

test('loadTeamSpec still throws the same error codes after the refactor', () => {
  expect(() => loadTeamSpec(path.join(path.dirname(mkTeam(DUO_YAML)), 'missing.yaml'))).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_not_found' }))
  expect(() => loadTeamSpec(mkTeam('version: 1\nname: [\n'))).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_invalid' }))
  expect(() => loadTeamSpec(mkTeam(`${DUO_YAML}links:\n  ghost:\n    consults: [builder]\n`))).toThrow(expect.objectContaining({ kind: 'input', code: 'links_unknown_post', detail: undefined }))
})
