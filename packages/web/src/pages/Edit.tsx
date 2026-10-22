import type { SpecPlan } from '@wingline/core'
import { useEffect, useRef, useState } from 'preact/hooks'
import { ApiError, api, errorText } from '../api.js'
import { useApi } from '../hooks.js'
import { ActionDialog } from '../components/ActionDialog.js'
import { SpecForm, formHasField, type FormError, type SpecPath } from '../components/SpecForm.js'
import { SpecPreview } from '../components/SpecPreview.js'
import { ErrorBox, Loading } from '../components/common.js'

interface SpecForEdit {
  specPath: string
  yaml: string
  parsed: any
  hash: string | null
  draft: { yaml: string; parsed: any; hash: string | null } | null
  running: boolean
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
}
type SetOp = { path: SpecPath; value: unknown }

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

function useEditor(team: string, spec: SpecForEdit) {
  const enc = encodeURIComponent(team)
  const start = spec.draft ?? spec
  const [yaml, setYaml] = useState(start.yaml)
  const [parsed, setParsed] = useState<any>(start.parsed)
  const [errors, setErrors] = useState<FormError[]>([])
  const [preview, setPreview] = useState<SpecPlan | null>(null)
  const [dirty, setDirty] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [base, setBase] = useState({ hash: spec.hash, draftHash: spec.draft?.hash ?? null, hasDraft: spec.draft !== null })
  const latest = useRef(start.yaml)
  const lastGood = useRef<any>(start.parsed)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const pending = useRef<SetOp[]>([])
  const version = useRef(0)
  const chain = useRef<Promise<void>>(Promise.resolve())
  if (parsed !== null) lastGood.current = parsed

  const post = (body: object) => api.post<ValidateResult>(`/api/teams/${enc}/spec/validate`, body)

  const run = async () => {
    const sets = pending.current.splice(0)
    const startVersion = version.current
    try {
      let res: ValidateResult
      if (sets.length === 0) res = await post({ yaml: latest.current })
      else {
        res = undefined as unknown as ValidateResult
        for (const set of sets) {
          res = await post({ yaml: latest.current, set })
          latest.current = res.yaml
        }
      }
      if (version.current !== startVersion) return
      setYaml(res.yaml)
      setParsed(res.parsed)
      setErrors(res.errors)
      setPreview(res.preview)
      setProblem(null)
      setDirty(false)
    } catch (err) {
      setProblem(errorText(err))
      setDirty(false)
    }
  }

  const flushNow = () => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(run)
  }
  const schedule = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(flushNow, DEBOUNCE_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const edited = () => {
    version.current += 1
    setDirty(true)
    schedule()
  }
  const onYaml = (text: string) => {
    latest.current = text
    pending.current = []
    setYaml(text)
    edited()
  }
  const onSet = (path: SpecPath, value: unknown) => {
    pending.current.push({ path, value })
    setParsed((p: any) => setLocal(p, path, value))
    edited()
  }

  const saveBody = () => ({ yaml: latest.current, running: spec.running, baseHash: spec.running ? base.draftHash : base.hash })
  const afterSave = (res: SaveResult) =>
    setBase((b) => (res.wrote === 'draft' ? { ...b, draftHash: res.hash, hasDraft: true } : { ...b, hash: res.hash }))
  const save = () => api.post<SaveResult>(`/api/teams/${enc}/spec`, saveBody())

  return { yaml, parsed, formParsed: parsed ?? lastGood.current, errors, setErrors, preview, dirty, problem, base, onYaml, onSet, flushNow, save, afterSave }
}

type View = 'form' | 'yaml'

function SavePanel(props: { spec: SpecForEdit; ed: ReturnType<typeof useEditor>; reload: () => void }) {
  const { spec, ed } = props
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SaveResult | null>(null)
  const [fail, setFail] = useState<{ text: string; conflict: boolean } | null>(null)
  const blocked = ed.dirty || saving || ed.errors.length > 0 || ed.parsed === null
  const click = async () => {
    setSaving(true)
    setFail(null)
    try {
      const res = await ed.save()
      ed.afterSave(res)
      setSaved(res)
    } catch (err) {
      if (err instanceof ApiError && err.detail?.errors) ed.setErrors(err.detail.errors)
      setFail({ text: errorText(err), conflict: err instanceof ApiError && err.code === 'spec_conflict' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div class="save-panel">
      <button type="button" class="btn" disabled={blocked} onClick={() => void click()}>
        {spec.running ? '保存为草稿' : '保存'}
      </button>
      {saved && (
        <p class="muted small" role="status">
          已保存到 <code>{saved.path}</code>（{saved.wrote === 'draft' ? '草稿' : '正式规格'}）
        </p>
      )}
      {fail && (
        <p class="error" role="alert">
          {fail.text}{' '}
          {fail.conflict && (
            <button type="button" class="btn ghost small" onClick={props.reload}>
              重新加载
            </button>
          )}
        </p>
      )}
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

function Editor({ team, spec, reload }: { team: string; spec: SpecForEdit; reload: () => void }) {
  const ed = useEditor(team, spec)
  const [view, setView] = useState<View>('form')
  const ids: string[] = (ed.formParsed?.posts ?? []).map((p: any) => String(p?.id ?? ''))
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
      {ed.base.hasDraft && (
        <div class="banner">
          当前打开的是未应用的草稿。{' '}
          <ActionDialog
            label="丢弃草稿"
            title="丢弃草稿"
            danger
            onSubmit={(_v, rr) => api.post(`/api/teams/${encodeURIComponent(team)}/spec/discard-draft`, rr ? { retryRequest: rr } : {})}
            onDone={reload}
          />
        </div>
      )}
      <div class="tabs" role="group" aria-label="视图">
        <button type="button" class={view === 'form' ? 'btn' : 'btn ghost'} aria-pressed={view === 'form'} onClick={() => show('form')}>
          表单视图
        </button>
        <button type="button" class={view === 'yaml' ? 'btn' : 'btn ghost'} aria-pressed={view === 'yaml'} onClick={() => show('yaml')}>
          YAML 视图
        </button>
      </div>
      {view === 'form' ? (
        <>
          {ed.parsed === null && <p class="banner error">YAML 有语法错误，表单只读，请切到 YAML 视图修正。</p>}
          <Errors errors={ed.errors.filter((e) => !formHasField(e.path, ids))} />
          <SpecForm parsed={ed.formParsed} errors={ed.errors} disabled={ed.parsed === null} onSet={ed.onSet} />
        </>
      ) : (
        <>
          <textarea class="yaml" aria-label="YAML" spellcheck={false} rows={26} value={ed.yaml} onInput={(e) => ed.onYaml((e.target as HTMLTextAreaElement).value)} />
          <Errors errors={ed.errors} />
        </>
      )}
      {ed.problem && <p class="error" role="alert">{ed.problem}</p>}
      {ed.preview && <SpecPreview preview={ed.preview} team={team} />}
      <SavePanel spec={spec} ed={ed} reload={reload} />
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
