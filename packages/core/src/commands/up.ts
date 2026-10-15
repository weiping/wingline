import fs from 'node:fs'
import path from 'node:path'
import { renderBriefing } from '../brief/render.js'
import { WinglineError } from '../errors.js'
import type { Registry } from '../registry/registry.js'
import { specHash } from '../spec/hash.js'
import { loadTeamSpec, type PostSpec, type TeamSpec } from '../spec/load.js'
import { postAddress, preflight, requestId, type CommandDeps, type Step } from './deps.js'
import { locatePost } from './locate.js'
import { ledgered } from './task/ledger.js'
import { screenGuard } from './task/notify.js'

export type UpOutcome = 'already_live' | 'launched' | 'failed' | 'uncertain'

export interface UpArgs {
  specPath: string
  adoptRun?: string
  newRun?: boolean
}

export type RunOutcome = 'created' | 'adopted' | 'kept' | 'reclaimed' | 'deferred' | 'failed' | 'uncertain' | 'ambiguous' | 'lost'

export interface UpResult {
  team: string
  posts: Array<{ address: string; outcome: UpOutcome; reason?: string; retry?: string }>
  run?: { outcome: RunOutcome; runId: string | null; reason?: string; retry?: string; candidates?: Array<{ id: string; createdAt: string }> }
  deadAssignees?: Array<{ taskId: string; title: string; owner: string | null; command: string }>
}

const WAIT_TIMEOUT_MS = 60_000
const WAIT_SUBMIT_SEC = 10

interface Launch {
  deps: CommandDeps
  spec: TeamSpec
  hash: string
}

