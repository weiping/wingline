// 3C 探针：orca worktree set 的工作区状态参数与 --comment 形态。
//   WINGLINE_SPIKE_WORKTREE=<专用测试 worktree 的选择器> pnpm tsx spikes/worktree-status.ts
// 会修改该 worktree 的工作区状态与卡片注释，结束时尽量还原。
import { finish, record, setup } from './lib.js'

const probe = 'worktree-status'
const { runner, worktree } = setup()

const STATUSES = ['todo', 'in-progress', 'in-review', 'completed'] as const

type Shown = { workspaceStatus?: unknown; status?: unknown; comment?: unknown } & Record<string, unknown>

async function show(): Promise<Shown> {
  const r = await runner.json<{ worktree?: Shown }>(['worktree', 'show', '--worktree', worktree])
  return (r.worktree ?? (r as unknown as Shown))
}

/** 回执里工作区状态的字段名未知：先找名字像 status 的字段。 */
function statusOf(w: Shown): unknown {
  const key = Object.keys(w).find((k) => /status/i.test(k))
  return key ? w[key] : undefined
}

async function trySet(args: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    await runner.json(['worktree', 'set', '--worktree', worktree, ...args])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

const before = await show()
record(probe, 'show-before', before)

// 1. 工作区状态：先试 --workspace-status，再试 --status
let flag: string | null = null
const accepted: string[] = []
for (const candidate of ['--workspace-status', '--status']) {
  const r = await trySet([candidate, STATUSES[0]])
  record(probe, `set${candidate}-${STATUSES[0]}`, r)
  if (r.ok) {
    flag = candidate
    break
  }
}
if (flag) {
  for (const s of STATUSES) {
    const r = await trySet([flag, s])
    const readBack = statusOf(await show())
    record(probe, `status-${s}`, { set: r, readBack })
    if (r.ok && readBack === s) accepted.push(s)
  }
}

// 2. 注释：多行、600 字符、清空
const multiline = '第一行\n第二行\n第三行'
const m = await trySet(['--comment', multiline])
const multilineBack = (await show()).comment
const commentMultiline = m.ok && typeof multilineBack === 'string' && multilineBack.split('\n').length === 3

// 注释长度：依次写 600 与 5000 字符，读回长度；写进去多少算多少（被截断时读回长度就是上限）
let commentMax: string = '未知'
const lengths: Array<{ asked: number; set: { ok: boolean; error?: string }; back: number | null }> = []
for (const n of [600, 5000]) {
  const set = await trySet(['--comment', 'x'.repeat(n)])
  const back = (await show()).comment
  lengths.push({ asked: n, set, back: typeof back === 'string' ? back.length : null })
  if (set.ok && typeof back === 'string') commentMax = back.length >= n ? `>=${n}` : String(back.length)
}
record(probe, 'comment', { multiline: { set: m, readBack: multilineBack }, lengths })

// 清空：空串会被 CLI 当成“没给这个参数”而忽略（实测），所以“还原为空”要用单个空格
const clear = await trySet(['--comment', ''])
const afterClear = (await show()).comment
const emptyClears = clear.ok && afterClear === ''
record(probe, 'comment-clear', { clear, readBack: afterClear, emptyClears })

// 还原
const originalStatus = statusOf(before)
if (flag && typeof originalStatus === 'string') await trySet([flag, originalStatus])
if (typeof before.comment === 'string') await trySet(['--comment', before.comment === '' ? ' ' : before.comment])

console.log(
  `RESULT worktree-status status=${flag ?? '无'} values=${accepted.join(',') || '无'} ` +
    `comment-multiline=${commentMultiline ? '是' : '否'} comment-max=${commentMax} comment-empty-clears=${emptyClears ? '是' : '否'}`,
)
finish(
  probe,
  flag && accepted.length === STATUSES.length ? '成立' : flag || lengths.some((l) => l.set.ok) ? '部分成立' : '不成立',
  `status=${flag ?? '无'} values=${accepted.length}/${STATUSES.length} comment-multiline=${commentMultiline ? '是' : '否'}`,
)
