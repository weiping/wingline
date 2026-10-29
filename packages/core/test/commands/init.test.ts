import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { initTeamCmd } from '../../src/commands/init.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { FakeOrca, mkDeps } from './fake-client.js'

test('模板模式生成 duo 团队：配置、规范与两份职责简报，并登记为未启动', async () => {
  const { deps } = mkDeps(new FakeOrca())
  const r = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
  expect(r).toEqual({ team: 'my-team', specPath: path.join(deps.home, 'teams', 'my-team', 'team.yaml'), created: true })
  expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'NORMS.md'))).toBe(true)
  expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'briefs', 'builder.md'))).toBe(true)
  expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'briefs', 'checker.md'))).toBe(true)
  const spec = loadTeamSpec(r.specPath)
  expect(spec.name).toBe('my-team')
  expect(spec.lead).toBe('builder')
  expect(spec.posts.map((p) => p.id)).toEqual(['builder', 'checker'])
  expect(spec.posts[1]!.launch).toContain('codex --model gpt-6-astra')
  const row = deps.registry.getTeam('my-team')!
  expect(row.status).toBe('stopped')
  expect(row.runId).toBeNull()
  expect(deps.registry.listPosts('my-team').map((p) => p.address).sort()).toEqual(['builder@my-team', 'checker@my-team'])
})

test('repo 自动补 path: 前缀；solo 模板只有一个岗位', async () => {
  const { deps } = mkDeps(new FakeOrca())
  const r = await initTeamCmd(deps, { mode: 'template', name: 'one', repo: '/tmp/repo', template: 'solo' })
  expect(loadTeamSpec(r.specPath).repo).toBe('path:/tmp/repo')
  expect(loadTeamSpec(r.specPath).posts.map((p) => p.id)).toEqual(['builder'])
})

test('重复初始化同一个团队是幂等的（created=false），不报错也不覆盖', async () => {
  const { deps } = mkDeps(new FakeOrca())
  const a = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
  const b = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
  expect(b.created).toBe(false)
  expect(b.specPath).toBe(a.specPath)
})

test('非法的团队名与已存在的团队分别报可读错误', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(initTeamCmd(deps, { mode: 'template', name: 'My Team', repo: '/tmp/repo' }))
    .rejects.toMatchObject({ code: 'team_name_invalid' })
  await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
  await expect(initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo', dir: path.join(deps.home, 'other') }))
    .rejects.toMatchObject({ code: 'team_already_exists' })
})

test('导入已有配置：登记为未启动团队；配置不合法时报 spec_invalid', async () => {
  const { deps } = mkDeps(new FakeOrca())
  const dir = path.join(deps.home, 'imported')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'NORMS.md'), '# 规范\n')
  fs.writeFileSync(path.join(dir, 'team.yaml'), [
    'version: 1', 'name: imported', 'repo: path:/tmp/repo', 'norms: NORMS.md', 'lead: builder',
    'posts:', '  - id: builder', '    agent: claude', '    model: opus', '    worktree: current', '    brief: [briefs/builder.md]',
  ].join('\n'))
  fs.mkdirSync(path.join(dir, 'briefs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'briefs', 'builder.md'), '# builder\n')
  const r = await initTeamCmd(deps, { mode: 'import', specPath: path.join(dir, 'team.yaml') })
  expect(r).toEqual({ team: 'imported', specPath: path.join(dir, 'team.yaml'), created: true })
  expect(deps.registry.getTeam('imported')!.status).toBe('stopped')
})
