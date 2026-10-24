import fs from 'node:fs'
import { expect, test } from 'vitest'
import { loadTeamSpec, type TeamSpec } from '../../src/spec/load.js'
import { planSpecChange } from '../../src/spec/plan-change.js'
import { DUO_YAML, mkTeam } from './helpers.js'

const PLAN_OPTS = { running: false, specPath: '/t/duo/team.yaml' }

function setup(): { specPath: string; current: TeamSpec; next: (yaml: string) => TeamSpec } {
  const specPath = mkTeam(DUO_YAML, { files: { 'briefs/builder2.md': 'b2' } })
  const current = loadTeamSpec(specPath)
  return {
    specPath,
    current,
    next: (yaml) => {
      fs.writeFileSync(specPath, yaml)
      return loadTeamSpec(specPath)
    },
  }
}

const kindOf = (r: ReturnType<typeof planSpecChange>, id: string) => r.posts.find((p) => p.id === id)?.kind

test('added, kept, removed, launch_changed and brief_changed posts are classified', () => {
  const { current, next } = setup()
  const added = DUO_YAML.replace('posts:\n', 'posts:\n  - id: scout\n    agent: claude\n    worktree: current\n    brief: [briefs/builder.md]\n')
  expect(planSpecChange(current, next(added), PLAN_OPTS).posts).toEqual([
    { id: 'scout', kind: 'added' },
    { id: 'builder', kind: 'kept' },
    { id: 'checker', kind: 'kept' },
  ])

  const removed = DUO_YAML.slice(0, DUO_YAML.indexOf('  - id: checker'))
  const r1 = planSpecChange(current, next(removed), PLAN_OPTS)
  expect(kindOf(r1, 'builder')).toBe('kept')
  expect(r1.posts).toContainEqual({ id: 'checker', kind: 'removed' })

  const launch = planSpecChange(current, next(DUO_YAML.replace('model: opus', 'model: sonnet')), PLAN_OPTS)
  expect(launch.posts.find((p) => p.id === 'builder')).toEqual({ id: 'builder', kind: 'launch_changed', fields: ['launch', 'model'] })

  const brief = planSpecChange(current, next(DUO_YAML.replace('briefs/builder.md', 'briefs/builder2.md')), PLAN_OPTS)
  expect(brief.posts.find((p) => p.id === 'builder')).toEqual({ id: 'builder', kind: 'brief_changed', fields: ['brief'] })
})

test('launch_changed wins over brief_changed when both change', () => {
  const { current, next } = setup()
  const y = DUO_YAML.replace('agent: claude', 'agent: codex').replace('briefs/builder.md', 'briefs/builder2.md')
  expect(kindOf(planSpecChange(current, next(y), PLAN_OPTS), 'builder')).toBe('launch_changed')
})

test('running team gets down + up --draft; stopped team gets up only', () => {
  const { current } = setup()
  const cur = { ...current, name: 'duo' }
  expect(planSpecChange(cur, cur, { running: true, specPath: '/t/duo/team.yaml' }).commands).toEqual(['wl down duo', 'wl up /t/duo/team.yaml --draft'])
  expect(planSpecChange(cur, cur, { running: false, specPath: '/t/duo/team.yaml' }).commands).toEqual(['wl up /t/duo/team.yaml'])
})

test('current null makes every post added', () => {
  const { next } = setup()
  const r = planSpecChange(null, next(DUO_YAML), PLAN_OPTS)
  expect(r.posts).toEqual([{ id: 'builder', kind: 'added' }, { id: 'checker', kind: 'added' }])
  expect(r.closeSuggested).toBe(false)
})

test('closeSuggested only when a launch changed or a post was removed', () => {
  const { current, next } = setup()
  expect(planSpecChange(current, next(DUO_YAML.replace('model: opus', 'model: sonnet')), PLAN_OPTS).closeSuggested).toBe(true)
  expect(planSpecChange(current, next(DUO_YAML.slice(0, DUO_YAML.indexOf('  - id: checker'))), PLAN_OPTS).closeSuggested).toBe(true)
  expect(planSpecChange(current, next(DUO_YAML.replace('briefs/builder.md', 'briefs/builder2.md')), PLAN_OPTS).closeSuggested).toBe(false)
  expect(planSpecChange(current, next(DUO_YAML), PLAN_OPTS).closeSuggested).toBe(false)
})

test('field diffs list lead, gates, budgets and patrol before/after', () => {
  const { current, next } = setup()
  const y = `${DUO_YAML}gates:\n  builder: pnpm test\nbudgets:\n  task:\n    max_gate_failures: 5\npatrol:\n  no_progress_minutes: 40\n`.replace('lead: builder', 'lead: checker')
  const r = planSpecChange(current, next(y), PLAN_OPTS)
  expect(r.fields).toEqual(
    expect.arrayContaining([
      { path: 'lead', before: 'builder', after: 'checker' },
      { path: 'gates.builder', before: null, after: 'pnpm test' },
      { path: 'budgets.task.max_gate_failures', before: current.budgets.task.maxGateFailures, after: 5 },
      { path: 'patrol.no_progress_minutes', before: 20, after: 40 },
    ]),
  )
  expect(planSpecChange(current, next(DUO_YAML), PLAN_OPTS).fields).toEqual([])
})

test('3D-2: adding, changing or removing a post environment is a launch change (and suggests wl down --close)', () => {
  const { current, next } = setup()
  const withEnv = (name?: string) => (name ? DUO_YAML.replace('    agent: claude\n    model: opus\n', `    agent: claude\n    model: opus\n    environment: ${name}\n`) : DUO_YAML)
  const added = planSpecChange(current, next(withEnv('lima-agent')), PLAN_OPTS)
  expect(added.posts.find((p) => p.id === 'builder')).toEqual({ id: 'builder', kind: 'launch_changed', fields: ['environment'] })
  expect(added.closeSuggested).toBe(true)

  const withLima = loadTeamSpec(setupWith(withEnv('lima-agent')))
  expect(kindOf(planSpecChange(withLima, next(withEnv('other-vm')), PLAN_OPTS), 'builder')).toBe('launch_changed')
  expect(kindOf(planSpecChange(withLima, next(withEnv()), PLAN_OPTS), 'builder')).toBe('launch_changed')
  expect(kindOf(planSpecChange(withLima, next(withEnv('lima-agent')), PLAN_OPTS), 'builder')).toBe('kept')
})

function setupWith(yaml: string): string {
  return mkTeam(yaml, { dir: 'with-env' })
}

