import fs from 'node:fs'
import { PassThrough } from 'node:stream'
import { afterEach, expect, test } from 'vitest'
import { WinglineError, type CommandDeps } from '@wingline/core'
import os from 'node:os'
import path from 'node:path'
import { READ_ONLY_CALLS } from '@wingline/core'
import { defaultMakeDeps, installWarningFilter, isReadOnlyCall, run, type Commands } from '../src/cli.js'

function io() {
  const out: string[] = []
  const err: string[] = []
  const stdout = new PassThrough().on('data', (d) => out.push(String(d)))
  const stderr = new PassThrough().on('data', (d) => err.push(String(d)))
  return { io: { stdout, stderr, env: {} as NodeJS.ProcessEnv }, out: () => out.join(''), err: () => err.join('') }
}

let closed = 0
const makeDeps = () => ({ registry: { close: () => { closed++ } } }) as unknown as CommandDeps
const cmds = (over: Partial<Commands> = {}): Commands => ({
  up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }] }),
  ps: async () => [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h1', worktree: 'current', isLead: true }],
  send: async (_d, a) => ({ address: a.address, outcome: 'delivered', handle: 'h1' }),
  down: async (_d, a) => ({ team: a.team, posts: [{ address: 'builder@duo', outcome: a.close ? 'closed' : 'stopped' }] }),
  createTask: async () => { throw new Error('未注入：createTask') },
  listTasks: async () => { throw new Error('未注入：listTasks') },
  listStale: async () => { throw new Error('未注入：listStale') },
  showTask: async () => { throw new Error('未注入：showTask') },
  claimTask: async () => { throw new Error('未注入：claimTask') },
  releaseTask: async () => { throw new Error('未注入：releaseTask') },
  reassignTask: async () => { throw new Error('未注入：reassignTask') },
  startTask: async () => { throw new Error('未注入：startTask') },
  planTask: async () => { throw new Error('未注入：planTask') },
  doneTask: async () => { throw new Error('未注入：doneTask') },
  escalateTask: async () => { throw new Error('未注入：escalateTask') },
  resolveGate: async () => { throw new Error('未注入：resolveGate') },
  recoverTask: async () => { throw new Error('未注入：recoverTask') },
  dispatcherUp: async () => { throw new Error('未注入：dispatcherUp') },
  dispatcherDown: async () => { throw new Error('未注入：dispatcherDown') },
  runDispatcherLoop: async () => { throw new Error('未注入：runDispatcherLoop') },
  dispatcherStatus: async () => { throw new Error('未注入：dispatcherStatus') },
  freezePostCmd: async () => { throw new Error('未注入：freezePostCmd') },
  unfreezePostCmd: async () => { throw new Error('未注入：unfreezePostCmd') },
  hushCmd: async () => { throw new Error('未注入：hushCmd') },
  unhushCmd: async () => { throw new Error('未注入：unhushCmd') },
  dispatcherReply: async () => { throw new Error('未注入：dispatcherReply') },
  attention: async () => { throw new Error('未注入：attention') },
  ...over,
})
const exec = (argv: string[], c: Commands = cmds()) => {
  const h = io()
  return run(argv, h.io, c, makeDeps).then((code) => ({ code, out: h.out(), err: h.err() }))
}

test.each([
  ['input', 1],
  ['orca', 2],
  ['uncertain', 3],
] as const)('exit code for %s errors is %i', async (kind, code) => {
  const r = await exec(['up', 'x.yaml'], cmds({ up: async () => { throw new WinglineError(kind, 'c', 'm') } }))
  expect(r.code).toBe(code)
})

test('plain Error is exit 4', async () => {
  expect((await exec(['ps'], cmds({ ps: async () => { throw new Error('boom') } }))).code).toBe(4)
})

test('--json prints a single JSON document on stdout and nothing on stderr', async () => {
  const r = await exec(['ps', '--json'])
  expect(JSON.parse(r.out)).toMatchObject({ ok: true, result: [{ address: 'builder@duo' }] })
  expect(r.err).toBe('')
  expect(r.code).toBe(0)
})

test('--json error document carries kind, code, message and hint', async () => {
  const r = await exec(['ps', '--json'], cmds({ ps: async () => { throw new WinglineError('orca', 'runtime_unavailable', 'down', { hint: '运行 orca open 启动 Orca' }) } }))
  expect(JSON.parse(r.out)).toEqual({ ok: false, error: { kind: 'orca', code: 'runtime_unavailable', message: 'down', hint: '运行 orca open 启动 Orca' } })
  expect(r.err).toBe('')
  expect(r.code).toBe(2)
})

