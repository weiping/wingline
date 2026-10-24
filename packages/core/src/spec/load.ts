import fs from 'node:fs'
import path from 'node:path'
import { LineCounter, parseDocument, type Document } from 'yaml'
import { WinglineError } from '../errors.js'
import { teamSchema, type RawTeam } from './schema.js'

export interface PostSpec {
  id: string
  agent: string
  model?: string
  launch: string
  /** Orca 里已配对环境的名字（如 Lima VM）；未写即本机，此时没有这个键，也不进规格哈希。 */
  environment?: string
  worktree: string
  briefPaths: string[]
  selfClaim: boolean
  tags: string[]
  planFirst: boolean
  gate: string | null
  reviewedBy: string[]
  handsTo: string[]
  consults?: string[]
}

export interface TaskBudgets {
  maxGateFailures: number
  gateTimeoutSeconds: number
  maxMinutes: number | null
}

export interface PatrolSpec {
  noProgressMinutes: number
  promptMinutes: number
  ownerIdleMinutes: number
  postFailureStreak: number
  freezeLead: boolean
  autoRecover: boolean
  worktreeComment: boolean
  /** 同步岗位所在 worktree 的工作区状态（默认开）；取默认值不进规格哈希。 */
  workspaceStatus: boolean
  /** 有新待办时给牵头岗所在 worktree 打未读标记（默认开）；取默认值不进规格哈希。 */
  unreadMark: boolean
  notify: { webhook: string } | { command: string[] } | null
}

export const DEFAULT_PATROL: PatrolSpec = {
  noProgressMinutes: 20,
  promptMinutes: 5,
  ownerIdleMinutes: 30,
  postFailureStreak: 3,
  freezeLead: false,
  autoRecover: false,
  worktreeComment: false,
  workspaceStatus: true,
  unreadMark: true,
  notify: null,
}

export interface TeamSpec {
  version: 1
  name: string
  repo: string
  normsPath: string
  lead: string
  posts: PostSpec[]
  budgets: { task: TaskBudgets }
  patrol: PatrolSpec
  dir: string
  specPath: string
}

/** 按 agent 生成带 model 的启动命令；其他 agent 要求用户写 launch。 */
const MODEL_FLAG_AGENTS = new Set(['claude', 'codex'])

type Path = Array<string | number>

/** 校验错误的字段路径与行号；不放进 WinglineError，保持抛出的错误与原来完全一致。 */
const locations = new WeakMap<WinglineError, { path: Path; line: number | null }>()

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
    const err = new WinglineError('input', code, `${where}：${msg}`, { hint })
    locations.set(err, { path: p, line: line ?? null })
    throw err
  }
}

const toPosix = (p: string) => p.replace(/\\/g, '/')

function parseYamlText(source: string, specPath: string): { raw: unknown; at: Located } {
  const lines = new LineCounter()
  const doc = parseDocument(source, { lineCounter: lines })
  const at = new Located(specPath, doc, lines)
  const err = doc.errors[0]
  if (err) {
    const line = err.linePos?.[0]?.line
    const e = new WinglineError('input', 'spec_invalid', `${specPath}${line ? ` 第 ${line} 行` : ''}：${err.message}`)
    locations.set(e, { path: [], line: line ?? null })
    throw e
  }
  return { raw: doc.toJS(), at }
}

function validate(raw: unknown, at: Located): RawTeam {
  const parsed = teamSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const field = issue.path.join('.') || '(根)'
    at.fail('spec_invalid', issue.path as Path, `${field}：${issue.message}`)
  }
  if (parsed.data.budgets.team !== undefined) {
    at.fail('field_removed', ['budgets', 'team'], 'budgets.team.max_in_progress_per_post 已取消：Orca 限定每个岗位终端同时只有一个进行中的派发')
  }
  return parsed.data
}

type Links = RawTeam['links']

function checkLinks(links: Links, ids: Set<string>, at: Located): void {
  for (const [key, entry] of Object.entries(links)) {
    if (!ids.has(key)) at.fail('links_unknown_post', ['links', key], `links 中的岗位 ${key} 不在 posts 中`)
    if (entry.reviewed_by?.length && entry.hands_to?.length) {
      at.fail('links_conflict', ['links', key], `岗位 ${key} 不能同时有 reviewed_by 与 hands_to`)
    }
    for (const rel of ['reviewed_by', 'hands_to', 'consults'] as const) {
      for (const target of entry[rel] ?? []) {
        if (!ids.has(target)) at.fail('links_unknown_post', ['links', key, rel], `links.${key}.${rel} 引用了不存在的岗位 ${target}`)
        if (target === key) at.fail('links_self', ['links', key, rel], `岗位 ${key} 不能通过 ${rel} 链接自己`)
      }
    }
  }
}

/** hands_to 图上找环（白/灰/黑三色 DFS），返回环上的 id，首尾相同；无环返回 null。 */
export function findHandsToCycle(links: Links): string[] | null {
  const color = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (id: string): string[] | null => {
    color.set(id, 1)
    stack.push(id)
    for (const next of links[id]?.hands_to ?? []) {
      if (color.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next]
      if (!color.has(next)) {
        const cycle = visit(next)
        if (cycle) return cycle
      }
    }
    stack.pop()
    color.set(id, 2)
    return null
  }
  for (const id of Object.keys(links)) {
    if (color.has(id)) continue
    const cycle = visit(id)
    if (cycle) return cycle
  }
  return null
}

