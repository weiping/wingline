import { expect, test } from 'vitest'
import { WinglineError, exitCodeOf } from '../src/errors.js'

test('exitCodeOf maps kinds', () => {
  expect(exitCodeOf(new WinglineError('input', 'spec_invalid', 'x'))).toBe(1)
  expect(exitCodeOf(new WinglineError('orca', 'runtime_unavailable', 'x'))).toBe(2)
  expect(exitCodeOf(new WinglineError('uncertain', 'wait_timeout', 'x'))).toBe(3)
  expect(exitCodeOf(new Error('boom'))).toBe(4)
})
