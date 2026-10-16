import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createCallLog } from '../../src/log/call-log.js'

const entry = (args: string[]) => ({ args, ms: 5, exitCode: 0, stdout: '{}', stderr: '' })

test('truncates --text and --body values to 200 chars', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-log-'))
  const log = createCallLog(dir, () => new Date('2026-10-13T10:00:00Z'))
  log.record(entry(['terminal', 'send', '--text', 'x'.repeat(500), '--body', 'y'.repeat(300), '--title', 'z'.repeat(300)]))
  const line = JSON.parse(fs.readFileSync(path.join(dir, '2026-10-13.jsonl'), 'utf8').trim())
  expect(line.args[3]).toHaveLength(200)
  expect(line.args[5]).toHaveLength(200)
  expect(line.args[7]).toHaveLength(300)
})

test('prunes files older than 7 days on creation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-log-'))
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-13']) fs.writeFileSync(path.join(dir, `${d}.jsonl`), '')
  createCallLog(dir, () => new Date('2026-10-13T10:00:00Z'))
  expect(fs.readdirSync(dir).sort()).toEqual(['2026-10-06.jsonl', '2026-10-13.jsonl'])
})

test('path() is today\'s file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-log-'))
  expect(createCallLog(dir, () => new Date('2026-10-13T10:00:00Z')).path()).toBe(path.join(dir, '2026-10-13.jsonl'))
})

test('summarized calls keep argv, timing and exit code but not stdout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-log-'))
  const log = createCallLog(dir, () => new Date('2026-10-15T00:00:00Z'), { summarize: (a) => a[1] === 'check' })
  log.record({ args: ['orchestration', 'check'], ms: 3, exitCode: 0, stdout: 'x'.repeat(100), stderr: '' })
  log.record({ args: ['orchestration', 'dispatch'], ms: 3, exitCode: 0, stdout: 'receipt', stderr: '' })
  const lines = fs.readFileSync(log.path(), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  expect(lines[0]).toMatchObject({ args: ['orchestration', 'check'], stdoutBytes: 100 }); expect(lines[0].stdout).toBeUndefined()
  expect(lines[1].stdout).toBe('receipt')
})
