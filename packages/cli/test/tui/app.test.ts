import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { afterEach, expect, test, vi } from 'vitest'
import { ask, FakeOrca, seedRunningTeam } from '../../../core/test/commands/fake-client.js'
import { WinglineError, type WriteCommands } from '@wingline/core'
import { initialTuiState, reduce, runTui } from '../../src/tui/app.js'
import { LineInput } from '../../src/tui/input.js'
import { parseKeys } from '../../src/tui/keys.js'
import type { Effect, TuiData, TuiState } from '../../src/tui/types.js'
import { cellWidth } from '../../src/tui/width.js'
import { attentionOf, dataOf, event, question } from './fixtures.js'

// ———— reduce：纯函数的按键状态机 ————

const on = (view: TuiState['view'], over: Partial<TuiState> = {}): TuiState => ({ ...initialTuiState(), view, ...over })
/** 依次按下一串键，返回最终状态与最后一个非空的 effect。 */
function press(state: TuiState, data: TuiData, keys: string): { state: TuiState; effect?: Effect; effects: Effect[] } {
  let s = state
  const effects: Effect[] = []
  for (const k of parseKeys(keys)) {
    const r = reduce(s, k, data)
    s = r.state
    if (r.effect) effects.push(r.effect)
  }
  return { state: s, effect: effects.at(-1), effects }
}
const ENTER = '\r'
const ESC = '\x1b'

test('1/2/3 and Tab switch views; j/k move the selection within bounds', () => {
  const data = dataOf()
  let r = press(on('overview'), data, 'j')
  expect(r.state.selected).toBe(1)
  r = press(r.state, data, 'j')
  expect(r.state.selected).toBe(1)
  r = press(r.state, data, 'kk')
  expect(r.state.selected).toBe(0)
  r = press(r.state, data, '\x1b[B\x1b[B\x1b[A')
  expect(r.state.selected).toBe(0 + 1 - 1 + 0)
  r = press(on('overview', { selected: 1 }), data, '2')
  expect(r.state).toMatchObject({ view: 'inbox', selected: 0 })
  expect(press(r.state, data, '3').state.view).toBe('timeline')
  expect(press(r.state, data, '1').state.view).toBe('overview')
  const tabs: string[] = []
  let s = on('overview')
  for (let i = 0; i < 3; i++) {
    s = press(s, data, '\t').state
    tabs.push(s.view)
  }
  expect(tabs).toEqual(['inbox', 'timeline', 'overview'])
})

test('selection never goes below zero on an empty view', () => {
  expect(press(on('inbox'), dataOf(), 'jjj').state.selected).toBe(0)
})

const withQuestion = dataOf({ attention: attentionOf({ questions: [question()] }) })

test('Enter on a question opens the reply input, typing then Enter asks to confirm, y runs dispatcherReply', () => {
  let r = press(on('inbox'), withQuestion, ENTER)
  expect(r.state.menu).toBeNull()
  expect(r.state.input).toBeInstanceOf(LineInput)
  r = press(r.state, withQuestion, 'ok')
  r = press(r.state, withQuestion, ENTER)
  expect(r.state.input).toBeNull()
  expect(r.state.confirm).toMatchObject({ command: 'dispatcherReply', args: { team: 'duo', messageId: 'msg-1', body: 'ok' } })
  r = press(r.state, withQuestion, 'y')
  expect(r.effect).toEqual({ kind: 'run', action: expect.objectContaining({ command: 'dispatcherReply', args: { team: 'duo', messageId: 'msg-1', body: 'ok' } }) })
  expect(r.state.confirm).toBeNull()
})

test('any key other than y at the confirm prompt cancels', () => {
  const confirm = { command: 'send' as const, args: { address: 'a@duo', message: 'x' }, label: '发消息' }
  for (const k of ['n', ENTER, ESC, 'q', ' ']) {
    const r = press(on('overview', { confirm }), dataOf(), k)
    expect(r.state.confirm).toBeNull()
    expect(r.effects).toEqual(k === 'q' ? [] : [])
    expect(r.state.status).toContain('已取消')
  }
})

