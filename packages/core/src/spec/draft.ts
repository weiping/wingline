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

/** 符号链接指向的真实文件；不存在（还没有这个文件）就原样返回。 */
function realTarget(file: string): string {
  try {
    return fs.realpathSync(file)
  } catch {
    return file
  }
}

/** 已有文件的权限位（不存在返回 null）。 */
function modeOf(file: string): number | null {
  try {
    return fs.statSync(file).mode & 0o7777
  } catch {
    return null
  }
}

/**
 * 先写同目录临时文件再改名，避免留下半截文件。改名会换掉文件本身，所以：
 * 符号链接要写到它指向的真实文件上（链接保持链接），已有文件的权限位要带过去。
 */
export function writeAtomic(link: string, text: string): void {
  const file = realTarget(link)
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  try {
    fs.writeFileSync(tmp, text)
    const mode = modeOf(file)
    if (mode !== null) fs.chmodSync(tmp, mode)
    fs.renameSync(tmp, file)
  } catch (cause) {
    fs.rmSync(tmp, { force: true })
    throw new WinglineError('internal', 'internal', `写入 ${link} 失败：${(cause as Error).message}`, { cause })
  }
}

export function assertSpecSize(text: string): void {
  if (Buffer.byteLength(text, 'utf8') > SPEC_MAX_BYTES) {
    throw new WinglineError('input', 'spec_too_large', `规格超过 ${SPEC_MAX_BYTES / 1024} KB`)
  }
}

/** 保存前的冲突检查：目标文件当前内容既不等于新内容、也不等于加载时的 baseHash 时抛 spec_conflict。 */
export function checkSaveConflict(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): { target: string; hash: string; skip: boolean } {
  const target = a.running ? draftPathOf(a.specPath) : a.specPath
  const hash = textHash(a.text)
  const current = fileHash(target)
  if (current === hash) return { target, hash, skip: true }
  if (current !== a.baseHash) throw new WinglineError('input', 'spec_conflict', `${path.basename(target)} 在加载后被改动过，请重新加载`)
  return { target, hash, skip: false }
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
  const { target, hash, skip } = checkSaveConflict(a)
  const result = { wrote: a.running ? ('draft' as const) : ('spec' as const), path: target, hash }
  if (skip) return result
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
    const mode = modeOf(specPath)
    if (mode !== null) fs.chmodSync(draft, mode)
    fs.renameSync(draft, realTarget(specPath))
  } catch (err) {
    if (hadSpec) fs.rmSync(backup, { force: true })
    throw err
  }
}
