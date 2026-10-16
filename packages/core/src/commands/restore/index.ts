import fs from 'node:fs'
import { renderBriefing } from '../../brief/render.js'
import { WinglineError } from '../../errors.js'
import { specHash } from '../../spec/hash.js'
import { loadTeamSpec } from '../../spec/load.js'
import { preflight, type CommandDeps } from '../deps.js'
import { dispatcherHealth, dispatcherUp } from '../dispatcher/lifecycle.js'
import { type Launch } from '../launch.js'
import { recoverTask } from '../task/escalate.js'
import { gatherStaleInput, staleReasons } from '../task/query.js'
import { ensureRun, type UpResult } from '../up.js'
import { restorePost, type RestorePost, type RestorePostOutcome } from './posts.js'

export type { RestorePostOutcome }
import { SESSION_ID } from './resume-command.js'

export interface RestoreArgs {
  team: string
  dryRun?: boolean
  noTasks?: boolean
  /** --session <post>=<sessionId>：跳过搜索，直接用给定的会话接回。 */
  sessions?: Record<string, string>
}

/** spec 第 5.4 节。 */
export interface RestoreResult {
  team: string
  dryRun: boolean
  posts: RestorePost[]
  run?: UpResult['run']
  dispatcher: { action: 'restarted' | 'left' | 'skipped'; state: string; reason?: string }
  tasks: Array<{ taskId: string; owner: string; outcome: 'recovered' | 'queued' | 'skipped' | 'failed'; reason?: string; retry?: string }>
}

/** 岗位恢复结果映回 wl up 的 lead outcome，Run 步骤原样复用 ensureRun（spec 第 5.2 节第 4 步）。 */
const UP_OUTCOME: Record<RestorePostOutcome, 'already_live' | 'launched' | 'uncertain' | 'failed'> = {
  kept: 'already_live', resumed: 'launched', fresh: 'launched',
  ambiguous: 'uncertain', uncertain: 'uncertain', failed: 'failed',
}

