import { expect, test, vi } from 'vitest'
import { autostartStatus } from '../../../src/commands/autostart/status.js'
import { planAutostart } from '../../../src/commands/autostart/plan.js'

const BASE = { uid: 501, user: 'me', node: '/opt/node/bin/node', script: '/opt/wl/main.js', orca: '/opt/orca/bin/orca', waitOrca: '15m' }
const mac = () => planAutostart({ platform: 'darwin', homeDir: '/Users/me', home: '/Users/me/.wingline', ...BASE })
const linux = (over: Record<string, string> = {}) => planAutostart({ platform: 'linux', homeDir: '/home/me', home: '/home/me/.wingline', ...BASE, ...over })

function io(files: Record<string, string>, missing: string[] = []) {
  return {
    readFile: (p: string) => { if (!(p in files)) throw new Error(`ENOENT ${p}`); return files[p]! },
    exists: (p: string) => (p in files || p.startsWith('/opt/')) && !missing.includes(p),
  }
}
const exec = (stdout = '', code = 0) => vi.fn(async (_f: string, _a: string[]) => ({ code, stdout, stderr: '' }))

test('not installed: installed false, no command, no log', async () => {
  const p = linux()
  expect(await autostartStatus(p, exec(), io({}))).toEqual({ installed: false, location: p.file.path, command: [], commandMissing: [], logTail: [], linger: undefined })
})

test('installed on macOS: the command comes from the installed file; no linger check', async () => {
  const p = mac()
  const e = exec()
  const s = await autostartStatus(p, e, io({ [p.file.path]: p.file.content }))
  expect(s).toMatchObject({ installed: true, location: p.file.path, commandMissing: [], linger: undefined })
  expect(s.command).toEqual(['/opt/node/bin/node', '/opt/wl/main.js', 'restore', '--all', '--wait-orca', '15m', '--actor', 'autostart', '--home', '/Users/me/.wingline', '--orca', '/opt/orca/bin/orca'])
  expect(e).not.toHaveBeenCalled()
})

test('installed on Linux: paths with spaces and escapes survive the round trip; linger comes from loginctl', async () => {
  const p = linux({ node: '/opt/my node/bin/node', script: '/home/me/50%/we"ird$/main.js' })
  const e = exec('Linger=yes\n')
  const s = await autostartStatus(p, e, io({ [p.file.path]: p.file.content }))
  expect(s.command.slice(0, 2)).toEqual(['/opt/my node/bin/node', '/home/me/50%/we"ird$/main.js'])
  expect(s.linger).toBe(true)
  expect(e).toHaveBeenCalledWith('/usr/bin/loginctl', ['show-user', 'me', '-p', 'Linger'])
  expect((await autostartStatus(p, exec('Linger=no\n'), io({ [p.file.path]: p.file.content }))).linger).toBe(false)
  expect((await autostartStatus(p, exec('', 1), io({ [p.file.path]: p.file.content }))).linger).toBeUndefined()
})

test('a node or script that no longer exists is listed in commandMissing', async () => {
  const p = linux()
  const s = await autostartStatus(p, exec('Linger=yes'), io({ [p.file.path]: p.file.content }, ['/opt/node/bin/node', '/opt/wl/main.js']))
  expect(s.commandMissing).toEqual(['/opt/node/bin/node', '/opt/wl/main.js'])
})

test('logTail is the last 20 lines of autostart.log; a missing log is empty', async () => {
  const p = linux()
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
  const withLog = await autostartStatus(p, exec('Linger=yes'), io({ [p.file.path]: p.file.content, [p.logPath]: lines.join('\n') + '\n' }))
  expect(withLog.logTail).toEqual(lines.slice(10))
  expect((await autostartStatus(p, exec('Linger=yes'), io({ [p.file.path]: p.file.content }))).logTail).toEqual([])
})
