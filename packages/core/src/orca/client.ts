import { WinglineError } from '../errors.js'
import type { OrcaRunner } from './run.js'
import type { OrcaClient, OrchestrationTask, RequestShowState, RunSummary, SendStage } from './types.js'

/** terminal wait 自带超时；进程级超时多留一点余量，避免先于 Orca 自己的超时回执杀掉它。 */
const WAIT_PROCESS_SLACK_MS = 15_000

interface RawTerminal {
  handle: string
  tabId: string
  title: string | null
  connected: boolean
  worktreeId: string
}

/** 递归收集布局树里所有标签页（带 tabId、title 和 panes 的对象）的自定义标题。 */
function tabTitles(node: unknown, found = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(node)) {
    node.forEach((n) => tabTitles(n, found))
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.tabId === 'string' && typeof o.title === 'string' && 'panes' in o) found.set(o.tabId, o.title)
    Object.values(o).forEach((v) => tabTitles(v, found))
  }
  return found
}

const retryArgs = (a: { retryRequest?: string }) => (a.retryRequest ? ['--retry-request', a.retryRequest] : [])
const replayedOf = (r: { mutation?: { replayed?: boolean } }) => r.mutation?.replayed ?? false

type Mutation = { mutation?: { replayed?: boolean } }
interface RawTask {
  id: string
  status: OrchestrationTask['status']
  task_title: string
  spec: string
  parent_id?: string | null
  assignee_handle?: string | null
  dispatch_id?: string | null
  result?: string | null
}

const toTask = (t: RawTask): OrchestrationTask => ({
  id: t.id,
  status: t.status,
  title: t.task_title,
  spec: t.spec,
  parentId: t.parent_id ?? null,
  assigneeHandle: t.assignee_handle ?? null,
  dispatchId: t.dispatch_id ?? null,
  result: t.result ?? null,
})

type OrchestrationMethods = Omit<OrcaClient, 'version' | 'status' | 'terminalList' | 'terminalCreate' | 'terminalWait' | 'terminalSend' | 'terminalClose'>

function runMethods(runner: OrcaRunner): Pick<OrcaClient, 'runCreate' | 'runUse' | 'runShow' | 'runList' | 'requestShow'> {
  type RunReply = { run: { id: string; coordinator_handle: string } }
  return {
    async runCreate(a) {
      const r = await runner.json<RunReply & Mutation>(['orchestration', 'run-create', '--objective', a.objective, '--from', a.from, ...retryArgs(a)])
      return { id: r.run.id, coordinatorHandle: r.run.coordinator_handle, replayed: replayedOf(r) }
    },
    async runUse(a) {
      const r = await runner.json<RunReply>(['orchestration', 'run-use', '--id', a.id, '--from', a.from])
      return { coordinatorHandle: r.run.coordinator_handle }
    },
    async runShow(a) {
      const r = await runner.json<RunReply>(['orchestration', 'run-show', '--id', a.id])
      return { coordinatorHandle: r.run.coordinator_handle }
    },
    async runList() {
      const r = await runner.json<{ runs: Array<{ id: string; objective: string; coordinator_handle: string | null; created_at: string }> }>(['orchestration', 'run-list'])
      return r.runs.map((x): RunSummary => ({ id: x.id, objective: x.objective, coordinatorHandle: x.coordinator_handle, createdAt: x.created_at }))
    },
    async requestShow(a) {
      const r = await runner.json<{ state: RequestShowState; receipt?: unknown }>(['orchestration', 'request-show', '--request', a.request])
      return { state: r.state, receipt: r.receipt ?? null }
    },
  }
}

function taskMethods(runner: OrcaRunner): Pick<OrcaClient, 'taskCreate' | 'taskList' | 'dispatch' | 'workerDone'> {
  return {
    async taskCreate(a) {
      const r = await runner.json<{ task: { id: string } } & Mutation>([
        'orchestration', 'task-create', '--spec', a.spec, '--task-title', a.taskTitle, '--run', a.run, '--from', a.from,
        ...(a.parent ? ['--parent', a.parent] : []), ...retryArgs(a),
      ])
      return { id: r.task.id, replayed: replayedOf(r) }
    },
    async taskList(a) {
      const r = await runner.json<{ tasks: RawTask[] }>(['orchestration', 'task-list', '--run', a.run])
      return r.tasks.map(toTask)
    },
    async dispatch(a) {
      const r = await runner.json<{ dispatch: { id: string } } & Mutation>([
        'orchestration', 'dispatch', '--task', a.task, '--to', a.to, '--from', a.from, ...retryArgs(a),
      ])
      return { dispatchId: r.dispatch.id, replayed: replayedOf(r) }
    },
    async workerDone(a) {
      const r = await runner.json<Mutation>([
        'orchestration', 'send', '--type', 'worker_done', '--outcome', a.outcome, '--task-id', a.taskId,
        '--dispatch-id', a.dispatchId, '--subject', a.subject, ...(a.body !== undefined ? ['--body', a.body] : []),
        '--run', a.run, '--from', a.from, ...retryArgs(a),
      ])
      return { replayed: replayedOf(r) }
    },
  }
}

