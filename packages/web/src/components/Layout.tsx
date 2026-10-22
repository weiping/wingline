import type { ComponentChildren } from 'preact'
import { navigate, teamPath } from '../router.js'
import { useStream } from '../stream.js'
import { Link } from './Link.js'
import { Pill } from './common.js'

export interface NavTarget {
  label: string
  sub: string
}
export const NAV: NavTarget[] = [
  { label: '总览', sub: '' },
  { label: '收件箱', sub: '/inbox' },
  { label: '任务看板', sub: '/tasks' },
  { label: '时间线', sub: '/log' },
  { label: '编辑', sub: '/edit' },
]

const STATE_TEXT = { live: ['实时', 'ok'], reconnecting: ['重连中', 'warn'], closed: ['已断开', 'bad'] } as const

/** 外框：左侧团队切换与导航，顶部连接状态与待办角标。团队页才会在 StreamProvider 内渲染顶栏。 */
export function Layout(props: { teams: string[]; team: string | null; children: ComponentChildren }) {
  return (
    <div class="shell">
      <aside class="side">
        <div class="brand">雁阵</div>
        {props.teams.length > 0 ? (
          <select
            class="team-switch"
            aria-label="团队"
            value={props.team ?? ''}
            onChange={(e) => navigate(teamPath((e.target as HTMLSelectElement).value))}
          >
            {!props.team && <option value="" />}
            {props.teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <p class="muted small">还没有团队</p>
        )}
        {props.team && (
          <nav>
            {NAV.map((n) => (
              <Link key={n.sub} href={teamPath(props.team!, n.sub)} class="nav-link">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <nav class="side-foot">
          <Link href="/settings" class="nav-link">
            关于
          </Link>
        </nav>
      </aside>
      <div class="main">{props.children}</div>
    </div>
  )
}

/** 连接断开时在页面顶部给出可操作的提示（重连中 / 会话过期）。 */
export function StreamBanner() {
  const { state } = useStream()
  if (state === 'live') return null
  return (
    <p class={state === 'closed' ? 'banner error' : 'banner'} role="status">
      {state === 'closed' ? '会话已过期，请运行 wl console --link 获取新链接' : '与服务的连接中断，重连中…'}
    </p>
  )
}

/** 顶栏：连接状态 + 待办数（来自 snapshot 的 attentionCounts）。必须在 StreamProvider 内。 */
export function TopBar() {
  const { state, snapshot } = useStream()
  const [label, tone] = STATE_TEXT[state]
  const c = snapshot?.attentionCounts
  const pending = c ? c.frozen + c.signals + c.questions + c.stale + (c.warnings ?? 0) : 0
  return (
    <header class="topbar">
      <Pill tone={tone}>{label}</Pill>
      <span class="badge" aria-label="待办">
        待办 {pending}
      </span>
      {snapshot && <span class="muted small">调度员：{snapshot.dispatcher}</span>}
    </header>
  )
}
