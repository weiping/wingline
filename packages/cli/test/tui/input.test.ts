import { expect, test } from 'vitest'
import { LineInput } from '../../src/tui/input.js'
import { parseKeys } from '../../src/tui/keys.js'

const type = (input: LineInput, chunk: string) => parseKeys(chunk).map((k) => input.feed(k))

test('LineInput edits with left/right/backspace, ignores control chars, submits on enter, cancels on esc', () => {
  const i = new LineInput('回答: ')
  expect(type(i, 'abd')).toEqual(['continue', 'continue', 'continue'])
  type(i, '\x1b[D') // 光标移到 d 之前
  type(i, 'c')
  expect(i.value).toBe('abcd')
  type(i, '\x7f')
  expect(i.value).toBe('abd')
  type(i, '\x1b[C\x1b[C\x1b[C') // 右移越界不出错
  type(i, '雁')
  expect(i.value).toBe('abd雁')
  type(i, '\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x7f') // 左移到头后退格：什么都不删
  expect(i.value).toBe('abd雁')
  expect(i.feed({ name: 'enter' })).toBe('submit')
  expect(new LineInput('p').feed({ name: 'escape' })).toBe('cancel')
})

test('only printable characters are accepted', () => {
  const i = new LineInput('')
  expect(i.feed({ name: 'char', ch: '\x07' })).toBe('continue')
  expect(i.feed({ name: 'char', ch: '\x1b' })).toBe('continue')
  expect(i.feed({ name: 'tab' })).toBe('continue')
  expect(i.feed({ name: 'up' })).toBe('continue')
  expect(i.value).toBe('')
  i.feed({ name: 'char', ch: 'x' })
  expect(i.value).toBe('x')
})

test('backspace at the start deletes nothing and a deleted wide char takes the whole character', () => {
  const i = new LineInput('')
  i.feed({ name: 'backspace' })
  expect(i.value).toBe('')
  type(i, '雁阵')
  i.feed({ name: 'backspace' })
  expect(i.value).toBe('雁')
})

test('view shows the prompt, the text and a caret, cut to the width', () => {
  const i = new LineInput('回答: ')
  type(i, 'abc')
  expect(i.view(40)).toBe(`回答: abc|${' '.repeat(40 - 10)}`)
  type(i, '\x1b[D')
  expect(i.view(40).startsWith('回答: ab|c')).toBe(true)
  expect(i.view(8).length).toBeGreaterThan(0)
  expect(i.view(8)).not.toMatch(/\x1b/)
})

test('view keeps the caret visible when the text is longer than the width', () => {
  const i = new LineInput('> ')
  type(i, 'x'.repeat(50))
  const v = i.view(20)
  expect(v).toContain('|')
  expect([...v].length).toBe(20)
})
