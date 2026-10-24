import { expect, test, vi } from 'vitest'
import { auditedCommands } from '../../../src/audit.js'
import {
  ORCA_POLL_MS, restoreAll, restoreAllExitCode, SETTLE_SAMPLES, waitForOrca, type RestoreArgs, type RestoreResult,
} from '../../../src/commands/restore/index.js'
import { WinglineError } from '../../../src/errors.js'
import { clock, FakeOrca, mkDeps } from '../fake-client.js'

const result = (team: string, outcome: 'kept' | 'ambiguous' | 'failed' = 'kept'): RestoreResult => ({
  team, dryRun: false, posts: outcome === 'kept' ? [] : [{ address: `builder@${team}`, outcome }] as unknown as RestoreResult['posts'],
  dispatcher: { action: 'left', state: 'running' }, tasks: [],
})

function world() {
  const c = clock()
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o, { now: c.now, monotonic: c.monotonic })
  const sleeps: number[] = []
  const sleep = async (ms: number) => { sleeps.push(ms); c.advance(ms) }
  const team = (name: string, status: 'up' | 'stopped' = 'up') =>
    registry.upsertTeam({ name, specPath: `/s/${name}.yaml`, specHash: 'h', runId: null, coordinatorHandle: null, status })
  /** 第 i 次 status / terminalList 返回脚本里第 i 项（超出取最后一项）；terminalList 的项可以是 Error。 */
  const script = (statuses: boolean[], sets: Array<string[] | Error>) => {
    let s = 0
    let t = 0
    const live = o as unknown as Record<string, unknown>
    live.status = async () => ({ reachable: statuses[Math.min(s++, statuses.length - 1)]! })
    live.terminalList = async () => {
      const set = sets[Math.min(t++, sets.length - 1)]!
      if (set instanceof Error) throw set
      return set.map((h) => ({ handle: h.split(':')[0]!, title: h.split(':')[2] ?? 'x', connected: h.split(':')[1] !== '0', worktreeId: 'w' }))
    }
  }
  return { c, o, deps, registry, sleeps, sleep, team, script }
}
const A = ['a:1']
const B = ['a:1', 'b:1']
const C = ['a:1', 'b:1', 'c:1']

test('only teams that are up are restored, one restoreOne call each, in name order, with the options forwarded', async () => {
  const w = world()
  w.team('trio'); w.team('duo'); w.team('old', 'stopped')
  const restoreOne = vi.fn(async (a: RestoreArgs) => result(a.team))
  const r = await restoreAll(w.deps, { dryRun: true, noTasks: true, as: 'autostart' }, { restoreOne })
  expect(restoreOne.mock.calls.map(([a]) => a)).toEqual([
    { team: 'duo', dryRun: true, noTasks: true, as: 'autostart' },
    { team: 'trio', dryRun: true, noTasks: true, as: 'autostart' },
  ])
  expect(r.teams.map((t) => t.team)).toEqual(['duo', 'trio'])
  expect(w.o.calls).not.toContain('status') // 没给 waitOrcaMs 就不等 Orca
})

test('without --actor the call carries no `as`, so the executor is resolved the usual way', async () => {
  const w = world()
  w.team('duo')
  const restoreOne = vi.fn(async (a: RestoreArgs) => result(a.team))
  await restoreAll(w.deps, {}, { restoreOne })
  expect(Object.keys(restoreOne.mock.calls[0]![0])).not.toContain('as')
})

test('a team that throws team_busy gets an error, the rest still run, and the exit code is 1', async () => {
  const w = world()
  w.team('duo'); w.team('trio')
  const restoreOne = vi.fn(async (a: RestoreArgs) => {
    if (a.team === 'duo') throw new WinglineError('input', 'team_busy', '团队 duo 正在被另一个 wl 命令操作', { hint: '等待其完成后重试' })
    return result(a.team)
  })
  const r = await restoreAll(w.deps, {}, { restoreOne })
  expect(r.teams[0]).toEqual({ team: 'duo', error: { kind: 'input', code: 'team_busy', message: '团队 duo 正在被另一个 wl 命令操作', hint: '等待其完成后重试' } })
  expect(r.teams[1]).toMatchObject({ team: 'trio', result: { team: 'trio' } })
  expect(restoreAllExitCode(r)).toBe(1)
})

test('an unexpected error becomes an internal error for that team only', async () => {
  const w = world()
  w.team('duo'); w.team('trio')
  const restoreOne = vi.fn(async (a: RestoreArgs) => { if (a.team === 'duo') throw new Error('boom'); return result(a.team) })
  const r = await restoreAll(w.deps, {}, { restoreOne })
  expect(r.teams[0]!.error).toMatchObject({ kind: 'internal', code: 'internal', message: 'boom' })
  expect(restoreAllExitCode(r)).toBe(4)
})

test('the exit code is the most severe: internal 4 > uncertain 3 > orca 2 > input 1 > 0', () => {
  const err = (kind: 'input' | 'orca' | 'uncertain' | 'internal') => ({ team: 'x', error: { kind, code: 'c', message: 'm' } })
  const ok = (outcome?: 'ambiguous' | 'failed') => ({ team: 'x', result: result('x', outcome) })
  expect(restoreAllExitCode({ teams: [] })).toBe(0)
  expect(restoreAllExitCode({ teams: [ok(), ok()] })).toBe(0)
  expect(restoreAllExitCode({ teams: [ok(), ok('ambiguous')] })).toBe(3)
  expect(restoreAllExitCode({ teams: [ok('failed'), err('input')] })).toBe(2)
  expect(restoreAllExitCode({ teams: [err('input')] })).toBe(1)
  expect(restoreAllExitCode({ teams: [err('orca'), err('input')] })).toBe(2)
  expect(restoreAllExitCode({ teams: [err('uncertain'), ok('failed')] })).toBe(3)
  expect(restoreAllExitCode({ teams: [ok('ambiguous'), err('internal')] })).toBe(4)
})

