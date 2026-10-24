import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../../..')

/** 读 test/fixtures/screens/<name>.txt，去掉开头的 `# …` 说明行；crlf 为真时换成 CRLF（Windows 检出的样子）。 */
export function sample(name: string, o: { crlf?: boolean } = {}): string {
  const lines = fs.readFileSync(path.join(ROOT, 'test/fixtures/screens', `${name}.txt`), 'utf8').split(/\r?\n/)
  while (lines[0]?.startsWith('#')) lines.shift()
  return lines.join(o.crlf ? '\r\n' : '\n')
}
