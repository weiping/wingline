import { expect, test } from 'vitest'
import { plainText } from '../../src/view/plain-text.js'

test('plainText strips colors, cursor moves and OSC titles but keeps newlines', () => {
  expect(plainText('\x1b[31mred\x1b[0m\n\x1b]0;t\x07ok\x1b[2K')).toBe('red\nok')
})

test('plainText strips 8-bit C1 controls (CSI 0x9b, OSC 0x9d, ...) that some terminals obey', () => {
  const dirty = 'hi\u009b2J\u009d0;pwned\u0007\u0085\u009c'
  expect(plainText(dirty)).not.toMatch(/[\u0080-\u009f]/)
  expect(plainText(dirty).startsWith('hi')).toBe(true)
  expect(plainText('雁阵 ✓ é')).toBe('雁阵 ✓ é') // 0xa0 以上的正常字符不受影响
})

test('plainText strips control characters except newline and tab', () => {
  expect(plainText('hello\x00\x08world\t!\r\nfoo')).toBe('helloworld\t!\nfoo')
})
