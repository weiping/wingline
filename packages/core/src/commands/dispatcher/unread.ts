import { ORCA_WORKTREE_SUPPORT } from '../../orca/client.js'
import { WinglineError } from '../../errors.js'
import { isScreenSignal, type PostRow, type TeamRow } from '../../registry/registry.js'
import type { TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { resolveWorktrees } from './orca-sync.js'
import type { ScanSnapshot } from './signals.js'

type Ctx = { team: TeamRow; spec: TeamSpec }

/** 连续失败这么多次后，本次调度员运行期间不再尝试（重启后重新尝试）。 */
export const UNREAD_MAX_FAILS = 3

/** `wl attention` 各条目的最小形状；调度员用快照 + 注册表推导，`attention()` 的结果也满足它。 */
export interface AttentionParts {
  stale: Array<{ taskId: string; gateId?: string }>
  questions: Array<{ messageId: string }>
  frozen: Array<{ post: string }>
  signals: Array<{ signal: string; post: string; taskId: string; level: number; clearedAt: string | null }>
}

/** 键 = 分节 + 任务 id / 岗位 / 消息 id / gate id；只含 `level >= 1` 且未清除的信号行。画面信号（上下文快满 / 用量用完）已经当场通知了牵头岗，不再打未读标记。 */
export function attentionKeys(p: AttentionParts): string[] {
  const keys = new Set<string>()
  for (const s of p.stale) keys.add(s.gateId ? `gate:${s.gateId}` : `stale:${s.taskId}`)
  for (const q of p.questions) keys.add(`question:${q.messageId}`)
  for (const f of p.frozen) keys.add(`frozen:${f.post}`)
  for (const s of p.signals) if (!s.clearedAt && s.level >= 1 && !isScreenSignal(s.signal)) keys.add(`signal:${s.signal}:${s.post}:${s.taskId}`)
  return [...keys]
}

/** 最近一次“放弃 / 重置”事件是放弃，即本次调度员运行期间已停止标记（`wl attention` 据此告警）。 */
export function unreadGaveUp(deps: CommandDeps, team: string): boolean {
  return deps.registry.lastPatrolEventOf(team, ['unread_gave_up', 'unread_reset'])?.action === 'unread_gave_up'
}

function recordFailure(deps: CommandDeps, team: string, err: unknown, failures: { count: number }): void {
  failures.count += 1
  const code = err instanceof WinglineError ? err.code : 'error'
  deps.registry.appendPatrolEvent({ team, action: 'unread_mark', outcome: `failed:${code}`, detail: { error: code } })
  if (failures.count === UNREAD_MAX_FAILS) deps.registry.appendPatrolEvent({ team, action: 'unread_gave_up', outcome: 'ok' })
}

/** 牵头岗所在 worktree 的绝对路径；解析不到（worktreeShow 失败等）返回 null。 */
async function leadWorktree(deps: CommandDeps, lead: PostRow): Promise<string | null> {
  return (await resolveWorktrees(deps, [lead])).get(lead.address) ?? null
}

async function markLead(deps: CommandDeps, team: string, fresh: string[], failures: { count: number }): Promise<void> {
  const lead = deps.registry.listPosts(team).find((p) => p.isLead)
  const abs = lead ? await leadWorktree(deps, lead) : null
  if (!abs) {
    // 条件持续期间每轮都会走到这里：只在上一条相关事件不是 unread_skipped 时记一次，免得刷满事件表
    if (deps.registry.lastPatrolEventOf(team, ['unread_skipped', 'unread_mark'])?.action !== 'unread_skipped') {
      deps.registry.appendPatrolEvent({ team, action: 'unread_skipped', outcome: 'ok', detail: { reason: 'lead_worktree_unresolved' } })
    }
    return
  }
  // 独立一次调用，不与 comment / status 合并：失败互不牵连，也不动 orca_sync.fail_count
  await deps.orca.worktreeSet({ worktree: `path:${abs}`, unread: true })
  deps.registry.addUnreadMarks(team, fresh, deps.now().toISOString())
  failures.count = 0
  deps.registry.appendPatrolEvent({ team, action: 'unread_mark', outcome: 'ok', detail: { keys: fresh.length } })
}

/**
 * 有新待办时给牵头岗所在 worktree 打未读标记（展示用，永不抛出）。
 * 重启后的第一轮（observeOnly）只把现有键记下来，不标记。
 */
export async function markUnread(
  deps: CommandDeps, ctx: Ctx, snap: ScanSnapshot, o: { observeOnly: boolean; failures: { count: number } },
): Promise<void> {
  if (!ctx.spec.patrol.unreadMark || !ORCA_WORKTREE_SUPPORT.unread) return
  const team = ctx.team.name
  try {
    if (o.observeOnly && unreadGaveUp(deps, team)) deps.registry.appendPatrolEvent({ team, action: 'unread_reset', outcome: 'ok' })
    const keys = attentionKeys({ stale: snap.stale, questions: snap.openQuestions, frozen: deps.registry.listFrozen(team), signals: deps.registry.listPatrolState(team) })
    const marked = new Set(deps.registry.listUnreadMarks(team))
    deps.registry.removeUnreadMarks(team, [...marked].filter((k) => !keys.includes(k)))
    const fresh = keys.filter((k) => !marked.has(k))
    if (fresh.length === 0) return
    if (o.observeOnly) return deps.registry.addUnreadMarks(team, fresh, deps.now().toISOString())
    if (o.failures.count >= UNREAD_MAX_FAILS) return
    await markLead(deps, team, fresh, o.failures)
  } catch (err) {
    recordFailure(deps, team, err, o.failures)
  }
}
