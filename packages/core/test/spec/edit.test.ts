import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { parse } from 'yaml'
import { setField } from '../../src/spec/edit.js'
import { validateSpecText } from '../../src/spec/load.js'

const SRC = '# 团队\nversion: 1\nname: duo   # 名字\n\nposts:\n  - id: builder  # 牵头\n    agent: claude\n'

test('setField changes one scalar and leaves comments, blank lines and order byte-identical elsewhere', () => {
  expect(setField(SRC, ['posts', 0, 'agent'], 'codex')).toBe(SRC.replace('agent: claude', 'agent: codex'))
})

test('setField keeps the quote style of the scalar it replaces', () => {
  const src = "posts:\n  - launch: 'claude --model opus'   # 启动\n"
  expect(setField(src, ['posts', 0, 'launch'], 'codex')).toBe("posts:\n  - launch: 'codex'   # 启动\n")
})

test('setField quotes a value that would otherwise change type', () => {
  expect(setField('name: duo\n', ['name'], 'true')).toBe('name: "true"\n')
})

test('setField replaces a scalar with a number and a boolean', () => {
  expect(setField('a: 1 # n\nb: false\n', ['a'], 5)).toBe('a: 5 # n\nb: false\n')
  expect(setField('a: 1\nb: false # f\n', ['b'], true)).toBe('a: 1\nb: true # f\n')
})

test('setField with null deletes the key', () => {
  expect(setField('a: 1\nb: 2\n', ['a'], null)).toBe('b: 2\n')
})

// 评审点 3：表单改一处，其余部分逐字节不变。下面这份刻意带了会被重排的写法：
// 评论前多个空格、没有缩进的序列、flow 列表、空行与块注释。
const MESSY = [
  '# 团队',
  'version: 1',
  'name: duo   # 名字',
  '',
  'posts:',
  '- id: builder    # 牵头',
  '  agent: claude',
  '  brief: [briefs/builder.md]   # 简报',
  '',
  '# 巡查',
  'patrol:',
  '  prompt_minutes: 5   # 提示',
  '  owner_idle_minutes: 30',
  '',
].join('\n')

test('adding a key to a map inside a sequence inserts only its own line', () => {
  const out = setField(MESSY, ['posts', 0, 'model'], 'opus')
  expect(out).toBe(MESSY.replace('  brief: [briefs/builder.md]   # 简报\n', '  brief: [briefs/builder.md]   # 简报\n  model: opus\n'))
})

test('adding a key to an existing section inserts after its last pair, keeping every other byte', () => {
  const out = setField(MESSY, ['patrol', 'workspace_status'], false)
  expect(out).toBe(MESSY.replace('  owner_idle_minutes: 30\n', '  owner_idle_minutes: 30\n  workspace_status: false\n'))
})

test('adding a key to a top-level map appends it after the last pair', () => {
  const out = setField('a: 1   # c\nb: 2\n\n# tail\n', ['lead'], 'builder')
  expect(out).toBe('a: 1   # c\nb: 2\nlead: builder\n\n# tail\n')
})

test('adding a missing section inserts the whole chain after the last top-level pair', () => {
  const input = MESSY.slice(0, MESSY.indexOf('# 巡查')) // 以空行结尾
  const out = setField(input, ['budgets', 'task', 'max_gate_failures'], 5)
  expect(out).toBe(input.replace(/\n\n$/, '\nbudgets:\n  task:\n    max_gate_failures: 5\n\n'))
})

test('a file without a trailing newline still gets a well-formed insert', () => {
  expect(setField('a: 1\nb: 2', ['c'], 3)).toBe('a: 1\nb: 2\nc: 3\n')
})

test('CRLF files get CRLF inserts', () => {
  expect(setField('a: 1\r\nb: 2\r\n', ['c'], 3)).toBe('a: 1\r\nb: 2\r\nc: 3\r\n')
})

test('deleting a key removes exactly its line and leaves the rest byte-identical', () => {
  expect(setField(MESSY, ['patrol', 'prompt_minutes'], null)).toBe(MESSY.replace('  prompt_minutes: 5   # 提示\n', ''))
  expect(setField(MESSY, ['posts', 0, 'agent'], null)).toBe(MESSY.replace('  agent: claude\n', ''))
})

test('deleting the last key of a section keeps the document valid', () => {
  const out = setField('patrol:\n  only: 1\nx: 2\n', ['patrol', 'only'], null)
  expect(out).toMatch(/^patrol: \{\}\nx: 2\n$/)
})

test('setting a list replaces an inline list in place and inserts a flow list for a missing key', () => {
  expect(setField(MESSY, ['posts', 0, 'brief'], ['a.md', 'b.md'])).toBe(MESSY.replace('[briefs/builder.md]', '[a.md, b.md]'))
  expect(setField(MESSY, ['posts', 0, 'tags'], ['x', 'y'])).toBe(
    MESSY.replace('  brief: [briefs/builder.md]   # 简报\n', '  brief: [briefs/builder.md]   # 简报\n  tags: [x, y]\n'),
  )
})

test('setting a scalar over a null value (key with nothing after the colon) keeps the rest', () => {
  expect(setField('a:   # c\nb: 2\n', ['a'], 'x')).toBe('a: x   # c\nb: 2\n')
})

