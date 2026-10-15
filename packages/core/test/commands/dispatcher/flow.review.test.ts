// 审查方测试（spec 第 10 节"集成"一栏）：计划 Task 12 之外的端到端情形。
import { expect, test } from 'vitest'
import { PATROL_INTERVAL_MS } from '../../../src/commands/dispatcher/advance.js'
import { connectDispatcher, initialState, loopOnce, type LoopState } from '../../../src/commands/dispatcher/loop.js'
import { createTask } from '../../../src/commands/task/create.js'
import { up } from '../../../src/commands/up.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, clock, mkDeps } from '../fake-client.js'

async function boot(yaml = DUO_YAML) {
  const c = clock(); const o = new FakeOrca(); const { deps, registry } = mkDeps(o, { now: c.now, monotonic: c.monotonic })
  const specPath = mkTeam(yaml)
  await up(deps, { specPath })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  const dsp = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } }
  const sleep = async (ms: number) => { c.advance(ms) }
  const fresh = async (): Promise<LoopState> => initialState(dsp, await connectDispatcher(dsp, 'duo', 'term-dsp', { sleep }), loadTeamSpec(specPath))
  let st = await fresh()
  const tick = (ms = 0) => { c.advance(ms); return loopOnce(dsp, 'term-dsp', st, { sleep, waitMs: 1 }) }
  const restart = async () => { st = await fresh() }
  const term = (title: string) => o.terminals.find((t) => t.title === title)!
  return { c, o, deps, registry, specPath, tick, restart, term }
}

test('a post sitting on an approval prompt is never typed to; the lead hears "needs a human" instead', async () => {
  const w = await boot()
  const { id } = await createTask(w.deps, { team: 'duo', title: 't', post: 'checker@duo' })
  const checker = w.term('checker@duo')
  checker.lastOutputAt = w.c.now().getTime()
  w.o.previews.set(checker.handle, 'Do you want to proceed?\n❯ 1. Yes\n  2. No')
  const n0 = w.o.sent.length
  for (let i = 0; i < 8; i++) await w.tick(PATROL_INTERVAL_MS)
  expect(w.o.sent.slice(n0).filter((s) => s.handle === checker.handle && s.text.startsWith('[雁阵]'))).toEqual([])
  expect(w.o.sent.some((s) => s.handle === w.term('builder@duo').handle && s.text.includes('确认或选择提示') && s.text.includes(id))).toBe(true)
  expect(w.registry.getFrozen('checker@duo')).toBeNull()
})

test('restart: the first scan after a dispatcher restart only observes, even for a row already at level 1', async () => {
  const w = await boot()
  await createTask(w.deps, { team: 'duo', title: 't', post: 'checker@duo' })
  w.term('checker@duo').lastOutputAt = w.c.now().getTime()
  for (let i = 0; i < 7; i++) await w.tick(PATROL_INTERVAL_MS)
  const before = w.registry.listPatrolState('duo').find((r) => r.signal === 'no_progress')!
  expect(before.level).toBeGreaterThanOrEqual(1)
  const sent = w.o.sent.length
  await w.restart()
  await w.tick(PATROL_INTERVAL_MS)
  expect(w.registry.listPatrolState('duo').find((r) => r.signal === 'no_progress')!.level).toBe(before.level)
  expect(w.o.sent.length).toBe(sent)
})

test('a post that keeps answering "收到" right after each nudge still climbs to frozen', async () => {
  const w = await boot()
  await createTask(w.deps, { team: 'duo', title: 't', post: 'checker@duo' })
  const checker = w.term('checker@duo'); checker.lastOutputAt = w.c.now().getTime()
  for (let i = 0; i < 14 && !w.registry.getFrozen('checker@duo'); i++) {
    const n = w.o.sent.length
    await w.tick(PATROL_INTERVAL_MS)
    if (w.o.sent.slice(n).some((s) => s.handle === checker.handle)) checker.lastOutputAt = w.c.now().getTime() + 30_000   // 30 秒后回一句
  }
  expect(w.registry.getFrozen('checker@duo')).not.toBeNull()
})

test('wl up while the dispatcher holds the coordinator keeps it (dispatcher terminal alive)', async () => {
  const w = await boot()
  await up(w.deps, { specPath: w.specPath })
  expect(w.registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
  expect(w.o.coordinator).toBe('term-dsp')
})
