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

test('post defaults: self_claim/tags/plan_first/gate/links', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).posts[0]).toMatchObject({ selfClaim: false, tags: [], planFirst: false, gate: null, reviewedBy: [], handsTo: [] })
})
test('parses self_claim/tags/plan_first/gates/links', () => {
  const y = DUO_YAML.replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    self_claim: true\n    tags: [backend]\n    plan_first: true')
    + 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    consults: [builder]\ngates:\n  builder: pnpm test\n'
  expect(loadTeamSpec(mkTeam(y)).posts[0]).toMatchObject({ selfClaim: true, tags: ['backend'], planFirst: true, gate: 'pnpm test', reviewedBy: ['checker'] })
})
test('task budgets default to 3 / 600 / null; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).budgets).toEqual({ task: { maxGateFailures: 3, gateTimeoutSeconds: 600, maxMinutes: null } })
  const y = DUO_YAML + 'budgets:\n  task:\n    max_gate_failures: 2\n    gate_timeout_seconds: 30\n    max_minutes: 240\n'
  expect(loadTeamSpec(mkTeam(y)).budgets).toEqual({ task: { maxGateFailures: 2, gateTimeoutSeconds: 30, maxMinutes: 240 } })
})
test('the removed budgets.team.max_in_progress_per_post → field_removed with the reason', () => {
  const y = DUO_YAML + 'budgets:\n  team:\n    max_in_progress_per_post: 3\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'field_removed', message: expect.stringContaining('一个进行中的派发') }))
})
test('reviewed_by + hands_to on the same post → links_conflict', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [checker]\n    hands_to: [checker]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_conflict' }))
})
test('unknown post id in links or gates is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  builder:\n    reviewed_by: [ghost]\n'))).toThrow(expect.objectContaining({ code: 'links_unknown_post' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  ghost:\n    reviewed_by: [checker]\n'))).toThrow(expect.objectContaining({ code: 'links_unknown_post' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'gates:\n  ghost: pnpm test\n'))).toThrow(expect.objectContaining({ code: 'gates_unknown_post' }))
})
test.each(['reviewed_by', 'hands_to', 'consults'])('a post linking to itself via %s → links_self', (k) => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + `links:\n  builder:\n    ${k}: [builder]\n`))).toThrow(expect.objectContaining({ code: 'links_self' }))
})
test('mutual reviewed_by is allowed (review tasks do not trigger links)', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n'
  expect(() => loadTeamSpec(mkTeam(y))).not.toThrow()
})
test('a hands_to cycle is rejected and names the posts on it', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    hands_to: [checker]\n  checker:\n    hands_to: [builder]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_cycle', message: expect.stringMatching(/builder.*checker|checker.*builder/) }))
})
test('unknown key under a links entry is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  builder:\n    reports_to: [checker]\n'))).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
})
test('budgets.team present but empty is still field_removed', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  team: {}\n'))).toThrow(expect.objectContaining({ code: 'field_removed' }))
})
test('a hands_to chain without a cycle is allowed and parsed', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    hands_to: [checker]\n'
  const s = loadTeamSpec(mkTeam(y))
  expect(s.posts[0]?.handsTo).toEqual(['checker'])
  expect(s.posts[1]?.handsTo).toEqual([])
})
test('a 3-node hands_to cycle is reported with every post on it', () => {
  const y = DUO_YAML + `  - id: docs
    agent: claude
    model: opus
    worktree: current
    brief: [briefs/docs.md]
links:
  builder:
    hands_to: [checker]
  checker:
    hands_to: [docs]
  docs:
    hands_to: [builder]
`
  expect(() => loadTeamSpec(mkTeam(y, { files: { 'briefs/docs.md': 'd' } }))).toThrow(
    expect.objectContaining({ code: 'links_cycle', message: expect.stringMatching(/builder.*checker.*docs|builder.*docs.*checker|checker.*builder.*docs|checker.*docs.*builder|docs.*builder.*checker|docs.*checker.*builder/s) }),
  )
})
test('a non-positive budget is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  task:\n    max_gate_failures: 0\n'))).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
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

test('a missing team.yaml is an input error naming the path', () => {
  const missing = path.resolve('/nonexistent/team.yaml')
  expect(() => loadTeamSpec(missing)).toThrow(
    expect.objectContaining({ kind: 'input', code: 'spec_not_found', message: expect.stringContaining(missing) }),
  )
})

test('an empty reviewed_by next to a hands_to is not a conflict (nothing is reviewed)', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: []\n    hands_to: [checker]\n'
  expect(() => loadTeamSpec(mkTeam(y))).not.toThrow()
})

test('patrol defaults; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).patrol).toEqual({ noProgressMinutes: 20, promptMinutes: 5, ownerIdleMinutes: 30, postFailureStreak: 3, freezeLead: false, autoRecover: false, worktreeComment: false, workspaceStatus: true, unreadMark: true, notify: null })
  expect(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  unread_mark: false\n')).patrol.unreadMark).toBe(false)
  const y = DUO_YAML + 'patrol:\n  no_progress_minutes: 5\n  freeze_lead: true\n  notify:\n    webhook: https://example.invalid/h\n'
  expect(loadTeamSpec(mkTeam(y)).patrol).toMatchObject({ noProgressMinutes: 5, freezeLead: true, notify: { webhook: 'https://example.invalid/h' } })
  expect(loadTeamSpec(mkTeam(DUO_YAML + "patrol:\n  notify:\n    command: ['/usr/bin/notify', '-m']\n")).patrol.notify).toEqual({ command: ['/usr/bin/notify', '-m'] })
})
test('patrol.notify: both or neither of webhook/command → notify_conflict; a non-http URL is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + "patrol:\n  notify:\n    webhook: https://a\n    command: ['x']\n"))).toThrow(expect.objectContaining({ code: 'notify_conflict' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  notify: {}\n'))).toThrow(expect.objectContaining({ code: 'notify_conflict' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  notify:\n    webhook: file:///etc/passwd\n'))).toThrow()
})
test('on Windows a .cmd/.bat notify command → notify_command_unsupported', () => {
  const y = DUO_YAML + "patrol:\n  notify:\n    command: ['C:\\\\tools\\\\toast.cmd']\n"
  expect(() => loadTeamSpec(mkTeam(y), { platform: 'win32' })).toThrow(expect.objectContaining({ code: 'notify_command_unsupported' }))
  expect(() => loadTeamSpec(mkTeam(y), { platform: 'linux' })).not.toThrow()
})
