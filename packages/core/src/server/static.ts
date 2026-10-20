import fs from 'node:fs'
import path from 'node:path'
import type { ServerResponse } from 'node:http'
import { WinglineError } from '../errors.js'

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

export function assertWebBuilt(root: string): void {
  const index = path.join(root, 'index.html')
  if (!fs.existsSync(index)) {
    throw new WinglineError('internal', 'web_missing', '控制台前端未构建', { hint: '运行 pnpm build' })
  }
}

function applySecurityHeaders(res: ServerResponse, extra: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(k, v)
  }
  for (const [k, v] of Object.entries(extra)) {
    res.setHeader(k, v)
  }
}

/** 反复解码直到没有百分号；解码抛错时返回 null（调用方回 400）。 */
function decodeUrlPath(urlPath: string): string | null {
  let decoded = urlPath
  try {
    while (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded)
    }
  } catch {
    return null
  }
  return decoded
}

function respondEmpty(res: ServerResponse, status: number): void {
  applySecurityHeaders(res)
  res.writeHead(status)
  res.end()
}

/** 归一化并确认目标仍在 root 之下；越界返回 null（调用方回 404）。 */
function resolveUnder(root: string, decoded: string): { normalized: string; resolved: string } | null {
  let normalized = path.normalize(decoded)
  if (!normalized.startsWith('/')) normalized = '/' + normalized
  const rootAbs = path.resolve(root)
  const resolved = path.resolve(rootAbs, '.' + normalized)
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) return null
  return { normalized, resolved }
}

/** 命中实体文件时回 200（含 /assets/ 哈希资源的 immutable 缓存例外）。 */
function sendFile(res: ServerResponse, normalized: string, resolved: string): boolean {
  let content: Buffer
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) return false
    content = fs.readFileSync(resolved)
  } catch {
    return false
  }

  const ext = path.extname(resolved).toLowerCase()
  const mime = MIME[ext] ?? 'application/octet-stream'
  const isAsset = normalized.startsWith('/assets/')
  const cacheControl = isAsset ? 'public, max-age=31536000, immutable' : 'no-store'

  applySecurityHeaders(res, {
    'Content-Type': mime,
    'Cache-Control': cacheControl,
  })
  res.writeHead(200)
  res.end(content)
  return true
}

/** SPA 兜底：无扩展名、非 /api、/_control、/auth 时回 index.html。 */
function sendIndex(res: ServerResponse, root: string, normalized: string): boolean {
  const ext = path.extname(normalized)
  if (
    normalized === '/..' ||
    normalized.startsWith('/../') ||
    ext ||
    normalized.startsWith('/api') ||
    normalized.startsWith('/_control') ||
    normalized.startsWith('/auth')
  ) {
    return false
  }
  const index = path.join(root, 'index.html')
  let content: Buffer
  try {
    content = fs.readFileSync(index)
  } catch {
    return false
  }
  applySecurityHeaders(res, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.writeHead(200)
  res.end(content)
  return true
}

export function serveStatic(root: string, urlPath: string, res: ServerResponse): boolean {
  const decoded = decodeUrlPath(urlPath)
  if (decoded === null) {
    respondEmpty(res, 400)
    return false
  }

  // 检查原始路径中是否包含路径穿越 /.. 或 /../
  if (decoded.split('/').some((part) => part === '..')) {
    respondEmpty(res, 404)
    return false
  }

  const target = resolveUnder(root, decoded)
  if (!target) {
    respondEmpty(res, 404)
    return false
  }

  if (sendFile(res, target.normalized, target.resolved)) return true
  if (sendIndex(res, root, target.normalized)) return true

  respondEmpty(res, 404)
  return false
}