test('human output shows the hint on stderr', async () => {
  const r = await exec(['ps'], cmds({ ps: async () => { throw new WinglineError('orca', 'runtime_unavailable', 'down', { hint: '运行 orca open 启动 Orca' }) } }))
  expect(r.err).toContain('orca open')
  expect(r.err).toContain('down')
  expect(r.out).toBe('')
})

test('ps prints a table', async () => {
  const r = await exec(['ps'])
  expect(r.out).toMatch(/ADDRESS\s+AGENT\s+STATUS/)
  expect(r.out).toMatch(/builder@duo\s+claude\s+live/)
})

test('up with an uncertain post exits 3; with a failed post exits 2', async () => {
  const mk = (outcome: 'uncertain' | 'failed') => cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'a@duo', outcome, reason: 'r', retry: 'wl up x' }] }) })
  expect((await exec(['up', 'x'], mk('uncertain'))).code).toBe(3)
  const f = await exec(['up', 'x'], mk('failed'))
  expect(f.code).toBe(2)
})

test('up human output names each post outcome and the retry command', async () => {
  const r = await exec(['up', 'x'], cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'a@duo', outcome: 'uncertain', reason: '未就绪', retry: 'wl up x' }] }) }))
  expect(r.out).toContain('a@duo')
  expect(r.out).toContain('wl up x')
})

test('send passes address and message verbatim', async () => {
  let got: unknown
  await exec(['send', 'checker@duo', 'a "b" 中文'], cmds({ send: async (_d, a) => { got = a; return { address: a.address, outcome: 'delivered', handle: 'h' } } }))
  expect(got).toEqual({ address: 'checker@duo', message: 'a "b" 中文' })
})

test('send --retry-request is forwarded', async () => {
  let got: unknown
  await exec(['send', 'checker@duo', 'hi', '--retry-request', 'req-1'], cmds({ send: async (_d, a) => { got = a; return { address: a.address, outcome: 'delivered', handle: 'h' } } }))
  expect(got).toEqual({ address: 'checker@duo', message: 'hi', retryRequest: 'req-1' })
})

test('down --close flag is forwarded', async () => {
  let got: unknown
  await exec(['down', 'duo', '--close'], cmds({ down: async (_d, a) => { got = a; return { team: 'duo', posts: [] } } }))
  expect(got).toEqual({ team: 'duo', close: true })
})

test('down surfaces the per-post detail of an uncertain close', async () => {
  const detail = { team: 'duo', posts: [{ address: 'a@duo', outcome: 'uncertain', reason: 'x' }] }
  const r = await exec(['down', 'duo', '--close', '--json'], cmds({ down: async () => { throw new WinglineError('uncertain', 'close_unconfirmed', 'm', { detail }) } }))
  expect(JSON.parse(r.out).error.detail).toEqual(detail)
  expect(r.code).toBe(3)
})

test('--version prints the package version and exits 0', async () => {
  const r = await exec(['--version'])
  expect(r.code).toBe(0)
  expect(r.out.trim()).toMatch(/^\d+\.\d+\.\d+/)
})

test('unknown command is a usage error (exit 1)', async () => {
  expect((await exec(['frobnicate'])).code).toBe(1)
})

test('registry is closed after the command, also on failure', async () => {
  closed = 0
  await exec(['ps'])
  await exec(['ps'], cmds({ ps: async () => { throw new Error('x') } }))
  expect(closed).toBe(2)
})

afterEach(() => { process.removeAllListeners('warning') })

test('sqlite experimental warning is suppressed, others are shown', async () => {
  const h = io()
  installWarningFilter(h.io.stderr)
  process.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning')
  process.emitWarning('something else', 'DeprecationWarning')
  await new Promise((r) => setTimeout(r, 20))
  expect(h.err()).not.toContain('SQLite')
  expect(h.err()).toContain('something else')
})
// packages/cli/test/main.test.ts（沿用文件里已有的 cmds / exec）
test('up exits 3 when the Run step is uncertain even though every post launched', async () => {
  const c = cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }], run: { outcome: 'uncertain', runId: null, reason: 't', retry: 'wl up x' } }) })
  const r = await exec(['up', 'x'], c)
  expect(r.code).toBe(3); expect(r.out).toContain('wl up x')
})
test('up passes --adopt-run / --new-run through; ambiguous exits 1, lost exits 2', async () => {
  const seen: unknown[] = []
  const mk = (outcome: 'ambiguous' | 'lost') => cmds({ up: async (_d, a) => { seen.push(a); return { team: 'duo', posts: [], run: { outcome, runId: null } } } })
  expect((await exec(['up', 'x', '--adopt-run', 'run-9'], mk('ambiguous'))).code).toBe(1)
  expect((await exec(['up', 'x', '--new-run'], mk('lost'))).code).toBe(2)
  expect(seen).toEqual([expect.objectContaining({ adoptRun: 'run-9' }), expect.objectContaining({ newRun: true })])
})

