import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { PsRow, TimelineEvent } from '@weiping/wingline-core'
import { ApiError, api } from './api.js'

export type StreamState = 'live' | 'reconnecting' | 'closed'

/** 服务端 snapshot 事件（见 spec 6.4）。 */
export interface TeamSnapshot {
  team: string
  posts: PsRow[]
  dispatcher: string
  attentionCounts: { frozen: number; signals: number; questions: number; stale: number; warnings: number }
}

interface Handlers {
  timeline(e: TimelineEvent): void
  snapshot(s: TeamSnapshot): void
}

const RETRY_MS = 5_000
const FAILURES_BEFORE_SESSION_CHECK = 3

/**
 * 订阅团队事件流。EventSource 出错后关闭并 5 秒后重建；连续失败 3 次先查会话，401 则停止（closed）。
 */
export function useEventStream(team: string, on: Handlers): { state: StreamState; connection: number } {
  const [state, setState] = useState<StreamState>('reconnecting')
  // 每次连上加 1：第二次起就是断线重连，页面据此重取数据补上断线期间的事件
  const [connection, setConnection] = useState(0)
  const handlers = useRef(on)
  handlers.current = on
  useEffect(() => {
    let source: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let stopped = false

    const schedule = () => {
      timer = setTimeout(open, RETRY_MS)
    }
    const open = () => {
      if (stopped) return
      source = new EventSource(`/api/teams/${encodeURIComponent(team)}/events`)
      source.onopen = () => {
        failures = 0
        setConnection((c) => c + 1)
        setState('live')
      }
      source.addEventListener('timeline', (ev) => handlers.current.timeline(JSON.parse((ev as MessageEvent<string>).data) as TimelineEvent))
      source.addEventListener('snapshot', (ev) => handlers.current.snapshot(JSON.parse((ev as MessageEvent<string>).data) as TeamSnapshot))
      source.onerror = () => {
        source?.close()
        source = null
        if (stopped) return
        failures += 1
        setState('reconnecting')
        if (failures < FAILURES_BEFORE_SESSION_CHECK) return schedule()
        api.get('/api/session').then(
          () => schedule(),
          (err: unknown) => {
            if (err instanceof ApiError && err.code === 'unauthenticated') {
              stopped = true
              setState('closed')
              return
            }
            schedule()
          },
        )
      }
    }
    open()
    return () => {
      stopped = true
      clearTimeout(timer)
      source?.close()
    }
  }, [team])
  return { state, connection }
}

export type Listener = Partial<Handlers>
interface StreamValue {
  state: StreamState
  /** 连上的次数；大于 1 说明发生过重连。 */
  connection: number
  snapshot: TeamSnapshot | null
  listen: (l: Listener) => () => void
}
const StreamContext = createContext<StreamValue | null>(null)

/** 每个团队一个连接；页面 key 随团队切换重建。 */
export function StreamProvider({ team, children }: { team: string; children: ComponentChildren }) {
  const listeners = useRef(new Set<Listener>())
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null)
  const { state, connection } = useEventStream(team, {
    timeline: (e) => {
      for (const l of listeners.current) l.timeline?.(e)
    },
    snapshot: (s) => {
      setSnapshot(s)
      for (const l of listeners.current) l.snapshot?.(s)
    },
  })
  // 稳定引用：useStreamListener 的 effect 依赖它，不能每次渲染都换
  const listen = useCallback((l: Listener) => {
    listeners.current.add(l)
    return () => {
      listeners.current.delete(l)
    }
  }, [])
  const value: StreamValue = { state, connection, snapshot, listen }
  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
}

export function useStream(): StreamValue {
  const v = useContext(StreamContext)
  if (!v) throw new Error('useStream 必须在 StreamProvider 内使用')
  return v
}

/** 订阅本团队的事件；回调总是取最新的那一份。 */
export function useStreamListener(l: Listener): void {
  const { listen } = useStream()
  const latest = useRef(l)
  latest.current = l
  useEffect(
    () =>
      listen({
        timeline: (e) => latest.current.timeline?.(e),
        snapshot: (s) => latest.current.snapshot?.(s),
      }),
    [listen],
  )
}
