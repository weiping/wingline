import { randomUUID } from 'node:crypto'
import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { announce, dispatchTo, taskSpec, type Delivery } from './dispatch.js'
import { resolveActor, resolveHandle, type Actor } from './identity.js'
import { oneShot } from './ledger.js'
import { logTask } from './log.js'
import type { NotifyResult } from './notify.js'
import { taskPreflight } from './preflight.js'

export interface CreateArgs {
  team: string
  title: string
  post?: string
  tags?: string[]
  parent?: string
  as?: string
  retryRequest?: string
}

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`

/** 重建同一条 wl task create 命令，错误提示里原样给出。 */
function rerunCommand(a: CreateArgs, id: string): string {
  const parts = ['wl task create', a.team, '--title', quote(a.title)]
  if (a.post) parts.push('--post', a.post)
  if (a.tags?.length) parts.push('--tags', a.tags.join(','))
  if (a.parent) parts.push('--parent', a.parent)
  if (a.as) parts.push('--as', a.as)
  return `${parts.join(' ')} --retry-request ${id}`
}

async function createOnly(deps: CommandDeps, a: CreateArgs, id: string, actor: Actor | null): Promise<{ id: string; replayed: boolean }> {
  return oneShot(deps, {
    team: a.team,
    retryRequest: a.retryRequest,
    id,
    fromReceipt: (r) => {
      const taskId = (r as { task?: { id?: string } } | null)?.task?.id
      return taskId ? { id: taskId, replayed: true } : null
    },
    retryHint: (rid) => rerunCommand(a, rid),
    build: (t) => ({
      spec: taskSpec(deps, `${actor?.address ?? 'human'}: ${a.title}`),
      taskTitle: a.title,
      run: t.runId!,
      from: t.coordinatorHandle!,
      ...(a.parent ? { parent: a.parent } : {}),
    }),
    call: (x) => deps.orca.taskCreate(x),
  })
}

function recordNewTask(deps: CommandDeps, a: CreateArgs, taskId: string, actor: Actor | null): void {
  if (deps.registry.getTaskExt(taskId)) return
  deps.registry.insertTaskExt({
    taskId, team: a.team, tags: a.tags ?? [], kind: 'work', claimedBy: a.post ?? null, readySince: deps.now().toISOString(),
  })
  logTask(deps, { team: a.team, taskId, actor, action: 'create' })
}

/** 派发给 --post；结果不确定时把提示改写成同一条 create 命令加 --retry-request。 */
async function dispatchCreated(deps: CommandDeps, a: CreateArgs, taskId: string, id: string, actor: Actor | null) {
  const target = { address: a.post!, handle: await resolveHandle(deps, { address: a.post!, explicit: true }) }
  try {
    const d = await dispatchTo(deps, a.team, taskId, target)
    return await announce(deps, a.team, { id: taskId, title: a.title }, target, d, actor)
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind !== 'uncertain') throw err
    const from = deps.registry.getTeam(a.team)!.coordinatorHandle
    throw new WinglineError('uncertain', err.code, err.message, {
      hint: `${rerunCommand(a, id)}（本次协调者 --from ${from}）`, cause: err,
    })
  }
}

export async function createTask(deps: CommandDeps, a: CreateArgs): Promise<{ id: string; delivery?: Delivery; reason?: NotifyResult['reason']; busyWith?: string }> {
  await taskPreflight(deps, a.team)
  if (a.post) await resolveHandle(deps, { address: a.post, explicit: true })
  const actor = await resolveActor(deps, a.as)
  const id = a.retryRequest ?? randomUUID()
  const created = await createOnly(deps, a, id, actor)
  recordNewTask(deps, a, created.id, actor)
  if (!a.post) return { id: created.id }
  return { id: created.id, ...(await dispatchCreated(deps, a, created.id, id, actor)) }
}
