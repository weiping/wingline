// 审查方测试（spec 第 6.2、6.3、7 节）：打字规则、通知人三条路径、人工控制。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { freezePostCmd, hushCmd, parseDuration, unfreezePostCmd, unhushCmd } from '../../../src/commands/dispatcher/controls.js'
import { notifyHuman, typeTo } from '../../../src/commands/dispatcher/outlets.js'
import type { CommandDeps } from '../../../src/commands/deps.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, clock, seedRunningTeam } from '../fake-client.js'

const ctxOf = (deps: CommandDeps, yaml = DUO_YAML) => ({ team: deps.registry.getTeam('duo')!, spec: loadTeamSpec(mkTeam(yaml)) })
const HOOK = DUO_YAML + 'patrol:\n  notify:\n    webhook: https://example.invalid/h\n'
const notice = (over = {}) => ({ post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 2, message: 'm', ...over })
const okFetch = (seen: unknown[] = []) => (async (_u: string, init: RequestInit) => { seen.push(JSON.parse(init.body as string)); return new Response(null, { status: 200 }) }) as unknown as typeof fetch

test('typeTo: an expired hush (until == now) no longer blocks', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  registry.hush('duo', 'checker@duo', c.now().toISOString())
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('ok')
})

test('typeTo: a shell prompt on screen is skip_unknown; a blank screen too; nothing is sent', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'user@host ~ %')
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('skip_unknown')
  o.previews.set('term-c', '\n\n')
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('skip_unknown')
  expect(o.sent).toEqual([])
})

test('typeTo: input accepted without turn_started is unconfirmed and is not resent', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.sendStages = ['input_accepted']
  expect(await typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).toBe('unconfirmed')
  expect(o.sent).toHaveLength(1)
})

test('typeTo never throws: terminal list down → failed, recorded', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'terminalList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await expect(typeTo(deps, 'duo', 'checker@duo', 'x', { action: 'nudge' })).resolves.toBe('failed')
  expect(registry.listPatrolEvents('duo').at(-1)).toMatchObject({ action: 'nudge', outcome: expect.stringMatching(/fail/) })
})

test('typeTo records the subject post, signal and task on the event', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await typeTo(deps, 'duo', 'builder@duo', 'x', { action: 'notify_lead', subject: 'checker@duo', signal: 'no_progress', taskId: 't1' })
  expect(registry.listPatrolEvents('duo').at(-1)).toMatchObject({ post: 'checker@duo', signal: 'no_progress', taskId: 't1' })
})

test('webhook payload carries every field of spec 6.2 (team, post, signal, taskId, level, message, at, attentionCommand)', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { now: c.now })
  const seen: any[] = []
  await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: okFetch(seen) })
  expect(seen[0]).toEqual({ team: 'duo', post: 'checker@duo', signal: 'no_progress', taskId: 't1', level: 2, message: 'm', at: c.now().toISOString(), attentionCommand: 'wl attention duo' })
})

test('the three outlets are independent: lead offline, webhook still sent; webhook throwing, lead still typed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const lead = o.terminals.find((t) => t.handle === 'term-b')!
  o.terminals = o.terminals.filter((t) => t !== lead)
  expect(await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: okFetch() })).toEqual({ lead: 'skip_offline', external: 'ok' })
  o.terminals.push(lead)
  const boom = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
  expect(await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: boom })).toEqual({ lead: 'ok', external: 'failed' })
})

test('the stuck post is the lead: lead path skipped, external outlet still used', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const seen: unknown[] = []
  expect(await notifyHuman(deps, ctxOf(deps, HOOK), notice({ post: 'builder@duo' }), { fetch: okFetch(seen) })).toEqual({ lead: 'skipped_self', external: 'ok' })
  expect(seen).toHaveLength(1); expect(o.sent).toEqual([])
})

test('a hushed lead is not typed to, but the external outlet is', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  registry.hush('duo', 'builder@duo', new Date(c.now().getTime() + 60_000).toISOString())
  expect(await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: okFetch() })).toEqual({ lead: 'skip_hushed', external: 'ok' })
})

test('a webhook that never answers is aborted by the timeout → failed, not hung', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch
  expect((await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: hang, timeoutMs: 20 })).external).toBe('failed')
})

test('each notifyHuman call records exactly one notify event', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await notifyHuman(deps, ctxOf(deps, HOOK), notice(), { fetch: okFetch() })
  expect(registry.listPatrolEvents('duo').filter((e) => e.action === 'notify')).toHaveLength(1)
})

const cmdYaml = (args: string[]) => DUO_YAML + `patrol:\n  notify:\n    command: [${[process.execPath, ...args].map((a) => `'${a.replace(/'/g, "''")}'`).join(', ')}]\n`

