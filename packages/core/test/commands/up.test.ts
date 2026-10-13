import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { requestId } from '../../src/commands/deps.js'
import { up } from '../../src/commands/up.js'
import { renderBriefing } from '../../src/brief/render.js'
import { specHash } from '../../src/spec/hash.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { WinglineError } from '../../src/errors.js'
import { DUO_YAML, mkTeam } from '../spec/helpers.js'
import { FakeOrca, mkDeps } from './fake-client.js'

const duo = () => mkTeam(DUO_YAML)

test('fresh up creates run, then create → wait → brief per post', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((p) => p.outcome)).toEqual(['launched', 'launched'])
  expect(r.runId).toBe('run-1')
  expect(o.calls).toEqual([
    'version', 'status', 'runCreate',
    'terminalList', 'terminalCreate', 'terminalWait', 'terminalSend',
    'terminalList', 'terminalCreate', 'terminalWait', 'terminalSend',
  ])
  expect(deps.registry.listPosts('duo').map((p) => [p.address, p.status, p.isLead])).toEqual([
    ['builder@duo', 'live', true],
    ['checker@duo', 'live', false],
  ])
  expect(deps.registry.getTeam('duo')).toMatchObject({ status: 'up', runId: 'run-1' })
})

test('terminal is created with title, worktree and launch command; briefing goes to that handle', async () => {
  const o = new FakeOrca()
  const p = duo()
  await up(mkDeps(o).deps, { specPath: p })
  expect(o.created.map((c) => [c.title, c.worktree, c.command])).toEqual([
    ['builder@duo', 'current', 'claude --model opus'],
    ['checker@duo', 'current', 'codex --model gpt-6-astra -c model_reasoning_effort="high"'],
  ])
  expect(o.sent[0]).toMatchObject({ handle: 'term-1', text: renderBriefing(loadTeamSpec(p), 'builder') })
})

test('second up with same hash adopts live terminals, no create', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const p = duo()
  await up(deps, { specPath: p })
  o.calls.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.posts.map((x) => x.outcome)).toEqual(['already_live', 'already_live'])
  expect(o.calls).not.toContain('terminalCreate')
  expect(o.calls).not.toContain('runCreate')
  expect(r.runId).toBe('run-1')
})

test('changed hash is refused while the team is up', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  await up(deps, { specPath: duo() })
  await expect(up(deps, { specPath: mkTeam(DUO_YAML.replace('model: opus', 'model: sonnet')) })).rejects.toMatchObject({
    kind: 'input', code: 'team_spec_changed', hint: expect.stringContaining('wl down'),
  })
})

test('changed hash is accepted once the team is stopped', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  registry.upsertTeam({ ...registry.getTeam('duo')!, status: 'stopped' })
  const r = await up(deps, { specPath: mkTeam(DUO_YAML.replace('model: opus', 'model: sonnet')) })
  expect(r.posts.map((x) => x.outcome)).toEqual(['already_live', 'already_live'])
  expect(registry.getTeam('duo')!.status).toBe('up')
})

test('wait not satisfied → uncertain, brief not sent, retry command printed', async () => {
  const o = new FakeOrca()
  o.waitSatisfied = false
  const { deps, registry } = mkDeps(o)
  const p = duo()
  const r = await up(deps, { specPath: p })
  expect(r.posts[0]).toMatchObject({ outcome: 'uncertain', retry: expect.stringMatching(/^wl up /) })
  expect(r.posts[0]!.retry).toContain(p)
  expect(o.calls).not.toContain('terminalSend')
  expect(registry.listPosts('duo')[0]!.status).toBe('uncertain')
})

test('rerun after an uncertain wait resumes: no second create, brief is sent', async () => {
  const o = new FakeOrca()
  o.waitSatisfied = false
  const { deps } = mkDeps(o)
  const p = duo()
  await up(deps, { specPath: p })
  o.waitSatisfied = true
  o.calls.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(o.calls).not.toContain('terminalCreate')
  expect(o.sent.map((s) => s.handle)).toEqual(['term-1', 'term-2'])
})

test('orca not reachable stops before any mutation', async () => {
  const o = new FakeOrca()
  o.reachable = false
  const { deps, registry } = mkDeps(o)
  await expect(up(deps, { specPath: duo() })).rejects.toMatchObject({ kind: 'orca', code: 'runtime_unavailable' })
  expect(o.calls).toEqual(['version', 'status'])
  expect(registry.getTeam('duo')).toBeNull()
})

