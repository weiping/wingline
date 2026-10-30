import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import type { StaleItem, TaskRow } from '@weiping/wingline-core'
import { api, notReady } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, postOf } from '../components/common.js'
import { STALE_REASON } from '../labels.js'
import { taskPath } from '../router.js'

const COLUMNS: Array<[TaskRow['status'], string]> = [
  ['ready', '就绪'],
  ['dispatched', '已派发'],
  ['blocked', '阻塞'],
  ['completed', '完成'],
  ['failed', '失败'],
]

function NotReadyBoard() {
  return (
    <div class="page">
      <header class="page-head">
        <h1>任务看板</h1>
      </header>
      <p class="banner" role="status">
        团队尚未启动，先点击『启动团队』
      </p>
    </div>
  )
}

function TaskCard({ t, team, stuck }: { t: TaskRow; team: string; stuck?: StaleItem['reason'] }) {
  return (
    <article class="card task">
      <Link href={taskPath(team, t.id)} class="task-title">
        {t.title}
      </Link>
      <p class="muted small">
        {t.id} · 主人 {t.claimedBy ? postOf(t.claimedBy) : '—'} · 第 {t.epoch} 轮
      </p>
      <div class="flags">
        {t.tags.map((g) => (
          <span key={g} class="chip">
            {g}
          </span>
        ))}
        {t.gateFailures > 0 && <Pill tone="bad">闸门失败 {t.gateFailures} 次</Pill>}
        {stuck && <Pill tone="warn">卡住：{STALE_REASON[stuck]}</Pill>}
      </div>
    </article>
  )
}

/** 筛选栏：标签 / 主人筛选、「只看卡住的」切换、新建任务。 */
function BoardFilters(p: {
  tag: string
  owner: string
  stuck: boolean
  setTag: (v: string) => void
  setOwner: (v: string) => void
  setStuck: (v: boolean) => void
  children?: ComponentChildren
}) {
  return (
    <div class="filters">
      <label class="field inline">
        <span>标签</span>
        <input value={p.tag} onInput={(e) => p.setTag((e.target as HTMLInputElement).value.trim())} />
      </label>
      <label class="field inline">
        <span>主人（岗位名）</span>
        <input value={p.owner} onInput={(e) => p.setOwner((e.target as HTMLInputElement).value.trim())} />
      </label>
      <label class="field inline check">
        <input type="checkbox" checked={p.stuck} onChange={(e) => p.setStuck((e.target as HTMLInputElement).checked)} />
        <span>只看卡住的</span>
      </label>
      {p.children}
    </div>
  )
}

/** 新建任务：标题必填，可带岗位与标签。 */
function CreateTaskDialog({ team, onDone }: { team: string; onDone: () => void }) {
  const enc = encodeURIComponent(team)
  return (
    <ActionDialog
      label="新建任务"
      title="新建任务"
      submitLabel="创建"
      fields={[
        { name: 'title', label: '标题', required: true },
        { name: 'post', label: '派给岗位（名字，如 builder，可留空）' },
        { name: 'tags', label: '标签（逗号分隔）' },
      ]}
      onSubmit={(v, rr) => {
        const tags = (v.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        return api.post(`/api/teams/${enc}/tasks`, {
          title: v.title,
          ...((v.post ?? '').trim() ? { post: (v.post ?? '').trim() } : {}),
          ...(tags.length > 0 ? { tags } : {}),
          ...(rr ? { retryRequest: rr } : {}),
        })
      }}
      onDone={onDone}
    />
  )
}

/** 「只看卡住的」列表。 */
function StuckSection({ team, tasks }: { team: string; tasks: StaleItem[] }) {
  return (
    <Section title="卡住的任务" count={tasks.length}>
      {tasks.map((s) => (
        <div class="row" key={`${s.taskId}:${s.reason}`}>
          <Link href={taskPath(team, s.taskId)}>{s.title}</Link> <Pill tone="warn">{STALE_REASON[s.reason]}</Pill>{' '}
          <span class="muted small">主人 {s.owner ?? '—'}</span>
        </div>
      ))}
    </Section>
  )
}

/** 分列看板主体。 */
function BoardColumns({ team, tasks, reasonOf }: { team: string; tasks: TaskRow[]; reasonOf: Map<string, StaleItem['reason']> }) {
  return (
    <div class="board">
      {COLUMNS.map(([status, label]) => {
        const items = tasks.filter((t) => t.status === status)
        return (
          <section class="col" key={status}>
            <h2>
              {label} <span class="count">{items.length}</span>
            </h2>
            {items.map((t) => (
              <TaskCard key={t.id} t={t} team={team} stuck={reasonOf.get(t.id)} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** 任务看板：按状态分列；按标签 / 主人筛选；“只看卡住的”切到 stale 列表。 */
export function TaskBoard({ team }: { team: string }) {
  const enc = encodeURIComponent(team)
  const [tag, setTag] = useState('')
  const [owner, setOwner] = useState('')
  const [stuck, setStuck] = useState(false)
  const board = useApi<{ tasks: TaskRow[] }>(stuck ? null : `/api/teams/${enc}/tasks`)
  // 分列卡片上的角标也要它，所以始终取；取不到时看板照常显示，只是没有角标
  const stale = useApi<{ tasks: StaleItem[] }>(`/api/teams/${enc}/tasks?stale=true`)
  useStreamListener({
    snapshot: () => {
      board.reload()
      stale.reload()
    },
  })
  const bar = (
    <BoardFilters tag={tag} owner={owner} stuck={stuck} setTag={setTag} setOwner={setOwner} setStuck={setStuck}>
      <CreateTaskDialog team={team} onDone={() => board.reload()} />
    </BoardFilters>
  )
  if (stuck) {
    if (stale.error) return notReady(stale.error) ? <NotReadyBoard /> : <ErrorBox error={stale.error} />
    if (!stale.data) return <Loading />
    return (
      <div class="page">
        <header class="page-head">
          <h1>任务看板</h1>
        </header>
        {bar}
        <StuckSection team={team} tasks={stale.data.tasks} />
      </div>
    )
  }
  if (notReady(board.error) || notReady(stale.error)) return <NotReadyBoard />
  if (board.error) return <ErrorBox error={board.error} />
  if (!board.data) return <Loading />
  const reasonOf = new Map<string, StaleItem['reason']>()
  for (const s of stale.data?.tasks ?? []) if (s.taskId && s.reason in STALE_REASON) reasonOf.set(s.taskId, s.reason)
  const visible = board.data.tasks.filter(
    (t) => (!tag || t.tags.includes(tag)) && (!owner || (t.claimedBy ?? '').startsWith(`${owner}@`)),
  )
  return (
    <div class="page">
      <header class="page-head">
        <h1>任务看板</h1>
      </header>
      {bar}
      <BoardColumns team={team} tasks={visible} reasonOf={reasonOf} />
    </div>
  )
}
