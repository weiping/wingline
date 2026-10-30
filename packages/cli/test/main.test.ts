import fs from 'node:fs'
import { PassThrough } from 'node:stream'
import { afterEach, expect, test } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { READ_ONLY_CALLS, WinglineError, WRITE_COMMANDS, type AttentionReport, type CommandDeps, type RestoreResult, type TimelineEvent } from '@weiping/wingline-core'
import { AUDIT } from '../src/audit-table.js'
import { callLogOptions, defaultMakeDeps, installWarningFilter, isReadOnlyCall, run, type Commands } from '../src/cli.js'

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
  init: async (_d, a) => ({ team: a.name ?? '-', specPath: `/h/teams/${a.name ?? '-'}/team.yaml`, created: true }),
  up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }] }),
  ps: async () => [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h1', worktree: 'current', isLead: true }],
  send: async (_d, a) => ({ address: a.address, outcome: 'delivered', handle: 'h1' }),
  down: async (_d, a) => ({ team: a.team, posts: [{ address: 'builder@duo', outcome: a.close ? 'closed' : 'stopped' }] }),
  restore: async () => { throw new Error('未注入：restore') },
  console: async () => ({ outcome: 'link' as const, url: 'http://127.0.0.1:1/auth?token=x' }),
  log: async () => { throw new Error('未注入：log') },
  followLog: async () => { throw new Error('未注入：followLog') },
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
  tui: async () => { throw new Error('未注入：tui') },
  ...over,
})
const exec = (argv: string[], c: Commands = cmds()) => {
  const h = io()
  return run(argv, h.io, c, makeDeps).then((code) => ({ code, out: h.out(), err: h.err() }))
}

/** Commands 里允许只读、不进审计表的字段（新增命令忘了登记时下面那条测试会失败）。 */
// console 只起本地服务、开标签页，不改团队状态，所以不进审计表
const READ_COMMANDS = ['ps', 'listTasks', 'listStale', 'showTask', 'runDispatcherLoop', 'dispatcherStatus', 'attention', 'log', 'followLog', 'console', 'tui']

test('every write command is in the audit table and no read command is', () => {
  expect(Object.keys(AUDIT).sort()).toEqual([...WRITE_COMMANDS].sort())
  expect(Object.keys(cmds()).sort()).toEqual([...WRITE_COMMANDS, ...READ_COMMANDS].sort())
  expect(AUDIT.restore!.skip!({ team: 'duo', dryRun: true })).toBe(true)
  expect(AUDIT.restore!.skip!({ team: 'duo' })).toBe(false)
})

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

