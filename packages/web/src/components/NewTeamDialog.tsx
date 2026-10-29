import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { api, errorText } from '../api.js'
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
  onClose: () => void
  onSubmit: (start: boolean) => void
}) {
  return (
    <div class="dialog-actions">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={props.onClose}>
        取消
      </button>
      <button type="button" class="btn ghost" disabled={props.busy} onClick={() => props.onSubmit(false)}>
        {props.submitting === 'create' ? '执行中…' : props.mode === 'template' ? '仅创建配置' : '导入团队'}
      </button>
      <button type="button" class="btn" disabled={props.busy} onClick={() => props.onSubmit(true)}>
        {props.submitting === 'start' ? '执行中…' : props.mode === 'template' ? '创建并启动' : '导入并启动'}
      </button>
    </div>
  )
}

async function submitTemplate(
  state: { name: string; repo: string; template: 'duo' | 'solo' | 'trio'; dir: string },
  start: boolean,
  onCreated: (team: string, started: boolean) => void,
) {
  const name = state.name.trim()
  const repo = state.repo.trim()
  if (!name || !repo) throw new Error('请填写必填项：团队名称与代码库目录')
  const payload: { mode: 'template'; name: string; repo: string; template: string; dir?: string } = {
    mode: 'template',
    name,
    repo,
    template: state.template,
  }
  if (state.dir.trim()) payload.dir = state.dir.trim()
  const res = await api.post<{ team: string }>('/api/teams', payload)
  const team = res?.team || name
  if (start) await api.post(`/api/teams/${encodeURIComponent(team)}/up`, {})
  onCreated(team, start)
}

async function submitImport(
  specPath: string,
  start: boolean,
  onCreated: (team: string, started: boolean) => void,
) {
  const trimmed = specPath.trim()
  if (!trimmed) throw new Error('请填写必填项：配置文件路径')
  const res = await api.post<{ team: string }>('/api/teams', { mode: 'import', specPath: trimmed })
  const team = res?.team
  if (!team) throw new Error('后端未返回团队名称')
  if (start) await api.post(`/api/teams/${encodeURIComponent(team)}/up`, {})
  onCreated(team, start)
}

function DialogShell(props: {
  mode: 'template' | 'import'
  onMode: (m: 'template' | 'import') => void
  error: string | null
  busy: boolean
  submitting: 'create' | 'start' | null
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
            onClose={props.onClose}
            onSubmit={props.onSubmit}
          />
        </form>
      </div>
    </div>
  )
}

async function runSubmit(
  mode: 'template' | 'import',
  fields: { name: string; repo: string; template: 'duo' | 'solo' | 'trio'; dir: string; specPath: string },
  start: boolean,
  onCreated: (team: string, started: boolean) => void,
) {
  if (mode === 'template') {
    await submitTemplate(
      { name: fields.name, repo: fields.repo, template: fields.template, dir: fields.dir },
      start,
      onCreated,
    )
  } else {
    await submitImport(fields.specPath, start, onCreated)
  }
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

  useEffect(() => {
    if (open) setStatus((s) => ({ ...s, error: null }))
  }, [open])

  const handleSubmit = async (start: boolean) => {
    setStatus({ busy: true, submitting: start ? 'start' : 'create', error: null })
    try {
      await runSubmit(mode, { name, repo, template, dir, specPath }, start, onCreated)
    } catch (err) {
      setStatus({ busy: false, submitting: null, error: errorText(err) })
      return
    }
    setStatus({ busy: false, submitting: null, error: null })
  }

  const pickMode = (m: 'template' | 'import') => {
    setMode(m)
    setStatus((s) => ({ ...s, error: null }))
  }

  return { mode, template, name, repo, dir, specPath, ...status, setTemplate, setName, setRepo, setDir, setSpecPath, pickMode, handleSubmit }
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