test('--adopt-run and --new-run are mutually exclusive (usage error, exit 1, up not called)', async () => {
  let called = 0
  const r = await exec(['up', 'x', '--adopt-run', 'run-9', '--new-run'], cmds({ up: async () => { called++; return { team: 'duo', posts: [] } } }))
  expect(r.code).toBe(1); expect(called).toBe(0)
})
test('up exit code takes the most severe of posts and Run step; a healthy Run keeps exit 0', async () => {
  const mk = (post: string, run: string) => cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: post as 'launched' }], run: { outcome: run as 'created', runId: 'run-1' } }) })
  expect((await exec(['up', 'x'], mk('uncertain', 'lost'))).code).toBe(2)
  expect((await exec(['up', 'x'], mk('launched', 'failed'))).code).toBe(2)
  expect((await exec(['up', 'x'], mk('launched', 'created'))).code).toBe(0)
  for (const ok of ['adopted', 'kept', 'reclaimed', 'deferred']) expect((await exec(['up', 'x'], mk('launched', ok))).code).toBe(0)
})
test('up human output shows the Run step and the dead-assignee recover commands; --json carries run and deadAssignees', async () => {
  const c = cmds({ up: async () => ({
    team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }],
    run: { outcome: 'created', runId: 'run-1' },
    deadAssignees: [{ taskId: 't1', title: '实现登录', owner: 'checker@duo', command: 'wl task recover t1' }],
  }) })
  const r = await exec(['up', 'x'], c)
  expect(r.out).toContain('run-1'); expect(r.out).toContain('wl task recover t1'); expect(r.out).toContain('checker@duo')
  const j = JSON.parse((await exec(['up', 'x', '--json'], c)).out)
  expect(j.result).toMatchObject({ run: { outcome: 'created', runId: 'run-1' }, deadAssignees: [{ taskId: 't1' }] })
})
test('up with an ambiguous Run lists the candidates and the --adopt-run hint', async () => {
  const c = cmds({ up: async () => ({ team: 'duo', posts: [], run: { outcome: 'ambiguous', runId: null, candidates: [{ id: 'run-8', createdAt: 'T1' }, { id: 'run-9', createdAt: 'T2' }], retry: 'wl up x --adopt-run <id>' } }) })
  const r = await exec(['up', 'x'], c)
  expect(r.code).toBe(1)
  expect(r.out + r.err).toContain('run-8'); expect(r.out + r.err).toContain('run-9'); expect(r.out + r.err).toContain('--adopt-run')
})

