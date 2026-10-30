import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { docRelsOf, readDocText, resolveDocPath, writeDocAtomic, DOC_LIMIT_BYTES } from '../../src/spec/doc.js'

test('resolveDocPath 只接受团队目录内的 .md 相对路径', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
  expect(resolveDocPath(dir, 'NORMS.md')).toBe(path.join(dir, 'NORMS.md'))
  expect(resolveDocPath(dir, 'briefs/a.md')).toBe(path.join(dir, 'briefs', 'a.md'))
  for (const bad of ['../evil.md', '/etc/passwd', 'notes.txt', '', 'a.md\0b']) {
    expect(() => resolveDocPath(dir, bad)).toThrow(expect.objectContaining({ code: 'doc_path_invalid' }))
  }
})

test('resolveDocPath 拒绝软链接越界', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-out-'))
  fs.writeFileSync(path.join(outside, 'evil.md'), 'x')
  fs.symlinkSync(path.join(outside, 'evil.md'), path.join(dir, 'link.md'))
  expect(() => resolveDocPath(dir, 'link.md')).toThrow(expect.objectContaining({ code: 'doc_path_invalid' }))
})

test('readDocText 读得到返回正文，读不到返回空串', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
  fs.writeFileSync(path.join(dir, 'NORMS.md'), '# 规范\n')
  expect(readDocText(path.join(dir, 'NORMS.md'))).toBe('# 规范\n')
  expect(readDocText(path.join(dir, 'missing.md'))).toBe('')
})

test('writeDocAtomic 建出缺失的父目录并原子替换正文；超过 64 KB 报 doc_too_large', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
  const abs = path.join(dir, 'briefs', 'new.md')
  writeDocAtomic(abs, '# 新简报\n')
  expect(fs.readFileSync(abs, 'utf8')).toBe('# 新简报\n')
  writeDocAtomic(abs, '# 改过\n')
  expect(fs.readFileSync(abs, 'utf8')).toBe('# 改过\n')
  expect(fs.readdirSync(path.join(dir, 'briefs')).filter((f) => f.endsWith('.tmp'))).toEqual([])
  expect(() => writeDocAtomic(abs, 'x'.repeat(DOC_LIMIT_BYTES + 1))).toThrow(expect.objectContaining({ code: 'doc_too_large' }))
  expect(fs.readFileSync(abs, 'utf8')).toBe('# 改过\n')
})

test('docRelsOf 取出去重后的 norms 与 posts[*].brief 相对路径', () => {
  const parsed = {
    norms: 'NORMS.md',
    posts: [{ brief: ['briefs/a.md'] }, { brief: ['briefs/a.md', 'briefs/b.md'] }, {}],
  }
  expect(docRelsOf(parsed)).toEqual(['NORMS.md', 'briefs/a.md', 'briefs/b.md'])
  expect(docRelsOf(null)).toEqual([])
  expect(docRelsOf('x')).toEqual([])
})
