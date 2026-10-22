import { expect, test } from 'vitest'
import { setField } from '../../src/spec/edit.js'

const SRC = '# 团队\nversion: 1\nname: duo   # 名字\n\nposts:\n  - id: builder  # 牵头\n    agent: claude\n'

test('setField changes one scalar and leaves comments, blank lines and order byte-identical elsewhere', () => {
  expect(setField(SRC, ['posts', 0, 'agent'], 'codex')).toBe(SRC.replace('agent: claude', 'agent: codex'))
})

test('setField keeps the quote style of the scalar it replaces', () => {
  const src = "posts:\n  - launch: 'claude --model opus'   # 启动\n"
  expect(setField(src, ['posts', 0, 'launch'], 'codex')).toBe("posts:\n  - launch: 'codex'   # 启动\n")
})

test('setField quotes a value that would otherwise change type', () => {
  expect(setField('name: duo\n', ['name'], 'true')).toBe('name: "true"\n')
})

test('setField replaces a scalar with a number and a boolean', () => {
  expect(setField('a: 1 # n\nb: false\n', ['a'], 5)).toBe('a: 5 # n\nb: false\n')
  expect(setField('a: 1\nb: false # f\n', ['b'], true)).toBe('a: 1\nb: true # f\n')
})

test('setField with null deletes the key', () => {
  expect(setField('a: 1\nb: 2\n', ['a'], null)).toBe('b: 2\n')
})

test('setField adds a missing key and keeps existing comments', () => {
  const out = setField('# top\nname: duo\n', ['lead'], 'builder')
  expect(out).toContain('# top')
  expect(out).toContain('lead: builder')
  expect(out.indexOf('name: duo')).toBeLessThan(out.indexOf('lead: builder'))
})

test('setField can set a list value', () => {
  expect(setField('tags: [a]\n', ['tags'], ['x', 'y'])).toMatch(/tags:\s*\n?\s*(\[x, y\]|- x\n\s*- y)/)
})

test('setField on text with a syntax error throws spec_invalid', () => {
  expect(() => setField('a: [unclosed\n', ['a'], 1)).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_invalid' }))
})
