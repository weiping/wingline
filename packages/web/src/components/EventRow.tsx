import type { TimelineEvent } from '@wingline/core'
import { postPath, taskPath } from '../router.js'
import { Link } from './Link.js'
import { SOURCE_LABEL, clock, postOf } from './common.js'

/** 时间线的一行：时间、来源、执行者、动作、目标（任务与岗位可点）、结果；detail 折叠显示。 */
export function EventRow({ event, team }: { event: TimelineEvent; team: string }) {
  const task = event.target?.match(/^(.+)#\d+$/)?.[1] ?? null
  const post = !task && event.target?.includes('@') ? postOf(event.target) : null
  const actorPost = event.actor.includes('@') ? postOf(event.actor) : null
  return (
    <li class={`event event-${event.source}`}>
      <time>{clock(event.at)}</time>
      <span class="tag">{SOURCE_LABEL[event.source]}</span>
      <span class="actor">{event.actor}</span>
      <span class="action">{event.action}</span>
      <span class="target">
        {task ? <Link href={taskPath(team, task)}>{task}</Link> : post ? <Link href={postPath(team, post)}>{event.target}</Link> : event.target}
      </span>
      {event.outcome && <span class="outcome">{event.outcome}</span>}
      {actorPost && <Link href={postPath(team, actorPost)} class="muted small">岗位</Link>}
      {event.detail !== null && event.detail !== undefined && (
        <details>
          <summary>详情</summary>
          <pre>{JSON.stringify(event.detail, null, 2)}</pre>
        </details>
      )}
    </li>
  )
}
