// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/preact'
import { Settings } from '../src/pages/Settings.js'
import { mockApi } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('settings page shows each item with its source label', async () => {
  mockApi({
    'GET /api/about': () => ({
      items: [
        { key: 'wingline.version', value: '1.2.3', source: 'default' },
        { key: 'orca.path', value: '/opt/orca', source: 'env', note: 'WINGLINE_ORCA' },
        { key: 'orca.version', value: null, source: 'orca', note: 'runtime_unavailable' },
        { key: 'registry.migration', value: 9, source: 'registry' },
        { key: 'logs.bytes', value: 2048, source: 'file' },
      ],
      teams: [{ name: 'duo', specPath: '/t/duo/team.yaml', status: 'up', draft: true, dispatcher: 'running' }],
    }),
  })
  const { findByText, getByText, getAllByText } = render(<Settings />)
  expect(await findByText('/opt/orca')).toBeTruthy()
  expect(getByText('环境变量')).toBeTruthy()
  expect(getByText('Orca')).toBeTruthy()
  expect(getByText('注册表')).toBeTruthy()
  expect(getByText('文件')).toBeTruthy()
  expect(getByText('默认值')).toBeTruthy()
  expect(getByText(/WINGLINE_ORCA/)).toBeTruthy()
  expect(getByText(/runtime_unavailable/)).toBeTruthy()
  expect(getByText('1.2.3')).toBeTruthy()
  expect(getAllByText('—').length).toBeGreaterThan(0)
  expect(getByText('/t/duo/team.yaml')).toBeTruthy()
  expect(getByText(/有草稿/)).toBeTruthy()
})
