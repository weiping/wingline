import { expect, test } from 'vitest'
import { initialTuiState, renderView } from '../../src/tui/app.js'
import { LineInput } from '../../src/tui/input.js'
import { cellWidth } from '../../src/tui/width.js'
import type { TuiState } from '../../src/tui/types.js'
import { attentionOf, dataOf, event, question } from './fixtures.js'

const SIZE = { cols: 80, rows: 24 }
const on = (view: TuiState['view'], over: Partial<TuiState> = {}): TuiState => ({ ...initialTuiState(), view, ...over })

test('every rendered line is padded or cut to exactly the window width', () => {
  const data = dataOf({ timeline: [event({ target: '很长的目标'.repeat(30) })], attention: attentionOf({ questions: [question({ body: '长'.repeat(200) })] }) })
  for (const view of ['overview', 'inbox', 'timeline'] as const) {
    for (const l of renderView(on(view), data, SIZE)) expect(cellWidth(l)).toBe(80)
  }
})

test('the selected row stays on screen in a long inbox and a long overview', () => {
  const many = Array.from({ length: 40 }, (_, i) => question({ messageId: `msg-${i}`, body: `问题编号${i}` }))
  const inbox = dataOf({ attention: attentionOf({ questions: many }) })
  const size = { cols: 80, rows: 24 }
  for (const selected of [0, 17, 18, 35, 39]) {
    const lines = renderView(on('inbox', { selected }), inbox, size)
    expect(lines).toHaveLength(24)
    const marked = lines.filter((l) => l.startsWith('>'))
    expect(marked).toHaveLength(1)
    expect(marked[0]).toContain(`问题编号${selected}`)
    expect(lines[0]).toContain('雁阵') // 页头不被卷走
  }
  const posts = Array.from({ length: 40 }, (_, i) => ({ address: `p${i}@duo`, agent: 'claude', status: 'live' as const, handle: null, worktree: 'c', isLead: false }))
  const lines = renderView(on('overview', { selected: 33 }), dataOf({ posts }), size)
  expect(lines.filter((l) => l.startsWith('>'))).toEqual([expect.stringContaining('p33@duo')])
})

test('overview shows the dispatcher line, the post table and the last 8 timeline events', () => {
  const timeline = Array.from({ length: 12 }, (_, i) => event({ id: `command:${i}`, action: `act${i}` }))
  const text = renderView(on('overview'), dataOf({ timeline }), SIZE).join('\n')
  expect(text).toContain('调度员：运行中')
  expect(text).toContain('builder@duo')
  expect(text).toContain('checker@duo')
  expect(text).toContain('act11')
  expect(text).toContain('act4')
  expect(text).not.toContain('act3 ')
  expect(text).not.toMatch(/act3\b/)
})

test('overview marks frozen, hushed and signalled posts and shows the current task', () => {
  const data = dataOf({
    attention: attentionOf({
      frozen: [{ post: 'checker@duo', reason: 'x', frozenAt: 'T', skippedChildren: 0 }],
      signals: [{ team: 'duo', post: 'builder@duo', signal: 'no_progress', taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, command: null, summary: null }],
    }),
    hushed: ['builder@duo'],
    tasks: [{ id: 't1', status: 'dispatched', title: '实现登录', assigneeHandle: 'term-b' } as never],
  })
  const lines = renderView(on('overview'), data, SIZE)
  const builder = lines.find((l) => l.includes('builder@duo'))!
  const checker = lines.find((l) => l.includes('checker@duo'))!
  expect(builder).toContain('实现登录')
  expect(builder).toContain('静音')
  expect(builder).toContain('no_progress')
  expect(checker).toContain('冻结')
})

test('the selected row is marked with > and nothing else carries terminal styling', () => {
  const lines = renderView(on('overview', { selected: 1 }), dataOf(), SIZE)
  expect(lines.find((l) => l.startsWith('>'))).toContain('checker@duo')
  expect(lines.filter((l) => l.startsWith('>'))).toHaveLength(1)
  expect(lines.join('\n')).not.toMatch(/\x1b/)
})

test('inbox lists every section with its rows, and the warnings as a read-only section', () => {
  const data = dataOf({
    attention: attentionOf({
      warnings: ['有未应用的规格草稿：/t/team.draft.yaml'],
      questions: [question()],
      frozen: [{ post: 'checker@duo', reason: '卡住', frozenAt: 'T', skippedChildren: 0 }],
      stale: [
        { taskId: 't3', title: '审批发布', reason: 'blocked_waiting', owner: 'builder@duo', since: null, command: 'wl task resolve g1', gateId: 'g1' } as never,
        { taskId: 't4', title: '丢了', reason: 'dead_assignee', owner: 'checker@duo', since: null, command: 'wl task recover t4' } as never,
      ],
    }),
  })
  const text = renderView(on('inbox'), data, SIZE).join('\n')
  for (const part of ['告警', '有未应用的规格草稿', '待回答的提问', '用哪个库', '等待决策的 gate', '审批发布', '冻结的岗位', '卡住的任务', '丢了']) expect(text).toContain(part)
})

test('rows without a write action show the wl command on Enter (see reduce tests) and inbox says so when empty', () => {
  const text = renderView(on('inbox'), dataOf(), SIZE).join('\n')
  expect(text).toContain('没有需要处理的事项')
})

