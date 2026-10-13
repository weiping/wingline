import { expect, test } from 'vitest'
import { resolveOrcaExecutable } from '../../src/orca/resolve.js'

const none = () => null

test('WINGLINE_ORCA wins', () => {
  const r = resolveOrcaExecutable({
    env: { WINGLINE_ORCA: '/opt/orca', ORCA_CLI_COMMAND: '/x' },
    platform: 'linux',
    which: none,
  })
  expect(r).toMatchObject({ file: '/opt/orca', source: 'WINGLINE_ORCA', viaCmd: false })
})

test('ORCA_CLI_COMMAND next', () => {
  const r = resolveOrcaExecutable({ env: { ORCA_CLI_COMMAND: '/y' }, platform: 'linux', which: none })
  expect(r).toMatchObject({ file: '/y', source: 'ORCA_CLI_COMMAND', viaCmd: false })
})

test('linux uses orca-ide', () => {
  const which = (n: string) => (n === 'orca-ide' ? '/usr/local/bin/orca-ide' : null)
  expect(resolveOrcaExecutable({ env: {}, platform: 'linux', which })).toMatchObject({
    file: '/usr/local/bin/orca-ide',
    source: 'path',
  })
})

test('linux never uses bare orca', () => {
  const which = (n: string) => (n === 'orca' ? '/usr/bin/orca' : null)
  expect(() => resolveOrcaExecutable({ env: {}, platform: 'linux', which })).toThrow(
    expect.objectContaining({ kind: 'input', code: 'orca_not_found' }),
  )
})

test('darwin uses orca', () => {
  const which = (n: string) => (n === 'orca' ? '/usr/local/bin/orca' : null)
  expect(resolveOrcaExecutable({ env: {}, platform: 'darwin', which })).toMatchObject({
    file: '/usr/local/bin/orca',
  })
})

test('win32 prefers orca.exe', () => {
  const which = (n: string) => (n === 'orca.exe' ? 'C:\\Orca\\orca.exe' : n === 'orca.cmd' ? 'C:\\Orca\\orca.cmd' : null)
  expect(resolveOrcaExecutable({ env: {}, platform: 'win32', which })).toMatchObject({
    file: 'C:\\Orca\\orca.exe',
    viaCmd: false,
  })
})

test('win32 falls back to orca.cmd via cmd.exe', () => {
  const which = (n: string) => (n === 'orca.cmd' ? 'C:\\Orca\\orca.cmd' : null)
  const r = resolveOrcaExecutable({ env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }, platform: 'win32', which })
  expect(r).toMatchObject({
    file: 'C:\\Windows\\System32\\cmd.exe',
    prefixArgs: ['/d', '/s', '/c'],
    viaCmd: true,
    cmdPath: 'C:\\Orca\\orca.cmd',
  })
})

test('missing everywhere is an input error with hint', () => {
  expect(() => resolveOrcaExecutable({ env: {}, platform: 'darwin', which: none })).toThrow(
    expect.objectContaining({ kind: 'input', code: 'orca_not_found', hint: expect.stringContaining('WINGLINE_ORCA') }),
  )
})
