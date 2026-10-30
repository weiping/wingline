import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { requestId } from '../../src/commands/deps.js'
import { down } from '../../src/commands/down.js'
import { saveSpecCmd } from '../../src/commands/spec.js'
import { gateCwd } from '../../src/commands/task/gate-exec.js'
import { taskPreflight } from '../../src/commands/task/preflight.js'
import { up } from '../../src/commands/up.js'
import { renderBriefing } from '../../src/brief/render.js'
import { draftPathOf } from '../../src/spec/draft.js'
import { specHash } from '../../src/spec/hash.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { WinglineError } from '../../src/errors.js'
import { DUO_YAML, mkTeam } from '../spec/helpers.js'
import { FakeOrca, mkDeps } from './fake-client.js'

const duo = () => mkTeam(DUO_YAML)

test('fresh up does create → wait → brief per post', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((p) => p.outcome)).toEqual(['launched', 'launched'])
  expect(o.calls).toEqual([
    'version', 'status', 'worktreeShow',
    'terminalList', 'terminalCreate', 'terminalWait', 'terminalShow', 'terminalSend',
    'terminalList', 'terminalCreate', 'terminalWait', 'terminalShow', 'terminalSend',
    'runList', 'runCreate', 'taskList', 'terminalList',
  ])
  expect(deps.registry.listPosts('duo').map((p) => [p.address, p.status, p.isLead])).toEqual([
    ['builder@duo', 'live', true],
    ['checker@duo', 'live', false],
  ])
  expect(deps.registry.getTeam('duo')).toMatchObject({ status: 'up', runId: 'run-1', coordinatorHandle: 'term-1' })
})

