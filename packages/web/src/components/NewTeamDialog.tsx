import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { api, errorText } from '../api.js'
import { runSteps, type Step } from './TeamActions.js'
import { Pill } from './common.js'

export const TEAM_TEMPLATES_UI: Array<{ id: 'duo' | 'solo' | 'trio'; label: string; summary: string }> = [
  { id: 'duo', label: '双人协作（推荐）', summary: 'builder 负责编码，checker 负责复核' },
  { id: 'solo', label: '单人团队', summary: 'builder 负责全部实现与验证' },
  { id: 'trio', label: '三人流水线', summary: 'planner 规划，builder 实施，checker 验收' },
]

function TemplateCards(props: {
  selected: 'duo' | 'solo' | 'trio'
  onSelect: (id: 'duo' | 'solo' | 'trio') => void
}) {
  return (
    <div class="template-cards">
      {TEAM_TEMPLATES_UI.map((t) => {
        const active = props.selected === t.id
        return (
          <button
            key={t.id}
            type="button"
            class={active ? 'template-card active' : 'template-card'}
            aria-pressed={active}
            onClick={() => props.onSelect(t.id)}
          >
            <div class="template-card-head">
              <span class="template-card-title">{t.label}</span>
              {active && <Pill tone="neutral">当前</Pill>}
            </div>
            <p class="template-card-desc">{t.summary}</p>
          </button>
        )
      })}
    </div>
  )
}

