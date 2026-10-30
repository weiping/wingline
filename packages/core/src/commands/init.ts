import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import { specHash } from '../spec/hash.js'
import { loadTeamSpec, type TeamSpec } from '../spec/load.js'
import { postAddress, type CommandDeps } from './deps.js'
import {
  TEAM_TEMPLATES,
  renderBrief,
  renderNorms,
  renderTeamYaml,
  type TeamTemplate,
  type TeamTemplateId,
} from './templates.js'

export type InitTeamMode = 'template' | 'import'

export interface InitTeamArgs {
  mode: InitTeamMode
  name?: string
  repo?: string
  template?: TeamTemplateId
  dir?: string
  specPath?: string
}

export interface InitTeamResult {
  team: string
  specPath: string
  created: boolean
}

const TEAM_NAME_RE = /^[a-z0-9-]+$/

function writeTemplate(targetDir: string, tpl: TeamTemplate, name: string, repo: string): string {
  const briefsDir = path.join(targetDir, 'briefs')
  fs.mkdirSync(briefsDir, { recursive: true })
  const normsPath = path.join(targetDir, 'NORMS.md')
  if (!fs.existsSync(normsPath)) {
    fs.writeFileSync(normsPath, renderNorms({ team: name, posts: tpl.posts.map((p) => p.id) }), 'utf8')
  }
  for (const p of tpl.posts) {
    const briefPath = path.join(targetDir, p.brief)
    fs.mkdirSync(path.dirname(briefPath), { recursive: true })
    if (!fs.existsSync(briefPath)) {
      fs.writeFileSync(briefPath, renderBrief(p.role, { team: name, post: p.id }), 'utf8')
    }
  }
  const specPath = path.join(targetDir, 'team.yaml')
  fs.writeFileSync(specPath, renderTeamYaml(tpl, { name, repo }), 'utf8')
  return specPath
}

function registerSpec(deps: CommandDeps, spec: TeamSpec): void {
  const hash = specHash(spec)
  deps.registry.upsertTeam({
    name: spec.name,
    specPath: spec.specPath,
    specHash: hash,
    runId: null,
    coordinatorHandle: null,
    status: 'stopped',
  })
  for (const p of spec.posts) {
    deps.registry.upsertPost({
      address: postAddress(p.id, spec.name),
      team: spec.name,
      agent: p.agent,
      worktree: p.worktree,
      handle: null,
      status: 'offline',
      isLead: p.id === spec.lead,
      sessionMarker: null,
      sessionId: null,
      sessionAt: null,
    })
  }
}

function initFromTemplate(deps: CommandDeps, a: InitTeamArgs): InitTeamResult {
  const name = a.name ?? ''
  if (!TEAM_NAME_RE.test(name)) {
    throw new WinglineError('input', 'team_name_invalid', '团队名只能用小写字母、数字与连字符')
  }
  const rawRepo = a.repo?.trim() ?? ''
  if (!rawRepo || /[\x00-\x1f\x7f]/.test(a.repo ?? '')) {
    throw new WinglineError('input', 'invalid_param', rawRepo ? '代码库目录不能包含控制字符' : '缺少代码库目录')
  }
  const tplId = a.template ?? 'duo'
  const tpl = (TEAM_TEMPLATES as Record<string, TeamTemplate | undefined>)[tplId]
  if (!tpl) {
    throw new WinglineError('input', 'invalid_param', `未知团队模板：${String(tplId)}`)
  }
  const targetDir = a.dir ? path.resolve(a.dir) : path.join(deps.home, 'teams', name)
  const specPath = path.join(targetDir, 'team.yaml')
  const repo = rawRepo.startsWith('path:') ? rawRepo : `path:${rawRepo}`
  const existing = deps.registry.getTeam(name)
  if (existing) {
    if (existing.specPath === specPath && fs.existsSync(specPath)) {
      return { team: name, specPath, created: false }
    }
    throw new WinglineError('input', 'team_already_exists', `团队 ${name} 已存在（${existing.specPath}）`)
  }
  if (fs.existsSync(specPath)) {
    throw new WinglineError('input', 'spec_already_exists', `配置文件已存在：${specPath}，请改用“导入已有配置”`)
  }
  writeTemplate(targetDir, tpl, name, repo)
  const spec = loadTeamSpec(specPath)
  registerSpec(deps, spec)
  return { team: name, specPath, created: true }
}

function initFromImport(deps: CommandDeps, a: InitTeamArgs): InitTeamResult {
  const rawPath = a.specPath?.trim() ?? ''
  if (!rawPath) {
    throw new WinglineError('input', 'invalid_param', '缺少配置文件路径')
  }
  const spec = loadTeamSpec(rawPath)
  const existing = deps.registry.getTeam(spec.name)
  if (existing) {
    if (existing.specPath === spec.specPath) {
      return { team: spec.name, specPath: spec.specPath, created: false }
    }
    throw new WinglineError('input', 'team_already_exists', `同名团队 ${spec.name} 已登记在另一路径：${existing.specPath}`)
  }
  registerSpec(deps, spec)
  return { team: spec.name, specPath: path.resolve(rawPath), created: true }
}

export async function initTeamCmd(deps: CommandDeps, a: InitTeamArgs): Promise<InitTeamResult> {
  if (a.mode === 'template') return initFromTemplate(deps, a)
  if (a.mode === 'import') return initFromImport(deps, a)
  throw new WinglineError('input', 'invalid_param', `未知初始化模式：${String(a.mode)}`)
}
