import {
  WinglineError, attention, auditedWriteCommands, cachedOrca, listTasks, ps, readTimeline, readTimelineAfter,
  type AttentionReport, type CachedOrca, type CommandDeps, type LogCursor, type WriteCommands,
} from '@weiping/wingline-core'
import { parseKeys } from './keys.js'
import { reduce, initialTuiState } from './reduce.js'
import { renderView } from './render.js'
import { Screen } from './screen.js'
import type { Effect, PendingAction, TuiData, TuiIo, TuiState } from './types.js'

export { initialTuiState, reduce, renderView }
export type { Effect, TuiData, TuiState }

/** 读取数据用的函数；测试里可以替换其中任意一个。 */
export interface TuiReader {
  ps: typeof ps
  attention: typeof attention
  listTasks: typeof listTasks
  readTimeline: typeof readTimeline
  readTimelineAfter: typeof readTimelineAfter
}

export interface RunTuiOptions {
  signal?: AbortSignal
  /** 写命令表；缺省是带 `tui:` 审计前缀的那一份。 */
  commands?: WriteCommands
  read?: Partial<TuiReader>
  /** 岗位与待办的刷新间隔，缺省 5 秒。 */
  dataMs?: number
  /** 时间线的刷新间隔，缺省 2 秒。 */
  timelineMs?: number
  /** 每画一帧调用一次（测试观察屏幕内容用）。 */
  onFrame?: (lines: string[]) => void
}

const TIMELINE_KEEP = 500
const LOADING = '加载中…'
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

const emptyAttention = (team: string): AttentionReport => ({
  team, dispatcher: { state: 'never' }, frozen: [], signals: [], questions: [], stale: [], unavailable: [], warnings: [],
})

type WriteFn = (deps: CommandDeps, args: Record<string, unknown>) => Promise<unknown>

function summaryOf(result: unknown): string {
  const r = result as { outcome?: unknown; duplicate?: unknown } | null
  if (r?.duplicate === true) return '已完成（该请求此前已处理过）'
  return typeof r?.outcome === 'string' ? `已完成（${r.outcome}）` : '已完成'
}

/** 一次写操作失败：只改状态行。结果不确定且带 retryRequest 时记下来，按 R 以同样的参数重试。 */
function failure(action: PendingAction, err: unknown): Partial<TuiState> {
  if (err instanceof WinglineError) {
    const hint = err.hint ? `（${err.hint}）` : ''
    const retryRequest = (err.detail as { retryRequest?: unknown } | undefined)?.retryRequest
    if (err.kind === 'uncertain' && typeof retryRequest === 'string') {
      return { lastUncertain: { ...action, args: { ...action.args, retryRequest } }, status: `${err.message}${hint}；按 R 原样重试` }
    }
    return { status: `${action.label}失败：${err.message}${hint}` }
  }
  return { status: `${action.label}失败：${err instanceof Error ? err.message : String(err)}` }
}

/**
 * 一次 wl tui 会话：进程内直接调用 core，不依赖控制台服务。读取失败只标“数据过期”；
 * 其他异常先恢复终端（退出备用屏幕、显示光标、关闭 raw 模式）再 reject。
 */
class TuiSession {
  private readonly screen: Screen
  private readonly cached: CachedOrca
  private readonly cdeps: CommandDeps
  private readonly read: TuiReader
  private readonly commands: WriteCommands
  private state: TuiState = { ...initialTuiState(), status: LOADING }
  private data: TuiData
  private cursor: LogCursor | null = null
  /** 正在进行的读取与“进行中又被要求刷新”的标记：同一种读取不并发，被挤掉的请求在读完后补跑一次。 */
  private busy = { data: false, timeline: false }
  private rerun = { data: false, timeline: false }
  private finished = false
  private timers: Array<ReturnType<typeof setInterval>> = []

  constructor(
    private readonly deps: CommandDeps,
    private readonly team: string,
    private readonly io: TuiIo,
    private readonly o: RunTuiOptions,
    private readonly done: { resolve(): void; reject(err: unknown): void },
  ) {
    this.screen = new Screen(io.stdout)
    this.cached = cachedOrca(deps.orca)
    this.cdeps = { ...deps, orca: this.cached }
    this.read = { ps, attention, listTasks, readTimeline, readTimelineAfter, ...o.read }
    this.commands = o.commands ?? auditedWriteCommands('tui:')
    this.data = { team, posts: [], attention: emptyAttention(team), tasks: [], timeline: [], hushed: [] }
  }

  // —— 生命周期 ——

  start(): void {
    try {
      process.on('exit', this.restore)
      process.on('uncaughtException', this.onFatal)
      for (const sig of SIGNALS) process.on(sig, this.onStop)
      this.io.stdin.setRawMode?.(true)
      this.io.stdin.setEncoding?.('utf8')
      this.io.stdin.resume?.()
      this.screen.enter()
      this.io.stdin.on('data', this.onData)
      this.io.stdout.on('resize', this.onResize)
      this.o.signal?.addEventListener('abort', this.onStop, { once: true })
      this.draw()
      this.startLoops()
      if (this.o.signal?.aborted) this.finish()
    } catch (err) {
      this.finish(err)
    }
  }

  private startLoops(): void {
    this.timers.push(
      setInterval(this.guard(() => this.refreshData()), this.o.dataMs ?? 5000),
      setInterval(this.guard(() => this.refreshTimeline()), this.o.timelineMs ?? 2000),
    )
    this.guard(() => this.refreshData())()
    this.guard(() => this.refreshTimeline())()
  }

