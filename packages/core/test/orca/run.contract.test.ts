import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createCallLog } from '../../src/log/call-log.js'
import type { OrcaExecutable } from '../../src/orca/resolve.js'
import { createOrcaRunner } from '../../src/orca/run.js'

const ROOT = path.resolve(__dirname, '../../../..')
const FAKE = path.join(ROOT, 'test/fake-orca')
const fixture = (n: string) => fs.readFileSync(path.join(ROOT, 'test/fixtures/receipts', n), 'utf8')

type Entry = { match: string[]; stdout: string; exitCode: number; delayMs?: number }
let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-run-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function runnerWith(script: Entry[]) {
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script))
  process.env.FAKE_ORCA_SCRIPT = path.join(dir, 'script.json')
  process.env.FAKE_ORCA_ARGV_LOG = path.join(dir, 'argv.log')
  const exe: OrcaExecutable =
    process.platform === 'win32'
      ? { file: process.env.ComSpec ?? 'cmd.exe', prefixArgs: ['/d', '/s', '/c'], viaCmd: true, cmdPath: path.join(FAKE, 'fake-orca.cmd'), source: 'path' }
      : { file: process.execPath, prefixArgs: [path.join(FAKE, 'fake-orca.mjs')], viaCmd: false, source: 'path' }
  const log = createCallLog(path.join(dir, 'logs'))
  return { runner: createOrcaRunner(exe, log), log }
}
const argvLog = () => fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('returns result on ok envelope', async () => {
  const { runner } = runnerWith([{ match: ['status'], stdout: fixture('status-ok.json'), exitCode: 0 }])
  expect(await runner.json(['status'])).toEqual({ runtime: { reachable: true } })
})

test('maps runtime_unavailable to orca error with hint', async () => {
  const { runner } = runnerWith([{ match: ['status'], stdout: fixture('status-unavailable.json'), exitCode: 1 }])
  await expect(runner.json(['status'])).rejects.toMatchObject({
    kind: 'orca',
    code: 'runtime_unavailable',
    hint: expect.stringContaining('orca open'),
  })
})

test('non-json stdout is internal error with excerpt and log path', async () => {
  const { runner, log } = runnerWith([{ match: ['status'], stdout: 'Warning: something\n{', exitCode: 0 }])
  await expect(runner.json(['status'])).rejects.toMatchObject({
    kind: 'internal',
    code: 'bad_json',
    message: expect.stringContaining('Warning: something'),
  })
  await expect(runner.json(['status'])).rejects.toThrow(log.path())
})

test('timeout is uncertain', async () => {
  const { runner } = runnerWith([{ match: ['status'], stdout: fixture('status-ok.json'), exitCode: 0, delayMs: 2000 }])
  await expect(runner.json(['status'], { timeoutMs: 200 })).rejects.toMatchObject({ kind: 'uncertain', code: 'orca_timeout' })
})

test('appends --json and passes args verbatim', async () => {
  const text = 'a "b" 中文 %PATH% ^ & |'
  const { runner } = runnerWith([{ match: ['terminal', 'send'], stdout: fixture('terminal-send-turn-started.json'), exitCode: 0 }])
  await runner.json(['terminal', 'send', '--text', text])
  expect(argvLog()).toEqual([['terminal', 'send', '--text', text, '--json']])
})

test('text() returns raw stdout without --json', async () => {
  const { runner } = runnerWith([{ match: ['--version'], stdout: '1.4.214\n', exitCode: 0 }])
  expect(await runner.text(['--version'])).toBe('1.4.214\n')
  expect(argvLog()).toEqual([['--version']])
})

test('missing executable is an input error', async () => {
  const { log } = runnerWith([])
  const runner = createOrcaRunner({ file: path.join(dir, 'nope'), prefixArgs: [], viaCmd: false, source: 'path' }, log)
  await expect(runner.json(['status'])).rejects.toMatchObject({ kind: 'input', code: 'orca_not_found' })
})
