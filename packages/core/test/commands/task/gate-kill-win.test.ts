import { EventEmitter } from 'node:events'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
import { spawn } from 'node:child_process'
import { runGate } from '../../../src/commands/task/gate-exec.js'

const fakeChild = (pid: number) => Object.assign(new EventEmitter(), { pid, stdout: new EventEmitter(), stderr: new EventEmitter() })
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => { Object.defineProperty(process, 'platform', realPlatform); vi.mocked(spawn).mockReset(); delete process.env.SystemRoot })

test('Windows: a gate timeout kills the tree with %SystemRoot%\\System32\\taskkill.exe /T /F /PID <pid> (no PATH lookup, no shell)', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  process.env.SystemRoot = 'C:\\Windows'
  const gate = fakeChild(4242)
  const calls: Array<[string, readonly string[], Record<string, unknown>]> = []
  vi.mocked(spawn).mockImplementation(((cmd: string, args: readonly string[], opts: Record<string, unknown>) => {
    calls.push([cmd, args, opts])
    if (calls.length === 1) return gate
    const killer = fakeChild(1)
    setTimeout(() => gate.emit('close', 1), 10)              // taskkill ended the gate
    return killer
  }) as never)
  const r = await runGate('echo hi', { cwd: 'C:\\repo', timeoutMs: 50 })
  expect(r.timedOut).toBe(true)
  const [exe, args, opts] = calls[1]!
  expect(exe.replace(/\//g, '\\').toLowerCase()).toBe('c:\\windows\\system32\\taskkill.exe')
  expect(args).toEqual(['/T', '/F', '/PID', '4242'])
  expect(opts.shell).toBe(false)
})