test('wl task create --json prints the created id', async () => {
  const c = cmds({ createTask: async () => ({ id: 'task-1' }) })
  const r = await exec(['task', 'create', 'duo', '--title', 't', '--json'], c)
  expect(JSON.parse(r.out).result.id).toBe('task-1')
})
test('wl task create / escalate pass --retry-request and --reopen through', async () => {
  const seen: unknown[] = []
  const c = cmds({ createTask: async (_d, a) => { seen.push(a); return { id: 't' } }, escalateTask: async (_d, a) => { seen.push(a); return { gateId: 'g', status: 'blocked', tookBackDispatch: false } } })
  await exec(['task', 'create', 'duo', '--title', 't', '--retry-request', 'rid-1'], c)
  await exec(['task', 'escalate', 't1', '--reason', 'x', '--reopen', '--retry-request', 'rid-2'], c)
  expect(seen).toEqual([expect.objectContaining({ retryRequest: 'rid-1' }), expect.objectContaining({ retryRequest: 'rid-2', reopen: true })])
})
test('wl task done exit codes follow outcome; an uncertain error exits 3 and prints the hint', async () => {
  for (const [outcome, code] of [['done', 0], ['gate_failed', 1], ['escalated', 1], ['gate_failed_after_bypass', 1]] as const) {
    expect((await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({ outcome }) }))).code).toBe(code)
  }
  const r = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => { throw new WinglineError('uncertain', 'orca_timeout', 't', { hint: '原样重跑同一条命令即可' }) } }))
  expect(r).toMatchObject({ code: 3, err: expect.stringContaining('原样重跑') })
})
test('wl task list --tags a,b parses into an array; --stale routes to listStale and prints the commands', async () => {
  let args: unknown
  await exec(['task', 'list', 'duo', '--tags', 'a,b'], cmds({ listTasks: async (_d, a) => { args = a; return [] } }))
  expect(args).toMatchObject({ tags: ['a', 'b'] })
  const r = await exec(['task', 'list', 'duo', '--stale'], cmds({ listStale: async () => [{ taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' }] }))
  expect(r.out).toContain('wl task recover t1')
})
test('wl task reassign / release / recover are wired', async () => {
  const seen: string[] = []
  const c = cmds({
    reassignTask: async () => { seen.push('reassign'); return { notify: { outcome: 'notified' } } },
    releaseTask: async () => { seen.push('release') },
    recoverTask: async () => { seen.push('recover'); return { status: 'dispatched', epoch: 1, delivery: 'notified' } },
  })
  await exec(['task', 'reassign', 't1', '--to', 'checker@duo'], c); await exec(['task', 'release', 't1'], c); await exec(['task', 'recover', 't1'], c)
  expect(seen).toEqual(['reassign', 'release', 'recover'])
})

type Shown = Awaited<ReturnType<Commands['showTask']>>
const shownTask = (over: Partial<Shown> = {}): Shown => ({
  id: 't1', status: 'completed', title: '实现登录', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null,
  epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, outcome: 'succeeded', reportedBy: 'term-b', closure: null, ...over,
})

test('wl task create passes team, --post, --tags (split), --parent and --as through', async () => {
  let seen: unknown
  await exec(['task', 'create', 'duo', '--title', '修 bug', '--post', 'checker@duo', '--tags', 'a,b,', '--parent', 't0', '--as', 'builder@duo'], cmds({ createTask: async (_d, a) => { seen = a; return { id: 't' } } }))
  expect(seen).toEqual({ team: 'duo', title: '修 bug', post: 'checker@duo', tags: ['a', 'b'], parent: 't0', as: 'builder@duo', retryRequest: undefined })
})
test('wl task create human output: not_notified suggests wl send; queued names the busy task', async () => {
  const notNotified = await exec(['task', 'create', 'duo', '--title', 't', '--post', 'checker@duo'], cmds({ createTask: async () => ({ id: 't9', delivery: 'not_notified', reason: 'at_prompt' }) }))
  expect(notNotified.out).toContain('wl send'); expect(notNotified.out).toContain('t9')
  const queued = await exec(['task', 'create', 'duo', '--title', 't', '--post', 'checker@duo'], cmds({ createTask: async () => ({ id: 't9', delivery: 'queued', busyWith: 'task-0' }) }))
  expect(queued.out).toContain('task-0'); expect(queued.out).toContain('排队')
})
test('required options are enforced as usage errors (exit 1) and nothing is called', async () => {
  let called = 0
  const c = cmds({ createTask: async () => { called++; return { id: 't' } }, reassignTask: async () => { called++; return { notify: { outcome: 'notified' } } }, escalateTask: async () => { called++; return { gateId: 'g', status: 'blocked', tookBackDispatch: false } }, resolveGate: async () => { called++; return { taskId: 't', status: 'ready', claimedBy: null } } })
  for (const argv of [['task', 'create', 'duo'], ['task', 'reassign', 't1'], ['task', 'escalate', 't1'], ['task', 'resolve', 'g1'], ['task', 'bogus']]) {
    expect((await exec(argv, c)).code).toBe(1)
  }
  expect(called).toBe(0)
  expect((await exec(['task', 'create', 'duo', '--title', 't'], c)).code).toBe(0)     // with the required option the command is dispatched
  expect(called).toBe(1)
})
test('wl task list passes --mine/--status/--as and an optional team; without a team it is undefined', async () => {
  const seen: unknown[] = []
  const c = cmds({ listTasks: async (_d, a) => { seen.push(a); return [] } })
  await exec(['task', 'list', '--mine', '--status', 'ready', '--as', 'builder@duo'], c)
  await exec(['task', 'list', 'duo'], c)
  expect(seen[0]).toMatchObject({ team: undefined, mine: true, status: 'ready', as: 'builder@duo' })
  expect(seen[1]).toMatchObject({ team: 'duo' })
})
test('wl task list prints a row per task; --json prints the array', async () => {
  const rows = [{ id: 't1', status: 'ready', title: '实现登录', parentId: null, tags: ['x'], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null }] as Awaited<ReturnType<Commands['listTasks']>>
  const c = cmds({ listTasks: async () => rows })
  const human = await exec(['task', 'list', 'duo'], c)
  expect(human.out).toContain('t1'); expect(human.out).toContain('实现登录'); expect(human.out).toContain('builder@duo')
  expect(JSON.parse((await exec(['task', 'list', 'duo', '--json'], c)).out).result).toEqual(rows)
})
test('wl task list --stale prints id, title and command per item; --json carries the items', async () => {
  const items = [
    { taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' },
    { taskId: 't2', title: 'U', reason: 'owner_idle', owner: 'c@duo', since: 'T0', command: 'wl task start t2 --as c@duo' },
  ] as Awaited<ReturnType<Commands['listStale']>>
  const c = cmds({ listStale: async () => items })
  const r = await exec(['task', 'list', 'duo', '--stale'], c)
  for (const frag of ['t1', 'wl task recover t1', 't2', 'wl task start t2 --as c@duo', '→']) expect(r.out).toContain(frag)
  expect(JSON.parse((await exec(['task', 'list', 'duo', '--stale', '--json'], c)).out).result).toEqual(items)
})
test('wl task show passes --team and --history; --history prints one line per log row with the actor source', async () => {
  let seen: unknown
  const history = [
    { id: 1, team: 'duo', taskId: 't1', epoch: 0, at: '2026-10-15T00:00:00.000Z', actor: 'human', actorSource: 'human', action: 'create', detail: null },
    { id: 2, team: 'duo', taskId: 't1', epoch: 0, at: '2026-10-15T00:01:00.000Z', actor: 'builder@duo', actorSource: 'explicit', action: 'claim', detail: null },
    { id: 3, team: 'duo', taskId: 't1', epoch: 0, at: '2026-10-15T00:02:00.000Z', actor: 'builder@duo', actorSource: 'implicit', action: 'start', detail: '{"delivery":"self"}' },
  ] as NonNullable<Shown['history']>
  const r = await exec(['task', 'show', 't1', '--team', 'duo', '--history'], cmds({ showTask: async (_d, a) => { seen = a; return shownTask({ history }) } }))
  expect(seen).toEqual({ id: 't1', team: 'duo', history: true })
  for (const frag of ['create', 'claim', 'start', '显式', '隐式', 'builder@duo']) expect(r.out).toContain(frag)
  expect(r.out.split('\n').filter((l) => /create|claim|start/.test(l) && l.includes('2026-10-15')).length).toBeGreaterThanOrEqual(3)
})
test('wl task show prints title, status and the closure line', async () => {
  const handed = await exec(['task', 'show', 't1'], cmds({ showTask: async () => shownTask({ closure: { kind: 'handed_to', targets: ['checker@duo'] } }) }))
  expect(handed.out).toContain('实现登录'); expect(handed.out).toContain('checker@duo'); expect(handed.out).toContain('已转交给')
  const reviewed = await exec(['task', 'show', 't1'], cmds({ showTask: async () => shownTask({ closure: { kind: 'sent_for_review', targets: ['checker@duo'] } }) }))
  expect(reviewed.out).toContain('已送审给')
})
test('claim / start / plan / done / resolve are wired with their arguments', async () => {
  const seen: Record<string, unknown> = {}
  const c = cmds({
    claimTask: async (_d, a) => { seen.claim = a },
    startTask: async (_d, a) => { seen.start = a; return { delivery: 'self' } },
    planTask: async (_d, a) => { seen.plan = a },
    doneTask: async (_d, a) => { seen.done = a; return { outcome: 'done', closure: { kind: 'completed' }, linkedTasks: [] } },
    resolveGate: async (_d, a) => { seen.resolve = a; return { taskId: 't1', status: 'ready', claimedBy: 'builder@duo' } },
  })
  await exec(['task', 'claim', 't1', '--as', 'builder@duo'], c)
  await exec(['task', 'start', 't1', '--as', 'builder@duo'], c)
  await exec(['task', 'plan', 't1', '先读 $(code)，再改'], c)
  await exec(['task', 'done', 't1', '--as', 'builder@duo'], c)
  await exec(['task', 'resolve', 'gate-1', '--resolution', '重试', '--reassign', 'checker@duo', '--as', 'builder@duo'], c)
  expect(seen).toEqual({
    claim: { id: 't1', as: 'builder@duo' },
    start: { id: 't1', as: 'builder@duo' },
    plan: { id: 't1', text: '先读 $(code)，再改' },
    done: { id: 't1', as: 'builder@duo' },
    resolve: { gateId: 'gate-1', resolution: '重试', reassign: 'checker@duo', as: 'builder@duo' },
  })
})
test('wl task done prints linked tasks (including skipped ones), the closure line, and "replayed"', async () => {
  const r = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({
    outcome: 'done', closure: { kind: 'sent_for_review', targets: ['checker@duo', 'auditor@duo'] }, replayed: true,
    linkedTasks: [
      { target: 'checker@duo', taskId: 'c1', delivery: 'notified' },
      { target: 'auditor@duo', taskId: 'c2', delivery: 'skipped_offline' },
      { target: 'docs@duo', taskId: 'c3', delivery: 'skipped_frozen' },
    ],
  }) }))
  expect(r.code).toBe(0)
  for (const frag of ['已送审给', 'checker@duo', 'auditor@duo', 'c1', 'c2', 'c3', 'docs@duo']) expect(r.out).toContain(frag)
})
test('wl task done gate_failed prints the output file path; escalated prints the gate id; --json still emits the document with exit 1', async () => {
  const failed = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({ outcome: 'gate_failed', gateOutputPath: '/h/logs/duo/gate-t1-0-1.txt' }) }))
  expect(failed.code).toBe(1); expect(failed.out + failed.err).toContain('/h/logs/duo/gate-t1-0-1.txt')
  const esc = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({ outcome: 'escalated', gateId: 'gate-7', closure: { kind: 'escalated' } }) }))
  expect(esc.code).toBe(1); expect(esc.out + esc.err).toContain('gate-7')
  const json = await exec(['task', 'done', 't1', '--json'], cmds({ doneTask: async () => ({ outcome: 'gate_failed_after_bypass', gateOutputPath: '/f' }) }))
  expect(json.code).toBe(1); expect(JSON.parse(json.out)).toMatchObject({ ok: true, result: { outcome: 'gate_failed_after_bypass' } })
})
test('wl task escalate mentions the dispatch being taken back only when it was', async () => {
  const taken = await exec(['task', 'escalate', 't1', '--reason', 'x'], cmds({ escalateTask: async () => ({ gateId: 'gate-1', status: 'blocked', tookBackDispatch: true }) }))
  expect(taken.out).toContain('gate-1'); expect(taken.out).toContain('收回'); expect(taken.out).toContain('resolve')
  const plain = await exec(['task', 'escalate', 't1', '--reason', 'x'], cmds({ escalateTask: async () => ({ gateId: 'gate-1', status: 'blocked', tookBackDispatch: false }) }))
  expect(plain.out).toContain('gate-1'); expect(plain.out).not.toContain('收回')
})
test('wl task start reports the delivery; recover reports the new state; task errors use the standard exit codes and --json error document', async () => {
  const start = await exec(['task', 'start', 't1', '--as', 'builder@duo'], cmds({ startTask: async () => ({ delivery: 'not_notified', reason: 'at_prompt' }) }))
  expect(start.code).toBe(0); expect(start.out).toContain('wl send')
  const rec = await exec(['task', 'recover', 't1'], cmds({ recoverTask: async () => ({ status: 'queued', epoch: 1, delivery: 'queued' }) }))
  expect(rec.code).toBe(0); expect(rec.out).toContain('排队')
  const errs = [['input', 1], ['orca', 2], ['uncertain', 3]] as const
  for (const [kind, code] of errs) {
    const r = await exec(['task', 'claim', 't1'], cmds({ claimTask: async () => { throw new WinglineError(kind, 'c', 'm', { hint: 'h' }) } }))
    expect(r.code).toBe(code)
  }
  const j = await exec(['task', 'claim', 't1', '--json'], cmds({ claimTask: async () => { throw new WinglineError('input', 'tags_mismatch', 'm', { hint: 'h' }) } }))
  expect(JSON.parse(j.out)).toEqual({ ok: false, error: { kind: 'input', code: 'tags_mismatch', message: 'm', hint: 'h' } })
})
test('the registry is closed after a task command, also when it fails', async () => {
  const before = closed
  await exec(['task', 'release', 't1'], cmds({ releaseTask: async () => {} }))
  await exec(['task', 'release', 't1'], cmds({ releaseTask: async () => { throw new Error('boom') } }))
  expect(closed).toBe(before + 2)
})

