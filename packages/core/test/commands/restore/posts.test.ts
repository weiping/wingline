import os from 'node:os'
import { expect, test } from 'vitest'
import { renderBriefing } from '../../../src/brief/render.js'
import type { PostRow } from '../../../src/registry/registry.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { specHash } from '../../../src/spec/hash.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps } from '../fake-client.js'
import { restoreKey, restorePost } from '../../../src/commands/restore/posts.js'
import type { Launch } from '../../../src/commands/launch.js'

/** 建一个 duo 团队：builder（claude，牵头岗）失效中、带标记 WLS-aaaa1111；worktree 已固定为 path:。 */
function seed(o: FakeOrca, builderOver: Partial<PostRow> = {}) {
  const { deps, registry } = mkDeps(o)
  const specPath = mkTeam(DUO_YAML)
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

test('a live post is kept and nothing is written', async () => {
  const s = seed(new FakeOrca())
  s.o.terminals.push({ handle: 'term-b', title: 'builder@duo', connected: true, worktreeId: 'wt-1' })
  expect(await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'kept' })
  expect(s.o.created).toEqual([])
  expect(s.o.sent).toEqual([])
  expect(s.o.calls).not.toContain('search')
  expect(s.registry.getRequest(restoreKey('duo', 'builder', 0, 'create'))).toBeNull()
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

test('terminal never becomes idle → uncertain, not resent on the next run until the ledger row resolves', async () => {
  const s = seed(new FakeOrca())
  s.o.waitSatisfied = false
  s.o.sessions.push(hit('s1'))
  const first = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(first.outcome).toBe('uncertain')
  // 终端还在（connected），重跑 → kept，接回提示始终没有发出
  const second = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(second.outcome).toBe('kept')
  expect(s.o.sent).toEqual([])
  expect(s.o.created.length).toBe(1)
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
