import { WinglineError, type DownResult, type PsRow, type SendResultRow, type UpResult } from '@wingline/core'

const UP_LABEL = { already_live: '已在岗', launched: '已拉起', failed: '失败', uncertain: '不确定' } as const
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
  return `团队 ${r.team}${r.runId ? `（Run ${r.runId}）` : ''}\n${lines.join('\n')}\n`
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
