import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { TeamSpec } from './load.js'

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** CRLF 与 LF 视为相同，避免 Windows 检出换行影响哈希。 */
const contentHash = (buf: Buffer) => sha256(buf.toString('utf8').replace(/\r\n/g, '\n'))

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, x]) => [k, canonical(x)]),
    )
  }
  return v
}

export function specHash(spec: TeamSpec, readFile: (p: string) => Buffer = (p) => fs.readFileSync(p)): string {
  const rel = (p: string) => path.relative(spec.dir, p).split(path.sep).join('/')
  const ref = (p: string) => ({ path: rel(p), sha256: contentHash(readFile(p)) })
  const normalised = {
    version: spec.version,
    name: spec.name,
    repo: spec.repo,
    lead: spec.lead,
    norms: ref(spec.normsPath),
    posts: spec.posts.map((p) => ({
      id: p.id,
      agent: p.agent,
      model: p.model ?? null,
      launch: p.launch,
      worktree: p.worktree,
      brief: p.briefPaths.map(ref),
      selfClaim: p.selfClaim,
      tags: p.tags,
      planFirst: p.planFirst,
      gate: p.gate,
      reviewedBy: p.reviewedBy,
      handsTo: p.handsTo,
      consults: p.consults ?? [],
    })),
    budgets: spec.budgets,
    patrol: spec.patrol,
  }
  return sha256(JSON.stringify(canonical(normalised)))
}
