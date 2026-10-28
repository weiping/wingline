import { postAddress, STALE_REASON_LABEL, type StaleItem, type TimelineEvent } from '@weiping/wingline-core'
import { renderTimelineEvent } from '../output.js'
import { cleanEvent, oneLine } from './text.js'
import type { MenuItem, PendingAction, TimelineFilterSpec, TuiData, TuiState, View } from './types.js'
import { fit } from './width.js'

/** 视图里一行可选中的条目：显示文字、能做的写操作；没有写操作的给出对应的 wl 命令。 */
export interface Row {
  section?: string
  text: string
  actions: MenuItem[]
  hint?: string
}

const action = (command: PendingAction['command'], args: Record<string, unknown>, label: string): PendingAction => ({ command, args, label })

const sendItem = (address: string): MenuItem => ({
  label: '发消息',
  steps: [{ prompt: '消息: ' }],
  build: ([message]) => action('send', { address, message: message! }, `给 ${address} 发消息`),
})
const freezeItem = (address: string): MenuItem => ({
  label: '冻结',
  steps: [{ prompt: '冻结理由: ' }],
  build: ([reason]) => action('freezePostCmd', { address, reason: reason! }, `冻结 ${address}`),
})
const unfreezeItem = (address: string): MenuItem => ({
  label: '解冻', steps: [], build: () => action('unfreezePostCmd', { address }, `解冻 ${address}`),
})
const hushItem = (address: string): MenuItem => ({
  label: '静音',
  steps: [{ prompt: '静音分钟数（留空为默认）: ', optional: true }],
  build: ([minutes]) => {
    const text = (minutes ?? '').trim()
    if (text === '') return action('hushCmd', { address }, `静音 ${address}`)
    const n = Number(text)
    if (!Number.isFinite(n) || n <= 0) return '分钟数应为正数'
    return action('hushCmd', { address, forMs: n * 60_000 }, `静音 ${address} ${text} 分钟`)
  },
})
const unhushItem = (address: string): MenuItem => ({
  label: '取消静音', steps: [], build: () => action('unhushCmd', { address }, `取消 ${address} 的静音`),
})
const replyItem = (team: string, messageId: string, asker: string): MenuItem => ({
  label: '回答',
  steps: [{ prompt: '回答: ' }],
  build: ([body]) => action('dispatcherReply', { team, messageId, body: body! }, `回答 ${asker} 的提问`),
})
const resolveItem = (gateId: string): MenuItem => ({
  label: '处理',
  steps: [{ prompt: '决定: ' }],
  build: ([resolution]) => action('resolveGate', { gateId, resolution: resolution! }, `处理 gate ${gateId}`),
})
const resolveReassignItem = (gateId: string, team: string): MenuItem => ({
  label: '处理并改派',
  steps: [{ prompt: '决定: ' }, { prompt: '改派给岗位: ' }],
  build: ([resolution, post]) => {
    const target = post!.includes('@') ? post! : postAddress(post!.trim(), team)
    return action('resolveGate', { gateId, resolution: resolution!, reassign: target }, `处理 gate ${gateId} 并改派给 ${target}`)
  },
})
const recoverItem = (taskId: string): MenuItem => ({
  label: '恢复派发', steps: [], build: () => action('recoverTask', { id: taskId }, `恢复任务 ${taskId} 的派发`),
})

function postRows(data: TuiData): Row[] {
  const frozen = new Set(data.attention.frozen.map((f) => f.post))
  const hushed = new Set(data.hushed)
  return data.posts.map((p) => {
    const task = data.tasks.find((t) => t.status === 'dispatched' && p.handle !== null && t.assigneeHandle === p.handle)
    const flags = [
      frozen.has(p.address) ? '[冻结]' : '',
      hushed.has(p.address) ? '[静音]' : '',
      ...data.attention.signals.filter((s) => s.post === p.address).map((s) => `[${s.signal} L${s.level}]`),
    ].filter(Boolean)
    return {
      text: [fit(oneLine(p.address), 20), fit(oneLine(p.agent), 7), fit(p.status, 7), fit(task ? oneLine(task.title) : '—', 16), ...flags].join(' ').trimEnd(),
      actions: [
        sendItem(p.address),
        frozen.has(p.address) ? unfreezeItem(p.address) : freezeItem(p.address),
        hushed.has(p.address) ? unhushItem(p.address) : hushItem(p.address),
      ],
    }
  })
}

function inboxRows(data: TuiData): Row[] {
  const a = data.attention
  const gates = a.stale.filter((s) => s.reason === 'blocked_waiting')
  const rest = a.stale.filter((s) => s.reason !== 'blocked_waiting')
  return [
    ...a.questions.map((q): Row => ({
      section: '待回答的提问',
      text: `${oneLine(q.asker)}：${oneLine(q.body)}${q.options.length ? `  选项：${q.options.map(oneLine).join(' / ')}` : ''}`,
      actions: [replyItem(a.team, q.messageId, oneLine(q.asker))],
    })),
    ...gates.map((s): Row => {
      const gateId = (s as StaleItem & { gateId?: string | null }).gateId
      return {
        section: '等待决策的 gate',
        text: `${oneLine(s.title)}  归属 ${s.owner ? oneLine(s.owner) : '—'}`,
        actions: gateId ? [resolveItem(gateId), resolveReassignItem(gateId, a.team)] : [],
        hint: s.command,
      }
    }),
    ...a.frozen.map((f): Row => ({ section: '冻结的岗位', text: `${oneLine(f.post)}  ${oneLine(f.reason)}`, actions: [unfreezeItem(f.post)] })),
    ...rest.map((s): Row => ({
      section: '卡住的任务',
      text: `${oneLine(s.title)}  ${STALE_REASON_LABEL[s.reason]}  主人 ${s.owner ? oneLine(s.owner) : '—'}`,
      actions: s.reason === 'dead_assignee' ? [recoverItem(s.taskId)] : [],
      hint: s.command,
    })),
    ...a.signals.map((s): Row => ({
      section: '巡查信号',
      text: `${oneLine(s.post)}  ${s.signal} L${s.level}${s.summary ? `  ${oneLine(s.summary)}` : ''}`,
      actions: [hushItem(s.post), sendItem(s.post)],
      hint: s.command ?? undefined,
    })),
  ]
}

/** 事件是否命中过滤条件（岗位按名字或完整地址匹配 actor / target）。 */
export function matchesFilter(e: TimelineEvent, f: TimelineFilterSpec | null): boolean {
  if (!f) return true
  if (f.source && e.source !== f.source) return false
  if (f.post) {
    const hit = [e.actor, e.target].some((x) => x !== null && (x === f.post || x.split('@')[0] === f.post))
    if (!hit) return false
  }
  return !f.task || e.target === f.task || (e.target?.startsWith(`${f.task}#`) ?? false)
}

export const eventLine = (e: TimelineEvent): string => oneLine(renderTimelineEvent(cleanEvent(e)))

export function filterText(f: TimelineFilterSpec | null): string {
  if (!f) return ''
  return Object.entries(f).map(([k, v]) => `${k}:${v}`).join(' ')
}

function timelineRows(data: TuiData, filter: TimelineFilterSpec | null): Row[] {
  return data.timeline.filter((e) => matchesFilter(e, filter)).map((e) => ({ text: eventLine(e), actions: [] }))
}

/** 当前视图里可选中的行；选中下标和 Enter 都以它为准。 */
export function rowsOf(view: View, s: Pick<TuiState, 'filter'>, data: TuiData): Row[] {
  if (view === 'overview') return postRows(data)
  return view === 'inbox' ? inboxRows(data) : timelineRows(data, s.filter)
}