  private readonly restore = (): void => {
    this.screen.restore()
    try {
      this.io.stdin.setRawMode?.(false)
    } catch {
      // 终端已经没了
    }
    this.io.stdin.pause?.()
  }

  private finish(err?: unknown): void {
    if (this.finished) return
    this.finished = true
    this.timers.forEach(clearInterval)
    this.io.stdin.off('data', this.onData)
    this.io.stdout.off('resize', this.onResize)
    process.off('exit', this.restore)
    process.off('uncaughtException', this.onFatal)
    for (const sig of SIGNALS) process.off(sig, this.onStop)
    this.o.signal?.removeEventListener('abort', this.onStop)
    this.restore()
    if (err === undefined) this.done.resolve()
    else this.done.reject(err)
  }

  /** 回调里抛出的异常（同步或异步）一律走 finish：先恢复终端再 reject。 */
  private guard<A extends unknown[]>(fn: (...a: A) => void | Promise<void>): (...a: A) => void {
    return (...a) => {
      try {
        const r = fn(...a)
        if (r instanceof Promise) r.catch((e) => this.finish(e))
      } catch (err) {
        this.finish(err)
      }
    }
  }

  private readonly onStop = (): void => this.finish()

  private readonly onFatal = (err: Error): void => {
    process.off('uncaughtException', this.onFatal)
    this.restore()
    throw err
  }

  // —— 画面与输入 ——

  private draw(): void {
    if (this.finished) return
    const lines = renderView(this.state, this.data, this.screen.size())
    this.o.onFrame?.(lines)
    this.screen.render(lines)
  }

  private readonly onData = this.guard((chunk: Buffer | string) => {
    for (const k of parseKeys(String(chunk))) {
      const r = reduce(this.state, k, this.data)
      this.state = r.state
      if (r.effect) this.run(r.effect)
    }
    this.draw()
  })

  private readonly onResize = this.guard(() => {
    this.screen.invalidate()
    this.draw()
  })

  private run(effect: Effect): void {
    if (effect.kind === 'quit') return this.finish()
    if (effect.kind === 'refresh') return void this.refreshAll().catch((e) => this.finish(e))
    void this.execute(effect.action).catch((e) => this.finish(e))
  }

  // —— 读取 ——

  private refreshAll(): Promise<unknown> {
    return Promise.all([this.refreshData(), this.refreshTimeline()])
  }

  private markStale(): void {
    this.state = { ...this.state, stale: true }
    this.draw()
  }

  /** 读取失败只标过期；处理结果时抛出的异常是 bug，交给 guard 走 finish。 */
  private refreshData(): Promise<void> {
    return this.exclusive('data', () => this.loadData())
  }

  private refreshTimeline(): Promise<void> {
    return this.exclusive('timeline', () => this.loadTimeline())
  }

  private async exclusive(kind: 'data' | 'timeline', load: () => Promise<void>): Promise<void> {
    if (this.busy[kind]) {
      this.rerun[kind] = true
      return
    }
    this.busy[kind] = true
    try {
      await load()
    } finally {
      this.busy[kind] = false
    }
    if (this.rerun[kind]) {
      this.rerun[kind] = false
      await this.exclusive(kind, load)
    }
  }

  private async loadData(): Promise<void> {
    const { team, cdeps, read } = this
    let loaded: { posts: TuiData['posts']; attention: AttentionReport; tasks: TuiData['tasks'] }
    try {
      const [posts, att, tasks] = await Promise.all([read.ps(cdeps, { team }), read.attention(cdeps, team), read.listTasks(cdeps, { team })])
      loaded = { posts, attention: att, tasks }
    } catch {
      return this.markStale()
    }
    const now = this.deps.now().getTime()
    const hushed = loaded.posts.map((p) => p.address).filter((a) => Date.parse(this.deps.registry.hushedUntil(a) ?? '') > now)
    this.data = { ...this.data, ...loaded, hushed }
    this.state = { ...this.state, stale: false, status: this.state.status === LOADING ? '' : this.state.status }
    this.draw()
  }

  private async loadTimeline(): Promise<void> {
    const { team, cdeps, read } = this
    let events: TuiData['timeline']
    try {
      if (this.cursor === null) {
        const first = await read.readTimeline(cdeps, { team, limit: 200 })
        this.cursor = first.cursor
        events = first.events
      } else {
        const more = await read.readTimelineAfter(cdeps, team, this.cursor)
        this.cursor = more.cursor
        events = [...this.data.timeline, ...more.events]
      }
    } catch {
      return this.markStale()
    }
    const wasAtEnd = this.state.view === 'timeline' && this.state.selected >= this.data.timeline.length - 1
    this.data = { ...this.data, timeline: events.slice(-TIMELINE_KEEP) }
    if (wasAtEnd) this.state = { ...this.state, selected: Math.max(0, this.data.timeline.length - 1) }
    this.draw()
  }

  // —— 写操作 ——

  private async execute(action: PendingAction): Promise<void> {
    try {
      const result = await (this.commands[action.command] as unknown as WriteFn)(this.cdeps, action.args)
      this.state = { ...this.state, status: `${action.label}：${summaryOf(result)}`, lastUncertain: null }
    } catch (err) {
      this.state = { ...this.state, ...failure(action, err) }
    }
    this.cached.invalidate()
    this.draw()
    await this.refreshAll()
  }
}

/** 全屏终端视图。结束（q / Ctrl-C / 信号 / abort）时 resolve；出错时先恢复终端再 reject。 */
export function runTui(deps: CommandDeps, team: string, io: TuiIo, o: RunTuiOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => new TuiSession(deps, team, io, o, { resolve, reject }).start())
}
