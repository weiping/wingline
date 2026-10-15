import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..')

/** 读 test/fixtures/receipts/<name>.json（真机回执，已脱敏）。 */
export function fixture<T = Record<string, any>>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/receipts', `${name}.json`), 'utf8')) as T
}
