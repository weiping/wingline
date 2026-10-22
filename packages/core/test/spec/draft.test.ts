import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { applyDraft, discardDraft, draftPathOf, fileHash, saveSpec, textHash } from '../../src/spec/draft.js'
import { specHash } from '../../src/spec/hash.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { DUO_YAML, mkTeam } from './helpers.js'

afterEach(() => vi.restoreAllMocks())

const EDITED = DUO_YAML.replace('model: opus', 'model: sonnet')
const leftovers = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))

test('draftPathOf inserts .draft before the extension', () => {
  expect(draftPathOf('/t/duo/team.yaml')).toBe('/t/duo/team.draft.yaml')
  expect(draftPathOf('/t/duo/team.yml')).toBe('/t/duo/team.draft.yml')
})

test('fileHash is null for a missing file and equals textHash of its content', () => {
  const specPath = mkTeam(DUO_YAML)
  expect(fileHash(`${specPath}.nope`)).toBeNull()
  expect(fileHash(specPath)).toBe(textHash(DUO_YAML))
})

test('saveSpec writes the draft when running and the spec when stopped', () => {
  const specPath = mkTeam(DUO_YAML)
  const base = fileHash(specPath)
  const r1 = saveSpec({ specPath, text: EDITED, baseHash: null, running: true })
  expect(r1).toEqual({ wrote: 'draft', path: draftPathOf(specPath), hash: textHash(EDITED) })
  expect(fs.readFileSync(draftPathOf(specPath), 'utf8')).toBe(EDITED)
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)

  const r2 = saveSpec({ specPath, text: EDITED, baseHash: base, running: false })
  expect(r2).toEqual({ wrote: 'spec', path: specPath, hash: textHash(EDITED) })
  expect(fs.readFileSync(specPath, 'utf8')).toBe(EDITED)
})

test('saveSpec on a running team with no draft accepts baseHash null', () => {
  const specPath = mkTeam(DUO_YAML)
  expect(saveSpec({ specPath, text: EDITED, baseHash: null, running: true })).toMatchObject({ wrote: 'draft', path: draftPathOf(specPath) })
})

test('saveSpec rejects a stale baseHash with spec_conflict, writing nothing', () => {
  const specPath = mkTeam(DUO_YAML)
  fs.writeFileSync(draftPathOf(specPath), `${DUO_YAML}# other\n`)
  const before = fs.readFileSync(draftPathOf(specPath), 'utf8')
  for (const baseHash of [null, textHash('whatever')]) {
    expect(() => saveSpec({ specPath, text: EDITED, baseHash, running: true })).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_conflict' }))
  }
  expect(fs.readFileSync(draftPathOf(specPath), 'utf8')).toBe(before)
  expect(() => saveSpec({ specPath, text: EDITED, baseHash: textHash('x'), running: false })).toThrow(expect.objectContaining({ code: 'spec_conflict' }))
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
})

test('saveSpec resent with identical content succeeds without rewriting', () => {
  const specPath = mkTeam(DUO_YAML)
  saveSpec({ specPath, text: EDITED, baseHash: null, running: true })
  const rename = vi.spyOn(fs, 'renameSync')
  expect(saveSpec({ specPath, text: EDITED, baseHash: null, running: true })).toMatchObject({ wrote: 'draft', hash: textHash(EDITED) })
  expect(rename).not.toHaveBeenCalled()
})

test('saveSpec rejects invalid YAML with spec_invalid and detail.errors, writing nothing', () => {
  const specPath = mkTeam(DUO_YAML)
  const bad = DUO_YAML.replace('lead: builder', 'lead: ghost')
  const err = (() => {
    try {
      saveSpec({ specPath, text: bad, baseHash: null, running: true })
    } catch (e) {
      return e as { code: string; detail: { errors: Array<{ code: string }> } }
    }
    return null
  })()
  expect(err).toMatchObject({ code: 'spec_invalid', detail: { errors: [{ code: 'lead_unknown' }] } })
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})

test('saveSpec rejects text over 48 KB with spec_too_large', () => {
  const specPath = mkTeam(DUO_YAML)
  const text = `${DUO_YAML}# ${'a'.repeat(48 * 1024 + 1)}\n`
  expect(() => saveSpec({ specPath, text, baseHash: null, running: true })).toThrow(expect.objectContaining({ kind: 'input', code: 'spec_too_large' }))
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})

test('saveSpec counts the 48 KB limit in UTF-8 bytes, not characters', () => {
  const specPath = mkTeam(DUO_YAML)
  const text = `${DUO_YAML}# ${'雁'.repeat(20 * 1024)}\n`
  expect(text.length).toBeLessThan(48 * 1024)
  expect(() => saveSpec({ specPath, text, baseHash: null, running: true })).toThrow(expect.objectContaining({ code: 'spec_too_large' }))
})

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('saveSpec in a read-only directory fails without leaving a temp file', () => {
  const specPath = mkTeam(DUO_YAML)
  const dir = path.dirname(specPath)
  fs.chmodSync(dir, 0o555)
  try {
    expect(() => saveSpec({ specPath, text: EDITED, baseHash: null, running: true })).toThrow(expect.objectContaining({ kind: 'internal', message: expect.stringContaining(dir) }))
    expect(leftovers(dir)).toEqual([])
  } finally {
    fs.chmodSync(dir, 0o755)
  }
})