test('a value that needs quoting is quoted when inserted', () => {
  expect(setField('a: 1\n', ['b'], 'yes: no')).toBe('a: 1\nb: "yes: no"\n')
  expect(setField('a: 1\n', ['b'], 'true')).toBe('a: 1\nb: "true"\n')
})

test('an object value is inserted as an indented block under the right parent', () => {
  const out = setField(MESSY, ['patrol', 'notify'], { webhook: 'https://example.com/hook' })
  expect(out).toBe(MESSY.replace('  owner_idle_minutes: 30\n', '  owner_idle_minutes: 30\n  notify:\n    webhook: https://example.com/hook\n'))
})

// Windows 检出（autocrlf）会把换行变成 CRLF：LF 和 CRLF 两种都要过，不能只在 Windows 的 CI 上才暴露
test.each([['LF', '\n'], ['CRLF', '\r\n']])('form edits on the shipped teams/duo/team.yaml (%s) change only the edited lines and keep the spec valid', (_name, eol) => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../teams/duo/team.yaml')
  const src = fs.readFileSync(file, 'utf8').replace(/\r?\n/g, eol)
  const edits: Array<[Array<string | number>, unknown]> = [
    [['posts', 0, 'model'], 'sonnet'],
    [['gates', 'builder'], 'pnpm test'],
    [['patrol', 'workspace_status'], false],
    [['posts', 1, 'tags'], ['review']],
  ]
  let text = src
  for (const [p, v] of edits) text = setField(text, p, v)
  const lines = (t: string) => t.split(/\r?\n/)
  const removed = lines(src).filter((l) => !lines(text).includes(l))
  expect(removed).toEqual(['    model: opus'])
  expect(validateSpecText(text, file).errors).toEqual([])
  expect(validateSpecText(text, file).spec).toMatchObject({ patrol: { workspaceStatus: false }, posts: [{ model: 'sonnet' }, { tags: ['review'] }] })
})

test('deleting the first key of a list item removes just that key and keeps the item and every other byte', () => {
  expect(setField(MESSY, ['posts', 0, 'id'], null)).toBe(MESSY.replace('- id: builder    # 牵头\n  agent: claude\n', '- agent: claude\n'))
})

test('emptying a required key to "" replaces only its value', () => {
  const out = setField(MESSY, ['posts', 0, 'id'], '')
  expect(out).toBe(MESSY.replace('id: builder    # 牵头', 'id: ""    # 牵头'))
})

test('clearing then retyping the shipped team.yaml first key keeps the file byte-identical', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../teams/duo/team.yaml')
  const src = fs.readFileSync(file, 'utf8')
  const out = setField(setField(src, ['posts', 0, 'id'], ''), ['posts', 0, 'id'], 'builder')
  expect(out).toBe(src)
})

test('a string written into a flow collection is quoted for flow context', () => {
  const flow = 'p: {a: 1, b: x}\nq: [m, n]\n'
  const cases: Array<[Array<string | number>, string]> = [[['p', 'b'], 'c, d'], [['p', 'b'], 'x}'], [['q', 1], 'a,b'], [['q', 0], 'x]'], [['p', 'a'], 'k: v']]
  for (const [p, v] of cases) {
    const parsed = parse(setField(flow, p, v)) as Record<string, any>
    expect(parsed[p[0] as string][p[1] as never]).toBe(v)
    // 其余元素不变
    expect(Object.keys(parsed)).toEqual(['p', 'q'])
  }
  expect(setField(flow, ['p', 'b'], 'plain')).toBe('p: {a: 1, b: plain}\nq: [m, n]\n')
})

test('editing a field under an empty section (`patrol:` with nothing after the colon) works instead of crashing', () => {
  const src = 'a: 1\npatrol:   # 巡查\nb: 2\n'
  const out = setField(src, ['patrol', 'workspace_status'], false)
  expect(parse(out)).toEqual({ a: 1, patrol: { workspace_status: false }, b: 2 })
  expect(out).toContain('# 巡查')
  expect(parse(setField('patrol:\nb: 2\n', ['patrol', 'notify', 'webhook'], 'https://x'))).toEqual({ patrol: { notify: { webhook: 'https://x' } }, b: 2 })
})

test('a nonsensical path is a spec_invalid input error, not an internal crash', () => {
  const src = 'posts:\n  - id: a\n  - id: b\nname: x\n'
  for (const [p, v] of [[['posts', 5, 'agent'], 'x'], [['posts', 9], 'x'], [['name', 'sub'], 1], [['posts', 'zz', 'k'], 1]] as Array<[Array<string | number>, unknown]>) {
    expect(() => setField(src, p, v)).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_invalid' }))
  }
})

test('edits that the text paths cannot place safely still work through the Document API', () => {
  // flow 映射、序列元素下标越界以外的块序列整体替换等：不要求字节不变，但结果必须是合法 YAML 且内容正确
  const out = setField('tags:\n  - a\n  - b\nx: 1\n', ['tags'], ['z'])
  expect(out).toContain('z')
  expect(out).toContain('x: 1')
  expect(setField('m: {a: 1}\n', ['m', 'b'], 2)).toMatch(/b: 2/)
})

test('setField on text with a syntax error throws spec_invalid', () => {
  expect(() => setField('a: [unclosed\n', ['a'], 1)).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_invalid' }))
})
