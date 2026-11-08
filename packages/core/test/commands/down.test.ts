import { expect, test } from 'vitest'
import { down } from '../../src/commands/down.js'
import { FakeOrca, mkDeps } from './fake-client.js'

function seeded(orca: FakeOrca) {
  const m = mkDeps(orca)
  const { registry } = m
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'abcdef1234567890', runId: null, coordinatorHandle: null, status: 'up' })
  for (const [p, lead] of [['builder', true], ['checker', false]] as const) {
    registry.upsertPost({ address: `${p}@duo`, team: 'duo', agent: 'claude', worktree: 'current', handle: p, status: 'live', isLead: lead, sessionMarker: null, sessionId: null, sessionAt: null })
  }
  orca.terminals = [
    { handle: 'b1', title: 'builder@duo', connected: true, worktreeId: 'w' },
    { handle: 'c1', title: 'checker@duo', connected: true, worktreeId: 'w' },
  ]
  return m
}

test('default down only marks the team stopped, no orca call at all', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  const r = await down(deps, { team: 'duo', close: false })
  expect(r.posts.map((p) => p.outcome)).toEqual(['stopped', 'stopped'])
  expect(o.calls).toEqual([])
  expect(registry.getTeam('duo')!.status).toBe('stopped')
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['live', 'live'])
})

test('--close marks closed when ptyKilled is true', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  const r = await down(deps, { team: 'duo', close: true })
  expect(r.posts.map((p) => p.outcome)).toEqual(['closed', 'closed'])
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['closed', 'closed'])
  expect(registry.getTeam('duo')!.status).toBe('stopped')
  expect(o.terminals).toEqual([])
})

test('--close with ptyKilled false is uncertain: all states written first, then it throws', async () => {
  const o = new FakeOrca()
  o.ptyKilled = false
  const { deps, registry } = seeded(o)
  await expect(down(deps, { team: 'duo', close: true })).rejects.toMatchObject({ kind: 'uncertain', code: 'close_unconfirmed' })
  expect(registry.listPosts('duo').map((p) => p.status)).toEqual(['uncertain', 'uncertain'])
  expect(o.calls.filter((c) => c === 'terminalClose')).toHaveLength(2)
  expect(registry.getTeam('duo')!.status).toBe('stopped')
})

test('--close on a missing terminal is already_gone and recorded closed', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  o.terminals = [o.terminals[1]!]
  const r = await down(deps, { team: 'duo', close: true })
  expect(r.posts.map((p) => p.outcome)).toEqual(['already_gone', 'closed'])
  expect(registry.getPost('builder@duo')!.status).toBe('closed')
})

test('close ids are fresh after an earlier completed close', async () => {
  const o = new FakeOrca()
  const { deps } = seeded(o)
  await down(deps, { team: 'duo', close: true })
  o.terminals = [{ handle: 'b2', title: 'builder@duo', connected: true, worktreeId: 'w' }]
  const closed: string[] = []
  const orig = o.terminalClose.bind(o)
  o.terminalClose = async (a) => { closed.push(a.handle); return orig(a) }
  await down(deps, { team: 'duo', close: true })
  expect(closed).toEqual(['b2'])
})

test('unknown team is an input error', async () => {
  await expect(down(seeded(new FakeOrca()).deps, { team: 'nope', close: false })).rejects.toMatchObject({ kind: 'input', code: 'team_unknown' })
})

test('--close preflights: unreachable orca stops before any change', async () => {
  const o = new FakeOrca()
  o.reachable = false
  const { deps, registry } = seeded(o)
  await expect(down(deps, { team: 'duo', close: true })).rejects.toMatchObject({ code: 'runtime_unavailable' })
  expect(registry.getTeam('duo')!.status).toBe('up')
})

test('--close 对终端已消失的岗位结账未完成请求行：下次 up 开新 gen 而不是撞 already_done', async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  o.terminals = [] // 岗位终端已退出
  // 上一轮 up 留下的未完成行（本地 uncertain，Orca 侧早已完成）
  registry.beginRequest('duo:checker:create:12c0bfdb')
  registry.finishRequest('duo:checker:create:12c0bfdb', 'uncertain', { partial: true })

  const r = await down(deps, { team: 'duo', close: true })
  expect(r.posts.find((p) => p.address === 'checker@duo')!.outcome).toBe('already_gone')
  expect(registry.getRequest('duo:checker:create:12c0bfdb')!.state).toBe('done')

  // 结账后下一代可以开新行，beginRequest 不再撞 request_already_done
  const fresh = 'duo:checker:create:12c0bfdb-1'
  expect(() => registry.beginRequest(fresh)).not.toThrow()
  expect(registry.getRequest(fresh)!.state).toBe('pending')
})

test('lifetimeGen：无 brief 行的岗位（create/-1、wait 全 done）也能推进到下一代', async () => {
  const { lifetimeGen } = await import('../../src/commands/launch.js')
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  registry.getRequest('duo:checker:create:12c0bfdb') // 触碰一下，确保表已建
  const mk = (id: string, state: 'done' | 'uncertain') => {
    registry.beginRequest(id)
    registry.finishRequest(id, state)
  }
  // checker 没有 brief 行：create 基行与 -1、wait 基行与 -1 全部 done
  mk('duo:checker:create:12c0bfdb', 'done')
  mk('duo:checker:create:12c0bfdb-1', 'done')
  mk('duo:checker:wait:12c0bfdb', 'done')
  mk('duo:checker:wait:12c0bfdb-1', 'done')
  const l = { deps, spec: { name: 'duo' } as never, hash: '12c0bfdb' }
  // 终端不在（located=false），前两代全完成 → 应推进到 gen 2（-2 行不存在 → 新生命周期）
  expect(lifetimeGen(l as never, 'checker', false)).toBe(2)
  // 有未完成的代：沿用重试
  mk('duo:checker:create:12c0bfdb-2', 'uncertain')
  expect(lifetimeGen(l as never, 'checker', false)).toBe(2)
})
