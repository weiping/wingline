import type { AttentionReport, StaleItem } from '@weiping/wingline-core'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { CommandHint } from '../components/CommandHint.js'
import { DirectAction, DispatcherActions } from '../components/TeamActions.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, postOf } from '../components/common.js'
import { STALE_REASON } from '../labels.js'
import { taskPath } from '../router.js'

const Empty = () => <p class="muted small">暂无</p>

type Reload = () => void

/** 卡住任务的一键操作：owner_idle / done_unfinished 以任务主人调任务流；dead_assignee 走确认框；其余给命令。 */
function StaleTaskAction({ team, s, reload }: { team: string; s: StaleItem; reload: Reload }) {
  const base = `/api/teams/${encodeURIComponent(team)}/tasks`
  const owner = s.owner ? postOf(s.owner) : null
  const simple = (label: string, action: string) => (
    <DirectAction label={label} kind="btn ghost" path={`${base}/${encodeURIComponent(s.taskId)}/${action}`} body={() => ({ as: owner })} onDone={reload} />
  )
  if (s.reason === 'dead_assignee') {
    return (
      <ActionDialog
        label="恢复派发"
        title="恢复派发"
        submitLabel="恢复"
        onSubmit={(_v, rr) => api.post(`${base}/${encodeURIComponent(s.taskId)}/recover`, rr ? { retryRequest: rr } : {})}
        onDone={reload}
      />
    )
  }
  if (s.reason === 'owner_idle' && owner) return simple('开始任务', 'start')
  if (s.reason === 'done_unfinished' && owner) return simple('完成并校验', 'done')
  return <CommandHint command={s.command} />
}

function DispatcherNotice({ team, state, reload }: { team: string; state: AttentionReport['dispatcher']['state']; reload: Reload }) {
  return (
    <Section title="调度员">
      <p class="error">调度员不在运行，提问转达与巡查暂停。</p>
      <DispatcherActions team={team} state={state} onChanged={reload} />
    </Section>
  )
}

