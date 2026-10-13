import fs from 'node:fs'
import path from 'node:path'

export interface CallEntry {
  args: string[]
  ms: number
  exitCode: number | null
  stdout: string
  stderr: string
}

export interface CallLog {
  record(e: CallEntry): void
  /** 当天日志文件路径，用于错误信息。 */
  path(): string
}

const MESSAGE_FLAGS = new Set(['--text', '--body'])
const MESSAGE_LIMIT = 200
const RECEIPT_LIMIT = 16 * 1024
const KEEP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (d: Date) => d.toISOString().slice(0, 10)

function redact(args: string[]): string[] {
  return args.map((a, i) => (MESSAGE_FLAGS.has(args[i - 1] ?? '') ? a.slice(0, MESSAGE_LIMIT) : a))
}

function prune(dir: string, now: Date): void {
  const cutoff = dayOf(new Date(now.getTime() - KEEP_DAYS * DAY_MS))
  for (const f of fs.readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)
    if (m && m[1]! < cutoff) fs.rmSync(path.join(dir, f), { force: true })
  }
}

export function createCallLog(dir: string, now: () => Date = () => new Date()): CallLog {
  fs.mkdirSync(dir, { recursive: true })
  prune(dir, now())
  const file = () => path.join(dir, `${dayOf(now())}.jsonl`)
  return {
    path: file,
    record(e) {
      const line = {
        at: now().toISOString(),
        args: redact(e.args),
        ms: e.ms,
        exitCode: e.exitCode,
        stdout: e.stdout.slice(0, RECEIPT_LIMIT),
        stderr: e.stderr.slice(0, RECEIPT_LIMIT),
      }
      fs.appendFileSync(file(), JSON.stringify(line) + '\n')
    },
  }
}