test('up --draft passes draft: true through; without it draft is not set', async () => {
  const seen: unknown[] = []
  const c = cmds({ up: async (_d, a) => { seen.push(a); return { team: 'duo', posts: [] } } })
  await exec(['up', 'x', '--draft'], c)
  await exec(['up', 'x'], c)
  expect(seen).toEqual([expect.objectContaining({ specPath: 'x', draft: true }), expect.objectContaining({ specPath: 'x', draft: false })])
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
  const { inRange } = await import('@weiping/wingline-core')
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
test.each(['SIGHUP', 'SIGTERM', 'SIGINT'] as const)('final-review I2: wl dispatcher run aborts the loop on %s and removes its listeners afterwards', async (sig) => {
  let aborted: boolean | undefined
  const before = process.listenerCount(sig)
  const mk = () => ({ home: '/tmp/h', registry: { close() {} } }) as unknown as CommandDeps
  const code = await run(['dispatcher', 'run', 'duo'], io().io,
    cmds({ runDispatcherLoop: async (_d, _t, o) => { process.emit(sig); aborted = o?.signal?.aborted } }), mk)
  expect(code).toBe(0); expect(aborted).toBe(true)
  expect(process.listenerCount(sig)).toBe(before)
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
test('callLogOptions installs the summarize predicate only when summarize is set', () => {
  expect(callLogOptions({ summarize: true })).toEqual({ summarize: isReadOnlyCall })
  expect(callLogOptions({})).toEqual({})
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
  const base: Omit<AttentionReport, 'dispatcher'> = {
    team: 'duo',
    frozen: [{ post: 'builder@duo', reason: '循环', frozenAt: 'F', skippedChildren: 2 }],
    signals: [{ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't2', level: 2, since: 'S', levelAt: 'L', lastNudgedAt: null, notifyCount: 1, nextDueAt: null, clearedAt: null, command: 'wl send checker@duo hi', summary: null }],
    questions: [{ team: 'duo', messageId: 'msg-7', asker: 'builder@duo', body: '用 a 还是 b', options: ['a', 'b'], taskId: null, dispatchId: null, relayedAt: 'R', answeredAt: null }],
    stale: [
      { taskId: 't3', title: 'G', reason: 'blocked_waiting', owner: null, since: null, command: 'wl task resolve g1 --resolution <决定>' },
      { taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' },
    ],
    unavailable: [],
    warnings: [],
  }
  const report = (dispatcher: AttentionReport['dispatcher']): AttentionReport => ({ ...base, dispatcher })
  const healthy = await exec(['attention', 'duo'], cmds({ attention: async () => report({ state: 'running', ageMs: 12_000 }) }))
  const lines = healthy.out.trimEnd().split('\n')
  expect(lines.at(-1)).toContain('调度员：运行中（心跳 12 秒前）')
  for (const c of ['wl dispatcher unfreeze builder@duo', 'wl send checker@duo hi', 'wl dispatcher reply duo msg-7 --body <回答>', 'wl task resolve g1', 'wl task recover t1']) expect(healthy.out).toContain(c)
  expect(healthy.out).toContain('用 a 还是 b')
  const gate = lines.findIndex((l) => l.startsWith('待决的 gate'))
  const rest = lines.findIndex((l) => l.startsWith('其余卡住的任务'))
  expect(gate).toBeGreaterThan(-1); expect(rest).toBeGreaterThan(gate)
  expect(lines[gate + 1]).toContain('t3'); expect(lines[gate + 1]).not.toContain('t1')
  expect(lines[rest + 1]).toContain('t1')
  const stale = await exec(['attention', 'duo'], cmds({ attention: async () => report({ state: 'stale', ageMs: 540_000 }) }))
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
    stale: [{ taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' }], unavailable: [], warnings: [] }) }))
  expect(r.out.split('\n')[0]).toContain('调度员')
  expect(r.out).toContain('wl task recover t1')
  const u = await exec(['attention', 'duo'], cmds({ attention: async () => ({ team: 'duo', dispatcher: { state: 'running', ageMs: 12_000 }, frozen: [], signals: [], questions: [], stale: [], unavailable: ['orca: runtime_unavailable'], warnings: [] }) }))
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

// —— wl restore / wl log ——

/** 时间列按本地时区渲染，测试里用同一个算法算期望值，不断言某个固定时区。 */
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
const ymd = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'command:1', at: '2026-10-16T10:00:01.000Z', source: 'command', actor: 'human', action: 'send', target: 'builder@duo', outcome: 'ok', detail: null, ...over,
})

const restoreResult = (over: Partial<RestoreResult> = {}): RestoreResult => ({
  team: 'duo', dryRun: false, posts: [{ address: 'builder@duo', outcome: 'resumed', sessionId: 's1' }],
  run: { outcome: 'kept', runId: 'run-1' }, dispatcher: { action: 'left', state: 'running' }, tasks: [], ...over,
})

test('wl restore passes dry-run/no-tasks/session through, prints the result and exits 3 when ambiguous', async () => {
  let seen: unknown
  const res = restoreResult({
    posts: [{ address: 'builder@duo', outcome: 'ambiguous', candidates: [{ sessionId: 's1', updatedAt: null, messageCount: 3 }] }],
    tasks: [{ taskId: '', owner: '', outcome: 'skipped', reason: '协调者未认领，未恢复任务；稍后重跑 wl restore' }],
  })
  const r = await exec(
    ['restore', 'duo', '--json', '--no-tasks', '--session', 'builder=s1', '--session', 'checker=s2'],
    cmds({ restore: async (_d, a) => { seen = a; return res } }),
  )
  expect(seen).toEqual({ team: 'duo', dryRun: false, noTasks: true, sessions: { builder: 's1', checker: 's2' } })
  expect(r.code).toBe(3)
  expect(JSON.parse(r.out).result).toEqual(res)
})

// —— wl restore --all（3D-1）——

type TeamStub = { name: string; status: string }
/** `--all` 要读注册表里的团队列表和 Orca 状态；其余测试用的假 deps 没有这些。 */
const allDeps = (teams: TeamStub[], seen: { overrides?: unknown } = {}, orca: Record<string, unknown> = {}) =>
  ((_env: NodeJS.ProcessEnv, _warn: unknown, overrides?: unknown) => {
    seen.overrides = overrides
    let t = 0
    return { registry: { close: () => { closed++ }, listTeams: () => teams }, orca, monotonic: () => (t += 3_600_000) } as unknown as CommandDeps
  }) as unknown as Parameters<typeof run>[3]
const execAll = (argv: string[], c: Commands, teams: TeamStub[] = [{ name: 'duo', status: 'up' }], seen?: { overrides?: unknown }, orca?: Record<string, unknown>) => {
  const h = io()
  return run(argv, h.io, c, allDeps(teams, seen, orca)).then((code) => ({ code, out: h.out(), err: h.err() }))
}

test('wl restore --all restores every up team through the audited restore, passing the options and --actor along', async () => {
  const seen: unknown[] = []
  const r = await execAll(['restore', '--all', '--no-tasks', '--actor', 'autostart'], cmds({ restore: async (_d, a) => { seen.push(a); return restoreResult({ team: a.team }) } }),
    [{ name: 'duo', status: 'up' }, { name: 'old', status: 'stopped' }, { name: 'trio', status: 'up' }])
  expect(seen).toEqual([
    { team: 'duo', dryRun: false, noTasks: true, as: 'autostart' },
    { team: 'trio', dryRun: false, noTasks: true, as: 'autostart' },
  ])
  expect(r.code).toBe(0)
  expect(r.out).toContain('团队 duo')
  expect(r.out).toContain('团队 trio')
  expect(r.out).not.toContain('团队 old')
})

test('wl restore --all has the same JSON envelope shape and the worst exit code across teams', async () => {
  const r = await execAll(['restore', '--all', '--json'], cmds({
    restore: async (_d, a) => restoreResult({ team: a.team, posts: a.team === 'duo' ? [{ address: 'builder@duo', outcome: 'ambiguous', candidates: [] }] : [] }),
  }), [{ name: 'duo', status: 'up' }, { name: 'trio', status: 'up' }])
  expect(r.code).toBe(3)
  expect(JSON.parse(r.out).result.teams.map((t: { team: string }) => t.team)).toEqual(['duo', 'trio'])
})

test('wl restore --all: a team that is busy is reported and exits 1 while the others are still restored', async () => {
  const r = await execAll(['restore', '--all'], cmds({
    restore: async (_d, a) => {
      if (a.team === 'duo') throw new WinglineError('input', 'team_busy', '团队 duo 正在被另一个 wl 命令（pid 7）操作', { hint: '等待其完成后重试' })
      return restoreResult({ team: a.team })
    },
  }), [{ name: 'duo', status: 'up' }, { name: 'trio', status: 'up' }])
  expect(r.code).toBe(1)
  expect(r.out).toContain('team_busy')
  expect(r.out).toContain('等待其完成后重试')
  expect(r.out).toContain('团队 trio')
})

test('wl restore --all with no up team says so and exits 0 (JSON: empty teams)', async () => {
  const human = await execAll(['restore', '--all'], cmds(), [{ name: 'old', status: 'stopped' }])
  expect(human.code).toBe(0)
  expect(human.out).toContain('没有处于运行状态的团队')
  const json = await execAll(['restore', '--all', '--json'], cmds(), [])
  expect(JSON.parse(json.out)).toEqual({ ok: true, result: { teams: [] } })
})

test('wl restore: --all excludes <team> and --session; a team is needed without --all; --actor takes only autostart; --wait-orca needs --all', async () => {
  const code = async (argv: string[]) => {
    const r = await execAll([...argv, '--json'], cmds())
    return [r.code, JSON.parse(r.out).error.code]
  }
  expect(await code(['restore', 'duo', '--all'])).toEqual([1, 'restore_args_invalid'])
  expect(await code(['restore', '--all', '--session', 'builder=s1'])).toEqual([1, 'restore_args_invalid'])
  expect(await code(['restore'])).toEqual([1, 'restore_args_invalid'])
  expect(await code(['restore', 'duo', '--wait-orca', '15m'])).toEqual([1, 'restore_args_invalid'])
  expect(await code(['restore', 'duo', '--actor', 'root'])).toEqual([1, 'actor_invalid'])
  expect(await code(['restore', '--all', '--wait-orca', 'soon'])).toEqual([1, 'duration_invalid'])
})

test('wl restore --all --wait-orca waits for Orca first: unreachable within the budget exits 2 and restores nothing', async () => {
  const seen: unknown[] = []
  const r = await execAll(['restore', '--all', '--wait-orca', '0s', '--json'],
    cmds({ restore: async (_d, a) => { seen.push(a); return restoreResult({ team: a.team }) } }),
    [{ name: 'duo', status: 'up' }], undefined, { status: async () => ({ reachable: false }) })
  expect(r.code).toBe(2)
  expect(JSON.parse(r.out).error.code).toBe('runtime_unavailable')
  expect(seen).toEqual([])
})

test('wl restore accepts --home / --orca (the autostart command line carries them) and hands them to makeDeps', async () => {
  const seen: { overrides?: unknown } = {}
  await execAll(['restore', '--all', '--home', '/h', '--orca', '/o'], cmds(), [], seen)
  expect(seen.overrides).toMatchObject({ home: '/h', orca: '/o' })
  const one: { overrides?: unknown } = {}
  await execAll(['restore', 'duo', '--home', '/h2', '--orca', '/o2'], cmds({ restore: async () => restoreResult() }), [], one)
  expect(one.overrides).toMatchObject({ home: '/h2', orca: '/o2' })
})

test('a single-team wl restore without --actor passes no `as` (the executor is resolved as before)', async () => {
  let seen: unknown
  await execAll(['restore', 'duo'], cmds({ restore: async (_d, a) => { seen = a; return restoreResult() } }))
  expect(seen).toEqual({ team: 'duo', dryRun: false, noTasks: false, sessions: {} })
})

// —— wl autostart（3D-1）——

type SysCall = [string, ...string[]]
function autostartWorld(over: Record<string, unknown> = {}, replies: Record<string, { code: number; stdout: string; stderr: string }> = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-cli-autostart-'))
  const node = path.join(tmp, 'node'); const script = path.join(tmp, 'main.js')
  fs.writeFileSync(node, ''); fs.writeFileSync(script, '')
  const calls: SysCall[] = []
  const sys = {
    platform: 'linux' as NodeJS.Platform, homeDir: tmp, uid: 501, user: 'me', node, script, fs,
    exec: async (file: string, args: string[]) => { calls.push([file, ...args]); return replies[file] ?? { code: 0, stdout: '', stderr: '' } },
    ...over,
  }
  const home = path.join(tmp, '.wingline')
  const deps = (() => ({ registry: { close: () => { closed++ } }, home, orcaPath: '/opt/orca/bin/orca' }) as unknown as CommandDeps) as unknown as Parameters<typeof run>[3]
  const go = (argv: string[]) => { const h = io(); return run(argv, h.io, cmds(), deps, sys as never).then((code) => ({ code, out: h.out(), err: h.err() })) }
  return { tmp, node, script, calls, go, unit: path.join(tmp, '.config', 'systemd', 'user', 'wingline-restore.service') }
}
const posixOnly = process.platform === 'win32' ? test.skip : test

posixOnly('wl autostart install (Linux) writes the unit with the given wait budget and registers it; --json carries the details', async () => {
  const w = autostartWorld()
  const r = await w.go(['autostart', 'install', '--wait-orca', '20m', '--json'])
  expect(r.code).toBe(0)
  const result = JSON.parse(r.out).result
  expect(result).toMatchObject({ platform: 'linux', file: w.unit, waitOrca: '20m' })
  expect(result.command.slice(0, 4)).toEqual([w.node, w.script, 'restore', '--all'])
  expect(fs.readFileSync(w.unit, 'utf8')).toContain('--wait-orca 20m --actor autostart')
  expect(w.calls.map((c) => c.slice(1).join(' '))).toEqual(['--user show-environment', '--user daemon-reload', '--user enable wingline-restore.service'])
})

posixOnly('wl autostart install defaults to 15m and says where the log goes', async () => {
  const w = autostartWorld()
  const r = await w.go(['autostart', 'install'])
  expect(r.code).toBe(0)
  expect(fs.readFileSync(w.unit, 'utf8')).toContain('--wait-orca 15m')
  expect(r.out).toContain(w.unit)
  expect(r.out).toContain('autostart.log')
  expect(r.out).not.toContain('安装即执行一次')
})

posixOnly('wl autostart install on macOS says the agent runs once right away', async () => {
  const w = autostartWorld({ platform: 'darwin' })
  const r = await w.go(['autostart', 'install'])
  expect(r.code).toBe(0)
  expect(r.out).toContain('安装即执行一次')
  expect(w.calls.map((c) => c.slice(0, 2).join(' '))).toEqual(['/bin/launchctl bootout', '/bin/launchctl bootstrap'])
  expect(fs.existsSync(path.join(w.tmp, 'Library', 'LaunchAgents', 'wingline.restore.plist'))).toBe(true)
})

test('wl autostart install: Windows is unsupported (exit 1), and a bad --wait-orca is rejected', async () => {
  const w = autostartWorld({ platform: 'win32' })
  const win = await w.go(['autostart', 'install', '--json'])
  expect([win.code, JSON.parse(win.out).error.code]).toEqual([1, 'autostart_unsupported'])
  const bad = await autostartWorld().go(['autostart', 'install', '--wait-orca', 'soon', '--json'])
  expect([bad.code, JSON.parse(bad.out).error.code]).toEqual([1, 'duration_invalid'])
})

posixOnly('wl autostart install without a systemd user session exits 1 and writes nothing', async () => {
  const w = autostartWorld({}, { '/usr/bin/systemctl': { code: 1, stdout: '', stderr: 'Failed to connect to bus' } })
  const r = await w.go(['autostart', 'install', '--json'])
  expect([r.code, JSON.parse(r.out).error.code]).toEqual([1, 'autostart_unsupported'])
  expect(fs.existsSync(w.unit)).toBe(false)
})

posixOnly('wl autostart uninstall removes our file; uninstalling again still succeeds', async () => {
  const w = autostartWorld()
  await w.go(['autostart', 'install'])
  const first = await w.go(['autostart', 'uninstall'])
  expect(first.code).toBe(0)
  expect(first.out).toContain('已卸载')
  expect(fs.existsSync(w.unit)).toBe(false)
  const again = await w.go(['autostart', 'uninstall', '--json'])
  expect([again.code, JSON.parse(again.out).result]).toEqual([0, expect.objectContaining({ removed: false })])
})

posixOnly('wl autostart status: not installed, then installed with a missing node and linger off', async () => {
  const w = autostartWorld({}, { '/usr/bin/loginctl': { code: 0, stdout: 'Linger=no\n', stderr: '' } })
  const none = await w.go(['autostart', 'status'])
  expect(none.code).toBe(0)
  expect(none.out).toContain('未安装')

  await w.go(['autostart', 'install'])
  const ok = await w.go(['autostart', 'status', '--json'])
  expect(JSON.parse(ok.out).result).toMatchObject({ installed: true, location: w.unit, commandMissing: [], linger: false })

  fs.rmSync(w.node)
  const gone = await w.go(['autostart', 'status'])
  expect(gone.code).toBe(0)
  expect(gone.out).toContain('已安装')
  expect(gone.out).toContain(w.node)
  expect(gone.out).toContain('wl autostart install')
  expect(gone.out).toContain('loginctl enable-linger me')
})

test('wl restore shows a post note under the post line, and an uncertain remote resume exits 3 with its reason and retry command', async () => {
  const note = await exec(['restore', 'duo'], cmds({
    restore: async () => restoreResult({ posts: [{ address: 'builder@duo', outcome: 'resumed', sessionId: 's1', note: '未能确认接回提示落在原会话里：远端搜索没有命中接回标识' }] }),
  }))
  expect(note.code).toBe(0)
  expect(note.out).toContain('注：未能确认接回提示落在原会话里')
  const bad = await exec(['restore', 'duo'], cmds({
    restore: async () => restoreResult({ posts: [{ address: 'builder@duo', outcome: 'uncertain', sessionId: 's1', reason: '接回提示落进了另一个会话（s2）', retry: 'wl restore duo' }] }),
  }))
  expect(bad.code).toBe(3)
  expect(bad.out).toContain('接回提示落进了另一个会话（s2）')
  expect(bad.out).toContain('试：wl restore duo')
})

test('wl restore rejects --session without = and lists ambiguous candidates with the retry command', async () => {
  expect((await exec(['restore', 'duo', '--session', 'builder'], cmds())).code).toBe(1)
  const r = await exec(['restore', 'duo'], cmds({
    restore: async () => restoreResult({
      posts: [{ address: 'builder@duo', outcome: 'ambiguous', candidates: [{ sessionId: 's1', updatedAt: null, messageCount: 3 }] }],
      tasks: [{ taskId: 'task-7', owner: 'builder@duo', outcome: 'skipped', reason: '任务主人未接回（ambiguous），不能替它恢复任务', retry: 'wl restore duo --session builder=s1' }],
    }),
  }))
  expect(r.code).toBe(3)
  expect(r.out).toContain('builder@duo')
  expect(r.out).toContain('wl restore duo --session builder=s1')
})

test('wl log prints one line per event and a date row when the day changes', async () => {
  const events = [ev({}), ev({ id: 'task:1', at: '2026-10-17T09:00:00.000Z', source: 'task', actor: 'builder@duo', action: 'done', target: 'task-1#2', outcome: null })]
  const r = await exec(['log', 'duo'], cmds({ log: async () => ({ events, cursor: { task: 1, patrol: 0, command: 1 } }) }))
  const lines = r.out.trimEnd().split('\n')
  expect(lines[0]).toBe(`${hhmm('2026-10-16T10:00:01Z')}  命令  human  send  builder@duo  ok`)
  expect(lines[1]).toBe(`—— ${ymd('2026-10-17T09:00:00Z')} ——`)
  expect(lines[2]).toBe(`${hhmm('2026-10-17T09:00:00Z')}  任务  builder@duo  done  task-1#2`)
})

test.each([['--limit', 'abc'], ['--limit', '0'], ['--limit', '1.5'], ['--source', 'bogus']])('wl log %s %s is an input error (exit 1) and reads nothing', async (flag, value) => {
  let called = false
  const r = await exec(['log', 'duo', flag, value], cmds({ log: async () => { called = true; return { events: [], cursor: { task: 0, patrol: 0, command: 0 } } } }))
  expect(r.code).toBe(1)
  expect(called).toBe(false)
  expect(r.err).toContain(flag)
})

test('wl log accepts a positive integer --limit and a known --source', async () => {
  let seen: unknown
  const r = await exec(['log', 'duo', '--limit', '5', '--source', 'patrol'], cmds({ log: async (_d, a) => { seen = a; return { events: [], cursor: { task: 0, patrol: 0, command: 0 } } } }))
  expect(r.code).toBe(0)
  expect(seen).toMatchObject({ limit: 5, source: 'patrol' })
})

test('wl log --follow --json streams NDJSON, exits 0 on SIGINT and drops its listeners', async () => {
  const before = process.listenerCount('SIGINT')
  const mk = () => ({ registry: { close() {} } }) as unknown as CommandDeps
  const h = io()
  let aborted: boolean | undefined
  const code = await run(['log', 'duo', '--follow', '--json'], h.io, cmds({
    log: async () => ({ events: [ev({})], cursor: { task: 0, patrol: 0, command: 1 } }),
    followLog: async (_d, _a, emit, o) => {
      emit(ev({ id: 'command:2', action: 'task done' }))
      process.emit('SIGINT')
      aborted = o!.signal.aborted
    },
  }), mk)
  expect(code).toBe(0)
  expect(aborted).toBe(true)
  expect(process.listenerCount('SIGINT')).toBe(before)
  const lines = h.out().trimEnd().split('\n')
  expect(lines.map((l) => JSON.parse(l).id)).toEqual(['command:1', 'command:2'])
})

// —— wl init（3E-2）——

test('wl init 用模板生成团队并打印生成目录', async () => {
  const h = io()
  const code = await run(['init', 'my-team', '--repo', '/tmp/repo', '--template', 'solo', '--json'], h.io, cmds(), makeDeps)
  expect(code).toBe(0)
  const out = JSON.parse(h.out())
  expect(out.ok).toBe(true)
  expect(out.result.team).toBe('my-team')
  expect(out.result.created).toBe(true)
})

test('wl init passes name/repo/template/dir through in template mode', async () => {
  let seen: unknown
  await exec(['init', 'duo', '--repo', '/tmp/repo', '--dir', '/tmp/d'], cmds({
    init: async (_d, a) => { seen = a; return { team: 'duo', specPath: '/tmp/d/team.yaml', created: true } },
  }))
  expect(seen).toEqual({ mode: 'template', name: 'duo', repo: '/tmp/repo', template: undefined, dir: '/tmp/d' })
})

test('wl init --import passes the spec path and rejects a team name alongside', async () => {
  let seen: unknown
  await exec(['init', '--import', '/tmp/t/team.yaml'], cmds({
    init: async (_d, a) => { seen = a; return { team: 'duo', specPath: '/tmp/t/team.yaml', created: true } },
  }))
  expect(seen).toEqual({ mode: 'import', specPath: '/tmp/t/team.yaml' })
  expect((await exec(['init', 'duo', '--import', '/tmp/t/team.yaml', '--json'], cmds())).code).toBe(1)
})

test('wl init requires a team name and --repo in template mode (exit 1, init not called)', async () => {
  let called = 0
  const c = cmds({ init: async () => { called++; return { team: 'x', specPath: 'p', created: true } } })
  expect((await exec(['init'], c)).code).toBe(1)
  expect((await exec(['init', 'duo'], c)).code).toBe(1)
  expect(called).toBe(0)
})

test('wl init human output names the spec path and the follow-up wl up command', async () => {
  const r = await exec(['init', 'duo', '--repo', '/tmp/repo'], cmds({
    init: async () => ({ team: 'duo', specPath: '/h/teams/duo/team.yaml', created: true }),
  }))
  expect(r.out).toContain('已生成团队 duo')
  expect(r.out).toContain('/h/teams/duo/team.yaml')
  expect(r.out).toContain('wl up /h/teams/duo/team.yaml')
})
