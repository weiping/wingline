import fs from 'node:fs'
import os from 'node:os'
import { expect, test } from 'vitest'
import { findSession, samePath } from '../../../src/commands/restore/find-session.js'
import type { PostRow } from '../../../src/registry/registry.js'
import { WinglineError } from '../../../src/errors.js'
import { FakeOrca, mkDeps } from '../fake-client.js'

const postRow = (over: Partial<PostRow> = {}): PostRow => ({
  address: 'builder@duo', team: 'duo', agent: 'claude',
  worktree: 'current', handle: null, status: 'offline', isLead: true,
  sessionMarker: 'WLS-aaaa1111', sessionId: null, sessionAt: null, ...over,
})

test('override wins, then cached session id, then search', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  // override 优先：即使缓存里也有 session id
  const both = await findSession(deps, postRow({ sessionId: 'cached-1' }), '/wt', 'over-1')
  expect(both).toEqual({ kind: 'found', sessionId: 'over-1', via: 'override' })
  // 缓存优先于搜索，且不调用 search
  o.calls.length = 0
  expect(await findSession(deps, postRow({ sessionId: 'cached-1' }), '/wt')).toEqual({ kind: 'found', sessionId: 'cached-1', via: 'cached' })
  expect(o.calls).toEqual([])
  // 无缓存 → 搜索
  o.sessions.push({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's1', cwd: '/wt' })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 's1', via: 'search' })
})

test('invalid override id is rejected', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  await expect(findSession(deps, postRow(), '/wt', 'x; rm')).rejects.toMatchObject({ code: 'session_override_invalid' })
})

test('search keeps only hits whose cwd is the post worktree', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push(
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-wt', cwd: '/wt' },
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-other', cwd: '/other' },
  )
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 's-wt', via: 'search' })
})

test('hits with a different agent are not returned', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push({ marker: 'WLS-aaaa1111', agent: 'codex', sessionId: 's-codex', cwd: '/wt' })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'none', reason: '未找到原会话' })
})

test('cwd under a symlinked prefix still matches (macOS /private/tmp)', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const worktree = fs.mkdtempSync(fs.realpathSync(os.tmpdir()) + '/wt-')
  o.sessions.push({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's1', cwd: worktree })
  // 传个带符号链接前缀的路径：两边 realpath 归一后匹配
  expect(await findSession(deps, postRow(), os.tmpdir() + worktree.replace(fs.realpathSync(os.tmpdir()), ''))).toEqual({ kind: 'found', sessionId: 's1', via: 'search' })
  expect(samePath(os.tmpdir() + '/x', os.tmpdir() + '/x')).toBe(true)
})

test('zero hits → none with reason 未找到原会话; no marker → none with reason 阶段 3 之前启动', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'none', reason: '未找到原会话' })
  expect(await findSession(deps, postRow({ sessionMarker: null }), '/wt')).toEqual({ kind: 'none', reason: '该岗位在阶段 3 之前启动，没有会话标记' })
})

test('more than one matching hit → ambiguous with candidates', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push(
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's1', cwd: '/wt', updatedAt: '2026-10-16T01:00:00Z', messageCount: 5 },
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's2', cwd: '/wt', updatedAt: '2026-10-16T02:00:00Z', messageCount: 9 },
  )
  expect(await findSession(deps, postRow(), '/wt')).toEqual({
    kind: 'ambiguous',
    candidates: [
      { sessionId: 's1', updatedAt: '2026-10-16T01:00:00Z', messageCount: 5 },
      { sessionId: 's2', updatedAt: '2026-10-16T02:00:00Z', messageCount: 9 },
    ],
  })
})

test('a hit already bound to another post of the team is excluded before counting', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  registry.upsertTeam({ name: 'duo', specPath: '/t/team.yaml', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  registry.upsertPost({
    address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: null, status: 'offline',
    isLead: false, sessionMarker: null, sessionId: 's-other', sessionAt: null,
  })
  o.sessions.push(
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-other', cwd: '/wt' },
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's1', cwd: '/wt' },
  )
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 's1', via: 'search' })
})

test('search failure → uncertain, never none', async () => {
  const o = new FakeOrca()
  o.searchError = new WinglineError('uncertain', 'timeout', 'x')
  const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt')).toMatchObject({ kind: 'uncertain' })
})