test('wl task list --stale without a team is allowed and passes team undefined', async () => {
  let team: unknown = 'unset'
  const r = await exec(['task', 'list', '--stale'], cmds({ listStale: async (_d, t) => { team = t; return [] } }))
  expect(r.code).toBe(0); expect(team).toBeUndefined()
})
test('wl task recover shows the real post address in the wl send suggestion', async () => {
  const r = await exec(['task', 'recover', 't1'], cmds({ recoverTask: async () => ({ status: 'dispatched', epoch: 1, delivery: 'not_notified', owner: 'builder@duo' }) as never }))
  expect(r.out).toContain('wl send builder@duo'); expect(r.out).not.toContain('<岗位地址>')
})
test('up --adopt-run together with --new-run reports through the normal error path: --json gets the error document, exit 1, up not called', async () => {
  let called = 0
  const r = await exec(['up', 'x', '--adopt-run', 'run-9', '--new-run', '--json'], cmds({ up: async () => { called++; return { team: 'duo', posts: [] } } }))
  expect(r.code).toBe(1); expect(called).toBe(0)
  expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { kind: 'input' } })
  expect(r.err).toBe('')
})

test('B-M3: --json on a commander usage error still prints one JSON error document (exit 1)', async () => {
  const r = await exec(['task', 'create', 'duo', '--json'])
  expect(r.code).toBe(1)
  expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { kind: 'input' } })
})
test('B-M8: wl up --new-run says the old tasks no longer appear in wl task list', async () => {
  const c = cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }], run: { outcome: 'created', runId: 'run-2' } }) })
  const r = await exec(['up', 'x', '--new-run'], c)
  expect(r.out).toContain('wl task list')
})
test('B-M10: wl task done names why a link target was not typed and suggests wl send', async () => {
  const r = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({
    outcome: 'done', closure: { kind: 'sent_for_review', targets: ['checker@duo'] },
    linkedTasks: [{ target: 'checker@duo', taskId: 'c1', delivery: 'not_notified', reason: 'at_prompt' }],
  }) as never }))
  expect(r.out).toContain('wl send checker@duo')
  expect(r.out).toContain('at_prompt')
})

