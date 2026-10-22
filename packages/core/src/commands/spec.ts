import fs from 'node:fs'
import { WinglineError } from '../errors.js'
import type { TeamRow } from '../registry/registry.js'
import { discardDraft, draftPathOf, fileHash, assertSpecSize, saveSpec } from '../spec/draft.js'
import { setField } from '../spec/edit.js'
import { loadTeamSpec, validateSpecText, type SpecError, type TeamSpec } from '../spec/load.js'
import { planSpecChange, type SpecPlan } from '../spec/plan-change.js'
import type { CommandDeps } from './deps.js'

export interface SpecForEdit {
  specPath: string
  yaml: string
  parsed: unknown | null
  hash: string | null
  draft: { yaml: string; parsed: unknown | null; hash: string | null } | null
  running: boolean
}

function teamOf(deps: CommandDeps, team: string): TeamRow {
  const row = deps.registry.getTeam(team)
  if (!row) throw new WinglineError('input', 'team_unknown', `团队 ${team} 未登记`)
  return row
}

const readText = (file: string): string => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (cause) {
    throw new WinglineError('input', 'spec_not_found', `读不到团队规格 ${file}`, { cause })
  }
}

/** 编辑器加载：正式规格与草稿（如果有）各给出文本、解析结果与内容哈希。 */
export function readSpecForEdit(deps: CommandDeps, team: string): SpecForEdit {
  const row = teamOf(deps, team)
  const view = (file: string) => {
    const yaml = readText(file)
    return { yaml, parsed: validateSpecText(yaml, row.specPath).parsed, hash: fileHash(file) }
  }
  const draftFile = draftPathOf(row.specPath)
  return {
    specPath: row.specPath,
    ...view(row.specPath),
    draft: fs.existsSync(draftFile) ? view(draftFile) : null,
    running: row.status === 'up',
  }
}

export interface SpecEditResult {
  yaml: string
  parsed: unknown | null
  errors: SpecError[]
  preview: SpecPlan | null
}

function currentSpec(specPath: string): TeamSpec | null {
  try {
    return loadTeamSpec(specPath)
  } catch (err) {
    if (err instanceof WinglineError) return null
    throw err
  }
}

/** 校验一段 YAML（可先套用表单的一处修改）并预演；不写任何文件。 */
export function validateSpecEdit(
  deps: CommandDeps,
  a: { team: string; yaml: string; set?: { path: Array<string | number>; value: unknown } },
): SpecEditResult {
  const row = teamOf(deps, a.team)
  assertSpecSize(a.yaml)
  const yaml = a.set ? setField(a.yaml, a.set.path, a.set.value) : a.yaml
  assertSpecSize(yaml)
  const { spec, parsed, errors } = validateSpecText(yaml, row.specPath)
  const preview = spec ? planSpecChange(currentSpec(row.specPath), spec, { running: row.status === 'up', specPath: row.specPath }) : null
  return { yaml, parsed, errors, preview }
}

export interface SaveSpecArgs {
  team: string
  yaml: string
  baseHash: string | null
  running: boolean
  retryRequest?: string
}

/** 保存规格；两次保存相同内容天然幂等，所以 retryRequest 只是被路由校验格式，这里不用。 */
export async function saveSpecCmd(deps: CommandDeps, a: SaveSpecArgs): Promise<{ wrote: 'draft' | 'spec'; path: string; hash: string }> {
  const row = teamOf(deps, a.team)
  if (a.running !== (row.status === 'up')) {
    throw new WinglineError('input', 'spec_conflict', '团队状态已变化，请重新加载')
  }
  return saveSpec({ specPath: row.specPath, text: a.yaml, baseHash: a.baseHash, running: a.running })
}

export async function discardDraftCmd(deps: CommandDeps, a: { team: string; retryRequest?: string }): Promise<{ discarded: boolean }> {
  return discardDraft(teamOf(deps, a.team).specPath)
}
