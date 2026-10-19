import { expect, test } from 'vitest'
import { plainText } from '../../src/view/plain-text.js'

test('plainText strips colors, cursor moves and OSC titles but keeps newlines', () => {
  expect(plainText('\x1b[31mred\x1b[0m\n\x1b]0;t\x07ok\x1b[2K')).toBe('red\nok')
})

test('plainText strips control characters except newline and tab', () => {
  expect(plainText('hello\x00\x08world\t!\r\nfoo')).toBe('helloworld\t!\nfoo')
})
