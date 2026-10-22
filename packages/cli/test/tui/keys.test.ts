import { expect, test } from 'vitest'
import { parseKeys } from '../../src/tui/keys.js'

test('parseKeys decodes arrows, enter, tab, esc, backspace, ctrl-c and CJK chars', () => {
  expect(parseKeys('\x1b[A\r\t雁')).toEqual([{ name: 'up' }, { name: 'enter' }, { name: 'tab' }, { name: 'char', ch: '雁' }])
  expect(parseKeys('\x1b[B\x1b[C\x1b[D')).toEqual([{ name: 'down' }, { name: 'right' }, { name: 'left' }])
  expect(parseKeys('\x1b')).toEqual([{ name: 'escape' }])
  expect(parseKeys('\x7f')).toEqual([{ name: 'backspace' }])
  expect(parseKeys('\b')).toEqual([{ name: 'backspace' }])
  expect(parseKeys('\x03')).toEqual([{ name: 'ctrl-c' }])
  expect(parseKeys('\n')).toEqual([{ name: 'enter' }])
})

test('parseKeys splits a chunk with several printable characters', () => {
  expect(parseKeys('j/k')).toEqual([{ name: 'char', ch: 'j' }, { name: 'char', ch: '/' }, { name: 'char', ch: 'k' }])
  expect(parseKeys('👍')).toEqual([{ name: 'char', ch: '👍' }])
})

test('application-mode arrows (ESC O A) are arrows too', () => {
  expect(parseKeys('\x1bOA\x1bOB')).toEqual([{ name: 'up' }, { name: 'down' }])
})

test('unknown escape sequences and other control characters are dropped, not typed', () => {
  expect(parseKeys('\x1b[1;5C')).toEqual([])
  expect(parseKeys('\x1b[3~x')).toEqual([{ name: 'char', ch: 'x' }])
  expect(parseKeys('\x01\x02\x04')).toEqual([])
  expect(parseKeys('a\x1b[Zb')).toEqual([{ name: 'char', ch: 'a' }, { name: 'char', ch: 'b' }])
})

test('an empty chunk gives no keys', () => {
  expect(parseKeys('')).toEqual([])
})
