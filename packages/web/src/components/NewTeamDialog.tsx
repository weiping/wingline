import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { api, errorText } from '../api.js'

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
            onClick={() => props.onSelect(t.id)}
          >
            <div class="template-card-head">
              <span class="template-card-title">{t.label}</span>
              {active && <span class="tag">当前</span>}
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

function ImportFields(props: {
  specPath: string
  onChangeSpecPath: (v: string) => void
}) {
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

export function NewTeamDialog(props: {
  open: boolean
  onClose: () => void
  onCreated: (team: string, started: boolean) => void
}): ComponentChildren {
  if (!props.open) return null
  const [mode, setMode] = useState<'template' | 'import'>('template')
  const [template, setTemplate] = useState<'duo' | 'solo' | 'trio'>('duo')
  const [name, setName] = useState('')
  const [repo, setRepo] = useState('')
  const [dir, setDir] = useState('')
  const [specPath, setSpecPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitting, setSubmitting] = useState<'create' | 'start' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (start: boolean) => {
    setBusy(true)
    setSubmitting(start ? 'start' : 'create')
    setError(null)
    try {
      if (mode === 'template') {
        await submitTemplate({ name, repo, template, dir }, start, props.onCreated)
      } else {
        await submitImport(specPath, start, props.onCreated)
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
      setSubmitting(null)
    }
  }

  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="新建团队">
        <h3>新建团队</h3>
        <div class="tabs">
          <button
            type="button"
            class={mode === 'template' ? 'btn' : 'btn ghost'}
            onClick={() => { setMode('template'); setError(null) }}
          >
            使用预设模板
          </button>
          <button
            type="button"
            class={mode === 'import' ? 'btn' : 'btn ghost'}
            onClick={() => { setMode('import'); setError(null) }}
          >
            导入已有配置
          </button>
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
          {mode === 'template' ? (
            <TemplateFields
              template={template}
              name={name}
              repo={repo}
              dir={dir}
              onSelectTemplate={setTemplate}
              onChangeName={setName}
              onChangeRepo={setRepo}
              onChangeDir={setDir}
            />
          ) : (
            <ImportFields specPath={specPath} onChangeSpecPath={setSpecPath} />
          )}
          {error && <p class="error" role="alert">{error}</p>}
          <div class="dialog-actions">
            <button type="button" class="btn ghost" disabled={busy} onClick={props.onClose}>
              取消
            </button>
            <button
              type="button"
              class="btn ghost"
              disabled={busy}
              onClick={() => void handleSubmit(false)}
            >
              {submitting === 'create' ? '执行中…' : mode === 'template' ? '仅创建配置' : '导入团队'}
            </button>
            <button
              type="button"
              class="btn"
              disabled={busy}
              onClick={() => void handleSubmit(true)}
            >
              {submitting === 'start' ? '执行中…' : mode === 'template' ? '创建并启动' : '导入并启动'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
