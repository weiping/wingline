// 审查方测试（spec 第 7 节）：冻结对 2A 命令的实际效果。
import { expect, test } from 'vitest'
import { claimTask, reassignTask, releaseTask } from '../../../src/commands/task/claim.js'
import { createTask } from '../../../src/commands/task/create.js'
import { escalateTask, recoverTask } from '../../../src/commands/task/escalate.js'
import { isPostFrozen } from '../../../src/commands/task/frozen.js'
import { startTask } from '../../../src/commands/task/start.js'
import { SELF_CLAIM_YAML } from '../../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

function seed() {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: SELF_CLAIM_YAML })
  const add = async (claimedBy: string | null = null) => {
    const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
    s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy }); return id
  }
  return { o, ...s, add }
}

test('isPostFrozen reads frozen_posts and is exact per address', () => {
  const { deps, registry } = seed()
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  expect(isPostFrozen(deps, 'checker@duo')).toBe(true)
  expect(isPostFrozen(deps, 'builder@duo')).toBe(false)
  registry.unfreezePost('checker@duo')
  expect(isPostFrozen(deps, 'checker@duo')).toBe(false)
})

test('create --post <frozen>: no orchestration call and no terminal lookup happen before the refusal', async () => {
  const { o, deps, registry } = seed()
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  o.calls.length = 0
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  expect(o.orch).toEqual([])
  expect(o.calls.filter((c) => c !== 'status')).toEqual([])
})

test('create without --post is unaffected by a frozen post', async () => {
  const { deps, registry } = seed()
  registry.freezePost({ post: 'checker@duo', team: 'duo', reason: 'x' })
  await expect(createTask(deps, { team: 'duo', title: 't' })).resolves.toMatchObject({ id: expect.any(String) })
})

test('every post_frozen error carries the unfreeze command in its hint', async () => {
  const { deps, registry, add } = seed()
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  const hint = { code: 'post_frozen', hint: expect.stringContaining('wl dispatcher unfreeze builder@duo') }
  await expect(claimTask(deps, { id: await add(), as: 'builder@duo' })).rejects.toMatchObject(hint)
  await expect(reassignTask(deps, { id: await add('checker@duo'), to: 'builder@duo' })).rejects.toMatchObject(hint)
  const planned = await add('builder@duo'); registry.setPlan('duo', planned, 'p')
  await expect(startTask(deps, { id: planned, as: 'builder@duo' })).rejects.toMatchObject(hint)
})

test('start by a frozen plan_first post without a plan → post_frozen, not plan_required (frozen is about the post)', async () => {
  const { deps, registry, add } = seed()
  const id = await add('builder@duo')
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  await expect(startTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
})

test('a frozen post may still release and escalate its own tasks (spec 第 7 节)', async () => {
  const { o, deps, registry, add } = seed()
  const mine = await add('builder@duo')
  const busy = await add('builder@duo'); await o.dispatch({ task: busy, to: 'term-b', from: 'coord-1' })
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  await expect(releaseTask(deps, { id: mine, as: 'builder@duo' })).resolves.toBeUndefined()
  await expect(escalateTask(deps, { id: busy, reason: '卡住', as: 'builder@duo' })).resolves.toMatchObject({ status: 'blocked' })
})

test('reassign away from a frozen post to a live one works', async () => {
  const { deps, registry, add } = seed()
  const id = await add('builder@duo')
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  await expect(reassignTask(deps, { id, to: 'checker@duo' })).resolves.toBeDefined()
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
})

test('after unfreeze the same command succeeds', async () => {
  const { deps, registry, add } = seed()
  const id = await add()
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  registry.unfreezePost('builder@duo')
  await expect(claimTask(deps, { id, as: 'builder@duo' })).resolves.toBeUndefined()
})

test('recover with a frozen owner: task back to ready, nothing dispatched, claimed_by kept', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add('builder@duo'); await o.dispatch({ task: id, to: 'term-old', from: 'coord-1' })
  registry.freezePost({ post: 'builder@duo', team: 'duo', reason: 'x' })
  o.orch.length = 0
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'ready', reason: 'skipped_frozen' })
  expect(o.callsOf('dispatch')).toEqual([])
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('ready')
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
})
