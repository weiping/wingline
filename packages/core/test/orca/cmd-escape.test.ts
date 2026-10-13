import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildCmdLine, escapeCmdArg } from '../../src/orca/cmd-escape.js'

const CASES = [
  'plain',
  'with space',
  'quote " inside',
  'percent %PATH%',
  'caret ^ amp & pipe |',
  '中文 消息',
  'trailing backslash \\',
  '',
]

describe('escapeCmdArg (string form)', () => {
  test('quotes the arg and caret-escapes cmd metacharacters', () => {
    expect(escapeCmdArg('plain')).toBe('^"plain^"')
    expect(escapeCmdArg('a&b')).toBe('^"a^&b^"')
    expect(escapeCmdArg('')).toBe('^"^"')
  })

  test('a percent sign gets a caret so cmd cannot expand it, except at the very end of the arg', () => {
    expect(escapeCmdArg('a%b')).toBe('^"a%^b^"')
    expect(escapeCmdArg('%PATH%')).toBe('^"%^PATH%^"')
    expect(escapeCmdArg('50%')).toBe('^"50%^"')
  })

  test('embedded quotes are backslash-escaped before caret-escaping', () => {
    expect(escapeCmdArg('a"b')).toBe('^"a\\^"b^"')
  })

  test('trailing backslashes are doubled so the closing quote survives', () => {
    expect(escapeCmdArg('x\\')).toBe('^"x\\\\^"')
  })

  test('newline is rejected with a hint', () => {
    expect(() => escapeCmdArg('a\nb')).toThrow(
      expect.objectContaining({ kind: 'input', code: 'cmd_newline_unsupported', hint: expect.stringContaining('单行') }),
    )
  })

  test('a command line beyond cmd.exe\'s ~8191 character limit is rejected up front', () => {
    expect(() => buildCmdLine('C:\\Orca\\orca.cmd', ['x'.repeat(8100)])).toThrow(
      expect.objectContaining({ kind: 'input', code: 'cmd_line_too_long', hint: expect.stringContaining('文件') }),
    )
    expect(() => buildCmdLine('C:\\Orca\\orca.cmd', ['x'.repeat(4000)])).not.toThrow()
  })

  test('buildCmdLine wraps command and args in one outer quote pair for cmd /s', () => {
    expect(buildCmdLine('C:\\Orca\\orca.cmd', ['a', 'b c'])).toBe('""C:\\Orca\\orca.cmd" ^"a^" ^"b c^""')
  })
})

describe.runIf(process.platform === 'win32')('round trip through cmd.exe', () => {
  test.each(CASES)('echoes %j verbatim', (arg) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-cmd-'))
    const js = path.join(dir, 'echo.mjs')
    fs.writeFileSync(js, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    const cmd = path.join(dir, 'echo.cmd')
    fs.writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`)
    const r = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', buildCmdLine(cmd, [arg])], {
      windowsVerbatimArguments: true,
      encoding: 'utf8',
    })
    expect(JSON.parse(r.stdout)).toEqual([arg])
  })
})
