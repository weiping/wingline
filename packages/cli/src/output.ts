import {
  WinglineError, type DoneResult, type DownResult, type PsRow, type SendResultRow, type ShownTask, type StaleItem, type TaskRow, type UpResult,
  type createTask, type escalateTask, type reassignTask, type recoverTask, type resolveGate, type startTask,
} from '@wingline/core'

const UP_LABEL = { already_live: '已在岗', launched: '已拉起', failed: '失败', uncertain: '不确定' } as const
const RUN_LABEL = {
  created: '已新建', adopted: '已找回', kept: '协调者保持不变', reclaimed: '已重新认领', deferred: '本轮跳过（lead 未就绪）',
  failed: '失败', uncertain: '不确定', ambiguous: '候选不唯一', lost: '原 Run 已丢失',
} as const
const DOWN_LABEL = { stopped: '已停止', closed: '已关闭', uncertain: '不确定', already_gone: '终端已不存在' } as const

function table(head: string[], rows: string[][]): string {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd()
  return [line(head), ...rows.map(line)].join('\n') + '\n'
}

export function renderPs(rows: PsRow[]): string {
  if (rows.length === 0) return '没有已登记的岗位。用 wl up <team.yaml> 拉起团队。\n'
  return table(
    ['ADDRESS', 'AGENT', 'STATUS', 'HANDLE', 'WORKTREE', 'LEAD'],
    rows.map((r) => [r.address, r.agent, r.status, r.handle ?? '-', r.worktree, r.isLead ? 'yes' : '']),
  )
}

export function renderUp(r: UpResult): string {
  const lines = r.posts.map((p) => {
    const detail = [p.reason, p.retry && `重试：${p.retry}`].filter(Boolean).join('；')
    return `${p.address}  ${UP_LABEL[p.outcome]}${detail ? `  ${detail}` : ''}`
  })
  return `团队 ${r.team}\n${lines.join('\n')}\n${renderRun(r)}${renderDead(r)}`
}

function renderRun(r: UpResult): string {
  if (!r.run) return ''
  const run = r.run
  const head = `Run  ${RUN_LABEL[run.outcome]}${run.runId ? `  ${run.runId}` : ''}`
  const detail = [run.reason, run.retry && `重试：${run.retry}`].filter(Boolean).join('；')
  const candidates = (run.candidates ?? []).map((c) => `\n  候选 ${c.id}（${c.createdAt}）`).join('')
  return `${head}${detail ? `  ${detail}` : ''}${candidates}\n`
}

function renderDead(r: UpResult): string {
  if (!r.deadAssignees?.length) return ''
  const lines = r.deadAssignees.map((d) => `  ${d.taskId}  ${d.title}  归属 ${d.owner ?? '-'}  恢复：${d.command}`)
  return `派给已消失终端的任务：\n${lines.join('\n')}\n`
}

export function renderSend(r: SendResultRow): string {
  return `${r.address}  已送达\n`
}

export function renderDown(r: DownResult): string {
  const lines = r.posts.map((p) => `${p.address}  ${DOWN_LABEL[p.outcome]}${p.reason ? `  ${p.reason}` : ''}`)
  return `团队 ${r.team}\n${lines.join('\n')}\n`
}

export interface ErrorDoc {
  kind: string
  code: string
  message: string
  hint?: string
  detail?: unknown
}

export function errorDoc(err: unknown): ErrorDoc {
  if (err instanceof WinglineError) {
    return {
      kind: err.kind, code: err.code, message: err.message,
      ...(err.hint ? { hint: err.hint } : {}),
      ...(err.detail !== undefined && err.code === 'close_unconfirmed' ? { detail: err.detail } : {}),
    }
  }
  return { kind: 'internal', code: 'internal', message: err instanceof Error ? err.message : String(err) }
}

export function renderError(doc: ErrorDoc): string {
  const detail = doc.code === 'close_unconfirmed' ? renderDown(doc.detail as DownResult) : ''
  return `${detail}错误：${doc.message}\n${doc.hint ? `提示：${doc.hint}\n` : ''}`
}

// —— wl task ——

