// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact'
import { Edit } from '../src/pages/Edit.js'
import { Fail, mockApi, type Call } from './helpers.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const YAML_TEXT = 'version: 1\nname: duo\nlead: builder\nposts:\n  - id: builder\n    agent: claude\n  - id: checker\n    agent: codex\n'
const PARSED = {
  version: 1,
  name: 'duo',
  repo: 'path:/r',
  norms: 'NORMS.md',
  lead: 'builder',
  posts: [
    { id: 'builder', agent: 'claude', worktree: 'current', brief: ['briefs/builder.md'] },
    { id: 'checker', agent: 'codex', worktree: 'current', brief: [] },
  ],
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function setIn(obj: any, path: Array<string | number>, value: unknown): any {
  const out = clone(obj)
  let cur = out
  for (const k of path.slice(0, -1)) cur = cur[k]
  cur[path.at(-1)!] = value
  return out
}

interface Opts {
  running?: boolean
  draft?: { yaml: string; parsed: unknown; hash: string } | null
  validate?: (body: any) => unknown
  save?: (body: any) => unknown
}

/** 假服务：set 改 parsed 与 yaml（仅支持 agent 字段）；直接给 yaml 时按 agent 行重新解析。 */
function server(o: Opts = {}) {
  const defaultValidate = (body: any) => {
    if (body.set) {
      const parsed = setIn(PARSED, body.set.path, body.set.value)
      const yaml = (body.yaml as string).replace(/agent: \w+/, `agent: ${body.set.value}`)
      return { yaml, parsed, errors: [], preview: null }
    }
    const m = /agent: (\w+)/.exec(body.yaml)
    return { yaml: body.yaml, parsed: setIn(PARSED, ['posts', 0, 'agent'], m?.[1] ?? 'claude'), errors: [], preview: null }
  }
  const calls = mockApi({
    'GET /api/session': () => ({ csrfToken: 'tok', version: '1', teams: ['duo'] }),
    'GET /api/teams/duo/spec': () => ({
      specPath: '/t/duo/team.yaml',
      yaml: YAML_TEXT,
      parsed: PARSED,
      hash: 'H1',
      draft: o.draft ?? null,
      running: o.running ?? true,
    }),
    'POST /api/teams/duo/spec/validate': (c) => (o.validate ?? defaultValidate)(c.body),
    'POST /api/teams/duo/spec': (c) => (o.save ?? (() => ({ wrote: 'draft', path: '/t/duo/team.draft.yaml', hash: 'N1' })))(c.body),
    'POST /api/teams/duo/spec/discard-draft': () => ({ discarded: true }),
  })
  const validates = () => calls.filter((c: Call) => c.method === 'POST' && c.path === '/api/teams/duo/spec/validate')
  const saves = () => calls.filter((c: Call) => c.method === 'POST' && c.path === '/api/teams/duo/spec')
  return { calls, validates, saves }
}

const agentInput = (c: Element) => c.querySelector('[data-path="posts.0.agent"]') as HTMLInputElement
const loaded = async (c: Element) => waitFor(() => expect(agentInput(c)).toBeTruthy())

/** 校验返回之前保存按钮是禁用的：等它可用再点。 */
async function clickWhenEnabled(getByText: (t: string) => Element, label: string): Promise<void> {
  const button = await waitFor(() => {
    const el = getByText(label) as HTMLButtonElement
    expect(el.disabled).toBe(false)
    return el
  })
  fireEvent.click(button)
}

test('form and YAML views stay in sync after switching', async () => {
  const s = server()
  const { container, getByText, getByLabelText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  expect(s.validates()[0]!.body.set).toEqual({ path: ['posts', 0, 'agent'], value: 'codex' })
  fireEvent.click(getByText('YAML 视图'))
  const ta = getByLabelText('YAML') as HTMLTextAreaElement
  await waitFor(() => expect(ta.value).toContain('agent: codex'))
  fireEvent.input(ta, { target: { value: ta.value.replace('agent: codex', 'agent: gemini') } })
  await waitFor(() => expect(s.validates()).toHaveLength(2))
  expect(s.validates()[1]!.body.set).toBeUndefined()
  fireEvent.click(getByText('表单视图'))
  await waitFor(() => expect(agentInput(container).value).toBe('gemini'))
})

test('clearing a required field (id, agent, lead) sends an empty string instead of deleting the key', async () => {
  const s = server()
  const { container } = render(<Edit team="duo" />)
  await loaded(container)
  const idInput = container.querySelector('[data-path="posts.0.id"]') as HTMLInputElement
  fireEvent.input(idInput, { target: { value: '' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  expect(s.validates()[0]!.body.set).toEqual({ path: ['posts', 0, 'id'], value: '' })
  // 可选字段清空仍是删除
  const model = container.querySelector('[data-path="posts.0.model"]') as HTMLInputElement
  fireEvent.input(model, { target: { value: 'x' } })
  fireEvent.input(model, { target: { value: '' } })
  await waitFor(() => expect(s.validates().length).toBeGreaterThanOrEqual(2))
  expect(s.validates().at(-1)!.body.set).toEqual({ path: ['posts', 0, 'model'], value: null })
})

test('a late reply to a form edit does not overwrite what was typed in the YAML view meanwhile', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  let first = true
  const s = server({
    validate: (b) => {
      if (first) {
        first = false
        return gate.then(() => ({ yaml: 'SERVER TEXT\n', parsed: PARSED, errors: [], preview: null }))
      }
      return { yaml: b.yaml, parsed: PARSED, errors: [], preview: null }
    },
  })
  const { container, getByText, getByLabelText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1)) // 请求在途
  fireEvent.click(getByText('YAML 视图'))
  fireEvent.input(getByLabelText('YAML'), { target: { value: 'MY TYPING\n' } })
  release()
  await waitFor(() => expect(s.validates().length).toBeGreaterThanOrEqual(2))
  expect(s.validates().at(-1)!.body.yaml).toBe('MY TYPING\n')
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  expect((getByLabelText('YAML') as HTMLTextAreaElement).value).toBe('MY TYPING\n')
})

test('saving the spec of a stopped team while an older draft exists warns that the draft would overwrite it later', async () => {
  const s = server({ running: false, draft: { yaml: YAML_TEXT, parsed: PARSED, hash: 'D1' }, save: () => ({ wrote: 'spec', path: '/t/duo/team.yaml', hash: 'N3' }) })
  const { container, getByText, findByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  await clickWhenEnabled(getByText, '保存')
  expect(await findByText(/旧草稿/)).toBeTruthy()
  expect(getByText('丢弃草稿')).toBeTruthy()
})

test('validate fires only after 400 ms of inactivity', async () => {
  vi.useFakeTimers()
  const s = server()
  const { container } = render(<Edit team="duo" />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  fireEvent.input(agentInput(container), { target: { value: 'c' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399)
  })
  expect(s.validates()).toHaveLength(0)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(s.validates()).toHaveLength(1)
})

test('a syntax error makes the form read-only with a notice', async () => {
  server({ validate: () => ({ yaml: 'x', parsed: null, errors: [{ path: [], code: 'spec_invalid', message: 'team.yaml 第 3 行：bad', line: 3 }], preview: null }) })
  const { container, getByText, getByLabelText, findByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.click(getByText('YAML 视图'))
  fireEvent.input(getByLabelText('YAML'), { target: { value: 'broken: [' } })
  fireEvent.click(getByText('表单视图'))
  expect(await findByText(/YAML 有语法错误/)).toBeTruthy()
  expect(agentInput(container).disabled).toBe(true)
})

test('the error is shown next to its field (path posts.0.agent)', async () => {
  server({
    validate: () => ({
      yaml: YAML_TEXT,
      parsed: PARSED,
      errors: [{ path: ['posts', 0, 'agent'], code: 'spec_invalid', message: 'posts.0.agent：不能为空', line: 6 }],
      preview: null,
    }),
  })
  const { container } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: '' } })
  const field = await waitFor(() => {
    const el = container.querySelector('[data-field="posts.0.agent"]') as HTMLElement
    expect(within(el).getByText(/不能为空/)).toBeTruthy()
    return el
  })
  expect(field.querySelector('[data-path="posts.0.agent"]')).toBeTruthy()
})

test('preview lists post changes and commands; closeSuggested shows the --close hint', async () => {
  server({
    validate: (b) => ({
      yaml: b.yaml,
      parsed: PARSED,
      errors: [],
      preview: {
        posts: [{ id: 'builder', kind: 'launch_changed', fields: ['model'] }, { id: 'scout', kind: 'added' }, { id: 'checker', kind: 'removed' }],
        fields: [{ path: 'lead', before: 'builder', after: 'checker' }],
        commands: ['wl down duo', 'wl up /t/duo/team.yaml --draft'],
        closeSuggested: true,
      },
    }),
  })
  const { container, findByTestId } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'x' } })
  const preview = within(await findByTestId('preview'))
  expect(await preview.findByText('wl up /t/duo/team.yaml --draft')).toBeTruthy()
  expect(preview.getByText('wl down duo')).toBeTruthy()
  expect(preview.getByText(/wl down duo --close/)).toBeTruthy()
  expect(preview.getByText('scout')).toBeTruthy()
  expect(preview.getByText(/新增岗位/)).toBeTruthy()
  expect(preview.getByText(/启动参数有变化/)).toBeTruthy()
  expect(preview.getByText(/岗位被删除/)).toBeTruthy()
  expect(preview.getByText('lead')).toBeTruthy()
  expect(preview.getByText('builder → checker')).toBeTruthy()
})

