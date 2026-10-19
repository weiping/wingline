import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { finish, record, setup } from './lib.js'

const probe = 'console-tab'
const { runner, worktree } = setup()

let cookieSeen = false
let sseEventsReceived = 0
let postReceived = false

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (url.pathname === '/set') {
    res.writeHead(302, {
      'Set-Cookie': 'wl_test=val123; HttpOnly; SameSite=Strict; Path=/',
      Location: '/check',
    })
    res.end()
    return
  }

  if (url.pathname === '/check') {
    const cookieHeader = req.headers.cookie ?? ''
    if (cookieHeader.includes('wl_test=val123')) {
      cookieSeen = true
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html>
<head><title>Console Tab Probe</title></head>
<body>
<h1>Probe Running</h1>
<script>
  let count = 0;
  const es = new EventSource('/events');
  es.onmessage = (e) => {
    count++;
    if (count >= 5) {
      es.close();
      fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
    }
  };
</script>
</body>
</html>`)
    return
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(': ok\n\n')
    let id = 0
    const timer = setInterval(() => {
      id++
      res.write(`id: ${id}\ndata: ping\n\n`)
      if (id >= 10) clearInterval(timer)
    }, 500)
    req.on('close', () => clearInterval(timer))
    return
  }

  if (url.pathname === '/report' && req.method === 'POST') {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        sseEventsReceived = parsed.count
        postReceived = true
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }

  res.writeHead(404)
  res.end()
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
const port = (server.address() as AddressInfo).port
const startUrl = `http://127.0.0.1:${port}/set`

let createReceipt: unknown = null
let pageId: string | null = null

try {
  const res = await runner.json<{ ok: boolean; result?: { browserPageId?: string; tabIndex?: number } }>([
    'tab', 'create', '--url', startUrl, '--worktree', worktree,
  ])
  createReceipt = res
  record(probe, 'tab-create', res)
  pageId = res.result?.browserPageId ?? null

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline && !postReceived) {
    await new Promise((r) => setTimeout(r, 500))
  }
} catch (err) {
  createReceipt = { error: String(err) }
  record(probe, 'tab-create-error', { error: String(err) })
} finally {
  if (pageId) {
    try {
      await runner.json(['tab', 'close', '--page', pageId])
    } catch {}
  }
  server.close()
}

const cookieOk = cookieSeen ? 'ok' : 'no'
const sseOk = sseEventsReceived >= 5 ? 'ok' : 'no'
const established = cookieSeen && sseEventsReceived >= 5
const verdict = established ? '成立' : '不成立'
finish(probe, verdict, `cookie=${cookieOk} sse=${sseOk} command="orca tab create --url <url> --worktree <wt>"`)
