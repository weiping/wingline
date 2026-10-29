import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import { writeAtomic } from './draft.js'

export const DOC_LIMIT_BYTES = 64 * 1024

/**
 * 控制台只允许写团队目录里被规格引用的 .md。路径来自不可信的请求体：
 * 绝对路径、`..` 越界、非 .md、含 \0、软链接指向目录外，一律拒绝。
 * shortcut: 新建文件时穿过本身是软链接的父目录不在检查之列（规格引用校验已把可写范围限到团队目录）
 */
export function resolveDocPath(specDir: string, rel: string): string {
  const bad = () => new WinglineError('input', 'doc_path_invalid', `文档路径 ${rel} 必须位于团队目录内且为 .md 文件`)
  if (typeof rel !== 'string' || rel === '' || !rel.endsWith('.md') || rel.includes('\0')) throw bad()
  const abs = path.resolve(specDir, rel.replace(/\\/g, '/'))
  const within = path.relative(specDir, abs)
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) throw bad()
  // 已存在的路径可能是软链接：解析后的真实位置必须仍在真实团队目录内
  if (fs.existsSync(abs)) {
    const real = path.relative(fs.realpathSync(specDir), fs.realpathSync(abs))
    if (real === '' || real.startsWith('..') || path.isAbsolute(real)) throw bad()
  }
  return abs
}

/** 读文档正文；读不到（还没落盘、被删掉）一律返回空串，让编辑器拿到一个可编辑的初值。 */
export function readDocText(abs: string): string {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

/** 原子写文档（照 saveSpec 的 writeAtomic：临时文件 + 改名，继承已有文件的权限位），并建出缺失的父目录。 */
export function writeDocAtomic(abs: string, content: string): void {
  if (Buffer.byteLength(content, 'utf8') > DOC_LIMIT_BYTES) {
    throw new WinglineError('input', 'doc_too_large', `文档 ${path.basename(abs)} 超过 ${DOC_LIMIT_BYTES / 1024} KB 上限`)
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  writeAtomic(abs, content)
}

/** 从原始 YAML 对象里取 norms 与 posts[*].brief 引用的相对路径（去重）；不是对象就返回空。 */
export function docRelsOf(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object') return []
  const raw = parsed as { norms?: unknown; posts?: unknown }
  const rels = new Set<string>()
  if (typeof raw.norms === 'string') rels.add(raw.norms)
  if (Array.isArray(raw.posts)) {
    for (const post of raw.posts) {
      const brief = (post as { brief?: unknown } | null)?.brief
      if (Array.isArray(brief)) for (const b of brief) if (typeof b === 'string') rels.add(b)
    }
  }
  return [...rels]
}
