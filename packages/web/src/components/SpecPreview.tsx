import type { SpecPlan } from '@weiping/wingline-core'
import { CommandHint } from './CommandHint.js'
import { Pill } from './common.js'

const KIND: Record<SpecPlan['posts'][number]['kind'], [string, 'ok' | 'warn' | 'bad' | 'neutral', string]> = {
  added: ['新增', 'ok', '新增岗位：wl up 会新开终端并发送启动包。'],
  kept: ['不变', 'neutral', '配置没变。'],
  launch_changed: ['启动变化', 'warn', '启动参数有变化：岗位终端还在时 wl up 会保持原终端，新的启动参数要等终端重建后才生效。'],
  removed: ['删除', 'bad', '岗位被删除：wl up 不会关闭它的终端，该终端将不再归雁阵管理，请先关闭它。'],
  brief_changed: ['简报变化', 'neutral', '简报路径变化，只影响之后新开的会话。'],
}

const show = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

/** “改完会发生什么”：岗位去向、字段差异、要执行的命令。纯展示。 */
export function SpecPreview({ preview, team }: { preview: SpecPlan; team: string }) {
  return (
    <section class="card" data-testid="preview">
      <h2>预演</h2>
      <ul class="preview-posts">
        {preview.posts.map((p) => {
          const [label, tone, text] = KIND[p.kind]
          return (
            <li key={p.id}>
              <strong>{p.id}</strong> <Pill tone={tone}>{label}</Pill>{' '}
              <span class="muted small">
                {text}
                {p.fields?.length ? `（${p.fields.join('、')}）` : ''}
              </span>
            </li>
          )
        })}
      </ul>
      {preview.fields.length > 0 && (
        <ul class="preview-fields">
          {preview.fields.map((f) => (
            <li key={f.path}>
              <code>{f.path}</code> <span>{`${show(f.before)} → ${show(f.after)}`}</span>
            </li>
          ))}
        </ul>
      )}
      <p class="muted small">保存后在终端依次执行：</p>
      {preview.commands.map((c) => (
        <CommandHint key={c} command={c} />
      ))}
      {preview.closeSuggested && (
        <p class="muted small">
          有岗位的启动参数变化或被删除，需要立即生效或释放旧终端时可改用 <code>{`wl down ${team} --close`}</code>。
        </p>
      )}
    </section>
  )
}
