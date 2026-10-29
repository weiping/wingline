import type { SpecPlan } from '@weiping/wingline-core'
import { useEffect, useRef, useState } from 'preact/hooks'
import { ApiError, api, errorText } from '../api.js'
import { useApi } from '../hooks.js'
import { navigate } from '../router.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { SpecForm, formHasField, type FormError, type SpecEditOp, type SpecPath } from '../components/SpecForm.js'
import { SpecPreview } from '../components/SpecPreview.js'
import { ErrorBox, Loading } from '../components/common.js'

interface SpecForEdit {
  specPath: string
  yaml: string
  parsed: any
  hash: string | null
  draft: { yaml: string; parsed: any; hash: string | null } | null
  running: boolean
  files: Record<string, string>
}
interface ValidateResult {
  yaml: string
  parsed: any
  errors: FormError[]
  preview: SpecPlan | null
}
interface SaveResult {
  wrote: 'draft' | 'spec'
  path: string
  hash: string
  docsUpdated?: string[]
}
/** 当前展示给用户看的编辑结果：服务端最近一次返回的内容，加上本地还没确认的输入。 */
interface Shown {
  yaml: string
  parsed: any
  errors: FormError[]
  preview: SpecPlan | null
  problem: string | null
}
/** 保存时要带的基准：加载（或上次保存）时写入目标文件的哈希。 */
interface Base {
  hash: string | null
  draftHash: string | null
  hasDraft: boolean
}

const DEBOUNCE_MS = 400

/** 本地先把一处修改套到表单现值上，输入框不必等服务端；服务端返回后用它的 parsed 覆盖。 */
function setLocal(parsed: any, path: SpecPath, value: unknown): any {
  const out = JSON.parse(JSON.stringify(parsed ?? {}))
  let cur = out
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!
    cur[k] ??= typeof path[i + 1] === 'number' ? [] : {}
    cur = cur[k]
  }
  const last = path[path.length - 1]!
  if (value === null) delete cur[last]
  else cur[last] = value
  return out
}

/** 岗位增删的本地乐观更新：add_post 追加、remove_post 删除；普通 set 仍走 setLocal。 */
function applyLocal(parsed: any, op: SpecEditOp): any {
  if ('path' in op) return setLocal(parsed, op.path, op.value)
  const out = JSON.parse(JSON.stringify(parsed ?? {}))
  if (op.op === 'add_post') (out.posts ??= []).push(op.post)
  else out.posts?.splice(op.index, 1)
  return out
}

/** 只把规格当前引用的文档放进保存请求：后端会拒绝未引用的文件（删除岗位后，它的简报就不再落盘）。 */
function pickReferenced(parsed: any, files: Record<string, string>): Record<string, string> {
  const rels = new Set<string>()
  if (typeof parsed?.norms === 'string') rels.add(parsed.norms)
  for (const post of Array.isArray(parsed?.posts) ? parsed.posts : []) {
    for (const b of Array.isArray(post?.brief) ? post.brief : []) if (typeof b === 'string') rels.add(b)
  }
  return Object.fromEntries(Object.entries(files).filter(([rel]) => rels.has(rel)))
}

/** 把排队的表单修改依次交给服务端套用（每次基于上一次返回的 yaml）；没有排队的修改就只校验当前文本。 */
async function validateQueued(
  post: (body: object) => Promise<ValidateResult>, latest: { current: string }, sets: SpecEditOp[], adopt: () => boolean,
): Promise<ValidateResult> {
  if (sets.length === 0) return post({ yaml: latest.current })
  let res!: ValidateResult
  for (const set of sets) {
    res = await post({ yaml: latest.current, set })
    // 请求在途时用户在 YAML 视图里改了文本：服务端这份是旧的，不能覆盖用户刚敲的内容，剩下的修改也作废
    if (!adopt()) return res
    latest.current = res.yaml
  }
  return res
}

/** 表单输入入口：把一处修改排队并乐观套到本地 parsed 上（普通 set 与岗位增删共用）。 */
function editInputs(p: { pending: { current: SpecEditOp[] }; setShown: (f: (s: Shown) => Shown) => void; edited: () => void }) {
  const queue = (op: SpecEditOp, local: (parsed: any) => any) => {
    p.pending.current.push(op)
    p.setShown((s) => ({ ...s, parsed: local(s.parsed) }))
    p.edited()
  }
  return {
    onSet: (path: SpecPath, value: unknown) => queue({ path, value }, (x) => setLocal(x, path, value)),
    onOp: (op: SpecEditOp) => queue(op, (x) => applyLocal(x, op)),
  }
}

