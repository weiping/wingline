import { expect, test } from 'vitest'
import { dispatcherUp } from '../../../src/commands/dispatcher/lifecycle.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

test('dispatcherUp 把 UpArgs.node/script 透传进 self 启动命令（插件 worker 宿主是 Orca 时必需）', async () => {
  const { deps } = seedRunningTeam(new FakeOrca())
  const created: string[] = []
  const orig = deps.orca.terminalCreate.bind(deps.orca)
  deps.orca.terminalCreate = async (a: { worktree: string; title: string; command: string }) => {
    created.push(a.command)
    return orig(a)
  }
  await expect(
    dispatcherUp(deps, { team: 'duo', node: '/fake/node', script: '/fake/main.js', confirmMs: 0, pollMs: 1 }),
  ).rejects.toMatchObject({ code: 'dispatcher_start_unconfirmed' })
  expect(created[0]).toContain('/fake/node')
  expect(created[0]).toContain('/fake/main.js')
})
