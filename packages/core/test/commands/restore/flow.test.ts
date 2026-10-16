import os from 'node:os'
import { expect, test } from 'vitest'
import { DUO_YAML, mkTeam } from '../../spec/helpers.js'
import { FakeOrca, mkDeps } from '../fake-client.js'
import { up } from '../../../src/commands/up.js'
import { restore } from '../../../src/commands/restore/index.js'

test('end to end: up → orca restart → restore resumes, reclaims and recovers; a rerun is all kept', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: mkTeam(DUO_YAML) })
  expect(registry.getTeam('duo')!.runId).toBeTruthy()

  // 模拟 Orca 重启：终端全没了；builder 的岗位会话用原标记重开过，能搜到
  const builderMarker = registry.getPost('builder@duo')!.sessionMarker!
  const deadHandle = registry.getPost('builder@duo')!.handle!
  o.terminals = []
  o.sessions.push({ marker: builderMarker, agent: 'claude', sessionId: 's1', cwd: os.tmpdir() })
  o.tasks.push({ id: 'task-1', status: 'dispatched', title: '活儿', spec: 'spec-1', parentId: null, assigneeHandle: deadHandle, dispatchId: 'ctx-9', result: null })
  registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })

  const first = await restore(deps, { team: 'duo' })
  expect(first.posts.map((p) => [p.address, p.outcome])).toEqual([['builder@duo', 'resumed'], ['checker@duo', 'fresh']])
  expect(first.posts.find((p) => p.address === 'checker@duo')!.reason).toContain('上下文已丢失')
  expect(first.run!.outcome).toBe('reclaimed')
  expect(first.tasks).toEqual([{ taskId: 'task-1', owner: 'builder@duo', outcome: 'recovered' }])
  const notices = () => o.sent.filter((s) => s.text.includes('重启后已接回')).length
  expect(notices()).toBe(1)
  const createdCount = o.created.length
  const dispatchCount = o.callsOf('dispatch').length

  const second = await restore(deps, { team: 'duo' })
  expect(second.posts.map((p) => p.outcome)).toEqual(['kept', 'kept'])
  expect(second.run!.outcome).toBe('kept')
  expect(second.tasks).toEqual([])
  expect(notices()).toBe(1)
  expect(o.created.length).toBe(createdCount)
  expect(o.callsOf('dispatch').length).toBe(dispatchCount)
})
