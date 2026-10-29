// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { NewTeamDialog, TEAM_TEMPLATES_UI } from '../src/components/NewTeamDialog.js'
import { Layout } from '../src/components/Layout.js'
import { App } from '../src/app.js'
import { Fail, SESSION, mockApi } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('TEAM_TEMPLATES_UI 常量包含预设模板列表', () => {
  expect(TEAM_TEMPLATES_UI).toEqual([
    { id: 'duo', label: '双人协作（推荐）', summary: 'builder 负责编码，checker 负责复核' },
    { id: 'solo', label: '单人团队', summary: 'builder 负责全部实现与验证' },
    { id: 'trio', label: '三人流水线', summary: 'planner 规划，builder 实施，checker 验收' },
  ])
})

test('新建团队弹窗：选模板、填名字与代码库目录后能创建并跳到编辑页', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => ({ team: 'my-team', specPath: '/x/team.yaml', created: true }),
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByRole('button', { name: '使用预设模板' }))
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'my-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.click(getByRole('button', { name: '仅创建配置' }))

  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams')).toBe(true))
  const call = calls.find((c) => c.method === 'POST' && c.path === '/api/teams')!
  expect(call.body).toMatchObject({ mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' })
  expect(onCreated).toHaveBeenCalledWith('my-team', false)
})

test('新建团队弹窗：选 solo 模板、填可选配置目录并「创建并启动」', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => ({ team: 'solo-team', specPath: '/x/team.yaml', created: true }),
    'POST /api/teams/solo-team/up': () => ({ ok: true }),
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText, getByText } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByText('单人团队'))
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'solo-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.input(getByLabelText('配置存放目录'), { target: { value: '/tmp/custom-dir' } })
  fireEvent.click(getByRole('button', { name: '创建并启动' }))

  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/solo-team/up')).toBe(true))
  const createCall = calls.find((c) => c.method === 'POST' && c.path === '/api/teams')!
  expect(createCall.body).toMatchObject({
    mode: 'template',
    name: 'solo-team',
    repo: '/tmp/repo',
    template: 'solo',
    dir: '/tmp/custom-dir',
  })
  expect(onCreated).toHaveBeenCalledWith('solo-team', true)
})

test('导入模式提交 mode: import 与 specPath', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => ({ team: 'imported-team', specPath: '/tmp/my-spec.yaml', created: true }),
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByRole('button', { name: '导入已有配置' }))
  fireEvent.input(getByLabelText('配置文件路径（team.yaml）'), { target: { value: '/tmp/my-spec.yaml' } })
  fireEvent.click(getByRole('button', { name: '导入团队' }))

  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams')).toBe(true))
  const call = calls.find((c) => c.method === 'POST' && c.path === '/api/teams')!
  expect(call.body).toMatchObject({ mode: 'import', specPath: '/tmp/my-spec.yaml' })
  expect(onCreated).toHaveBeenCalledWith('imported-team', false)
})

test('导入模式：导入并启动', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => ({ team: 'imported-team', specPath: '/tmp/my-spec.yaml', created: true }),
    'POST /api/teams/imported-team/up': () => ({ ok: true }),
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByRole('button', { name: '导入已有配置' }))
  fireEvent.input(getByLabelText('配置文件路径（team.yaml）'), { target: { value: '/tmp/my-spec.yaml' } })
  fireEvent.click(getByRole('button', { name: '导入并启动' }))

  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams/imported-team/up')).toBe(true))
  expect(onCreated).toHaveBeenCalledWith('imported-team', true)
})

test('必填项校验：未填信息时不发请求并显示错误', async () => {
  const calls = mockApi({
    'GET /api/session': () => SESSION,
  })
  const onCreated = vi.fn()
  const { getByRole, findByRole } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByRole('button', { name: '仅创建配置' }))
  const alert = await findByRole('alert')
  expect(alert.textContent).toContain('请填写必填项')
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  expect(onCreated).not.toHaveBeenCalled()
})

test('创建失败时显示错误文案，不跳转', async () => {
  mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => {
      throw new Fail(400, { kind: 'input', code: 'team_exists', message: '团队已存在' })
    },
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText, findByRole } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'dup-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.click(getByRole('button', { name: '仅创建配置' }))

  const alert = await findByRole('alert')
  expect(alert.textContent).toContain('团队已存在')
  expect(onCreated).not.toHaveBeenCalled()
})

test('点击取消按钮调用 onClose', () => {
  const onClose = vi.fn()
  const { getByRole } = render(
    <NewTeamDialog open onClose={onClose} onCreated={() => {}} />,
  )
  fireEvent.click(getByRole('button', { name: '取消' }))
  expect(onClose).toHaveBeenCalled()
})

