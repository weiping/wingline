import path from 'node:path'
import { expect, test } from 'vitest'
import { loadTeamSpec } from '../../src/spec/load.js'
import { DUO_YAML, mkTeam } from './helpers.js'

const withPost = (post: string) => DUO_YAML.replace('posts:\n', `posts:\n${post}`)

test('loads duo-like spec and resolves paths', () => {
  const p = mkTeam(DUO_YAML)
  const s = loadTeamSpec(p)
  expect(s.posts.map((x) => x.id)).toEqual(['builder', 'checker'])
  expect(s).toMatchObject({ name: 'duo', lead: 'builder', repo: 'path:/abs/repo', specPath: p, dir: path.dirname(p) })
  expect(path.isAbsolute(s.normsPath)).toBe(true)
  expect(s.posts[0]!.briefPaths).toEqual([path.join(path.dirname(p), 'briefs', 'builder.md')])
  expect(s.posts[1]!.launch).toBe('codex --model gpt-6-astra -c model_reasoning_effort="high"')
})

test('default launch from model', () => {
  const s = loadTeamSpec(mkTeam(DUO_YAML))
  expect(s.posts[0]!.launch).toBe('claude --model opus')
})

test('launch defaults to the agent id; worktree defaults to current', () => {
  const y = DUO_YAML.replace('    model: opus\n', '').replace('    worktree: current\n    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]')
  const s = loadTeamSpec(mkTeam(y))
  expect(s.posts[0]).toMatchObject({ launch: 'claude', worktree: 'current' })
})

test('model without launch on unknown agent is input error', () => {
  const y = DUO_YAML.replace('agent: claude\n    model: opus', 'agent: gemini\n    model: pro')
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ kind: 'input', code: 'launch_required' }))
})

test.each([
  ['links', 'links: []\n', '阶段 2'],
  ['gates', 'gates: {}\n', '阶段 2'],
  ['budgets', 'budgets: {}\n', '阶段 2'],
])('reserved top-level field %s is rejected with its phase', (_n, extra, phase) => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + extra))).toThrow(
    expect.objectContaining({ kind: 'input', code: 'field_not_yet_available', message: expect.stringContaining(phase) }),
  )
})

test('reserved post field is rejected with its phase', () => {
  const y = DUO_YAML.replace('    worktree: current\n    brief: [briefs/builder.md]', '    worktree: current\n    plan_first: true\n    brief: [briefs/builder.md]')
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(
    expect.objectContaining({ code: 'field_not_yet_available', message: expect.stringMatching(/plan_first.*阶段 2/s) }),
  )
})

test('error carries line number', () => {
  const y = withPost('  - id: builder\n    agent: claude\n')
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(
    expect.objectContaining({ code: 'spec_invalid', message: expect.stringMatching(/第 \d+ 行/) }),
  )
})

test('lead must be a post id', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML.replace('lead: builder', 'lead: ghost')))).toThrow(
    expect.objectContaining({ kind: 'input', code: 'lead_unknown' }),
  )
})

test('names: lowercase letters, digits, hyphen', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML.replace('name: duo', 'name: Duo')))).toThrow(
    expect.objectContaining({ code: 'spec_invalid', message: expect.stringContaining('第 2 行') }),
  )
})

test('unknown field is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'colour: red\n'))).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
})

test('missing referenced file is an input error naming the file', () => {
  const p = mkTeam(DUO_YAML)
  const y = DUO_YAML.replace('NORMS.md', 'NOPE.md')
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'file_missing', message: expect.stringContaining('NOPE.md') }))
  expect(() => loadTeamSpec(p)).not.toThrow()
})

test('invalid yaml is spec_invalid with a line', () => {
  expect(() => loadTeamSpec(mkTeam('name: [unclosed\n'))).toThrow(
    expect.objectContaining({ code: 'spec_invalid', message: expect.stringMatching(/第 \d+ 行/) }),
  )
})

test('paths with spaces and backslashes resolve', () => {
  const y = DUO_YAML.replace('briefs/builder.md', 'briefs\\builder.md')
  const s = loadTeamSpec(mkTeam(y, { dir: 'with space' }))
  expect(s.posts[0]!.briefPaths[0]).toBe(path.join(s.dir, 'briefs', 'builder.md'))
  expect(s.dir).toContain('with space')
})
