import type { ShownTask } from '@weiping/wingline-core'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { CommandHint } from '../components/CommandHint.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, clock } from '../components/common.js'
import { taskPath } from '../router.js'

const TERMINAL = new Set(['completed', 'failed'])

/** 任务详情：状态与主人、计划、父任务、闸门失败次数、结果、变迁历史；按状态给出可用的操作。 */
export function TaskDetail({ team, id }: { team: string; id: string }) {
  const enc = encodeURIComponent(team)
  const base = `/api/teams/${enc}/tasks/${encodeURIComponent(id)}`
  const task = useApi<ShownTask>(base)
  useStreamListener({ snapshot: () => task.reload() })
  if (task.error) return <ErrorBox error={task.error} />
  if (!task.data) return <Loading />
  const t = task.data
  const reload = () => task.reload()
  const open = !TERMINAL.has(t.status)
  const tone = t.status === 'completed' ? 'ok' : t.status === 'failed' || t.status === 'blocked' ? 'bad' : 'neutral'
  return (
    <div class="page">
      <header class="page-head">
        <h1>{t.title}</h1>
        <Pill tone={tone}>{t.status}</Pill>
      </header>
      <dl class="facts">
        <dt>ID</dt>
        <dd>
          <code>{t.id}</code>
        </dd>
        <dt>主人</dt>
        <dd>{t.claimedBy ?? '—'}</dd>
        <dt>第几轮</dt>
        <dd>{t.epoch}</dd>
        <dt>闸门失败</dt>
        <dd>{t.gateFailures} 次</dd>
        <dt>父任务</dt>
        <dd>{t.parentId ? <Link href={taskPath(team, t.parentId)}>{t.parentId}</Link> : '—'}</dd>
        <dt>标签</dt>
        <dd>{t.tags.length > 0 ? t.tags.join('、') : '—'}</dd>
        {t.gateOutput && (
          <>
            <dt>闸门输出</dt>
            <dd>
              <code>{t.gateOutput}</code>
            </dd>
          </>
        )}
      </dl>

      <div class="actions">
        {open && (
          <ActionDialog
            label="转人工"
            title="转人工"
            danger
            fields={[{ name: 'reason', label: '理由', kind: 'textarea', required: true }]}
            onSubmit={(v, rr) => api.post(`${base}/escalate`, { reason: v.reason, ...(rr ? { retryRequest: rr } : {}) })}
            onDone={reload}
          />
        )}
        {open && (
          <ActionDialog
            label="改派"
            title="改派"
            fields={[{ name: 'to', label: '新主人（岗位名）', required: true }]}
            onSubmit={(v) => api.post(`${base}/reassign`, { to: v.to })}
            onDone={reload}
          />
        )}
        {t.status === 'dispatched' && (
          <ActionDialog
            label="恢复派发"
            title="恢复派发"
            submitLabel="恢复"
            onSubmit={(_v, rr) => api.post(`${base}/recover`, rr ? { retryRequest: rr } : {})}
            onDone={reload}
          />
        )}
        {t.status === 'blocked' && t.gateId ? (
          <ActionDialog
            label="处理闸门"
            title="处理闸门"
            fields={[
              { name: 'resolution', label: '处理说明', kind: 'textarea', required: true },
              { name: 'reassign', label: '改派新主人（岗位名，可选）' },
            ]}
            onSubmit={(v, rr) =>
              api.post(`/api/teams/${enc}/gates/${encodeURIComponent(t.gateId!)}/resolve`, {
                resolution: v.resolution,
                ...(v.reassign?.trim() ? { reassign: v.reassign.trim() } : {}),
                ...(rr ? { retryRequest: rr } : {}),
              })
            }
            onDone={reload}
          />
        ) : t.status === 'blocked' ? (
          <CommandHint note="可在终端运行：" command={`wl task resolve <gate-id> --resolution "…"`} />
        ) : null}
      </div>

      {t.plan && (
        <Section title="计划">
          <pre class="term">{t.plan}</pre>
        </Section>
      )}
      {(t.result || t.outcome) && (
        <Section title="结果">
          <p>
            {t.outcome ?? '—'}
            {t.reportedBy && <span class="muted small"> · 上报人 {t.reportedBy}</span>}
          </p>
          {t.result && <pre class="term">{t.result}</pre>}
        </Section>
      )}
      <Section title="变迁历史" count={t.history?.length ?? 0}>
        <ol class="events">
          {(t.history ?? []).map((h) => (
            <li key={h.id} class="event">
              <time>{clock(h.at)}</time>
              <span class="tag">第 {h.epoch} 轮</span>
              <span class="actor">{h.actor}</span>
              <span class="action">{h.action}</span>
              {h.detail && <span class="muted small">{h.detail}</span>}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
