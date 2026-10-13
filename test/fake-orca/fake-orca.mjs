#!/usr/bin/env node
// 契约测试用假 orca：按参数前缀匹配 FAKE_ORCA_SCRIPT 中第一条并回放。
import fs from 'node:fs'

const argv = process.argv.slice(2)
if (process.env.FAKE_ORCA_ARGV_LOG) fs.appendFileSync(process.env.FAKE_ORCA_ARGV_LOG, JSON.stringify(argv) + '\n')

const script = JSON.parse(fs.readFileSync(process.env.FAKE_ORCA_SCRIPT, 'utf8'))
const entry = script.find((e) => e.match.every((m, i) => argv[i] === m))
if (!entry) {
  process.stderr.write(`fake-orca: no script entry for ${JSON.stringify(argv)}\n`)
  process.exit(99)
}
if (entry.delayMs) await new Promise((r) => setTimeout(r, entry.delayMs))
process.stdout.write(entry.stdout)
process.exit(entry.exitCode)
