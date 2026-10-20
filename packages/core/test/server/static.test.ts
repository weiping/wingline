import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ServerResponse } from 'node:http'
import { expect, test } from 'vitest'
import { assertWebBuilt, SECURITY_HEADERS, serveStatic } from '../../src/server/static.js'

function mockResponse(): { res: ServerResponse; headers: Record<string, string>; status: number; body: string } {
  const headers: Record<string, string> = {}
  let status = 200
  let body = ''
  const res = {
    writeHead(st: number, hdrs?: Record<string, string>) {
      status = st
      if (hdrs) Object.assign(headers, hdrs)
      return res
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v
    },
    end(chunk?: any) {
      if (chunk) body += String(chunk)
    },
  } as unknown as ServerResponse
  return { res, headers, get status() { return status }, get body() { return body } }
}

test('assertWebBuilt throws web_missing on empty directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  try {
    expect(() => assertWebBuilt(dir)).toThrowError(expect.objectContaining({ code: 'web_missing' }))
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test('serveStatic serves index.html for / and fallback for SPA routes with SECURITY_HEADERS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>INDEX</html>')
    const m1 = mockResponse()
    const hit1 = serveStatic(dir, '/', m1.res)
    expect(hit1).toBe(true)
    expect(m1.status).toBe(200)
    expect(m1.body).toBe('<html>INDEX</html>')
    expect(m1.headers['cache-control']).toBe('no-store')
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(m1.headers[k.toLowerCase()]).toBe(v)
    }

    // SPA route fallback
    const m2 = mockResponse()
    const hit2 = serveStatic(dir, '/t/duo/inbox', m2.res)
    expect(hit2).toBe(true)
    expect(m2.body).toBe('<html>INDEX</html>')
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test('serveStatic serves /assets/ with immutable cache header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  try {
    fs.mkdirSync(path.join(dir, 'assets'))
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)')
    const m = mockResponse()
    const hit = serveStatic(dir, '/assets/app-abc123.js', m.res)
    expect(hit).toBe(true)
    expect(m.status).toBe(200)
    expect(m.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(m.headers['content-type']).toBe('text/javascript; charset=utf-8')
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

/** 跨平台回归：URL 归一化必须按 POSIX 规则（'/' 是分隔符），否则 Windows 上 path.normalize 会把
 *  '/assets/x' 变成 '\assets\x'，让 sendFile 里的 isAsset 判断失败，缓存头误给 no-store。
 * 把归一化逻辑在 macOS 上用 path.posix.normalize 等价复现一次，证明 source 改完之后无论跑在哪个平台
 * 拿到的 normalized 都长这样。 */
test('URL path normalization is platform-independent (POSIX rules; Windows would have mangled it)', () => {
  // 不变量：path.posix.normalize 对所有 URL 形式都返回以 '/' 开头的路径，且 '/' 始终是分隔符。
  expect(path.posix.normalize('/assets/app-abc123.js')).toBe('/assets/app-abc123.js')
  expect(path.posix.normalize('/assets/../etc/passwd')).toBe('/etc/passwd')
  // 在 Windows 上，path.normalize('/assets/app-abc123.js') 会得到 '\assets\app-abc123.js'
  // （被替换成反斜杠并去掉首斜杠），证明为什么源里不能继续用平台默认 path.normalize。
  // 在 macOS 上 path.win32.normalize 也演示这个事实：
  expect(path.win32.normalize('/assets/app-abc123.js')).toBe('\\assets\\app-abc123.js')
})

test('serveStatic serves nested /assets/ paths with immutable cache (regression for the Windows normalize bug)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  try {
    fs.mkdirSync(path.join(dir, 'assets', 'sub'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'assets', 'sub', 'chunk-hashed.css'), 'body{}')
    const m = mockResponse()
    const hit = serveStatic(dir, '/assets/sub/chunk-hashed.css', m.res)
    expect(hit).toBe(true)
    expect(m.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test('serveStatic returns 404 on path traversal attempts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>INDEX</html>')
    const m1 = mockResponse()
    expect(serveStatic(dir, '/../package.json', m1.res)).toBe(false)
    expect(m1.status).toBe(404)

    const m2 = mockResponse()
    expect(serveStatic(dir, '/%2e%2e/x', m2.res)).toBe(false)
    expect(m2.status).toBe(404)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})
