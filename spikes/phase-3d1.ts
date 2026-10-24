// 3D-1 探针（spec 第 3 节探针 3 与 6）。
//   WINGLINE_SPIKE_WORKTREE=<专用测试 worktree 的选择器> pnpm tsx spikes/phase-3d1.ts unread
//   WINGLINE_SPIKE_WORKTREE=<同上> pnpm tsx spikes/phase-3d1.ts settle
// unread：对该 worktree 依次设置 --unread、--comment、--workspace-status、--read，用 `worktree show` 读回 isUnread，
//         再观察 --unread 之后红点是否自行清除；结束时还原 isUnread、注释与工作区状态。
// settle：只采样不改动。先启动本命令，再由人手动重启 Orca（会重新拉起终端，正在运行的 agent 会被打断，先确认可以重启）。
import { finish, record, setup } from './lib.js'

const probe = 'phase-3d1'
const mode = process.argv[2]
const { runner, client, worktree } = setup()

type Shown = { isUnread?: boolean; comment?: string; workspaceStatus?: string } & Record<string, unknown>

async function show(): Promise<Shown> {
  const r = await runner.json<{ worktree?: Shown }>(['worktree', 'show', '--worktree', worktree])
  return r.worktree ?? (r as unknown as Shown)
}

async function set(...args: string[]): Promise<unknown> {
  return runner.json(['worktree', 'set', '--worktree', worktree, ...args])
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pick = (w: Shown) => ({ isUnread: w.isUnread, comment: w.comment, workspaceStatus: w.workspaceStatus })

async function unread(): Promise<void> {
  const before = await show()
  record(probe, 'unread-before', pick(before))
  const steps: Array<{ step: string; isUnread: boolean | undefined }> = []
  const observe = async (step: string) => steps.push({ step, isUnread: (await show()).isUnread })
  try {
    await set('--read')
    await observe('baseline after --read')
    record(probe, 'set-unread-receipt', await set('--unread'))
    await observe('after --unread')
    await set('--comment', 'wl-spike unread probe')
    await observe('after --comment (unread was set)')
    await set('--workspace-status', before.workspaceStatus === 'in-review' ? 'in-progress' : 'in-review')
    await observe('after --workspace-status (unread was set)')
    await set('--read')
    await observe('after --read')
    // 红点是否会在无人操作时自行清除：置位后每 2 秒读回一次，共 30 秒
    await set('--unread')
    for (let i = 0; i < 15; i++) {
      await sleep(2000)
      await observe(`wait ${(i + 1) * 2}s after --unread`)
    }
  } finally {
    await set('--comment', before.comment && before.comment.length > 0 ? before.comment : ' ').catch(() => {})
    if (before.workspaceStatus) await set('--workspace-status', before.workspaceStatus).catch(() => {})
    await set(before.isUnread ? '--unread' : '--read').catch(() => {})
    record(probe, 'unread-restored', pick(await show()))
  }
  record(probe, 'unread-steps', steps)
  const byStep = (s: string) => steps.find((x) => x.step === s)?.isUnread
  const works = byStep('after --unread') === true && byStep('after --read') === false
  const persisted = steps.filter((x) => x.step.startsWith('wait')).every((x) => x.isUnread === true)
  finish(
    'phase-3d1-unread',
    works ? '成立' : '不成立',
    `unread=${byStep('after --unread')} read=${byStep('after --read')} commentKeeps=${byStep('after --comment (unread was set)')} statusKeeps=${byStep('after --workspace-status (unread was set)')} stays30s=${persisted}`,
  )
}

/** 终端集合的签名：handle + connected，与 spec 第 7.1 节的稳定判据一致。 */
async function signature(): Promise<string | null> {
  try {
    const list = await client.terminalList()
    return list.map((t) => `${t.handle}:${t.connected ? 1 : 0}`).sort().join(',')
  } catch {
    return null
  }
}

async function settle(): Promise<void> {
  const started = Date.now()
  const samples: Array<{ atSec: number; signature: string | null }> = []
  let same = 0
  let last: string | null | undefined
  let lastChangeSec = 0
  console.log('采样中（每 5 秒一次，最多 10 分钟）。现在请手动重启 Orca……')
  while (Date.now() - started < 600_000) {
    const sig = await signature()
    const atSec = Math.round((Date.now() - started) / 1000)
    samples.push({ atSec, signature: sig })
    if (sig !== last) lastChangeSec = atSec
    same = sig !== null && sig === last ? same + 1 : sig === null ? 0 : 1
    last = sig
    if (same >= 6 && samples.some((s) => s.signature === null || s.signature !== sig)) break
    await sleep(5000)
  }
  record(probe, 'settle-samples', samples)
  const unreachable = samples.filter((s) => s.signature === null).length
  finish('phase-3d1-settle', unreachable > 0 ? '成立' : '部分成立', `lastChangeAtSec=${lastChangeSec} samples=${samples.length} unreachable=${unreachable}`)
}

if (mode === 'unread') await unread()
else if (mode === 'settle') await settle()
else throw new Error('用法：phase-3d1.ts unread | settle')