test('Esc cancels an open input, an empty required answer is refused, Ctrl-C quits from anywhere', () => {
  let r = press(on('inbox'), withQuestion, `${ENTER}${ESC}`)
  expect(r.state.input).toBeNull()
  r = press(on('inbox'), withQuestion, `${ENTER}${ENTER}`)
  expect(r.state.input).not.toBeNull()
  expect(r.state.status).toContain('不能为空')
  expect(press(r.state, withQuestion, '\x03').effect).toEqual({ kind: 'quit' })
})

test('typing q into an input does not quit', () => {
  const r = press(on('inbox'), withQuestion, `${ENTER}q`)
  expect(r.effects).toEqual([])
  expect((r.state.input as LineInput).value).toBe('q')
})

test('Enter on a post opens a menu; arrows move in it; Esc closes it; frozen posts offer 解冻', () => {
  let r = press(on('overview'), dataOf(), ENTER)
  expect(r.state.menu!.items.map((i) => i.label)).toEqual(['发消息', '冻结', '静音'])
  r = press(r.state, dataOf(), '\x1b[B')
  expect(r.state.menu!.selected).toBe(1)
  r = press(r.state, dataOf(), ENTER)
  expect(r.state.menu).toBeNull()
  expect(r.state.input).not.toBeNull()
  expect(press(on('overview'), dataOf(), `${ENTER}${ESC}`).state.menu).toBeNull()

  const frozen = dataOf({ attention: attentionOf({ frozen: [{ post: 'builder@duo', reason: 'x', frozenAt: 'T', skippedChildren: 0 }] }), hushed: ['builder@duo'] })
  expect(press(on('overview'), frozen, ENTER).state.menu!.items.map((i) => i.label)).toEqual(['发消息', '解冻', '取消静音'])
})

test('freeze asks for a reason, unfreeze and recover go straight to the confirm prompt', () => {
  let r = press(on('overview'), dataOf(), `${ENTER}\x1b[B${ENTER}no good${ENTER}`)
  expect(r.state.confirm).toMatchObject({ command: 'freezePostCmd', args: { address: 'builder@duo', reason: 'no good' } })
  const frozen = dataOf({ attention: attentionOf({ frozen: [{ post: 'builder@duo', reason: 'x', frozenAt: 'T', skippedChildren: 0 }] }) })
  r = press(on('overview'), frozen, `${ENTER}\x1b[B${ENTER}`)
  expect(r.state.confirm).toMatchObject({ command: 'unfreezePostCmd', args: { address: 'builder@duo' } })
  const dead = dataOf({ attention: attentionOf({ stale: [{ taskId: 't4', title: '丢了', reason: 'dead_assignee', owner: 'checker@duo', since: null, command: 'wl task recover t4' } as never] }) })
  expect(press(on('inbox'), dead, ENTER).state.confirm).toMatchObject({ command: 'recoverTask', args: { id: 't4' } })
})

test('hush asks for optional minutes: empty means the default, a number becomes forMs, junk is refused', () => {
  const start = `${ENTER}\x1b[B\x1b[B${ENTER}`
  expect(press(on('overview'), dataOf(), `${start}${ENTER}`).state.confirm).toMatchObject({ command: 'hushCmd', args: { address: 'builder@duo' } })
  expect(press(on('overview'), dataOf(), `${start}${ENTER}`).state.confirm!.args).not.toHaveProperty('forMs')
  expect(press(on('overview'), dataOf(), `${start}15${ENTER}`).state.confirm!.args).toEqual({ address: 'builder@duo', forMs: 900_000 })
  const bad = press(on('overview'), dataOf(), `${start}abc${ENTER}`)
  expect(bad.state.confirm).toBeNull()
  expect(bad.state.status).toContain('分钟')
})

test('a gate offers resolve and resolve-with-reassign', () => {
  const gate = dataOf({ attention: attentionOf({ stale: [{ taskId: 't3', title: '审批', reason: 'blocked_waiting', owner: null, since: null, command: 'x', gateId: 'g1' } as never] }) })
  const menu = press(on('inbox'), gate, ENTER).state.menu!
  expect(menu.items.map((i) => i.label)).toEqual(['处理', '处理并改派'])
  let r = press(on('inbox'), gate, `${ENTER}${ENTER}go${ENTER}`)
  expect(r.state.confirm).toMatchObject({ command: 'resolveGate', args: { gateId: 'g1', resolution: 'go' } })
  r = press(on('inbox'), gate, `${ENTER}\x1b[B${ENTER}go${ENTER}checker${ENTER}`)
  expect(r.state.confirm).toMatchObject({ command: 'resolveGate', args: { gateId: 'g1', resolution: 'go', reassign: 'checker@duo' } })
})