test('no team is up: an empty result and exit code 0', async () => {
  const w = world()
  w.team('old', 'stopped')
  const restoreOne = vi.fn()
  const r = await restoreAll(w.deps, {}, { restoreOne })
  expect(r).toEqual({ teams: [] })
  expect(restoreOne).not.toHaveBeenCalled()
  expect(restoreAllExitCode(r)).toBe(0)
})

test('no team is up: nothing is waited for, even with a wait budget and Orca unreachable', async () => {
  const w = world()
  w.team('old', 'stopped')
  w.script([false], [A])
  const restoreOne = vi.fn()
  const r = await restoreAll(w.deps, { waitOrcaMs: 15 * 60_000 }, { restoreOne, sleep: w.sleep })
  expect(r).toEqual({ teams: [] })
  expect(w.sleeps).toEqual([])
  expect(restoreOne).not.toHaveBeenCalled()
})

test('waitForOrca: polls status every 10s until reachable, then needs 4 identical terminal samples in a row', async () => {
  expect([ORCA_POLL_MS, SETTLE_SAMPLES]).toEqual([10_000, 4])
  const w = world()
  w.script([false, false, true], [A])
  await waitForOrca(w.deps, 15 * 60_000, w.sleep)
  expect(w.sleeps).toEqual([10_000, 10_000, 10_000, 10_000, 10_000]) // 2 次等可达 + 3 次采样间隔
})

test('waitForOrca: terminal sets A, B, B, B, B pass on the 5th sample', async () => {
  const w = world()
  w.script([true], [A, B])
  await waitForOrca(w.deps, 15 * 60_000, w.sleep)
  expect(w.sleeps).toHaveLength(4)
})

test('waitForOrca: A, B, B, B, C is not settled; with the budget used up it is orca_not_settled (uncertain)', async () => {
  const w = world()
  w.script([true], [A, B, B, B, C])
  await expect(waitForOrca(w.deps, 45_000, w.sleep)).rejects.toMatchObject({ kind: 'uncertain', code: 'orca_not_settled' })
})

test('waitForOrca: a set that keeps changing never settles', async () => {
  const w = world()
  let i = 0
  ;(w.o as unknown as Record<string, unknown>).terminalList = async () => [{ handle: `t${i++}`, title: 'x', connected: true, worktreeId: 'w' }]
  await expect(waitForOrca(w.deps, 5 * 60_000, w.sleep)).rejects.toMatchObject({ code: 'orca_not_settled' })
})

test('waitForOrca: only handle + connected count, titles may change; a terminal flipping connected breaks the streak', async () => {
  const w = world()
  w.script([true], [['a:1:one'], ['a:1:two'], ['a:1:three'], ['a:1:four']])
  await waitForOrca(w.deps, 15 * 60_000, w.sleep)
  expect(w.sleeps).toHaveLength(3)

  const f = world()
  f.script([true], [['a:1'], ['a:0'], ['a:0'], ['a:0'], ['a:0']])
  await waitForOrca(f.deps, 15 * 60_000, f.sleep)
  expect(f.sleeps).toHaveLength(4) // 第 1 次采样（connected）不算进后面 4 个 connected=false 的连续计数
})

test('waitForOrca: a failing terminalList is an unstable sample, not an abort', async () => {
  const w = world()
  w.script([true], [A, new WinglineError('orca', 'runtime_unavailable', 'x'), A, A, A, A])
  await waitForOrca(w.deps, 15 * 60_000, w.sleep)
  expect(w.sleeps).toHaveLength(5)
})

test('waitForOrca: never reachable within the budget is runtime_unavailable (orca)', async () => {
  const w = world()
  w.script([false], [A])
  await expect(waitForOrca(w.deps, 60_000, w.sleep)).rejects.toMatchObject({ kind: 'orca', code: 'runtime_unavailable' })
  expect(w.sleeps.every((ms) => ms === 10_000)).toBe(true)
  expect(w.sleeps.length).toBeLessThanOrEqual(7)
})

test('restoreAll with a wait budget that runs out restores nothing', async () => {
  const w = world()
  w.team('duo')
  w.script([true], [A, B, A, B, A, B, A, B])
  const restoreOne = vi.fn()
  await expect(restoreAll(w.deps, { waitOrcaMs: 60_000 }, { restoreOne, sleep: w.sleep })).rejects.toMatchObject({ code: 'orca_not_settled' })
  expect(restoreOne).not.toHaveBeenCalled()
})

test('restoreAll with as: autostart writes one audit row per team with that actor, without asking Orca who the caller is', async () => {
  const w = world()
  w.team('duo'); w.team('trio')
  const audited = auditedCommands(
    { restore: async (_d: unknown, a: RestoreArgs) => result(a.team) },
    { restore: { command: 'restore', team: (a: RestoreArgs) => a.team } },
  )
  await restoreAll(w.deps, { as: 'autostart' }, { restoreOne: (a) => audited.restore(w.deps, a) })
  expect(w.registry.listAudit('duo').map((r) => [r.actor, r.command, r.outcome])).toEqual([['autostart', 'restore', 'ok']])
  expect(w.registry.listAudit('trio').map((r) => r.actor)).toEqual(['autostart'])
  expect(w.o.calls).not.toContain('terminalList')
})
