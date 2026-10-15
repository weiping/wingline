import { WinglineError } from '../../src/errors.js'
import type { OrcaClient, OrchestrationTask, RequestShowState, RunSummary, SendResult, TerminalSummary, TerminalView } from '../../src/orca/types.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { specHash } from '../../src/spec/hash.js'
import { DUO_YAML, mkTeam } from '../spec/helpers.js'
import { Registry } from '../../src/registry/registry.js'
import type { CommandDeps } from '../../src/commands/deps.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type Args = Record<string, unknown>
export interface Fault { method: string; when: 'transport' | 'before' | 'after'; error: Error; match?: (a: Args) => boolean }
export interface LedgerEntry {
  input: string
  outcome: { ok: true; value: object } | { ok: false; error: WinglineError }
  raw: unknown
}
type FakeTask = OrchestrationTask
interface MutateOpts { coordinatorOnly?: boolean; recordRejections?: boolean }
interface Executed { value: object; raw: unknown }

const orcaError = (code: string, message: string) => new WinglineError('orca', code, message)

/** 真机上被拒的 worker_done 的 request-show 回执：completed，receipt 是一条 "Rejected worker_done" 消息 + lifecycle.rejected（orchestration-2a.json）。 */
const rejectionReceipt = (err: WinglineError) => ({
  message: { type: 'worker_done', subject: 'Rejected worker_done', body: `Orca rejected this worker_done: ${err.message}` },
  lifecycle: { action: 'rejected', code: err.code, reason: err.message },
})

export interface SentMessage { handle: string; text: string; retryRequest?: string }

/** 可编排的假 OrcaClient：记录调用序列，终端列表随 create/close 变化。 */
export class FakeOrca implements OrcaClient {
  calls: string[] = []
  terminals: TerminalSummary[] = []
  versionText = '1.4.222'
  reachable = true
  waitSatisfied = true
  sendStages: SendResult['stages'] = ['input_accepted', 'turn_started']
  ptyKilled = true
  created: Array<{ worktree: string; title: string; command: string }> = []
  sent: SentMessage[] = []
  private n = 0
  onCreate?: () => void | Promise<void>
  sendError?: Error | (() => Error)
  failSendOnce?: Error

  coordinator: string | null = null
  runs: RunSummary[] = []
  tasks: FakeTask[] = []
  gates = new Map<string, { taskId: string; status: 'pending' | 'resolved' }>()
  ledger = new Map<string, LedgerEntry>()
  pendingIds = new Set<string>()
  previews = new Map<string, string>()
  worktreePaths = new Map<string, string>()
  faults: Fault[] = []
  orch: Array<{ m: string; a: Args }> = []
  onMutate?: () => void
  private ids = { run: 0, task: 0, dispatch: 0, gate: 0 }
  private knownDispatches = new Set<string>()

  callsOf(m: string): Args[] {
    return this.orch.filter((x) => x.m === m).map((x) => x.a)
  }

  private takeFault(m: string, when: Fault['when'], a: Args): void {
    const i = this.faults.findIndex((f) => f.method === m && f.when === when && (!f.match || f.match(a)))
    if (i < 0) return
    throw this.faults.splice(i, 1)[0]!.error
  }

  /** 只读调用：只记方法名并取 before 故障。 */
  private read(m: string, a: Args = {}): void {
    this.calls.push(m)
    this.takeFault(m, 'before', a)
  }

  /** 不经账本的编排调用（runUse/runShow/runList/requestShow）：额外记入 orch。 */
  private observe(m: string, a: Args = {}): void {
    this.orch.push({ m, a })
    this.read(m, a)
  }

  private mutate<T extends object>(m: string, a: Args & { retryRequest?: string }, o: MutateOpts, exec: () => Executed): T & { replayed: boolean } {
    this.calls.push(m)
    this.orch.push({ m, a })
    this.onMutate?.()
    this.takeFault(m, 'transport', a)
    const { retryRequest, ...rest } = a
    const input = JSON.stringify(rest)
    const prior = retryRequest ? this.ledger.get(retryRequest) : undefined
    if (prior) return this.replay(prior, input) as T & { replayed: boolean }
    this.takeFault(m, 'before', a)
    if (o.coordinatorOnly && a.from !== this.coordinator) throw orcaError('consumer_fenced', `${String(a.from)} 不是当前协调者`)
    const res = this.execute(exec, o, retryRequest, input)
    this.takeFault(m, 'after', a)
    return { ...(res.value as T), replayed: false }
  }

  private replay(prior: LedgerEntry, input: string): object {
    if (prior.input !== input) throw orcaError('request_mismatch', '同一 retry-request 的参数不同')
    if (!prior.outcome.ok) throw prior.outcome.error
    return { ...structuredClone(prior.outcome.value), replayed: true }
  }

  private execute(exec: () => Executed, o: MutateOpts, retryRequest: string | undefined, input: string): Executed {
    let res: Executed
    try {
      res = exec()
    } catch (err) {
      if (o.recordRejections && retryRequest && err instanceof WinglineError) {
        this.ledger.set(retryRequest, { input, outcome: { ok: false, error: err }, raw: rejectionReceipt(err) })
      }
      throw err
    }
    if (retryRequest) this.ledger.set(retryRequest, { input, outcome: { ok: true, value: structuredClone(res.value) }, raw: res.raw })
    return res
  }