test('version outside the verified range only warns', async () => {
  const o = new FakeOrca()
  o.versionText = '9.9.9'
  const { deps, warnings } = mkDeps(o)
  await up(deps, { specPath: duo() })
  expect(warnings).toHaveLength(1)
})

test('createRun false skips runCreate and stores null runId', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o, { createRun: false })
  const r = await up(deps, { specPath: duo() })
  expect(o.calls).not.toContain('runCreate')
  expect(r.runId).toBeNull()
  expect(registry.getTeam('duo')!.runId).toBeNull()
})

test('when multilineSafe is false, briefing goes to a file and a one-line pointer is sent', async () => {
  const o = new FakeOrca()
  const { deps, home } = mkDeps(o, { multilineSafe: false })
  const p = duo()
  await up(deps, { specPath: p })
  const file = path.join(home, 'briefs', 'duo', 'builder.md')
  expect(o.sent[0]!.text).not.toMatch(/\n/)
  expect(o.sent[0]!.text).toContain(file)
  expect(fs.readFileSync(file, 'utf8')).toBe(renderBriefing(loadTeamSpec(p), 'builder'))
})

test('an over-long briefing fails before any orca call', async () => {
  const o = new FakeOrca()
  const p = mkTeam(DUO_YAML, { files: { 'NORMS.md': 'x'.repeat(13000) } })
  await expect(up(mkDeps(o).deps, { specPath: p })).rejects.toMatchObject({ code: 'briefing_too_long' })
  expect(o.calls).toEqual([])
})

test('every mutating call carries the deterministic retry id', async () => {
  const o = new FakeOrca()
  const p = duo()
  const hash = specHash(loadTeamSpec(p))
  await up(mkDeps(o).deps, { specPath: p })
  expect(o.runCreates[0]).toMatchObject({ objective: 'wingline:duo', retryRequest: requestId('duo', '', 'run', hash) })
  expect(o.created[0]!.retryRequest).toBe(`duo:builder:create:${hash.slice(0, 8)}`)
  expect(o.sent[0]!.retryRequest).toBe(`duo:builder:brief:${hash.slice(0, 8)}`)
})

test('requests table records pending before the call and done after', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  const p = duo()
  const id = `duo:builder:create:${specHash(loadTeamSpec(p)).slice(0, 8)}`
  let during: string | undefined
  o.onCreate = () => { during ??= registry.getRequest(id)?.state }
  await up(deps, { specPath: p })
  expect(during).toBe('pending')
  expect(registry.getRequest(id)!.state).toBe('done')
})

test('an orca error on one post is reported and the other post still launches', async () => {
  const o = new FakeOrca()
  const orig = o.terminalCreate.bind(o)
  let n = 0
  o.terminalCreate = async (a) => {
    if (n++ === 0) throw new WinglineError('orca', 'selector_not_found', 'worktree not found')
    return orig(a)
  }
  const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.posts[0]).toMatchObject({ outcome: 'failed', reason: expect.stringContaining('worktree not found') })
  expect(r.posts[1]!.outcome).toBe('launched')
  expect(registry.listPosts('duo')[0]!.status).toBe('offline')
})

test('a post whose previous terminal was closed is relaunched with a fresh request id', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  const p = duo()
  await up(deps, { specPath: p })
  o.terminals = [] // 终端被关闭
  registry.upsertTeam({ ...registry.getTeam('duo')!, status: 'stopped' })
  o.created.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(o.created[0]!.retryRequest).toMatch(/-1$/)
})

test('duplicate terminals for a post are reported uncertain without touching them', async () => {
  const o = new FakeOrca()
  o.terminals = [
    { handle: 'a', title: 'builder@duo', connected: true, worktreeId: 'w' },
    { handle: 'b', title: 'builder@duo', connected: true, worktreeId: 'w' },
  ]
  const r = await up(mkDeps(o).deps, { specPath: duo() })
  expect(r.posts[0]).toMatchObject({ outcome: 'uncertain', reason: expect.stringContaining('builder@duo') })
  expect(o.created.map((c) => c.title)).toEqual(['checker@duo'])
})

test('concurrent up on the same team → team_busy', async () => {
  const o = new FakeOrca()
  let release!: () => void
  o.onCreate = () => new Promise<void>((res) => { release = res })
  const { deps } = mkDeps(o)
  const p = duo()
  const first = up(deps, { specPath: p })
  await new Promise((r) => setTimeout(r, 50))
  await expect(up(deps, { specPath: p })).rejects.toMatchObject({ kind: 'input', code: 'team_busy' })
  o.onCreate = undefined
  release()
  await first
})