/** 防抖校验：表单与 YAML 两个视图共用一份编辑状态；停顿 400 毫秒后才请求，多次修改按顺序合并。 */
function useValidation(team: string, start: { yaml: string; parsed: any }, files: Record<string, string>) {
  const [shown, setShown] = useState<Shown>({ yaml: start.yaml, parsed: start.parsed, errors: [], preview: null, problem: null })
  const [dirty, setDirty] = useState(false)
  const latest = useRef(start.yaml)
  const lastGood = useRef<any>(start.parsed)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const pending = useRef<SpecEditOp[]>([])
  const version = useRef(0)
  const typed = useRef(0) // YAML 视图里手敲的次数
  const chain = useRef<Promise<void>>(Promise.resolve())
  const filesRef = useRef(files)
  filesRef.current = files // 防抖里的旧闭包也能拿到最新正文（virtualFiles）
  if (shown.parsed !== null) lastGood.current = shown.parsed
  const post = (body: object) => api.post<ValidateResult>(`/api/teams/${encodeURIComponent(team)}/spec/validate`, { ...body, files: filesRef.current })
  const run = async () => {
    const startVersion = version.current
    const startTyped = typed.current
    try {
      const res = await validateQueued(post, latest, pending.current.splice(0), () => typed.current === startTyped)
      if (version.current === startVersion) setShown({ yaml: res.yaml, parsed: res.parsed, errors: res.errors, preview: res.preview, problem: null })
    } catch (err) {
      setShown((s) => ({ ...s, problem: errorText(err) }))
    }
    if (version.current === startVersion) setDirty(false)
  }
  const flushNow = () => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(run)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const edited = () => {
    version.current += 1
    setDirty(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(flushNow, DEBOUNCE_MS)
  }
  const onYaml = (text: string) => {
    latest.current = text
    pending.current = []
    typed.current += 1
    setShown((s) => ({ ...s, yaml: text }))
    edited()
  }
  const setErrors = (errors: FormError[]) => setShown((s) => ({ ...s, errors }))
  return { shown, formParsed: shown.parsed ?? lastGood.current, dirty, latest, onYaml, flushNow, setErrors, ...editInputs({ pending, setShown, edited }) }
}

interface SavePanelProps {
  team: string
  spec: SpecForEdit
  base: Base
  setBase: (f: (b: Base) => Base) => void
  yaml: { current: string }
  /** 保存时要随请求带回的文档正文（已按规格引用过滤）。 */
  files: () => Record<string, string>
  blocked: boolean
  setErrors: (e: FormError[]) => void
  reload: () => void
}

/** 保存（可带后续动作：保存并启动 / 保存后重启应用）；任一步失败都停在错误提示。 */
function useSave(p: SavePanelProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SaveResult | null>(null)
  const [fail, setFail] = useState<{ text: string; conflict: boolean } | null>(null)
  const run = async (after?: () => Promise<void>) => {
    setSaving(true)
    setFail(null)
    try {
      const body = { yaml: p.yaml.current, running: p.spec.running, baseHash: p.spec.running ? p.base.draftHash : p.base.hash, files: p.files() }
      const res = await api.post<SaveResult>(`/api/teams/${encodeURIComponent(p.team)}/spec`, body)
      p.setBase((b) => (res.wrote === 'draft' ? { ...b, draftHash: res.hash, hasDraft: true } : { ...b, hash: res.hash }))
      setSaved(res)
      if (after) await after()
    } catch (err) {
      if (err instanceof ApiError && err.detail?.errors) p.setErrors(err.detail.errors)
      setFail({ text: errorText(err), conflict: err instanceof ApiError && err.code === 'spec_conflict' })
    } finally {
      setSaving(false)
    }
  }
  return { saving, saved, fail, run }
}

/** 运行中团队重启前的确认框：勾选「同时关闭旧岗位终端」才在 down 时带 close。 */
function RestartDialog(props: { busy: boolean; error: string | null; onClose: () => void; onRun: (close: boolean) => void }) {
  const [close, setClose] = useState(false)
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="保存草稿并重启应用">
        <h3>保存草稿并重启应用</h3>
        <p class="muted small">保存草稿并写入文档正文，然后重启团队应用这份草稿。</p>
        <label class="field inline check">
          <input type="checkbox" checked={close} onChange={(e) => setClose((e.target as HTMLInputElement).checked)} /> 同时关闭旧岗位终端
        </label>
        {props.error && (
          <p class="error" role="alert">
            {props.error}
          </p>
        )}
        <div class="dialog-actions">
          <button type="button" class="btn ghost" disabled={props.busy} onClick={props.onClose}>
            取消
          </button>
          <button type="button" class="btn" disabled={props.busy} onClick={() => props.onRun(close)}>
            {props.busy ? '执行中…' : '确认重启'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 保存后的提示：保存位置与更新的文档、运行中生效说明、旧草稿警告、失败信息。 */
function SaveMessages(p: { spec: SpecForEdit; base: Base; saved: SaveResult | null; fail: { text: string; conflict: boolean } | null; reload: () => void }) {
  return (
    <>
      {p.saved && (
        <p class="muted small" role="status">
          已保存到 <code>{p.saved.path}</code>（{p.saved.wrote === 'draft' ? '草稿' : '正式规格'}）
          {p.saved.docsUpdated?.length ? `；已更新文档：${p.saved.docsUpdated.join('、')}` : ''}
        </p>
      )}
      {p.spec.running && p.saved?.docsUpdated?.length ? (
        <p class="banner" role="status">
          规范与职责文档已更新，将在下次启动或新开会话时生效；恢复会话前需要重启团队。
        </p>
      ) : null}
      {p.saved?.wrote === 'spec' && p.base.hasDraft && (
        <p class="banner" role="status">
          旁边还留着一份旧草稿 <code>team.draft.yaml</code>：之后执行 <code>wl up --draft</code> 会用它覆盖这次保存的内容。不需要了就点上方的“丢弃草稿”。
        </p>
      )}
      {p.fail && (
        <p class="error" role="alert">
          {p.fail.text}{' '}
          {p.fail.conflict && (
            <button type="button" class="btn ghost small" onClick={p.reload}>
              重新加载
            </button>
          )}
        </p>
      )}
    </>
  )
}

function SavePanel(p: SavePanelProps) {
  const s = useSave(p)
  const [restart, setRestart] = useState(false)
  const enc = encodeURIComponent(p.team)
  const startAfter = async () => {
    await api.post(`/api/teams/${enc}/up`, {})
    navigate(`/t/${enc}`)
  }
  const restartAfter = async (close: boolean) => {
    await api.post(`/api/teams/${enc}/down`, close ? { close: true } : {})
    await api.post(`/api/teams/${enc}/up`, { draft: true })
    navigate(`/t/${enc}`)
  }
  return (
    <div class="save-panel">
      <div class="dialog-actions">
        <button type="button" class="btn" disabled={p.blocked || s.saving} onClick={() => void s.run()}>
          {s.saving ? '执行中…' : p.spec.running ? '保存为草稿' : '保存'}
        </button>
        {p.spec.running ? (
          <button type="button" class="btn" disabled={p.blocked || s.saving} onClick={() => setRestart(true)}>
            保存草稿并重启应用
          </button>
        ) : (
          <button type="button" class="btn" disabled={p.blocked || s.saving} onClick={() => void s.run(startAfter)}>
            {s.saving ? '执行中…' : '保存并启动'}
          </button>
        )}
      </div>
      {restart && (
        <RestartDialog busy={s.saving} error={s.fail?.text ?? null} onClose={() => setRestart(false)} onRun={(close) => void s.run(() => restartAfter(close))} />
      )}
      <SaveMessages spec={p.spec} base={p.base} saved={s.saved} fail={s.fail} reload={p.reload} />
    </div>
  )
}

function Errors({ errors }: { errors: FormError[] }) {
  if (errors.length === 0) return null
  return (
    <ul class="spec-errors" role="alert">
      {errors.map((e) => (
        <li key={`${e.path.join('.')}:${e.code}`} class="error small">
          {e.message}
        </li>
      ))}
    </ul>
  )
}

type View = 'form' | 'yaml'

function ViewTabs(props: { view: View; show: (v: View) => void }) {
  const tab = (v: View, label: string) => (
    <button type="button" class={props.view === v ? 'btn' : 'btn ghost'} aria-pressed={props.view === v} onClick={() => props.show(v)}>
      {label}
    </button>
  )
  return (
    <div class="tabs" role="group" aria-label="视图">
      {tab('form', '表单视图')}
      {tab('yaml', 'YAML 视图')}
    </div>
  )
}

function DraftBanner(props: { team: string; reload: () => void }) {
  return (
    <div class="banner">
      当前打开的是未应用的草稿。{' '}
      <ActionDialog
        label="丢弃草稿"
        title="丢弃草稿"
        danger
        onSubmit={(_v, rr) => api.post(`/api/teams/${encodeURIComponent(props.team)}/spec/discard-draft`, rr ? { retryRequest: rr } : {})}
        onDone={props.reload}
      />
    </div>
  )
}

type Validation = ReturnType<typeof useValidation>

function EditorBody({ view, ed, files, onFiles }: { view: View; ed: Validation; files: Record<string, string>; onFiles: (f: Record<string, string>) => void }) {
  const { shown } = ed
  const ids: string[] = (ed.formParsed?.posts ?? []).map((p: any) => String(p?.id ?? ''))
  if (view === 'yaml') {
    return (
      <>
        <textarea class="yaml" aria-label="YAML" spellcheck={false} rows={26} value={shown.yaml} onInput={(e) => ed.onYaml((e.target as HTMLTextAreaElement).value)} />
        <Errors errors={shown.errors} />
      </>
    )
  }
  return (
    <>
      {shown.parsed === null && <p class="banner error">YAML 有语法错误，表单只读，请切到 YAML 视图修正。</p>}
      <Errors errors={shown.errors.filter((e) => !formHasField(e.path, ids))} />
      <SpecForm parsed={ed.formParsed} errors={shown.errors} disabled={shown.parsed === null} onSet={ed.onSet} files={files} onFiles={onFiles} onOp={ed.onOp} />
    </>
  )
}

function Editor({ team, spec, reload }: { team: string; spec: SpecForEdit; reload: () => void }) {
  const [files, setFiles] = useState<Record<string, string>>(spec.files ?? {})
  const ed = useValidation(team, spec.draft ?? spec, files)
  const [view, setView] = useState<View>('form')
  const [base, setBase] = useState<Base>({ hash: spec.hash, draftHash: spec.draft?.hash ?? null, hasDraft: spec.draft !== null })
  const { shown } = ed
  const show = (v: View) => {
    ed.flushNow()
    setView(v)
  }
  return (
    <div class="page">
      <header class="page-head">
        <h1>编辑 {team}</h1>
        <span class="muted small">{spec.specPath}</span>
      </header>
      {spec.running && <p class="banner">团队正在运行：保存会写入草稿，不影响运行；停掉团队后用 wl up --draft 应用。</p>}
      {base.hasDraft && <DraftBanner team={team} reload={reload} />}
      <ViewTabs view={view} show={show} />
      <EditorBody view={view} ed={ed} files={files} onFiles={setFiles} />
      {shown.problem && <p class="error" role="alert">{shown.problem}</p>}
      {shown.preview && <SpecPreview preview={shown.preview} team={team} />}
      <SavePanel
        team={team} spec={spec} base={base} setBase={setBase} yaml={ed.latest} setErrors={ed.setErrors} reload={reload}
        files={() => pickReferenced(ed.shown.parsed, files)}
        blocked={ed.dirty || shown.errors.length > 0 || shown.parsed === null}
      />
      <p class="muted small">team.yaml 视为可信配置：launch、gates、notify.command 会在本机执行，请只保存你信任的内容。</p>
    </div>
  )
}

/** 团队编辑器：表单与 YAML 两个视图（YAML 是唯一的真实来源），边改边校验、预演，保存不打断运行中的团队。 */
export function Edit({ team }: { team: string }) {
  const spec = useApi<SpecForEdit>(`/api/teams/${encodeURIComponent(team)}/spec`)
  // 每次重新取到数据就重建编辑器状态（保存冲突或丢弃草稿后的“重新加载”）
  const gen = useRef(0)
  const seen = useRef<SpecForEdit | null>(null)
  if (spec.data !== seen.current) {
    seen.current = spec.data
    gen.current += 1
  }
  if (spec.error) return <ErrorBox error={spec.error} />
  if (!spec.data) return <Loading />
  return <Editor key={gen.current} team={team} spec={spec.data} reload={spec.reload} />
}
