import path from 'node:path'
import { expect, test } from 'vitest'
import { winglineHome } from '../src/paths.js'

test('winglineHome honours WINGLINE_HOME', () => {
  expect(winglineHome({ WINGLINE_HOME: '/tmp/wl' }, '/home/u')).toBe('/tmp/wl')
  expect(winglineHome({}, '/home/u')).toBe(path.join('/home/u', '.wingline'))
})
