import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WinglineError, commandLine, consoleWorktree, createConsoleServer, nodeOnPath, openTab, pidAlive, readConsoleFile, removeConsoleFileIfMine,
  requestLink, selfCommand, writeConsoleFile, type CommandDeps,
} from '@wingline/core'

/** 构建后前端位于 dist/web，与本文件编译出的 dist/console.js 同级。 */
const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web')
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

export interface ConsoleArgs {
  port?: number
  open?: boolean
  worktree?: string
  link?: boolean
  webRoot?: string
  /** 前台服务就绪后调用一次，用来先打印登录链接（服务随后阻塞到收到信号）。 */
  onReady?: (r: ConsoleResult) => void
}

export interface ConsoleResult {
  outcome: 'started' | 'link' | 'opened'
  url: string
  port?: number
  tab?: 'opened' | 'unsupported'
  tabReason?: 'worktree'
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 已在运行的服务：pid 存活且能拿到新登录链接；否则视为没有服务（spec 4.1）。 */
async function liveServer(home: string): Promise<{ port: number; link: string } | null> {
  const f = readConsoleFile(home)
  if (!f || !pidAlive(f.pid)) return null
  const link = await requestLink(f)
  return link ? { port: f.port, link } : null
}

/** 在 Orca 里起的控制台终端要能重新执行本 CLI：POSIX 用单引号，Windows 用双引号 + PATH 上的 node。 */
function launchLine(deps: CommandDeps): string {
  return commandLine(
    selfCommand({
      platform: process.platform,
      node: process.execPath,
      script: process.argv[1] ?? '',
      args: ['console'],
      home: deps.home,
      orca: deps.orcaPath,
      nodeOnPath: process.platform === 'win32' ? nodeOnPath(deps) : undefined,
    }),
    process.platform,
  )
}

/** --open 且没有服务：在 Orca 里新开 console@wingline 终端，轮询 console.json 直到服务可连（最多 10 秒）。 */
async function startInOrca(deps: CommandDeps, a: ConsoleArgs): Promise<string> {
  const worktree = consoleWorktree(deps, a.worktree)
  await deps.orca.terminalCreate({ worktree, title: 'console@wingline', command: launchLine(deps) })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await sleep(200)
    const live = await liveServer(deps.home)
    if (live) return live.link
  }
  throw new WinglineError('uncertain', 'console_start_unconfirmed', '已在 Orca 中启动控制台，但 10 秒内没有就绪', {
    hint: '到 console@wingline 终端里查看输出',
  })
}

/** 前台运行：起服务、写 console.json，阻塞到收到 SIGINT/SIGTERM/SIGHUP 后关闭并删除自己的 console.json。 */
async function foreground(deps: CommandDeps, a: ConsoleArgs): Promise<ConsoleResult> {
  const srv = await createConsoleServer(deps, { port: a.port, webRoot: a.webRoot ?? WEB_ROOT }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      throw new WinglineError('input', 'console_port_in_use', `端口 ${a.port} 已被占用`, { hint: '用 --port 换一个端口' })
    }
    throw err
  })
  writeConsoleFile(deps.home, { pid: process.pid, port: srv.port, startedAt: new Date().toISOString(), controlKey: srv.controlKey })
  const ready: ConsoleResult = { outcome: 'started', url: srv.loginUrl(), port: srv.port }
  a.onReady?.(ready)
  await new Promise<void>((resolve) => {
    const stop = () => {
      for (const s of SIGNALS) process.off(s, stop)
      removeConsoleFileIfMine(deps.home, process.pid)
      void srv.close().then(resolve)
    }
    for (const s of SIGNALS) process.on(s, stop)
  })
  return ready
}

export async function consoleCmd(deps: CommandDeps, a: ConsoleArgs): Promise<ConsoleResult> {
  const live = await liveServer(deps.home)
  if (a.link) {
    if (!live) throw new WinglineError('input', 'console_not_running', '控制台没有在运行', { hint: '运行 wl console --open 启动并打开' })
    return { outcome: 'link', url: live.link, port: live.port }
  }
  if (a.open) {
    const url = live?.link ?? (await startInOrca(deps, a))
    let worktree: string
    try {
      worktree = consoleWorktree(deps, a.worktree)
    } catch (err) {
      if (err instanceof WinglineError && err.code === 'console_no_worktree') {
        return { outcome: 'opened', url, tab: 'unsupported', tabReason: 'worktree' }
      }
      throw err
    }
    const tab = await openTab(deps, url, worktree)
    return { outcome: 'opened', url, tab }
  }
  if (live) return { outcome: 'link', url: live.link, port: live.port }
  return foreground(deps, a)
}

/** 启动就绪时打印（前台服务还在跑）。 */
export function renderReady(r: ConsoleResult): string {
  return `控制台服务已启动（端口 ${r.port}）\n登录链接：${r.url}\n`
}

/** 最终结果（服务停止后，或其他三种结果）。 */
export function renderConsole(r: ConsoleResult): string {
  if (r.outcome === 'started') return '控制台服务已停止\n'
  if (r.outcome === 'link') return `控制台登录链接：${r.url}\n`
  if (r.tab === 'opened') return `已在 Orca 中打开控制台：${r.url}\n`
  if (r.tabReason === 'worktree') {
    return `控制台链接：${r.url}\n提示：没有运行中的团队，无法确定工作区（console_no_worktree），请运行 wl up 或用 --worktree 指定，也可直接在浏览器打开链接\n`
  }
  return `控制台链接：${r.url}\n提示：当前 Orca 不支持在内置浏览器中打开标签页（console_tab_unsupported），请在浏览器中打开上面的链接\n`
}
