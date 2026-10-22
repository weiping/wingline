import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { consoleWorktree, createConsoleServer, openTab, SECURITY_HEADERS } from '../../src/server/index.js'
import { Registry } from '../../src/registry/registry.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'
import { requestLink } from '../../src/server/control.js'
import { WinglineError } from '../../src/errors.js'

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

test('consoleWorktree 跳过 stopped 团队，取 up 团队牵头岗 worktree', () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.setTeamStatus('duo', 'stopped')
  deps.registry.upsertTeam({
    name: 'solo',
    specPath: '/path/to/solo.yaml',
    specHash: 'hash-solo',
    runId: 'run-solo',
    coordinatorHandle: 'coord-solo',
    status: 'up',
  })
  deps.registry.upsertPost({
    address: 'worker@solo',
    team: 'solo',
    agent: 'claude',
    worktree: 'path:/worktree/solo',
    handle: 'term-solo',
    status: 'live',
    isLead: true,
    sessionMarker: null,
    sessionId: null,
    sessionAt: null,
  })

  expect(consoleWorktree(deps)).toBe('path:/worktree/solo')
})

test('只有 stopped 团队时 consoleWorktree 抛 console_no_worktree', () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  deps.registry.setTeamStatus('duo', 'stopped')
  expect(() => consoleWorktree(deps)).toThrowError(
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

test('spec routes accept a newline-heavy yaml whose JSON form exceeds 64 KB; over 48 KB of yaml is spec_too_large, not 413', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')
  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const cookie = (await fetch(srv.loginUrl())).headers.get('set-cookie')!.split(';')[0]!
    const { result } = (await (await fetch(`http://127.0.0.1:${srv.port}/api/session`, { headers: { Cookie: cookie } })).json()) as any
    const post = (yaml: string) =>
      fetch(`http://127.0.0.1:${srv.port}/api/teams/duo/spec/validate`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: `http://127.0.0.1:${srv.port}`, 'X-Wingline-Token': result.csrfToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
      })
    const lines = (n: number) => '#\n'.repeat(n) // 每行 2 字节，JSON 里 `\n` 要转义，变成 3 字节
    const ok = await post(lines(22 * 1024)) // 44 KB 文本（< 48 KB）→ 约 66 KB 的 JSON（> 64 KB）
    expect(ok.status).toBe(200)
    const tooLarge = await post(lines(25 * 1024)) // 50 KB > 48 KB
    expect(tooLarge.status).toBe(400)
    expect(((await tooLarge.json()) as any).error.code).toBe('spec_too_large')
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

test('GET /api/teams/ghost/events 回 400 team_unknown，且服务不崩（后续请求仍被应答）', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    const res = await fetch(`http://127.0.0.1:${srv.port}/api/teams/ghost/events`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('team_unknown')

    const sessRes = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
      headers: { Cookie: cookie },
    })
    expect(sessRes.status).toBe(200)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('GET /api/teams/Duo/events 回 400 invalid_param（SSE 路由也过参数校验）', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    const res = await fetch(`http://127.0.0.1:${srv.port}/api/teams/Duo/events`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('invalid_param')
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('SSE 未登录回 401', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/teams/duo/events`)
    expect(res.status).toBe(401)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('SSE 客户端在连接后立刻断开，服务仍能继续正常应答', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, {
    port: 0,
    webRoot: webDir,
    sse: { timelineMs: 50 },
  })
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    const clientReq = http.request({
      hostname: '127.0.0.1',
      port: srv.port,
      path: '/api/teams/duo/events',
      headers: { Cookie: cookie },
    })
    clientReq.on('error', () => {})
    clientReq.end()
    clientReq.destroy()

    const sessRes = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
      headers: { Cookie: cookie },
    })
    expect(sessRes.status).toBe(200)
    const json = (await sessRes.json()) as any
    expect(json.ok).toBe(true)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('SSE 端点推送连接后写入的 timeline 事件', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, {
    port: 0,
    webRoot: webDir,
    sse: { timelineMs: 50 },
  })
  let clientReq: http.ClientRequest | undefined
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    let received = ''
    clientReq = http.request({
      hostname: '127.0.0.1',
      port: srv.port,
      path: '/api/teams/duo/events',
      headers: { Cookie: cookie },
    })

    let incomingRes: http.IncomingMessage | undefined
    const connected = new Promise<void>((resolve) => {
      clientReq!.on('response', (res) => {
        incomingRes = res
        res.on('data', (chunk) => {
          received += chunk.toString('utf8')
        })
        resolve()
      })
    })
    clientReq.end()

    await connected

    deps.registry.appendAudit({
      team: 'duo',
      actor: 'user',
      command: 'send',
      target: 'builder',
      outcome: 'ok',
    })

    const start = Date.now()
    while (!received.includes('event: timeline') || !received.includes('id: command:')) {
      if (Date.now() - start > 1000) {
        throw new Error(`Timeout waiting for timeline event, received: ${received}`)
      }
      await new Promise((r) => setTimeout(r, 20))
    }

    expect(received).toContain('event: timeline')
    expect(received).toContain('id: command:')
    incomingRes?.destroy()
    clientReq.destroy()
  } finally {
    clientReq?.destroy()
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('Last-Event-ID 只回退对应来源', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  deps.registry.appendTaskLog({
    team: 'duo',
    taskId: 'task-1',
    epoch: 1,
    actor: 'builder',
    actorSource: 'explicit',
    action: 'create',
  })
  deps.registry.appendTaskLog({
    team: 'duo',
    taskId: 'task-1',
    epoch: 1,
    actor: 'builder',
    actorSource: 'explicit',
    action: 'start',
  })
  const initialTasks = deps.registry.listTeamTaskLog('duo')
  expect(initialTasks.length).toBe(2)
  const secondTaskId = initialTasks[1]!.id

  const srv = await createConsoleServer(deps, {
    port: 0,
    webRoot: webDir,
    sse: { timelineMs: 50 },
  })
  let clientReq: http.ClientRequest | undefined
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    let received = ''
    clientReq = http.request({
      hostname: '127.0.0.1',
      port: srv.port,
      path: '/api/teams/duo/events',
      headers: {
        Cookie: cookie,
        'Last-Event-ID': `task:${secondTaskId}`,
      },
    })

    const connected = new Promise<void>((resolve) => {
      clientReq!.on('response', (res) => {
        res.on('data', (chunk) => {
          received += chunk.toString('utf8')
        })
        resolve()
      })
    })
    clientReq.end()

    await connected

    deps.registry.appendTaskLog({
      team: 'duo',
      taskId: 'task-1',
      epoch: 1,
      actor: 'builder',
      actorSource: 'explicit',
      action: 'done',
    })
    deps.registry.appendAudit({
      team: 'duo',
      actor: 'user',
      command: 'test',
      target: 'builder',
      outcome: 'ok',
    })

    const allTasks = deps.registry.listTeamTaskLog('duo')
    const thirdTaskId = allTasks[2]!.id
    const audits = deps.registry.listAudit('duo')
    const firstAuditId = audits[0]!.id

    const start = Date.now()
    while (
      !received.includes(`id: task:${thirdTaskId}`) ||
      !received.includes(`id: command:${firstAuditId}`)
    ) {
      if (Date.now() - start > 1000) {
        throw new Error(`Timeout waiting for expected events, received: ${received}`)
      }
      await new Promise((r) => setTimeout(r, 20))
    }

    expect(received).not.toContain(`id: task:${initialTasks[0]!.id}\n`)
    expect(received).not.toContain(`id: task:${secondTaskId}\n`)
    expect(received).toContain(`id: task:${thirdTaskId}\n`)
    expect(received).toContain(`id: command:${firstAuditId}\n`)
    clientReq.destroy()
  } finally {
    clientReq?.destroy()
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('有 SSE 连接挂起时 close() 也能在 1 秒内完成', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, {
    port: 0,
    webRoot: webDir,
    sse: { timelineMs: 50, snapshotMs: 50, pingMs: 50 },
  })
  let closed = false
  let sseReq: http.ClientRequest | undefined
  let incomingRes: http.IncomingMessage | undefined
  try {
    const loginRes = await fetch(srv.loginUrl())
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    sseReq = http.request({
      hostname: '127.0.0.1',
      port: srv.port,
      path: '/api/teams/duo/events',
      headers: { Cookie: cookie },
    })

    await new Promise<void>((resolve) => {
      sseReq!.on('response', (res) => {
        incomingRes = res
        resolve()
      })
      sseReq!.end()
    })

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('close timed out after 1s')), 1000),
    )

    await Promise.race([
      srv.close().then(() => {
        closed = true
      }),
      timeout,
    ])
  } finally {
    incomingRes?.socket?.destroy()
    incomingRes?.destroy()
    sseReq?.destroy()
    if (!closed) {
      await srv.close().catch(() => {})
    }
    fs.rmSync(webDir, { recursive: true })
  }
})

test.each([
  ['GET /api/session（登录后）'],
  ['GET /auth?token=<失效token>'],
  ['GET /（静态 index.html）'],
  ['GET /api/teams/duo/events（登录后，SSE 头）'],
])('%s 响应带齐 CSP/nosniff/no-referrer/no-store', async (name) => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    if (name.includes('/api/session')) {
      const loginRes = await fetch(srv.loginUrl())
      const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
        headers: { Cookie: cookie },
      })
      expect(res.status).toBe(200)
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(k)).toBe(v)
      }
    } else if (name.includes('/auth?token=<失效token>')) {
      const res = await fetch(`http://127.0.0.1:${srv.port}/auth?token=invalid-token`)
      expect(res.status).toBe(401)
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(k)).toBe(v)
      }
    } else if (name.includes('GET /（静态 index.html）')) {
      const res = await fetch(`http://127.0.0.1:${srv.port}/`)
      expect(res.status).toBe(200)
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(k)).toBe(v)
      }
    } else if (name.includes('/api/teams/duo/events')) {
      const loginRes = await fetch(srv.loginUrl())
      const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!
      const clientReq = http.request({
        hostname: '127.0.0.1',
        port: srv.port,
        path: '/api/teams/duo/events',
        headers: { Cookie: cookie },
      })
      const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
        clientReq.on('response', (res) => {
          resolve(res.headers)
          res.destroy()
        })
        clientReq.on('error', reject)
        clientReq.end()
      })
      expect(headers['content-type']).toBe('text/event-stream')
      expect(headers['connection']).toBe('keep-alive')
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        expect(headers[k.toLowerCase()]).toBe(v)
      }
    }
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('421 响应也带安全头', async () => {
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
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[k.toLowerCase()]).toBe(v)
    }
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('GET /auth 有效 token 与 POST /_control/link 均带安全头', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')

  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const loginRes = await fetch(srv.loginUrl(), { redirect: 'manual' })
    expect(loginRes.status).toBe(200)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(loginRes.headers.get(k)).toBe(v)
    }

    const ctrlRes = await fetch(`http://127.0.0.1:${srv.port}/_control/link`, {
      method: 'POST',
      headers: { 'X-Control-Key': srv.controlKey },
    })
    expect(ctrlRes.status).toBe(200)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(ctrlRes.headers.get(k)).toBe(v)
    }

    const badCtrlRes = await fetch(`http://127.0.0.1:${srv.port}/_control/link`, {
      method: 'POST',
      headers: { 'X-Control-Key': 'wrong-key' },
    })
    expect(badCtrlRes.status).toBe(403)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(badCtrlRes.headers.get(k)).toBe(v)
    }
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})