function crossCheck(team: RawTeam, at: Located): void {
  const seen = new Set<string>()
  team.posts.forEach((p, i) => {
    if (seen.has(p.id)) at.fail('spec_invalid', ['posts', i, 'id'], `岗位 id 重复：${p.id}`)
    seen.add(p.id)
  })
  if (!seen.has(team.lead)) at.fail('lead_unknown', ['lead'], `lead ${team.lead} 不是 posts 中的岗位`)
  checkLinks(team.links, seen, at)
  for (const id of Object.keys(team.gates)) {
    if (!seen.has(id)) at.fail('gates_unknown_post', ['gates', id], `gates 中的岗位 ${id} 不在 posts 中`)
  }
  const cycle = findHandsToCycle(team.links)
  if (cycle) at.fail('links_cycle', ['links'], `hands_to 形成环：${cycle.join(' → ')}`)
}

function patrolOf(raw: RawTeam['patrol'], platform: NodeJS.Platform, at: Located): PatrolSpec {
  const n = raw.notify
  if (n && Boolean(n.webhook) === Boolean(n.command)) {
    at.fail('notify_conflict', ['patrol', 'notify'], 'patrol.notify 里 webhook 与 command 必须恰好填一个')
  }
  if (n?.command && platform === 'win32' && /\.(cmd|bat)$/i.test(n.command[0]!)) {
    at.fail('notify_command_unsupported', ['patrol', 'notify', 'command', 0], 'Windows 上 .cmd/.bat 只能经 shell 启动，不支持作为 patrol.notify.command', '改用 .exe，或用 webhook')
  }
  return {
    noProgressMinutes: raw.no_progress_minutes,
    promptMinutes: raw.prompt_minutes,
    ownerIdleMinutes: raw.owner_idle_minutes,
    postFailureStreak: raw.post_failure_streak,
    freezeLead: raw.freeze_lead,
    autoRecover: raw.auto_recover,
    worktreeComment: raw.worktree_comment,
    workspaceStatus: raw.workspace_status,
    unreadMark: raw.unread_mark,
    notify: !n ? null : n.webhook ? { webhook: n.webhook } : { command: n.command! },
  }
}

const ENVIRONMENT = /^[a-z0-9._-]{1,64}$/

function environmentOf(p: RawTeam['posts'][number], i: number, at: Located): { environment?: string } {
  if (p.environment === undefined) return {}
  if (!ENVIRONMENT.test(p.environment)) {
    at.fail('environment_invalid', ['posts', i, 'environment'], `posts.${i}.environment：只能用小写字母、数字、连字符、下划线和点，1–64 个字符`, '环境名见 orca environment list')
  }
  return { environment: p.environment }
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

export type SpecError = { path: Array<string | number>; code: string; message: string; line: number | null }

/** 从字符串校验团队规格；文件引用相对 specPath 所在目录解析。错误至多一条（遇到第一处即停）。 */
export function validateSpecText(
  text: string,
  specPath: string,
  o: { platform?: NodeJS.Platform } = {},
): { spec: TeamSpec | null; parsed: unknown | null; errors: SpecError[] } {
  const abs = path.resolve(specPath)
  const toError = (e: unknown): SpecError => {
    if (!(e instanceof WinglineError)) throw e
    const at = locations.get(e)
    return { path: at?.path ?? [], code: e.code, message: e.message, line: at?.line ?? null }
  }
  let parsed: { raw: unknown; at: Located }
  try {
    parsed = parseYamlText(text, abs)
  } catch (e) {
    return { spec: null, parsed: null, errors: [toError(e)] }
  }
  try {
    return { spec: specFromRaw(parsed.raw, parsed.at, abs, o.platform ?? process.platform), parsed: parsed.raw, errors: [] }
  } catch (e) {
    return { spec: null, parsed: parsed.raw, errors: [toError(e)] }
  }
}

export function loadTeamSpec(specPath: string, o: { platform?: NodeJS.Platform } = {}): TeamSpec {
  const abs = path.resolve(specPath)
  let source: string
  try {
    source = fs.readFileSync(abs, 'utf8')
  } catch (cause) {
    throw new WinglineError('input', 'spec_not_found', `读不到团队规格 ${abs}`, { cause })
  }
  const { raw, at } = parseYamlText(source, abs)
  return specFromRaw(raw, at, abs, o.platform ?? process.platform)
}

function specFromRaw(raw: unknown, at: Located, abs: string, platform: NodeJS.Platform): TeamSpec {
  const dir = path.dirname(abs)
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
      ...environmentOf(p, i, at),
      worktree: p.worktree,
      briefPaths: p.brief.map((b, j) => resolveFile(dir, b, at, ['posts', i, 'brief', j])),
      selfClaim: p.self_claim,
      tags: p.tags,
      planFirst: p.plan_first,
      gate: team.gates[p.id] ?? null,
      reviewedBy: team.links[p.id]?.reviewed_by ?? [],
      handsTo: team.links[p.id]?.hands_to ?? [],
      consults: team.links[p.id]?.consults ?? [],
    })),
    budgets: {
      task: {
        maxGateFailures: team.budgets.task.max_gate_failures,
        gateTimeoutSeconds: team.budgets.task.gate_timeout_seconds,
        maxMinutes: team.budgets.task.max_minutes ?? null,
      },
    },
    patrol: patrolOf(team.patrol, platform, at),
    dir,
    specPath: abs,
  }
}
