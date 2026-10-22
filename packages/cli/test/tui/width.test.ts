import { expect, test } from 'vitest'
import { cellWidth, fit } from '../../src/tui/width.js'

test.each([
  ['abc', 3],
  ['雁阵', 4],
  ['é', 1],
  ['é', 1],
  ['👍', 2],
  ['\x1b[31m', 0],
  ['\x1b[31m雁\x1b[0m', 2],
  ['\x1b]0;title\x07x', 1],
  ['a\tb\x07', 2],
  ['ＡＢ', 4],
  ['한글', 4],
  ['', 0],
])('cellWidth(%j) = %i', (s, n) => {
  expect(cellWidth(s)).toBe(n)
})

test('cellWidth distinguishes a precomposed é from e + combining acute (both are one column)', () => {
  expect(cellWidth('é')).toBe(1)
  expect(cellWidth('é')).toBe(1)
  expect([...'é']).toHaveLength(2)
})

test('fit truncates by display width with an ellipsis', () => {
  expect(fit('雁阵控制台', 7)).toBe('雁阵控…')
  expect(cellWidth(fit('雁阵控制台', 7))).toBe(7)
})

test('fit pads short strings to the width', () => {
  expect(fit('ab', 4)).toBe('ab  ')
  expect(fit('雁', 4)).toBe('雁  ')
})

test('fit leaves a string that fits exactly untouched', () => {
  expect(fit('abcd', 4)).toBe('abcd')
  expect(fit('雁阵', 4)).toBe('雁阵')
})

test('fit never splits a wide character: it pads the leftover column instead', () => {
  const out = fit('雁阵控制台', 6)
  expect(out).toBe('雁阵… ')
  expect(cellWidth(out)).toBe(6)
})

test('fit with tiny widths', () => {
  expect(fit('abc', 1)).toBe('…')
  expect(fit('abc', 0)).toBe('')
  expect(fit('a', 1)).toBe('a')
})

test('fit does not cut a surrogate pair in half', () => {
  const out = fit('👍👍👍', 5)
  expect(out).toBe('👍👍…')
  expect(cellWidth(out)).toBe(5)
})

test('emoji with emoji presentation count two columns; text-presentation symbols (our ⚠ and ❄ marks) stay one', () => {
  for (const wide of ['🚀', '✅', '❌', '⭐', '🩷', '⏰']) expect(cellWidth(wide), wide).toBe(2)
  for (const narrow of ['⚠', '❄', '✓', '✔', '★', '©']) expect(cellWidth(narrow), narrow).toBe(1)
  expect(fit('✅ 通过', 8)).toBe('✅ 通过 ')
})
