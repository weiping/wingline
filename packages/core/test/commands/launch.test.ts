import { expect, test } from 'vitest'
import { up } from '../../src/commands/up.js'
import { BRIEFING_LIMIT, renderBriefing } from '../../src/brief/render.js'
import { WinglineError } from '../../src/errors.js'
import { loadTeamSpec } from '../../src/spec/load.js'
import { DUO_YAML, mkTeam } from '../spec/helpers.js'
import { FakeOrca, mkDeps } from './fake-client.js'

const duo = () => mkTeam(DUO_YAML)

test('wl up writes a fresh marker before sending and the brief carries it on the line after the first', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  const marker = registry.getPost('builder@duo')!.sessionMarker!
  expect(marker).toMatch(/^WLS-[0-9a-f]{8}$/)
  const brief = o.sent.find((s) => s.handle === o.terminals.find((t) => t.title === 'builder@duo')!.handle)!.text
  expect(brief.split('\n')[1]).toBe(`会话标记：${marker}（雁阵用它在重启后找回本会话，无需理会）`)
})

test('on .cmd (multilineSafe false) the one-line pointer ends with the marker', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o, { multilineSafe: false })
  await up(deps, { specPath: duo() })
  expect(o.sent[0]!.text).toMatch(/^请先完整阅读 .+，这是你的岗位说明。（会话标记 WLS-[0-9a-f]{8}）$/)
})

test('rerunning an interrupted launch of the same generation keeps the marker', async () => {
  const o = new FakeOrca()
  o.failSendOnce = new WinglineError('uncertain', 'terminal_send_unconfirmed', '发送未获确认')
  const { deps, registry } = mkDeps(o)
  const p = duo()
  await up(deps, { specPath: p })
  const first = registry.getPost('builder@duo')!.sessionMarker!
  expect(first).toMatch(/^WLS-[0-9a-f]{8}$/)
  await up(deps, { specPath: p })
  expect(registry.getPost('builder@duo')!.sessionMarker).toBe(first)
  const sends = o.sent.filter((s) => s.handle === 'term-1')
  const resent = sends[sends.length - 1]!.text
  expect(resent).toContain(first)
})

test('a brief that only exceeds the limit because of the marker line is rejected with briefing_too_long', async () => {
  const o = new FakeOrca()
  // NORMS 内容 trim 后逐字符进入启动包，探针定基准即可把渲染结果精确填到 LIMIT - 10
  const base = renderBriefing(loadTeamSpec(mkTeam(DUO_YAML, { files: { 'NORMS.md': '' } })), 'builder').length
  const p = mkTeam(DUO_YAML, { files: { 'NORMS.md': 'x'.repeat(BRIEFING_LIMIT - 10 - base) } })
  expect(renderBriefing(loadTeamSpec(p), 'builder').length).toBe(BRIEFING_LIMIT - 10)
  await expect(up(mkDeps(o).deps, { specPath: p })).rejects.toMatchObject({ code: 'briefing_too_long' })
  expect(o.calls).not.toContain('terminalCreate')
})
