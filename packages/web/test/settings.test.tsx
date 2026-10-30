// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
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

test('关于页显示自动恢复状态，「关闭自动恢复」确认后调用 uninstall', async () => {
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: [] }),
    'GET /api/about': () => ({
      items: [],
      teams: [],
      autostart: { supported: true, installed: true, location: '/x', command: ['wl'], commandMissing: [], logTail: ['line-1', 'line-2'], platform: 'darwin', logPath: '/x.log' },
    }),
    'POST /api/autostart/uninstall': () => ({ file: '/x', removed: true }),
  })
  const { getByText, findByText } = render(<Settings />)
  expect(await findByText('已开启')).toBeTruthy()
  expect(getByText('关闭自动恢复', { selector: 'button' })).toBeTruthy()
  expect(getByText('/x')).toBeTruthy()
  expect(getByText(/line-2/)).toBeTruthy()
  fireEvent.click(getByText('关闭自动恢复', { selector: 'button' }))
  fireEvent.click(getByText('确认关闭', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/autostart/uninstall')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/autostart/uninstall')!.body).toEqual({})
})

test('未开启时「开启自动恢复」弹窗默认 15m，确认后调用 install', async () => {
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: [] }),
    'GET /api/about': () => ({
      items: [],
      teams: [],
      autostart: { supported: true, installed: false, location: '', command: [], commandMissing: [], logTail: [], platform: 'darwin', logPath: '/x.log' },
    }),
    'POST /api/autostart/install': () => ({ file: '/x' }),
  })
  const { container, getByText, findByText } = render(<Settings />)
  await findByText('未开启')
  fireEvent.click(getByText('开启自动恢复', { selector: 'button' }))
  expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('15m')
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/autostart/install')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/autostart/install')!.body).toEqual({ waitOrca: '15m' })
})

test('该系统不支持自动恢复时显示原因说明', async () => {
  mockApi({
    'GET /api/about': () => ({ items: [], teams: [], autostart: { supported: false, reason: '该平台没有可用的服务管理器' } }),
  })
  const { findByText, queryByText } = render(<Settings />)
  expect(await findByText(/该平台没有可用的服务管理器/)).toBeTruthy()
  expect(queryByText('开启自动恢复')).toBeNull()
})
