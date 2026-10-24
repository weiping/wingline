import fs from 'node:fs'
import { WinglineError } from '../../errors.js'
import type { SearchHit } from '../../orca/types.js'
import type { PostRow } from '../../registry/registry.js'
import type { CommandDeps } from '../deps.js'
import { SESSION_ID } from './resume-command.js'

export type SessionLookup =
  | { kind: 'found'; sessionId: string; via: 'override' | 'cached' | 'search' }
  | { kind: 'none'; reason: string }
  | { kind: 'ambiguous'; candidates: Array<{ sessionId: string; updatedAt: string | null; messageCount: number | null }> }
  | { kind: 'uncertain'; reason: string }

/** 两边都解析真实路径再比较（macOS 的 /tmp 与 /private/tmp 归一）；路径不存在时用原值。 */
export function samePath(a: string, b: string): boolean {
  const real = (p: string) => { try { return fs.realpathSync(p) } catch { return p } }
  return real(a) === real(b)
}

/**
 * 整串高亮判据：Orca search 会把 `WLS-xxxx` 拆成 token，整串不在索引里时按部分 token（如 `wls`）
 * 召回任何含该 token 的会话（真机回执 search-claude：snippet 只高亮了 `[[wls]]`）。
 * 只有标记的每个字符都落在高亮区间里，才认定这条会话真的包含该标记；
 * snippet 为 null（如 --environment 命中扣留 evidence）一律不认。
 * 小写化并去掉非字母数字后比较；相邻高亮区间拼接视为一个（高亮可能把拆开的 token 分开渲染）。
 */
export function markerHighlighted(snippet: string | null, marker: string): boolean {
  if (snippet === null) return false
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const want = norm(marker)
  if (!want) return false
  const spans = [...snippet.matchAll(/\[\[([^\]]*)\]\]/g)].map((m) => norm(m[1]!)).filter(Boolean)
  return spans.includes(want) || spans.join('') === want
}

/**
 * 过了“未被占用”与“标记整串高亮”两道闸之后的判定（第三道闸：cwd 是岗位 worktree）。
 * 远端岗位不静默退回 none（会新起一个丢上下文的会话）：标记已高亮但 cwd 对不上（没有把宿主路径同路径挂进 VM 的环境里，
 * cwd 是 VM 内路径），或命中没有 evidence（旧版 Orca 扣留 snippet），都交给人用 --session 指定。
 */
function pick(
  hits: SearchHit[], o: { marker: string; worktreePath: string; taken: Set<string>; remote: boolean; team: string; post: string },
): SessionLookup {
  const free = hits.filter((h) => !o.taken.has(h.sessionId))
  const marked = free.filter((h) => markerHighlighted(h.snippet, o.marker))
  const matching = marked.filter((h) => h.cwd !== null && samePath(h.cwd, o.worktreePath))
  if (matching.length === 1) return { kind: 'found', sessionId: matching[0]!.sessionId, via: 'search' }
  if (matching.length > 1) {
    return { kind: 'ambiguous', candidates: matching.map((h) => ({ sessionId: h.sessionId, updatedAt: h.updatedAt, messageCount: h.messageCount })) }
  }
  const hint = `用 wl restore ${o.team} --session ${o.post}=<会话ID> 指定`
  if (o.remote && marked.length > 0) {
    return { kind: 'uncertain', reason: `远端环境里有会话包含该标记，但它们的 cwd 与岗位 worktree（${o.worktreePath}）不一致或为空；确认后${hint}` }
  }
  if (o.remote && free.some((h) => h.snippet === null)) {
    return { kind: 'uncertain', reason: `远端环境的搜索命中没有证据（snippet），无法确认是不是该岗位的会话；确认后${hint}` }
  }
  return { kind: 'none', reason: '未找到原会话' }
}

/**
 * 确定失效岗位要接回的会话：override > 缓存的 session_id > 按标记搜索。
 * 搜索只保留 cwd 是本岗位 worktree、且证据高亮覆盖标记整串的命中（cwd 为 null 的命中排除），
 * 并在计数前剔除已被本团队其他岗位登记为 session_id 的会话（复审 I-2），
 * 以及本批次里前面岗位刚认领、但尚未落库的会话（复审 I-4）。
 * 写了 environment 的岗位（3D）改在该环境里搜索（`--environment`），判定见 pick。
 */
export async function findSession(
  deps: CommandDeps, post: PostRow, worktreePath: string, override?: string, reserved: string[] = [], environment?: string,
): Promise<SessionLookup> {
  if (override !== undefined) {
    if (!SESSION_ID.test(override)) {
      throw new WinglineError('input', 'session_override_invalid', `会话 ID ${override} 含非法字符`, { hint: '只接受字母、数字与连字符' })
    }
    return { kind: 'found', sessionId: override, via: 'override' }
  }
  if (post.sessionId) return { kind: 'found', sessionId: post.sessionId, via: 'cached' }
  if (!post.sessionMarker) return { kind: 'none', reason: '该岗位在阶段 3 之前启动，没有会话标记' }
  const marker = post.sessionMarker

  let hits
  try {
    hits = await deps.orca.search({ query: `"${post.sessionMarker}"`, agent: post.agent, ...(environment !== undefined ? { environment } : {}) })
  } catch (err) {
    if (!(err instanceof WinglineError)) throw err
    const reason = `会话搜索失败：${err.message}；重跑 wl restore ${post.team}`
    if (err.kind === 'input' || err.kind === 'internal') throw err
    return { kind: 'uncertain', reason }
  }
  const taken = new Set([
    ...deps.registry.listPosts(post.team).filter((p) => p.address !== post.address && p.sessionId).map((p) => p.sessionId!),
    ...reserved,
  ])
  return pick(hits, { marker, worktreePath, taken, remote: environment !== undefined, team: post.team, post: post.address.split('@')[0]! })
}
