// Task 12：阶段 2B 端到端（dispatcher + patrol + freeze + reply + 绕过上报 + 单岗位团队）。
import { expect, test, vi } from 'vitest'
import { PATROL_INTERVAL_MS } from '../../../src/commands/dispatcher/advance.js'
import { unfreezePostCmd } from '../../../src/commands/dispatcher/controls.js'
import { dispatcherReply } from '../../../src/commands/dispatcher/inbox.js'
import { connectDispatcher, initialState, loopOnce } from '../../../src/commands/dispatcher/loop.js'
import { createTask } from '../../../src/commands/task/create.js'
import { doneTask } from '../../../src/commands/task/done.js'
import { up } from '../../../src/commands/up.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, SOLO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, ask, bypassReport, clock, mkDeps } from '../fake-client.js'

async function bootDispatcher(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = mkDeps(o, { now: c.now, monotonic: c.monotonic })
  const specPath = mkTeam(yaml)
  await up(deps, { specPath })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  const dsp = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } }
  const sleep = async (ms: number) => { c.advance(ms) }
  const team = await connectDispatcher(dsp, 'duo', 'term-dsp', { sleep })
  const st = initialState(dsp, team, loadTeamSpec(specPath))
  const tick = (ms = 0) => { c.advance(ms); return loopOnce(dsp, 'term-dsp', st, { sleep, waitMs: 1 }) }
  return { c, o, deps, dsp, registry, specPath, st, tick }
}

test('dispatcher holds the coordinator; wl up leaves it alone; a stuck checker goes observe → nudge → lead → frozen; create --post is then refused; unfreeze lists nothing to restart', async () => {
  const w = await bootDispatcher()
  expect(w.registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
  expect((await up(w.deps, { specPath: w.specPath })).run?.outcome).toBe('kept')
  const { id } = await createTask(w.deps, { team: 'duo', title: '实现登录', post: 'checker@duo' })
  w.o.terminals.find((t) => t.title === 'checker@duo')!.lastOutputAt = w.c.now().getTime()
  for (let i = 0; i < 6; i++) await w.tick(PATROL_INTERVAL_MS)
  for (let i = 0; i < 4; i++) await w.tick(PATROL_INTERVAL_MS)
  expect(w.registry.getFrozen('checker@duo')).toMatchObject({ signal: 'no_progress' })
  const checkerH = w.o.terminals.find((t) => t.title === 'checker@duo')!.handle
  const builderH = w.o.terminals.find((t) => t.title === 'builder@duo')!.handle
  const texts = w.o.sent.map((s) => [s.handle, s.text])
  expect(texts.filter(([h]) => h === checkerH).some(([, t]) => String(t).includes(`任务 ${id} 已经`))).toBe(true)
  expect(texts.filter(([h]) => h === builderH).some(([, t]) => String(t).includes('已冻结'))).toBe(true)
  await expect(createTask(w.deps, { team: 'duo', title: 't2', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  expect(await unfreezePostCmd(w.deps, { address: 'checker@duo' })).toEqual({ skipped: [] })
})

test('a question is relayed once, answered with wl dispatcher reply, and the waiting signal clears', async () => {
  const w = await bootDispatcher()
  const { id } = await createTask(w.deps, { team: 'duo', title: 't', post: 'checker@duo' })
  ask(w.o, id, '用哪个库？', ['a', 'b'])
  await w.tick()
  const relay = w.o.sent.find((s) => s.text.includes('提问'))!
  expect(relay.handle).toBe(w.o.terminals.find((t) => t.title === 'builder@duo')!.handle)
  const msgId = /reply duo (\S+)/.exec(relay.text)![1]!
  await w.tick(PATROL_INTERVAL_MS); await w.tick(PATROL_INTERVAL_MS)
  expect(w.registry.listPatrolState('duo').some((r) => r.signal === 'waiting_answer' && !r.clearedAt)).toBe(true)
  await dispatcherReply(w.deps, { team: 'duo', messageId: msgId, body: '用 a' })
  await w.tick(PATROL_INTERVAL_MS)
  expect(w.registry.listPatrolState('duo').filter((r) => r.signal === 'waiting_answer').every((r) => r.clearedAt)).toBe(true)
  expect(w.o.sent.filter((s) => s.text.includes('提问'))).toHaveLength(1)
})

test('a post that bypasses wl is reported once from the inbox; wl task done then fills in the links', async () => {
  const w = await bootDispatcher(DUO_YAML + 'links:\n  checker:\n    reviewed_by: [builder]\n')
  const { id } = await createTask(w.deps, { team: 'duo', title: 't', post: 'checker@duo' })
  await bypassReport(w.o, id)
  await w.tick(); await w.tick(PATROL_INTERVAL_MS); await w.tick(PATROL_INTERVAL_MS)
  expect(w.o.sent.filter((s) => s.text.includes('绕过 wl'))).toHaveLength(1)
  const checkerH = w.o.terminals.find((t) => t.title === 'checker@duo')!.handle
  const r = await doneTask({ ...w.deps, env: { ORCA_TERMINAL_HANDLE: checkerH } }, { id })
  expect(r).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review' } })
})

test('a lead stuck in a one-post team is never "notified about itself" and is not frozen; the external outlet is used', async () => {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = mkDeps(o, { now: c.now, monotonic: c.monotonic })
  const hook = vi.fn(async () => new Response(null, { status: 204 }))
  const specPath = mkTeam(SOLO_YAML + 'patrol:\n  notify:\n    webhook: https://example.invalid/h\n')
  await up(deps, { specPath })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@solo', connected: true, worktreeId: 'w' })
  const dsp = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } }
  const sleep = async (ms: number) => { c.advance(ms) }
  const team = await connectDispatcher(dsp, 'solo', 'term-dsp', { sleep })
  const st = initialState(dsp, team, loadTeamSpec(specPath))
  await createTask(deps, { team: 'solo', title: 't', post: 'builder@solo' })
  for (let i = 0; i < 10; i++) { c.advance(PATROL_INTERVAL_MS); await loopOnce(dsp, 'term-dsp', st, { sleep, waitMs: 1, io: { fetch: hook as unknown as typeof fetch } }) }
  expect(registry.getFrozen('builder@solo')).toBeNull()
  // 通知文案以 `[雁阵] <岗位地址>` 开头；单岗位团队里牵头岗就是该岗位，不得收到这类通知
  expect(o.sent.filter((s) => s.text.startsWith('[雁阵] builder@solo'))).toEqual([])
  expect(registry.listPatrolEvents('solo').filter((e) => e.action === 'notify_lead')).toEqual([])
  expect(registry.listPatrolEvents('solo').filter((e) => e.action === 'notify').map((e) => e.outcome)).toContain('lead:skipped_self;external:ok')
  expect(hook).toHaveBeenCalled()
})
