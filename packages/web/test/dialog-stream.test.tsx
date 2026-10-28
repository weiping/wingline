// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { ApiError } from '../src/api.js'
import { ActionDialog } from '../src/components/ActionDialog.js'
import { TopBar } from '../src/components/Layout.js'
import { StreamProvider } from '../src/stream.js'
import { Fail, FakeEventSource, mockApi, stubEventSource } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('ActionDialog refuses to submit with a required field empty and does not call the handler', async () => {
  const onSubmit = vi.fn(async () => ({}))
  const { getByRole, findByText } = render(
    <ActionDialog label="冻结" title="冻结岗位" fields={[{ name: 'reason', label: '理由', required: true }]} onSubmit={onSubmit} />,
  )
  fireEvent.click(getByRole('button', { name: '冻结' }))
  fireEvent.click(getByRole('button', { name: '确认' }))
  expect(await findByText('请填写：理由')).toBeTruthy()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('an uncertain result offers 按原样重试 which resends the same values with the same retryRequest', async () => {
  const onSubmit = vi
    .fn<(v: Record<string, string>, rr?: string) => Promise<unknown>>()
    .mockRejectedValueOnce(new ApiError(504, { kind: 'uncertain', code: 'orca_timeout', message: '结果不确定', retryRequest: 'rq-7' }))
    .mockResolvedValueOnce({})
  const { getByRole, findByRole } = render(
    <ActionDialog label="冻结" title="冻结岗位" fields={[{ name: 'reason', label: '理由', required: true }]} onSubmit={onSubmit} />,
  )
  fireEvent.click(getByRole('button', { name: '冻结' }))
  fireEvent.input(document.querySelector('input')!, { target: { value: 'x' } })
  fireEvent.click(getByRole('button', { name: '确认' }))
  fireEvent.click(await findByRole('button', { name: '按原样重试' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
  expect(onSubmit).toHaveBeenNthCalledWith(2, { reason: 'x' }, 'rq-7')
})

test('the top bar shows 重连中 until the stream opens, then 实时', async () => {
  stubEventSource()
  const { getByText } = render(
    <StreamProvider team="duo">
      <TopBar />
    </StreamProvider>,
  )
  expect(getByText('重连中')).toBeTruthy()
  const src = FakeEventSource.instances[0]!
  expect(src.url).toBe('/api/teams/duo/events')
  act(() => src.open())
  expect(await findLabel(getByText, '实时')).toBeTruthy()
})

test('after three failures the stream checks the session; a 401 stops it in closed state', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => {
      throw new Fail(401, { kind: 'auth', code: 'unauthenticated', message: '未登录' })
    },
  })
  const { getByText } = render(
    <StreamProvider team="duo">
      <TopBar />
    </StreamProvider>,
  )
  for (let i = 0; i < 3; i++) {
    const src = FakeEventSource.instances.at(-1)!
    act(() => src.fail())
  }
  expect(await findLabel(getByText, '已断开')).toBeTruthy()
})

test('the top bar shows the count the server computed', async () => {
  stubEventSource()
  const { getByLabelText } = render(
    <StreamProvider team="duo">
      <TopBar />
    </StreamProvider>,
  )
  const src = FakeEventSource.instances[0]!
  act(() => {
    src.open()
    src.emit('snapshot', { team: 'duo', posts: [], dispatcher: 'running', attention: 3 })
  })
  await waitFor(() => expect(getByLabelText('待办').textContent).toContain('待办 3'))
})

async function findLabel(getByText: (t: string) => HTMLElement, text: string): Promise<HTMLElement> {
  return waitFor(() => getByText(text))
}
