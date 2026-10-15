import { expect, test } from 'vitest'
import { claimTask, releaseTask, reassignTask } from '../../../src/commands/task/claim.js'
import { startTask } from '../../../src/commands/task/start.js'
import { DUO_YAML, SELF_CLAIM_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const seed = (over: Parameters<typeof seedRunningTeam>[1] = {}) => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: SELF_CLAIM_YAML, ...over })
  const add = async (tags: string[] = [], claimedBy: string | null = null) => {
    const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
    s.registry.insertTaskExt({ taskId: id, team: 'duo', tags, kind: 'work', claimedBy }); return id
  }
  return { o, ...s, add }
}
test('claim: self_claim disabled → self_claim_disabled', async () => {
  const { deps, add } = seed({ yaml: DUO_YAML })
  await expect(claimTask(deps, { id: await add(), as: 'builder@duo' })).rejects.toMatchObject({ code: 'self_claim_disabled' })
})
test('claim: tags must intersect; empty task tags match anyone with self_claim; task_log claim', async () => {
  const { deps, registry, add } = seed()
  await expect(claimTask(deps, { id: await add(['frontend']), as: 'builder@duo' })).rejects.toMatchObject({ code: 'tags_mismatch' })
  const id = await add([])
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actorSource])).toEqual([['claim', 'explicit']])
})
test('claim works on a task created in the Orca UI (no task_ext row yet)', async () => {
  const { o, deps, registry } = seed()
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 'ui', run: 'run-1', from: 'coord-1' })
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)).toMatchObject({ team: 'duo', claimedBy: 'builder@duo' })
})
test('claim: an already-claimed or non-ready task → task_not_open', async () => {
  const { o, deps, add } = seed()
  await expect(claimTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
  const id = await add(); await o.gateCreate({ task: id, question: 'q', from: 'coord-1' })
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('claim while another holder has the team lock → team_busy immediately', async () => {
  const { deps, registry, add } = seed(); const id = await add()
  let release!: () => void
  const held = registry.withTeamLock('duo', () => new Promise<void>((res) => { release = res }))
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'team_busy' })
  release(); await held
  await claimTask(deps, { id, as: 'builder@duo' })
})
test('release: only the owner; dispatched → task_dispatched; clears the owner and refreshes ready_since', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo')
  await expect(releaseTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  await releaseTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)).toMatchObject({ claimedBy: null, readySince: expect.any(String) })
  const d = await add([], 'builder@duo'); await o.dispatch({ task: d, to: 'term-b', from: 'coord-1' })
  await expect(releaseTask(deps, { id: d, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_dispatched', hint: expect.stringContaining('wl task escalate') })
})
test('reassign: anyone; unknown target → post_unknown; ready → new owner notified; dispatched → task_dispatched; terminal → task_terminal', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo')
  await expect(reassignTask(deps, { id, to: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  expect(await reassignTask(deps, { id, to: 'checker@duo' })).toEqual({ notify: { outcome: 'notified' } })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: expect.stringContaining(`任务 ${id} 转给了你`) })
  const d = await add([], 'builder@duo'); await o.dispatch({ task: d, to: 'term-b', from: 'coord-1' })
  await expect(reassignTask(deps, { id: d, to: 'checker@duo' })).rejects.toMatchObject({ code: 'task_dispatched' })
  const done = await add([], 'builder@duo'); o.tasks.find((t) => t.id === done)!.status = 'completed'
  await expect(reassignTask(deps, { id: done, to: 'checker@duo' })).rejects.toMatchObject({ code: 'task_terminal' })
})
test('start: not claimed by you / plan required', async () => {
  const { deps, add } = seed()
  await expect(startTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  await expect(startTask(deps, { id: await add([], 'builder@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'plan_required' })
})
test('start while the post already holds a dispatched task → post_busy naming that task', async () => {
  const { deps, registry, add } = seed()
  const a = await add([], 'builder@duo'); const b = await add([], 'builder@duo')
  registry.setPlan('duo', a, 'p'); registry.setPlan('duo', b, 'p')
  await startTask(deps, { id: a, as: 'builder@duo' })
  await expect(startTask(deps, { id: b, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_busy', hint: expect.stringContaining(a) })
})
test('start by the post itself (implicit): dispatched to its own terminal, nothing typed', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  expect(await startTask(deps, { id })).toEqual({ delivery: 'self' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b' })
  expect(o.sent).toEqual([])
})
test('start --as builder from checker\'s terminal: dispatched to builder and builder is notified', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  expect(await startTask(deps, { id, as: 'builder@duo' })).toEqual({ delivery: 'notified' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b' })
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b' })
})
test('start on a task already dispatched to another handle → task_not_open', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  await expect(startTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('start rerun after success is a no-op', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  await startTask(deps, { id, as: 'builder@duo' })
  expect(await startTask(deps, { id, as: 'builder@duo' })).toMatchObject({ already: true })
  expect(o.callsOf('dispatch')).toHaveLength(1)
})

test('claim: an unknown post, a post without self_claim, and no identity at all are each refused', async () => {
  const { deps, add } = seed()
  await expect(claimTask(deps, { id: await add(), as: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  await expect(claimTask(deps, { id: await add(), as: 'checker@duo' })).rejects.toMatchObject({ code: 'self_claim_disabled' })
  await expect(claimTask(deps, { id: await add() })).rejects.toMatchObject({ code: 'actor_required' })
})
test('claim: a task whose tags intersect the post tags can be claimed; the implicit caller is logged as implicit', async () => {
  const { deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await add(['backend', 'urgent'])
  await claimTask(deps, { id })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actor, l.actorSource])).toEqual([['claim', 'builder@duo', 'implicit']])
})
test('claim never calls Orca writes', async () => {
  const { o, deps, add } = seed(); const id = await add()
  o.orch.length = 0
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(o.orch).toEqual([])
})
test('release / reassign also take the team lock and fail with team_busy', async () => {
  const { deps, registry, add } = seed(); const id = await add([], 'builder@duo')
  let free!: () => void
  const held = registry.withTeamLock('duo', () => new Promise<void>((res) => { free = res }))
  await expect(releaseTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'team_busy' })
  await expect(reassignTask(deps, { id, to: 'checker@duo' })).rejects.toMatchObject({ code: 'team_busy' })
  free(); await held
})
test('release: a blocked task can be released; an unclaimed task and a terminal task cannot; the transition is logged', async () => {
  const { o, deps, registry, add } = seed()
  const b = await add([], 'builder@duo'); await o.gateCreate({ task: b, question: 'q', from: 'coord-1' })
  await releaseTask(deps, { id: b, as: 'builder@duo' })
  expect(registry.getTaskExt(b)!.claimedBy).toBeNull()
  expect(registry.listTaskLog(b).map((l) => l.action)).toEqual(['release'])
  await expect(releaseTask(deps, { id: await add(), as: 'builder@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  const done = await add([], 'builder@duo'); o.tasks.find((t) => t.id === done)!.status = 'completed'
  await expect(releaseTask(deps, { id: done, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_terminal' })
})
test('reassign: a blocked task is re-owned without a new ready_since; a ready one gets ready_since; the caller is human when unresolved; no Orca writes', async () => {
  const { o, deps, registry, add } = seed()
  const ready = await add([], 'builder@duo')
  const blocked = await add([], 'builder@duo'); await o.gateCreate({ task: blocked, question: 'q', from: 'coord-1' })
  o.orch.length = 0
  await reassignTask(deps, { id: ready, to: 'checker@duo' })
  await reassignTask(deps, { id: blocked, to: 'checker@duo' })
  expect(registry.getTaskExt(ready)).toMatchObject({ claimedBy: 'checker@duo', readySince: expect.any(String) })
  expect(registry.getTaskExt(blocked)).toMatchObject({ claimedBy: 'checker@duo', readySince: null })
  expect(registry.listTaskLog(ready)[0]).toMatchObject({ action: 'reassign', actor: 'human', actorSource: 'human' })
  expect(o.orch).toEqual([])
})
test('reassign when the new owner sits at a prompt: the owner still changes, the notice is not typed and says why', async () => {
  const { o, deps, registry, add } = seed(); const id = await add([], 'builder@duo')
  o.previews.set('term-c', 'Allow this edit? (y/n)')
  expect(await reassignTask(deps, { id, to: 'checker@duo' })).toEqual({ notify: { outcome: 'not_notified', reason: 'at_prompt' } })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
  expect(o.sent).toEqual([])
})
test('start: a post without plan_first can start without a plan; plan_first with a plan can start; the dispatch time and log are written', async () => {
  const { o, deps, registry, add } = seed()
  const c = await add([], 'checker@duo')
  expect(await startTask(deps, { id: c, as: 'checker@duo' })).toEqual({ delivery: 'notified' })
  const b = await add([], 'builder@duo'); registry.setPlan('duo', b, '先读')
  await startTask(deps, { id: b, as: 'builder@duo' })
  expect(registry.getTaskExt(b)!.dispatchedAt).toEqual(expect.any(String))
  expect(registry.listTaskLog(b).map((l) => l.action)).toContain('start')
  expect(o.tasks.find((t) => t.id === b)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-b' })
})
test('start: no identity → actor_required; a task without any owner → not_claimed_by_you; blocked and completed tasks → task_not_open', async () => {
  const { o, deps, add } = seed()
  await expect(startTask(deps, { id: await add([], 'builder@duo') })).rejects.toMatchObject({ code: 'actor_required' })
  const ui = (await o.taskCreate({ spec: 's', taskTitle: 'ui', run: 'run-1', from: 'coord-1' })).id
  await expect(startTask(deps, { id: ui, as: 'builder@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  const bl = await add([], 'checker@duo'); await o.gateCreate({ task: bl, question: 'q', from: 'coord-1' })
  await expect(startTask(deps, { id: bl, as: 'checker@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
  const dn = await add([], 'checker@duo'); o.tasks.find((t) => t.id === dn)!.status = 'completed'
  await expect(startTask(deps, { id: dn, as: 'checker@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('start when Orca already has another dispatch on the post terminal (made outside wingline) → post_busy naming it, no ledger row left', async () => {
  const { o, deps, registry, add } = seed()
  const other = await add([], 'checker@duo'); await o.dispatch({ task: other, to: 'term-c', from: 'coord-1' })
  const id = await add([], 'checker@duo')
  await expect(startTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'post_busy', hint: expect.stringContaining(other) })
  expect(registry.getRequest(`dispatch:${id}:0`)).toBeNull()
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('ready')
})
test('start with the target at a confirmation prompt: still dispatched, delivery not_notified with the reason, nothing typed', async () => {
  const { o, deps, add } = seed()
  o.previews.set('term-c', 'Do you want to proceed? (y/n)')
  const id = await add([], 'checker@duo')
  expect(await startTask(deps, { id, as: 'checker@duo' })).toEqual({ delivery: 'not_notified', reason: 'at_prompt' })
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('dispatched')
  expect(o.sent).toEqual([])
})
test('start rerun by the post itself reports self; rerun via --as from another terminal reports not_notified (no second notice)', async () => {
  const own = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const a = await own.add([], 'checker@duo')
  await startTask(own.deps, { id: a })
  expect(await startTask(own.deps, { id: a })).toEqual({ delivery: 'self', already: true })
  const other = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const b = await other.add([], 'checker@duo')
  await startTask(other.deps, { id: b, as: 'checker@duo' })
  const n = other.o.sent.length
  expect(await startTask(other.deps, { id: b, as: 'checker@duo' })).toEqual({ delivery: 'not_notified', already: true })
  expect(other.o.sent.length).toBe(n)
})