test('terminal is created with title, worktree and launch command; briefing goes to that handle', async () => {
  const o = new FakeOrca()
  const p = duo()
  await up(mkDeps(o).deps, { specPath: p })
  expect(o.created.map((c) => [c.title, c.worktree, c.command])).toEqual([
    ['builder@duo', 'current', 'claude --model opus'],
    ['checker@duo', 'current', 'codex --model gpt-6-astra -c model_reasoning_effort="high"'],
  ])
  // 启动包 = renderBriefing 第一行 + 会话标记行 + 其余部分不变
  const brief = renderBriefing(loadTeamSpec(p), 'builder')
  const lines = o.sent[0]!.text.split('\n')
  expect(o.sent[0]).toMatchObject({ handle: 'term-1' })
  expect(lines[0]).toBe(brief.split('\n')[0])
  expect(lines[1]).toMatch(/^会话标记：WLS-[0-9a-f]{8}（雁阵用它在重启后找回本会话，无需理会）$/)
  expect(lines.slice(2).join('\n')).toBe(brief.split('\n').slice(1).join('\n'))
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

test('when multilineSafe is false, briefing goes to a file and a one-line pointer is sent', async () => {
  const o = new FakeOrca()
  const { deps, home } = mkDeps(o, { multilineSafe: false })
  const p = duo()
  await up(deps, { specPath: p })
  const file = path.join(home, 'briefs', 'duo', 'builder.md')
  expect(o.sent[0]!.text).not.toMatch(/\n/)
  expect(o.sent[0]!.text).toContain(file)
  // 文件里是加了标记行的完整启动包
  const brief = renderBriefing(loadTeamSpec(p), 'builder')
  const fileLines = fs.readFileSync(file, 'utf8').split('\n')
  expect(fileLines[0]).toBe(brief.split('\n')[0])
  expect(fileLines[1]).toMatch(/^会话标记：WLS-[0-9a-f]{8}（雁阵用它在重启后找回本会话，无需理会）$/)
  expect(fileLines.slice(2).join('\n')).toBe(brief.split('\n').slice(1).join('\n'))
})

test('an over-long briefing fails before any orca call', async () => {
  const o = new FakeOrca()
  const p = mkTeam(DUO_YAML, { files: { 'NORMS.md': 'x'.repeat(13000) } })
  await expect(up(mkDeps(o).deps, { specPath: p })).rejects.toMatchObject({ code: 'briefing_too_long' })
  expect(o.calls).toEqual([])
})

test('each step is recorded in the request ledger under its deterministic key', async () => {
  const o = new FakeOrca()
  const p = duo()
  const hash = specHash(loadTeamSpec(p))
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: p })
  for (const step of ['create', 'wait', 'brief'] as const) {
    expect(registry.getRequest(requestId('duo', 'builder', step, hash))!.state).toBe('done')
  }
  expect(registry.getRequest(`duo:builder:brief:${hash.slice(0, 8)}`)!.receipt).toContain('"accepted":true')
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

test('a post whose previous terminal was closed is relaunched with fresh request ids', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  const p = duo()
  await up(deps, { specPath: p })
  o.terminals = [] // 终端被关闭
  registry.upsertTeam({ ...registry.getTeam('duo')!, status: 'stopped' })
  o.created.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(registry.getRequest(`duo:builder:create:${specHash(loadTeamSpec(p)).slice(0, 8)}-1`)!.state).toBe('done')
  expect(registry.getRequest(`duo:builder:brief:${specHash(loadTeamSpec(p)).slice(0, 8)}-1`)!.state).toBe('done')
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

test('first up: run-list finds nothing → run-create from the lead handle through the ledger', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(o.callsOf('runCreate')).toEqual([{ objective: 'wingline:duo', from: 'term-1', retryRequest: expect.any(String) }])
  expect(registry.getRequest('duo:run-create')!.state).toBe('done')
})
test('run-create landed but returned runtime_timeout → settled in the same up, no second Run', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('orca', 'runtime_timeout', 't') })
  expect((await up(deps, { specPath: duo() })).run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(o.runs).toHaveLength(1)
})
test('run-create uncertain (request-show unreachable) → uncertain with the retry command; rerunning replays the same id', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') },
                { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'uncertain', retry: `wl up ${p}` })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'created', runId: 'run-1' })
  const ids = o.callsOf('runCreate').map((a) => a.retryRequest)
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
  expect(o.runs).toHaveLength(1)
})
test('registry lost: run-list finds exactly one wingline:duo Run → adopted and run-use to the lead, no run-create', async () => {
  const o = new FakeOrca(); o.runs.push({ id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'gone', createdAt: 'T' })
  const { deps, registry } = mkDeps(o)
  expect((await up(deps, { specPath: duo() })).run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(o.callsOf('runCreate')).toEqual([])
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-9', from: 'term-1' }])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-9', coordinatorHandle: 'term-1' })
})
test('two candidate Runs → ambiguous (exit 1 kind) listing both; --adopt-run picks one', async () => {
  const o = new FakeOrca()
  o.runs.push({ id: 'run-8', objective: 'wingline:duo', coordinatorHandle: 'x', createdAt: 'T1' }, { id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'y', createdAt: 'T2' })
  const { deps, registry } = mkDeps(o); const p = duo()
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'ambiguous', candidates: [{ id: 'run-8', createdAt: 'T1' }, { id: 'run-9', createdAt: 'T2' }], retry: `wl up ${p} --adopt-run <id>` })
  expect((await up(deps, { specPath: p, adoptRun: 'run-9' })).run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(registry.getTeam('duo')!.runId).toBe('run-9')
})
test('the Run was deleted in Orca → lost with the --new-run hint; --new-run creates a fresh Run and skips run-list', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.runs.length = 0; await o.terminalClose({ handle: 'term-1' })      // 协调者终端没了 → 下一轮要 run-use
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'lost', runId: 'run-1', retry: `wl up ${p} --new-run` })
  o.calls.length = 0
  expect((await up(deps, { specPath: p, newRun: true })).run).toEqual({ outcome: 'created', runId: 'run-2' })
  expect(o.calls).not.toContain('runList')
  expect(registry.getRequest('duo:run-create')!.state).toBe('done')
})
test('second up keeps the coordinator while its terminal is alive (e.g. a running dispatcher)', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  registry.updateCoordinatorHandle('duo', 'term-dsp'); o.coordinator = 'term-dsp'
  expect((await up(deps, { specPath: p })).run).toEqual({ outcome: 'kept', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
test('second up reclaims for the lead when the coordinator terminal is gone', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-1' })
  expect((await up(deps, { specPath: p })).run).toEqual({ outcome: 'reclaimed', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-1', from: 'term-3' }])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-3')
})
test('lead not live this round → run step deferred, no orchestration call', async () => {
  const o = new FakeOrca(); o.waitSatisfied = false
  const r = await up(mkDeps(o).deps, { specPath: duo() })
  expect(r.run).toEqual({ outcome: 'deferred', runId: null })
  expect(o.orch).toEqual([])
})
test('the Run is reused after wl down and a spec change', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  registry.upsertTeam({ ...registry.getTeam('duo')!, status: 'stopped' })
  const r = await up(deps, { specPath: mkTeam(DUO_YAML.replace('model: opus', 'model: sonnet')) })
  expect(r.run?.runId).toBe('run-1')
  expect(o.callsOf('runCreate')).toHaveLength(1)
})
test('dispatched tasks whose assignee terminal is gone are reported with a recover command, grouped by owner; nothing is changed', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'term-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-old', from: 'term-1' })        // 派给了一个已经不存在的 handle（R5-4）
  o.orch.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.deadAssignees).toEqual([{ taskId: id, title: '实现登录', owner: 'checker@duo', command: `wl task recover ${id}` }])
  expect(o.orch.filter((c) => c.m !== 'runUse')).toEqual([])
})

