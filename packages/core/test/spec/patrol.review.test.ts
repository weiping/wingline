// 审查方测试（spec 第 5.3 节）：patrol 字段的默认值、校验与哈希。
import { expect, test } from 'vitest'
import { specHash } from '../../src/spec/hash.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { DUO_YAML, mkTeam } from './helpers.js'

const load = (patrol: string, platform?: NodeJS.Platform) =>
  loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n' + patrol), platform ? { platform } : undefined)

test('an empty patrol block gives every default from spec 5.3', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML + 'patrol: {}\n')).patrol).toEqual({
    noProgressMinutes: 20, promptMinutes: 5, ownerIdleMinutes: 30, postFailureStreak: 3,
    freezeLead: false, autoRecover: false, worktreeComment: false, workspaceStatus: true, unreadMark: true, notify: null,
  })
})

test.each([
  ['no_progress_minutes', '0'], ['prompt_minutes', '-1'], ['owner_idle_minutes', '1.5'], ['post_failure_streak', "'3'"], ['no_progress_minutes', 'null'],
])('patrol.%s = %s is rejected (positive integers only)', (field, value) => {
  expect(() => load(`  ${field}: ${value}\n`)).toThrow()
})

test.each([['freeze_lead'], ['auto_recover'], ['worktree_comment'], ['workspace_status']])('patrol.%s must be a boolean', (field) => {
  expect(() => load(`  ${field}: 'yes'\n`)).toThrow()
  expect(load(`  ${field}: true\n`).patrol).toMatchObject({ [field.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())]: true })
})

test('webhook: http: is accepted; ftp:, javascript: and a bare word are rejected', () => {
  expect(load('  notify:\n    webhook: http://127.0.0.1:9/h\n').patrol.notify).toEqual({ webhook: 'http://127.0.0.1:9/h' })
  for (const bad of ['ftp://x/y', 'javascript:alert(1)', 'not-a-url']) expect(() => load(`  notify:\n    webhook: '${bad}'\n`)).toThrow()
})

test('command: must be a non-empty array of non-empty strings', () => {
  expect(() => load("  notify:\n    command: []\n")).toThrow()
  expect(() => load("  notify:\n    command: ['']\n")).toThrow()
  expect(() => load("  notify:\n    command: '/usr/bin/notify -m'\n")).toThrow()
})

test('notify with an unknown key alongside webhook is rejected', () => {
  expect(() => load('  notify:\n    webhook: https://a.example/h\n    secret: x\n')).toThrow()
})

test('Windows: .BAT in any case is refused; .exe and a later .cmd argument are fine', () => {
  expect(() => load("  notify:\n    command: ['C:\\\\t\\\\TOAST.BAT']\n", 'win32')).toThrow(expect.objectContaining({ code: 'notify_command_unsupported' }))
  expect(() => load("  notify:\n    command: ['C:\\\\t\\\\toast.exe', 'x.cmd']\n", 'win32')).not.toThrow()
})

test('patrol fields take part in the spec hash (a reload is noticed)', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const withDefaults = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol: {}\n')))
  const changed = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 7\n')))
  const hook = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  notify:\n    webhook: https://a.example/h\n')))
  expect(withDefaults).toBe(base)
  expect(new Set([base, changed, hook]).size).toBe(3)
})
