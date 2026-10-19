// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import type { VNode } from 'preact'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { Inbox } from '../src/pages/Inbox.js'
import { Overview } from '../src/pages/Overview.js'
import { PostDetail } from '../src/pages/PostDetail.js'
import { TaskBoard } from '../src/pages/TaskBoard.js'
import { TaskDetail } from '../src/pages/TaskDetail.js'
import { Timeline } from '../src/pages/Timeline.js'
import { StreamProvider } from '../src/stream.js'
import { FakeEventSource, attentionOf, eventOf, mockApi, stubEventSource, teamOf } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const withStream = (team: string, node: VNode) => <StreamProvider team={team}>{node}</StreamProvider>

test('overview lists posts with their frozen flag, and 发消息 posts to the send endpoint', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo': () => teamOf(),
    'GET /api/teams/duo/attention': () => attentionOf({ frozen: [{ post: 'checker@duo', reason: '卡住', frozenAt: '', skippedChildren: 0 }] }),
    'GET /api/teams/duo/log?limit=20': () => ({ events: [] }),
    'POST /api/teams/duo/send': () => ({ outcome: 'delivered' }),
  })
  const { getByText, getAllByRole, findByText, container } = render(withStream('duo', <Overview team="duo" />))
  expect(await findByText('已冻结')).toBeTruthy()
  expect(getByText('builder')).toBeTruthy()
  fireEvent.click(getAllByRole('button', { name: '发消息' })[0]!)
  fireEvent.input(container.querySelector('textarea')!, { target: { value: 'hi' } })
  fireEvent.click(getByText('发送', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/send')).toBe(true))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.body).toEqual({ post: 'builder', message: 'hi' })
})

test('timeline shows newest first and appends live events that pass the filter', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/log?limit=200': () => ({
      events: [
        eventOf({ id: 'command:1', action: 'send', at: '2026-10-19T10:00:00.000Z' }),
        eventOf({ id: 'task:2', source: 'task', action: 'task claim', target: 't1#1', at: '2026-10-19T10:01:00.000Z' }),
      ],
    }),
  })
  const { container, findByText, getByText } = render(withStream('duo', <Timeline team="duo" />))
  await findByText('task claim')
  const rows = container.querySelectorAll('li.event')
  expect(rows[0]!.textContent).toContain('task claim')
  act(() => FakeEventSource.instances[0]!.emit('timeline', eventOf({ id: 'patrol:9', source: 'patrol', action: 'no_progress', target: 'builder@duo' })))
  expect(await findByText('no_progress')).toBeTruthy()
  expect(getByText('巡查', { selector: '.tag' })).toBeTruthy()
})

test('timeline source filter refetches with source=task', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/log?limit=200': () => ({ events: [] }),
    'GET /api/teams/duo/log?limit=200&source=task': () => ({ events: [] }),
  })
  const { container, findByText } = render(withStream('duo', <Timeline team="duo" />))
  await findByText('暂无事件。')
  fireEvent.change(container.querySelector('select')!, { target: { value: 'task' } })
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/log?limit=200&source=task')).toBe(true))
})

test('inbox answers a question with POST to the reply endpoint', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () =>
      attentionOf({
        questions: [{ team: 'duo', messageId: 'msg-1', taskId: null, dispatchId: null, asker: 'checker@duo', body: '选哪个方案？', options: ['A', 'B'], relayedAt: '' }],
      }),
    'POST /api/teams/duo/questions/msg-1/reply': () => ({ messageId: 'msg-r1', duplicate: false }),
  })
  const { getByText, findByText, container } = render(withStream('duo', <Inbox team="duo" />))
  expect(await findByText('选哪个方案？', { exact: false })).toBeTruthy()
  fireEvent.click(getByText('回答', { selector: 'button' }))
  fireEvent.input(container.querySelector('textarea')!, { target: { value: 'A' } })
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/questions/msg-1/reply')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ body: 'A' })
})

test('task board groups tasks by status', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks': () => ({
      tasks: [
        { id: 't1', status: 'ready', title: 'Alpha', tags: ['x'], claimedBy: null, epoch: 1, gateFailures: 0 },
        { id: 't2', status: 'completed', title: 'Beta', tags: [], claimedBy: 'builder@duo', epoch: 2, gateFailures: 1 },
      ],
    }),
  })
  const { container, findByText } = render(withStream('duo', <TaskBoard team="duo" />))
  await findByText('Alpha')
  const cols = container.querySelectorAll('.col')
  expect(cols[0]!.textContent).toContain('Alpha')
  expect(cols[3]!.textContent).toContain('Beta')
  expect(cols[3]!.textContent).toContain('闸门失败 1 次')
})

test('task detail offers 恢复派发 for a dispatched task and posts recover', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks/t1': () => ({
      id: 't1', status: 'dispatched', title: 'Alpha', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo',
      assigneeHandle: null, dispatchId: null, epoch: 1, gateFailures: 0, readySince: null, dispatchedAt: null, result: null,
      outcome: null, reportedBy: null, closure: null, history: [],
    }),
    'POST /api/teams/duo/tasks/t1/recover': () => ({}),
  })
  const { getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  fireEvent.click(getByText('恢复派发', { selector: 'button' }))
  fireEvent.click(getByText('恢复', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/tasks/t1/recover')).toBe(true))
})

test('post detail shows the terminal preview as plain text, never as markup', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/posts/builder': () => ({
      address: 'builder@duo',
      row: { address: 'builder@duo', agent: 'claude', status: 'live', handle: null, worktree: 'current', isLead: true },
      sessionId: 'sess-1',
      currentTask: null,
      queued: [],
      signals: [],
      frozen: null,
      hushedUntil: null,
      events: [],
      preview: ['<script>alert(1)</script>'],
    }),
  })
  const { container, findByText, getByText } = render(withStream('duo', <PostDetail team="duo" post="builder" />))
  await findByText('sess-1')
  expect(container.querySelector('script')).toBeNull()
  expect(getByText('<script>alert(1)</script>', { selector: 'pre' })).toBeTruthy()
})
