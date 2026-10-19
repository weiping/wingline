import type { AttentionReport, DispatcherStatus, PsRow, TimelineEvent } from '@wingline/core'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { CommandHint } from '../components/CommandHint.js'
import { EventRow } from '../components/EventRow.js'
import { PostCard } from '../components/PostCard.js'
import { ErrorBox, Loading, Pill, Section, postOf } from '../components/common.js'

export interface TeamView {
  team: string
  runId: string | null
  dispatcher: DispatcherStatus
  posts: PsRow[]
}

const DISPATCHER = { running: ['运行中', 'ok'], stale: ['失联', 'bad'], stopped: ['已停止', 'warn'], never: ['未启动', 'neutral'] } as const

function DispatcherCard({ d, team }: { d: DispatcherStatus; team: string }) {
  const [label, tone] = DISPATCHER[d.health.state]
  const age = d.health.ageMs
  return (
    <section class="card">
      <h2>
        调度员 <Pill tone={tone}>{label}</Pill>
      </h2>
      <p class="muted small">
        心跳 {age !== undefined ? `${Math.round(age / 1000)} 秒前` : '—'} · 冻结 {d.frozen} · 静音 {d.hushed} · 待办 {d.attentionItems}
      </p>
      {d.health.state !== 'running' && <CommandHint note="在终端里启动调度员：" command={`wl dispatcher up ${team}`} />}
    </section>
  )
}

function RecentEvents({ team }: { team: string }) {
  const log = useApi<{ events: TimelineEvent[] }>(`/api/teams/${encodeURIComponent(team)}/log?limit=20`)
  useStreamListener({ timeline: () => log.reload() })
  if (log.error) return <ErrorBox error={log.error} />
  if (!log.data) return <Loading />
  return (
    <ol class="events">
      {log.data.events
        .slice()
        .reverse()
        .map((e) => (
          <EventRow key={e.id} event={e} team={team} />
        ))}
    </ol>
  )
}

/** 总览：调度员、岗位卡（冻结 / 巡查标记来自收件箱数据）、最近 20 条事件。 */
export function Overview({ team }: { team: string }) {
  const enc = encodeURIComponent(team)
  const view = useApi<TeamView>(`/api/teams/${enc}`)
  const attn = useApi<AttentionReport>(`/api/teams/${enc}/attention`)
  useStreamListener({
    snapshot: () => {
      view.reload()
      attn.reload()
    },
  })
  if (view.error) return <ErrorBox error={view.error} />
  if (!view.data) return <Loading />
  const frozen = new Set((attn.data?.frozen ?? []).map((f) => f.post))
  const signal = new Map<string, number>()
  for (const s of attn.data?.signals ?? []) signal.set(s.post, Math.max(s.level, signal.get(s.post) ?? 0))
  const v = view.data
  return (
    <div class="page">
      <header class="page-head">
        <h1>{team}</h1>
        <span class="muted small">Run {v.runId ?? '—'}</span>
      </header>
      <DispatcherCard d={v.dispatcher} team={team} />
      <Section title="岗位" count={v.posts.length}>
        <div class="cards">
          {v.posts.map((p) => (
            <PostCard
              key={p.address}
              post={p}
              team={team}
              frozen={frozen.has(p.address)}
              signal={signal.get(p.address)}
              onChanged={() => view.reload()}
            />
          ))}
        </div>
      </Section>
      <Section title="最近事件">
        <RecentEvents team={team} />
      </Section>
    </div>
  )
}

