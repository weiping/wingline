import crypto from 'node:crypto'
import type { CommandDeps } from '../commands/deps.js'
import type { CachedOrca } from '../view/snapshot.js'
import { readTimeline, readTimelineAfter, type LogCursor } from '../commands/log.js'
import { ps } from '../commands/ps.js'
import { attention } from '../commands/dispatcher/attention.js'
import { dispatcherHealth } from '../commands/dispatcher/lifecycle.js'

export function cursorFrom(lastEventId: string | undefined, start: LogCursor): LogCursor {
  if (!lastEventId) return { ...start }
  const parts = lastEventId.split(':')
  if (parts.length !== 2) return { ...start }
  const [source, idStr] = parts
  const id = parseInt(idStr!, 10)
  if (Number.isNaN(id)) return { ...start }

  const out = { ...start }
  if (source === 'task') out.task = id
  else if (source === 'patrol') out.patrol = id
  else if (source === 'command') out.command = id
  return out
}

interface Subscriber {
  write: (chunk: string) => void
  cursor: LogCursor
}

interface TeamLoop {
  subscribers: Set<Subscriber>
  timelineTimer: any
  snapshotTimer: any
  pingTimer: any
  lastSnapshotHash: string | null
  /** 最近一次推送的快照；晚加入的订阅者立即拿到它，不必等数据再变。 */
  lastSnapshot: string | null
}

export class TeamFeeds {
  private readonly loops = new Map<string, TeamLoop>()
  private readonly setTimer: typeof setInterval
  private readonly clearTimer: typeof clearInterval
  private readonly timelineMs: number
  private readonly snapshotMs: number
  private readonly pingMs: number

  constructor(
    private readonly deps: CommandDeps & { orca: CachedOrca },
    o: {
      timelineMs?: number
      snapshotMs?: number
      pingMs?: number
      setTimer?: typeof setInterval
      clearTimer?: typeof clearInterval
    } = {},
  ) {
    this.timelineMs = o.timelineMs ?? 2000
    this.snapshotMs = o.snapshotMs ?? 5000
    this.pingMs = o.pingMs ?? 15000
    this.setTimer = o.setTimer ?? setInterval
    this.clearTimer = o.clearTimer ?? clearInterval
  }

  async subscribe(team: string, write: (chunk: string) => void, lastEventId?: string): Promise<() => void> {
    const { cursor: currentCursor } = await readTimeline(this.deps, { team, limit: 1 })
    const subCursor = cursorFrom(lastEventId, currentCursor)

    let loop = this.loops.get(team)
    if (!loop) {
      loop = {
        subscribers: new Set(),
        timelineTimer: null,
        snapshotTimer: null,
        pingTimer: null,
        lastSnapshotHash: null,
        lastSnapshot: null,
      }
      this.loops.set(team, loop)
      this.startLoop(team, loop)
    }

    const sub: Subscriber = { write, cursor: subCursor }
    loop.subscribers.add(sub)

    return () => {
      const curLoop = this.loops.get(team)
      if (!curLoop) return
      curLoop.subscribers.delete(sub)
      if (curLoop.subscribers.size === 0) {
        this.stopLoop(curLoop)
        this.loops.delete(team)
      }
    }
  }

  /**
   * 把团队当前的快照单独推给刚加入的订阅者（晚加入的连接不必等数据再变）。
   * 必须在响应头写出之后调用；subscribe 本身不写任何内容。
   */
  replaySnapshot(team: string, write: (chunk: string) => void): void {
    const snap = this.loops.get(team)?.lastSnapshot
    if (snap) write(`event: snapshot\ndata: ${snap}\n\n`)
  }

  private startLoop(team: string, loop: TeamLoop): void {
    // 1. timeline loop (2s)
    loop.timelineTimer = this.setTimer(async () => {
      await this.tickTimeline(team, loop)
    }, this.timelineMs)

    // 2. snapshot loop (5s)
    loop.snapshotTimer = this.setTimer(async () => {
      await this.tickSnapshot(team, loop)
    }, this.snapshotMs)

    // 3. ping loop (15s)
    loop.pingTimer = this.setTimer(() => {
      for (const sub of loop.subscribers) {
        sub.write(': ping\n\n')
      }
    }, this.pingMs)
  }

  private async tickTimeline(team: string, loop: TeamLoop): Promise<void> {
    if (loop.subscribers.size === 0) return
    for (const sub of loop.subscribers) {
      try {
        const res = await readTimelineAfter(this.deps, team, sub.cursor)
        sub.cursor = res.cursor
        for (const ev of res.events) {
          sub.write(`id: ${ev.id}\nevent: timeline\ndata: ${JSON.stringify(ev)}\n\n`)
        }
      } catch (err) {
        this.deps.warn(`SSE timeline tick error for ${team}: ${String(err)}`)
      }
    }
  }

  private async tickSnapshot(team: string, loop: TeamLoop): Promise<void> {
    if (loop.subscribers.size === 0) return
    try {
      const posts = await ps(this.deps, { team })
      const att = await attention(this.deps, team)
      const disp = dispatcherHealth(this.deps, team).state

      const data = {
        team,
        posts,
        dispatcher: disp,
        attentionCounts: {
          frozen: att.frozen.length,
          signals: att.signals.length,
          questions: att.questions.length,
          stale: att.stale.length,
          warnings: att.warnings.length,
        },
      }
      const serialized = JSON.stringify(data)
      const hash = crypto.createHash('sha256').update(serialized).digest('hex')
      if (hash !== loop.lastSnapshotHash) {
        loop.lastSnapshotHash = hash
        loop.lastSnapshot = serialized
        for (const sub of loop.subscribers) {
          sub.write(`event: snapshot\ndata: ${serialized}\n\n`)
        }
      }
    } catch (err) {
      this.deps.warn(`SSE snapshot tick error for ${team}: ${String(err)}`)
    }
  }

  private stopLoop(loop: TeamLoop): void {
    if (loop.timelineTimer) this.clearTimer(loop.timelineTimer)
    if (loop.snapshotTimer) this.clearTimer(loop.snapshotTimer)
    if (loop.pingTimer) this.clearTimer(loop.pingTimer)
  }

  closeAll(): void {
    for (const loop of this.loops.values()) {
      this.stopLoop(loop)
    }
    this.loops.clear()
  }
}