test('ambiguous candidates: no orchestration write, runId stays unset, posts still launched', async () => {
  const o = new FakeOrca()
  o.runs.push({ id: 'run-8', objective: 'wingline:duo', coordinatorHandle: 'x', createdAt: 'T1' }, { id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'y', createdAt: 'T2' })
  const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.run).toMatchObject({ outcome: 'ambiguous', runId: null })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(o.callsOf('runCreate')).toEqual([]); expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')!.runId).toBeNull()
})
test('run-list ignores Runs of other objectives', async () => {
  const o = new FakeOrca(); o.runs.push({ id: 'run-5', objective: 'wingline:other', coordinatorHandle: 'x', createdAt: 'T' })
  const r = await up(mkDeps(o).deps, { specPath: duo() })
  expect(r.run).toMatchObject({ outcome: 'created' })
  expect(r.run!.runId).not.toBe('run-5')
})
test('a rerun after an uncertain run-create goes straight to the ledger row: no run-list', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') },
                { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await up(deps, { specPath: p })
  o.orch.length = 0
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'created', runId: 'run-1' })
  expect(o.callsOf('runList')).toEqual([])
})
test('run-create rejected by Orca → run failed (exit-2 kind), ledger row dropped, runId unset, posts unaffected', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  o.faults.push({ method: 'runCreate', when: 'before', error: new WinglineError('orca', 'runtime_error', 'no') })
  const r = await up(deps, { specPath: duo() })
  expect(r.run).toMatchObject({ outcome: 'failed', runId: null })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(registry.getRequest('duo:run-create')).toBeNull()
  expect(registry.getTeam('duo')!.runId).toBeNull()
})
test('--adopt-run keeps a live coordinator: no run-use, coordinator unchanged', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  o.runs.push({ id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'term-dsp', createdAt: 'T' })
  const r = await up(deps, { specPath: duo(), adoptRun: 'run-9' })
  expect(r.run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-9', coordinatorHandle: 'term-dsp' })
})
test('--adopt-run with a dead coordinator still reclaims for the lead', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  o.runs.push({ id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'gone', createdAt: 'T' })
  const r = await up(deps, { specPath: duo(), adoptRun: 'run-9' })
  expect(r.run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-9', from: 'term-1' }])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-1')
})
test('--adopt-run with an id Orca does not know → failed, nothing written', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo(), adoptRun: 'run-ghost' })
  expect(r.run).toMatchObject({ outcome: 'failed', runId: null })
  expect(registry.getTeam('duo')!.runId).toBeNull()
})
test('the coordinator is never taken from a live terminal, even when the lead was relaunched', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  registry.updateCoordinatorHandle('duo', 'term-dsp'); o.coordinator = 'term-dsp'
  await o.terminalClose({ handle: 'term-1' })            // lead is relaunched on this up
  const r = await up(deps, { specPath: p })
  expect(r.run).toEqual({ outcome: 'kept', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(o.coordinator).toBe('term-dsp')
})
test('--new-run clears the old Run and coordinator before creating; the old ledger row is replaced, not replayed', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  const first = registry.getRequest('duo:run-create')!.retryRequest
  await up(deps, { specPath: p, newRun: true })
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-2' })
  expect(registry.getRequest('duo:run-create')!.retryRequest).not.toBe(first)
  expect(o.runs.map((x) => x.id)).toEqual(['run-1', 'run-2'])
})
test('no dead assignees → the field is empty/absent; a task dispatched to a live terminal is not reported; an unclaimed one has owner null', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  expect(r0(await up(deps, { specPath: p }))).toEqual([])
  const live = await o.taskCreate({ spec: 's', taskTitle: 'a', run: 'run-1', from: 'term-1' })
  await o.dispatch({ task: live.id, to: 'term-2', from: 'term-1' })           // term-2 is the live checker terminal
  const dead = await o.taskCreate({ spec: 's', taskTitle: 'b', run: 'run-1', from: 'term-1' })
  await o.dispatch({ task: dead.id, to: 'term-gone', from: 'term-1' })
  expect((await up(deps, { specPath: p })).deadAssignees).toEqual([{ taskId: dead.id, title: 'b', owner: null, command: `wl task recover ${dead.id}` }])
})
const r0 = (r: { deadAssignees?: unknown[] }) => r.deadAssignees ?? []
test('run step deferred → no dead-assignee report and no taskList call', async () => {
  const o = new FakeOrca(); o.waitSatisfied = false
  const r = await up(mkDeps(o).deps, { specPath: duo() })
  expect(r.deadAssignees ?? []).toEqual([])
  expect(o.calls).not.toContain('taskList')
})

