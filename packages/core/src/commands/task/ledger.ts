import { randomUUID } from 'node:crypto'
import { WinglineError } from '../../errors.js'
import type { RequestRow, TeamRow } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'

/** spec 第 2 节事实 10：可能已落地、Orca 自己标为 outcome_unknown 的四个传输码。 */
export const TRANSPORT_CODES: ReadonlySet<string> = new Set([
  'runtime_unavailable',
  'remote_runtime_unavailable',
  'runtime_timeout',
  'invalid_runtime_response',
])

export const fenced = (err: unknown): boolean => err instanceof WinglineError && err.kind === 'orca' && err.code === 'consumer_fenced'

export const indeterminate = (err: unknown): boolean =>
  err instanceof WinglineError && (err.kind === 'uncertain' || (err.kind === 'orca' && TRANSPORT_CODES.has(err.code)))

export interface LedgerCall<A extends object, R> {
  key: string
  /** 团队名：fence 时刷新它的 coordinator_handle。 */
  team: string
  /** 完整参数（不含 retryRequest）；只在首次、fence 重发、派发换目标时调用。 */
  build: (team: TeamRow) => A | Promise<A>
  call: (a: A & { retryRequest: string }) => Promise<R>
  /** 首次用的幂等 id，缺省 randomUUID()。 */
  id?: string
  hint?: (a: A, id: string) => string
  /** 只给派发行用：重放 pending/uncertain 行之前调用；'settle' 时先 request-show 定案。 */
  beforeReplay?: (stored: A) => Promise<'replay' | 'settle'>
}

/** fresh：这一行是本次调用新开的（input 错误才能确定调用从未发出、可以安全丢掉）。 */
type Ctx<A extends object, R> = { deps: CommandDeps; c: LedgerCall<A, R>; fresh: boolean }

const DEFAULT_HINT = (id: string) => `原样重跑同一条命令即可（幂等 id ${id} 已记录）`

function teamOf(deps: CommandDeps, name: string): TeamRow {
  const t = deps.registry.getTeam(name)
  if (!t) throw new WinglineError('input', 'team_unknown', `团队 ${name} 未登记`)
  return t
}

export async function refreshCoordinator(deps: CommandDeps, team: string): Promise<TeamRow> {
  const t = teamOf(deps, team)
  const { coordinatorHandle } = await deps.orca.runShow({ id: t.runId! })
  deps.registry.updateCoordinatorHandle(team, coordinatorHandle)
  return teamOf(deps, team)
}

const storedRow = (deps: CommandDeps, key: string): RequestRow => deps.registry.getRequest(key)!

/** retryRequest 进 detail：3B 控制台据此在响应里给出“按原样重试”所需的 id（spec 3B §2.4）。 */
function uncertainError(err: unknown, hint: string, retryRequest?: string): WinglineError {
  const e = err instanceof WinglineError ? err : undefined
  return new WinglineError('uncertain', e?.code ?? 'outcome_unknown', e?.message ?? String(err), {
    hint, cause: err, ...(retryRequest ? { detail: { retryRequest } } : {}),
  })
}

function markUncertain<A extends object, R>(x: Ctx<A, R>, err: unknown, hint: string): never {
  x.deps.registry.finishRequest(x.c.key, 'uncertain', { error: (err as WinglineError).code })
  throw uncertainError(err, hint, x.deps.registry.getRequest(x.c.key)?.retryRequest ?? undefined)
}

/** oneShot 的 c.hint 带 --retry-request <id>；所有不确定出口都经它，缺省用 fallback。 */
function hintFor<A extends object, R>(x: Ctx<A, R>, row: RequestRow, fallback: string): string {
  return x.c.hint ? x.c.hint(JSON.parse(row.args!) as A, row.retryRequest!) : fallback
}

async function attempt<A extends object, R>(x: Ctx<A, R>, row: RequestRow): Promise<R> {
  const args = JSON.parse(row.args!) as A
  const value = await x.c.call({ ...args, retryRequest: row.retryRequest! })
  x.deps.registry.finishRequest(x.c.key, 'done', value)
  return value
}

