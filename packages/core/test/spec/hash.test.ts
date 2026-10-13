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
