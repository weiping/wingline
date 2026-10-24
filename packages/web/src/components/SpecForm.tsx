import { useEffect, useState } from 'preact/hooks'

export type SpecPath = Array<string | number>
export interface FormError {
  path: SpecPath
  code: string
  message: string
  line: number | null
}

interface FormProps {
  /** YAML 解析后的原始对象（没填的字段不在里面）；前端不自己解析 YAML。 */
  parsed: any
  errors: FormError[]
  disabled: boolean
  /** 一处修改；value 为 null 表示删除该字段。 */
  onSet: (path: SpecPath, value: unknown) => void
}

const key = (p: SpecPath) => p.join('.')
const startsWith = (path: SpecPath, prefix: SpecPath) => prefix.every((k, i) => String(path[i]) === String(k))
const getIn = (obj: any, p: SpecPath): any => p.reduce((o, k) => (o == null ? undefined : o[k]), obj)

interface FieldBase {
  path: SpecPath
  label: string
  errors: FormError[]
  disabled: boolean
  onSet: FormProps['onSet']
  value: unknown
  placeholder?: string
  /** 必填字段清空时发空串（让校验给出“不能为空”），而不是删掉这个键：删键会连带重排 YAML，而且字段位置会变。 */
  required?: boolean
}

function Frame(p: FieldBase & { children: any; inline?: boolean }) {
  const err = p.errors.find((e) => startsWith(e.path, p.path))
  return (
    <div class={p.inline ? 'field check' : 'field'} data-field={key(p.path)}>
      <label>
        <span>{p.label}</span>
        {p.children}
      </label>
      {err && (
        <p class="error small" role="alert">
          {err.message}
        </p>
      )}
    </div>
  )
}

function TextField(p: FieldBase) {
  return (
    <Frame {...p}>
      <input
        data-path={key(p.path)}
        value={typeof p.value === 'string' ? p.value : ''}
        placeholder={p.placeholder}
        disabled={p.disabled}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value
          p.onSet(p.path, v === '' && !p.required ? null : v)
        }}
      />
    </Frame>
  )
}

function NumberField(p: FieldBase) {
  return (
    <Frame {...p}>
      <input
        type="number"
        data-path={key(p.path)}
        value={typeof p.value === 'number' ? p.value : ''}
        placeholder={p.placeholder}
        disabled={p.disabled}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value.trim()
          p.onSet(p.path, v === '' ? null : Number(v))
        }}
      />
    </Frame>
  )
}

function BoolField(p: FieldBase & { fallback: boolean }) {
  return (
    <Frame {...p} inline>
      <input
        type="checkbox"
        data-path={key(p.path)}
        checked={typeof p.value === 'boolean' ? p.value : p.fallback}
        disabled={p.disabled}
        onChange={(e) => p.onSet(p.path, (e.target as HTMLInputElement).checked)}
      />
    </Frame>
  )
}

const toList = (text: string): string[] => text.split(',').map((s) => s.trim()).filter(Boolean)

/** 逗号分隔的列表。输入框自己保存文本，否则敲到“a, ”时尾部的逗号会被现值吃掉。 */
function ListField(p: FieldBase) {
  const current = Array.isArray(p.value) ? (p.value as string[]) : []
  const [text, setText] = useState(current.join(', '))
  useEffect(() => {
    if (JSON.stringify(toList(text)) !== JSON.stringify(current)) setText(current.join(', '))
  }, [JSON.stringify(current)])
  return (
    <Frame {...p}>
      <input
        data-path={key(p.path)}
        value={text}
        placeholder={p.placeholder ?? '用逗号分隔'}
        disabled={p.disabled}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value
          setText(v)
          const list = toList(v)
          p.onSet(p.path, list.length === 0 ? null : list)
        }}
      />
    </Frame>
  )
}

const PATROL_NUMBERS: Array<[string, number]> = [
  ['no_progress_minutes', 20],
  ['prompt_minutes', 5],
  ['owner_idle_minutes', 30],
  ['post_failure_streak', 3],
]
const PATROL_FLAGS: Array<[string, boolean]> = [
  ['freeze_lead', false],
  ['auto_recover', false],
  ['worktree_comment', false],
  ['workspace_status', true],
  ['unread_mark', true],
]
const BUDGETS: Array<[string, number]> = [
  ['max_gate_failures', 3],
  ['gate_timeout_seconds', 600],
]

