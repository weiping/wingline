import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { consoleWorktree, createConsoleServer, openTab } from '../../src/server/index.js'
import { Registry } from '../../src/registry/registry.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { requestLink } from '../../src/server/control.js'

test('login link sets the cookie and answers 200 with a meta refresh to / (no 302); second use shows the expired page with 401', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const loginUrl = srv.loginUrl()

    // First use
    const res1 = await fetch(loginUrl, { redirect: 'manual' })
    expect(res1.status).toBe(200)
    const html1 = await res1.text()
    expect(html1).toContain('meta http-equiv="refresh" content="0;url=/"')
    const cookie = res1.headers.get('set-cookie')
    expect(cookie).toContain('wl_sid=')

    // Second use
    const res2 = await fetch(loginUrl, { redirect: 'manual' })
    expect(res2.status).toBe(401)
    const html2 = await res2.text()
    expect(html2).toContain('链接已失效')
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('--open without --worktree and without any running team → console_no_worktree', () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  // Override with a clean registry
  deps.registry.close()
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-empty-'))
  const emptyReg = Registry.open(path.join(emptyHome, 'registry.sqlite'))
  expect(() => consoleWorktree({ ...deps, registry: emptyReg })).toThrowError(
    expect.objectContaining({ code: 'console_no_worktree' }),
  )
})

test('a request with a foreign Host gets 421 before anything else', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: srv.port,
          path: '/api/teams',
          headers: { Host: 'evil.com' },
        },
        resolve,
      )
      req.on('error', reject)
      req.end()
    })
    expect(res.statusCode).toBe(421)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('GET /api without a session is 401; POST with a session but no csrf is 403', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    // No session
    const resGet = await fetch(`http://127.0.0.1:${srv.port}/api/teams`)
    expect(resGet.status).toBe(401)

    // Get session cookie
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    // POST with session but no csrf
    const resPost = await fetch(`http://127.0.0.1:${srv.port}/api/teams/duo/send`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: `http://127.0.0.1:${srv.port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ post: 'builder', message: 'hi' }),
    })
    expect(resPost.status).toBe(403)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('a POST body over 64 KB is 413 body_too_large', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!
    const sessRes = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
      headers: { Cookie: cookie },
    })
    const { result } = (await sessRes.json()) as any

    const bigStr = 'x'.repeat(70 * 1024)
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/teams/duo/send`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: `http://127.0.0.1:${srv.port}`,
        'X-Wingline-Token': result.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ post: 'builder', message: bigStr }),
    })
    expect(res.status).toBe(413)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('body_too_large')
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('POST /_control/link with the right key returns a fresh login url; a wrong key is 403', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const ctrl = srv.controlKey
    const good = await requestLink({ pid: 1, port: srv.port, startedAt: '', controlKey: ctrl })
    expect(good).toContain('/auth?token=')

    const bad = await requestLink({ pid: 1, port: srv.port, startedAt: '', controlKey: 'wrong' })
    expect(bad).toBeNull()
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('openTab returns opened on successful tab create', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const res = await openTab(deps, 'http://127.0.0.1:4100', 'wt-1')
  expect(res).toBe('opened')
})
