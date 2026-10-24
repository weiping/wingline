import os from 'node:os'
import { expect, test } from 'vitest'
import { WinglineError } from '../../../src/errors.js'
import { renderBriefing } from '../../../src/brief/render.js'
import type { PostRow } from '../../../src/registry/registry.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { specHash } from '../../../src/spec/hash.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps } from '../fake-client.js'
import { noticeToken, restoreKey, restorePost, resumeNotice, resumeToken, verifyLanding } from '../../../src/commands/restore/posts.js'
import type { Launch } from '../../../src/commands/launch.js'

/** 建一个 duo 团队：builder（claude，牵头岗）失效中、带标记 WLS-aaaa1111；worktree 已固定为 path:。 */
function seed(o: FakeOrca, builderOver: Partial<PostRow> = {}, yaml = DUO_YAML) {
  const { deps, registry } = mkDeps(o)
  const specPath = mkTeam(yaml)
  const spec = loadTeamSpec(specPath)
  const hash = specHash(spec)
  registry.upsertTeam({ name: 'duo', specPath, specHash: hash, runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up' })
  registry.upsertPost({
    address: 'builder@duo', team: 'duo', agent: 'claude', worktree: `path:${os.tmpdir()}`, handle: null, status: 'offline',
    isLead: true, sessionMarker: 'WLS-aaaa1111', sessionId: null, sessionAt: null, ...builderOver,
  })
  const l: Launch = { deps, spec, hash }
  return { o, deps, registry, spec, l, post: spec.posts.find((p) => p.id === 'builder')!, briefing: renderBriefing(spec, 'builder') }
}

const hit = (sessionId: string) => ({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId, cwd: os.tmpdir() })

test('a live post is kept with no Orca writes and no request rows', async () => {
  const s = seed(new FakeOrca())
  s.o.terminals.push({ handle: 'term-b', title: 'builder@duo', connected: true, worktreeId: 'wt-1' })
  expect(await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'kept' })
  expect(s.o.created).toEqual([])
  expect(s.o.sent).toEqual([])
  expect(s.o.calls).not.toContain('search')
  expect(s.registry.getRequest(restoreKey('duo', 'builder', 0, 'create'))).toBeNull()
})

test('a live post refreshes handle and status in the registry', async () => {
  const s = seed(new FakeOrca(), { handle: 'term-stale', status: 'uncertain' })
  s.o.terminals.push({ handle: 'term-live', title: 'builder@duo', connected: true, worktreeId: 'wt-1' })
  expect(await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'kept' })
  expect(s.registry.getPost('builder@duo')!.handle).toBe('term-live')
  expect(s.registry.getPost('builder@duo')!.status).toBe('live')
})

test('an oversized fresh briefing is rejected before any Orca write, even in .cmd mode', async () => {
  const s = seed(new FakeOrca())
  // .cmd 模式：briefing 落文件、发出去的是一行短指针——检查必须落在完整启动包上，且在任何副作用之前
  s.deps.multilineSafe = false
  await expect(restorePost(s.l, s.post, { dryRun: false, briefing: 'x'.repeat(13_000) }))
    .rejects.toMatchObject({ code: 'briefing_too_long' })
  expect(s.o.created).toEqual([])
  expect(s.o.sent).toEqual([])
})

test('a dead post with a found session is resumed with the resume command, notified once, and its session id cached', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 's1' })
  expect(s.o.created.at(-1)!.command).toBe('claude --model opus --resume s1')
  expect(s.o.sent).toEqual([{ handle: 'term-1', text: '[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。', retryRequest: undefined }])
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('s1')
  expect(s.registry.getPost('builder@duo')!.status).toBe('live')
})

test('a resumed terminal that is back at a shell prompt is uncertain, not live; the rerun re-checks and finishes once the agent is up', async () => {
  const s = seed(new FakeOrca())
  s.o.onCreate = () => { s.o.previews.set('term-1', 'user@host ~/repo % ') }
  s.o.sessions.push(hit('s1'))
  const first = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(first).toMatchObject({ outcome: 'uncertain', retry: 'wl restore duo' })
  expect(first.reason).toContain('shell')
  expect(s.registry.getPost('builder@duo')!.status).toBe('uncertain')
  expect(s.o.sent).toEqual([])
  s.o.previews.set('term-1', '❯ ')
  const second = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(second).toMatchObject({ outcome: 'resumed', sessionId: 's1' })
  expect(s.o.sent.length).toBe(1)
  expect(s.o.created.length).toBe(1)
  expect(s.registry.getPost('builder@duo')!.status).toBe('live')
})

