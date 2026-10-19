import type { PsRow } from '@wingline/core'
import { api } from '../api.js'
import { postPath } from '../router.js'
import { ActionDialog } from './ActionDialog.js'
import { Link } from './Link.js'
import { Pill, postOf } from './common.js'

const STATUS = { live: ['在线', 'ok'], offline: ['离线', 'bad'], uncertain: ['不确定', 'warn'] } as const

export interface PostCardProps {
  post: PsRow
  team: string
  frozen: boolean
  signal?: number
  onChanged: () => void
}

/** 总览里的岗位卡：状态、冻结 / 巡查标记，以及“发消息”。 */
export function PostCard({ post, team, frozen, signal, onChanged }: PostCardProps) {
  const name = postOf(post.address)
  const [label, tone] = STATUS[post.status]
  return (
    <article class="card post">
      <header>
        <Link href={postPath(team, name)} class="post-name">
          {name}
        </Link>
        {post.isLead && <Pill tone="neutral">牵头</Pill>}
      </header>
      <p class="muted small">
        {post.agent} · <Pill tone={tone}>{label}</Pill>
      </p>
      <div class="flags">
        {frozen && <Pill tone="bad">已冻结</Pill>}
        {signal !== undefined && <Pill tone="warn">巡查 L{signal}</Pill>}
      </div>
      <div class="actions">
        <ActionDialog
          label="发消息"
          title={`发给 ${name}`}
          submitLabel="发送"
          fields={[{ name: 'message', label: '消息', kind: 'textarea', required: true }]}
          onSubmit={(v, retryRequest) =>
            api.post(`/api/teams/${encodeURIComponent(team)}/send`, { post: name, message: v.message, ...(retryRequest ? { retryRequest } : {}) })
          }
          onDone={onChanged}
        />
      </div>
    </article>
  )
}
