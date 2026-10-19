import type { AttentionReport, StaleItem } from '@wingline/core'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { CommandHint } from '../components/CommandHint.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, postOf } from '../components/common.js'
import { taskPath } from '../router.js'

const REASON: Record<StaleItem['reason'], string> = {
  done_unfinished: '已完成但未收尾',
  call_uncertain: '调用结果不确定',
  dead_assignee: '派发失主',
  owner_idle: '主人迟迟未开始',
  bypassed: '绕过闸门上报',
  blocked_waiting: '等待决策',
}

const Empty = () => <p class="muted small">暂无</p>

/** 收件箱：提问、卡住的任务、冻结岗位、巡查信号。没有写接口的条目只给出可复制的命令。 */
export function Inbox({ team }: { team: string }) {
  const enc = encodeURIComponent(team)
  const attn = useApi<AttentionReport>(`/api/teams/${enc}/attention`)
  useStreamListener({ snapshot: () => attn.reload() })
  if (attn.error) return <ErrorBox error={attn.error} />
  if (!attn.data) return <Loading />
  const a = attn.data
  const reload = () => attn.reload()
  const tasks = `/api/teams/${enc}/tasks`

  return (
    <div class="page">
      <header class="page-head">
        <h1>收件箱</h1>
      </header>
      {a.dispatcher.state !== 'running' && (
        <Section title="调度员">
          <p class="error">调度员不在运行，提问转达与巡查暂停。</p>
          <CommandHint command={`wl dispatcher up ${team}`} />
        </Section>
      )}

      <Section title="待回答的提问" count={a.questions.length}>
        {a.questions.length === 0 ? (
          <Empty />
        ) : (
          a.questions.map((q) => (
            <div class="row" key={q.messageId}>
              <div>
                <strong>{postOf(q.asker)}</strong> 问：{q.body}
                {q.options.length > 0 && <span class="muted small"> 选项：{q.options.join(' / ')}</span>}
              </div>
              <ActionDialog
                label="回答"
                title="回答提问"
                fields={[{ name: 'body', label: '回答', kind: 'textarea', required: true }]}
                onSubmit={(v) => api.post(`/api/teams/${enc}/questions/${encodeURIComponent(q.messageId)}/reply`, { body: v.body })}
                onDone={reload}
              />
            </div>
          ))
        )}
      </Section>

      <Section title="卡住的任务" count={a.stale.length}>
        {a.stale.length === 0 ? (
          <Empty />
        ) : (
          a.stale.map((s) => (
            <div class="row" key={`${s.taskId}:${s.reason}`}>
              <div>
                <Link href={taskPath(team, s.taskId)}>{s.title}</Link> <Pill tone="warn">{REASON[s.reason]}</Pill>{' '}
                <span class="muted small">主人 {s.owner ?? '—'}</span>
              </div>
              {s.reason === 'dead_assignee' ? (
                <ActionDialog
                  label="恢复派发"
                  title="恢复派发"
                  submitLabel="恢复"
                  onSubmit={(_v, rr) => api.post(`${tasks}/${encodeURIComponent(s.taskId)}/recover`, rr ? { retryRequest: rr } : {})}
                  onDone={reload}
                />
              ) : s.gateId ? (
                <ActionDialog
                  label="处理闸门"
                  title="处理闸门"
                  fields={[{ name: 'resolution', label: '处理说明', kind: 'textarea', required: true }]}
                  onSubmit={(v, rr) =>
                    api.post(`/api/teams/${enc}/gates/${encodeURIComponent(s.gateId!)}/resolve`, {
                      resolution: v.resolution,
                      ...(rr ? { retryRequest: rr } : {}),
                    })
                  }
                  onDone={reload}
                />
              ) : (
                <CommandHint command={s.command} />
              )}
            </div>
          ))
        )}
      </Section>

      <Section title="冻结的岗位" count={a.frozen.length}>
        {a.frozen.length === 0 ? (
          <Empty />
        ) : (
          a.frozen.map((f) => (
            <div class="row" key={f.post}>
              <div>
                <strong>{postOf(f.post)}</strong> <span class="muted small">{f.reason}</span>
              </div>
              <ActionDialog
                label="解冻"
                title={`解冻 ${postOf(f.post)}`}
                onSubmit={(_v, rr) => api.post(`/api/teams/${enc}/posts/${encodeURIComponent(postOf(f.post))}/unfreeze`, rr ? { retryRequest: rr } : {})}
                onDone={reload}
              />
            </div>
          ))
        )}
      </Section>

      <Section title="巡查信号" count={a.signals.length}>
        {a.signals.length === 0 ? (
          <Empty />
        ) : (
          a.signals.map((s) => (
            <div class="row" key={`${s.post}:${s.signal}:${s.taskId}`}>
              <div>
                <strong>{postOf(s.post)}</strong> <span class="muted small">{s.signal} · L{s.level}</span>
              </div>
              <ActionDialog
                label="静音"
                title={`静音 ${postOf(s.post)}`}
                fields={[{ name: 'minutes', label: '静音时长（分钟，留空为默认）', kind: 'number' }]}
                onSubmit={(v, rr) => {
                  const minutes = Number(v.minutes)
                  const body = {
                    ...(v.minutes?.trim() && Number.isFinite(minutes) ? { forMs: minutes * 60_000 } : {}),
                    ...(rr ? { retryRequest: rr } : {}),
                  }
                  return api.post(`/api/teams/${enc}/posts/${encodeURIComponent(postOf(s.post))}/hush`, body)
                }}
                onDone={reload}
              />
            </div>
          ))
        )}
      </Section>

      {a.unavailable.length > 0 && <p class="muted small">无法读取：{a.unavailable.join('；')}</p>}
    </div>
  )
}