test('resume notice is skipped (outcome still resumed) when the screen is not clear', async () => {
  const s = seed(new FakeOrca())
  s.o.onCreate = () => { s.o.previews.set('term-1', 'Do you want to proceed?\n❯ 1. Yes') }
  s.o.sessions.push(hit('s1'))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r.outcome).toBe('resumed')
  expect(r.noticeSkipped).toContain('at_prompt')
  expect(s.o.sent).toEqual([])
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('s1')
})

test('no session found → fresh launch with a new marker and the context-lost reason', async () => {
  const s = seed(new FakeOrca())
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r.outcome).toBe('fresh')
  expect(r.reason).toBe('未找到原会话，上下文已丢失')
  const marker = s.registry.getPost('builder@duo')!.sessionMarker!
  expect(marker).toMatch(/^WLS-[0-9a-f]{8}$/)
  expect(marker).not.toBe('WLS-aaaa1111')
  expect(s.o.sent[0]!.text).toContain(`会话标记：${marker}`)
  expect(s.registry.getPost('builder@duo')!.sessionId).toBeNull()
})

test('ambiguous → no terminal is created and candidates are listed with a --session retry', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'), { ...hit('s2'), updatedAt: '2026-10-16T01:00:00Z', messageCount: 9 })
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r.outcome).toBe('ambiguous')
  expect(r.candidates!.map((c) => c.sessionId)).toEqual(['s1', 's2'])
  expect(r.retry).toContain('--session')
  expect(s.o.created).toEqual([])
})

test('terminal never becomes idle → uncertain; while it stays unsettled a rerun is uncertain again, never kept, and nothing is created twice', async () => {
  const s = seed(new FakeOrca())
  s.o.waitSatisfied = false
  s.o.sessions.push(hit('s1'))
  const first = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(first.outcome).toBe('uncertain')
  const second = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(second.outcome).toBe('uncertain')
  expect(s.o.sent).toEqual([])
  expect(s.o.created.length).toBe(1)
})

test('an unsettled resume is finished on the rerun: wait, then the resume notice, then live — no second terminal', async () => {
  const s = seed(new FakeOrca())
  s.o.waitSatisfied = false
  s.o.sessions.push(hit('s1'))
  expect((await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })).outcome).toBe('uncertain')
  s.o.waitSatisfied = true
  const second = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(second).toMatchObject({ outcome: 'resumed', sessionId: 's1' })
  expect(s.o.sent.map((x) => x.text).join('\n')).toContain('重启后已接回本会话')
  expect(s.o.created.length).toBe(1)
  expect(s.registry.getPost('builder@duo')!.status).toBe('live')
  const third = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(third.outcome).toBe('kept')
  expect(s.o.sent.length).toBe(1)
})

test('dry run on a live post writes nothing to the registry', async () => {
  const s = seed(new FakeOrca(), { handle: 'term-stale', status: 'uncertain' })
  s.o.terminals.push({ handle: 'term-live', title: 'builder@duo', connected: true, worktreeId: 'wt-1' })
  expect(await restorePost(s.l, s.post, { dryRun: true, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'kept' })
  expect(s.registry.getPost('builder@duo')).toMatchObject({ handle: 'term-stale', status: 'uncertain' })
})

test('dry run reports the would-be outcome and makes no Orca writes', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  expect(await restorePost(s.l, s.post, { dryRun: true, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 's1' })
  const dead = seed(new FakeOrca())
  expect((await restorePost(dead.l, dead.post, { dryRun: true, briefing: dead.briefing })).outcome).toBe('fresh')
  for (const x of [s, dead]) {
    expect(x.o.created).toEqual([])
    expect(x.o.sent).toEqual([])
    expect(x.registry.getRequest(restoreKey('duo', 'builder', 0, 'create'))).toBeNull()
    expect(x.registry.getPost('builder@duo')!.sessionId).toBeNull()
  }
})

test('rerun after the resume notice was sent does not resend it', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  const again = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(again.outcome).toBe('kept')
  expect(s.o.sent.length).toBe(1)
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('s1')
})

test('a second Orca restart after a first restore creates a new terminal with the new session id', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  // 第二次重启：终端全没了；岗位用同一标记重开过会话，命中换成 s2，缓存已随标记刷新清空
  s.o.terminals = []
  s.o.sessions.length = 0
  s.o.sessions.push(hit('s2'))
  s.registry.setSessionMarker('builder@duo', 'WLS-aaaa1111', new Date().toISOString())
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 's2' })
  expect(s.o.created.length).toBe(2)
  expect(s.o.created.at(-1)!.command).toBe('claude --model opus --resume s2')
})

