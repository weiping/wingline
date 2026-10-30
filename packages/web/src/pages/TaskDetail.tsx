import { useState } from 'preact/hooks'
import type { DoneResult, PsRow, ShownTask } from '@weiping/wingline-core'
import { api, notReady } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { ActionButton, DirectAction, useAction } from '../components/TeamActions.js'
import { CommandHint } from '../components/CommandHint.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, clock, postOf } from '../components/common.js'
import { taskPath } from '../router.js'

const TERMINAL = new Set(['completed', 'failed'])

/** 事实区：状态相关的只读字段。 */
function TaskFacts({ t, team }: { t: ShownTask; team: string }) {
  return (
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
  )
}

/** 管理员操作：转人工处理 / 改派主人 / 恢复派发；终态任务给「重开并转人工」。 */
function AdminActions({ team, id, t, reload }: { team: string; id: string; t: ShownTask; reload: () => void }) {
  const base = `/api/teams/${encodeURIComponent(team)}/tasks/${encodeURIComponent(id)}`
  const open = !TERMINAL.has(t.status)
  return (
    <>
      {open ? (
        <ActionDialog
          label="转人工处理"
          title="转人工处理"
          danger
          fields={[{ name: 'reason', label: '理由', kind: 'textarea', required: true }]}
          onSubmit={(v, rr) => api.post(`${base}/escalate`, { reason: v.reason, ...(rr ? { retryRequest: rr } : {}) })}
          onDone={reload}
        />
      ) : (
        <ActionDialog
          label="重开并转人工"
          title="重开并转人工"
          danger
          fields={[{ name: 'reason', label: '理由', kind: 'textarea', required: true }]}
          onSubmit={(v, rr) => api.post(`${base}/escalate`, { reason: v.reason, reopen: true, ...(rr ? { retryRequest: rr } : {}) })}
          onDone={reload}
        />
      )}
      {open && (
        <ActionDialog
          label="改派主人"
          title="改派主人"
          fields={[{ name: 'to', label: '新主人（岗位名）', required: true }]}
          onSubmit={(v, rr) => api.post(`${base}/reassign`, { to: v.to, ...(rr ? { retryRequest: rr } : {}) })}
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
    </>
  )
}

/** 阻塞任务的处理闸门；没有 gateId 时只给终端命令提示。 */
function GateAction({ team, t, reload }: { team: string; t: ShownTask; reload: () => void }) {
  if (t.status !== 'blocked') return null
  if (!t.gateId) return <CommandHint note="可在终端运行：" command={`wl task resolve <gate-id> --resolution "…"`} />
  return (
    <ActionDialog
      label="处理闸门"
      title="处理闸门"
      fields={[
        { name: 'resolution', label: '处理说明', kind: 'textarea', required: true },
        { name: 'reassign', label: '改派新主人（岗位名，可选）' },
      ]}
      onSubmit={(v, rr) =>
        api.post(`/api/teams/${encodeURIComponent(team)}/gates/${encodeURIComponent(t.gateId!)}/resolve`, {
          resolution: v.resolution,
          ...(v.reassign?.trim() ? { reassign: v.reassign.trim() } : {}),
          ...(rr ? { retryRequest: rr } : {}),
        })
      }
      onDone={reload}
    />
  )
}

/** 默认执行者：任务主人（须在岗位列表里），否则牵头岗；都没有 → 不渲染卡片。 */
function defaultActor(t: ShownTask, posts: PsRow[]): string | null {
  if (t.claimedBy && posts.some((p) => p.address === t.claimedBy)) return t.claimedBy
  return posts.find((p) => p.isLead)?.address ?? null
}

const postLabel = (p: PsRow): string => `${postOf(p.address)}${p.isLead ? '（牵头岗）' : ''}`

/** 「完成并校验」需要 done 的返回值（DirectAction 拿不到）；闸门失败/转人工时提示输出位置。 */
function DoneButton({ base, as, reload }: { base: string; as: string; reload: () => void }) {
  const act = useAction(reload)
  const [failed, setFailed] = useState<DoneResult | null>(null)
  const send = (rr?: string) =>
    act.run(async () => {
      setFailed(null) // 先清上一轮的闸门失败横幅，新一轮结果不该残留旧提示
      const res = await api.post<DoneResult>(`${base}/done`, { as, ...(rr ? { retryRequest: rr } : {}) })
      if (res.outcome === 'gate_failed' || res.outcome === 'escalated') setFailed(res)
    })
  return (
    <>
      <ActionButton label="完成并校验" busy={act.busy} error={act.error} retry={act.retry} onSend={() => void send()} />
      {failed && (
        <p class="banner" role="status">
          {failed.outcome === 'escalated' ? '闸门连续失败，已转人工处理' : '闸门未通过'}
          {failed.gateOutputPath && <>，输出见 <code>{failed.gateOutputPath}</code></>}
        </p>
      )}
    </>
  )
}

/** 以岗位身份执行：选岗位后代岗位调任务执行流；命令对照随所选岗位动态变化。 */
function ExecuteAsCard({ team, t, posts, reload }: { team: string; t: ShownTask; posts: PsRow[]; reload: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const def = defaultActor(t, posts)
  if (def === null) return null
  const as = pick ?? def
  const base = `/api/teams/${encodeURIComponent(team)}/tasks/${encodeURIComponent(t.id)}`
  return (
    <section class="card">
      <h2>以岗位身份执行</h2>
      <label class="field inline">
        <span>岗位</span>
        <select value={as} onChange={(e) => setPick((e.target as HTMLSelectElement).value)}>
          {posts.map((p) => (
            <option key={p.address} value={p.address}>
              {postLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <div class="actions">
        <DirectAction label="认领任务" path={`${base}/claim`} body={() => ({ as })} onDone={reload} />
        <DirectAction label="放弃认领" path={`${base}/release`} body={() => ({ as })} onDone={reload} />
        <ActionDialog
          label="记录计划"
          title="记录计划"
          fields={[{ name: 'text', label: '计划内容', kind: 'textarea', required: true }]}
          onSubmit={(v, rr) => api.post(`${base}/plan`, { as, text: v.text, ...(rr ? { retryRequest: rr } : {}) })}
          onDone={reload}
        />
        <DirectAction label="开始任务" path={`${base}/start`} body={() => ({ as })} onDone={reload} />
        <DoneButton base={base} as={as} reload={reload} />
      </div>
      <CommandHint note="命令对照：" command={`wl task <claim|release|plan|start|done> ${t.id} --as ${as}`} />
    </section>
  )
}

/** 结果区：判定、上报人与输出。 */
function TaskOutcome({ t }: { t: ShownTask }) {
  if (!t.result && !t.outcome) return null
  return (
    <Section title="结果">
      <p>
        {t.outcome ?? '—'}
        {t.reportedBy && <span class="muted small"> · 上报人 {t.reportedBy}</span>}
      </p>
      {t.result && <pre class="term">{t.result}</pre>}
    </Section>
  )
}

function TaskHistory({ t }: { t: ShownTask }) {
  return (
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
  )
}

/** 任务详情：状态与主人、计划、父任务、闸门失败次数、结果、变迁历史；管理员与代岗位执行两类操作。 */
export function TaskDetail({ team, id }: { team: string; id: string }) {
  const enc = encodeURIComponent(team)
  const base = `/api/teams/${enc}/tasks/${encodeURIComponent(id)}`
  const task = useApi<ShownTask>(base)
  const view = useApi<{ posts: PsRow[] }>(`/api/teams/${enc}`)
  useStreamListener({ snapshot: () => task.reload() })
  const reload = () => task.reload()
  if (task.error) {
    if (notReady(task.error))
      return (
        <div class="page">
          <header class="page-head">
            <h1>任务详情</h1>
          </header>
          <p class="banner" role="status">
            团队尚未启动，先点击『启动团队』
          </p>
        </div>
      )
    return <ErrorBox error={task.error} />
  }
  if (!task.data) return <Loading />
  const t = task.data
  const tone = t.status === 'completed' ? 'ok' : t.status === 'failed' || t.status === 'blocked' ? 'bad' : 'neutral'
  return (
    <div class="page">
      <header class="page-head">
        <h1>{t.title}</h1>
        <Pill tone={tone}>{t.status}</Pill>
      </header>
      <TaskFacts t={t} team={team} />
      <div class="actions">
        <AdminActions team={team} id={id} t={t} reload={reload} />
        <GateAction team={team} t={t} reload={reload} />
      </div>
      {!TERMINAL.has(t.status) && <ExecuteAsCard team={team} t={t} posts={view.data?.posts ?? []} reload={reload} />}
      {t.plan && (
        <Section title="计划">
          <pre class="term">{t.plan}</pre>
        </Section>
      )}
      <TaskOutcome t={t} />
      <TaskHistory t={t} />
    </div>
  )
}