function PostFields({ i, post, c }: { i: number; post: any; c: Omit<FieldBase, 'path' | 'label' | 'value'> }) {
  const at = (name: string): SpecPath => ['posts', i, name]
  const f = (name: string) => ({ ...c, path: at(name), label: name, value: post?.[name] })
  return (
    <fieldset class="card">
      <legend>岗位 {String(post?.id ?? i)}</legend>
      <TextField {...f('id')} required />
      <TextField {...f('agent')} required />
      <TextField {...f('model')} />
      <TextField {...f('launch')} />
      <TextField {...f('environment')} placeholder="本机（或 Orca 里的已配对环境名，如 lima-agent）" />
      <TextField {...f('worktree')} placeholder="current" />
      <ListField {...f('brief')} />
      <ListField {...f('tags')} />
      <BoolField {...f('self_claim')} fallback={false} />
      <BoolField {...f('plan_first')} fallback={false} />
    </fieldset>
  )
}

function LinkFields({ ids, c, parsed }: { ids: string[]; c: Omit<FieldBase, 'path' | 'label' | 'value'>; parsed: any }) {
  return (
    <>
      {ids.map((id) => (
        <fieldset class="card" key={id}>
          <legend>{id} 的协作与闸门</legend>
          {['reviewed_by', 'hands_to', 'consults'].map((rel) => (
            <ListField key={rel} {...c} path={['links', id, rel]} label={`links.${rel}`} value={getIn(parsed, ['links', id, rel])} />
          ))}
          <TextField {...c} path={['gates', id]} label="gates（闸门命令）" value={getIn(parsed, ['gates', id])} />
        </fieldset>
      ))}
    </>
  )
}

/** 表单覆盖岗位、lead、links、gates、budgets.task 与 patrol；新增 / 删除岗位与 notify 请在 YAML 视图里改。 */
export function SpecForm({ parsed, errors, disabled, onSet }: FormProps) {
  const c = { errors, disabled, onSet }
  const posts: any[] = Array.isArray(parsed?.posts) ? parsed.posts : []
  const ids = posts.map((p) => String(p?.id ?? '')).filter(Boolean)
  return (
    <form class="spec-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset class="card">
        <legend>团队</legend>
        <TextField {...c} path={['lead']} label="lead（牵头岗）" value={parsed?.lead} required />
      </fieldset>
      {posts.map((p, i) => (
        <PostFields key={i} i={i} post={p} c={c} />
      ))}
      <LinkFields ids={ids} c={c} parsed={parsed} />
      <fieldset class="card">
        <legend>预算 budgets.task</legend>
        {BUDGETS.map(([name, def]) => (
          <NumberField key={name} {...c} path={['budgets', 'task', name]} label={name} value={getIn(parsed, ['budgets', 'task', name])} placeholder={String(def)} />
        ))}
        <NumberField {...c} path={['budgets', 'task', 'max_minutes']} label="max_minutes" value={getIn(parsed, ['budgets', 'task', 'max_minutes'])} />
      </fieldset>
      <fieldset class="card">
        <legend>巡查 patrol</legend>
        {PATROL_NUMBERS.map(([name, def]) => (
          <NumberField key={name} {...c} path={['patrol', name]} label={name} value={getIn(parsed, ['patrol', name])} placeholder={String(def)} />
        ))}
        {PATROL_FLAGS.map(([name, def]) => (
          <BoolField key={name} {...c} path={['patrol', name]} label={name} value={getIn(parsed, ['patrol', name])} fallback={def} />
        ))}
      </fieldset>
    </form>
  )
}

/** 哪些错误路径表单里有对应的字段（其余的错误由页面在顶部单独列出）。 */
export function formHasField(path: SpecPath, postIds: string[]): boolean {
  const [a, b, c] = path
  if (a === 'lead') return true
  if (a === 'posts') return typeof b === 'number' && ['id', 'agent', 'model', 'launch', 'environment', 'worktree', 'brief', 'tags', 'self_claim', 'plan_first'].includes(String(c))
  if (a === 'links' || a === 'gates') return path.length >= 2 && postIds.includes(String(b))
  if (a === 'budgets') return b === 'task' && path.length >= 3
  if (a === 'patrol') return path.length >= 2 && b !== 'notify'
  return false
}
