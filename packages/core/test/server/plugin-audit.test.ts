import { expect, test } from 'vitest'
import { auditedWriteCommands } from '../../src/server/api-write.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'

test('plugin: 前缀的写命令与控制台同表同 actor，command 列带 plugin: 前缀', async () => {
  const { deps, registry } = seedRunningTeam(new FakeOrca())
  const cmds = auditedWriteCommands('plugin:')
  await cmds.freezePostCmd(deps, { address: 'builder@duo', reason: '面板测试' })
  const audits = registry.listAudit('duo')
  expect(audits).toHaveLength(1)
  expect(audits[0]).toMatchObject({ command: 'plugin: dispatcher freeze', actor: 'human', outcome: 'ok', team: 'duo' })
})

test('控制台前缀仍是 console:，两者互不干扰', async () => {
  const { deps, registry } = seedRunningTeam(new FakeOrca())
  await auditedWriteCommands('console:').freezePostCmd(deps, { address: 'builder@duo', reason: 'x' })
  const audits = registry.listAudit('duo')
  expect(audits[0]).toMatchObject({ command: 'console: dispatcher freeze', actor: 'human' })
})
