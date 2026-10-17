import fs from 'node:fs'
import { WinglineError } from '../../errors.js'
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
 * 确定失效岗位要接回的会话：override > 缓存的 session_id > 按标记搜索。
 * 搜索只保留 cwd 是本岗位 worktree、且证据高亮覆盖标记整串的命中（cwd 为 null 的命中本阶段排除，3D 放宽），
 * 并在计数前剔除已被本团队其他岗位登记为 session_id 的会话（复审 I-2），
 * 以及本批次里前面岗位刚认领、但尚未落库的会话（复审 I-4）。
 */
export async function findSession(deps: CommandDeps, post: PostRow, worktreePath: string, override?: string, reserved: string[] = []): Promise<SessionLookup> {
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
    hits = await deps.orca.search({ query: `"${post.sessionMarker}"`, agent: post.agent })
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
  const matching = hits.filter((h) => h.cwd !== null && samePath(h.cwd, worktreePath) && !taken.has(h.sessionId) && markerHighlighted(h.snippet, marker))
  if (matching.length === 1) return { kind: 'found', sessionId: matching[0]!.sessionId, via: 'search' }
  if (matching.length === 0) return { kind: 'none', reason: '未找到原会话' }
  return {
    kind: 'ambiguous',
    candidates: matching.map((h) => ({ sessionId: h.sessionId, updatedAt: h.updatedAt, messageCount: h.messageCount })),
  }
}
