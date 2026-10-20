import { expect, test } from 'vitest'
import { WinglineError } from '../../src/errors.js'
import { commandLine, selfCommand, type SelfSpec } from '../../src/commands/self.js'

test('posix：路径含空格与单引号 → 单引号包裹且内部单引号转义', () => {
  const spec: SelfSpec = {
    platform: 'linux',
    node: '/usr/bin/node',
    script: "/opt/it's app/main.js",
    args: ['console'],
    home: "/home/user/with spaces/it's",
    orca: '/usr/local/bin/orca',
  }
  const cmd = selfCommand(spec)
  expect(cmd).toEqual({
    file: '/usr/bin/node',
    args: [
      "/opt/it's app/main.js",
      'console',
      '--home',
      "/home/user/with spaces/it's",
      '--orca',
      '/usr/local/bin/orca',
    ],
  })
  const line = commandLine(cmd, spec.platform)
  expect(line).toBe(
    "'/usr/bin/node' '/opt/it'\\''s app/main.js' console --home '/home/user/with spaces/it'\\''s' --orca '/usr/local/bin/orca'",
  )
})

test('win32 且 nodeOnPath：file 为 node，双引号包裹', () => {
  const spec: SelfSpec = {
    platform: 'win32',
    node: 'C:\\Program Files\\nodejs\\node.exe',
    script: 'C:\\app dir\\main.js',
    args: ['console'],
    home: 'C:\\Users\\user\\home dir',
    orca: 'C:\\Programs\\orca\\orca.cmd',
    nodeOnPath: true,
  }
  const cmd = selfCommand(spec)
  expect(cmd.file).toBe('node')
  expect(cmd.args).toEqual([
    'C:\\app dir\\main.js',
    'console',
    '--home',
    'C:\\Users\\user\\home dir',
    '--orca',
    'C:\\Programs\\orca\\orca.cmd',
  ])
  const line = commandLine(cmd, spec.platform)
  expect(line).toBe(
    'node "C:\\app dir\\main.js" console --home "C:\\Users\\user\\home dir" --orca "C:\\Programs\\orca\\orca.cmd"',
  )
})

test('win32 无 node → self_launch_unsupported', () => {
  const spec: SelfSpec = {
    platform: 'win32',
    node: 'C:\\nodejs\\node.exe',
    script: 'C:\\main.js',
    args: ['console'],
    home: 'C:\\home',
    orca: 'C:\\orca.cmd',
    nodeOnPath: false,
  }
  expect(() => selfCommand(spec)).toThrow(
    expect.objectContaining({
      kind: 'input',
      code: 'self_launch_unsupported',
      message: expect.stringContaining('PATH 上找不到 node'),
    }),
  )
})

test('win32 任一参数含 " % $ ` → self_launch_unsupported', () => {
  const base: SelfSpec = {
    platform: 'win32',
    node: 'C:\\nodejs\\node.exe',
    script: 'C:\\main.js',
    args: ['console'],
    home: 'C:\\home',
    orca: 'C:\\orca.cmd',
    nodeOnPath: true,
  }
  for (const ch of ['"', '%', '$', '`']) {
    expect(() => selfCommand({ ...base, script: `C:\\app${ch}\\main.js` })).toThrow(
      expect.objectContaining({ code: 'self_launch_unsupported' }),
    )
    expect(() => selfCommand({ ...base, home: `C:\\h${ch}x` })).toThrow(
      expect.objectContaining({ code: 'self_launch_unsupported' }),
    )
    expect(() => selfCommand({ ...base, orca: `C:\\o${ch}x` })).toThrow(
      expect.objectContaining({ code: 'self_launch_unsupported' }),
    )
    expect(() => selfCommand({ ...base, args: ['console', `bad${ch}`] })).toThrow(
      expect.objectContaining({ code: 'self_launch_unsupported' }),
    )
  }
})

test('自定义 unsupported 异常工厂生效', () => {
  const spec: SelfSpec = {
    platform: 'win32',
    node: 'C:\\nodejs\\node.exe',
    script: 'C:\\main.js',
    args: ['console'],
    home: 'C:\\home',
    orca: 'C:\\orca.cmd',
    nodeOnPath: false,
  }
  expect(() =>
    selfCommand(spec, {
      unsupported: (why) => new WinglineError('input', 'custom_unsupported', why),
    }),
  ).toThrow(expect.objectContaining({ code: 'custom_unsupported' }))
})
