import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import type { TeamRow } from '../registry/registry.js'
import { assertSpecSize, checkSaveConflict, discardDraft, draftPathOf, fileHash, saveSpec } from '../spec/draft.js'
import { docRelsOf, readDocText, resolveDocPath, writeDocAtomic } from '../spec/doc.js'
import { applySpecOp, type SpecEditOp } from '../spec/edit.js'
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
  files: Record<string, string>
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

/** 把规格（与草稿）引用的文档正文读出来；解析不了的相对路径跳过，不让整个编辑页打不开。 */
function readDocs(dir: string, parseds: Array<unknown | null>): Record<string, string> {
  const files: Record<string, string> = {}
  for (const parsed of parseds) {
    for (const rel of docRelsOf(parsed)) {
      if (rel in files) continue
      try {
        files[rel] = readDocText(resolveDocPath(dir, rel))
      } catch {
        // resolveDocPath 拒绝的路径（越界、非 .md）：编辑页照样打开，只是不带这份正文
      }
    }
  }
  return files
}

/** 编辑器加载：正式规格与草稿（如果有）各给出文本、解析结果与内容哈希，附上引用文档的正文。 */
export function readSpecForEdit(deps: CommandDeps, team: string): SpecForEdit {
  const row = teamOf(deps, team)
  const view = (file: string) => {
    const yaml = readText(file)
    return { yaml, parsed: validateSpecText(yaml, row.specPath).parsed, hash: fileHash(file) }
  }
  const draftFile = draftPathOf(row.specPath)
  const spec = view(row.specPath)
  const draft = fs.existsSync(draftFile) ? view(draftFile) : null
  return {
    specPath: row.specPath,
    ...spec,
    draft,
    running: row.status === 'up',
    files: readDocs(path.dirname(row.specPath), [spec.parsed, draft?.parsed ?? null]),
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

/** 校验一段 YAML（可先套用编辑页的一处修改）并预演；不写任何文件。`files` 是还没落盘的文档正文。 */
export function validateSpecEdit(
  deps: CommandDeps,
  a: { team: string; yaml: string; set?: SpecEditOp; files?: Record<string, string> },
): SpecEditResult {
  const row = teamOf(deps, a.team)
  assertSpecSize(a.yaml)
  // applySpecOp 已把缺省 op 转给 setField，这里不再分叉
  const yaml = a.set ? applySpecOp(a.yaml, a.set) : a.yaml
  assertSpecSize(yaml)
  const { spec, parsed, errors } = validateSpecText(yaml, row.specPath, { virtualFiles: new Set(Object.keys(a.files ?? {})) })
  const preview = spec ? planSpecChange(currentSpec(row.specPath), spec, { running: row.status === 'up', specPath: row.specPath }) : null
  return { yaml, parsed, errors, preview }
}

export interface SaveSpecArgs {
  team: string
  yaml: string
  baseHash: string | null
  running: boolean
  files?: Record<string, string>
  retryRequest?: string
}

const docFiles = (files: Record<string, string> | undefined): Record<string, string> => {
  if (files === undefined) return {}
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.values(files).every((v) => typeof v === 'string')) {
    throw new WinglineError('input', 'invalid_param', '参数 files 不合法')
  }
  return files
}

/** 先校验规格、再查冲突（冲突时一个字节都不写）、最后把文档写到磁盘；team.yaml 由随后的 saveSpec 写。 */
function writeDocs(specPath: string, yaml: string, files: Record<string, string>, a: { baseHash: string | null; running: boolean }): string[] {
  const { parsed, errors } = validateSpecText(yaml, specPath, { virtualFiles: new Set(Object.keys(files)) })
  if (errors.length > 0) throw new WinglineError('input', 'spec_invalid', errors[0]!.message, { detail: { errors } })
  checkSaveConflict({ specPath, text: yaml, baseHash: a.baseHash, running: a.running })
  const referenced = new Set(docRelsOf(parsed))
  for (const rel of Object.keys(files)) {
    if (!referenced.has(rel)) throw new WinglineError('input', 'doc_not_referenced', `文档 ${rel} 没有被团队规格引用`)
  }
  const dir = path.dirname(specPath)
  const docsUpdated: string[] = []
  for (const [rel, content] of Object.entries(files)) {
    writeDocAtomic(resolveDocPath(dir, rel), content)
    docsUpdated.push(rel)
  }
  return docsUpdated
}

/** 保存规格；两次保存相同内容天然幂等，所以 retryRequest 只是被路由校验格式，这里不用。 */
export async function saveSpecCmd(deps: CommandDeps, a: SaveSpecArgs): Promise<{ wrote: 'draft' | 'spec'; path: string; hash: string; docsUpdated: string[] }> {
  const row = teamOf(deps, a.team)
  if (a.running !== (row.status === 'up')) {
    throw new WinglineError('input', 'spec_conflict', '团队状态已变化，请重新加载')
  }
  assertSpecSize(a.yaml)
  const files = docFiles(a.files)
  const docsUpdated = writeDocs(row.specPath, a.yaml, files, { baseHash: a.baseHash, running: a.running })
  const res = saveSpec({ specPath: row.specPath, text: a.yaml, baseHash: a.baseHash, running: a.running })
  return { ...res, docsUpdated }
}

export async function discardDraftCmd(deps: CommandDeps, a: { team: string; retryRequest?: string }): Promise<{ discarded: boolean }> {
  return discardDraft(teamOf(deps, a.team).specPath)
}