test('console create task: an uncertain result carries retryRequest, resending it creates no second task (real core)', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')
  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  try {
    const cookie = (await fetch(srv.loginUrl())).headers.get('set-cookie')!.split(';')[0]!
    const base = `http://127.0.0.1:${srv.port}`
    const { result } = (await (await fetch(`${base}/api/session`, { headers: { Cookie: cookie } })).json()) as any
    const post = (body: object) => fetch(`${base}/api/teams/duo/tasks`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: base, 'X-Wingline-Token': result.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('orca', 'runtime_timeout', 'timeout') })
    const realShow = o.requestShow.bind(o)
    o.requestShow = async () => ({ state: 'pending', receipt: null })
    const first = await post({ title: '登录页' })
    expect(first.status).toBe(504)
    const retryRequest = ((await first.json()) as any).error.retryRequest as string
    expect(retryRequest).toEqual(expect.any(String))
    o.requestShow = realShow
    const second = await post({ title: '登录页', retryRequest })
    expect(second.status).toBe(200)
    expect(o.tasks).toHaveLength(1)
  } finally {
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

test('a second SSE connection to the same team gets a normal event-stream response and the current snapshot', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')
  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir, sse: { snapshotMs: 50 } })
  const aborts: AbortController[] = []
  try {
    const cookie = (await fetch(srv.loginUrl())).headers.get('set-cookie')!.split(';')[0]!
    const open = async () => {
      const ac = new AbortController(); aborts.push(ac)
      const res = await fetch(`http://127.0.0.1:${srv.port}/api/teams/duo/events`, { headers: { Cookie: cookie }, signal: ac.signal })
      const reader = res.body!.getReader(); const dec = new TextDecoder()
      let text = ''
      const waitFor = async (needle: string) => {
        const deadline = Date.now() + 3000
        while (!text.includes(needle)) {
          if (Date.now() > deadline) throw new Error(`timeout waiting for ${needle}; got ${text}`)
          const r = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 100))])
          if (r && !r.done) text += dec.decode(r.value)
        }
      }
      return { res, waitFor }
    }
    const first = await open()
    expect(first.res.headers.get('content-type')).toContain('text/event-stream')
    await first.waitFor('event: snapshot')
    const second = await open()
    expect(second.res.headers.get('content-type')).toContain('text/event-stream')
    expect(second.res.headers.get('cache-control')).toBe('no-store')
    await second.waitFor('event: snapshot')
  } finally {
    for (const ac of aborts) ac.abort()
    await srv.close()
    fs.rmSync(webDir, { recursive: true })
  }
})

