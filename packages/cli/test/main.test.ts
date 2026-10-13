import { PassThrough } from 'node:stream'
import { afterEach, expect, test } from 'vitest'
import { WinglineError, type CommandDeps } from '@wingline/core'
import { installWarningFilter, run, type Commands } from '../src/cli.js'

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
