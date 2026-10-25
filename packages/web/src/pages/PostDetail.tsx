import type { PostDetail as PostDetailData } from '@weiping/wingline-core'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { EventRow } from '../components/EventRow.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section } from '../components/common.js'
import { taskPath } from '../router.js'

/** 岗位详情：会话 ID（不显示会话标记）、当前与排队任务、巡查信号、冻结 / 静音、终端最后 40 行（纯文本）、该岗位的时间线。 */
export function PostDetail({ team, post }: { team: string; post: string }) {
  const enc = encodeURIComponent(team)
  const pe = encodeURIComponent(post)
  const detail = useApi<PostDetailData>(`/api/teams/${enc}/posts/${pe}`)
  useStreamListener({ snapshot: () => detail.reload() })
  if (detail.error) return <ErrorBox error={detail.error} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const reload = () => detail.reload()
  const base = `/api/teams/${enc}/posts/${pe}`
  return (
    <div class="page">
      <header class="page-head">
        <h1>{post}</h1>
        <Pill tone={d.row.status === 'live' ? 'ok' : d.row.status === 'offline' ? 'bad' : 'warn'}>{d.row.status}</Pill>
        {d.row.isLead && <Pill tone="neutral">牵头</Pill>}
      </header>
      <dl class="facts">
        <dt>agent</dt>
        <dd>{d.row.agent}</dd>
        <dt>会话 ID</dt>
        <dd>
          <code>{d.sessionId ?? '未记录'}</code>
        </dd>
        <dt>冻结</dt>
        <dd>{d.frozen ? `${d.frozen.reason}` : '否'}</dd>
        <dt>静音至</dt>
        <dd>{d.hushedUntil ?? '否'}</dd>
      </dl>
      <div class="actions">
        <ActionDialog
          label="发消息"
          title={`发给 ${post}`}
          submitLabel="发送"
          fields={[{ name: 'message', label: '消息', kind: 'textarea', required: true }]}
          onSubmit={(v, rr) => api.post(`/api/teams/${enc}/send`, { post, message: v.message, ...(rr ? { retryRequest: rr } : {}) })}
          onDone={reload}
        />
        {d.frozen ? (
          <ActionDialog
            label="解冻"
            title="解冻"
            onSubmit={(_v, rr) => api.post(`${base}/unfreeze`, rr ? { retryRequest: rr } : {})}
            onDone={reload}
          />
        ) : (
          <ActionDialog
            label="冻结"
            title="冻结岗位"
            danger
            fields={[{ name: 'reason', label: '理由', required: true }]}
            onSubmit={(v, rr) => api.post(`${base}/freeze`, { reason: v.reason, ...(rr ? { retryRequest: rr } : {}) })}
            onDone={reload}
          />
        )}
        {d.hushedUntil ? (
          <ActionDialog
            label="取消静音"
            title="取消静音"
            onSubmit={(_v, rr) => api.post(`${base}/unhush`, rr ? { retryRequest: rr } : {})}
            onDone={reload}
          />
        ) : (
          <ActionDialog
            label="静音"
            title="静音"
            fields={[{ name: 'minutes', label: '时长（分钟，留空为默认）', kind: 'number' }]}
            onSubmit={(v, rr) => {
              const minutes = Number(v.minutes)
              return api.post(`${base}/hush`, {
                ...(v.minutes?.trim() && Number.isFinite(minutes) ? { forMs: minutes * 60_000 } : {}),
                ...(rr ? { retryRequest: rr } : {}),
              })
            }}
            onDone={reload}
          />
        )}
      </div>

      <Section title="当前任务">
        {d.currentTask ? <Link href={taskPath(team, d.currentTask.id)}>{d.currentTask.title}</Link> : <p class="muted small">空闲</p>}
      </Section>
      <Section title="排队" count={d.queued.length}>
        {d.queued.length === 0 ? (
          <p class="muted small">无</p>
        ) : (
          <ul>
            {d.queued.map((t) => (
              <li key={t.id}>
                <Link href={taskPath(team, t.id)}>{t.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="巡查信号" count={d.signals.length}>
        {d.signals.length === 0 ? (
          <p class="muted small">无</p>
        ) : (
          <ul>
            {d.signals.map((s) => (
              <li key={`${s.signal}:${s.taskId}`}>
                {s.signal} <Pill tone="warn">L{s.level}</Pill>{s.summary ? <span class="muted small"> {s.summary}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="终端（最后 40 行，只读）">
        {/* 终端内容按纯文本渲染：Preact 逐字转义，这里不会生成任何元素 */}
        <pre class="term">{d.preview.length > 0 ? d.preview.join('\n') : '（无预览）'}</pre>
      </Section>
      <Section title="最近事件" count={d.events.length}>
        <ol class="events">
          {d.events
            .slice()
            .reverse()
            .map((e) => (
              <EventRow key={e.id} event={e} team={team} />
            ))}
        </ol>
      </Section>
    </div>
  )
}
