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
import { Fail, FakeEventSource, attentionOf, eventOf, mockApi, stubEventSource, teamOf } from './helpers.js'

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

const overviewRoutes = {
  'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
  'GET /api/teams/duo': () => teamOf(),
  'GET /api/teams/duo/attention': () => attentionOf(),
  'GET /api/teams/duo/log?limit=20': () => ({ events: [] }),
}

test('总览页「停止团队」确认后调用 POST down，未勾选不关终端', async () => {
  stubEventSource()
  const calls = mockApi({ ...overviewRoutes, 'POST /api/teams/duo/down': () => ({ team: 'duo', posts: [] }) })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('停止团队', { selector: 'button' }))
  fireEvent.click(getByText('确认停止', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/down')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/down')!.body).toEqual({})
})

test('未启动的团队显示「启动团队」与提示条，点击调用 POST up', async () => {
  stubEventSource()
  const calls = mockApi({
    ...overviewRoutes,
    'GET /api/teams/duo': () =>
      teamOf({
        status: 'stopped',
        runId: null,
        neverStarted: true,
        dispatcher: { health: { state: 'never' }, frozen: 0, hushed: 0, attentionItems: 0 },
        posts: [],
      }),
    'POST /api/teams/duo/up': () => ({ team: 'duo', posts: [], run: { outcome: 'created', runId: 'run-2' } }),
  })
  const { getByText, findByText, queryByText } = render(withStream('duo', <Overview team="duo" />))
  expect(await findByText('该团队还没有启动过', { exact: false })).toBeTruthy()
  expect(getByText('启动团队', { selector: 'button' })).toBeTruthy()
  expect(queryByText('停止团队')).toBeNull()
  fireEvent.click(getByText('启动团队', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')!.body).toEqual({})
})

test('运行中的团队提供「补齐岗位」按钮调用 POST up', async () => {
  stubEventSource()
  const calls = mockApi({ ...overviewRoutes, 'POST /api/teams/duo/up': () => ({ team: 'duo', posts: [], run: { outcome: 'kept', runId: 'run-1' } }) })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('补齐岗位', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')!.body).toEqual({})
})

const ambiguousUp = () => ({
  team: 'duo',
  posts: [],
  run: {
    outcome: 'ambiguous',
    runId: null,
    candidates: [
      { id: 'run-a', createdAt: '2026-10-29T10:00:00.000Z' },
      { id: 'run-b', createdAt: '2026-10-29T11:00:00.000Z' },
    ],
  },
})

test('up 返回 ambiguous 时弹出接管对话框，选择后带 adoptRun 重发', async () => {
  stubEventSource()
  let n = 0
  const calls = mockApi({
    ...overviewRoutes,
    'POST /api/teams/duo/up': () => (++n === 1 ? ambiguousUp() : { team: 'duo', posts: [], run: { outcome: 'adopted', runId: 'run-b' } }),
  })
  const { getByText, findByText, container } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('补齐岗位', { selector: 'button' }))
  expect(await findByText('选择要接管的运行')).toBeTruthy()
  fireEvent.change(container.querySelector('select')!, { target: { value: 'run-b' } })
  fireEvent.click(getByText('接管', { selector: 'button' }))
  await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')).toHaveLength(2))
  expect(calls.filter((c) => c.method === 'POST')[1]!.body).toEqual({ adoptRun: 'run-b' })
})

test('接管对话框里「新建运行」发送 newRun: true', async () => {
  stubEventSource()
  const calls = mockApi({ ...overviewRoutes, 'POST /api/teams/duo/up': () => ambiguousUp() })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('补齐岗位', { selector: 'button' }))
  expect(await findByText('选择要接管的运行')).toBeTruthy()
  fireEvent.click(getByText('新建运行（丢弃旧任务）', { selector: 'button' }))
  await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')).toHaveLength(2))
  expect(calls.filter((c) => c.method === 'POST')[1]!.body).toEqual({ newRun: true })
})

test('「接回会话」把 builder=sess-1 解析成 sessions 并展示岗位恢复结果', async () => {
  stubEventSource()
  const calls = mockApi({
    ...overviewRoutes,
    'POST /api/teams/duo/restore': () => ({
      team: 'duo',
      dryRun: false,
      posts: [
        { address: 'builder@duo', outcome: 'resumed', sessionId: 'sess-1' },
        { address: 'checker@duo', outcome: 'kept' },
      ],
      dispatcher: { action: 'left', state: 'running' },
      tasks: [],
    }),
  })
  const { getByText, findByText, container } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('接回会话', { selector: 'button' }))
  fireEvent.input(container.querySelector('input[type="text"]')!, { target: { value: 'builder=sess-1' } })
  fireEvent.click(getByText('执行', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/restore')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/restore')!.body).toEqual({ sessions: { builder: 'sess-1' } })
  expect(await findByText(/已接回/)).toBeTruthy()
  expect(getByText(/已保留/)).toBeTruthy()
})

