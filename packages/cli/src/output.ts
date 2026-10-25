import {
  WinglineError, type DoneResult, type DownResult, type PsRow, type RestoreAllResult, type RestorePost, type RestoreResult, type SendResultRow, type ShownTask, type StaleItem,
  type TaskRow, type TimelineEvent, type UpResult,
  type AttentionReport, type DispatcherHealth, type DispatcherStatus, type createTask, type escalateTask, type reassignTask, type recoverTask, type resolveGate, type startTask,
} from '@weiping/wingline-core'

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

const teamOfAddress = (address: string) => address.slice(address.indexOf('@') + 1)
const minutesOrSeconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} 秒前` : `${Math.floor(ms / 60_000)} 分钟前`)

/** 调度员状态的一行文字；从未启动过（never）返回 null，调用方据此不显示。 */
export function dispatcherLine(h: DispatcherHealth): string | null {
  const age = h.ageMs === undefined ? '' : `（心跳 ${minutesOrSeconds(h.ageMs)}）`
  if (h.state === 'running') return `调度员：运行中${age}`
  if (h.state === 'stale') return `调度员：失联${age}`
  return h.state === 'stopped' ? '调度员：已停止' : null
}

function dispatcherTitles(rows: PsRow[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const r of rows) {
    const team = teamOfAddress(r.address)
    const line = r.dispatcher && dispatcherLine(r.dispatcher)
    if (!line || seen.has(team)) continue
    seen.add(team)
    lines.push(`团队 ${team}  ${line}`)
  }
  return lines.length ? lines.join('\n') + '\n' : ''
}

export function renderPs(rows: PsRow[]): string {
  if (rows.length === 0) return '没有已登记的岗位。用 wl up <team.yaml> 拉起团队。\n'
  return dispatcherTitles(rows) + table(
    ['ADDRESS', 'AGENT', 'STATUS', 'HANDLE', 'WORKTREE', 'LEAD'],
    rows.map((r) => [r.address, r.agent, r.status, r.handle ?? '-', r.worktree, r.isLead ? 'yes' : '']),
  )
}

export function renderUp(r: UpResult, opts: { newRun?: boolean } = {}): string {
  const lines = r.posts.map((p) => {
    const detail = [p.reason, p.retry && `重试：${p.retry}`].filter(Boolean).join('；')
    return `${p.address}  ${UP_LABEL[p.outcome]}${detail ? `  ${detail}` : ''}`
  })
  const reset = opts.newRun && r.run?.outcome === 'created' ? '旧 Run 里的任务不会再出现在 wl task list 中（它们仍在 Orca 里）\n' : ''
  return `团队 ${r.team}\n${lines.join('\n')}\n${renderRun(r)}${reset}${renderDead(r)}`
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

function linkReason(l: { target: string; taskId: string; delivery: string; reason?: string }): string {
  if (l.delivery !== 'not_notified') return ''
  return `（${l.reason ?? '未知'}）；可以 wl send ${l.target} "你有新任务 ${l.taskId}，见 wl task show ${l.taskId}"`
}

export function renderDone(r: DoneResult): string {
  if (r.outcome === 'gate_failed') return `gate 未通过，输出见 ${r.gateOutputPath}\n`
  if (r.outcome === 'gate_failed_after_bypass') {
    return `任务已被直接上报，补跑 gate 未通过，输出见 ${r.gateOutputPath}；已通知牵头岗\n`
  }
  if (r.outcome === 'escalated') {
    return `连续 gate 失败，已转人工决策：gate ${r.gateId}；wl task resolve ${r.gateId} --resolution <决定>\n`
  }
  const links = (r.linkedTasks ?? []).map((l) => `  ${l.target}  子任务 ${l.taskId}  ${LINK_LABEL[l.delivery]}${linkReason(l)}\n`).join('')
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
  return head + deliveryLine(r.owner ?? undefined, id, r)
}

export function renderDispatcherUp(r: { address: string; outcome: 'already_running' | 'started'; handle?: string }): string {
  return r.outcome === 'started' ? `${r.address} 已启动${r.handle ? `（终端 ${r.handle}）` : ''}\n` : `${r.address} 已在运行\n`
}

export function renderDispatcherDown(r: { address: string; outcome: 'noop' | 'closed' | 'already_gone' }): string {
  const label = { noop: '未改动（加 --close 才会关闭终端）', closed: '终端已关闭', already_gone: '终端已不存在' }[r.outcome]
  return `${r.address}  ${label}\n`
}

export function renderDispatcherStatus(s: DispatcherStatus): string {
  const at = (x: { at: string; outcome: string } | null) => (x ? `${x.at}（${x.outcome}）` : '无')
  const head = `团队 ${s.team}  ${dispatcherLine(s.health) ?? '调度员：从未启动'}\n`
  const body = `上次收件箱检查：${at(s.lastCheck)}\n上次巡查：${at(s.lastScan)}\n冻结岗位 ${s.frozen}  静音岗位 ${s.hushed}  待处理事项 ${s.attentionItems}\n`
  return head + body + s.warnings.map((w) => `警告：${w}\n`).join('')
}

export function renderUnfreeze(r: { skipped: Array<{ taskId: string; command: string }> }, address: string): string {
  const skipped = r.skipped.map((s) => `  ${s.taskId}  ${s.command}\n`).join('')
  return `${address} 已解冻\n` + (skipped ? `冻结期间被跳过的派发（按需手动处理）：\n${skipped}` : '')
}

/** spec 第 6.5 节的分节顺序；调度员失联时放最前。 */
export function renderAttention(r: AttentionReport): string {
  const sections: string[] = []
  const dispatcher = `调度员：${dispatcherLine(r.dispatcher)?.replace('调度员：', '') ?? '从未启动'}`
  if (r.warnings.length) sections.push(['告警：', ...r.warnings.map((w) => `  ${w}`)].join('\n'))
  if (r.dispatcher.state === 'stale') sections.push(dispatcher + `\n  重新启动：wl dispatcher up ${r.team}`)
  if (r.frozen.length) {
    sections.push(['冻结的岗位：', ...r.frozen.map((f) => `  ${f.post}  ${f.reason}（${f.frozenAt}，跳过 ${f.skippedChildren} 个子任务）  wl dispatcher unfreeze ${f.post}`)].join('\n'))
  }
  if (r.signals.length) {
    sections.push(['处理中的信号：', ...r.signals.map((s) => `  L${s.level} ${s.signal}${s.summary ? `（${s.summary}）` : ''}  ${s.post}${s.taskId ? `  ${s.taskId}` : ''}${s.command ? `  ${s.command}` : ''}`)].join('\n'))
  }
  if (r.questions.length) {
    sections.push(['待回答的问题：', ...r.questions.map((q) => `  ${q.messageId}  ${q.asker}：${q.body}${q.options.length ? `（选项：${q.options.join(' / ')}）` : ''}  wl dispatcher reply ${r.team} ${q.messageId} --body <回答>`)].join('\n'))
  }
  sections.push(...staleSections(r))
  if (r.dispatcher.state !== 'stale') sections.push(dispatcher)
  return sections.join('\n') + '\n'
}

function staleSections(r: AttentionReport): string[] {
  const gates = r.stale.filter((i) => i.reason === 'blocked_waiting')
  const rest = r.stale.filter((i) => i.reason !== 'blocked_waiting')
  const line = (i: AttentionReport['stale'][number]) => `  ${i.taskId}  ${i.title}  ${i.reason}  归属 ${i.owner ?? '-'}  ${i.command}`
  const out: string[] = []
  const unavailable = r.unavailable.length ? `不可用（${r.unavailable.join('；')}）` : null
  for (const [title, items] of [['待决的 gate', gates], ['其余卡住的任务', rest]] as const) {
    if (unavailable) out.push(`${title}：${unavailable}`)
    else if (items.length) out.push([`${title}：`, ...items.map(line)].join('\n'))
  }
  return out
}

// —— wl restore / wl log ——

const RESTORE_LABEL = {
  kept: '仍在运行', resumed: '已接回原会话', fresh: '新起（上下文已丢失）',
  ambiguous: '候选不唯一', uncertain: '不确定', failed: '失败',
} as const

/** 一行岗位结果；候选不唯一时把候选逐条列出来，并给出重试命令。 */
function restorePostLines(p: RestorePost, team: string): string[] {
  const out = [`  ${p.address}  ${RESTORE_LABEL[p.outcome]}${p.reason ? `  ${p.reason}` : ''}${p.sessionId ? `  会话 ${p.sessionId}` : ''}`]
  for (const c of p.candidates ?? []) {
    out.push(`      候选 ${c.sessionId}  最后活动 ${c.updatedAt ?? '-'}  ${c.messageCount ?? 0} 条消息`)
  }
  if (p.note) out.push(`      注：${p.note}`)
  const retry = p.retry ?? (p.outcome === 'ambiguous' && p.candidates?.length ? `wl restore ${team} --session ${p.address.split('@')[0]}=<id>` : undefined)
  if (retry) out.push(`      试：${retry}`)
  return out
}

export function renderRestore(r: RestoreResult): string {
  const head = `团队 ${r.team}${r.dryRun ? '（dry-run：只看不改）' : ''}`
  const run = r.run ? [`  ${r.run.runId ?? '-'}  ${RUN_LABEL[r.run.outcome]}`] : []
  const dispatcher = [`  ${r.dispatcher.action === 'restarted' ? '已重启' : r.dispatcher.action === 'left' ? '保持不动' : '未拉起'}  ${r.dispatcher.state}${r.dispatcher.reason ? `  ${r.dispatcher.reason}` : ''}`]
  const tasks = r.tasks.length
    ? r.tasks.map((t) => `  ${t.taskId || '-'}  ${t.owner || '-'}  ${TASK_OUTCOME[t.outcome]}${t.reason ? `  ${t.reason}` : ''}${t.retry ? `\n      重试：${t.retry}` : ''}`)
    : ['  无']
  return [
    head,
    '岗位：', ...r.posts.flatMap((p) => restorePostLines(p, r.team)),
    'Run：', ...run,
    '调度员：', ...dispatcher,
    '任务：', ...tasks,
  ].join('\n') + '\n'
}

export function renderRestoreAll(r: RestoreAllResult): string {
  if (r.teams.length === 0) return '没有处于运行状态的团队，无需恢复\n'
  return r.teams.map((t) => t.result
    ? renderRestore(t.result)
    : `团队 ${t.team}\n  失败：${t.error!.code}  ${t.error!.message}${t.error!.hint ? `\n  提示：${t.error!.hint}` : ''}\n`).join('\n')
}

const quoteWord = (w: string) => (/[\s"']/.test(w) ? JSON.stringify(w) : w)

export function renderAutostartInstall(r: { platform: string; file: string; command: string[]; logPath: string; waitOrca: string }): string {
  return [
    `已安装自启动（${r.platform === 'darwin' ? 'macOS launchd' : 'Linux systemd 用户服务'}）`,
    `  位置：${r.file}`,
    `  命令：${r.command.map(quoteWord).join(' ')}`,
    `  登录后最多等 Orca 就绪 ${r.waitOrca}；日志：${r.logPath}`,
    ...(r.platform === 'darwin' ? ['macOS 上安装即执行一次 wl restore --all，结果见上面的日志。'] : []),
  ].join('\n') + '\n'
}

export function renderAutostartUninstall(r: { file: string; removed: boolean }): string {
  return r.removed ? `已卸载自启动：${r.file}（日志保留）\n` : '没有安装过自启动，无需卸载\n'
}

export function renderAutostartStatus(r: {
  installed: boolean; platform: string; user?: string; location: string; command: string[]; commandMissing: string[]
  logTail: string[]; linger?: boolean; logPath: string
}): string {
  const lines = [r.installed ? '自启动：已安装' : '自启动：未安装', `  位置：${r.location}`]
  if (r.installed) lines.push(`  命令：${r.command.map(quoteWord).join(' ')}`)
  if (r.commandMissing.length > 0) lines.push(`  ⚠ 命令里的 ${r.commandMissing.join('、')} 已经不存在（Node 路径已变化），请重新执行 wl autostart install`)
  if (r.platform === 'linux' && r.installed && r.linger === false) {
    lines.push(`  ⚠ 用户 ${r.user ?? '<user>'} 没有开启 linger：无界面或 SSH 场景需要 loginctl enable-linger ${r.user ?? '<user>'}`)
  }
  lines.push(r.logTail.length > 0 ? `日志 ${r.logPath}（最后 ${r.logTail.length} 行）：` : `日志 ${r.logPath}：暂无`, ...r.logTail.map((l) => `  ${l}`))
  return lines.join('\n') + '\n'
}

const TASK_OUTCOME = { recovered: '已恢复', queued: '已排队', ready: '本就不该重派', skipped: '未恢复', failed: '恢复失败' } as const

const TIMELINE_SOURCE = { task: '任务', patrol: '巡查', command: '命令' } as const
const SUMMARY_MAX = 120
/** 复审 I-1b：actor/action/target 来自用户可控的 --as 与正文列，控制字符会伪造出额外的日志行。 */
const CONTROL = /[\x00-\x1f\x7f]/g
const flat = (s: string): string => s.replace(CONTROL, ' ')
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 摘要压成一行，最长 SUMMARY_MAX 字；末尾的空列不留。 */
function eventSummary(e: TimelineEvent): string {
  const raw = typeof e.detail === 'string' ? e.detail : e.detail === null || e.detail === undefined ? '' : JSON.stringify(e.detail)
  const flat = raw.replace(/[\r\n\t]+/g, ' ').trim()
  const body = [e.outcome ?? '', flat].filter(Boolean).join(' ')
  return body.length <= SUMMARY_MAX ? body : `${body.slice(0, SUMMARY_MAX)}…`
}

export function renderTimelineEvent(e: TimelineEvent): string {
  const d = new Date(e.at)
  const cols = [
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
    TIMELINE_SOURCE[e.source], flat(e.actor) || '-', flat(e.action), e.target === null ? '' : flat(e.target), eventSummary(e),
  ]
  while (cols.length && cols.at(-1) === '') cols.pop()
  return cols.join('  ')
}

/**
 * 跨天插一行日期；返回逐条打印的函数，`--follow` 与一次性输出共用同一套格式，
 * 这样 follow 出来的样子和 `wl log` 一样。
 */
export function logPrinter(): (e: TimelineEvent) => string {
  let day = ''
  return (e) => {
    const d = new Date(e.at)
    const today = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const head = today === day ? '' : day ? `—— ${today} ——\n` : ''
    day = today
    return `${head}${renderTimelineEvent(e)}\n`
  }
}

export const renderLog = (events: TimelineEvent[]): string => {
  const print = logPrinter()
  return events.map(print).join('')
}
