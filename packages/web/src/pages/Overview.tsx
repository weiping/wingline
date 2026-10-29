import type { AttentionReport, DispatcherStatus, PsRow, TimelineEvent } from '@weiping/wingline-core'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { EventRow } from '../components/EventRow.js'
import { PostCard } from '../components/PostCard.js'
import { DispatcherActions, TeamActions } from '../components/TeamActions.js'
import { ErrorBox, Loading, Pill, Section } from '../components/common.js'

export interface TeamView {
  team: string
  runId: string | null
  status: 'up' | 'stopped'
  specPath: string
  hasDraft: boolean
  neverStarted?: boolean
  orcaUnavailable?: string
  /** neverStarted 时后端只给精简 4 键（无 lastCheck / lastScan / warnings）。 */
  dispatcher: Pick<DispatcherStatus, 'frozen' | 'hushed' | 'attentionItems'> & { health: DispatcherStatus['health'] } & Partial<DispatcherStatus>
  posts: PsRow[]
}

const DISPATCHER = { running: ['运行中', 'ok'], stale: ['失联', 'bad'], stopped: ['已停止', 'warn'], never: ['未启动', 'neutral'] } as const

function DispatcherCard({ d, team, neverStarted, onChanged }: { d: TeamView['dispatcher']; team: string; neverStarted?: boolean; onChanged: () => void }) {
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
      <DispatcherActions team={team} state={d.health.state} neverStarted={neverStarted} onChanged={onChanged} />
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

/** 页头：团队名 + Run + 生命周期按钮组；Orca 不可达与从未启动用普通提示条（非红色错误块）。 */
function OverviewHead({ team, v, onChanged }: { team: string; v: TeamView; onChanged: () => void }) {
  return (
    <>
      <header class="page-head">
        <h1>{team}</h1>
        <span class="muted small">Run {v.runId ?? '—'}</span>
        <TeamActions team={team} view={v} onChanged={onChanged} />
      </header>
      {v.orcaUnavailable && (
        <p class="banner" role="status">
          Orca 未运行或不可达，岗位状态暂不可用
        </p>
      )}
      {v.neverStarted && (
        <p class="banner" role="status">
          该团队还没有启动过，先点「启动团队」
        </p>
      )}
    </>
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
  const onChanged = () => {
    view.reload()
    attn.reload()
  }
  return (
    <div class="page">
      <OverviewHead team={team} v={v} onChanged={onChanged} />
      {(attn.data?.warnings ?? []).map((w) => (
        <p class="banner" role="status" key={w}>
          {w}
        </p>
      ))}
      <DispatcherCard d={v.dispatcher} team={team} neverStarted={v.neverStarted} onChanged={onChanged} />
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