test('command exiting non-zero → failed; a missing executable → failed (never throws)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect((await notifyHuman(deps, ctxOf(deps, cmdYaml(['-e', 'process.exit(3)'])), notice())).external).toBe('failed')
  const missing = DUO_YAML + `patrol:\n  notify:\n    command: ['${path.join(os.tmpdir(), 'no-such-notifier-xyz')}']\n`
  expect((await notifyHuman(deps, ctxOf(deps, missing), notice())).external).toBe('failed')
})

test('command that hangs is killed after the timeout → failed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const t0 = Date.now()
  expect((await notifyHuman(deps, ctxOf(deps, cmdYaml(['-e', 'setTimeout(()=>{}, 60000)'])), notice(), { timeoutMs: 200 })).external).toBe('failed')
  expect(Date.now() - t0).toBeLessThan(10_000)
})

test('command receives the message as its only extra argument, after the configured ones', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-rv-')), 'argv'); process.env.WL_RV = out
  await notifyHuman(deps, ctxOf(deps, cmdYaml(['-e', 'require("fs").writeFileSync(process.env.WL_RV, JSON.stringify(process.argv.slice(1)))', 'fixed'])), notice({ message: '[雁阵] x; rm -rf ~' }))
  expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual(['fixed', '[雁阵] x; rm -rf ~'])
})

test.each(['15', '1.5h', '-5m', '15 m', '2d', ''])('parseDuration rejects %j', (s) => {
  expect(() => parseDuration(s)).toThrow(expect.objectContaining({ code: 'duration_invalid', kind: 'input' }))
})

test('hush: unknown post → post_unknown; --for extends; hush/unhush are recorded as events', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  await expect(hushCmd(deps, { address: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  await hushCmd(deps, { address: 'checker@duo', forMs: 60_000 })
  const { until } = await hushCmd(deps, { address: 'checker@duo', forMs: 7_200_000 })
  expect(registry.hushedUntil('checker@duo')).toBe(until)
  await unhushCmd(deps, { address: 'checker@duo' })
  expect(registry.listPatrolEvents('duo').map((e) => e.action)).toEqual(['hush', 'hush', 'unhush'])
})

test('freezePostCmd works on the lead too (manual freeze ignores freeze_lead) and is idempotent', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await freezePostCmd(deps, { address: 'builder@duo', reason: 'a' })
  await freezePostCmd(deps, { address: 'builder@duo', reason: 'b' })
  expect(registry.getFrozen('builder@duo')).toMatchObject({ reason: 'a' })
})

test('unfreeze resets only that post\'s patrol rows; other posts keep their level', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { now: c.now })
  const row = { team: 'duo', signal: 'no_progress' as const, taskId: 't1', level: 2, since: 'A', levelAt: 'A', lastNudgedAt: 'A', notifyCount: 1, nextDueAt: null, clearedAt: null }
  registry.putPatrolState({ ...row, post: 'checker@duo' }); registry.putPatrolState({ ...row, post: 'builder@duo' })
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  await unfreezePostCmd(deps, { address: 'checker@duo' })
  expect(registry.getPatrolState('duo', 'builder@duo', 'no_progress', 't1')).toMatchObject({ level: 2, clearedAt: null })
  expect(registry.getPatrolState('duo', 'checker@duo', 'no_progress', 't1')).toMatchObject({ level: 0 })
  expect(registry.getFrozen('checker@duo')).toBeNull()
  expect(registry.listPatrolEvents('duo').map((e) => e.action)).toContain('unfreeze')
})

test('unfreeze lists only skipped children that are still ready; a child already dispatched is not listed', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  const mk = async (n: number) => {
    const { id } = await o.taskCreate({ spec: 's', taskTitle: `c${n}`, run: 'run-1', from: 'coord-1' })
    const key = `done:p${n}:0:delivered:checker@duo`
    registry.beginRequest(key); registry.finishRequest(key, 'done', { target: 'checker@duo', taskId: id, delivery: 'skipped_frozen' }); return id
  }
  const ready = await mk(1); const started = await mk(2)
  await o.dispatch({ task: started, to: 'term-c', from: 'coord-1' })
  expect((await unfreezePostCmd(deps, { address: 'checker@duo' })).skipped.map((s) => s.taskId)).toEqual([ready])
})

test('unfreeze with Orca down still unfreezes and lists every skipped child (unfiltered)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  registry.beginRequest('done:p:0:delivered:checker@duo'); registry.finishRequest('done:p:0:delivered:checker@duo', 'done', { target: 'checker@duo', taskId: 'kid', delivery: 'skipped_frozen' })
  o.faults.push({ method: 'taskList', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  expect((await unfreezePostCmd(deps, { address: 'checker@duo' })).skipped).toEqual([{ taskId: 'kid', command: 'wl task start kid --as checker@duo' }])
  expect(registry.getFrozen('checker@duo')).toBeNull()
})
