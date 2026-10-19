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

export function serveStatic(root: string, urlPath: string, res: ServerResponse): boolean {
  let decoded = urlPath
  try {
    while (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded)
    }
  } catch {
    applySecurityHeaders(res)
    res.writeHead(400)
    res.end()
    return false
  }

  // 检查原始路径中是否包含路径穿越 /.. 或 /../
  if (decoded.split('/').some((part) => part === '..')) {
    applySecurityHeaders(res)
    res.writeHead(404)
    res.end()
    return false
  }

  let normalized = path.normalize(decoded)
  if (!normalized.startsWith('/')) normalized = '/' + normalized
  const rootAbs = path.resolve(root)
  const resolved = path.resolve(rootAbs, '.' + normalized)

  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    applySecurityHeaders(res)
    res.writeHead(404)
    res.end()
    return false
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const ext = path.extname(resolved).toLowerCase()
    const mime = MIME[ext] ?? 'application/octet-stream'
    const isAsset = normalized.startsWith('/assets/')
    const cacheControl = isAsset ? 'public, max-age=31536000, immutable' : 'no-store'

    applySecurityHeaders(res, {
      'Content-Type': mime,
      'Cache-Control': cacheControl,
    })
    res.writeHead(200)
    res.end(fs.readFileSync(resolved))
    return true
  }

  const ext = path.extname(normalized)
  if (
    normalized !== '/..' &&
    !normalized.startsWith('/../') &&
    !ext &&
    !normalized.startsWith('/api') &&
    !normalized.startsWith('/_control') &&
    !normalized.startsWith('/auth')
  ) {
    const index = path.join(root, 'index.html')
    if (fs.existsSync(index)) {
      applySecurityHeaders(res, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.writeHead(200)
      res.end(fs.readFileSync(index))
      return true
    }
  }

  applySecurityHeaders(res)
  res.writeHead(404)
  res.end()
  return false
}