function gateAndViewMethods(runner: OrcaRunner): Pick<OrcaClient, 'gateCreate' | 'gateResolve' | 'terminalShow' | 'worktreeShow'> {
  return {
    async gateCreate(a) {
      const r = await runner.json<{ gate: { id: string } } & Mutation>([
        'orchestration', 'gate-create', '--task', a.task, '--question', a.question, '--from', a.from, ...retryArgs(a),
      ])
      return { id: r.gate.id, replayed: replayedOf(r) }
    },
    async gateResolve(a) {
      const r = await runner.json<Mutation>([
        'orchestration', 'gate-resolve', '--id', a.id, '--resolution', a.resolution, '--from', a.from, ...retryArgs(a),
      ])
      return { replayed: replayedOf(r) }
    },
    async terminalShow(a) {
      const r = await runner.json<{ terminal: { title: string | null; connected: boolean; preview?: string } }>(['terminal', 'show', '--terminal', a.handle])
      return { handle: a.handle, title: r.terminal.title, connected: r.terminal.connected, preview: r.terminal.preview ?? '' }
    },
    async worktreeShow(a) {
      const r = await runner.json<{ worktree: { path: string } }>(['worktree', 'show', '--worktree', a.worktree])
      return { path: r.worktree.path }
    },
  }
}

const orchestrationMethods = (runner: OrcaRunner): OrchestrationMethods => ({
  ...runMethods(runner),
  ...taskMethods(runner),
  ...gateAndViewMethods(runner),
})

/**
 * terminal create 没有 --retry-request（Orca 会以 invalid_argument 拒绝未知参数），
 * 所以创建靠“按标题查找”保证幂等；其余变更类调用才带重试 id。
 */
export function createOrcaClient(runner: OrcaRunner): OrcaClient {
  return {
    ...orchestrationMethods(runner),

    async version() {
      return (await runner.text(['--version'])).trim()
    },

    async status() {
      const r = await runner.json<{ runtime: { reachable: boolean } }>(['status'])
      return { reachable: r.runtime.reachable }
    },

    async terminalList(a) {
      // 有界面的标签页：list 里的 title 是 shell 窗口标题，--title 设的自定义标题只在 visualLayouts 里。
      // 无界面（macOS CI 实测，tabId 形如 pty:10）的终端不在布局里，其 title 本身就是自定义标题。
      const args = ['terminal', 'list', '--include-visual-layouts', ...(a?.worktree ? ['--worktree', a.worktree] : [])]
      const r = await runner.json<{ terminals: RawTerminal[]; visualLayouts?: unknown[] }>(args)
      const titles = tabTitles(r.visualLayouts ?? [])
      return r.terminals.map((t) => ({
        handle: t.handle, title: titles.get(t.tabId) ?? t.title, connected: t.connected, worktreeId: t.worktreeId,
      }))
    },

    async terminalCreate(a) {
      const r = await runner.json<{ terminal: { handle: string } }>([
        'terminal', 'create', '--worktree', a.worktree, '--title', a.title, '--command', a.command,
      ])
      return { handle: r.terminal.handle }
    },

    async terminalWait(a) {
      const args = ['terminal', 'wait', '--terminal', a.handle, '--for', a.forState, '--timeout-ms', String(a.timeoutMs)]
      try {
        const r = await runner.json<{ wait: { satisfied: boolean } }>(args, { timeoutMs: a.timeoutMs + WAIT_PROCESS_SLACK_MS })
        return { satisfied: r.wait.satisfied }
      } catch (err) {
        // 实测 Orca 把等待超时报成 ok:false、code 'timeout'，这只表示“条件没满足”
        if (err instanceof WinglineError && err.kind === 'orca' && err.code === 'timeout') return { satisfied: false }
        throw err
      }
    },

    async terminalSend(a) {
      const r = await runner.json<{
        send: { accepted: boolean; prompt?: { stages?: SendStage[] } }
        mutation?: { requestId?: string }
      }>([
        'terminal', 'send', '--terminal', a.handle, '--text', a.text, '--enter', '--wait-submit', String(a.waitSubmitSec),
        ...(a.retryRequest ? ['--retry-request', a.retryRequest] : []),
      ])
      return { accepted: r.send.accepted, stages: r.send.prompt?.stages ?? [], requestId: r.mutation?.requestId ?? null }
    },

    async terminalClose(a) {
      const r = await runner.json<{ close: { ptyKilled: boolean } }>(['terminal', 'close', '--terminal', a.handle])
      return { ptyKilled: r.close.ptyKilled }
    },
  }
}
