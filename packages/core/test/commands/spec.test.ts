import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { discardDraftCmd, readSpecForEdit, saveSpecCmd, validateSpecEdit } from '../../src/commands/spec.js'
import { draftPathOf, fileHash, textHash } from '../../src/spec/draft.js'
import { DUO_YAML } from '../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from './fake-client.js'
import { restore } from '../../src/commands/restore/index.js'
import { taskPreflight } from '../../src/commands/task/preflight.js'

const EDITED = DUO_YAML.replace('model: opus', 'model: sonnet')

function seed(status: 'up' | 'stopped' = 'up') {
  const { deps, registry } = seedRunningTeam(new FakeOrca(), { files: { 'NORMS.md': '# duo 团队规范\n' } })
  const specPath = registry.getTeam('duo')!.specPath
  if (status === 'stopped') registry.setTeamStatus('duo', 'stopped')
  return { deps, registry, specPath }
}

test('readSpecForEdit returns yaml, parsed, hash, running and no draft', () => {
  const { deps, specPath } = seed()
  const r = readSpecForEdit(deps, 'duo')
  expect(r).toMatchObject({ specPath, yaml: DUO_YAML, hash: fileHash(specPath), draft: null, running: true })
  expect(r.parsed).toMatchObject({ name: 'duo' })
})

test('readSpecForEdit includes the draft with its own hash and parsed form', () => {
  const { deps, specPath } = seed()
  fs.writeFileSync(draftPathOf(specPath), EDITED)
  const r = readSpecForEdit(deps, 'duo')
  expect(r.draft).toMatchObject({ yaml: EDITED, hash: textHash(EDITED) })
  expect(r.draft!.parsed).toMatchObject({ name: 'duo' })
})

test('readSpecForEdit on an unregistered team → team_unknown; a stopped team is not running', () => {
  const { deps } = seed('stopped')
  expect(() => readSpecForEdit(deps, 'ghost')).toThrow(expect.objectContaining({ code: 'team_unknown' }))
  expect(readSpecForEdit(deps, 'duo').running).toBe(false)
})

test('validateSpecEdit never writes a file and gives preview null when errors exist', () => {
  const { deps, specPath } = seed()
  const bad = validateSpecEdit(deps, { team: 'duo', yaml: DUO_YAML.replace('lead: builder', 'lead: ghost') })
  expect(bad.errors[0]).toMatchObject({ code: 'lead_unknown' })
  expect(bad.preview).toBeNull()
  const ok = validateSpecEdit(deps, { team: 'duo', yaml: EDITED })
  expect(ok.errors).toEqual([])
  expect(ok.preview).toMatchObject({ posts: expect.arrayContaining([{ id: 'builder', kind: 'launch_changed', fields: expect.any(Array) }]), commands: ['wl down duo', `wl up ${specPath} --draft`] })
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})

test('validateSpecEdit with set applies setField and returns the new yaml and parsed', () => {
  const { deps } = seed()
  const r = validateSpecEdit(deps, { team: 'duo', yaml: DUO_YAML, set: { path: ['posts', 0, 'model'], value: 'sonnet' } })
  expect(r.yaml).toBe(EDITED)
  expect((r.parsed as { posts: Array<{ model: string }> }).posts[0]!.model).toBe('sonnet')
  expect(r.errors).toEqual([])
})

test('validateSpecEdit with set on a syntax error → spec_invalid', () => {
  const { deps } = seed()
  expect(() => validateSpecEdit(deps, { team: 'duo', yaml: 'a: [x\n', set: { path: ['a'], value: 1 } })).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
})

test('validateSpecEdit with yaml over 48 KB → spec_too_large', () => {
  const { deps } = seed()
  expect(() => validateSpecEdit(deps, { team: 'duo', yaml: `${DUO_YAML}# ${'a'.repeat(48 * 1024)}\n` })).toThrow(expect.objectContaining({ code: 'spec_too_large' }))
})

test('validateSpecEdit returns a syntax error as one error with parsed null', () => {
  const { deps } = seed()
  const r = validateSpecEdit(deps, { team: 'duo', yaml: 'version: 1\n\tx: 1\n' })
  expect(r.parsed).toBeNull()
  expect(r.errors).toHaveLength(1)
  expect(r.preview).toBeNull()
})

