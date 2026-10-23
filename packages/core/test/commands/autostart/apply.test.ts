import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import { applyAutostart, removeAutostart } from '../../../src/commands/autostart/apply.js'
import type { AutostartPlan } from '../../../src/commands/autostart/plan.js'

type Reply = { code: number; stdout: string; stderr: string }
const ok: Reply = { code: 0, stdout: '', stderr: '' }

function mk(over: Partial<AutostartPlan> = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-autostart-'))
  const plan: AutostartPlan = {
    platform: 'linux', user: 'me',
    file: { path: path.join(tmp, 'units', 'wingline-restore.service'), content: 'NEW' },
    logPath: path.join(tmp, 'home', 'logs', 'autostart.log'),
    probe: { file: '/usr/bin/systemctl', args: ['--user', 'show-environment'] },
    register: [{ file: '/usr/bin/systemctl', args: ['--user', 'daemon-reload'] }, { file: '/usr/bin/systemctl', args: ['--user', 'enable', 'u'] }],
    unregister: [{ file: '/usr/bin/systemctl', args: ['--user', 'disable', 'u'], allowFail: true }],
    ...over,
  }
  const calls: string[][] = []
  const exec = vi.fn(async (file: string, args: string[]): Promise<Reply> => { calls.push([file, ...args]); return ok })
  return { tmp, plan, exec, calls }
}
const unitFiles = (tmp: string) => fs.readdirSync(path.join(tmp, 'units'))

test('install creates the directories, writes the file via a temp file, then registers in order', async () => {
  const w = mk()
  await applyAutostart(w.plan, w.exec)
  expect(fs.readFileSync(w.plan.file.path, 'utf8')).toBe('NEW')
  expect(unitFiles(w.tmp)).toEqual(['wingline-restore.service'])
  expect(fs.existsSync(path.dirname(w.plan.logPath))).toBe(true)
  expect(w.calls).toEqual([
    ['/usr/bin/systemctl', '--user', 'show-environment'],
    ['/usr/bin/systemctl', '--user', 'daemon-reload'],
    ['/usr/bin/systemctl', '--user', 'enable', 'u'],
  ])
})

test('installing twice overwrites our own file', async () => {
  const w = mk()
  await applyAutostart(w.plan, w.exec)
  await applyAutostart({ ...w.plan, file: { ...w.plan.file, content: 'NEWER' } }, w.exec)
  expect(fs.readFileSync(w.plan.file.path, 'utf8')).toBe('NEWER')
})

test('a failing register removes the file it wrote and throws autostart_failed carrying the output', async () => {
  const w = mk()
  w.exec.mockImplementation(async (_f, args) => (args.includes('enable') ? { code: 1, stdout: 'out', stderr: 'Failed to enable unit' } : ok))
  await expect(applyAutostart(w.plan, w.exec)).rejects.toMatchObject({ kind: 'internal', code: 'autostart_failed', message: expect.stringContaining('Failed to enable unit') })
  expect(fs.existsSync(w.plan.file.path)).toBe(false)
  expect(unitFiles(w.tmp)).toEqual([])
})

test('a failing re-install puts the previous file back instead of leaving nothing', async () => {
  const w = mk()
  fs.mkdirSync(path.dirname(w.plan.file.path), { recursive: true })
  fs.writeFileSync(w.plan.file.path, 'OLD')
  w.exec.mockImplementation(async (_f, args) => (args.includes('enable') ? { code: 1, stdout: '', stderr: 'nope' } : ok))
  await expect(applyAutostart(w.plan, w.exec)).rejects.toMatchObject({ code: 'autostart_failed' })
  expect(fs.readFileSync(w.plan.file.path, 'utf8')).toBe('OLD')
  expect(unitFiles(w.tmp)).toEqual(['wingline-restore.service'])
})

test('an allowFail command may fail; a command that cannot even start is autostart_failed', async () => {
  const w = mk({ register: [{ file: '/bin/launchctl', args: ['bootout', 'x'], allowFail: true }, { file: '/bin/launchctl', args: ['bootstrap', 'x'] }], probe: undefined })
  w.exec.mockImplementationOnce(async () => ({ code: 3, stdout: '', stderr: 'not loaded' }))
  await applyAutostart(w.plan, w.exec)
  expect(w.exec).toHaveBeenCalledTimes(2)

  const g = mk({ probe: undefined })
  g.exec.mockRejectedValue(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
  await expect(applyAutostart(g.plan, g.exec)).rejects.toMatchObject({ code: 'autostart_failed' })
  expect(fs.existsSync(g.plan.file.path)).toBe(false)
})

test('no systemd user session (the probe fails) is autostart_unsupported and nothing is written', async () => {
  const w = mk()
  w.exec.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Failed to connect to bus' })
  await expect(applyAutostart(w.plan, w.exec)).rejects.toMatchObject({ kind: 'input', code: 'autostart_unsupported' })
  expect(fs.existsSync(w.plan.file.path)).toBe(false)
  expect(w.exec).toHaveBeenCalledTimes(1)

  const g = mk()
  g.exec.mockRejectedValueOnce(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
  await expect(applyAutostart(g.plan, g.exec)).rejects.toMatchObject({ code: 'autostart_unsupported' })
})

test('an autostart.log over 1 MB is rotated to autostart.log.1 (replacing an older .1); a smaller one is left alone', async () => {
  const w = mk()
  fs.mkdirSync(path.dirname(w.plan.logPath), { recursive: true })
  fs.writeFileSync(w.plan.logPath, 'x'.repeat(1024 * 1024 + 1))
  fs.writeFileSync(`${w.plan.logPath}.1`, 'old')
  await applyAutostart(w.plan, w.exec)
  expect(fs.existsSync(w.plan.logPath)).toBe(false)
  expect(fs.statSync(`${w.plan.logPath}.1`).size).toBe(1024 * 1024 + 1)

  const s = mk()
  fs.mkdirSync(path.dirname(s.plan.logPath), { recursive: true })
  fs.writeFileSync(s.plan.logPath, 'small')
  await applyAutostart(s.plan, s.exec)
  expect(fs.readFileSync(s.plan.logPath, 'utf8')).toBe('small')
  expect(fs.existsSync(`${s.plan.logPath}.1`)).toBe(false)
})

test('uninstall runs unregister, removes only our file and leaves the logs; when nothing is installed it still succeeds', async () => {
  const w = mk()
  await applyAutostart(w.plan, w.exec)
  fs.writeFileSync(w.plan.logPath, 'log')
  w.calls.length = 0
  expect(await removeAutostart(w.plan, w.exec)).toEqual({ removed: true })
  expect(w.calls).toEqual([['/usr/bin/systemctl', '--user', 'disable', 'u']])
  expect(fs.existsSync(w.plan.file.path)).toBe(false)
  expect(fs.readFileSync(w.plan.logPath, 'utf8')).toBe('log')

  const g = mk()
  g.exec.mockResolvedValue({ code: 1, stdout: '', stderr: 'not found' })
  expect(await removeAutostart(g.plan, g.exec)).toEqual({ removed: false })
})