test('模板卡片包含 aria-pressed 状态并使用 Pill 标记当前项', () => {
  const { getByRole, getByText } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={() => {}} />,
  )
  const duoBtn = getByRole('button', { name: /双人协作/ })
  expect(duoBtn.getAttribute('aria-pressed')).toBe('true')
  expect(getByText('当前', { selector: '.pill' })).toBeTruthy()

  const soloBtn = getByRole('button', { name: /单人团队/ })
  expect(soloBtn.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(soloBtn)
  expect(soloBtn.getAttribute('aria-pressed')).toBe('true')
})

test('重开弹窗时清除上一轮残留报错（Important 2）', async () => {
  mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => {
      throw new Fail(400, { kind: 'input', code: 'team_exists', message: '团队已存在' })
    },
  })
  const { getByRole, getByLabelText, findByRole, queryByRole, rerender } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={() => {}} />,
  )
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'dup-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.click(getByRole('button', { name: '仅创建配置' }))

  const alert = await findByRole('alert')
  expect(alert.textContent).toContain('团队已存在')

  // 关闭弹窗
  rerender(<NewTeamDialog open={false} onClose={() => {}} onCreated={() => {}} />)
  expect(queryByRole('dialog')).toBeNull()

  // 再次打开弹窗：error 应当被清除
  rerender(<NewTeamDialog open={true} onClose={() => {}} onCreated={() => {}} />)
  expect(queryByRole('alert')).toBeNull()
})

test('Layout 侧栏包含「新建团队」按钮并触发 onOpenNewTeam', () => {
  const onOpen = vi.fn()
  const { getByRole } = render(
    <Layout teams={['duo']} team="duo" onOpenNewTeam={onOpen}>
      <div>内容</div>
    </Layout>,
  )
  const btn = getByRole('button', { name: '新建团队' })
  fireEvent.click(btn)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

test('Layout 无团队时依然显示「新建团队」按钮并触发 onOpenNewTeam', () => {
  const onOpen = vi.fn()
  const { getByRole, getByText } = render(
    <Layout teams={[]} team={null} onOpenNewTeam={onOpen}>
      <div>内容</div>
    </Layout>,
  )
  expect(getByText('还没有团队')).toBeTruthy()
  fireEvent.click(getByRole('button', { name: '新建团队' }))
  expect(onOpen).toHaveBeenCalledTimes(1)
})


test('导入模式必填校验：未填 specPath 时报错', async () => {
  const calls = mockApi({ 'GET /api/session': () => SESSION })
  const onCreated = vi.fn()
  const { getByRole, findByRole } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.click(getByRole('button', { name: '导入已有配置' }))
  fireEvent.click(getByRole('button', { name: '导入团队' }))
  const alert = await findByRole('alert')
  expect(alert.textContent).toContain('请填写必填项')
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  expect(onCreated).not.toHaveBeenCalled()
})

test('创建并启动时若 up 失败，显示错误并不调用 onCreated', async () => {
  mockApi({
    'GET /api/session': () => SESSION,
    'POST /api/teams': () => ({ team: 'up-fail-team', specPath: '/x/team.yaml', created: true }),
    'POST /api/teams/up-fail-team/up': () => {
      throw new Fail(500, { kind: 'runtime', code: 'start_failed', message: '启动团队失败' })
    },
  })
  const onCreated = vi.fn()
  const { getByRole, getByLabelText, findByRole } = render(
    <NewTeamDialog open onClose={() => {}} onCreated={onCreated} />,
  )
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'up-fail-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.click(getByRole('button', { name: '创建并启动' }))

  const alert = await findByRole('alert')
  expect(alert.textContent).toContain('启动团队失败')
  expect(onCreated).not.toHaveBeenCalled()
})

test('styles.css 包含全局表单控件背景与 .btn.ghost 表面色规则', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles.css'), 'utf8')
  expect(css).toContain('input:not([type="checkbox"]):not([type="radio"]), select, textarea')
  expect(css).toMatch(/\.btn\.ghost\s*\{[^}]*background:\s*var\(--surface\)/)
})

test('App 建队成功后调用 session.reload() 刷新会话（Important 3）', async () => {
  let sessionCalls = 0
  let teams: string[] = []
  const calls = mockApi({
    'GET /api/session': () => {
      sessionCalls++
      return { csrfToken: 'tok', version: '1', teams }
    },
    'POST /api/teams': () => {
      teams = ['fresh-team']
      return { team: 'fresh-team', specPath: '/x/team.yaml', created: true }
    },
  })
  const { findAllByRole, getByLabelText, findByRole } = render(<App />)
  await waitFor(() => expect(sessionCalls).toBeGreaterThanOrEqual(1))
  const beforeCreate = sessionCalls
  const buttons = await findAllByRole('button', { name: '新建团队' })
  fireEvent.click(buttons[0]!)
  fireEvent.input(getByLabelText('团队名称'), { target: { value: 'fresh-team' } })
  fireEvent.input(getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
  fireEvent.click(await findByRole('button', { name: '仅创建配置' }))

  await waitFor(() => {
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/teams')).toBe(true)
    expect(sessionCalls).toBeGreaterThan(beforeCreate)
    expect(teams).toEqual(['fresh-team'])
  })
})