test('有草稿时「应用草稿并重启」依次调用 down 与 up { draft: true }', async () => {
  stubEventSource()
  const calls = mockApi({
    ...overviewRoutes,
    'GET /api/teams/duo': () => teamOf({ hasDraft: true }),
    'POST /api/teams/duo/down': () => ({ team: 'duo', posts: [] }),
    'POST /api/teams/duo/up': () => ({ team: 'duo', posts: [], run: { outcome: 'created', runId: 'run-2' } }),
  })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('应用草稿并重启', { selector: 'button' }))
  fireEvent.click(getByText('同时关闭旧岗位终端'))
  fireEvent.click(getByText('确认重启', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/down')!.body).toEqual({ close: true })
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/up')!.body).toEqual({ draft: true })
})

test('调度员停止时显示「启动调度员」，点击调用 dispatcher/up', async () => {
  stubEventSource()
  const calls = mockApi({
    ...overviewRoutes,
    'GET /api/teams/duo': () =>
      teamOf({ dispatcher: { team: 'duo', health: { state: 'stopped' }, lastCheck: null, lastScan: null, frozen: 0, hushed: 0, attentionItems: 0, warnings: [] } }),
    'POST /api/teams/duo/dispatcher/up': () => ({}),
  })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('启动调度员', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/dispatcher/up')).toBe(true))
})

test('调度员运行中显示「停止调度员」，点击调用 dispatcher/down', async () => {
  stubEventSource()
  const calls = mockApi({ ...overviewRoutes, 'POST /api/teams/duo/dispatcher/down': () => ({}) })
  const { getByText, findByText } = render(withStream('duo', <Overview team="duo" />))
  await findByText('builder')
  fireEvent.click(getByText('停止调度员', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/dispatcher/down')).toBe(true))
})

test('orca 不可达时总览顶部显示普通提示条', async () => {
  stubEventSource()
  mockApi({ ...overviewRoutes, 'GET /api/teams/duo': () => teamOf({ orcaUnavailable: '连接超时' }) })
  const { findByText } = render(withStream('duo', <Overview team="duo" />))
  expect(await findByText(/Orca 未运行或不可达/)).toBeTruthy()
})

test('inbox: owner_idle 的卡住任务提供「开始任务」按钮，以任务主人调 start', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () =>
      attentionOf({ stale: [{ taskId: 't1', title: 'Idle Task', reason: 'owner_idle', owner: 'builder@duo', since: null, command: 'wl task start t1 --as builder' }] }),
    'POST /api/teams/duo/tasks/t1/start': () => ({ delivery: { to: 'builder@duo' } }),
  })
  const { getByText, findByText } = render(withStream('duo', <Inbox team="duo" />))
  await findByText('Idle Task')
  fireEvent.click(getByText('开始任务', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/start')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/start')!.body).toEqual({ as: 'builder' })
})

test('inbox: done_unfinished 的卡住任务提供「完成并校验」按钮，以任务主人调 done', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () =>
      attentionOf({ stale: [{ taskId: 't1', title: 'Unfinished Task', reason: 'done_unfinished', owner: 'builder@duo', since: null, command: 'wl task done t1 --as builder' }] }),
    'POST /api/teams/duo/tasks/t1/done': () => ({}),
  })
  const { getByText, findByText } = render(withStream('duo', <Inbox team="duo" />))
  await findByText('Unfinished Task')
  fireEvent.click(getByText('完成并校验', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/done')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/done')!.body).toEqual({ as: 'builder' })
})

test('inbox: 调度员告警区提供「启动调度员」按钮', async () => {
  stubEventSource()
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/attention': () => attentionOf({ dispatcher: { state: 'stopped', pid: null, heartbeatAt: null, ageMs: 1000 } }),
    'POST /api/teams/duo/dispatcher/up': () => ({}),
  })
  const { getByText, findByText } = render(withStream('duo', <Inbox team="duo" />))
  await findByText('调度员不在运行', { exact: false })
  fireEvent.click(getByText('启动调度员', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/dispatcher/up')).toBe(true))
})

const shownTask = (over: Record<string, unknown> = {}) => ({
  id: 't1', status: 'ready', title: 'Alpha', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: null,
  assigneeHandle: null, dispatchId: null, epoch: 1, gateFailures: 0, readySince: null, dispatchedAt: null, result: null,
  outcome: null, reportedBy: null, closure: null, history: [], ...over,
})

const taskDetailRoutes = {
  'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
  'GET /api/teams/duo': () => teamOf(),
  'GET /api/teams/duo/tasks/t1': () => shownTask(),
}