test('a signal offers hush and send', () => {
  const signal = dataOf({ attention: attentionOf({ signals: [{ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: null, notifyCount: 0, nextDueAt: null, clearedAt: null, command: null }] }) })
  expect(press(on('inbox'), signal, ENTER).state.menu!.items.map((i) => i.label)).toEqual(['静音', '发消息'])
})

test('rows without a write action show the wl command instead of a menu', () => {
  const stuck = dataOf({ attention: attentionOf({ stale: [{ taskId: 't9', title: '没收尾', reason: 'done_unfinished', owner: 'builder@duo', since: null, command: 'wl task done t9' } as never] }) })
  const r = press(on('inbox'), stuck, ENTER)
  expect(r.state.menu).toBeNull()
  expect(r.state.input).toBeNull()
  expect(r.state.status).toContain('wl task done t9')
  const t = press(on('timeline'), dataOf({ timeline: [event()] }), ENTER)
  expect(t.state.menu).toBeNull()
  expect(t.state.input).toBeNull()
})

test('an uncertain result shows the hint and R replays the same args and retryRequest', () => {
  const uncertain = { command: 'send' as const, args: { address: 'builder@duo', message: 'hi', retryRequest: 'req-1' }, label: '发消息' }
  const r = press(on('overview', { lastUncertain: uncertain }), dataOf(), 'R')
  expect(r.effect).toEqual({ kind: 'run', action: uncertain })
  expect(r.state.lastUncertain).toBe(uncertain)
})

test('R does nothing when there is no uncertain action', () => {
  const s = on('overview')
  const r = press(s, dataOf(), 'R')
  expect(r.effects).toEqual([])
  expect(r.state).toEqual(s)
})

test('/ post:builder filters the timeline; an empty filter clears it; junk is refused', () => {
  const data = dataOf({ timeline: [event()] })
  let r = press(on('timeline'), data, `/post:builder${ENTER}`)
  expect(r.state.filter).toEqual({ post: 'builder' })
  expect(r.state.input).toBeNull()
  r = press(r.state, data, `/source:task${ENTER}`)
  expect(r.state.filter).toEqual({ source: 'task' })
  r = press(r.state, data, `/task:t1${ENTER}`)
  expect(r.state.filter).toEqual({ task: 't1' })
  r = press(r.state, data, `/nonsense${ENTER}`)
  expect(r.state.filter).toEqual({ task: 't1' })
  expect(r.state.status).toContain('source:')
  r = press(r.state, data, `/source:nope${ENTER}`)
  expect(r.state.filter).toEqual({ task: 't1' })
  r = press(r.state, data, `/${ENTER}`)
  expect(r.state.filter).toBeNull()
  expect(press(on('overview'), data, '/').state.input).toBeNull()
})

test('? toggles the help overlay; r refreshes; q quits', () => {
  let r = press(on('overview'), dataOf(), '?')
  expect(r.state.help).toBe(true)
  r = press(r.state, dataOf(), '?')
  expect(r.state.help).toBe(false)
  expect(press(r.state, dataOf(), '?x').state.help).toBe(false)
  expect(press(on('overview'), dataOf(), 'r').effect).toEqual({ kind: 'refresh' })
  expect(press(on('overview'), dataOf(), 'q').effect).toEqual({ kind: 'quit' })
})

// ———— runTui：进程内整体运行 ————

class FakeStdin extends EventEmitter {
  isTTY = true
  raw: boolean[] = []
  paused = false
  setRawMode(b: boolean) { this.raw.push(b); return this }
  resume() { this.paused = false; return this }
  pause() { this.paused = true; return this }
  setEncoding() { return this }
  press(s: string) { this.emit('data', s) }
}
class MemOut extends Writable {
  isTTY = true
  columns = 80
  rows = 24
  chunks: string[] = []
  _write(chunk: Buffer | string, _e: BufferEncoding, cb: () => void) { this.chunks.push(String(chunk)); cb() }
  all() { return this.chunks.join('') }
}

