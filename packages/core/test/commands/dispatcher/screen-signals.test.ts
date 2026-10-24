import { expect, test } from 'vitest'
import { PATROL_INTERVAL_MS } from '../../../src/commands/dispatcher/advance.js'
import { attention } from '../../../src/commands/dispatcher/attention.js'
import { connectDispatcher, initialState, loopOnce } from '../../../src/commands/dispatcher/loop.js'
import { advancePatrol } from '../../../src/commands/dispatcher/advance.js'
import { advanceScreenSignals, CONTEXT_RENOTIFY_MS, isUsagePaused } from '../../../src/commands/dispatcher/screen-signals.js'
import { detectSignals, takeSnapshot } from '../../../src/commands/dispatcher/signals.js'
import { WinglineError } from '../../../src/errors.js'
import { loadTeamSpec } from '../../../src/spec/load.js'
import { sample } from '../../screen/samples.js'
import { clock, FakeOrca, seedRunningTeam } from '../fake-client.js'

const T0 = '2026-10-16T09:00:00+08:00'
const BODY = ['⏺ 好的', '  ⎿  Read 120 lines', '']
const TAIL = ['────────', '❯ ', '────────', '  ⏵⏵ accept edits on (shift+tab to cycle)']
const LIMIT_LINE = (reset = 'resets 3pm (Asia/Shanghai)') => `  ⎿  You've hit your session limit${reset ? ` · ${reset}` : ''}`
const limit = (extra?: string, reset?: string) => [...BODY, LIMIT_LINE(reset), ...(extra ? [extra] : []), ...TAIL].join('\n')
const idle = [...BODY, ...TAIL].join('\n')
const ARMED = 'Usage limit reached · continuing automatically at 3pm · esc to cancel'
const CANCELLED = 'Automatic continue cancelled · /rate-limit-options to re-arm'
const MENU = ['Do you want to proceed?', '❯ 1. Yes', '  2. No'].join('\n')

/** 被观察的岗位是 checker@duo（term-c，改成 claude）；牵头岗 builder@duo（term-b）收通知。scan() = 与 loop.ts 的 scan() 同一顺序。 */
function world() {
  const c = clock(Date.parse(T0))
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { now: c.now, monotonic: c.monotonic })
  s.registry.upsertPost({ ...s.registry.getPost('checker@duo')!, agent: 'claude' })
  const ctx = () => ({ team: s.registry.getTeam('duo')!, spec: loadTeamSpec(s.registry.getTeam('duo')!.specPath) })
  const scan = async (observeOnly = false) => {
    const snap = await takeSnapshot(s.deps, ctx(), { wokeAt: null })
    await advanceScreenSignals(s.deps, ctx(), snap, { observeOnly })
    await advancePatrol(s.deps, ctx(), detectSignals(snap, ctx().spec, s.registry.listPatrolState('duo')), { observeOnly })
  }
  const tick = (min = 5) => c.advance(min * 60_000)
  const goto = (iso: string) => c.advance(Date.parse(iso) - c.now().getTime())
  const sentTo = (handle: string) => o.sent.filter((x) => x.handle === handle).map((x) => x.text)
  const usage = () => s.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')
  const events = (action: string) => s.registry.listPatrolEvents('duo').filter((e) => e.action === action)
  const dispatchChecker = async () => {
    const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
    s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
    await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
    o.terminals.find((t) => t.handle === 'term-c')!.lastOutputAt = c.now().getTime() - 3_600_000
    return id
  }
  return { c, o, ...s, ctx, scan, tick, goto, sentTo, usage, events, dispatchChecker }
}
const usageNotices = (w: ReturnType<typeof world>) => w.sentTo('term-b').filter((t) => t.includes('用量已用完'))
const continueLines = (w: ReturnType<typeof world>) => w.sentTo('term-c').filter((t) => t.includes('用量已重置'))