async function loggedIn(o: FakeOrca) {
  const { deps, warnings } = seedRunningTeam(o)
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-web-'))
  fs.writeFileSync(path.join(webDir, 'index.html'), '<html>INDEX</html>')
  const srv = await createConsoleServer(deps, { port: 0, webRoot: webDir })
  const base = `http://127.0.0.1:${srv.port}`
  const cookie = (await fetch(srv.loginUrl())).headers.get('set-cookie')!.split(';')[0]!
  const { result } = (await (await fetch(`${base}/api/session`, { headers: { Cookie: cookie } })).json()) as any
  const post = (p: string, body: object) => fetch(`${base}${p}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'X-Wingline-Token': result.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const get = (p: string) => fetch(`${base}${p}`, { headers: { Cookie: cookie } })
  const close = async () => { await srv.close(); fs.rmSync(webDir, { recursive: true }) }
  return { warnings, post, get, close }
}

test('an unexpected error in a route is answered 500 internal and logged once with method and path (spec §9)', async () => {
  const o = new FakeOrca()
  o.terminalList = async () => { throw new TypeError('boom') }
  const s = await loggedIn(o)
  try {
    const res = await s.get('/api/teams/duo')
    expect(res.status).toBe(500)
    expect(((await res.json()) as any).error.kind).toBe('internal')
    expect(s.warnings.filter((w) => w.includes('GET /api/teams/duo') && w.includes('boom'))).toHaveLength(1)
  } finally {
    await s.close()
  }
})

test('an input error (400) is not logged', async () => {
  const s = await loggedIn(new FakeOrca())
  try {
    const res = await s.post('/api/teams/duo/send', { post: 'builder', message: 'hi', bogus: 1 })
    expect(res.status).toBe(400)
    expect(s.warnings.filter((w) => w.includes('/api/teams/duo/send'))).toEqual([])
  } finally {
    await s.close()
  }
})