/** 换新 id：对旧 id 做比较后交换；别的进程已经换过，就沿用它换出来的 id，不再另起一个。 */
async function reissue<A extends object, R>(x: Ctx<A, R>, team: TeamRow, old: RequestRow): Promise<RequestRow> {
  x.deps.registry.reissueIntent(x.c.key, randomUUID(), await x.c.build(team), old.retryRequest!)
  const current = x.deps.registry.getRequest(x.c.key)
  if (current) return current
  // 赢家已经把这一行定案并丢掉（再次被 fence）：输家不再往下走
  throw new WinglineError('orca', 'consumer_fenced', '协调者在并发的另一次调用里又变了', { hint: '重跑同一条命令' })
}

async function queryState(deps: CommandDeps, id: string): Promise<'completed' | 'pending' | 'absent' | 'unknown'> {
  try {
    return (await deps.orca.requestShow({ request: id })).state
  } catch {
    return 'unknown'
  }
}

/** 同 id 同参数再调用一次：Orca 对 completed 的请求重放返回记下的结果。 */
async function replayOnce<A extends object, R>(x: Ctx<A, R>, row: RequestRow): Promise<R> {
  try {
    return await attempt(x, row)
  } catch (again) {
    if (again instanceof WinglineError && again.kind === 'orca' && !indeterminate(again)) {
      x.deps.registry.dropRequest(x.c.key)
      throw again
    }
    return markUncertain(x, again, hintFor(x, row, DEFAULT_HINT(row.retryRequest!)))
  }
}

/** 回执读不出（internal/bad_json、回执形状不符的 TypeError）：调用可能已经落地，和传输错误一样要靠 request-show 定案。 */
const unreadable = (err: unknown): boolean => !(err instanceof WinglineError) || err.kind === 'internal'

const pendingHint = <A extends object, R>(x: Ctx<A, R>, row: RequestRow): string =>
  x.c.hint ? `原调用还在进行，稍后重跑：${hintFor(x, row, '')}` : '原调用还在进行，稍后原样重跑同一条命令'

/** spec 第 9.1 节第 3 步。 */
async function settleFailure<A extends object, R>(x: Ctx<A, R>, row: RequestRow, err: unknown): Promise<R> {
  const id = row.retryRequest!
  const state = await queryState(x.deps, id)
  const unsure = indeterminate(err) || unreadable(err)
  if (state === 'completed' && unsure) return replayOnce(x, row)
  if (state === 'completed' || state === 'absent') {
    x.deps.registry.dropRequest(x.c.key)
    if (!unsure) throw err
    throw uncertainError(err, hintFor(x, row, '原样重跑同一条命令即可'))
  }
  if (state === 'pending') return markUncertain(x, err, pendingHint(x, row))
  return markUncertain(x, err, hintFor(x, row, DEFAULT_HINT(id)))
}

async function run<A extends object, R>(x: Ctx<A, R>, row: RequestRow, reissued = false): Promise<R> {
  try {
    return await attempt(x, row)
  } catch (err) {
    if (fenced(err) && !reissued) {
      const team = await refreshCoordinator(x.deps, x.c.team)
      return run(x, await reissue(x, team, row), true)
    }
    if (err instanceof WinglineError && err.kind === 'input') {
      if (x.fresh) x.deps.registry.dropRequest(x.c.key)
      throw err
    }
    return settleFailure(x, row, err)
  }
}

/** 重放派发行之前：request-show 定案（completed → 照常重放；absent → 用新参数重发）。 */
async function preSettle<A extends object, R>(x: Ctx<A, R>, row: RequestRow): Promise<RequestRow> {
  const state = await queryState(x.deps, row.retryRequest!)
  if (state === 'completed') return row
  if (state === 'absent') return reissue(x, teamOf(x.deps, x.c.team), row)
  const err = new WinglineError('uncertain', 'outcome_unknown', `请求 ${row.retryRequest} 的结果不确定`)
  const hint = state === 'pending' ? pendingHint(x, row) : hintFor(x, row, DEFAULT_HINT(row.retryRequest!))
  return markUncertain(x, err, hint)
}

