import fs from 'node:fs'
import path from 'node:path'
import { LineCounter, parseDocument, type Document } from 'yaml'
import { WinglineError } from '../errors.js'
import { RESERVED_POST, RESERVED_TOP, teamSchema, type RawTeam } from './schema.js'

export interface PostSpec {
  id: string
  agent: string
  model?: string
  launch: string
  worktree: string
  briefPaths: string[]
}

export interface TeamSpec {
  version: 1
  name: string
  repo: string
  normsPath: string
  lead: string
  posts: PostSpec[]
  dir: string
  specPath: string
}

/** 按 agent 生成带 model 的启动命令；其他 agent 要求用户写 launch。 */
const MODEL_FLAG_AGENTS = new Set(['claude', 'codex'])

type Path = Array<string | number>

class Located {
  constructor(
    private readonly file: string,
    private readonly doc: Document,
    private readonly lines: LineCounter,
  ) {}

  line(p: Path): number | undefined {
    for (let n = p.length; n >= 0; n--) {
      const node = n === 0 ? this.doc.contents : this.doc.getIn(p.slice(0, n), true)
      const offset = (node as { range?: [number] } | null)?.range?.[0]
      if (offset !== undefined) return this.lines.linePos(offset).line
    }
    return undefined
  }

  fail(code: string, p: Path, msg: string, hint?: string): never {
    const line = this.line(p)
    const where = line === undefined ? this.file : `${this.file} 第 ${line} 行`
    throw new WinglineError('input', code, `${where}：${msg}`, { hint })
  }
}

const toPosix = (p: string) => p.replace(/\\/g, '/')

function rejectReserved(raw: unknown, at: Located): void {
  const top = raw as Record<string, unknown>
  for (const [key, phase] of Object.entries(RESERVED_TOP)) {
    if (key in top) at.fail('field_not_yet_available', [key], `字段 ${key} 在阶段 ${phase} 开放`)
  }
  const posts = Array.isArray(top.posts) ? top.posts : []
  posts.forEach((post, i) => {
    for (const [key, phase] of Object.entries(RESERVED_POST)) {
      if (post && typeof post === 'object' && key in post) {
        at.fail('field_not_yet_available', ['posts', i, key], `字段 ${key} 在阶段 ${phase} 开放`)
      }
    }
  })
}

function parseYaml(specPath: string): { raw: unknown; at: Located } {
  const lines = new LineCounter()
  const doc = parseDocument(fs.readFileSync(specPath, 'utf8'), { lineCounter: lines })
  const at = new Located(specPath, doc, lines)
  const err = doc.errors[0]
  if (err) {
    const line = err.linePos?.[0]?.line
    throw new WinglineError('input', 'spec_invalid', `${specPath}${line ? ` 第 ${line} 行` : ''}：${err.message}`)
  }
  return { raw: doc.toJS(), at }
}

function validate(raw: unknown, at: Located): RawTeam {
  rejectReserved(raw, at)
  const parsed = teamSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const field = issue.path.join('.') || '(根)'
    at.fail('spec_invalid', issue.path as Path, `${field}：${issue.message}`)
  }
  return parsed.data
}

function crossCheck(team: RawTeam, at: Located): void {
  const seen = new Set<string>()
  team.posts.forEach((p, i) => {
    if (seen.has(p.id)) at.fail('spec_invalid', ['posts', i, 'id'], `岗位 id 重复：${p.id}`)
    seen.add(p.id)
  })
  if (!seen.has(team.lead)) at.fail('lead_unknown', ['lead'], `lead ${team.lead} 不是 posts 中的岗位`)
}

function launchOf(p: RawTeam['posts'][number], i: number, at: Located): string {
  if (p.launch) return p.launch
  if (!p.model) return p.agent
  if (MODEL_FLAG_AGENTS.has(p.agent)) return `${p.agent} --model ${p.model}`
  return at.fail('launch_required', ['posts', i, 'model'], `agent ${p.agent} 指定了 model，请用 launch 指定完整启动命令`)
}

function resolveFile(dir: string, rel: string, at: Located, p: Path): string {
  const abs = path.resolve(dir, toPosix(rel))
  if (!fs.existsSync(abs)) at.fail('file_missing', p, `找不到文件 ${rel}（解析为 ${abs}）`)
  return abs
}

export function loadTeamSpec(specPath: string): TeamSpec {
  const abs = path.resolve(specPath)
  const dir = path.dirname(abs)
  const { raw, at } = parseYaml(abs)
  const team = validate(raw, at)
  crossCheck(team, at)
  return {
    version: 1,
    name: team.name,
    repo: team.repo,
    normsPath: resolveFile(dir, team.norms, at, ['norms']),
    lead: team.lead,
    posts: team.posts.map((p, i) => ({
      id: p.id,
      agent: p.agent,
      ...(p.model ? { model: p.model } : {}),
      launch: launchOf(p, i, at),
      worktree: p.worktree,
      briefPaths: p.brief.map((b, j) => resolveFile(dir, b, at, ['posts', i, 'brief', j])),
    })),
    dir,
    specPath: abs,
  }
}
