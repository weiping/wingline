import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { send } from '../../src/commands/send.js'
import { WinglineError } from '../../src/errors.js'
import { FakeOrca, mkDeps } from './fake-client.js'

function seeded(orca: FakeOrca, over = {}) {
  const m = mkDeps(orca, over)
  m.registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  m.registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'old', status: 'live', isLead: false, sessionMarker: null, sessionId: null, sessionAt: null })
  orca.terminals = [{ handle: 'c1', title: 'checker@duo', connected: true, worktreeId: 'w' }]
  return m
}

test('send delivered when stages include turn_started', async () => {
  const o = new FakeOrca()
  const r = await send(seeded(o).deps, { address: 'checker@duo', message: '你好' })
  expect(r).toEqual({ address: 'checker@duo', outcome: 'delivered', handle: 'c1' })
  expect(o.calls).toEqual(['version', 'status', 'terminalList', 'terminalSend'])
})

test('send input_only throws uncertain, records it, and never resends', async () => {
  const o = new FakeOrca()
  o.sendStages = ['input_accepted']
  const { deps, registry } = seeded(o)
  await expect(send(deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({ kind: 'uncertain', code: 'send_unconfirmed' })
  expect(o.sent).toHaveLength(1)
  expect(registry.getRequest('duo:checker:send:' + createHash('sha256').update('hi').digest('hex').slice(0, 8))!.state).toBe('uncertain')
})

test("an unconfirmed send names Orca's request id so the delivery can be confirmed without resending", async () => {
  const o = new FakeOrca()
  o.sendStages = ['input_accepted']
  await expect(send(seeded(o).deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({
    code: 'send_unconfirmed',
    hint: expect.stringContaining('req-1'),
  })
})

test('--retry-request is forwarded to Orca and the same ledger row is resolved once confirmed', async () => {
  const o = new FakeOrca()
  o.sendStages = ['input_accepted']
  const { deps, registry } = seeded(o)
  const key = 'duo:checker:send:' + createHash('sha256').update('hi').digest('hex').slice(0, 8)
  await expect(send(deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({ code: 'send_unconfirmed' })
  o.sendStages = ['input_accepted', 'turn_started']
  const r = await send(deps, { address: 'checker@duo', message: 'hi', retryRequest: 'req-1' })
  expect(r.outcome).toBe('delivered')
  expect(o.sent[1]!.retryRequest).toBe('req-1')
  expect(o.sent[0]!.retryRequest).toBeUndefined()
  expect(registry.getRequest(key)!.state).toBe('done')
  expect(registry.getRequest(`${key}-1`)).toBeNull()
})

test('an unconfirmed send tells the user the exact wl command to confirm it', async () => {
  const o = new FakeOrca()
  o.sendStages = ['input_accepted']
  await expect(send(seeded(o).deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({
    hint: expect.stringContaining('wl send checker@duo <同一条消息> --retry-request req-1'),
  })
})

test('retrying an unconfirmed send reuses its ledger row; after delivery a repeat opens a new row', async () => {
  const o = new FakeOrca()
  o.sendStages = ['input_accepted']
  const { deps, registry } = seeded(o)
  const key = 'duo:checker:send:' + createHash('sha256').update('hi').digest('hex').slice(0, 8)
  await expect(send(deps, { address: 'checker@duo', message: 'hi' })).rejects.toBeTruthy()
  await expect(send(deps, { address: 'checker@duo', message: 'hi' })).rejects.toBeTruthy()
  expect(registry.getRequest(`${key}-1`)).toBeNull()
  o.sendStages = ['input_accepted', 'turn_started']
  await send(deps, { address: 'checker@duo', message: 'hi' })
  await send(deps, { address: 'checker@duo', message: 'hi' })
  expect(registry.getRequest(key)!.state).toBe('done')
  expect(registry.getRequest(`${key}-1`)!.state).toBe('done')
})

test("the ledger keeps Orca's own request id from the receipt", async () => {
  const o = new FakeOrca()
  const { deps, registry } = seeded(o)
  await send(deps, { address: 'checker@duo', message: 'hi' })
  const key = 'duo:checker:send:' + createHash('sha256').update('hi').digest('hex').slice(0, 8)
  expect(registry.getRequest(key)!.receipt).toContain('"requestId":"req-1"')
})

test('send passes the message verbatim incl. quotes, newline, 中文', async () => {
  const o = new FakeOrca()
  const msg = 'a "b"\n第二行 %PATH% ^ & |'
  await send(seeded(o).deps, { address: 'checker@duo', message: msg })
  expect(o.sent[0]!.text).toBe(msg)
})

test('stale handle is re-located once', async () => {
  const o = new FakeOrca()
  o.failSendOnce = new WinglineError('orca', 'terminal_handle_stale', 'stale')
  const { deps, registry } = seeded(o)
  const r = await send(deps, { address: 'checker@duo', message: 'hi' })
  expect(r.outcome).toBe('delivered')
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(2)
  expect(o.sent).toHaveLength(2)
  expect(registry.getPost('checker@duo')!.handle).toBe('c1')
})

test('stale handle twice is reported, not looped', async () => {
  const o = new FakeOrca()
  const stale = new WinglineError('orca', 'terminal_handle_stale', 'stale')
  o.terminalSend = async () => { o.calls.push('terminalSend'); throw stale }
  await expect(send(seeded(o).deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({ code: 'terminal_handle_stale' })
  expect(o.calls.filter((c) => c === 'terminalSend')).toHaveLength(2)
})

test('multiline message when multilineSafe is false is an input error with hint', async () => {
  const o = new FakeOrca()
  await expect(send(seeded(o, { multilineSafe: false }).deps, { address: 'checker@duo', message: 'a\nb' })).rejects.toMatchObject({
    kind: 'input', code: 'multiline_unsupported', hint: expect.stringContaining('单行'),
  })
  expect(o.calls).toEqual([])
})

test('message over 4000 chars is an input error before any orca call', async () => {
  const o = new FakeOrca()
  await expect(send(seeded(o).deps, { address: 'checker@duo', message: 'x'.repeat(4001) })).rejects.toMatchObject({ code: 'message_too_long' })
  expect(o.calls).toEqual([])
})

test('unknown address is an input error', async () => {
  const o = new FakeOrca()
  await expect(send(seeded(o).deps, { address: 'ghost@duo', message: 'hi' })).rejects.toMatchObject({ kind: 'input', code: 'post_unknown' })
  expect(o.calls).toEqual([])
})

test('a post with no terminal is an input error pointing at wl up', async () => {
  const o = new FakeOrca()
  const { deps } = seeded(o)
  o.terminals = []
  await expect(send(deps, { address: 'checker@duo', message: 'hi' })).rejects.toMatchObject({ kind: 'input', code: 'post_offline', hint: expect.stringContaining('wl up') })
})
