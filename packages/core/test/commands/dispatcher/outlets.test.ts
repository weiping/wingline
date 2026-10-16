import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { notifyHuman, typeTo, worktreeComment } from '../../../src/commands/dispatcher/outlets.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

const ctxOf = (deps: CommandDeps, yaml = DUO_YAML) => ({ team: deps.registry.getTeam('duo')!, spec: loadTeamSpec(mkTeam(yaml)) })
test('typeTo: hushed → skip_hushed (no Orca call); otherwise maps notifyPost; every attempt is an event', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  registry.hush('duo', 'checker@duo', new Date(c.now().getTime() + 60_000).toISOString())
  o.calls.length = 0
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('skip_hushed')
  expect(o.calls).toEqual([])
  c.advance(61_000)
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('ok')
  o.previews.set('term-c', '❯ 1. Yes\n  2. No')
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('skip_prompt')
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('skip_offline')
  expect(registry.listPatrolEvents('duo').map((e) => [e.action, e.outcome])).toEqual([['nudge', 'skip_hushed'], ['nudge', 'ok'], ['nudge', 'skip_prompt'], ['nudge', 'skip_offline']])
})
test('notifyHuman: the lead is typed to when it is not the stuck post; never when it is (skipped_self)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(await notifyHuman(deps, ctxOf(deps), { post: 'checker@duo', signal: 'no_progress', level: 2, message: 'm1' })).toEqual({ lead: 'ok', external: 'none' })
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: 'm1' })
  const n = o.sent.length
  expect(await notifyHuman(deps, ctxOf(deps), { post: 'builder@duo', signal: 'no_progress', level: 2, message: 'm2' })).toEqual({ lead: 'skipped_self', external: 'none' })
  expect(o.sent.length).toBe(n)
})
test('notifyHuman webhook: POST JSON once with a timeout; a failure is recorded, not thrown', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const seen: Array<{ url: string; body: unknown; signal?: AbortSignal }> = []
  const ok = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(init.body as string), signal: init.signal ?? undefined }); return new Response(null, { status: 204 }) }) as unknown as typeof fetch
  const y = DUO_YAML + 'patrol:\n  notify:\n    webhook: https://example.invalid/h\n'
  expect((await notifyHuman(deps, ctxOf(deps, y), { post: 'builder@duo', signal: 'gate_streak', level: 2, message: 'm' }, { fetch: ok })).external).toBe('ok')
  expect(seen).toEqual([{ url: 'https://example.invalid/h', body: expect.objectContaining({ team: 'duo', post: 'builder@duo', signal: 'gate_streak', level: 2, message: 'm', attentionCommand: 'wl attention duo' }), signal: expect.anything() }])
  const bad = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
  expect((await notifyHuman(deps, ctxOf(deps, y), { post: 'builder@duo', signal: 'gate_streak', level: 2, message: 'm' }, { fetch: bad })).external).toBe('failed')
  expect(registry.listPatrolEvents('duo').filter((e) => e.action === 'notify').map((e) => e.outcome)).toEqual([expect.stringContaining('external:ok'), expect.stringContaining('external:failed')])
})
test('notifyHuman command: spawned without a shell, the message is the last argument', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-n-')), 'msg'); process.env.WL_N = out
  const y = DUO_YAML + `patrol:\n  notify:\n    command: ['${process.execPath.replace(/\\/g, '\\\\')}', '-e', 'require("fs").writeFileSync(process.env.WL_N, process.argv.at(-1))']\n`
  expect((await notifyHuman(deps, ctxOf(deps, y), { post: 'builder@duo', signal: 's', level: 2, message: 'a "b" $HOME 中文' })).external).toBe('ok')
  expect(fs.readFileSync(out, 'utf8')).toBe('a "b" $HOME 中文')
})
test('final-review m9: a synchronously throwing spawn is a failed outlet, not a rejection', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const y = DUO_YAML + "patrol:\n  notify:\n    command: ['/no/such/bin']\n"
  const spawn = (() => { throw new Error('EACCES') }) as unknown as typeof import('node:child_process').spawn
  const r = await notifyHuman(deps, ctxOf(deps, y), { post: 'builder@duo', signal: 's', level: 2, message: 'm' }, { spawn })
  expect(r.external).toBe('failed')
  expect(registry.listPatrolEvents('duo').filter((e) => e.action === 'notify')).toHaveLength(1)
})
test('worktreeComment only when enabled; failures are swallowed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await worktreeComment(deps, ctxOf(deps), 'checker@duo', 'c')
  expect(o.comments).toEqual([])
  o.faults.push({ method: 'worktreeSet', when: 'before', error: new WinglineError('orca', 'x', 'x') })
  await expect(worktreeComment(deps, ctxOf(deps, DUO_YAML + 'patrol:\n  worktree_comment: true\n'), 'checker@duo', 'c')).resolves.toBeUndefined()
  await worktreeComment(deps, ctxOf(deps, DUO_YAML + 'patrol:\n  worktree_comment: true\n'), 'checker@duo', 'c2')
  expect(o.comments).toEqual([{ worktree: deps.registry.getPost('checker@duo')!.worktree, comment: 'c2' }])
})