export async function restore(deps: CommandDeps, a: RestoreArgs): Promise<RestoreResult> {
  const row = deps.registry.getTeam(a.team)
  if (!row) throw new WinglineError('input', 'team_unknown', `团队 ${a.team} 未登记`, { hint: '先执行 wl up <team.yaml>' })
  if (row.status !== 'up') {
    throw new WinglineError('input', 'team_stopped', `团队 ${a.team} 已停止`, { hint: '团队已停止；要重新拉起请用 wl up <team.yaml>' })
  }

  return deps.registry.withTeamLock(a.team, async () => {
    // 第 1 步：Orca 可达（不可达 → runtime_unavailable）+ 规格核对
    await preflight(deps)
    if (!fs.existsSync(row.specPath)) {
      throw new WinglineError('input', 'spec_not_found', `规格文件 ${row.specPath} 不在了，无法核对团队`, { hint: '确认路径后用 wl up <team.yaml> 重新登记' })
    }
    const spec = loadTeamSpec(row.specPath)
    const hash = specHash(spec)
    if (hash !== row.specHash) {
      throw new WinglineError('input', 'team_spec_changed', `团队 ${a.team} 的规格已变化`, { hint: `不支持在线修改编队，请先执行 wl down ${a.team}` })
    }
    for (const [post, id] of Object.entries(a.sessions ?? {})) {
      if (!spec.posts.some((p) => p.id === post) || !SESSION_ID.test(id)) {
        throw new WinglineError('input', 'session_override_invalid', `--session ${post}=${id} 无效：岗位不在团队里，或会话 ID 格式不符`)
      }
    }

    // 第 2、3 步：按 team.yaml 顺序，牵头岗最先（lead 先就绪，Run 才有认领人）
    const l: Launch = { deps, spec, hash }
    const ordered = [spec.posts.find((p) => p.id === spec.lead)!, ...spec.posts.filter((p) => p.id !== spec.lead)]
    const posts: RestorePost[] = []
    for (const p of ordered) {
      posts.push(await restorePost(l, p, { dryRun: !!a.dryRun, override: a.sessions?.[p.id], briefing: renderBriefing(spec, p.id) }))
    }

    // 第 4 步：Run 走 wl up 的现有步骤；dry-run 只读注册表现状，不建不认领
    let run: UpResult['run'] | undefined
    if (a.dryRun) {
      const t = deps.registry.getTeam(a.team)!
      if (t.runId) {
        const alive = (await deps.orca.terminalList()).some((x) => x.handle === t.coordinatorHandle)
        run = { outcome: alive ? 'kept' : 'reclaimed', runId: t.runId }
      }
    } else {
      run = await ensureRun(l, posts.map((p) => ({ address: p.address, outcome: UP_OUTCOME[p.outcome] })), { specPath: row.specPath })
    }

    // 第 5 步：调度员只有失联（stale）才重启；运行中不动，已停止/从未启动也不拉起
    const health = dispatcherHealth(deps, a.team)
    let dispatcher: RestoreResult['dispatcher']
    if (health.state === 'running') dispatcher = { action: 'left', state: 'running' }
    else if (health.state !== 'stale') dispatcher = { action: 'skipped', state: health.state }
    else if (a.dryRun) dispatcher = { action: 'skipped', state: 'stale', reason: 'dry-run：将重启调度员' }
    else {
      await dispatcherUp(deps, { team: a.team })
      dispatcher = { action: 'restarted', state: 'running' }
    }

    // 第 6 步：dispatcherUp 之后重读协调者（复审 M-4）；协调者 kept/reclaimed 才恢复任务
    const tasks: RestoreResult['tasks'] = []
    if (!a.noTasks) {
      const claimed = deps.registry.getTeam(a.team)!.coordinatorHandle !== null
        && (run?.outcome === 'kept' || run?.outcome === 'reclaimed')
      if (!claimed) {
        tasks.push({ taskId: '', owner: '', outcome: 'skipped', reason: '协调者未认领，未恢复任务；稍后重跑 wl restore' })
      } else {
        const stale = staleReasons(await gatherStaleInput(deps, a.team), deps.now()).filter((s) => s.reason === 'dead_assignee')
        for (const s of stale) {
          if (a.dryRun) {
            tasks.push({ taskId: s.taskId, owner: s.owner ?? '', outcome: 'skipped', reason: 'dry-run：未执行恢复' })
            continue
          }
          const ownerOutcome = posts.find((p) => p.address === s.owner)?.outcome
          if (ownerOutcome === 'ambiguous' || ownerOutcome === 'uncertain' || ownerOutcome === 'failed') {
            tasks.push({
              taskId: s.taskId, owner: s.owner ?? '', outcome: 'skipped',
              reason: `任务主人未接回（${ownerOutcome}），不能替它恢复任务`,
              retry: `wl restore ${a.team} --session <post>=<id> 或 wl task recover ${s.taskId}`,
            })
            continue
          }
          try {
            const rec = await recoverTask(deps, { id: s.taskId })
            const outcome = rec.status === 'queued' ? 'queued' : rec.status === 'ready' ? 'skipped' : 'recovered'
            tasks.push({ taskId: s.taskId, owner: s.owner ?? '', outcome, ...(rec.reason !== undefined ? { reason: rec.reason } : {}) })
          } catch (err) {
            if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
            tasks.push({ taskId: s.taskId, owner: s.owner ?? '', outcome: 'failed', reason: err.message, retry: `wl task recover ${s.taskId}` })
          }
        }
      }
    }

    return { team: a.team, dryRun: !!a.dryRun, posts, ...(run !== undefined ? { run } : {}), dispatcher, tasks }
  })
}

/** spec 第 5.5 节：全 kept/resumed/fresh 且其余成功 → 0；任何不确定 → 3；明确失败 → 1/2（输入错误在上游抛）。 */
export function restoreExitCode(r: RestoreResult): 0 | 2 | 3 {
  const unclear = r.posts.some((p) => p.outcome === 'ambiguous' || p.outcome === 'uncertain')
    || r.run?.outcome === 'ambiguous' || r.run?.outcome === 'uncertain'
    || (r.dispatcher.state === 'stale' && r.dispatcher.action !== 'restarted')
    || r.tasks.some((t) => t.outcome === 'skipped')
  if (unclear) return 3
  const failed = r.posts.some((p) => p.outcome === 'failed')
    || r.run?.outcome === 'failed' || r.run?.outcome === 'lost'
    || r.tasks.some((t) => t.outcome === 'failed')
  return failed ? 2 : 0
}
