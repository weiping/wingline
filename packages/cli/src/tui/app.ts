import {
  WinglineError, attention, auditedWriteCommands, cachedOrca, listTasks, ps, readTimeline, readTimelineAfter,
  type AttentionReport, type CommandDeps, type LogCursor, type WriteCommands,
} from '@wingline/core'
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

/**
 * 终端里的团队视图：进程内直接调用 core，不依赖控制台服务。读取失败只标“数据过期”；
 * 其他异常先恢复终端（退出备用屏幕、显示光标、关闭 raw 模式）再 reject。
 */
export function runTui(deps: CommandDeps, team: string, io: TuiIo, o: RunTuiOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const screen = new Screen(io.stdout)
    const cached = cachedOrca(deps.orca)
    const cdeps: CommandDeps = { ...deps, orca: cached }
    const read: TuiReader = { ps, attention, listTasks, readTimeline, readTimelineAfter, ...o.read }
    const commands = o.commands ?? auditedWriteCommands('tui:')
    let state: TuiState = { ...initialTuiState(), status: '加载中…' }
    let data: TuiData = { team, posts: [], attention: emptyAttention(team), tasks: [], timeline: [], hushed: [] }
    let cursor: LogCursor | null = null
    let finished = false
    const timers: Array<ReturnType<typeof setInterval>> = []

    const restore = () => {
      screen.restore()
      try {
        io.stdin.setRawMode?.(false)
      } catch {
        // 终端已经没了
      }
      io.stdin.pause?.()
    }
    const draw = () => {
      if (finished) return
      const lines = renderView(state, data, screen.size())
      o.onFrame?.(lines)
      screen.render(lines)
    }
    const finish = (err?: unknown) => {
      if (finished) return
      finished = true
      timers.forEach(clearInterval)
      io.stdin.off('data', onData)
      io.stdout.off('resize', onResize)
      process.off('exit', restore)
      process.off('uncaughtException', onFatal)
      for (const sig of SIGNALS) process.off(sig, onStop)
      o.signal?.removeEventListener('abort', onStop)
      restore()
      if (err === undefined) resolve()
      else reject(err)
    }
    const guard = <A extends unknown[]>(fn: (...a: A) => void | Promise<void>) => (...a: A): void => {
      try {
        const r = fn(...a)
        if (r instanceof Promise) r.catch(finish)
      } catch (err) {
        finish(err)
      }
    }
    const onStop = () => finish()
    const onFatal = (err: Error) => {
      process.off('uncaughtException', onFatal)
      restore()
      throw err
    }

    const markStale = () => {
      state = { ...state, stale: true }
      draw()
    }

    const refreshData = async () => {
      let loaded: { posts: TuiData['posts']; attention: AttentionReport; tasks: TuiData['tasks'] }
      try {
        const [posts, att, tasks] = await Promise.all([read.ps(cdeps, { team }), read.attention(cdeps, team), read.listTasks(cdeps, { team })])
        loaded = { posts, attention: att, tasks }
      } catch {
        return markStale()
      }
      const now = deps.now().getTime()
      const hushed = loaded.posts.map((p) => p.address).filter((a) => Date.parse(deps.registry.hushedUntil(a) ?? '') > now)
      data = { ...data, ...loaded, hushed }
      state = { ...state, stale: false, status: state.status === '加载中…' ? '' : state.status }
      draw()
    }

    const refreshTimeline = async () => {
      let events: TuiData['timeline']
      try {
        if (cursor === null) {
          const first = await read.readTimeline(cdeps, { team, limit: 200 })
          cursor = first.cursor
          events = first.events
        } else {
          const more = await read.readTimelineAfter(cdeps, team, cursor)
          cursor = more.cursor
          events = [...data.timeline, ...more.events]
        }
      } catch {
        return markStale()
      }
      const wasAtEnd = state.view === 'timeline' && state.selected >= data.timeline.length - 1
      data = { ...data, timeline: events.slice(-TIMELINE_KEEP) }
      if (wasAtEnd) state = { ...state, selected: Math.max(0, data.timeline.length - 1) }
      draw()
    }

    const execute = async (action: PendingAction) => {
      try {
        const result = await (commands[action.command] as unknown as WriteFn)(cdeps, action.args)
        state = { ...state, status: `${action.label}：${summaryOf(result)}`, lastUncertain: null }
      } catch (err) {
        state = { ...state, ...failure(action, err) }
      }
      cached.invalidate()
      draw()
      await Promise.all([refreshData(), refreshTimeline()])
    }

    const run = (effect: Effect) => {
      if (effect.kind === 'quit') return finish()
      if (effect.kind === 'refresh') return void Promise.all([refreshData(), refreshTimeline()]).catch(finish)
      void execute(effect.action).catch(finish)
    }

    const onData = guard((chunk: Buffer | string) => {
      for (const k of parseKeys(String(chunk))) {
        const r = reduce(state, k, data)
        state = r.state
        if (r.effect) run(r.effect)
      }
      draw()
    })
    const onResize = guard(() => {
      screen.invalidate()
      draw()
    })

    try {
      process.on('exit', restore)
      process.on('uncaughtException', onFatal)
      for (const sig of SIGNALS) process.on(sig, onStop)
      io.stdin.setRawMode?.(true)
      io.stdin.setEncoding?.('utf8')
      io.stdin.resume?.()
      screen.enter()
      io.stdin.on('data', onData)
      io.stdout.on('resize', onResize)
      o.signal?.addEventListener('abort', onStop, { once: true })
      draw()
      timers.push(setInterval(guard(refreshData), o.dataMs ?? 5000), setInterval(guard(refreshTimeline), o.timelineMs ?? 2000))
      guard(refreshData)()
      guard(refreshTimeline)()
      if (o.signal?.aborted) finish()
    } catch (err) {
      finish(err)
    }
  })
}

/** 一次写操作失败：只改状态行。结果不确定且带 retryRequest 时记下来，按 R 以同样的参数重试。 */
function failure(action: PendingAction, err: unknown): Partial<TuiState> {
  if (err instanceof WinglineError) {
    const retryRequest = (err.detail as { retryRequest?: unknown } | undefined)?.retryRequest
    if (err.kind === 'uncertain' && typeof retryRequest === 'string') {
      const hint = err.hint ? `（${err.hint}）` : ''
      return { lastUncertain: { ...action, args: { ...action.args, retryRequest } }, status: `${err.message}${hint}；按 R 原样重试` }
    }
    return { status: `${action.label}失败：${err.message}${err.hint ? `（${err.hint}）` : ''}` }
  }
  return { status: `${action.label}失败：${err instanceof Error ? err.message : String(err)}` }
}