type Awaited2<F extends (...a: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>

/** 派发之后通知结果的人读说明。 */
function deliveryLine(address: string | undefined, taskId: string, d: { delivery?: string; busyWith?: string }): string {
  const who = address ?? '<岗位地址>'
  if (d.delivery === 'not_notified') {
    return `${who} 此刻在提示/无法读取画面上，没有打字通知；任务已派发。等对方空闲后可以 wl send ${who} "你有新任务 ${taskId}，见 wl task show ${taskId}"\n`
  }
  if (d.delivery === 'queued') return `${who} 手上有任务 ${d.busyWith ?? ''}，新任务已排队\n`
  if (d.delivery === 'notified_unconfirmed') return `${who} 已通知，但没有确认对方开始处理\n`
  if (d.delivery === 'notified') return `${who} 已通知\n`
  return ''
}

export function renderCreate(r: Awaited2<typeof createTask>, post: string | undefined): string {
  return `任务 ${r.id} 已创建\n${deliveryLine(post, r.id, r)}`
}

export function renderList(rows: TaskRow[]): string {
  if (rows.length === 0) return '没有任务。\n'
  return table(['ID', 'STATUS', 'OWNER', 'TAGS', 'TITLE'], rows.map((t) => [t.id, t.status, t.claimedBy ?? '-', t.tags.join(',') || '-', t.title]))
}

export function renderStale(items: StaleItem[]): string {
  if (items.length === 0) return '没有卡住的任务。\n'
  const reasons = [...new Set(items.map((i) => i.reason))]
  return reasons
    .map((reason) => `${reason}\n${items.filter((i) => i.reason === reason).map((i) => `  ${i.taskId} ${i.title} ${i.reason} → ${i.command}`).join('\n')}\n`)
    .join('')
}

const SOURCE_LABEL = { explicit: '显式', implicit: '隐式', human: '人' } as const

export function closureLine(c: NonNullable<DoneResult['closure']>): string {
  const targets = (c.targets ?? []).join('、')
  if (c.kind === 'handed_to') return `已转交给 ${targets}\n`
  if (c.kind === 'sent_for_review') return `已送审给 ${targets}\n`
  return c.kind === 'escalated' ? '已转人工决策\n' : '已直接完成\n'
}

export function renderShow(t: ShownTask): string {
  const head = [`${t.id}  ${t.title}`, `状态 ${t.status}  主人 ${t.claimedBy ?? '-'}  标签 ${t.tags.join(',') || '-'}`]
  if (t.plan) head.push(`计划 ${t.plan}`)
  if (t.outcome) head.push(`上报 ${t.outcome}（${t.reportedBy ?? '-'}）`)
  const closure = t.closure ? closureLine(t.closure) : ''
  const history = (t.history ?? []).map((h) => `${h.at} ${h.actor}（${SOURCE_LABEL[h.actorSource]}）${h.action}${h.detail ? ` ${h.detail}` : ''}`)
  return `${head.join('\n')}\n${closure}${history.length ? history.join('\n') + '\n' : ''}`
}

export function renderReassign(r: Awaited2<typeof reassignTask>, id: string, to: string): string {
  const n = r.notify
  const tail = n.outcome === 'not_notified' ? `；没有打字通知（${n.reason}），可以 wl send ${to} "任务 ${id} 转给了你，见 wl task show ${id}"` : ''
  return `任务 ${id} 已改派给 ${to}${tail}\n`
}

export function renderStart(r: Awaited2<typeof startTask>, id: string, as: string | undefined): string {
  const head = r.already ? `任务 ${id} 已经在进行中\n` : `任务 ${id} 已开始\n`
  return head + deliveryLine(as, id, r)
}

const LINK_LABEL: Record<string, string> = {
  notified: '已通知', notified_unconfirmed: '已通知（未确认）', not_notified: '没有打字通知', self: '就是你自己', queued: '已排队',
  skipped_offline: '岗位不在线，未派发', skipped_frozen: '岗位已冻结，未派发',
}

export function renderDone(r: DoneResult): string {
  if (r.outcome === 'gate_failed') return `gate 未通过，输出见 ${r.gateOutputPath}\n`
  if (r.outcome === 'gate_failed_after_bypass') {
    return `任务已被直接上报，补跑 gate 未通过，输出见 ${r.gateOutputPath}；已通知牵头岗\n`
  }
  if (r.outcome === 'escalated') {
    return `连续 gate 失败，已转人工决策：gate ${r.gateId}；wl task resolve ${r.gateId} --resolution <决定>\n`
  }
  const links = (r.linkedTasks ?? []).map((l) => `  ${l.target}  子任务 ${l.taskId}  ${LINK_LABEL[l.delivery]}\n`).join('')
  return `${r.replayed ? '（这一轮早已完成，以下是存下的结果）\n' : ''}已完成\n${r.closure ? closureLine(r.closure) : ''}${links}`
}

export function renderEscalate(r: Awaited2<typeof escalateTask>): string {
  const back = r.tookBackDispatch ? '任务已从岗位手里收回，resolve 后回到 ready\n' : ''
  return `已转人工决策：gate ${r.gateId}（任务状态 ${r.status}）\n${back}处理：wl task resolve ${r.gateId} --resolution <决定>\n`
}

export function renderResolve(r: Awaited2<typeof resolveGate>): string {
  return `任务 ${r.taskId} 现在 ${r.status}，主人 ${r.claimedBy ?? '-'}\n`
}

export function renderRecover(r: Awaited2<typeof recoverTask>, id: string): string {
  const head = `任务 ${id}：${r.status}（第 ${r.epoch} 轮）${r.reason ? `，${r.reason}` : ''}\n`
  return head + deliveryLine(undefined, id, r)
}