test('usage limit: the first scan only observes; later the lead is told once and the row stays (advancePatrol does not clear it); the post is never frozen', async () => {
  const w = world(); w.o.screens.set('term-c', limit())
  await w.scan(true)
  expect(w.usage()).toMatchObject({ level: 0, clearedAt: null, nextDueAt: null })
  expect(usageNotices(w)).toEqual([])
  expect(isUsagePaused(w.registry, 'duo', 'checker@duo', w.c.now())).toBe(false) // 观察行不暂停
  w.tick(); await w.scan(); w.tick(); await w.scan(); w.tick(); await w.scan()
  expect(w.usage()).toMatchObject({ level: 1, clearedAt: null })
  expect(new Date(w.usage()!.nextDueAt!).toISOString()).toBe(new Date('2026-10-16T15:02:00+08:00').toISOString()) // resetsAt + 2 分钟
  expect(usageNotices(w)).toHaveLength(1)
  expect(usageNotices(w)[0]).toContain('预计')
  expect(w.registry.getFrozen('checker@duo')).toBeNull()
  expect(w.events('freeze')).toEqual([])
})

test('while paused no_progress is observed but never escalates (a control world without the limit does escalate); at reset the continue line comes once and no_progress counts from then', async () => {
  const control = world(); await control.dispatchChecker(); control.tick(25)
  await control.scan(true); control.tick(); await control.scan(); control.tick(); await control.scan()
  expect(control.sentTo('term-c').some((t) => t.includes('巡查提示'))).toBe(true) // 没有用量上限：照常 nudge

  const w = world(); const id = await w.dispatchChecker(); w.tick(25)
  w.o.screens.set('term-c', limit())
  await w.scan(true); w.tick(); await w.scan(); w.tick(); await w.scan(); w.tick(); await w.scan()
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', id)).toMatchObject({ level: 0 })
  expect(w.sentTo('term-c')).toEqual([])
  expect(isUsagePaused(w.registry, 'duo', 'checker@duo', w.c.now())).toBe(true)

  w.goto('2026-10-16T15:03:00+08:00') // 过了 resetsAt + 2 分钟；提示仍留在屏幕上，但 resetsAt 已知：到点即发，不等提示消失
  await w.scan()
  expect(continueLines(w)).toEqual([`[雁阵] 用量已重置，请继续手上的任务 ${id}`])
  expect(w.usage()!.clearedAt).not.toBeNull()
  expect(w.usage()!.detail).toMatchObject({ resumedAt: w.c.now().toISOString() })
  expect(w.sentTo('term-c').some((t) => t.includes('巡查提示'))).toBe(false) // 计时从 resumedAt 重新开始：这一刻不会马上追加 nudge
  w.tick(); await w.scan()
  expect(w.sentTo('term-c').some((t) => t.includes('巡查提示'))).toBe(false)
})

test('with "continuing automatically" on screen the continue line is not typed at reset: the due time moves 10 minutes (at most 3 times); "Automatic continue cancelled" then gets the line', async () => {
  const w = world(); w.o.screens.set('term-c', limit(ARMED))
  await w.scan(true); w.tick(); await w.scan()
  w.goto('2026-10-16T15:03:00+08:00'); await w.scan()
  expect(continueLines(w)).toEqual([])
  expect(w.usage()!.detail).toMatchObject({ extensions: 1 })
  expect(new Date(w.usage()!.nextDueAt!).getTime()).toBe(w.c.now().getTime() + 600_000)
  expect(w.events('resume_deferred')).toHaveLength(1)
  w.o.screens.set('term-c', limit(CANCELLED))
  w.tick(11); await w.scan()
  expect(continueLines(w)).toHaveLength(1)
  expect(w.usage()!.clearedAt).not.toBeNull()
})

test('a banner that never goes away is deferred 3 times, then the line is tried (and refused while the screen says "esc to cancel"), ending in resume_skipped and one human notice', async () => {
  const w = world(); w.o.screens.set('term-c', limit(ARMED))
  await w.scan(true); w.tick(); await w.scan()
  w.goto('2026-10-16T15:03:00+08:00')
  for (let i = 0; i < 3; i++) { await w.scan(); w.tick(11) }
  expect(w.usage()!.detail).toMatchObject({ extensions: 3 })
  for (let i = 0; i < 3; i++) { await w.scan(); w.tick(1) }
  expect(continueLines(w)).toEqual([])
  expect(w.events('resume_skipped')).toHaveLength(1)
  expect(w.usage()!.clearedAt).not.toBeNull()
  expect(w.sentTo('term-b').filter((t) => t.includes('没有自动继续'))).toHaveLength(1)
})

