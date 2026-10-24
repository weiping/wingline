import { expect, test } from 'vitest'
import { loadTeamSpec } from '../../src/spec/load.js'
import { specHash } from '../../src/spec/hash.js'
import { DUO_YAML, mkTeam } from './helpers.js'

test('hash is 64 lowercase hex and stable for the same spec in different directories', () => {
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML, { dir: 'one' })))
  const b = specHash(loadTeamSpec(mkTeam(DUO_YAML, { dir: 'two' })))
  expect(a).toMatch(/^[0-9a-f]{64}$/)
  expect(a).toBe(b)
})

test('hash is stable across key order and platform path separators', () => {
  const reordered = `lead: builder
name: duo
posts:
  - brief: [briefs\\builder.md]
    worktree: current
    model: opus
    agent: claude
    id: builder
  - launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'
    brief: [briefs/checker.md]
    agent: codex
    worktree: current
    id: checker
norms: NORMS.md
repo: path:/abs/repo
version: 1
`
  expect(specHash(loadTeamSpec(mkTeam(reordered)))).toBe(specHash(loadTeamSpec(mkTeam(DUO_YAML))))
})

test('hash changes when a brief file content changes', () => {
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const b = specHash(loadTeamSpec(mkTeam(DUO_YAML, { files: { 'briefs/builder.md': 'changed' } })))
  expect(a).not.toBe(b)
})

test('hash ignores CRLF vs LF in referenced files', () => {
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML, { files: { 'NORMS.md': 'a\nb\n' } })))
  const b = specHash(loadTeamSpec(mkTeam(DUO_YAML, { files: { 'NORMS.md': 'a\r\nb\r\n' } })))
  expect(a).toBe(b)
})

test('hash changes when the spec changes', () => {
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const b = specHash(loadTeamSpec(mkTeam(DUO_YAML.replace('model: opus', 'model: sonnet'))))
  expect(a).not.toBe(b)
})

test('hash changes when tags/gate/links/budgets change', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const withTag = specHash(loadTeamSpec(mkTeam(DUO_YAML.replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    tags: [backend]'))))
  const withGate = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'gates:\n  builder: pnpm test\n')))
  const withBudget = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  task:\n    gate_timeout_seconds: 30\n')))
  expect(new Set([base, withTag, withGate, withBudget]).size).toBe(4)
})

test('B-M9: consults participates in the spec hash (spec §4: the new fields all do)', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const withConsults = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  builder:\n    consults: [checker]\n')))
  expect(withConsults).not.toBe(base)
})

test('patrol settings participate in the hash', () => {
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 7\n')))).not.toBe(a)
})

test('final-review I1: a team without a patrol section keeps exactly its 2A-era hash', () => {
  // 在加入 patrol 之前的提交上算出的 DUO_YAML 哈希；patrol 全是默认值时不得改变它
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML)))).toBe('d6cf0b333ae8418f9fe51eced88cc223e889ebcdf2f6278c633fc37fbb2dc00c')
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol: {}\n')))).toBe(specHash(loadTeamSpec(mkTeam(DUO_YAML))))
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 20\n')))).toBe(specHash(loadTeamSpec(mkTeam(DUO_YAML))))
})

test('3D-1: patrol.unread_mark defaults to true and keeps the pinned hash; false changes it', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  expect(base).toBe('d6cf0b333ae8418f9fe51eced88cc223e889ebcdf2f6278c633fc37fbb2dc00c')
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  unread_mark: true\n')))).toBe(base)
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  unread_mark: false\n')))).not.toBe(base)
})

test('final-review I1: a non-default patrol value changes the hash', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const a = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 45\n')))
  const b = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  freeze_lead: true\n')))
  const c = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  notify:\n    webhook: https://example.com/h\n')))
  expect(new Set([base, a, b, c]).size).toBe(4)
})

test('DEFAULT_PATROL matches what the schema fills in', async () => {
  const { DEFAULT_PATROL } = await import('../../src/spec/load.js')
  expect(loadTeamSpec(mkTeam(DUO_YAML)).patrol).toEqual(DEFAULT_PATROL)
})

test('3D-2: a spec without environment keeps the pinned hash; writing one changes it, and different names differ', () => {
  const withEnv = (name: string) => DUO_YAML.replace('    agent: claude\n    model: opus\n', `    agent: claude\n    model: opus\n    environment: ${name}\n`)
  const plain = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  expect(plain).toBe('d6cf0b333ae8418f9fe51eced88cc223e889ebcdf2f6278c633fc37fbb2dc00c')
  const a = specHash(loadTeamSpec(mkTeam(withEnv('lima-agent'))))
  expect(a).not.toBe(plain)
  expect(specHash(loadTeamSpec(mkTeam(withEnv('other-vm'))))).not.toBe(a)
  expect(specHash(loadTeamSpec(mkTeam(withEnv('lima-agent'), { dir: 'elsewhere' })))).toBe(a)
})