test('a question body with ANSI/OSC sequences renders as plain text', () => {
  const data = dataOf({ attention: attentionOf({ questions: [question({ body: 'hi\x1b]0;pwned\x07\x1b[2J' })] }) })
  for (const view of ['overview', 'inbox', 'timeline'] as const) {
    const lines = renderView(on(view), data, SIZE)
    expect(lines.join('\n')).not.toMatch(/\x1b/)
  }
  const inbox = renderView(on('inbox'), data, SIZE)
  expect(inbox.some((l) => l.includes('hi'))).toBe(true)
  expect(inbox.join('\n')).not.toContain('pwned')
})

test('ANSI/OSC sequences in timeline fields, task titles and post names never reach the screen', () => {
  const bad = 'x\x1b]0;pwned\x07\x1b[2Jy'
  const data = dataOf({
    timeline: [event({ actor: bad, action: bad, target: bad, outcome: bad, detail: { message: bad } })],
    tasks: [{ id: 't1', status: 'dispatched', title: bad, assigneeHandle: 'term-b' } as never],
    attention: attentionOf({ warnings: [bad] }),
  })
  for (const view of ['overview', 'inbox', 'timeline'] as const) {
    const text = renderView(on(view), data, SIZE).join('\n')
    expect(text).not.toMatch(/\x1b/)
    expect(text).not.toContain('pwned')
  }
})

test('timeline view shows events oldest first and honours the filter', () => {
  const timeline = [event({ id: 'command:1', action: 'one', target: 'builder@duo' }), event({ id: 'task:2', source: 'task', action: 'two', target: 'checker@duo' })]
  const all = renderView(on('timeline'), dataOf({ timeline }), SIZE).join('\n')
  expect(all.indexOf('one')).toBeLessThan(all.indexOf('two'))
  const onlyTask = renderView(on('timeline', { filter: { source: 'task' } }), dataOf({ timeline }), SIZE).join('\n')
  expect(onlyTask).toContain('two')
  expect(onlyTask).not.toContain('one')
  expect(onlyTask).toContain('过滤')
  const byPost = renderView(on('timeline', { filter: { post: 'builder' } }), dataOf({ timeline }), SIZE).join('\n')
  expect(byPost).toContain('one')
  expect(byPost).not.toContain('two')
})

test('narrow window renders the too-narrow notice and recovers when widened', () => {
  expect(renderView(on('overview'), dataOf(), { cols: 39, rows: 24 })).toEqual(['窗口太窄'])
  expect(renderView(on('overview'), dataOf(), { cols: 40, rows: 24 }).length).toBeGreaterThan(1)
})

test('a stale flag shows the 数据过期 notice and the status line shows the last result', () => {
  const lines = renderView(on('overview', { stale: true, status: '已回答' }), dataOf(), SIZE).join('\n')
  expect(lines).toContain('数据过期')
  expect(lines).toContain('已回答')
})

test('the help overlay lists the keys', () => {
  const text = renderView(on('overview', { help: true }), dataOf(), SIZE).join('\n')
  for (const k of ['Tab', 'Enter', '/', 'R', 'q']) expect(text).toContain(k)
})

test('an open input, menu and confirm prompt are drawn at the bottom', () => {
  const input = new LineInput('回答: ')
  expect(renderView(on('inbox', { input, inputKind: 'flow' }), dataOf(), SIZE).at(-1)).toContain('回答: ')
  const menu = { items: [{ label: '发消息', steps: [], build: () => 'x' }, { label: '冻结', steps: [], build: () => 'x' }], selected: 1 }
  const menuText = renderView(on('overview', { menu }), dataOf(), SIZE).join('\n')
  expect(menuText).toContain('发消息')
  expect(menuText).toMatch(/> .*冻结/)
  const confirm = { command: 'send' as const, args: {}, label: '给 builder@duo 发消息' }
  expect(renderView(on('overview', { confirm }), dataOf(), SIZE).at(-1)).toMatch(/发消息.*y/)
})

test('screen snapshot of the overview view', () => {
  const data = dataOf({ tasks: [{ id: 't1', status: 'dispatched', title: '实现登录', assigneeHandle: 'term-b' } as never] })
  expect(renderView(on('overview'), data, { cols: 60, rows: 12 }).map((l) => l.trimEnd())).toMatchInlineSnapshot(`
    [
      "雁阵 duo   [1 总览]  2 收件箱   3 时间线",
      "调度员：运行中（心跳 12 秒前）   待办 0",
      "岗位（2）",
      "> builder@duo          claude  live    实现登录",
      "  checker@duo          codex   live    —",
      "",
      "最近事件",
      "  暂无",
      "",
      "",
      "",
      "j/k 选择  Enter 操作  Tab 切换  ? 帮助  q 退出",
    ]
  `)
})

test('3D: the inbox row of a screen signal shows its summary', () => {
  const row = { team: 'duo', post: 'checker@duo', signal: 'usage_limit' as const, taskId: '', level: 1, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, detail: null, command: null, summary: '预计 15:00 重置' }
  const text = renderView(on('inbox'), dataOf({ attention: attentionOf({ signals: [row] }) }), SIZE).join('\n')
  expect(text).toContain('usage_limit L1')
  expect(text).toContain('预计 15:00 重置')
})