test('reset time unknown: pause for an hour; the same notice still there → extended an hour, at most 3 times, then the line is typed', async () => {
  const w = world(); w.o.screens.set('term-c', limit(undefined, ''))
  await w.scan(true); w.tick(); await w.scan()
  expect(w.usage()!.detail).toMatchObject({ resetsAt: null })
  expect(new Date(w.usage()!.nextDueAt!).getTime()).toBe(w.c.now().getTime() + 3_600_000)
  for (let i = 1; i <= 3; i++) { w.tick(61); await w.scan(); expect(w.usage()!.detail).toMatchObject({ extensions: i }) }
  expect(continueLines(w)).toEqual([])
  w.tick(61); await w.scan()
  expect(continueLines(w)).toHaveLength(1)
  expect(w.usage()!.clearedAt).not.toBeNull()
})

test('the continue line is not typed while the screen is at a prompt or a menu: kept for 3 rounds, then resume_skipped and one human notice', async () => {
  const w = world(); w.o.screens.set('term-c', `${limit()}\n${MENU}`)
  await w.scan(true); w.tick(); await w.scan()
  w.goto('2026-10-16T15:03:00+08:00')
  await w.scan(); expect(w.usage()!.clearedAt).toBeNull(); expect(w.usage()!.detail).toMatchObject({ resumeTries: 1 })
  w.tick(); await w.scan(); expect(w.usage()!.detail).toMatchObject({ resumeTries: 2 })
  expect(w.events('resume_skipped')).toEqual([])
  w.tick(); await w.scan()
  expect(w.events('resume_skipped')).toHaveLength(1)
  expect(w.usage()!.clearedAt).not.toBeNull()
  expect(w.sentTo('term-c')).toEqual([])
  expect(w.sentTo('term-b').filter((t) => t.includes('请手动处理'))).toHaveLength(1)
})

test('after the row is cleared the same notice still on screen does not retrigger; a different reset time is a new identification and tells the lead again', async () => {
  const w = world(); w.o.screens.set('term-c', limit())
  await w.scan(true); w.tick(); await w.scan()
  w.goto('2026-10-16T15:03:00+08:00'); await w.scan()
  expect(w.usage()!.clearedAt).not.toBeNull()
  for (let i = 0; i < 3; i++) { w.tick(); await w.scan() }
  expect(usageNotices(w)).toHaveLength(1)
  expect(continueLines(w)).toHaveLength(1)
  w.o.screens.set('term-c', limit(undefined, 'resets 4pm (Asia/Shanghai)'))
  w.tick(); await w.scan()
  expect(w.usage()).toMatchObject({ level: 1, clearedAt: null })
  expect(usageNotices(w)).toHaveLength(2)
})

test('the lead out of usage is never told about itself: only the external outlet and wl attention', async () => {
  const w = world(); w.registry.upsertPost({ ...w.registry.getPost('builder@duo')!, agent: 'claude' })
  w.o.screens.set('term-b', limit())
  await w.scan(true); w.tick(); await w.scan()
  expect(w.sentTo('term-b').filter((t) => t.includes('用量已用完'))).toEqual([])
  expect(w.registry.getPatrolState('duo', 'builder@duo', 'usage_limit', '')).toMatchObject({ level: 1 })
  expect(w.events('notify').some((e) => String(e.outcome).includes('lead:skipped_self'))).toBe(true)
  expect((await attention(w.deps, 'duo')).signals.map((x) => [x.post, x.signal])).toContainEqual(['builder@duo', 'usage_limit'])
})

test('context_low: told once per session; a new session marker clears the old row so attention shows only one; no marker text leaks into the row', async () => {
  const w = world(); w.o.screens.set('term-c', sample('claude-context-low'))
  await w.scan(true); w.tick(); await w.scan(); w.tick(); await w.scan()
  const notices = () => w.sentTo('term-b').filter((t) => t.includes('上下文剩余 7%'))
  expect(notices()).toHaveLength(1)
  const rows = () => w.registry.listPatrolState('duo').filter((r) => r.signal === 'context_low')
  expect(rows()).toHaveLength(1)
  expect(rows()[0]!.taskId).toMatch(/^sk-[0-9a-f]{12}$/)
  w.registry.setSessionMarker('checker@duo', 'WLS-bbbb2222', w.c.now().toISOString())
  w.tick(); await w.scan()
  expect(rows().filter((r) => !r.clearedAt)).toHaveLength(1)
  expect(rows()).toHaveLength(2)
  expect(JSON.stringify(rows())).not.toContain('WLS-')
  expect((await attention(w.deps, 'duo')).signals.filter((x) => x.signal === 'context_low')).toHaveLength(1)
})