  private task(id: string): FakeTask {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) throw orcaError('task_not_found', `任务 ${id} 不存在`)
    return t
  }

  private release(t: FakeTask, status: FakeTask['status']): void {
    t.status = status
    t.assigneeHandle = null
    t.dispatchId = null
  }

  async runCreate(a: { objective: string; from: string; retryRequest?: string }) {
    return this.mutate<{ id: string; coordinatorHandle: string }>('runCreate', a, {}, () => {
      const id = `run-${++this.ids.run}`
      this.coordinator = a.from
      this.runs.push({ id, objective: a.objective, coordinatorHandle: a.from, createdAt: new Date().toISOString() })
      return { value: { id, coordinatorHandle: a.from }, raw: { run: { id, coordinator_handle: a.from } } }
    })
  }

  async runUse(a: { id: string; from: string }) {
    this.observe('runUse', a)
    if (!this.runs.some((r) => r.id === a.id)) throw orcaError('run_not_found', `Run ${a.id} 不存在`)
    this.coordinator = a.from
    return { coordinatorHandle: a.from }
  }

  async runShow(a: { id: string }) {
    this.observe('runShow', a)
    return { coordinatorHandle: this.coordinator as string }
  }

  async runList() {
    this.observe('runList')
    return this.runs.map((r) => ({ ...r }))
  }

  async requestShow(a: { request: string }): Promise<{ state: RequestShowState; receipt: unknown }> {
    this.observe('requestShow', a)
    if (this.pendingIds.has(a.request)) return { state: 'pending', receipt: null }
    const entry = this.ledger.get(a.request)
    return entry ? { state: 'completed', receipt: entry.raw } : { state: 'absent', receipt: null }
  }

  async taskCreate(a: { spec: string; taskTitle: string; run: string; from: string; parent?: string; retryRequest?: string }) {
    return this.mutate<{ id: string }>('taskCreate', a, { coordinatorOnly: true }, () => {
      const id = `task-${++this.ids.task}`
      this.tasks.push({ id, status: 'ready', title: a.taskTitle, spec: a.spec, parentId: a.parent ?? null, assigneeHandle: null, dispatchId: null, result: null })
      return { value: { id }, raw: { task: { id } } }
    })
  }

  async taskList(_a: { run: string }): Promise<OrchestrationTask[]> {
    this.read('taskList', _a)
    return this.tasks.map((t) => {
      const visible = t.status === 'ready' || t.status === 'dispatched'
      return { ...t, assigneeHandle: visible ? t.assigneeHandle : null, dispatchId: visible ? t.dispatchId : null }
    })
  }

  async dispatch(a: { task: string; to: string; from: string; retryRequest?: string }) {
    return this.mutate<{ dispatchId: string }>('dispatch', a, { coordinatorOnly: true }, () => {
      const t = this.task(a.task)
      if (t.status !== 'ready') throw orcaError('task_not_startable', `任务 ${t.id} 状态为 ${t.status}`)
      if (this.tasks.some((x) => x.status === 'dispatched' && x.assigneeHandle === a.to)) {
        throw orcaError('runtime_error', `terminal ${a.to} already has an active dispatch`)
      }
      t.status = 'dispatched'
      t.assigneeHandle = a.to
      t.dispatchId = `ctx-${++this.ids.dispatch}`
      this.knownDispatches.add(t.dispatchId)
      return { value: { dispatchId: t.dispatchId }, raw: {} }
    })
  }

  async workerDone(a: { taskId: string; dispatchId: string; outcome: 'succeeded' | 'failed'; subject: string; body?: string; run: string; from: string; retryRequest?: string }) {
    return this.mutate<object>('workerDone', a, { recordRejections: true }, () => {
      const t = this.task(a.taskId)
      if (!this.knownDispatches.has(a.dispatchId)) throw orcaError('unknown_dispatch', `worker_done references unknown dispatch ${a.dispatchId}.`)
      // 真机：对已完成派发的重复 worker_done 被接受（不报错、不改状态）
      if ((t.status === 'completed' || t.status === 'failed') && t.dispatchId === a.dispatchId) return { value: {}, raw: {} }
      if (t.status !== 'dispatched' || t.dispatchId !== a.dispatchId) throw orcaError('inactive_dispatch', `任务 ${t.id} 的派发已失效`)
      if (a.from !== t.assigneeHandle) throw orcaError('worker_identity_changed', `${a.from} 不是该派发的执行者`)
      t.status = a.outcome === 'succeeded' ? 'completed' : 'failed'
      t.result = JSON.stringify({ provenance: 'worker_report', outcome: a.outcome, reportedBy: a.from })
      return { value: {}, raw: {} }
    })
  }

  async gateCreate(a: { task: string; question: string; from: string; retryRequest?: string }) {
    return this.mutate<{ id: string }>('gateCreate', a, { coordinatorOnly: true }, () => {
      const t = this.task(a.task)
      const id = `gate-${++this.ids.gate}`
      this.gates.set(id, { taskId: t.id, status: 'pending' })
      t.status = 'blocked'
      return { value: { id }, raw: { gate: { id } } }
    })
  }

  async gateResolve(a: { id: string; resolution: string; from: string; retryRequest?: string }) {
    return this.mutate<object>('gateResolve', a, { coordinatorOnly: true }, () => {
      const g = this.gates.get(a.id)
      if (!g) throw orcaError('gate_not_found', `gate ${a.id} 不存在`)
      g.status = 'resolved'
      this.release(this.task(g.taskId), 'ready')
      return { value: {}, raw: {} }
    })
  }

  async terminalShow(a: { handle: string }): Promise<TerminalView> {
    this.read('terminalShow', a)
    const t = this.terminals.find((x) => x.handle === a.handle)
    if (!t) throw orcaError('terminal_not_found', `终端 ${a.handle} 不存在`)
    return { handle: t.handle, title: t.title, connected: t.connected, preview: this.previews.get(t.handle) ?? '❯ ' }
  }

  async worktreeShow(a: { worktree: string }) {
    this.read('worktreeShow', a)
    return { path: this.worktreePaths.get(a.worktree) ?? os.tmpdir() }
  }

  async version() { this.calls.push('version'); return this.versionText }
  async status() { this.calls.push('status'); return { reachable: this.reachable } }
  async terminalList() { this.read('terminalList'); return this.terminals.map((t) => ({ ...t })) }
  async terminalCreate(a: { worktree: string; title: string; command: string }) {
    this.calls.push('terminalCreate'); this.created.push(a)
    await this.onCreate?.()
    const handle = `term-${++this.n}`
    this.terminals.push({ handle, title: a.title, connected: true, worktreeId: 'wt-1' })
    return { handle }
  }
  async terminalWait() { this.calls.push('terminalWait'); return { satisfied: this.waitSatisfied } }
  async terminalSend(a: { handle: string; text: string; retryRequest?: string }) {
    this.calls.push('terminalSend')
    this.sent.push({ handle: a.handle, text: a.text, retryRequest: a.retryRequest })
    if (this.failSendOnce) { const e = this.failSendOnce; this.failSendOnce = undefined; throw e }
    return { accepted: true, stages: this.sendStages, requestId: `req-${this.sent.length}` }
  }
  async terminalClose(a: { handle: string }) {
    this.calls.push('terminalClose')
    for (const t of this.tasks) if (t.status === 'dispatched' && t.assigneeHandle === a.handle) this.release(t, 'ready')
    if (this.ptyKilled) this.terminals = this.terminals.filter((t) => t.handle !== a.handle)
    return { ptyKilled: this.ptyKilled }
  }
}