/** 先记 pending，再调用，最后按结果记 done / uncertain / failed。ok 为 false 表示 Orca 回执未确认成功。 */
async function recorded<T>(reg: Registry, id: string, fn: () => Promise<T>, ok: (v: T) => boolean = () => true) {
  reg.beginRequest(id)
  let value: T
  try {
    value = await fn()
  } catch (err) {
    reg.finishRequest(id, err instanceof WinglineError && err.kind === 'uncertain' ? 'uncertain' : 'failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
  const confirmed = ok(value)
  reg.finishRequest(id, confirmed ? 'done' : 'uncertain', value)
  return { confirmed, value }
}

const stepDone = (reg: Registry, id: string) => reg.getRequest(id)?.state === 'done'

/** 终端被关后重新拉起要换新 id，否则 Orca 会按旧 id 回放旧回执。 */
function lifetimeGen(l: Launch, post: string, located: boolean): number {
  const done = (step: Step, g: number) => stepDone(l.deps.registry, requestId(l.spec.name, post, step, l.hash, g))
  let g = 0
  while (done('create', g) && done('brief', g)) g++
  if (!located && done('create', g)) g++
  return g
}

/** 非 path: 的 worktree 选择器（如缺省的 current）按 wl up 时的调用目录解析一次，记成 path:，之后 gate 不再重新解析。 */
async function pinWorktrees(l: Launch): Promise<void> {
  const { orca, registry } = l.deps
  const resolved = new Map<string, string>()
  for (const p of l.spec.posts) {
    if (p.worktree.startsWith('path:')) continue
    try {
      if (!resolved.has(p.worktree)) resolved.set(p.worktree, (await orca.worktreeShow({ worktree: p.worktree })).path)
    } catch (err) {
      if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
      continue
    }
    const address = postAddress(p.id, l.spec.name)
    registry.upsertPost({ ...registry.getPost(address)!, worktree: `path:${resolved.get(p.worktree)}` })
  }
}

async function registerTeam(l: Launch): Promise<void> {
  const { registry } = l.deps
  const existing = registry.getTeam(l.spec.name)
  if (existing?.status === 'up' && existing.specHash !== l.hash) {
    throw new WinglineError('input', 'team_spec_changed', `团队 ${l.spec.name} 的规格已变化`, {
      hint: `不支持在线修改编队，请先执行 wl down ${l.spec.name}`,
    })
  }
  if (existing) registry.markTeamUp(l.spec.name, l.spec.specPath, l.hash)
  else registry.upsertTeam({ name: l.spec.name, specPath: l.spec.specPath, specHash: l.hash, runId: null, coordinatorHandle: null, status: 'up' })
  for (const p of l.spec.posts) {
    const address = postAddress(p.id, l.spec.name)
    const prev = registry.listPosts(l.spec.name).find((r) => r.address === address)
    registry.upsertPost({
      address, team: l.spec.name, agent: p.agent, worktree: p.worktree,
      handle: prev?.handle ?? null, status: prev?.status ?? 'offline', isLead: p.id === l.spec.lead,
    })
  }
}

function briefText(l: Launch, post: PostSpec, briefing: string): string {
  if (l.deps.multilineSafe) return briefing
  const file = path.join(l.deps.home, 'briefs', l.spec.name, `${post.id}.md`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, briefing)
  return `请先完整阅读 ${file}，这是你的岗位说明。`
}

type PostResult = UpResult['posts'][number]

type StartResult = 'sent' | 'unconfirmed' | 'at_prompt'

async function startPost(l: Launch, post: PostSpec, briefing: string, existingHandle: string | null, gen: number): Promise<StartResult> {
  const { orca, registry } = l.deps
  const address = postAddress(post.id, l.spec.name)
  const rid = (step: Step) => requestId(l.spec.name, post.id, step, l.hash, gen)
  let handle = existingHandle
  if (!handle) {
    const id = rid('create')
    const created = await recorded(registry, id, () =>
      orca.terminalCreate({ worktree: post.worktree, title: address, command: post.launch }),
    )
    handle = created.value.handle
    registry.setPostHandle(address, handle)
  }
  if (!stepDone(registry, rid('wait'))) {
    const waited = await recorded(registry, rid('wait'), () => orca.terminalWait({ handle, forState: 'tui-idle', timeoutMs: WAIT_TIMEOUT_MS }), (v) => v.satisfied)
    if (!waited.confirmed) return 'unconfirmed'
  }
  if ((await screenGuard(l.deps, handle)) === 'at_prompt') return 'at_prompt'
  const text = briefText(l, post, briefing)
  const id = rid('brief')
  const sent = await recorded(registry, id, () =>
    orca.terminalSend({ handle: handle!, text, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC }),
    (v) => v.accepted,
  )
  return sent.confirmed ? 'sent' : 'unconfirmed'
}

async function launchPost(l: Launch, post: PostSpec, briefing: string): Promise<PostResult> {
  const { orca, registry } = l.deps
  const address = postAddress(post.id, l.spec.name)
  const retry = `wl up ${l.spec.specPath}`
  try {
    const located = await locatePost(orca, address)
    if (located) registry.setPostHandle(address, located.handle)
    const gen = lifetimeGen(l, post.id, located !== null)
    const started = registry.getRequest(requestId(l.spec.name, post.id, 'create', l.hash, gen)) !== null
    if (located && !started) {
      registry.setPostStatus(address, 'live')
      return { address, outcome: 'already_live' }
    }
    const result = await startPost(l, post, briefing, located?.handle ?? null, gen)
    registry.setPostStatus(address, result === 'sent' ? 'live' : 'uncertain')
    if (result === 'sent') return { address, outcome: 'launched' }
    const reason = result === 'at_prompt' ? '岗位停在确认提示上，处理后重跑 wl up' : '岗位未确认就绪，启动包未送达'
    return { address, outcome: 'uncertain', reason, retry }
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    const outcome = err.kind === 'orca' ? 'failed' : 'uncertain'
    registry.setPostStatus(address, outcome === 'failed' ? 'offline' : 'uncertain')
    return { address, outcome, reason: err.message, ...(outcome === 'uncertain' ? { retry } : {}) }
  }
}

type RunStep = NonNullable<UpResult['run']>

const runKey = (l: Launch) => `${l.spec.name}:run-create`
/** 用户要求 --new-run 的意图标记：先落盘，再清旧 Run；被杀后下一次 wl up 据此继续新建，不会找回旧 Run。 */
const newRunKey = (l: Launch) => `${l.spec.name}:new-run`
const objectiveOf = (l: Launch) => `wingline:${l.spec.name}`

function writeRun(l: Launch, runId: string, coordinator: string): void {
  l.deps.registry.setRunId(l.spec.name, runId)
  l.deps.registry.updateCoordinatorHandle(l.spec.name, coordinator)
}

async function createRun(l: Launch, leadHandle: string): Promise<RunStep> {
  const { orca } = l.deps
  const r = await ledgered(l.deps, {
    key: runKey(l),
    team: l.spec.name,
    build: () => ({ objective: objectiveOf(l), from: leadHandle }),
    call: (a) => orca.runCreate(a),
  })
  writeRun(l, r.id, r.coordinatorHandle)
  return { outcome: 'created', runId: r.id }
}

async function adoptRun(l: Launch, id: string, leadHandle: string): Promise<RunStep> {
  await l.deps.orca.runUse({ id, from: leadHandle })
  writeRun(l, id, leadHandle)
  return { outcome: 'adopted', runId: id }
}

/** 协调者终端还在就保持不动（可能是别的进程的派发器）；不在了才为 lead 重新认领。 */
async function keepOrReclaim(l: Launch, runId: string, coordinator: string | null, leadHandle: string): Promise<RunStep> {
  const terminals = await l.deps.orca.terminalList()
  if (coordinator && terminals.some((t) => t.handle === coordinator)) return { outcome: 'kept', runId }
  try {
    await l.deps.orca.runUse({ id: runId, from: leadHandle })
  } catch (err) {
    if (!(err instanceof WinglineError) || err.code !== 'run_not_found') throw err
    return {
      outcome: 'lost', runId, reason: '原 Run 已不存在，旧任务无法恢复', retry: `wl up ${l.spec.specPath} --new-run`,
    }
  }
  l.deps.registry.updateCoordinatorHandle(l.spec.name, leadHandle)
  return { outcome: 'reclaimed', runId }
}

/** 找回的 Run 当前的协调者终端还活着就不动它（可能是别的进程的派发器）；死了才为 lead 认领。 */
async function adoptDiscovered(l: Launch, found: { id: string; coordinatorHandle: string | null }, leadHandle: string): Promise<RunStep> {
  l.deps.registry.setRunId(l.spec.name, found.id)
  l.deps.registry.updateCoordinatorHandle(l.spec.name, found.coordinatorHandle)
  const r = await keepOrReclaim(l, found.id, found.coordinatorHandle, leadHandle)
  return r.outcome === 'lost' ? r : { outcome: 'adopted', runId: found.id }
}

/** 注册表丢失时按 objective 找回 Run；没有候选返回 undefined。 */
async function discoverRun(l: Launch, leadHandle: string): Promise<RunStep | undefined> {
  const found = (await l.deps.orca.runList()).filter((r) => r.objective === objectiveOf(l))
  if (found.length === 0) return undefined
  if (found.length === 1) return adoptDiscovered(l, found[0]!, leadHandle)
  return {
    outcome: 'ambiguous', runId: null, reason: `找到 ${found.length} 个候选 Run`,
    candidates: found.map((r) => ({ id: r.id, createdAt: r.createdAt })), retry: `wl up ${l.spec.specPath} --adopt-run <id>`,
  }
}

async function newRunStep(l: Launch, leadHandle: string): Promise<RunStep> {
  const { registry } = l.deps
  registry.openIntent(newRunKey(l), 'new-run', {})
  // 上一次的 run-create 还没定案：续跑同一行，不另建第二个 Run
  const open = registry.getRequest(runKey(l))
  if (!open || open.state === 'done') {
    registry.setRunId(l.spec.name, null)
    registry.updateCoordinatorHandle(l.spec.name, null)
    registry.dropRequest(runKey(l))
  }
  const created = await createRun(l, leadHandle)
  registry.dropRequest(newRunKey(l))
  return created
}

async function runStep(l: Launch, args: UpArgs, leadHandle: string): Promise<RunStep> {
  const { registry } = l.deps
  const team = registry.getTeam(l.spec.name)!
  if (args.newRun) return newRunStep(l, leadHandle)
  if (args.adoptRun) return adoptRun(l, args.adoptRun, leadHandle)
  if (!team.runId && registry.getRequest(newRunKey(l))) return newRunStep(l, leadHandle)
  if (team.runId) return keepOrReclaim(l, team.runId, team.coordinatorHandle, leadHandle)
  const discovered = registry.getRequest(runKey(l)) ? undefined : await discoverRun(l, leadHandle)
  return discovered ?? createRun(l, leadHandle)
}

async function ensureRun(l: Launch, posts: PostResult[], args: UpArgs): Promise<RunStep> {
  const lead = postAddress(l.spec.lead, l.spec.name)
  const leadResult = posts.find((p) => p.address === lead)
  if (leadResult?.outcome !== 'launched' && leadResult?.outcome !== 'already_live') {
    const pending = args.newRun ? '--new-run' : args.adoptRun ? '--adopt-run' : null
    return {
      outcome: 'deferred', runId: l.deps.registry.getTeam(l.spec.name)!.runId,
      ...(pending ? { reason: `${pending} 尚未生效：lead 本轮没有就绪`, retry: `wl up ${l.spec.specPath} ${pending}${args.adoptRun ? ` ${args.adoptRun}` : ''}` } : {}),
    }
  }
  try {
    return await runStep(l, args, l.deps.registry.getPost(lead)!.handle!)
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    const runId = l.deps.registry.getTeam(l.spec.name)!.runId
    if (err.code === 'run_list_truncated') {
      return { outcome: 'failed', runId, reason: `${err.message}；${err.hint ?? ''}`, retry: `wl up ${l.spec.specPath} --new-run（这个团队还没有 Run 时）或 --adopt-run <id>` }
    }
    if (err.kind === 'orca') return { outcome: 'failed', runId, reason: err.message }
    return { outcome: 'uncertain', runId, reason: err.message, retry: `wl up ${l.spec.specPath}` }
  }
}

/** 只读：派给已不存在终端的任务。 */
async function findDeadAssignees(l: Launch, runId: string): Promise<NonNullable<UpResult['deadAssignees']>> {
  const tasks = await l.deps.orca.taskList({ run: runId })
  const live = new Set((await l.deps.orca.terminalList()).map((t) => t.handle))
  return tasks
    .filter((t) => t.status === 'dispatched' && t.assigneeHandle !== null && !live.has(t.assigneeHandle))
    .map((t) => ({
      taskId: t.id, title: t.title, owner: l.deps.registry.getTaskExt(t.id)?.claimedBy ?? null, command: `wl task recover ${t.id}`,
    }))
}

/** 只是提示性核对：读失败只告警，不影响 up 的结果。 */
async function reportDeadAssignees(l: Launch, runId: string): Promise<NonNullable<UpResult['deadAssignees']>> {
  try {
    return await findDeadAssignees(l, runId)
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    l.deps.warn(`未能核对派给已消失终端的任务：${err.message}`)
    return []
  }
}

export async function up(deps: CommandDeps, args: UpArgs): Promise<UpResult> {
  const spec = loadTeamSpec(args.specPath)
  const hash = specHash(spec)
  const briefings = new Map(spec.posts.map((p) => [p.id, renderBriefing(spec, p.id)]))
  return deps.registry.withTeamLock(spec.name, async () => {
    await preflight(deps)
    const l: Launch = { deps, spec, hash }
    await registerTeam(l)
    await pinWorktrees(l)
    const posts: PostResult[] = []
    for (const p of spec.posts) posts.push(await launchPost(l, p, briefings.get(p.id)!))
    const run = await ensureRun(l, posts, args)
    const dead = run.runId ? await reportDeadAssignees(l, run.runId) : []
    return { team: spec.name, posts, run, ...(dead.length > 0 ? { deadAssignees: dead } : {}) }
  })
}