function QuestionsCard({ enc, questions, reload }: { enc: string; questions: AttentionReport['questions']; reload: Reload }) {
  return (
    <Section title="待回答的提问" count={questions.length}>
      {questions.length === 0 ? (
        <Empty />
      ) : (
        questions.map((q) => (
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
  )
}

function GatesCard({ team, enc, gates, reload }: { team: string; enc: string; gates: StaleItem[]; reload: Reload }) {
  return (
    <Section title="等待决策的 gate" count={gates.length}>
      {gates.length === 0 ? (
        <Empty />
      ) : (
        gates.map((s) => (
          <div class="row" key={`${s.taskId}:${s.gateId ?? s.reason}`}>
            <div>
              <Link href={taskPath(team, s.taskId)}>{s.title}</Link> <Pill tone="bad">等待决策</Pill>{' '}
              <span class="muted small">归属 {s.owner ? postOf(s.owner) : '—'}</span>
            </div>
            {s.gateId ? (
              <ActionDialog
                label="处理闸门"
                title={`处理闸门 ${s.gateId}`}
                fields={[
                  { name: 'resolution', label: '处理说明', kind: 'textarea', required: true },
                  { name: 'reassign', label: '改派新主人（岗位名，可选）' },
                ]}
                onSubmit={(v, rr) =>
                  api.post(`/api/teams/${enc}/gates/${encodeURIComponent(s.gateId!)}/resolve`, {
                    resolution: v.resolution,
                    ...(v.reassign?.trim() ? { reassign: v.reassign.trim() } : {}),
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
  )
}

function FrozenCard({ enc, frozen, reload }: { enc: string; frozen: AttentionReport['frozen']; reload: Reload }) {
  return (
    <Section title="冻结的岗位" count={frozen.length}>
      {frozen.length === 0 ? (
        <Empty />
      ) : (
        frozen.map((f) => (
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
  )
}

function StaleTasksCard({ team, hung, reload }: { team: string; hung: StaleItem[]; reload: Reload }) {
  return (
    <Section title="卡住的任务" count={hung.length}>
      {hung.length === 0 ? (
        <Empty />
      ) : (
        hung.map((s) => (
          <div class="row" key={`${s.taskId}:${s.reason}`}>
            <div>
              <Link href={taskPath(team, s.taskId)}>{s.title}</Link> <Pill tone="warn">{STALE_REASON[s.reason]}</Pill>{' '}
              <span class="muted small">主人 {s.owner ? postOf(s.owner) : '—'}</span>
            </div>
            <StaleTaskAction team={team} s={s} reload={reload} />
          </div>
        ))
      )}
    </Section>
  )
}

/** 静音请求体：分钟数合法才带 forMs。 */
function hushBody(minutes: string | undefined, rr?: string) {
  const n = Number(minutes)
  return {
    ...(minutes?.trim() && Number.isFinite(n) ? { forMs: n * 60_000 } : {}),
    ...(rr ? { retryRequest: rr } : {}),
  }
}

function SignalRow({ enc, s, reload }: { enc: string; s: AttentionReport['signals'][number]; reload: Reload }) {
  const post = postOf(s.post)
  return (
    <div class="row">
      <div>
        <strong>{post}</strong> <span class="muted small">{s.signal} · L{s.level}{s.summary ? ` · ${s.summary}` : ''}</span>
      </div>
      <div class="actions">
        {s.command ? <CommandHint command={s.command} /> : null}
        <ActionDialog
          label="发消息"
          title={`发给 ${post}`}
          submitLabel="发送"
          fields={[{ name: 'message', label: '消息', kind: 'textarea', required: true }]}
          onSubmit={(v, rr) => api.post(`/api/teams/${enc}/send`, { post, message: v.message, ...(rr ? { retryRequest: rr } : {}) })}
          onDone={reload}
        />
        <ActionDialog
          label="静音"
          title={`静音 ${post}`}
          fields={[{ name: 'minutes', label: '静音时长（分钟，留空为默认）', kind: 'number' }]}
          onSubmit={(v, rr) => api.post(`/api/teams/${enc}/posts/${encodeURIComponent(post)}/hush`, hushBody(v.minutes, rr))}
          onDone={reload}
        />
      </div>
    </div>
  )
}

function SignalsCard({ enc, signals, reload }: { enc: string; signals: AttentionReport['signals']; reload: Reload }) {
  return (
    <Section title="巡查信号" count={signals.length}>
      {signals.length === 0 ? <Empty /> : signals.map((s) => <SignalRow key={`${s.post}:${s.signal}:${s.taskId}`} enc={enc} s={s} reload={reload} />)}
    </Section>
  )
}

/** 收件箱：提问、卡住的任务、冻结岗位、巡查信号。没有写接口的条目只给出可复制的命令。 */
export function Inbox({ team }: { team: string }) {
  const enc = encodeURIComponent(team)
  const attn = useApi<AttentionReport>(`/api/teams/${enc}/attention`)
  useStreamListener({ snapshot: () => attn.reload() })
  if (attn.error) return <ErrorBox error={attn.error} />
  if (!attn.data) return <Loading />
  const a = attn.data
  const reload = () => attn.reload()
  return (
    <div class="page">
      <header class="page-head">
        <h1>收件箱</h1>
      </header>
      {a.warnings.length > 0 && (
        <div class="warnings">
          {a.warnings.map((w) => (
            <p class="error" key={w}>{w}</p>
          ))}
        </div>
      )}
      {a.dispatcher.state !== 'running' && <DispatcherNotice team={team} state={a.dispatcher.state} reload={reload} />}
      <QuestionsCard enc={enc} questions={a.questions} reload={reload} />
      <GatesCard team={team} enc={enc} gates={a.stale.filter((s) => s.reason === 'blocked_waiting')} reload={reload} />
      <FrozenCard enc={enc} frozen={a.frozen} reload={reload} />
      <StaleTasksCard team={team} hung={a.stale.filter((s) => s.reason !== 'blocked_waiting')} reload={reload} />
      <SignalsCard enc={enc} signals={a.signals} reload={reload} />
      {a.unavailable.length > 0 && <p class="muted small">无法读取：{a.unavailable.join('；')}</p>}
    </div>
  )
}
