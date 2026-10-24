import path from 'node:path'
import type { TeamSpec } from './load.js'

export type PostChange = {
  id: string
  kind: 'added' | 'kept' | 'launch_changed' | 'removed' | 'brief_changed'
  fields?: string[]
}

export interface SpecPlan {
  posts: PostChange[]
  fields: Array<{ path: string; before: unknown; after: unknown }>
  commands: string[]
  closeSuggested: boolean
}

type Post = TeamSpec['posts'][number]

const LAUNCH_FIELDS = ['agent', 'launch', 'model', 'worktree', 'environment'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function classify(cur: Post | undefined, next: Post, dir: { cur: string; next: string }): PostChange {
  if (!cur) return { id: next.id, kind: 'added' }
  const launch = LAUNCH_FIELDS.filter((f) => !same(cur[f], next[f]))
  if (launch.length > 0) return { id: next.id, kind: 'launch_changed', fields: [...launch] }
  const rel = (p: Post, d: string) => p.briefPaths.map((b) => path.relative(d, b))
  if (!same(rel(cur, dir.cur), rel(next, dir.next))) return { id: next.id, kind: 'brief_changed', fields: ['brief'] }
  return { id: next.id, kind: 'kept' }
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function snakeKeys(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [snake(k), snakeKeys(x)]))
}

/** 把 TeamSpec 还原成 YAML 里的字段形态，供按字段比较。 */
function fieldView(s: TeamSpec): Record<string, unknown> {
  const links: Record<string, Record<string, string[]>> = {}
  const gates: Record<string, string> = {}
  for (const p of s.posts) {
    const l = { reviewed_by: p.reviewedBy, hands_to: p.handsTo, consults: p.consults ?? [] }
    const filled = Object.fromEntries(Object.entries(l).filter(([, v]) => v.length > 0))
    if (Object.keys(filled).length > 0) links[p.id] = filled
    if (p.gate) gates[p.id] = p.gate
  }
  return { lead: s.lead, links, gates, budgets: snakeKeys(s.budgets), patrol: snakeKeys(s.patrol) }
}

function flatten(v: unknown, prefix: string, out: Map<string, unknown>): void {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out)
  } else {
    out.set(prefix, v)
  }
}

function diffFields(cur: TeamSpec | null, next: TeamSpec): SpecPlan['fields'] {
  if (!cur) return []
  const a = new Map<string, unknown>()
  const b = new Map<string, unknown>()
  flatten(fieldView(cur), '', a)
  flatten(fieldView(next), '', b)
  return [...new Set([...a.keys(), ...b.keys()])]
    .filter((k) => !same(a.get(k), b.get(k)))
    .map((k) => ({ path: k, before: a.get(k) ?? null, after: b.get(k) ?? null }))
}

/** 预演一次规格变更：岗位去向、字段差异、要执行的命令。纯函数。 */
export function planSpecChange(current: TeamSpec | null, next: TeamSpec, o: { running: boolean; specPath: string }): SpecPlan {
  const dirs = { cur: current?.dir ?? next.dir, next: next.dir }
  const posts: PostChange[] = next.posts.map((p) => classify(current?.posts.find((c) => c.id === p.id), p, dirs))
  for (const c of current?.posts ?? []) {
    if (!next.posts.some((p) => p.id === c.id)) posts.push({ id: c.id, kind: 'removed' })
  }
  return {
    posts,
    fields: diffFields(current, next),
    commands: o.running ? [`wl down ${next.name}`, `wl up ${o.specPath} --draft`] : [`wl up ${o.specPath}`],
    closeSuggested: posts.some((p) => p.kind === 'launch_changed' || p.kind === 'removed'),
  }
}