test('a failing taskList in the dead-assignee check does not fail up: posts and Run are still returned, deadAssignees omitted', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'down') })
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(r.run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(r.deadAssignees ?? []).toEqual([])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-1', status: 'up' })
})
test('a failing terminalList in the dead-assignee check does not fail up either', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  const taskList = o.taskList.bind(o)
  o.taskList = async (a) => {                      // terminalList is called right after taskList in the check
    o.faults.push({ method: 'terminalList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'down') })
    return taskList(a)
  }
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(r.run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(r.deadAssignees ?? []).toEqual([])
})

test('wl up does not type the brief into a post sitting at a confirmation prompt', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.onCreate = () => { o.previews.set(`term-${o.terminals.length + 1}`, 'Do you trust the files in this folder?\n❯ 1. Yes') }
  const r = await up(deps, { specPath: duo() })
  expect(r.posts[0]).toMatchObject({ outcome: 'uncertain', reason: expect.stringContaining('确认提示') })
  expect(o.sent).toEqual([])
})
test('at_prompt on the lead → the Run step is deferred; the other post is guarded independently', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.onCreate = () => { if (o.terminals.length === 0) o.previews.set('term-1', 'Allow this command to run? (Y/n)') }
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((x) => x.outcome)).toEqual(['uncertain', 'launched'])
  expect(r.run).toEqual({ outcome: 'deferred', runId: null })
  expect(o.sent.map((s) => s.handle)).toEqual(['term-2'])
})
test('an unreadable screen (empty preview) or a failing terminalShow does not block the brief', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.onCreate = () => { o.previews.set(`term-${o.terminals.length + 1}`, '') }
  const r = await up(deps, { specPath: duo() })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  const o2 = new FakeOrca()
  o2.faults.push({ method: 'terminalShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const r2 = await up(mkDeps(o2).deps, { specPath: duo() })
  expect(r2.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
})
test('after an at_prompt refusal, rerunning once the prompt is answered resumes: no second create, the brief is sent once', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.previews.set('term-1', 'Do you want to proceed?')
  o.onCreate = () => {}
  const first = await up(deps, { specPath: p })
  expect(first.posts[0]!.outcome).toBe('uncertain')
  o.previews.set('term-1', '❯ ')
  const second = await up(deps, { specPath: p })
  expect(second.posts[0]!.outcome).toBe('launched')
  expect(o.created.filter((c) => c.title === 'builder@duo')).toHaveLength(1)
  expect(o.sent.filter((s) => s.handle === 'term-1')).toHaveLength(1)
})

test('F-1: wl up does not type the brief into a post that has dropped back to a shell; the reason says so; the other post is unaffected', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.onCreate = () => { if (o.terminals.length === 0) o.previews.set('term-1', 'agent crashed\nme@host:~/repo$ ') }
  const r = await up(deps, { specPath: duo() })
  expect(r.posts[0]).toMatchObject({ outcome: 'uncertain', reason: expect.stringContaining('岗位已退回 shell') })
  expect(r.posts[1]!.outcome).toBe('launched')
  expect(o.sent.map((s) => s.handle)).toEqual(['term-2'])
})
test('F-1 (rerun): the wait step is already done, the agent has since exited to a shell → the rerun refuses to type the brief', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.previews.set('term-1', 'Do you want to proceed?')
  expect((await up(deps, { specPath: p })).posts[0]!.outcome).toBe('uncertain')            // wait done, brief refused at a prompt
  o.previews.set('term-1', 'me@host:~/repo$ ')                                              // the agent then exited
  const second = await up(deps, { specPath: p })
  expect(second.posts[0]).toMatchObject({ outcome: 'uncertain', reason: expect.stringContaining('岗位已退回 shell') })
  expect(o.sent.filter((s) => s.handle === 'term-1')).toEqual([])
})
test('F-3: rerunning wl up from another worktree keeps the existing path: pin of a post whose terminal is still live; a post that is relaunched is resolved fresh', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  o.worktreePaths.set('current', '/repo/a')
  await up(deps, { specPath: p })
  expect(registry.getPost('builder@duo')!.worktree).toBe('path:/repo/a')
  o.worktreePaths.set('current', '/repo/b')                                                // the rerun happens from another worktree
  await o.terminalClose({ handle: 'term-2' })                                              // checker's terminal is gone; builder stays live
  await up(deps, { specPath: p })
  expect(registry.getPost('builder@duo')!.worktree).toBe('path:/repo/a')
  expect(registry.getPost('checker@duo')!.worktree).toBe('path:/repo/b')
})

