import { useEffect, useState } from 'preact/hooks'

export type SpecPath = Array<string | number>
export interface FormError {
  path: SpecPath
  code: string
  message: string
  line: number | null
}

/** 与后端 parseSet 一致的三形态：普通 set / 新增岗位 / 删除岗位。 */
export type SpecEditOp =
  | { path: SpecPath; value: unknown }
  | { op: 'add_post'; post: { id: string; agent: string; brief?: string[]; model?: string; launch?: string; worktree?: string } }
  | { op: 'remove_post'; index: number }

interface FormProps {
  /** YAML 解析后的原始对象（没填的字段不在里面）；前端不自己解析 YAML。 */
  parsed: any
  errors: FormError[]
  disabled: boolean
  /** 一处修改；value 为 null 表示删除该字段。 */
  onSet: (path: SpecPath, value: unknown) => void
  /** 规范 / 简报正文（相对路径 → 内容），由编辑页持有并随保存请求带回。 */
  files?: Record<string, string>
  onFiles?: (files: Record<string, string>) => void
  onOp?: (op: SpecEditOp) => void
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

/** 规范 / 简报的 Markdown 正文：绑 files[rel]，改动时把整份 files 交给上层。 */
function DocArea(p: {
  label: string
  aria: string
  rel: string
  text: string
  disabled: boolean
  files?: Record<string, string>
  onFiles?: FormProps['onFiles']
}) {
  return (
    <label class="field doc-field">
      <span>
        {p.label}（<code>{p.rel}</code>）
      </span>
      <textarea
        aria-label={p.aria}
        rows={5}
        spellcheck={false}
        value={p.text}
        disabled={p.disabled || !p.onFiles}
        onInput={(e) => p.onFiles?.({ ...(p.files ?? {}), [p.rel]: (e.target as HTMLTextAreaElement).value })}
      />
    </label>
  )
}

/** lead 下拉：选项是当前岗位 id；值不在岗位里（规格坏了）退化成文本输入。 */
function LeadField(p: { c: Omit<FieldBase, 'path' | 'label' | 'value'>; value: unknown; ids: string[] }) {
  const val = typeof p.value === 'string' ? p.value : ''
  if (val && !p.ids.includes(val)) return <TextField {...p.c} path={['lead']} label="lead（牵头岗）" value={p.value} required />
  return (
    <Frame {...p.c} path={['lead']} label="lead（牵头岗）" value={val} required>
      <select data-path="lead" value={val} disabled={p.c.disabled} onChange={(e) => p.c.onSet(['lead'], (e.target as HTMLSelectElement).value)}>
        {p.ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </Frame>
  )
}

interface Docs {
  files?: Record<string, string>
  onFiles?: FormProps['onFiles']
  onOp?: FormProps['onOp']
  canRemove: boolean
}

/** 岗位字段的中文标签（规范 3.4.5）；未知键退回键名本身。 */
const POST_LABEL: Record<string, string> = {
  id: '岗位标识 id',
  agent: '代理 agent',
  model: '模型 model',
  launch: '启动命令 launch',
  environment: '远端环境 environment',
  worktree: '工作区 worktree',
  brief: '简报文件 brief',
  tags: '标签 tags',
  self_claim: '自主认领 self_claim',
  plan_first: '先写计划 plan_first',
}

function PostFields({ i, post, c, docs }: { i: number; post: any; c: Omit<FieldBase, 'path' | 'label' | 'value'>; docs: Docs }) {
  const at = (name: string): SpecPath => ['posts', i, name]
  const f = (name: string) => ({ ...c, path: at(name), label: POST_LABEL[name] ?? name, value: post?.[name] })
  const id = String(post?.id ?? i)
  const briefRel = (Array.isArray(post?.brief) ? String(post.brief[0] ?? '') : '') || `briefs/${id}.md`
  const onBriefFiles = (next: Record<string, string>) => {
    // 该岗位还没有 brief 引用：先把 briefs/<id>.md 写进规格，再收正文
    if (!(Array.isArray(post?.brief) && post.brief[0])) docs.onOp?.({ path: at('brief'), value: [briefRel] })
    docs.onFiles?.(next)
  }
  return (
    <fieldset class="card">
      <legend>岗位 {id}</legend>
      <div class="post-head">
        <button type="button" class="btn danger small" disabled={c.disabled || !docs.onOp || !docs.canRemove} onClick={() => docs.onOp?.({ op: 'remove_post', index: i })}>
          删除岗位
        </button>
      </div>
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
      <DocArea label="岗位职责简报正文" aria={`岗位职责简报正文（${id}）`} rel={briefRel} text={docs.files?.[briefRel] ?? ''} disabled={c.disabled} files={docs.files} onFiles={onBriefFiles} />
    </fieldset>
  )
}

const POST_PRESETS = {
  builder: { label: '实现岗', agent: 'claude', duties: ['按任务简报完成实现与自测', '提交前验证改动可运行', '遇到阻塞及时向牵头岗汇报'] },
  checker: { label: '审查岗', agent: 'codex', duties: ['复核其他岗位的产出', '指出问题并给出可执行的修改建议'] },
  planner: { label: '规划岗', agent: 'claude', duties: ['把团队目标拆解成任务简报', '跟踪进度，必要时调整计划'] },
  custom: { label: '自定义', agent: '', duties: ['（在此填写该岗位的职责）'] },
} as const
type PresetKey = keyof typeof POST_PRESETS

/** 弹窗字段：角色预设（自定义时露出代理输入）+ 岗位标识。 */
function AddPostFields(p: {
  preset: PresetKey
  id: string
  agent: string
  setPreset: (k: PresetKey) => void
  setId: (v: string) => void
  setAgent: (v: string) => void
}) {
  return (
    <>
      <label class="field">
        <span>角色预设</span>
        <select aria-label="角色预设" value={p.preset} onChange={(e) => p.setPreset((e.target as HTMLSelectElement).value as PresetKey)}>
          {(Object.keys(POST_PRESETS) as PresetKey[]).map((k) => (
            <option key={k} value={k}>
              {POST_PRESETS[k].label}
            </option>
          ))}
        </select>
      </label>
      {p.preset === 'custom' && (
        <label class="field">
          <span>代理 agent</span>
          <input aria-label="代理 agent" placeholder="如 claude、codex" value={p.agent} onInput={(e) => p.setAgent((e.target as HTMLInputElement).value)} />
        </label>
      )}
      <label class="field">
        <span>岗位标识</span>
        <input aria-label="岗位标识" placeholder="小写字母、数字、连字符" value={p.id} onInput={(e) => p.setId((e.target as HTMLInputElement).value)} />
      </label>
    </>
  )
}

/** 新增岗位弹窗：选角色预设 + 填岗位标识（自定义时再填代理）；预设不带 model（部分代理后端不接受，留给岗位卡里补）。 */
function AddPostDialog(props: { onAdd: (post: { id: string; agent: string; worktree: string; brief: string[] }, briefText: string) => void; onClose: () => void }) {
  const [preset, setPreset] = useState<PresetKey>('builder')
  const [id, setId] = useState('')
  const [agent, setAgent] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = () => {
    const pid = id.trim()
    const ag = preset === 'custom' ? agent.trim() : POST_PRESETS[preset].agent
    if (!pid || !ag) {
      setErr('请填写岗位标识与代理 agent')
      return
    }
    const p = POST_PRESETS[preset]
    props.onAdd({ id: pid, agent: ag, worktree: 'current', brief: [`briefs/${pid}.md`] }, `# ${pid}（${p.label}）\n\n职责：\n${p.duties.map((d) => `- ${d}`).join('\n')}\n`)
  }
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="新增角色岗位">
        <h3>新增角色岗位</h3>
        <AddPostFields preset={preset} id={id} agent={agent} setPreset={setPreset} setId={setId} setAgent={setAgent} />
        {err && (
          <p class="error" role="alert">
            {err}
          </p>
        )}
        <div class="dialog-actions">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            取消
          </button>
          <button type="button" class="btn" onClick={submit}>
            新增
          </button>
        </div>
      </div>
    </div>
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

/** 表单覆盖岗位、lead、links、gates、budgets.task 与 patrol；岗位增删与规范 / 简报正文由上层通过 onOp / onFiles 接管。 */
export function SpecForm(p: FormProps) {
  const c = { errors: p.errors, disabled: p.disabled, onSet: p.onSet }
  const posts: any[] = Array.isArray(p.parsed?.posts) ? p.parsed.posts : []
  const ids = posts.map((x) => String(x?.id ?? '')).filter(Boolean)
  const docs: Docs = { files: p.files, onFiles: p.onFiles, onOp: p.onOp, canRemove: posts.length > 1 }
  const normsRel = typeof p.parsed?.norms === 'string' ? p.parsed.norms : 'NORMS.md'
  const [adding, setAdding] = useState(false)
  const addPost = (post: { id: string; agent: string; worktree: string; brief: string[] }, briefText: string) => {
    p.onOp?.({ op: 'add_post', post })
    p.onFiles?.({ ...(p.files ?? {}), [post.brief[0]!]: briefText })
    setAdding(false)
  }
  return (
    <form class="spec-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset class="card">
        <legend>团队</legend>
        <LeadField c={c} value={p.parsed?.lead} ids={ids} />
        <DocArea label="团队规范正文" aria="团队规范正文" rel={normsRel} text={p.files?.[normsRel] ?? ''} disabled={p.disabled} files={p.files} onFiles={p.onFiles} />
      </fieldset>
      {posts.map((x, i) => (
        <PostFields key={String(x?.id ?? i)} i={i} post={x} c={c} docs={docs} />
      ))}
      {p.onOp && (
        <button type="button" class="btn ghost" disabled={p.disabled} onClick={() => setAdding(true)}>
          新增角色岗位
        </button>
      )}
      {adding && <AddPostDialog onAdd={addPost} onClose={() => setAdding(false)} />}
      <LinkFields ids={ids} c={c} parsed={p.parsed} />
      <fieldset class="card">
        <legend>预算 budgets.task</legend>
        {BUDGETS.map(([name, def]) => (
          <NumberField key={name} {...c} path={['budgets', 'task', name]} label={name} value={getIn(p.parsed, ['budgets', 'task', name])} placeholder={String(def)} />
        ))}
        <NumberField {...c} path={['budgets', 'task', 'max_minutes']} label="max_minutes" value={getIn(p.parsed, ['budgets', 'task', 'max_minutes'])} />
      </fieldset>
      <fieldset class="card">
        <legend>巡查 patrol</legend>
        {PATROL_NUMBERS.map(([name, def]) => (
          <NumberField key={name} {...c} path={['patrol', name]} label={name} value={getIn(p.parsed, ['patrol', name])} placeholder={String(def)} />
        ))}
        {PATROL_FLAGS.map(([name, def]) => (
          <BoolField key={name} {...c} path={['patrol', name]} label={name} value={getIn(p.parsed, ['patrol', name])} fallback={def} />
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
