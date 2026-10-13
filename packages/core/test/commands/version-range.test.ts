import { expect, test } from 'vitest'
import { inRange } from '../../src/commands/version-range.js'

test.each([
  ['1.4.222', '>=1.4.214 <1.5.0', true],
  ['1.4.214', '>=1.4.214 <1.5.0', true],
  ['1.4.213', '>=1.4.214 <1.5.0', false],
  ['1.5.0', '>=1.4.214 <1.5.0', false],
  ['2.0.0', '>=1.4.214 <1.5.0', false],
  ['1.4.214-beta.1', '>=1.4.214 <1.5.0', true],
  ['garbage', '>=1.4.214', false],
])('inRange(%s, %s) = %s', (v, r, want) => {
  expect(inRange(v, r)).toBe(want)
})