test('2-a: when worktree show is uncertain for a post that is NOT live, its old path: pin does not survive — it is reset to the spec selector, and gate cwd never answers with the stale directory', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  o.worktreePaths.set('current', '/repo/a')
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-2' })                                              // checker's terminal is gone
  o.worktreePaths.set('current', '/repo/b')                                                // the rerun happens from another worktree
  o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') })
  const r = await up(deps, { specPath: p })
  expect(r.posts[1]!.outcome).toBe('launched')
  expect(registry.getPost('builder@duo')!.worktree).toBe('path:/repo/a')                    // still live: keeps its pin
  expect(registry.getPost('checker@duo')!.worktree).toBe('current')                         // not live + could not re-resolve: back to the spec value
  expect(await gateCwd(deps, 'checker@duo').catch(() => null)).not.toBe('/repo/a')
})
test('2-b: a terminal list failure while pinning does not abort wl up: per-post results are still returned and existing pins are kept', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  o.worktreePaths.set('current', '/repo/a')
  await up(deps, { specPath: p })
  o.faults.push({ method: 'terminalList', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') })
  const r = await up(deps, { specPath: p })
  expect(r.posts).toHaveLength(2)
  expect(r.posts.map((x) => x.outcome)).toEqual(['already_live', 'already_live'])
  expect(registry.getPost('builder@duo')!.worktree).toBe('path:/repo/a')
  expect(registry.getPost('checker@duo')!.worktree).toBe('path:/repo/a')
})
test('up --draft applies the draft then launches', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  const edited = DUO_YAML.replace('model: opus', 'model: sonnet')
  fs.writeFileSync(draftPathOf(p), edited)
  const r = await up(deps, { specPath: p, draft: true })
  expect(r.posts.map((x) => x.outcome)).toEqual(['launched', 'launched'])
  expect(fs.readFileSync(p, 'utf8')).toBe(edited)
  expect(fs.readFileSync(`${p}.bak`, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(draftPathOf(p))).toBe(false)
  expect(o.created[0]!.command).toBe('claude --model sonnet')
})
test('up --draft with the team still up and a different specHash refuses and touches nothing', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  fs.writeFileSync(draftPathOf(p), DUO_YAML.replace('model: opus', 'model: sonnet'))
  await expect(up(deps, { specPath: p, draft: true })).rejects.toMatchObject({ code: 'team_spec_changed' })
  expect(fs.readFileSync(p, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(`${p}.bak`)).toBe(false)
  expect(fs.existsSync(draftPathOf(p))).toBe(true)
})
test('up --draft refuses when the draft renames a running team (the team that owns this spec path is still up)', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  fs.writeFileSync(draftPathOf(p), DUO_YAML.replace('name: duo', 'name: duo2'))
  await expect(up(deps, { specPath: p, draft: true })).rejects.toMatchObject({ kind: 'input', code: 'team_spec_changed' })
  expect(fs.readFileSync(p, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(`${p}.bak`)).toBe(false)
  expect(fs.existsSync(draftPathOf(p))).toBe(true)
  expect(registry.getTeam('duo2')).toBeNull()
  // 团队已停止后，同样的改名草稿可以应用
  registry.setTeamStatus('duo', 'stopped')
  await up(deps, { specPath: p, draft: true })
  expect(registry.getTeam('duo2')).toMatchObject({ status: 'up' })
})
test('up --draft allows a comment-only draft while the team is up', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  fs.writeFileSync(draftPathOf(p), `${DUO_YAML}# 只改注释\n`)
  const r = await up(deps, { specPath: p, draft: true })
  expect(r.posts.map((x) => x.outcome)).toEqual(['already_live', 'already_live'])
  expect(fs.readFileSync(p, 'utf8')).toContain('只改注释')
})
test('draft_not_found tells you the draft may already have been applied when a .bak is lying next to the spec', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  const plain = await up(deps, { specPath: p, draft: true }).catch((e) => e)
  expect(plain.hint).toContain('wl up')
  expect(plain.hint).not.toContain('.bak')
  fs.writeFileSync(`${p}.bak`, DUO_YAML)
  const withBak = await up(deps, { specPath: p, draft: true }).catch((e) => e)
  expect(withBak).toMatchObject({ code: 'draft_not_found' })
  expect(withBak.hint).toContain('.bak')
  expect(withBak.hint).toContain(`wl up ${p}`)
})
test('up --draft without a draft fails with draft_not_found (input error) before any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  const err = await up(deps, { specPath: duo(), draft: true }).catch((e) => e)
  expect(err).toMatchObject({ kind: 'input', code: 'draft_not_found' })
  expect(o.calls).toEqual([])
})
test('运行中团队保存文档后：down → up --draft 应用草稿并重算规格哈希，taskPreflight 重新放行', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  const oldHash = registry.getTeam('duo')!.specHash
  await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: true, files: { 'NORMS.md': '# 改过的规范\n' } })
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'team_spec_changed' })
  await down(deps, { team: 'duo', close: false })
  await up(deps, { specPath: p, draft: true })
  expect(registry.getTeam('duo')!.specHash).not.toBe(oldHash)
  await expect(taskPreflight(deps, 'duo')).resolves.toMatchObject({ team: expect.objectContaining({ name: 'duo', status: 'up' }) })
})