test('the lead is processed first and handle/status are updated', async () => {
  const s = seed(new FakeOrca())
  const checker = s.spec.posts.find((p) => p.id === 'checker')!
  s.registry.upsertPost({
    address: 'checker@duo', team: 'duo', agent: 'codex', worktree: `path:${os.tmpdir()}`, handle: null, status: 'offline',
    isLead: false, sessionMarker: null, sessionId: 'sc-1', sessionAt: null,
  })
  s.o.sessions.push(hit('s1'))
  const leadR = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  const checkR = await restorePost(s.l, checker, { dryRun: false, briefing: renderBriefing(s.spec, 'checker') })
  expect(leadR.outcome).toBe('resumed')
  expect(checkR.outcome).toBe('fresh')
  expect(checkR.reason).toBe('codex 不支持接回会话')
  expect(s.o.created.map((c) => c.title)).toEqual(['builder@duo', 'checker@duo'])
  for (const address of ['builder@duo', 'checker@duo']) {
    const row = s.registry.getPost(address)!
    expect(row.handle).toBeTruthy()
    expect(row.status).toBe('live')
  }
})

// —— 3D-2：写了 environment 的岗位 ——

const T0 = resumeToken(restoreKey('duo', 'builder', 0, 'notice'), 'WLS-aaaa1111')
const quick = { tries: 1, pauseMs: 0 }
const ENV_YAML = DUO_YAML.replace('    agent: claude\n    model: opus\n', '    agent: claude\n    model: opus\n    environment: lima-agent\n')
const vm = (over: Record<string, unknown> = {}) => ({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 'vm-1', cwd: os.tmpdir(), environment: 'lima-agent', ...over })

test('remote post: resumes the VM session found through --environment with launch + --resume', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm(), vm({ marker: T0 }))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: quick })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(s.o.created.at(-1)!.command).toBe('claude --model opus --resume vm-1')
  expect(s.o.searches).toEqual([
    { query: '"WLS-aaaa1111"', agent: 'claude', environment: 'lima-agent' },
    { query: `"${T0}"`, agent: 'claude', environment: 'lima-agent' },
  ])
  expect(s.o.sent.at(-1)!.text).toBe(resumeNotice('builder@duo', T0))
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('vm-1')
})

test('remote post: a local session with the same marker is not used, so it starts fresh with the context-lost note', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(hit('local-1'))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toMatchObject({ outcome: 'fresh', reason: '未找到原会话，上下文已丢失' })
})

test('remote post: --session skips the search entirely', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  const r = await restorePost(s.l, s.post, { dryRun: false, override: 'vm-9', briefing: s.briefing, verify: quick })
  expect(r).toMatchObject({ outcome: 'resumed', sessionId: 'vm-9' })
  expect(s.o.searches.map((x) => x.query)).toEqual([`"${T0}"`]) // 没有按会话标记搜；只有接回后核对的那一次
})

test('remote post: a VM-path cwd is uncertain, with nothing created and the retry command named', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm({ cwd: '/home/user/wt' }))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toMatchObject({ outcome: 'uncertain', retry: 'wl restore duo' })
  expect(r.reason).toContain('--session')
  expect(s.o.created).toEqual([])
})

test('remote post: dry-run reports resumed without creating a terminal', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm())
  expect(await restorePost(s.l, s.post, { dryRun: true, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(s.o.created).toEqual([])
})

test('a post without environment still searches locally (no --environment)', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(s.o.searches).toEqual([{ query: '"WLS-aaaa1111"', agent: 'claude' }])
})

// —— 核对远端岗位真的接回了原会话 ——

const TOKEN = 'WLR-1a2b3c4d'
const landed = (over: Record<string, unknown> = {}) => ({ marker: TOKEN, agent: 'claude', sessionId: 'vm-1', cwd: null, environment: 'lima-agent', ...over })
const check = (deps: Parameters<typeof verifyLanding>[0]) => verifyLanding(deps, { agent: 'claude', environment: 'lima-agent', token: TOKEN, expected: 'vm-1' }, { tries: 3, pauseMs: 0 })

test('noticeToken is WLR- plus 8 hex, stable for one key and different across restore generations', () => {
  const k0 = restoreKey('duo', 'builder', 0, 'notice')
  expect(noticeToken(k0)).toMatch(/^WLR-[0-9a-f]{8}$/)
  expect(noticeToken(k0)).toBe(noticeToken(k0))
  expect(noticeToken(k0)).not.toBe(noticeToken(restoreKey('duo', 'builder', 1, 'notice')))
})

test('resumeNotice without a token is exactly the old text; with one it ends with the token', () => {
  expect(resumeNotice('builder@duo')).toBe('[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。')
  expect(resumeNotice('builder@duo', TOKEN)).toBe(`[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。（接回标识 ${TOKEN}）`)
})

test('verifyLanding: confirmed when the token landed in the expected session, even next to a hit in another one', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(landed())
  expect(await check(deps)).toEqual({ kind: 'confirmed' })
  expect(o.searches).toEqual([{ query: `"${TOKEN}"`, agent: 'claude', environment: 'lima-agent' }])
  o.sessions.unshift(landed({ sessionId: 'vm-new' }))
  expect(await check(deps)).toEqual({ kind: 'confirmed' })
})

