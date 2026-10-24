import fs from 'node:fs'
import os from 'node:os'
import { expect, test } from 'vitest'
import { findSession, markerHighlighted, samePath } from '../../../src/commands/restore/find-session.js'
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

test('a session reserved by an earlier post in the same batch is excluded', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's1', cwd: '/wt' })
  // 复审 I-4：前一个岗位刚接回 s1（dry-run 尚未落库），后一个岗位不得再接同一个会话
  expect(await findSession(deps, postRow(), '/wt', undefined, ['s1'])).toEqual({ kind: 'none', reason: '未找到原会话' })
})

test('markerHighlighted: only the whole marker highlighted counts, case-insensitively and across split tokens', () => {
  expect(markerHighlighted('会话标记：[[WLS-aaaa1111]]', 'WLS-aaaa1111')).toBe(true)
  expect(markerHighlighted('marker [[wls]] [[aaaa1111]] here', 'WLS-aaaa1111')).toBe(true)
  expect(markerHighlighted('usr local bin orca [[wls]] 1d14cc3f agent fresh json dev null', 'WLS-f4ce035e')).toBe(false)
  expect(markerHighlighted('[[wls]] aaaa1111', 'WLS-aaaa1111')).toBe(false)
  expect(markerHighlighted('[[WLS-bbbb2222]]', 'WLS-aaaa1111')).toBe(false)
  expect(markerHighlighted(null, 'WLS-aaaa1111')).toBe(false)
})

// 真机回执（search-claude.json）：标记从未写进任何会话，Orca 仍按部分 token `wls` 召回了一个同 cwd 的会话。
test('a hit whose evidence highlights only part of the marker is dropped', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-old', cwd: '/wt', snippet: 'usr local bin orca [[wls]] 1d14cc3f agent fresh json dev null' })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'none', reason: '未找到原会话' })
})

test('previous-generation session with a partial hit does not make the current one ambiguous', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  o.sessions.push(
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-old', cwd: '/wt', snippet: '会话标记：[[wls]] 9999eeee' },
    { marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 's-new', cwd: '/wt', snippet: '会话标记：[[WLS-aaaa1111]]' },
  )
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 's-new', via: 'search' })
})

test('search failure → uncertain, never none', async () => {
  const o = new FakeOrca()
  o.searchError = new WinglineError('uncertain', 'timeout', 'x')
  const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt')).toMatchObject({ kind: 'uncertain' })
})

// —— 3D-2：远端环境 ——

const ENV = 'lima-agent'
const M = 'WLS-aaaa1111'
const remote = (over: Record<string, unknown> = {}) => ({ marker: M, agent: 'claude', sessionId: 'vm-1', cwd: '/wt', environment: ENV, ...over })

test('environment post: searches with --environment and ignores a local session with the same marker', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push({ marker: M, agent: 'claude', sessionId: 'local-1', cwd: '/wt' }, remote())
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'found', sessionId: 'vm-1', via: 'search' })
  expect(o.searches).toEqual([{ query: `"${M}"`, agent: 'claude', environment: ENV }])
})

test('local post (no environment) still searches without it and ignores remote sessions', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote(), { marker: M, agent: 'claude', sessionId: 'local-1', cwd: '/wt' })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 'local-1', via: 'search' })
  expect(o.searches).toEqual([{ query: `"${M}"`, agent: 'claude' }])
})

test('environment post: override and cached session id win without any search', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt', 'over-1', [], ENV)).toEqual({ kind: 'found', sessionId: 'over-1', via: 'override' })
  expect(await findSession(deps, postRow({ sessionId: 'c-1' }), '/wt', undefined, [], ENV)).toEqual({ kind: 'found', sessionId: 'c-1', via: 'cached' })
  expect(o.searches).toEqual([])
})

test('environment post: a highlighted hit whose cwd is a VM path is uncertain, never none', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote({ cwd: '/home/user/wt' }))
  const r = await findSession(deps, postRow(), '/wt', undefined, [], ENV)
  expect(r).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('--session') })
  expect((r as { reason: string }).reason).toContain('cwd')
  expect((r as { reason: string }).reason).toContain('wl restore duo --session builder=')
})

test('environment post: hits without evidence are uncertain; a clean miss is none; a partial-token hit is not a marker hit', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'none', reason: '未找到原会话' })
  o.sessions.push(remote({ snippet: null }))
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('证据') })
  o.sessions.length = 0
  o.sessions.push(remote({ snippet: 'x [[wls]] y' }))
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'none', reason: '未找到原会话' })
})

test('local post: a hit without evidence is still just not a match (3A behaviour unchanged)', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push({ marker: M, agent: 'claude', sessionId: 'local-1', cwd: '/wt', snippet: null })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'none', reason: '未找到原会话' })
})

test('environment post: two matching sessions are ambiguous; a session reserved by an earlier post is skipped', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote(), remote({ sessionId: 'vm-2' }))
  const both = await findSession(deps, postRow(), '/wt', undefined, [], ENV)
  expect(both.kind).toBe('ambiguous')
  expect(await findSession(deps, postRow(), '/wt', undefined, ['vm-2'], ENV)).toEqual({ kind: 'found', sessionId: 'vm-1', via: 'search' })
})

test('environment unreachable (orca error) is uncertain with a rerun hint; an unknown environment (input error) is thrown', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.searchError = new WinglineError('orca', 'runtime_unavailable', 'tunnel down')
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('wl restore duo') })
  o.searchError = new WinglineError('input', 'environment_not_found', 'no such environment')
  await expect(findSession(deps, postRow(), '/wt', undefined, [], ENV)).rejects.toMatchObject({ code: 'environment_not_found' })
})