test('任务详情页有「以岗位身份执行」卡片与五个按钮', async () => {
  stubEventSource()
  mockApi(taskDetailRoutes)
  const { getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  expect(getByText('以岗位身份执行')).toBeTruthy()
  for (const label of ['认领任务', '放弃认领', '记录计划', '开始任务', '完成并校验']) {
    expect(getByText(label, { selector: 'button' })).toBeTruthy()
  }
})

test('「认领任务」以默认选中的牵头岗身份 POST claim', async () => {
  stubEventSource()
  const calls = mockApi({ ...taskDetailRoutes, 'POST /api/teams/duo/tasks/t1/claim': () => ({}) })
  const { getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  fireEvent.click(getByText('认领任务', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/claim')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/claim')!.body).toEqual({ as: 'builder@duo' })
})

test('切到其它岗位后「开始任务」以该岗位 POST start', async () => {
  stubEventSource()
  const calls = mockApi({ ...taskDetailRoutes, 'POST /api/teams/duo/tasks/t1/start': () => ({}) })
  const { container, getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  fireEvent.change(container.querySelector('select')!, { target: { value: 'checker@duo' } })
  fireEvent.click(getByText('开始任务', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/start')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/start')!.body).toEqual({ as: 'checker@duo' })
})

test('「记录计划」弹窗提交 as 与计划内容', async () => {
  stubEventSource()
  const calls = mockApi({ ...taskDetailRoutes, 'POST /api/teams/duo/tasks/t1/plan': () => ({}) })
  const { container, getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  fireEvent.click(getByText('记录计划', { selector: 'button' }))
  fireEvent.input(container.querySelector('textarea')!, { target: { value: '先做 A' } })
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/plan')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/plan')!.body).toEqual({ as: 'builder@duo', text: '先做 A' })
})

test('「完成并校验」闸门失败时显示输出摘要并刷新任务详情', async () => {
  stubEventSource()
  let n = 0
  const calls = mockApi({
    ...taskDetailRoutes,
    'GET /api/teams/duo/tasks/t1': () =>
      shownTask(++n === 1 ? { status: 'dispatched', claimedBy: 'builder@duo' } : { status: 'blocked', claimedBy: 'builder@duo', gateFailures: 1 }),
    'POST /api/teams/duo/tasks/t1/done': () => ({ outcome: 'gate_failed', gateOutputPath: '/home/x/.wingline/logs/duo/gate-t1-1-1.txt' }),
  })
  const { getByText, findByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  fireEvent.click(getByText('完成并校验', { selector: 'button' }))
  expect(await findByText(/闸门未通过/)).toBeTruthy()
  expect(getByText(/gate-t1-1-1\.txt/)).toBeTruthy()
  expect(await findByText('1 次')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/done')!.body).toEqual({ as: 'builder@duo' })
})

test('终态任务提供「重开并转人工」（reopen: true），且不渲染执行卡片', async () => {
  stubEventSource()
  const calls = mockApi({
    ...taskDetailRoutes,
    'GET /api/teams/duo/tasks/t1': () => shownTask({ status: 'completed', outcome: 'done', claimedBy: 'builder@duo' }),
    'POST /api/teams/duo/tasks/t1/escalate': () => ({}),
  })
  const { container, getByText, findByText, queryByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  await findByText('Alpha')
  expect(queryByText('认领任务')).toBeNull()
  fireEvent.click(getByText('重开并转人工', { selector: 'button' }))
  fireEvent.input(container.querySelector('textarea')!, { target: { value: '还要补一段' } })
  fireEvent.click(getByText('确认', { selector: 'button' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/escalate')).toBe(true))
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/teams/duo/tasks/t1/escalate')!.body).toEqual({ reason: '还要补一段', reopen: true })
})

test('团队未启动时任务详情给中性提示，且不渲染执行卡片', async () => {
  stubEventSource()
  mockApi({
    ...taskDetailRoutes,
    'GET /api/teams/duo/tasks/t1': () => {
      throw new Fail(400, { kind: 'input', code: 'run_not_ready', message: '团队 duo 还没有建立 Run' })
    },
  })
  const { container, findByText, queryByText } = render(withStream('duo', <TaskDetail team="duo" id="t1" />))
  expect(await findByText('团队尚未启动，先点击『启动团队』')).toBeTruthy()
  expect(container.querySelector('.error')).toBeNull()
  expect(queryByText('认领任务')).toBeNull()
})

test('团队未启动时任务看板给中性提示而不是错误块', async () => {
  stubEventSource()
  const notReady = () => {
    throw new Fail(400, { kind: 'input', code: 'run_not_ready', message: '团队 duo 还没有建立 Run' })
  }
  mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/tasks': notReady,
    'GET /api/teams/duo/tasks?stale=true': notReady,
  })
  const { container, findByText } = render(withStream('duo', <TaskBoard team="duo" />))
  expect(await findByText('团队尚未启动，先点击『启动团队』')).toBeTruthy()
  expect(container.querySelector('.error')).toBeNull()
})
