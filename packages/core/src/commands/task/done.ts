import { WinglineError } from '../../errors.js'
import type { DoneVerdictRow, TaskExtRow, TeamRow } from '../../registry/registry.js'
import type { PostSpec, TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { locatePost } from '../locate.js'
import { announce, dispatchTo, taskSpec, type Delivery } from './dispatch.js'
import { isPostFrozen } from './frozen.js'
import { gateBody, gateCwd, gateOutputPath, runGate, writeGateOutput } from './gate-exec.js'
import { requireActor, resolveHandle, type Actor } from './identity.js'
import { ledgered } from './ledger.js'
import { logTask } from './log.js'
import { notifyPost } from './notify.js'
import { taskPreflight } from './preflight.js'
import { findTask, type DoneClosure, type TaskRow } from './query.js'

export type { DoneClosure }
export type DoneOutcome = 'done' | 'gate_failed' | 'escalated' | 'gate_failed_after_bypass'
export type LinkDelivery = Delivery | 'skipped_frozen' | 'skipped_offline'
export interface DoneResult {
  outcome: DoneOutcome
  closure?: DoneClosure
  linkedTasks?: Array<{ target: string; taskId: string; delivery: LinkDelivery }>
  gateId?: string
  gateOutputPath?: string
  replayed?: boolean
}

interface Ctx {
  deps: CommandDeps
  team: TeamRow
  spec: TeamSpec
  actor: Actor
  id: string
  ext: TaskExtRow
  post: PostSpec
}

type Linked = NonNullable<DoneResult['linkedTasks']>[number]

const fail = (code: string, message: string, hint?: string) => new WinglineError('input', code, message, { hint })
const key = (c: Ctx, tail: string) => `done:${c.id}:${c.ext.epoch}:${tail}`

// —— 判定（spec 第 10 节 done 第 3 步）——

async function runPostGate(c: Ctx, n: number): Promise<{ passed: boolean; file: string | null; body: string | null }> {
  const { deps } = c
  if (c.post.gate === null) return { passed: true, file: null, body: null }
  const g = await runGate(c.post.gate, { cwd: await gateCwd(deps, c.actor.address), timeoutMs: c.spec.budgets.task.gateTimeoutSeconds * 1000 })
  const file = writeGateOutput(deps.home, c.team.name, c.id, c.ext.epoch, n, g.output)
  return { passed: g.passed, file, body: gateBody(g.output, file, deps.multilineSafe) }
}

async function decideDispatched(c: Ctx, task: TaskRow): Promise<DoneResult | DoneVerdictRow> {
  const handle = await resolveHandle(c.deps, c.actor)
  if (task.assigneeHandle !== handle) throw fail('not_dispatched_to_you', `任务 ${c.id} 没有派给 ${c.actor.address} 的终端`)
  const n = c.ext.gateFailures + 1
  const g = await runPostGate(c, n)
  const base = { taskId: c.id, epoch: c.ext.epoch, post: c.actor.address, dispatchId: task.dispatchId!, reportFrom: handle, body: g.body }
  if (g.passed) return c.deps.registry.recordVerdict({ ...base, verdict: 'passed', gateFailures: c.ext.gateFailures })
  if (n < c.spec.budgets.task.maxGateFailures) {
    c.deps.registry.incrementGateFailures(c.team.name, c.id)
    logTask(c.deps, { team: c.team.name, taskId: c.id, actor: c.actor, action: 'gate_failed', detail: { file: g.file } })
    return { outcome: 'gate_failed', gateOutputPath: g.file! }
  }
  return c.deps.registry.recordVerdict({ ...base, verdict: 'escalate', gateFailures: n })
}

async function decideBypassed(c: Ctx): Promise<DoneResult | DoneVerdictRow> {
  const seen = c.deps.registry.listTaskLog(c.id).some((l) => l.action === 'bypass_detected' && l.epoch === c.ext.epoch)
  if (!seen) logTask(c.deps, { team: c.team.name, taskId: c.id, actor: c.actor, action: 'bypass_detected' })
  const g = await runPostGate(c, c.ext.gateFailures + 1)
  if (g.passed) {
    return c.deps.registry.recordVerdict({
      taskId: c.id, epoch: c.ext.epoch, post: c.actor.address, verdict: 'bypassed', gateFailures: c.ext.gateFailures, dispatchId: '', reportFrom: '', body: null,
    })
  }
  const lead = `${c.spec.lead}@${c.team.name}`
  const noticeKey = key(c, 'bypass-notice')
  if (lead !== c.actor.address && !c.deps.registry.getRequest(noticeKey)) {
    await notifyPost(c.deps, lead, `[雁阵] ${c.actor.address} 的任务 ${c.id} 绕过 wl 直接上报，补跑 gate 失败，见 ${g.file}；要重开用 wl task escalate ${c.id} --reopen --reason <原因>`)
    c.deps.registry.beginRequest(noticeKey)
    c.deps.registry.finishRequest(noticeKey, 'done')
  }
  return { outcome: 'gate_failed_after_bypass', gateOutputPath: g.file! }
}

function isWorkerReport(result: string | null): boolean {
  try {
    return (JSON.parse(result ?? '{}') as { provenance?: string }).provenance === 'worker_report'
  } catch {
    return false
  }
}

async function decide(c: Ctx): Promise<DoneResult | DoneVerdictRow> {
  const task = await findTask(c.deps, c.team.name, c.id)
  if (task.status === 'dispatched') return decideDispatched(c, task)
  if ((task.status === 'completed' || task.status === 'failed') && isWorkerReport(task.result)) return decideBypassed(c)
  const hint = task.status === 'ready' ? `上一轮派发已结束（终端被关闭或已 resolve），先 wl task start ${c.id}` : undefined
  throw fail('task_not_dispatched', `任务 ${c.id} 状态为 ${task.status}，不是派给你的进行中任务`, hint)
}

// —— 后续步骤（第 4 步，每一步都是 P1）——

const REJECT_CODES = new Set(['worker_identity_changed', 'inactive_dispatch'])
const REJECT_HINT = (id: string) =>
  `这一轮派发已经不属于这个终端：先 wl task show ${id}；若任务已回到 ready，wl task start ${id}；若派给了已不存在的终端，wl task recover ${id}`

async function report(c: Ctx, v: DoneVerdictRow): Promise<void> {
  const passed = v.verdict === 'passed'
  try {
    await ledgered(c.deps, {
      key: key(c, 'report'),
      team: c.team.name,
      build: (t) => ({
        taskId: c.id,
        dispatchId: v.dispatchId,
        outcome: passed ? ('succeeded' as const) : ('failed' as const),
        subject: passed ? 'gate passed' : 'gate failed',
        ...(v.body ? { body: v.body } : {}),
        run: t.runId!,
        from: v.reportFrom,
      }),
      call: (a) => c.deps.orca.workerDone(a),
    })
  } catch (err) {
    if (err instanceof WinglineError && err.kind === 'orca' && REJECT_CODES.has(err.code)) {
      throw new WinglineError('orca', err.code, err.message, { hint: REJECT_HINT(c.id), cause: err })
    }
    throw err
  }
}

async function escalateGate(c: Ctx, v: DoneVerdictRow): Promise<string> {
  const file = gateOutputPath(c.deps.home, c.team.name, c.id, v.epoch, v.gateFailures)
  const r = await ledgered(c.deps, {
    key: key(c, 'gate'),
    team: c.team.name,
    build: (t) => ({
      task: c.id,
      question: `连续 ${v.gateFailures} 次 gate 失败（输出见 ${file}）。resolve 后任务回到 ready：原岗位 wl task start 即重试；改派用 wl task resolve <gate> --reassign <地址>；不想继续就不要 resolve`,
      from: t.coordinatorHandle!,
    }),
    call: (a) => c.deps.orca.gateCreate(a),
  })
  c.deps.registry.recordGate(r.id, c.team.name, c.id)
  const lead = `${c.spec.lead}@${c.team.name}`
  if (lead !== c.actor.address) {
    await notifyPost(c.deps, lead, `[雁阵] ${c.actor.address} 的任务 ${c.id} 连续 ${v.gateFailures} 次 gate 失败，已转人工决策：wl task resolve ${r.id} --resolution <决定>`)
  }
  return r.id
}

// —— 连接（reviewed_by / hands_to）——

function linkPlan(c: Ctx): { kind: 'review' | 'work'; label: string; targets: string[] } | null {
  if (c.ext.kind !== 'work') return null
  const mk = (ids: string[]) => ids.map((t) => `${t}@${c.team.name}`)
  if (c.post.reviewedBy.length > 0) return { kind: 'review', label: '评审', targets: mk(c.post.reviewedBy) }
  if (c.post.handsTo.length > 0) return { kind: 'work', label: '交接', targets: mk(c.post.handsTo) }
  return null
}

async function createChild(c: Ctx, target: string, label: string, title: string): Promise<string> {
  const r = await ledgered(c.deps, {
    key: key(c, `link:${target}`),
    team: c.team.name,
    build: (t) => ({
      spec: taskSpec(c.deps, `${label}（${target}）：${c.id}`),
      taskTitle: `${label}：${title}`,
      run: t.runId!,
      from: t.coordinatorHandle!,
      parent: c.id,
    }),
    call: (a) => c.deps.orca.taskCreate(a),
  })
  return r.id
}

async function deliverChild(c: Ctx, childId: string, target: string, title: string): Promise<LinkDelivery> {
  if (isPostFrozen(c.deps, target)) return 'skipped_frozen'
  const located = await locatePost(c.deps.orca, target)
  if (!located) return 'skipped_offline'
  const to = { address: target, handle: located.handle }
  const d = await dispatchTo(c.deps, c.team.name, childId, to)
  return (await announce(c.deps, c.team.name, { id: childId, title }, to, d, c.actor)).delivery
}

async function linkOne(c: Ctx, plan: NonNullable<ReturnType<typeof linkPlan>>, target: string, title: string): Promise<Linked> {
  const { registry } = c.deps
  const deliveredKey = key(c, `delivered:${target}`)
  const stored = registry.getRequest(deliveredKey)
  if (stored?.state === 'done') return JSON.parse(stored.receipt!) as Linked
  const childId = await createChild(c, target, plan.label, title)
  registry.insertTaskExt({ taskId: childId, team: c.team.name, tags: [], kind: plan.kind, claimedBy: target, readySince: c.deps.now().toISOString() })
  const delivery = await deliverChild(c, childId, target, `${plan.label}：${title}`)
  const entry: Linked = { target, taskId: childId, delivery }
  registry.beginRequest(deliveredKey)
  registry.finishRequest(deliveredKey, 'done', entry)
  return entry
}

async function linkAll(c: Ctx): Promise<{ linked: Linked[]; closure: DoneClosure }> {
  const plan = linkPlan(c)
  if (!plan) return { linked: [], closure: { kind: 'completed' } }
  const title = (await findTask(c.deps, c.team.name, c.id)).title
  const linked: Linked[] = []
  for (const target of plan.targets) linked.push(await linkOne(c, plan, target, title))
  return { linked, closure: { kind: plan.kind === 'review' ? 'sent_for_review' : 'handed_to', targets: plan.targets } }
}

// —— 收尾 ——

async function proceed(c: Ctx, v: DoneVerdictRow): Promise<DoneResult> {
  let result: DoneResult
  if (v.verdict === 'escalate') {
    await report(c, v)
    result = { outcome: 'escalated', closure: { kind: 'escalated' }, gateId: await escalateGate(c, v) }
  } else {
    if (v.verdict === 'passed') await report(c, v)
    const { linked, closure } = await linkAll(c)
    result = { outcome: 'done', closure, linkedTasks: linked }
  }
  c.deps.registry.finishVerdict(c.id, v.epoch, result)
  logTask(c.deps, { team: c.team.name, taskId: c.id, actor: c.actor, action: v.verdict === 'escalate' ? 'escalate' : 'done', detail: result.closure })
  return result
}

async function context(deps: CommandDeps, a: { id: string; as?: string }): Promise<Ctx> {
  const actor = await requireActor(deps, a.as)
  const teamName = actor.address.slice(actor.address.indexOf('@') + 1)
  const { team, spec } = await taskPreflight(deps, teamName)
  const ext = deps.registry.getTaskExt(a.id)
  if (!ext || ext.claimedBy !== actor.address) throw fail('not_your_task', `任务 ${a.id} 不是 ${actor.address} 的`)
  const post = spec.posts.find((p) => `${p.id}@${teamName}` === actor.address)
  if (!post) throw fail('post_unknown', `${actor.address} 不是团队 ${teamName} 的岗位`)
  return { deps, team, spec, actor, id: a.id, ext, post }
}

/** resumeEpoch：只续跑该轮已有、未收尾的判定；没有该轮判定或不是当前 epoch → verdict_missing，绝不跑 gate。 */
export async function doneTask(deps: CommandDeps, a: { id: string; as?: string; resumeEpoch?: number }): Promise<DoneResult> {
  const c = await context(deps, a)
  const v = deps.registry.getVerdict(a.id, c.ext.epoch)
  if (v?.finishedAt) return { ...(JSON.parse(v.result!) as DoneResult), replayed: true }
  if (a.resumeEpoch !== undefined && (a.resumeEpoch !== c.ext.epoch || !v)) {
    throw fail('verdict_missing', `任务 ${a.id} 第 ${a.resumeEpoch} 轮没有可续跑的判定`)
  }
  const decided = v ?? (await decide(c))
  return 'verdict' in decided ? proceed(c, decided) : decided
}