test('context_low coming back within CONTEXT_RENOTIFY_MS only restores the row; after it, it tells again', async () => {
  expect(CONTEXT_RENOTIFY_MS).toBe(3_600_000)
  const w = world()
  const low = sample('claude-context-low')
  const notices = () => w.sentTo('term-b').filter((t) => t.includes('上下文剩余'))
  w.o.screens.set('term-c', low); await w.scan(true); w.tick(); await w.scan() // 通知（t = 5 分钟）
  w.o.screens.set('term-c', idle); w.tick(); await w.scan()                    // 画面不再显示：清除
  w.o.screens.set('term-c', low); w.tick(20); await w.scan()                    // 25 分钟时再次出现：只恢复
  expect(notices()).toHaveLength(1)
  expect(w.registry.listPatrolState('duo').find((r) => r.signal === 'context_low')!.clearedAt).toBeNull()
  w.o.screens.set('term-c', idle); w.tick(); await w.scan()
  w.o.screens.set('term-c', low); w.tick(40); await w.scan()                    // 距第一次通知已超过 1 小时：再通知
  expect(notices()).toHaveLength(2)
})

test('restart: the first scan only observes, the pause deadline is read back from the registry, nothing is told twice and the continue line still comes at the deadline', async () => {
  const w = world(); w.o.screens.set('term-c', limit())
  await w.scan(true); w.tick(); await w.scan()
  const before = w.usage()!
  w.tick(); await w.scan(true) // 调度员重启后的第一轮
  expect(w.usage()).toEqual({ ...before })
  expect(usageNotices(w)).toHaveLength(1)
  w.goto('2026-10-16T15:03:00+08:00'); await w.scan()
  expect(continueLines(w)).toHaveLength(1)
})

test('a terminalRead failure for one post gives that post no signals and leaves the others alone', async () => {
  const w = world(); w.registry.upsertPost({ ...w.registry.getPost('builder@duo')!, agent: 'claude' })
  w.o.screens.set('term-c', limit()); w.o.screens.set('term-b', sample('claude-context-low'))
  w.o.faults.push({ method: 'terminalRead', when: 'before', match: (a) => a.handle === 'term-c', error: new WinglineError('orca', 'screen_unavailable', 'x') })
  await w.scan(true)
  expect(w.usage()).toBeNull()
  expect(w.registry.listPatrolState('duo').some((r) => r.post === 'builder@duo' && r.signal === 'context_low')).toBe(true)
  await w.scan(true)
  expect(w.usage()).toMatchObject({ level: 0 })
})

test('through the real loop: the first interval only observes, the next one tells the lead', async () => {
  const c = clock(Date.parse(T0)); const o = new FakeOrca()
  const s = seedRunningTeam(o, { now: c.now, monotonic: c.monotonic, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  s.registry.upsertPost({ ...s.registry.getPost('checker@duo')!, agent: 'claude' })
  o.screens.set('term-c', limit())
  const sleep = async (ms: number) => { c.advance(ms) }
  const team = await connectDispatcher(s.deps, 'duo', 'term-dsp', { sleep })
  const st = initialState(s.deps, team, loadTeamSpec(team.specPath))
  const once = () => loopOnce(s.deps, 'term-dsp', st, { sleep, waitMs: 1 })
  c.advance(PATROL_INTERVAL_MS); await once()
  expect(s.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')).toMatchObject({ level: 0 })
  c.advance(PATROL_INTERVAL_MS); await once()
  expect(s.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')).toMatchObject({ level: 1 })
  expect(o.sent.filter((x) => x.handle === 'term-b' && x.text.includes('用量已用完'))).toHaveLength(1)
})
