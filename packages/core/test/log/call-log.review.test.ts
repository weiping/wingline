// 审查方测试（spec 第 8 节）：只读轮询的摘要日志仍要带 ok/错误码 与 消息条数。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createCallLog, pruneCallLogs } from '../../src/log/call-log.js'

const mk = () => createCallLog(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-clr-')), () => new Date('2026-10-15T00:00:00Z'), { summarize: (a) => a[1] === 'check' })
const lines = (log: ReturnType<typeof mk>) => fs.readFileSync(log.path(), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('a summarized Orca error keeps its error code (spec 8: argv、ok/错误码、耗时、消息条数)', () => {
  const log = mk()
  log.record({ args: ['orchestration', 'check', '--json'], ms: 3, exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: 'consumer_fenced', message: 'x' } }), stderr: '' })
  expect(JSON.stringify(lines(log)[0])).toContain('consumer_fenced')
})

test('a summarized check batch records how many messages it carried', () => {
  const log = mk()
  log.record({ args: ['orchestration', 'check', '--json'], ms: 3, exitCode: 0, stdout: JSON.stringify({ ok: true, result: { messages: [{ id: 'a' }, { id: 'b' }], count: 2 } }), stderr: '' })
  const l = lines(log)[0]
  expect(JSON.stringify(l)).toMatch(/"(count|messages|messageCount)":2/)
  expect(l.stdout).toBeUndefined()
})

test('pruneCallLogs keeps the last 7 days and ignores foreign files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-clp-'))
  for (const f of ['2026-10-07.jsonl', '2026-10-08.jsonl', '2026-10-15.jsonl', 'notes.txt']) fs.writeFileSync(path.join(dir, f), '')
  pruneCallLogs(dir, new Date('2026-10-15T12:00:00Z'))
  expect(fs.readdirSync(dir).sort()).toEqual(['2026-10-08.jsonl', '2026-10-15.jsonl', 'notes.txt'])
})
