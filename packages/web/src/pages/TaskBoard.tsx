import { useState } from 'preact/hooks'
import type { StaleItem, TaskRow } from '@weiping/wingline-core'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { useStreamListener } from '../stream.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { Link } from '../components/Link.js'
import { ErrorBox, Loading, Pill, Section, postOf } from '../components/common.js'
import { taskPath } from '../router.js'

const COLUMNS: Array<[TaskRow['status'], string]> = [
  ['ready', '就绪'],
  ['dispatched', '已派发'],
  ['blocked', '阻塞'],
  ['completed', '完成'],
  ['failed', '失败'],
]

const REASON_NOTE: Record<StaleItem['reason'], string> = {
  done_unfinished: '已完成但未收尾',
  call_uncertain: '调用结果不确定',
  dead_assignee: '派发失主',
  owner_idle: '主人迟迟未开始',
  bypassed: '绕过闸门上报',
  blocked_waiting: '等待决策',
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
        {stuck && <Pill tone="warn">卡住：{REASON_NOTE[stuck]}</Pill>}
      </div>
    </article>
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

  const create = (
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
      onDone={() => board.reload()}
    />
  )
  const bar = (
    <div class="filters">
      <label class="field inline">
        <span>标签</span>
        <input value={tag} onInput={(e) => setTag((e.target as HTMLInputElement).value.trim())} />
      </label>
      <label class="field inline">
        <span>主人（岗位名）</span>
        <input value={owner} onInput={(e) => setOwner((e.target as HTMLInputElement).value.trim())} />
      </label>
      <label class="field inline check">
        <input type="checkbox" checked={stuck} onChange={(e) => setStuck((e.target as HTMLInputElement).checked)} />
        <span>只看卡住的</span>
      </label>
      {create}
    </div>
  )

  if (stuck) {
    if (stale.error) return <ErrorBox error={stale.error} />
    if (!stale.data) return <Loading />
    return (
      <div class="page">
        <header class="page-head">
          <h1>任务看板</h1>
        </header>
        {bar}
        <Section title="卡住的任务" count={stale.data.tasks.length}>
          {stale.data.tasks.map((s) => (
            <div class="row" key={`${s.taskId}:${s.reason}`}>
              <Link href={taskPath(team, s.taskId)}>{s.title}</Link> <Pill tone="warn">{REASON_NOTE[s.reason]}</Pill>{' '}
              <span class="muted small">主人 {s.owner ?? '—'}</span>
            </div>
          ))}
        </Section>
      </div>
    )
  }

  if (board.error) return <ErrorBox error={board.error} />
  if (!board.data) return <Loading />
  const reasonOf = new Map<string, StaleItem['reason']>()
  for (const s of stale.data?.tasks ?? []) if (s.taskId && s.reason in REASON_NOTE) reasonOf.set(s.taskId, s.reason)
  const visible = board.data.tasks.filter(
    (t) => (!tag || t.tags.includes(tag)) && (!owner || (t.claimedBy ?? '').startsWith(`${owner}@`)),
  )
  return (
    <div class="page">
      <header class="page-head">
        <h1>任务看板</h1>
      </header>
      {bar}
      <div class="board">
        {COLUMNS.map(([status, label]) => {
          const items = visible.filter((t) => t.status === status)
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
    </div>
  )
}
