import { rowsOf } from './items.js'
import { LineInput } from './input.js'
import type { Key } from './keys.js'
import type { Effect, MenuItem, TimelineFilterSpec, TuiData, TuiState, View } from './types.js'

const VIEWS: View[] = ['overview', 'inbox', 'timeline']
const FILTER_USAGE = '过滤格式：source:task|patrol|command / post:<岗位> / task:<任务 id>；留空清除'
const SOURCES = ['task', 'patrol', 'command']

export function initialTuiState(): TuiState {
  return {
    view: 'overview', selected: 0, menu: null, flow: null, input: null, inputKind: null, confirm: null,
    filter: null, help: false, status: '', lastUncertain: null, stale: false,
  }
}

type Out = { state: TuiState; effect?: Effect }

const cancelled = (s: TuiState): TuiState => ({ ...s, menu: null, flow: null, input: null, inputKind: null, confirm: null, status: '已取消' })

/** 逐项问完 steps：还有没回答的就开下一个输入框，问完交给 build。 */
function advanceFlow(s: TuiState, item: MenuItem, values: string[]): Out {
  const next = item.steps[values.length]
  if (next) return { state: { ...s, menu: null, flow: { item, values }, input: new LineInput(next.prompt), inputKind: 'flow' } }
  const built = item.build(values)
  const done = { ...s, menu: null, flow: null, input: null, inputKind: null }
  return typeof built === 'string' ? { state: { ...done, status: built } } : { state: { ...done, confirm: built, status: '' } }
}

function parseFilter(text: string): TimelineFilterSpec | string {
  const m = /^(source|post|task):(.+)$/.exec(text.trim())
  if (!m) return FILTER_USAGE
  if (m[1] === 'source') return SOURCES.includes(m[2]!) ? { source: m[2] as 'task' } : FILTER_USAGE
  return { [m[1]!]: m[2]!.trim() }
}

function applyFilter(s: TuiState, text: string): Out {
  const closed = { ...s, input: null, inputKind: null }
  if (text.trim() === '') return { state: { ...closed, filter: null, selected: 0, status: '已清除过滤' } }
  const f = parseFilter(text)
  return typeof f === 'string' ? { state: { ...closed, status: f } } : { state: { ...closed, filter: f, selected: 0, status: '' } }
}

function inputKey(s: TuiState, k: Key): Out {
  const box = s.input!.clone()
  const r = box.feed(k)
  if (r === 'continue') return { state: { ...s, input: box } }
  if (r === 'cancel') return { state: cancelled(s) }
  if (s.inputKind === 'filter') return applyFilter(s, box.value)
  const { item, values } = s.flow!
  if (box.value.trim() === '' && !item.steps[values.length]!.optional) return { state: { ...s, input: box, status: '不能为空' } }
  return advanceFlow(s, item, [...values, box.value])
}

function menuKey(s: TuiState, k: Key): Out {
  const m = s.menu!
  if (k.name === 'escape') return { state: { ...s, menu: null, status: '' } }
  if (k.name === 'enter') return advanceFlow(s, m.items[m.selected]!, [])
  const step = k.name === 'up' ? -1 : k.name === 'down' ? 1 : 0
  return { state: step ? { ...s, menu: { ...m, selected: Math.max(0, Math.min(m.items.length - 1, m.selected + step)) } } : s }
}

function confirmKey(s: TuiState, k: Key): Out {
  if (k.name === 'char' && k.ch === 'y') return { state: { ...s, confirm: null, status: '执行中…' }, effect: { kind: 'run', action: s.confirm! } }
  return { state: { ...s, confirm: null, status: '已取消' } }
}

function switchView(s: TuiState, view: View, data: TuiData): TuiState {
  // 时间线新的在下，进来时选中最新一条
  const selected = view === 'timeline' ? Math.max(0, rowsOf(view, s, data).length - 1) : 0
  return { ...s, view, selected, menu: null }
}

function openRow(s: TuiState, data: TuiData): Out {
  const row = rowsOf(s.view, s, data)[s.selected]
  if (!row) return { state: s }
  if (row.actions.length === 0) {
    const status = row.hint ? `这一项没有对应的写操作，请在终端执行：${row.hint}` : '这一项没有可执行的操作'
    return { state: { ...s, status } }
  }
  if (row.actions.length === 1) return advanceFlow(s, row.actions[0]!, [])
  return { state: { ...s, menu: { items: row.actions, selected: 0 }, status: '' } }
}

function move(s: TuiState, data: TuiData, delta: number): Out {
  const last = Math.max(0, rowsOf(s.view, s, data).length - 1)
  return { state: { ...s, selected: Math.max(0, Math.min(last, s.selected + delta)) } }
}

function charKey(s: TuiState, data: TuiData, ch: string): Out {
  const n = Number(ch)
  if (n >= 1 && n <= VIEWS.length) return { state: switchView(s, VIEWS[n - 1]!, data) }
  switch (ch) {
    case 'j': return move(s, data, 1)
    case 'k': return move(s, data, -1)
    case 'r': return { state: s, effect: { kind: 'refresh' } }
    case 'R': return s.lastUncertain ? { state: s, effect: { kind: 'run', action: s.lastUncertain } } : { state: s }
    case '?': return { state: { ...s, help: true } }
    case 'q': return { state: s, effect: { kind: 'quit' } }
    case '/':
      return s.view === 'timeline'
        ? { state: { ...s, input: new LineInput('过滤（source:/post:/task:，留空清除）: '), inputKind: 'filter' } }
        : { state: s }
    default: return { state: s }
  }
}

function normalKey(s: TuiState, k: Key, data: TuiData): Out {
  switch (k.name) {
    case 'tab': return { state: switchView(s, VIEWS[(VIEWS.indexOf(s.view) + 1) % VIEWS.length]!, data) }
    case 'down': return move(s, data, 1)
    case 'up': return move(s, data, -1)
    case 'enter': return openRow(s, data)
    case 'char': return charKey(s, data, k.ch ?? '')
    default: return { state: s }
  }
}

/** 按键状态机（纯函数）：返回新状态，以及需要外部执行的动作（写操作 / 刷新 / 退出）。 */
export function reduce(s: TuiState, k: Key, data: TuiData): Out {
  if (k.name === 'ctrl-c') return { state: s, effect: { kind: 'quit' } }
  if (s.help) return { state: { ...s, help: false } }
  if (s.confirm) return confirmKey(s, k)
  if (s.input) return inputKey(s, k)
  if (s.menu) return menuKey(s, k)
  return normalKey(s, k, data)
}
