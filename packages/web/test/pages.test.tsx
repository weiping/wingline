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

test('after the stream drops and reconnects the timeline refetches the log, so events from the gap appear', async () => {
  stubEventSource()
  let n = 0
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/log?limit=200': () => ({ events: ++n === 1 ? [] : [eventOf({ id: 'command:5', action: 'gap-event' })] }),
  })
  const { findByText } = render(withStream('duo', <Timeline team="duo" />))
  await findByText('暂无事件。')
  act(() => FakeEventSource.instances[0]!.open())
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  act(() => FakeEventSource.instances[0]!.fail())
  act(() => { vi.advanceTimersByTime(5_000) })
  vi.useRealTimers()
  act(() => FakeEventSource.instances[1]!.open())
  expect(await findByText('gap-event')).toBeTruthy()
  expect(calls.filter((c) => c.path === '/api/teams/duo/log?limit=200')).toHaveLength(2)
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

test('inbox lists pending gates and resolves gate with resolution and optional reassign', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () =>
      attentionOf({
        stale: [
          { taskId: 't1', title: 'Task with Gate', reason: 'blocked_waiting', owner: 'builder@duo', since: null, command: 'cmd', gateId: 'gate-1' },
        ],
      }),
    'POST /api/teams/duo/gates/gate-1/resolve': () => ({ taskId: 't1', status: 'ready', claimedBy: 'checker@duo' }),
  })
  const { getByText, findByText, container } = render(withStream('duo', <Inbox team="duo" />))
  expect(await findByText('Task with Gate')).toBeTruthy()
  expect(getByText('等待决策的 gate')).toBeTruthy()
  fireEvent.click(getByText('处理闸门', { selector: 'button' }))
  fireEvent.input(container.querySelector('textarea')!, { target: { value: '继续推进' } })
  const inputs = container.querySelectorAll('input')
  fireEvent.input(inputs[0]!, { target: { value: 'checker' } })
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/gates/gate-1/resolve')).toBe(true))
  expect(calls.find((c) => c.path === '/api/teams/duo/gates/gate-1/resolve')!.body).toEqual({
    resolution: '继续推进',
    reassign: 'checker',
  })
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

test('task detail offers 处理闸门 for a blocked task with gateId', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks/t1': () => ({
      id: 't1', status: 'blocked', title: 'Blocked Task', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo',
      assigneeHandle: null, dispatchId: null, epoch: 1, gateFailures: 1, readySince: null, dispatchedAt: null, result: null,
      outcome: null, reportedBy: null, closure: null, gateId: 'gate-99', history: [],
    }),
    'POST /api/teams/duo/gates/gate-99/resolve': () => ({ taskId: 't1', status: 'ready', claimedBy: 'builder@duo' }),
  })
  const { getByText, findByText, container } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Blocked Task')
  fireEvent.click(getByText('处理闸门', { selector: 'button' }))
  fireEvent.input(container.querySelector('textarea')!, { target: { value: '通过' } })
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/gates/gate-99/resolve')).toBe(true))
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

test('inbox shows warnings above the sections', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () => attentionOf({ warnings: ['有未应用的规格草稿：/t/team.draft.yaml（执行 wl down duo 后 wl up /t/team.yaml --draft）'] }),
  })
  const { findByText, container } = render(withStream('duo', <Inbox team="duo" />))
  const warning = await findByText(/有未应用的规格草稿/)
  const firstSection = container.querySelector('section')!
  expect(warning.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('overview shows the pending-draft notice when attention.warnings has one', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo': () => teamOf(),
    'GET /api/teams/duo/attention': () => attentionOf({ warnings: ['有未应用的规格草稿：/t/team.draft.yaml（执行 wl down duo 后 wl up /t/team.yaml --draft）'] }),
    'GET /api/teams/duo/log?limit=20': () => ({ events: [] }),
  })
  const { findByText } = render(withStream('duo', <Overview team="duo" />))
  expect(await findByText(/有未应用的规格草稿/)).toBeTruthy()
})

const signalRow = { team: 'duo', post: 'checker@duo', signal: 'usage_limit', taskId: '', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, detail: null, command: null, summary: '预计 15:00 重置' }

test('3D: the inbox and the post detail show the summary of a screen signal instead of parsing detail themselves', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () => attentionOf({ signals: [signalRow] }),
  })
  const inbox = render(withStream('duo', <Inbox team="duo" />))
  expect(await inbox.findByText(/预计 15:00 重置/)).toBeTruthy()
  inbox.unmount()

  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/posts/builder': () => ({
      address: 'builder@duo', row: { address: 'builder@duo', agent: 'claude', status: 'live', handle: null, worktree: 'current', isLead: true },
      sessionId: 'sess-1', currentTask: null, queued: [], signals: [{ ...signalRow, post: 'builder@duo' }], frozen: null, hushedUntil: null, events: [], preview: [],
    }),
  })
  const detail = render(withStream('duo', <PostDetail team="duo" post="builder" />))
  expect(await detail.findByText(/预计 15:00 重置/)).toBeTruthy()
})

test('M-15: a board card carries the stuck-reason badge from the stale list; unknown or failing stale data leaves the board alone', async () => {
  stubEventSource()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks': () => ({
      tasks: [
        { id: 't1', status: 'dispatched', title: 'Alpha', tags: [], claimedBy: 'builder@duo', epoch: 1, gateFailures: 0 },
        { id: 't2', status: 'ready', title: 'Beta', tags: [], claimedBy: null, epoch: 0, gateFailures: 0 },
      ],
    }),
    'GET /api/teams/duo/tasks?stale=true': () => ({ tasks: [{ taskId: 't1', title: 'Alpha', reason: 'owner_idle', owner: 'builder@duo', since: null, command: 'x' }] }),
  })
  const { container, findByText } = render(withStream('duo', <TaskBoard team="duo" />))
  await findByText('Alpha')
  await waitFor(() => expect(container.querySelector('article.task .pill, article.task [data-stuck]')?.textContent).toContain('主人迟迟未开始'))
  const cards = [...container.querySelectorAll('article.task')]
  expect(cards.find((c) => c.textContent!.includes('Alpha'))!.textContent).toContain('主人迟迟未开始')
  expect(cards.find((c) => c.textContent!.includes('Beta'))!.textContent).not.toContain('卡住')
})

test('M-15: task detail shows the gate output file path when there is one', async () => {
  stubEventSource()
  const base = { id: 't1', status: 'blocked', title: 'Blocked Task', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 1, gateFailures: 1, readySince: null, dispatchedAt: null, result: null, outcome: null, reportedBy: null, closure: null, history: [] }
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks/t1': () => ({ ...base, gateOutput: '/home/u/.wingline/logs/duo/gate-t1-1-1.txt' }),
  })
  const a = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  expect(await a.findByText('/home/u/.wingline/logs/duo/gate-t1-1-1.txt')).toBeTruthy()
  a.unmount()
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks/t1': () => ({ ...base, gateOutput: null }),
  })
  const b = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await b.findByText('Blocked Task')
  expect(b.queryByText('闸门输出')).toBeNull()
})

test('M-15: the timeline range select refetches with since=<duration>', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/log': () => ({ events: [] }),
  })
  const { container, findByText } = render(withStream('duo', <Timeline team="duo" />))
  await findByText('暂无事件。')
  const selects = container.querySelectorAll('select')
  expect(selects).toHaveLength(2)
  fireEvent.change(selects[1]!, { target: { value: '1h' } })
  await waitFor(() => expect(calls.some((c) => c.path === '/api/teams/duo/log?limit=200&since=1h')).toBe(true))
})