/** spec 第 9.1 节 P1。done 行直接返回存下的结果（不调用 Orca）。 */
export async function ledgered<A extends object, R>(deps: CommandDeps, c: LedgerCall<A, R>): Promise<R> {
  let row = deps.registry.getRequest(c.key)
  const x: Ctx<A, R> = { deps, c, fresh: !row }
  if (row?.state === 'done') return JSON.parse(row.receipt!) as R
  if (!row) {
    deps.registry.openIntent(c.key, c.id ?? randomUUID(), await c.build(teamOf(deps, c.team)))
    row = storedRow(deps, c.key)
  } else if (c.beforeReplay && (await c.beforeReplay(JSON.parse(row.args!) as A)) === 'settle') {
    row = await preSettle(x, row)
  }
  return run(x, row)
}

export interface OneShotCall<A extends { from: string }, R> {
  team: string
  retryRequest?: string
  id?: string
  build: LedgerCall<A, R>['build']
  call: LedgerCall<A, R>['call']
  /** 本地无记录、request-show 为 completed 时从原回执取结果；取不出 → null。 */
  fromReceipt: (receipt: unknown) => R | null
  retryHint: (id: string) => string
  /** 重试时不参与参数比较的字段（除 from 外）：随调用方或平台变化、不代表用户意图的部分。 */
  ignore?: string[]
}

const withoutFrom = (a: object, ignore: string[] = []) =>
  JSON.stringify({ ...a, from: undefined, ...Object.fromEntries(ignore.map((k) => [k, undefined])) })

async function adoptReceipt<A extends { from: string }, R>(deps: CommandDeps, c: OneShotCall<A, R>, key: string, id: string): Promise<R | null> {
  const shown = await deps.orca.requestShow({ request: id }).catch(() => null)
  if (!shown || shown.state === 'absent') return null
  if (shown.state === 'pending') {
    throw new WinglineError('uncertain', 'request_pending', `请求 ${id} 还在进行`, { hint: '稍后原样重跑同一条命令' })
  }
  const value = c.fromReceipt(shown.receipt)
  if (value === null) {
    throw new WinglineError('uncertain', 'retry_request_unreadable', `请求 ${id} 已在 Orca 落地但读不出结果`, {
      hint: '这个 id 已在 Orca 落地但读不出结果：先用 wl task list 确认，再去掉 --retry-request 重跑',
    })
  }
  deps.registry.openIntent(key, id, await c.build(teamOf(deps, c.team)))
  deps.registry.finishRequest(key, 'done', value)
  return value
}

/** spec 第 9.2 节 P2：id = retryRequest ?? id ?? randomUUID()，键 oneshot:<id>。 */
export async function oneShot<A extends { from: string }, R>(deps: CommandDeps, c: OneShotCall<A, R>): Promise<R> {
  const id = c.retryRequest ?? c.id ?? randomUUID()
  const key = `oneshot:${id}`
  const local = deps.registry.getRequest(key)
  if (local) {
    const fresh = await c.build(teamOf(deps, c.team))
    if (withoutFrom(fresh, c.ignore) !== withoutFrom(JSON.parse(local.args!) as object, c.ignore)) {
      throw new WinglineError('input', 'retry_request_args_changed', `--retry-request ${id} 的参数与上次不同`, {
        hint: '用原参数重跑，或去掉 --retry-request 作为新操作',
      })
    }
  } else if (c.retryRequest) {
    const adopted = await adoptReceipt(deps, c, key, id)
    if (adopted !== null) return adopted
  }
  return ledgered(deps, { key, team: c.team, id, build: c.build, call: c.call, hint: (a) => `${c.retryHint(id)}（本次协调者 --from ${a.from}）` })
}