test('saveSpec removes its temp file when the rename fails', () => {
  const specPath = mkTeam(DUO_YAML)
  vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('EXDEV')
  })
  expect(() => saveSpec({ specPath, text: EDITED, baseHash: null, running: true })).toThrow(expect.objectContaining({ kind: 'internal' }))
  expect(leftovers(path.dirname(specPath))).toEqual([])
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})

test('discardDraft removes the draft and is a no-op when none exists', () => {
  const specPath = mkTeam(DUO_YAML)
  expect(discardDraft(specPath)).toEqual({ discarded: false })
  fs.writeFileSync(draftPathOf(specPath), EDITED)
  expect(discardDraft(specPath)).toEqual({ discarded: true })
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
  expect(discardDraft(specPath)).toEqual({ discarded: false })
})

test('applyDraft: missing → draft_not_found; invalid → no file touched; running with a different hash → team_spec_changed', () => {
  const specPath = mkTeam(DUO_YAML)
  const draft = draftPathOf(specPath)
  expect(() => applyDraft(specPath, { runningHash: null })).toThrow(expect.objectContaining({ kind: 'input', code: 'draft_not_found' }))

  fs.writeFileSync(draft, DUO_YAML.replace('lead: builder', 'lead: ghost'))
  expect(() => applyDraft(specPath, { runningHash: null })).toThrow(expect.objectContaining({ code: 'lead_unknown' }))
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(`${specPath}.bak`)).toBe(false)
  expect(fs.existsSync(draft)).toBe(true)

  fs.writeFileSync(draft, EDITED)
  const running = specHash(loadTeamSpec(specPath))
  expect(() => applyDraft(specPath, { runningHash: running })).toThrow(expect.objectContaining({ kind: 'input', code: 'team_spec_changed' }))
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(`${specPath}.bak`)).toBe(false)
  expect(fs.existsSync(draft)).toBe(true)
})

test('applyDraft allows a comment-only draft while running (same specHash)', () => {
  const specPath = mkTeam(DUO_YAML)
  const running = specHash(loadTeamSpec(specPath))
  fs.writeFileSync(draftPathOf(specPath), `${DUO_YAML}# 只改了注释\n`)
  applyDraft(specPath, { runningHash: running })
  expect(fs.readFileSync(specPath, 'utf8')).toContain('只改了注释')
})

test('applyDraft success writes .bak and replaces the spec; rename failure removes the backup and leaves the spec intact', () => {
  const specPath = mkTeam(DUO_YAML)
  const draft = draftPathOf(specPath)
  fs.writeFileSync(draft, EDITED)

  vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('EXDEV')
  })
  expect(() => applyDraft(specPath, { runningHash: null })).toThrow('EXDEV')
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(`${specPath}.bak`)).toBe(false)
  expect(fs.existsSync(draft)).toBe(true)
  vi.restoreAllMocks()

  applyDraft(specPath, { runningHash: null })
  expect(fs.readFileSync(specPath, 'utf8')).toBe(EDITED)
  expect(fs.readFileSync(`${specPath}.bak`, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(draft)).toBe(false)
})

test.skipIf(process.platform === 'win32')('saving keeps the file mode, and a symlinked team.yaml stays a symlink while its target is updated', () => {
  const specPath = mkTeam(DUO_YAML)
  const real = path.join(path.dirname(specPath), 'real.yaml')
  fs.renameSync(specPath, real)
  fs.symlinkSync(real, specPath)
  fs.chmodSync(real, 0o640)
  saveSpec({ specPath, text: EDITED, baseHash: fileHash(specPath), running: false })
  expect(fs.lstatSync(specPath).isSymbolicLink()).toBe(true)
  expect(fs.readFileSync(real, 'utf8')).toBe(EDITED)
  expect(fs.statSync(real).mode & 0o777).toBe(0o640)

  const plain = mkTeam(DUO_YAML)
  fs.chmodSync(plain, 0o600)
  saveSpec({ specPath: plain, text: EDITED, baseHash: fileHash(plain), running: false })
  expect(fs.statSync(plain).mode & 0o777).toBe(0o600)
})

test.skipIf(process.platform === 'win32')('applyDraft writes through a symlinked spec and keeps its mode', () => {
  const specPath = mkTeam(DUO_YAML)
  const real = path.join(path.dirname(specPath), 'real.yaml')
  fs.renameSync(specPath, real)
  fs.symlinkSync(real, specPath)
  fs.chmodSync(real, 0o640)
  fs.writeFileSync(draftPathOf(specPath), EDITED)
  applyDraft(specPath, { runningHash: null })
  expect(fs.lstatSync(specPath).isSymbolicLink()).toBe(true)
  expect(fs.readFileSync(real, 'utf8')).toBe(EDITED)
  expect(fs.statSync(real).mode & 0o777).toBe(0o640)
  expect(fs.readFileSync(`${specPath}.bak`, 'utf8')).toBe(DUO_YAML)
  expect(fs.existsSync(draftPathOf(specPath))).toBe(false)
})
