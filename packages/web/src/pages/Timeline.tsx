import { useEffect, useState } from 'preact/hooks'
import type { TimelineEvent } from '@wingline/core'
import { useApi } from '../hooks.js'
import { useStream, useStreamListener } from '../stream.js'
import { EventRow } from '../components/EventRow.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { ErrorBox, Loading, SOURCE_LABEL } from '../components/common.js'

type Source = '' | keyof typeof SOURCE_LABEL

/** 时间线：按来源 / 岗位地址 / 任务筛选；SSE 推来的新事件直接接在后面（去重）。新的在上。 */
export function Timeline({ team }: { team: string }) {
  const enc = encodeURIComponent(team)
  const [source, setSource] = useState<Source>('')
  const [post, setPost] = useState('')
  const [task, setTask] = useState('')
  const q = new URLSearchParams({ limit: '200' })
  if (source) q.set('source', source)
  if (post) q.set('post', post)
  if (task) q.set('task', task)
  const path = `/api/teams/${enc}/log?${q.toString()}`
  const log = useApi<{ events: TimelineEvent[] }>(path)
  const [live, setLive] = useState<TimelineEvent[]>([])
  useEffect(() => setLive([]), [path])
  // 断线重连后重取日志：断线期间的事件不会经 SSE 补发给页面，重取的结果已包含它们
  const { connection } = useStream()
  useEffect(() => {
    if (connection > 1) {
      log.reload()
      setLive([])
    }
  }, [connection])

  const matches = (e: TimelineEvent): boolean =>
    (!source || e.source === source) &&
    (!post || e.actor === post || e.target === post) &&
    (!task || e.target === task || (e.target ?? '').startsWith(`${task}#`))

  useStreamListener({
    timeline: (e) => {
      if (!matches(e)) return
      setLive((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e]))
    },
  })

  if (log.error) return <ErrorBox error={log.error} />
  if (!log.data) return <Loading />
  const seen = new Set<string>()
  const merged = [...log.data.events, ...live].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
  return (
    <div class="page">
      <header class="page-head">
        <h1>时间线</h1>
      </header>
      <form class="filters" onSubmit={(e) => e.preventDefault()}>
        <label class="field inline">
          <span>来源</span>
          <select value={source} onChange={(e) => setSource((e.target as HTMLSelectElement).value as Source)}>
            <option value="">全部</option>
            <option value="task">任务</option>
            <option value="patrol">巡查</option>
            <option value="command">命令</option>
          </select>
        </label>
        <label class="field inline">
          <span>岗位（地址，如 builder@{team}）</span>
          <input value={post} onInput={(e) => setPost((e.target as HTMLInputElement).value.trim())} />
        </label>
        <label class="field inline">
          <span>任务 ID</span>
          <input value={task} onInput={(e) => setTask((e.target as HTMLInputElement).value.trim())} />
        </label>
      </form>
      {merged.length === 0 ? (
        <p class="muted">暂无事件。</p>
      ) : (
        <ol class="events">
          {merged
            .slice()
            .reverse()
            .map((e) => (
              <EventRow key={e.id} event={e} team={team} />
            ))}
        </ol>
      )}
      <button
        type="button"
        class="btn ghost"
        onClick={() => {
          setLive([])
          log.reload()
        }}
      >
        刷新
      </button>
    </div>
  )
}
