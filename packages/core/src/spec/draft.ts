import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import { specHash } from './hash.js'
import { loadTeamSpec, validateSpecText } from './load.js'

export const SPEC_MAX_BYTES = 48 * 1024

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** team.yaml → team.draft.yaml（同目录、扩展名前加 .draft）。 */
export function draftPathOf(specPath: string): string {
  const ext = path.extname(specPath)
  return `${specPath.slice(0, specPath.length - ext.length)}.draft${ext}`
}

export const textHash = (text: string): string => sha256(Buffer.from(text, 'utf8'))

export function fileHash(file: string): string | null {
  try {
    return sha256(fs.readFileSync(file))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** 先写同目录临时文件再改名，避免留下半截文件。 */
function writeAtomic(file: string, text: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  } catch (cause) {
    fs.rmSync(tmp, { force: true })
    throw new WinglineError('internal', 'internal', `写入 ${file} 失败：${(cause as Error).message}`, { cause })
  }
}

export function assertSpecSize(text: string): void {
  if (Buffer.byteLength(text, 'utf8') > SPEC_MAX_BYTES) {
    throw new WinglineError('input', 'spec_too_large', `规格超过 ${SPEC_MAX_BYTES / 1024} KB`)
  }
}

/** 保存规格：团队运行中写草稿，否则写正式规格。`running` 与注册表是否一致由调用方检查。 */
export function saveSpec(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): {
  wrote: 'draft' | 'spec'
  path: string
  hash: string
} {
  assertSpecSize(a.text)
  const { errors } = validateSpecText(a.text, a.specPath)
  if (errors.length > 0) {
    throw new WinglineError('input', 'spec_invalid', errors[0]!.message, { detail: { errors } })
  }
  const target = a.running ? draftPathOf(a.specPath) : a.specPath
  const result = { wrote: a.running ? ('draft' as const) : ('spec' as const), path: target, hash: textHash(a.text) }
  const current = fileHash(target)
  if (current === result.hash) return result
  if (current !== a.baseHash) {
    throw new WinglineError('input', 'spec_conflict', `${path.basename(target)} 在加载后被改动过，请重新加载`)
  }
  writeAtomic(target, a.text)
  return result
}

export function discardDraft(specPath: string): { discarded: boolean } {
  try {
    fs.unlinkSync(draftPathOf(specPath))
    return { discarded: true }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { discarded: false }
    throw err
  }
}

/** `wl up --draft`：校验草稿 → 备份 → 改名为正式规格。任一步失败都不留下半新半旧的文件。 */
export function applyDraft(specPath: string, o: { runningHash: string | null }): void {
  const draft = draftPathOf(specPath)
  if (!fs.existsSync(draft)) {
    throw new WinglineError('input', 'draft_not_found', `找不到规格草稿 ${draft}`)
  }
  const spec = loadTeamSpec(draft)
  if (o.runningHash !== null && specHash(spec) !== o.runningHash) {
    throw new WinglineError('input', 'team_spec_changed', `团队 ${spec.name} 的规格已变化`, {
      hint: `不支持在线修改编队，请先执行 wl down ${spec.name}`,
    })
  }
  const backup = `${specPath}.bak`
  const hadSpec = fs.existsSync(specPath)
  if (hadSpec) fs.copyFileSync(specPath, backup)
  try {
    fs.renameSync(draft, specPath)
  } catch (err) {
    if (hadSpec) fs.rmSync(backup, { force: true })
    throw err
  }
}