const FAST = { dataMs: 10, timelineMs: 10 }
const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('等待超时')
    await new Promise((r) => setTimeout(r, 5))
  }
}

function harness(o: { orca?: FakeOrca } = {}) {
  const orca = o.orca ?? new FakeOrca()
  const seeded = seedRunningTeam(orca)
  const stdin = new FakeStdin()
  const stdout = new MemOut()
  let frame: string[] = []
  const ctl = new AbortController()
  const start = (extra: Record<string, unknown> = {}) =>
    runTui(seeded.deps, 'duo', { stdin: stdin as never, stdout: stdout as never }, { signal: ctl.signal, ...FAST, onFrame: (l: string[]) => { frame = l }, ...extra } as never)
  const text = () => frame.join('\n')
  const frameWidth = () => cellWidth(frame[0] ?? '')
  return { orca, ...seeded, stdin, stdout, start, text, ctl, frameWidth }
}

afterEach(() => vi.useRealTimers())

test('enters raw mode and the alternate screen, shows the posts, and q restores the terminal', async () => {
  const h = harness()
  const done = h.start()
  await until(() => h.text().includes('builder@duo'))
  expect(h.stdin.raw).toEqual([true])
  expect(h.stdout.all()).toContain('\x1b[?1049h')
  h.stdin.press('q')
  await done
  expect(h.stdin.raw).toEqual([true, false])
  expect(h.stdin.paused).toBe(true)
  const out = h.stdout.all()
  expect(out.lastIndexOf('\x1b[?25h')).toBeGreaterThan(-1)
  expect(out.endsWith('\x1b[?25h\x1b[?1049l')).toBe(true)
})

test('aborting the signal ends the TUI and restores the terminal', async () => {
  const h = harness()
  const done = h.start()
  await until(() => h.text().includes('builder@duo'))
  h.ctl.abort()
  await done
  expect(h.stdout.all().endsWith('\x1b[?1049l')).toBe(true)
  expect(h.stdin.raw.at(-1)).toBe(false)
})

test('replying to a question from the inbox writes a tui: audit row and the event shows up in the timeline', async () => {
  const orca = new FakeOrca()
  const h = harness({ orca })
  const { id } = await orca.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  h.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  const { dispatchId } = await orca.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  ask(orca, id, '用哪个库？', ['a', 'b'])
  const qid = orca.inbox.at(-1)!.id
  h.registry.recordQuestion({ team: 'duo', messageId: qid, taskId: id, dispatchId, asker: 'checker@duo', body: '用哪个库？', options: ['a', 'b'], relayedAt: 'T' })

  const done = h.start()
  await until(() => h.text().includes('builder@duo'))
  h.stdin.press('2')
  await until(() => h.text().includes('用哪个库'))
  h.stdin.press('\r')
  await until(() => h.text().includes('回答'))
  h.stdin.press('用 a')
  h.stdin.press('\r')
  await until(() => /按 y/.test(h.text()))
  h.stdin.press('y')
  await until(() => h.registry.getQuestion(qid)?.answeredAt != null)
  expect(h.registry.listAudit('duo').at(-1)).toMatchObject({ command: 'tui: dispatcher reply', actor: 'human' })
  h.stdin.press('3')
  await until(() => h.text().includes('dispatcher reply'))
  h.stdin.press('q')
  await done
})

test('an uncertain write shows the hint, and R resends the same args with the same retryRequest', async () => {
  const h = harness()
  const calls: Array<Record<string, unknown>> = []
  const commands = {
    send: async (_d: unknown, a: Record<string, unknown>) => {
      calls.push(a)
      if (calls.length === 1) throw new WinglineError('uncertain', 'terminal_send_unconfirmed', '发送未获确认', { detail: { retryRequest: 'req-9' } })
      return { address: a.address, outcome: 'delivered', handle: 'h' }
    },
  } as unknown as WriteCommands
  const done = h.start({ commands })
  await until(() => h.text().includes('builder@duo'))
  h.stdin.press('\r')
  h.stdin.press('\r')
  await until(() => h.text().includes('消息'))
  h.stdin.press('hi')
  h.stdin.press('\r')
  await until(() => /按 y/.test(h.text()))
  h.stdin.press('y')
  await until(() => h.text().includes('按 R'))
  expect(h.text()).toContain('发送未获确认')
  h.stdin.press('R')
  await until(() => calls.length === 2)
  expect(calls[1]).toEqual({ address: 'builder@duo', message: 'hi', retryRequest: 'req-9' })
  await until(() => !h.text().includes('按 R'))
  h.stdin.press('q')
  await done
})

