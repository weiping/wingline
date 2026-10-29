import { expect, test } from 'vitest'
import { readTimeline } from '../../../src/commands/log.js'
import { createTask } from '../../../src/commands/task/create.js'
import { planTask } from '../../../src/commands/task/plan.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

test('planTask 显式传 as 时执行者记为该岗位', async () => {
  const { deps } = seedRunningTeam(new FakeOrca())
  await createTask(deps, { team: 'duo', title: '第一步' })
  await planTask(deps, { id: 'task-1', text: '第一步', as: 'builder@duo' })
  const events = await readTimeline(deps, { team: 'duo', limit: 50 })
  expect(events.events.some((e) => e.action === 'plan' && e.actor === 'builder@duo')).toBe(true)
})

test('planTask 不传 as 时行为不变（执行者由环境推断，记 human）', async () => {
  const { deps } = seedRunningTeam(new FakeOrca())
  await createTask(deps, { team: 'duo', title: '第一步' })
  await planTask(deps, { id: 'task-1', text: '第一步' })
  const events = await readTimeline(deps, { team: 'duo', limit: 50 })
  expect(events.events.some((e) => e.action === 'plan' && e.actor === 'human')).toBe(true)
})