test('verifyLanding: mismatch when the token landed only in other sessions; an older notice with another token in the expected session does not help', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(landed({ marker: 'WLR-00000000' }), landed({ sessionId: 'vm-new' }))
  expect(await check(deps)).toEqual({ kind: 'mismatch', landed: ['vm-new'] })
})

test('verifyLanding: no hit after all the tries is unknown, and so is a failing search (it never throws)', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  expect(await check(deps)).toMatchObject({ kind: 'unknown', why: expect.stringContaining('没有命中') })
  expect(o.searches).toHaveLength(3)
  o.searchError = new WinglineError('orca', 'runtime_unavailable', 'tunnel down')
  expect(await check(deps)).toMatchObject({ kind: 'unknown', why: expect.stringContaining('tunnel down') })
})

test('verifyLanding retries until the index catches up', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(landed())
  const real = o.search.bind(o)
  let calls = 0
  o.search = async (a) => (++calls === 1 ? [] : real(a))
  expect(await check(deps)).toEqual({ kind: 'confirmed' })
  expect(calls).toBe(2)
})

test('verifyLanding: a hit whose snippet does not highlight the whole token (partial-token recall) is not a hit', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(landed({ snippet: 'x [[wlr]] y' }))
  expect(await check(deps)).toMatchObject({ kind: 'unknown' })
})

test('remote post: the notice landing in another session (the wrapper dropped --resume) is uncertain, names both sessions, keeps the cached session id', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm(), vm({ marker: T0, sessionId: 'vm-new' }))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: quick })
  expect(r).toMatchObject({ address: 'builder@duo', outcome: 'uncertain', sessionId: 'vm-1', retry: 'wl restore duo' })
  expect(r.reason).toContain('vm-new')
  expect(r.reason).toContain('vm-1')
  expect(r.reason).toContain('--resume')
  expect(s.registry.getPost('builder@duo')!.status).toBe('uncertain')
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('vm-1')
})

test('remote post: an older notice in the resumed session does not make a dropped --resume pass (the token differs per restore generation)', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm(), vm({ marker: 'WLR-00000000', sessionId: 'vm-1' }), vm({ marker: T0, sessionId: 'vm-new' }))
  expect((await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: quick })).outcome).toBe('uncertain')
})

test('remote post: nothing found or a failing search is resumed with a note, not a failure', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm())
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: quick })
  expect(r).toMatchObject({ outcome: 'resumed', sessionId: 'vm-1', note: expect.stringContaining('未能确认') })
  expect(s.registry.getPost('builder@duo')!.status).toBe('live')
})

test('remote post: the verification is retried while the index catches up', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm(), vm({ marker: T0 }))
  const real = s.o.search.bind(s.o)
  let tokenSearches = 0
  s.o.search = async (a) => (a.query === `"${T0}"` && ++tokenSearches === 1 ? [] : real(a))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: { tries: 3, pauseMs: 0 } })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(tokenSearches).toBe(2)
})

test('local post: the notice text is unchanged and no verification search runs', async () => {
  const s = seed(new FakeOrca())
  s.o.sessions.push(hit('s1'))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 's1' })
  expect(s.o.sent).toEqual([{ handle: 'term-1', text: '[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。', retryRequest: undefined }])
  expect(s.o.searches).toHaveLength(1)
})

test('remote post: when the notice is skipped (screen not clear) there is nothing to verify', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.onCreate = () => { s.o.previews.set('term-1', 'Do you want to proceed?\n❯ 1. Yes') }
  s.o.sessions.push(vm())
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing, verify: quick })
  expect(r).toMatchObject({ outcome: 'resumed', noticeSkipped: expect.stringContaining('at_prompt') })
  expect(s.o.searches.map((x) => x.query)).toEqual(['"WLS-aaaa1111"'])
})

test('resumeToken also depends on the post\'s session marker, so two registries (or a rebuilt team) with the same team/post/generation never share a token', () => {
  const k = restoreKey('duo', 'builder', 0, 'notice')
  expect(resumeToken(k, 'WLS-aaaa1111')).toMatch(/^WLR-[0-9a-f]{8}$/)
  expect(resumeToken(k, 'WLS-aaaa1111')).toBe(resumeToken(k, 'WLS-aaaa1111'))
  expect(resumeToken(k, 'WLS-aaaa1111')).not.toBe(resumeToken(k, 'WLS-bbbb2222'))
  expect(resumeToken(k, 'WLS-aaaa1111')).not.toBe(noticeToken(k))
  expect(resumeToken(k, null)).toMatch(/^WLR-[0-9a-f]{8}$/)
})