function TemplateFields(props: {
  template: 'duo' | 'solo' | 'trio'
  name: string
  repo: string
  dir: string
  onSelectTemplate: (t: 'duo' | 'solo' | 'trio') => void
  onChangeName: (v: string) => void
  onChangeRepo: (v: string) => void
  onChangeDir: (v: string) => void
}) {
  return (
    <>
      <TemplateCards selected={props.template} onSelect={props.onSelectTemplate} />
      <label class="field">
        <span>团队名称 *</span>
        <input
          aria-label="团队名称"
          placeholder="小写字母、数字、连字符"
          value={props.name}
          onInput={(e) => props.onChangeName((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>代码库目录 *</span>
        <input
          aria-label="代码库目录"
          placeholder="本机仓库绝对路径"
          value={props.repo}
          onInput={(e) => props.onChangeRepo((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>配置存放目录</span>
        <input
          aria-label="配置存放目录"
          placeholder="~/.wingline/teams/<团队名称>"
          value={props.dir}
          onInput={(e) => props.onChangeDir((e.target as HTMLInputElement).value)}
        />
      </label>
    </>
  )
}

function ImportFields(props: { specPath: string; onChangeSpecPath: (v: string) => void }) {
  return (
    <label class="field">
      <span>配置文件路径（team.yaml） *</span>
      <input
        aria-label="配置文件路径（team.yaml）"
        placeholder="/path/to/team.yaml"
        value={props.specPath}
        onInput={(e) => props.onChangeSpecPath((e.target as HTMLInputElement).value)}
      />
    </label>
  )
}

function ModeTabs(props: {
  mode: 'template' | 'import'
  onMode: (m: 'template' | 'import') => void
}) {
  return (
    <div class="tabs">
      <button
        type="button"
        class={props.mode === 'template' ? 'btn' : 'btn ghost'}
        onClick={() => props.onMode('template')}
      >
        使用预设模板
      </button>
      <button
        type="button"
        class={props.mode === 'import' ? 'btn' : 'btn ghost'}
        onClick={() => props.onMode('import')}
      >
        导入已有配置
      </button>
    </div>
  )
}

function DialogFooter(props: {
  mode: 'template' | 'import'
  busy: boolean
  submitting: 'create' | 'start' | null
  retry: { send: () => Promise<void> } | null
  onRetry: () => void
  onClose: () => void
  onSubmit: (start: boolean) => void
}) {
  return (
    <div class="dialog-actions">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={props.onClose}>
        取消
      </button>
      {props.retry ? (
        <button type="button" class="btn" disabled={props.busy} onClick={props.onRetry}>
          {props.busy ? '执行中…' : '按原样重试'}
        </button>
      ) : (
        <>
          <button type="button" class="btn ghost" disabled={props.busy} onClick={() => props.onSubmit(false)}>
            {props.submitting === 'create' ? '执行中…' : props.mode === 'template' ? '仅创建配置' : '导入团队'}
          </button>
          <button type="button" class="btn" disabled={props.busy} onClick={() => props.onSubmit(true)}>
            {props.submitting === 'start' ? '执行中…' : props.mode === 'template' ? '创建并启动' : '导入并启动'}
          </button>
        </>
      )}
    </div>
  )
}

/** 模板模式的链路：建 team →（start 时）按创建返回的团队名 up → 通知；必填校验在构建时抛出。 */
function templateSteps(
  state: { name: string; repo: string; template: 'duo' | 'solo' | 'trio'; dir: string },
  start: boolean,
  onCreated: (team: string, started: boolean) => void,
): Step[] {
  const name = state.name.trim()
  const repo = state.repo.trim()
  if (!name || !repo) throw new Error('请填写必填项：团队名称与代码库目录')
  const payload: Record<string, unknown> = { mode: 'template', name, repo, template: state.template }
  if (state.dir.trim()) payload.dir = state.dir.trim()
  let team = name // 创建成功后换成响应里的团队名，供后续步骤闭包使用
  const up = async (rr?: string) => {
    await api.post(`/api/teams/${encodeURIComponent(team)}/up`, rr ? { retryRequest: rr } : {})
  }
  return [
    async (rr) => {
      const res = await api.post<{ team: string }>('/api/teams', { ...payload, ...(rr ? { retryRequest: rr } : {}) })
      team = res?.team || name
    },
    ...(start ? [up] : []),
    async () => onCreated(team, start),
  ]
}

/** 导入模式的链路：建 team（团队名必须来自响应）→（start 时）up → 通知。 */
function importSteps(specPath: string, start: boolean, onCreated: (team: string, started: boolean) => void): Step[] {
  const trimmed = specPath.trim()
  if (!trimmed) throw new Error('请填写必填项：配置文件路径')
  let team = ''
  const need = () => {
    if (!team) throw new Error('后端未返回团队名称')
  }
  const up = async (rr?: string) => {
    need()
    await api.post(`/api/teams/${encodeURIComponent(team)}/up`, rr ? { retryRequest: rr } : {})
  }
  return [
    async (rr) => {
      const res = await api.post<{ team: string }>('/api/teams', { mode: 'import', specPath: trimmed, ...(rr ? { retryRequest: rr } : {}) })
      team = res?.team ?? ''
    },
    ...(start ? [up] : []),
    async () => {
      need()
      onCreated(team, start)
    },
  ]
}

function DialogShell(props: {
  mode: 'template' | 'import'
  onMode: (m: 'template' | 'import') => void
  error: string | null
  busy: boolean
  submitting: 'create' | 'start' | null
  retry: { send: () => Promise<void> } | null
  onRetry: () => void
  onClose: () => void
  onSubmit: (start: boolean) => void
  children: ComponentChildren
}) {
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="新建团队">
        <h3>新建团队</h3>
        <ModeTabs mode={props.mode} onMode={props.onMode} />
        <form onSubmit={(e) => e.preventDefault()}>
          {props.children}
          {props.error && (
            <p class="error" role="alert">
              {props.error}
            </p>
          )}
          <DialogFooter
            mode={props.mode}
            busy={props.busy}
            submitting={props.submitting}
            retry={props.retry}
            onRetry={props.onRetry}
            onClose={props.onClose}
            onSubmit={props.onSubmit}
          />
        </form>
      </div>
    </div>
  )
}

function FormPane(props: {
  mode: 'template' | 'import'
  template: 'duo' | 'solo' | 'trio'
  name: string
  repo: string
  dir: string
  specPath: string
  setTemplate: (t: 'duo' | 'solo' | 'trio') => void
  setName: (v: string) => void
  setRepo: (v: string) => void
  setDir: (v: string) => void
  setSpecPath: (v: string) => void
}) {
  if (props.mode === 'template') {
    return (
      <TemplateFields
        template={props.template}
        name={props.name}
        repo={props.repo}
        dir={props.dir}
        onSelectTemplate={props.setTemplate}
        onChangeName={props.setName}
        onChangeRepo={props.setRepo}
        onChangeDir={props.setDir}
      />
    )
  }
  return <ImportFields specPath={props.specPath} onChangeSpecPath={props.setSpecPath} />
}

function useNewTeamDialog(open: boolean, onCreated: (team: string, started: boolean) => void) {
  const [mode, setMode] = useState<'template' | 'import'>('template')
  const [template, setTemplate] = useState<'duo' | 'solo' | 'trio'>('duo')
  const [name, setName] = useState('')
  const [repo, setRepo] = useState('')
  const [dir, setDir] = useState('')
  const [specPath, setSpecPath] = useState('')
  const [status, setStatus] = useState<{ busy: boolean; submitting: 'create' | 'start' | null; error: string | null }>({
    busy: false,
    submitting: null,
    error: null,
  })
  const [retry, setRetry] = useState<{ send: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (open) {
      setStatus((s) => ({ ...s, error: null }))
      setRetry(null)
    }
  }, [open])

  const onFail = (err: unknown) => setStatus({ busy: false, submitting: null, error: errorText(err) })
  const run = async (go: () => Promise<void>) => {
    setStatus((s) => ({ ...s, busy: true, error: null }))
    await go()
    setStatus((s) => (s.error ? s : { busy: false, submitting: null, error: null })) // 失败时保留 onFail 写入的报错
  }
  const handleSubmit = async (start: boolean) => {
    let steps: Step[]
    try {
      steps = mode === 'template' ? templateSteps({ name, repo, template, dir }, start, onCreated) : importSteps(specPath, start, onCreated)
    } catch (err) {
      setStatus({ busy: false, submitting: null, error: errorText(err) }) // 本地必填校验，还没发请求
      return
    }
    setStatus({ busy: true, submitting: start ? 'start' : 'create', error: null })
    await run(() => runSteps(steps, onFail, setRetry))
  }
  const retrySend = () => (retry ? run(retry.send) : undefined)
  const pickMode = (m: 'template' | 'import') => {
    setMode(m)
    setStatus((s) => ({ ...s, error: null }))
    setRetry(null) // 换模式后旧链路作废，不再提供按原样重试
  }

  return {
    mode, template, name, repo, dir, specPath, ...status, retry, retrySend,
    setTemplate, setName, setRepo, setDir, setSpecPath, pickMode, handleSubmit,
  }
}

export function NewTeamDialog(props: {
  open: boolean
  onClose: () => void
  onCreated: (team: string, started: boolean) => void
}): ComponentChildren {
  const s = useNewTeamDialog(props.open, props.onCreated)
  if (!props.open) return null
  return (
    <DialogShell
      mode={s.mode}
      onMode={s.pickMode}
      error={s.error}
      busy={s.busy}
      submitting={s.submitting}
      retry={s.retry}
      onRetry={() => void s.retrySend()}
      onClose={props.onClose}
      onSubmit={(start) => void s.handleSubmit(start)}
    >
      <FormPane
        mode={s.mode}
        template={s.template}
        name={s.name}
        repo={s.repo}
        dir={s.dir}
        specPath={s.specPath}
        setTemplate={s.setTemplate}
        setName={s.setName}
        setRepo={s.setRepo}
        setDir={s.setDir}
        setSpecPath={s.setSpecPath}
      />
    </DialogShell>
  )
}