test('saveSpecCmd writes the draft for a running team and the spec for a stopped one', async () => {
  const run = seed()
  const r = await saveSpecCmd(run.deps, { team: 'duo', yaml: EDITED, baseHash: null, running: true })
  expect(r).toMatchObject({ wrote: 'draft', path: draftPathOf(run.specPath) })
  const stopped = seed('stopped')
  const r2 = await saveSpecCmd(stopped.deps, { team: 'duo', yaml: EDITED, baseHash: fileHash(stopped.specPath), running: false })
  expect(r2).toMatchObject({ wrote: 'spec', path: stopped.specPath })
})

test('saveSpecCmd rejects when the running flag no longer matches the registry', async () => {
  const { deps, specPath } = seed()
  await expect(saveSpecCmd(deps, { team: 'duo', yaml: EDITED, baseHash: fileHash(specPath), running: false })).rejects.toMatchObject({ code: 'spec_conflict' })
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
})

test('discardDraftCmd removes the draft and reports whether it existed', async () => {
  const { deps, specPath } = seed()
  expect(await discardDraftCmd(deps, { team: 'duo' })).toEqual({ discarded: false })
  fs.writeFileSync(draftPathOf(specPath), EDITED)
  expect(await discardDraftCmd(deps, { team: 'duo' })).toEqual({ discarded: true })
})

test('readSpecForEdit 带上规范与各岗位简报的正文', () => {
  const { deps } = seed()
  const r = readSpecForEdit(deps, 'duo')
  expect(Object.keys(r.files).sort()).toEqual(['NORMS.md', 'briefs/builder.md', 'briefs/checker.md'])
  expect(r.files['NORMS.md']).toContain('# duo 团队规范')
})

test('validateSpecEdit 用 files 里的虚拟文件通过校验（新岗位的简报还没落盘）', () => {
  const { deps } = seed()
  const yaml = DUO_YAML.replace('  - id: checker', '  - id: reviewer\n    agent: claude\n    model: opus\n    worktree: current\n    brief: [briefs/reviewer.md]\n  - id: checker')
  const r = validateSpecEdit(deps, { team: 'duo', yaml, files: { 'briefs/reviewer.md': '# reviewer\n' } })
  expect(r.errors).toEqual([])
})

test('没有虚拟文件时同一个 yaml 报 file_missing', () => {
  const { deps } = seed()
  const yaml = DUO_YAML.replace('  - id: checker', '  - id: reviewer\n    agent: claude\n    model: opus\n    worktree: current\n    brief: [briefs/reviewer.md]\n  - id: checker')
  expect(validateSpecEdit(deps, { team: 'duo', yaml }).errors[0]).toMatchObject({ code: 'file_missing' })
})

test('saveSpecCmd 把 files 里的正文写到磁盘，并拒绝未被规格引用的文档', async () => {
  // brief 原文是 seed()；running: false 要求团队已停止，否则会先撞上运行状态守卫
  const { deps, specPath } = seed('stopped')
  const dir = path.dirname(specPath)
  const r = await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: false, files: { 'NORMS.md': '# 新规范\n' } })
  expect(r.docsUpdated).toEqual(['NORMS.md'])
  expect(fs.readFileSync(path.join(dir, 'NORMS.md'), 'utf8')).toBe('# 新规范\n')
  await expect(saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: false, files: { 'secret.md': 'x' } }))
    .rejects.toMatchObject({ code: 'doc_not_referenced' })
  await expect(
    saveSpecCmd(deps, {
      team: 'duo',
      yaml: DUO_YAML,
      baseHash: null,
      running: false,
      files: { 'NORMS.md': '# 不会落盘\n', 'briefs/builder.md': 'x'.repeat(65 * 1024) },
    }),
  ).rejects.toMatchObject({ code: 'doc_too_large' })
  expect(fs.readFileSync(path.join(dir, 'NORMS.md'), 'utf8')).toBe('# 新规范\n')
})

test('运行中团队保存文档：注册表里的规格哈希变旧，restore 随后报 team_spec_changed', async () => {
  const { deps } = seed()
  await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: true, files: { 'NORMS.md': '# 改过的规范\n' } })
  await expect(restore(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'team_spec_changed' })
})

test('运行中团队保存文档后，任务操作前置同样报 team_spec_changed（认领/开始/完成被暂停，需 down + up）', async () => {
  const { deps } = seed()
  await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: true, files: { 'NORMS.md': '# 改过的规范\n' } })
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'team_spec_changed' })
})