test('no --close hint when closeSuggested is false', async () => {
  server({
    validate: (b) => ({
      yaml: b.yaml,
      parsed: PARSED,
      errors: [],
      preview: { posts: [{ id: 'builder', kind: 'kept' }], fields: [], commands: ['wl up /t/duo/team.yaml'], closeSuggested: false },
    }),
  })
  const { container, findByTestId } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'x' } })
  const preview = within(await findByTestId('preview'))
  expect(await preview.findByText('wl up /t/duo/team.yaml')).toBeTruthy()
  expect(preview.queryByText(/--close/)).toBeNull()
})

test('running team without a draft saves with baseHash null and running true', async () => {
  const s = server()
  const { container, getByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  await clickWhenEnabled(getByText, '保存为草稿')
  await waitFor(() => expect(s.saves()).toHaveLength(1))
  expect(s.saves()[0]!.body).toEqual({ yaml: expect.any(String), running: true, baseHash: null })
})

test('a stopped team saves the spec itself with the loaded file hash', async () => {
  const s = server({ running: false, save: () => ({ wrote: 'spec', path: '/t/duo/team.yaml', hash: 'N2' }) })
  const { container, getByText, findByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  await clickWhenEnabled(getByText, '保存')
  await waitFor(() => expect(s.saves()).toHaveLength(1))
  expect(s.saves()[0]!.body).toEqual({ yaml: expect.any(String), running: false, baseHash: 'H1' })
  expect(await findByText(/已保存/)).toBeTruthy()
})

test('after a save the next save uses the returned hash as its base', async () => {
  const s = server({ running: false, save: () => ({ wrote: 'spec', path: '/t/duo/team.yaml', hash: 'N2' }) })
  const { container, getByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  await clickWhenEnabled(getByText, '保存')
  await waitFor(() => expect(s.saves()).toHaveLength(1))
  fireEvent.input(agentInput(container), { target: { value: 'gemini' } })
  await waitFor(() => expect(s.validates()).toHaveLength(2))
  await clickWhenEnabled(getByText, '保存')
  await waitFor(() => expect(s.saves()).toHaveLength(2))
  expect(s.saves()[1]!.body.baseHash).toBe('N2')
})

test('an existing draft is loaded by default and 丢弃草稿 is shown', async () => {
  const s = server({ draft: { yaml: 'DRAFT_YAML\n', parsed: PARSED, hash: 'D1' } })
  const { container, getByText, getByLabelText } = render(<Edit team="duo" />)
  await loaded(container)
  expect(getByText('丢弃草稿')).toBeTruthy()
  fireEvent.click(getByText('YAML 视图'))
  expect((getByLabelText('YAML') as HTMLTextAreaElement).value).toBe('DRAFT_YAML\n')
  fireEvent.input(getByLabelText('YAML'), { target: { value: 'DRAFT_YAML\n# x\n' } })
  await waitFor(() => expect(s.validates()).toHaveLength(1))
  await clickWhenEnabled(getByText, '保存为草稿')
  await waitFor(() => expect(s.saves()).toHaveLength(1))
  expect(s.saves()[0]!.body.baseHash).toBe('D1')
})

test('409 asks the user to reload', async () => {
  server({
    save: () => {
      throw new Fail(409, { kind: 'input', code: 'spec_conflict', message: 'team.draft.yaml 在加载后被改动过，请重新加载' })
    },
  })
  const { container, getByText, findByText } = render(<Edit team="duo" />)
  await loaded(container)
  fireEvent.input(agentInput(container), { target: { value: 'codex' } })
  await clickWhenEnabled(getByText, '保存为草稿')
  expect(await findByText(/请重新加载/)).toBeTruthy()
  expect(getByText('重新加载')).toBeTruthy()
})

test('the trusted-config notice is shown at the bottom', async () => {
  server()
  const { container, getByText } = render(<Edit team="duo" />)
  await loaded(container)
  expect(getByText(/视为可信配置/)).toBeTruthy()
})
