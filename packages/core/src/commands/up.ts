import fs from 'node:fs'
import path from 'node:path'
import { renderBriefing } from '../brief/render.js'
import { WinglineError } from '../errors.js'
import type { Registry } from '../registry/registry.js'
import { specHash } from '../spec/hash.js'
import { loadTeamSpec, type PostSpec, type TeamSpec } from '../spec/load.js'
import { postAddress, preflight, requestId, type CommandDeps, type Step } from './deps.js'
import { locatePost } from './locate.js'

export type UpOutcome = 'already_live' | 'launched' | 'failed' | 'uncertain'

export interface UpResult {
  team: string
  posts: Array<{ address: string; outcome: UpOutcome; reason?: string; retry?: string }>
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

async function registerTeam(l: Launch): Promise<void> {
  const { registry } = l.deps
  const existing = registry.getTeam(l.spec.name)
  if (existing?.status === 'up' && existing.specHash !== l.hash) {
    throw new WinglineError('input', 'team_spec_changed', `团队 ${l.spec.name} 的规格已变化`, {
      hint: `不支持在线修改编队，请先执行 wl down ${l.spec.name}`,
    })
  }
  registry.upsertTeam({ name: l.spec.name, specPath: l.spec.specPath, specHash: l.hash, runId: existing?.runId ?? null, coordinatorHandle: existing?.coordinatorHandle ?? null, status: 'up' })
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

async function startPost(l: Launch, post: PostSpec, briefing: string, existingHandle: string | null, gen: number) {
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
    if (!waited.confirmed) return false
  }
  const text = briefText(l, post, briefing)
  const id = rid('brief')
  const sent = await recorded(registry, id, () =>
    orca.terminalSend({ handle: handle!, text, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC }),
    (v) => v.accepted,
  )
  return sent.confirmed
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
    const ok = await startPost(l, post, briefing, located?.handle ?? null, gen)
    registry.setPostStatus(address, ok ? 'live' : 'uncertain')
    return ok ? { address, outcome: 'launched' } : { address, outcome: 'uncertain', reason: '岗位未确认就绪，启动包未送达', retry }
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    const outcome = err.kind === 'orca' ? 'failed' : 'uncertain'
    registry.setPostStatus(address, outcome === 'failed' ? 'offline' : 'uncertain')
    return { address, outcome, reason: err.message, ...(outcome === 'uncertain' ? { retry } : {}) }
  }
}

export async function up(deps: CommandDeps, args: { specPath: string }): Promise<UpResult> {
  const spec = loadTeamSpec(args.specPath)
  const hash = specHash(spec)
  const briefings = new Map(spec.posts.map((p) => [p.id, renderBriefing(spec, p.id)]))
  return deps.registry.withTeamLock(spec.name, async () => {
    await preflight(deps)
    const l: Launch = { deps, spec, hash }
    await registerTeam(l)
    const posts: PostResult[] = []
    for (const p of spec.posts) posts.push(await launchPost(l, p, briefings.get(p.id)!))
    return { team: spec.name, posts }
  })
}