test('F-5: the verified Orca range starts at 1.4.222 (the 2A orchestration semantics were verified there)', async () => {
  const { inRange } = await import('@wingline/core')
  const verified = JSON.parse(fs.readFileSync(new URL('../src/verified.json', import.meta.url), 'utf8')) as { verifiedOrca: string }
  expect(inRange('1.4.221', verified.verifiedOrca)).toBe(false)
  expect(inRange('1.4.222', verified.verifiedOrca)).toBe(true)
  expect(inRange('1.4.224', verified.verifiedOrca)).toBe(true)
  expect(inRange('1.5.0', verified.verifiedOrca)).toBe(false)
})

test('wl dispatcher up --json prints the outcome; start unconfirmed exits 3', async () => {
  const r = await exec(['dispatcher', 'up', 'duo', '--json'], cmds({ dispatcherUp: async () => ({ address: 'dispatcher@duo', outcome: 'started' }) }))
  expect(JSON.parse(r.out).result.outcome).toBe('started')
  expect((await exec(['dispatcher', 'up', 'duo'], cmds({ dispatcherUp: async () => { throw new WinglineError('uncertain', 'dispatcher_start_unconfirmed', 'x') } }))).code).toBe(3)
})
test('wl dispatcher run passes --home/--orca/summarize into deps construction and awaits the loop', async () => {
  let seen: { team?: string; home?: string } = {}
  let overrides: unknown
  const mk = (_env: NodeJS.ProcessEnv, _warn: (m: string) => void, o?: unknown) => { overrides = o; return { home: (o as { home: string }).home, registry: { close() {} } } as unknown as CommandDeps }
  const h = io()
  const code = await run(['dispatcher', 'run', 'duo', '--home', '/tmp/h', '--orca', '/tmp/orca'], h.io,
    cmds({ runDispatcherLoop: async (d, t) => { seen = { team: t, home: d.home } } }), mk)
  expect(code).toBe(0); expect(seen).toEqual({ team: 'duo', home: '/tmp/h' })
  expect(overrides).toEqual({ home: '/tmp/h', orca: '/tmp/orca', summarize: true })
})
test('defaultMakeDeps: overrides become WINGLINE_HOME / WINGLINE_ORCA and summarize is wired', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const deps = defaultMakeDeps({ PATH: '', WINGLINE_HOME: '/ignored' }, () => {}, { home, orca: process.execPath, summarize: true })
  try {
    expect(deps.home).toBe(home)
    expect(deps.orcaPath).toBe(process.execPath)
    expect(fs.existsSync(path.join(home, 'logs'))).toBe(true)
  } finally { deps.registry.close(); fs.rmSync(home, { recursive: true, force: true }) }
})
test('isReadOnlyCall is true for READ_ONLY_CALLS entries and false for mutating calls', () => {
  const [group, sub] = READ_ONLY_CALLS[0]!
  expect(isReadOnlyCall([group, sub, '--json'])).toBe(true)
  expect(isReadOnlyCall(['orchestration', 'send', '--json'])).toBe(false)
  expect(isReadOnlyCall(['terminal', 'create'])).toBe(false)
})
test('wl dispatcher freeze passes --reason through and reports success', async () => {
  let seen: unknown
  const r = await exec(['dispatcher', 'freeze', 'builder@duo', '--reason', '等人看'], cmds({ freezePostCmd: async (_d, a) => { seen = a } }))
  expect(seen).toEqual({ address: 'builder@duo', reason: '等人看' })
  expect(r.out).toContain('builder@duo 已冻结')
})
test('wl attention renders every section with commands; healthy dispatcher last, stale first; gate split from other stale', async () => {
  const base = {
    team: 'duo',
    frozen: [{ post: 'builder@duo', reason: '循环', frozenAt: 'F', skippedChildren: 2 }],
    signals: [{ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't2', level: 2, command: 'wl send checker@duo hi' }],
    questions: [{ team: 'duo', messageId: 'msg-7', asker: 'builder@duo', body: '用 a 还是 b', options: ['a', 'b'] }],
    stale: [
      { taskId: 't3', title: 'G', reason: 'blocked_waiting', owner: null, since: null, command: 'wl task resolve g1 --resolution <决定>' },
      { taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' },
    ],
    unavailable: [],
  }
  const healthy = await exec(['attention', 'duo'], cmds({ attention: async () => ({ ...base, dispatcher: { state: 'running', ageMs: 12_000 } }) as never }))
  const lines = healthy.out.trimEnd().split('\n')
  expect(lines.at(-1)).toContain('调度员：运行中（心跳 12 秒前）')
  for (const c of ['wl dispatcher unfreeze builder@duo', 'wl send checker@duo hi', 'wl dispatcher reply duo msg-7 --body <回答>', 'wl task resolve g1', 'wl task recover t1']) expect(healthy.out).toContain(c)
  expect(healthy.out).toContain('用 a 还是 b')
  const gate = lines.findIndex((l) => l.startsWith('待决的 gate'))
  const rest = lines.findIndex((l) => l.startsWith('其余卡住的任务'))
  expect(gate).toBeGreaterThan(-1); expect(rest).toBeGreaterThan(gate)
  expect(lines[gate + 1]).toContain('t3'); expect(lines[gate + 1]).not.toContain('t1')
  expect(lines[rest + 1]).toContain('t1')
  const stale = await exec(['attention', 'duo'], cmds({ attention: async () => ({ ...base, dispatcher: { state: 'stale', ageMs: 540_000 } }) as never }))
  expect(stale.out.split('\n')[0]).toContain('调度员：失联')
})
test('wl dispatcher freeze requires --reason; hush parses --for; reply passes --again', async () => {
  expect((await exec(['dispatcher', 'freeze', 'builder@duo'], cmds())).code).toBe(1)
  const seen: unknown[] = []
  const c = cmds({ hushCmd: async (_d, a) => { seen.push(a); return { until: 'U' } }, dispatcherReply: async (_d, a) => { seen.push(a); return { messageId: 'm', duplicate: false } } })
  await exec(['dispatcher', 'hush', 'checker@duo', '--for', '15m'], c)
  await exec(['dispatcher', 'reply', 'duo', 'msg-1', '--body', '用 a', '--again'], c)
  expect(seen).toEqual([{ address: 'checker@duo', forMs: 900_000 }, { team: 'duo', messageId: 'msg-1', body: '用 a', again: true }])
})
test('wl attention prints commands and marks unavailable sources', async () => {
  const r = await exec(['attention', 'duo'], cmds({ attention: async () => ({ team: 'duo', dispatcher: { state: 'stale', ageMs: 540_000 }, frozen: [], signals: [], questions: [],
    stale: [{ taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' }], unavailable: [] }) }))
  expect(r.out.split('\n')[0]).toContain('调度员')
  expect(r.out).toContain('wl task recover t1')
  const u = await exec(['attention', 'duo'], cmds({ attention: async () => ({ team: 'duo', dispatcher: { state: 'running', ageMs: 12_000 }, frozen: [], signals: [], questions: [], stale: [], unavailable: ['orca: runtime_unavailable'] }) }))
  expect(u.out).toContain('不可用（orca: runtime_unavailable）')
})
test('wl dispatcher unfreeze lists skipped commands; invalid --for exits 1', async () => {
  const r = await exec(['dispatcher', 'unfreeze', 'builder@duo'], cmds({ unfreezePostCmd: async () => ({ skipped: [{ taskId: 't9', command: 'wl task reassign t9 --to builder@duo' }] }) }))
  expect(r.out).toContain('wl task reassign t9 --to builder@duo')
  expect((await exec(['dispatcher', 'hush', 'checker@duo', '--for', 'abc'], cmds())).code).toBe(1)
})
test('wl ps shows the dispatcher line under the team title', async () => {
  const row = { address: 'builder@duo', agent: 'claude', status: 'live' as const, handle: 'h1', worktree: 'current', isLead: true }
  const r = await exec(['ps'], cmds({ ps: async () => [{ ...row, dispatcher: { state: 'stale', ageMs: 540_000 } }] }))
  expect(r.out).toContain('调度员：失联（心跳 9 分钟前）')
})
