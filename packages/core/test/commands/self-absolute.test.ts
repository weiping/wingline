import path from 'node:path'
import { expect, test } from 'vitest'
import { absoluteSelfCommand } from '../../src/commands/self.js'

const POSIX = { platform: 'linux' as const, node: '/opt/node/bin/node', script: '/opt/wl/main.js', args: ['restore', '--all'], home: '/home/me/.wingline', orca: '/opt/orca/bin/orca' }
const WIN = { platform: 'win32' as const, node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\wl\\main.js', args: ['restore', '--all'], home: 'C:\\Users\\me\\.wingline', orca: 'C:\\Orca\\orca.exe' }
const invalid = expect.objectContaining({ code: 'autostart_path_invalid', kind: 'input' })

test('posix: node, script, args, then --home and --orca, all absolute', () => {
  expect(absoluteSelfCommand(POSIX)).toEqual({
    file: '/opt/node/bin/node',
    args: ['/opt/wl/main.js', 'restore', '--all', '--home', '/home/me/.wingline', '--orca', '/opt/orca/bin/orca'],
  })
})

test('a relative node, home or orca path is autostart_path_invalid; a relative script is resolved', () => {
  expect(() => absoluteSelfCommand({ ...POSIX, node: 'node' })).toThrow(invalid)
  expect(() => absoluteSelfCommand({ ...POSIX, home: '.wingline' })).toThrow(invalid)
  expect(() => absoluteSelfCommand({ ...POSIX, orca: 'orca' })).toThrow(invalid)
  expect(absoluteSelfCommand({ ...POSIX, script: 'dist/main.js' }).args[0]).toBe(path.posix.resolve('dist/main.js'))
})

test('win32: needs no node on PATH, keeps paths with spaces whole, rejects relative paths and " % $ `', () => {
  expect(absoluteSelfCommand(WIN)).toEqual({
    file: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\wl\\main.js', 'restore', '--all', '--home', 'C:\\Users\\me\\.wingline', '--orca', 'C:\\Orca\\orca.exe'],
  })
  expect(() => absoluteSelfCommand({ ...WIN, node: 'node.exe' })).toThrow(invalid)
  for (const ch of ['"', '%', '$', '`']) expect(() => absoluteSelfCommand({ ...WIN, home: `C:\\h${ch}x` })).toThrow(invalid)
})
