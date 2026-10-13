import { WinglineError } from '../errors.js'
import type { OrcaRunner } from './run.js'
import type { OrcaClient, SendStage } from './types.js'

/** terminal wait 自带超时；进程级超时多留一点余量，避免先于 Orca 自己的超时回执杀掉它。 */
const WAIT_PROCESS_SLACK_MS = 15_000

interface RawTerminal {
  handle: string
  tabId: string
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

/**
 * terminal create 没有 --retry-request（Orca 会以 invalid_argument 拒绝未知参数），
 * 所以创建靠“按标题查找”保证幂等；其余变更类调用才带重试 id。
 */
export function createOrcaClient(runner: OrcaRunner): OrcaClient {
  return {
    async version() {
      return (await runner.text(['--version'])).trim()
    },

    async status() {
      const r = await runner.json<{ runtime: { reachable: boolean } }>(['status'])
      return { reachable: r.runtime.reachable }
    },

    async terminalList(a) {
      // list 里的 title 是 shell 的窗口标题；--title 设的自定义标题只在 visualLayouts 的标签页里
      const args = ['terminal', 'list', '--include-visual-layouts', ...(a?.worktree ? ['--worktree', a.worktree] : [])]
      const r = await runner.json<{ terminals: RawTerminal[]; visualLayouts?: unknown[] }>(args)
      const titles = tabTitles(r.visualLayouts ?? [])
      return r.terminals.map((t) => ({
        handle: t.handle, title: titles.get(t.tabId) ?? null, connected: t.connected, worktreeId: t.worktreeId,
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