export function mkDeps(orca: FakeOrca, over: Partial<CommandDeps> = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const registry = Registry.open(path.join(home, 'state.db'))
  const warnings: string[] = []
  const deps: CommandDeps = {
    orca, registry, warn: (m) => warnings.push(m),
    verifiedOrca: '>=1.4.214 <1.5.0', multilineSafe: true, home, env: {}, now: () => new Date(), ...over,
  }
  return { deps, warnings, registry, home }
}

/** 模拟岗位绕过 wingline，直接用 Orca CLI 以当前 assignee 的身份上报（不带 retryRequest）。 */
export async function bypassReport(o: FakeOrca, taskId: string, outcome: 'succeeded' | 'failed' = 'succeeded'): Promise<void> {
  const t = o.tasks.find((x) => x.id === taskId)!
  await o.workerDone({ taskId, dispatchId: t.dispatchId!, outcome, subject: 'bypass', run: 'run-1', from: t.assigneeHandle! })
}

/** 登记一个运行中的 duo 团队：真实 spec 哈希、协调者、Run 与终端。 */
export function seedRunningTeam(o: FakeOrca, over: Partial<CommandDeps> & { yaml?: string } = {}) {
  const { yaml, ...depsOver } = over
  const made = mkDeps(o, depsOver)
  const specPath = mkTeam(yaml ?? DUO_YAML)
  made.registry.upsertTeam({
    name: 'duo', specPath, specHash: specHash(loadTeamSpec(specPath)), runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up',
  })
  o.coordinator = 'coord-1'
  o.runs.push({ id: 'run-1', objective: 'wingline:duo', coordinatorHandle: 'coord-1', createdAt: new Date().toISOString() })
  const worktree = `path:${os.tmpdir()}`
  for (const [id, handle, isLead] of [['builder', 'term-b', true], ['checker', 'term-c', false]] as const) {
    const address = `${id}@duo`
    made.registry.upsertPost({ address, team: 'duo', agent: id === 'builder' ? 'claude' : 'codex', worktree, handle, status: 'live', isLead })
    o.terminals.push({ handle, title: address, connected: true, worktreeId: 'wt-1' })
  }
  o.terminals.push({ handle: 'coord-1', title: 'zsh', connected: true, worktreeId: 'wt-1' })
  return made
}