test('a failing write shows on the status line and the TUI keeps running', async () => {
  const h = harness()
  const commands = { send: async () => { throw new WinglineError('orca', 'runtime_unavailable', 'Orca 不可达') } } as unknown as WriteCommands
  const done = h.start({ commands })
  await until(() => h.text().includes('builder@duo'))
  for (const k of ['\r', '\r', 'hi', '\r', 'y']) h.stdin.press(k)
  await until(() => h.text().includes('Orca 不可达'))
  h.stdin.press('?')
  await until(() => h.text().includes('Ctrl-C'))
  h.stdin.press('?')
  await until(() => !h.text().includes('Ctrl-C'))
  h.stdin.press('q')
  await done
})

test('a failing read marks the data stale without exiting, and the next good read clears it', async () => {
  const h = harness()
  let fail = false
  const done = h.start({
    read: { attention: async (d: never, t: string) => { if (fail) throw new Error('boom'); return (await import('@wingline/core')).attention(d, t) } },
  })
  await until(() => h.text().includes('builder@duo'))
  expect(h.text()).not.toContain('数据过期')
  fail = true
  await until(() => h.text().includes('数据过期'))
  fail = false
  await until(() => !h.text().includes('数据过期'))
  h.stdin.press('q')
  await done
})

test('data refreshes never overlap: a slow read is not started again, and a refresh asked for meanwhile runs once afterwards', async () => {
  const h = harness()
  let active = 0
  let max = 0
  let calls = 0
  const core = await import('@wingline/core')
  const done = h.start({
    dataMs: 5,
    read: {
      ps: async (d: never, a: { team: string }) => {
        active += 1; calls += 1; max = Math.max(max, active)
        try {
          await new Promise((r) => setTimeout(r, 40))
          return await core.ps(d, a)
        } finally {
          active -= 1
        }
      },
    },
  })
  await until(() => h.text().includes('builder@duo'))
  await until(() => calls >= 3, 4000)
  expect(max).toBe(1)
  // 手动刷新（r）撞上正在进行的读取：不并发，读完后补跑一次
  const before = calls
  h.stdin.press('r'); h.stdin.press('r'); h.stdin.press('r')
  await until(() => calls > before, 2000)
  expect(max).toBe(1)
  h.stdin.press('q')
  await done
})

test('an exception inside the loop restores the terminal before rejecting', async () => {
  const h = harness()
  let n = 0
  const bomb = { get address(): string { throw new Error('render boom') }, agent: 'x', status: 'live', handle: null, worktree: 'c', isLead: false }
  const done = h.start({
    read: { ps: async (d: never, a: { team: string }) => (++n > 1 ? [bomb] : (await import('@wingline/core')).ps(d, a)) },
  })
  await expect(done).rejects.toThrow('render boom')
  const out = h.stdout.all()
  expect(out.endsWith('\x1b[?25h\x1b[?1049l')).toBe(true)
  expect(h.stdin.raw.at(-1)).toBe(false)
  expect(h.stdin.paused).toBe(true)
})

test('a resize event triggers a full redraw', async () => {
  const h = harness()
  const done = h.start()
  await until(() => h.text().includes('builder@duo'))
  const before = h.stdout.all().split('\x1b[2J').length
  h.stdout.columns = 50
  h.stdout.emit('resize')
  await until(() => h.stdout.all().split('\x1b[2J').length > before)
  await until(() => h.frameWidth() === 50)
  h.stdout.columns = 30
  h.stdout.emit('resize')
  await until(() => h.text() === '窗口太窄')
  h.stdout.columns = 80
  h.stdout.emit('resize')
  await until(() => h.text().includes('builder@duo'))
  h.stdin.press('q')
  await done
})
