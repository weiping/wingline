import { randomUUID } from 'node:crypto'
import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'
import { shellQuote } from './quote.js'
import { announce, dispatchTo, taskSpec, type Delivery } from './dispatch.js'
import { resolveActor, resolveHandle, type Actor } from './identity.js'
import { oneShot } from './ledger.js'
import { logTask } from './log.js'
import type { NotifyResult } from './notify.js'
import { taskPreflight } from './preflight.js'
import { frozenError, isPostFrozen } from './frozen.js'

export interface CreateArgs {
  team: string
  title: string
  post?: string
  tags?: string[]
  parent?: string
  as?: string
  retryRequest?: string
}


/** 重建同一条 wl task create 命令，错误提示里原样给出。 */
function rerunCommand(a: CreateArgs, id: string): string {
  const parts = ['wl task create', a.team, '--title', shellQuote(a.title)]
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
    ignore: ['spec'],
    build: (t) => ({
      spec: taskSpec(deps, `${actor?.address ?? 'human'}: ${a.title}`),
      taskTitle: a.title,
      run: t.runId!,
      from: t.coordinatorHandle!,
      ...(a.parent ? { parent: a.parent } : {}),
      tags: a.tags ?? [],
      post: a.post ?? null,
    }),
    // tags / post 只参与重试时的参数比较，不发给 Orca
    call: ({ tags: _tags, post: _post, ...x }) => deps.orca.taskCreate(x),
  })
}

function recordNewTask(deps: CommandDeps, a: CreateArgs, taskId: string, actor: Actor | null): void {
  if (deps.registry.getTaskExt(taskId)) return
  deps.registry.insertTaskExt({
    taskId, team: a.team, tags: a.tags ?? [], kind: 'work', claimedBy: a.post ?? null, readySince: deps.now().toISOString(),
  })
  logTask(deps, { team: a.team, taskId, actor, action: 'create' })
}

/** 任务已经建出之后的失败：错误里带上任务 id 和重跑命令（重跑复用这个任务，不会再建一个）。 */
function afterCreateError(deps: CommandDeps, a: CreateArgs, taskId: string, id: string, err: unknown): unknown {
  if (!(err instanceof WinglineError)) return err
  const from = err.kind === 'uncertain' ? `（本次协调者 --from ${deps.registry.getTeam(a.team)!.coordinatorHandle}）` : ''
  return new WinglineError(err.kind, err.code, `${err.message}（任务 ${taskId} 已创建）`, {
    hint: `任务 ${taskId} 已创建但派发没有完成；重跑同一条命令会复用它：${rerunCommand(a, id)}${from}`, cause: err,
  })
}

/** 派发给 --post。 */
async function dispatchCreated(deps: CommandDeps, a: CreateArgs, taskId: string, id: string, actor: Actor | null) {
  try {
    const target = { address: a.post!, handle: await resolveHandle(deps, { address: a.post!, explicit: true }) }
    const d = await dispatchTo(deps, a.team, taskId, target)
    return await announce(deps, a.team, { id: taskId, title: a.title }, target, d, actor)
  } catch (err) {
    throw afterCreateError(deps, a, taskId, id, err)
  }
}

export async function createTask(deps: CommandDeps, a: CreateArgs): Promise<{ id: string; delivery?: Delivery; reason?: NotifyResult['reason']; busyWith?: string }> {
  const { spec } = await taskPreflight(deps, a.team)
  if (a.post && !spec.posts.some((p) => `${p.id}@${a.team}` === a.post)) {
    throw new WinglineError('input', 'post_unknown', `${a.post} 不是团队 ${a.team} 的岗位`)
  }
  if (a.post && isPostFrozen(deps, a.post)) throw frozenError(a.post)
  if (a.post) await resolveHandle(deps, { address: a.post, explicit: true })
  const actor = await resolveActor(deps, a.as)
  const id = a.retryRequest ?? randomUUID()
  const created = await createOnly(deps, a, id, actor)
  recordNewTask(deps, a, created.id, actor)
  if (!a.post) return { id: created.id }
  return { id: created.id, ...(await dispatchCreated(deps, a, created.id, id, actor)) }
}
