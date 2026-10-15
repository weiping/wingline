import { expect, test } from 'vitest'
import { renderBriefing } from '../../src/brief/render.js'
import type { TeamSpec } from '../../src/spec/load.js'

const postDefaults = { selfClaim: false, tags: [], planFirst: false, gate: null, reviewedBy: [], handsTo: [] }
const spec: TeamSpec = {
  version: 1,
  name: 'duo',
  repo: 'path:/r',
  normsPath: '/t/NORMS.md',
  lead: 'builder',
  posts: [
    { id: 'builder', agent: 'claude', launch: 'claude', worktree: 'current', briefPaths: ['/t/briefs/builder.md'], ...postDefaults },
    { id: 'checker', agent: 'codex', launch: 'codex', worktree: 'current', briefPaths: ['/t/briefs/c1.md', '/t/briefs/c2.md'], ...postDefaults },
  ],
  budgets: { task: { maxGateFailures: 3, gateTimeoutSeconds: 600, maxMinutes: null } },
  dir: '/t',
  specPath: '/t/team.yaml',
}
const files: Record<string, string> = {
  '/t/NORMS.md': 'NORMS 内容',
  '/t/briefs/builder.md': 'builder brief 内容',
  '/t/briefs/c1.md': 'checker brief 内容一',
  '/t/briefs/c2.md': 'checker brief 内容二',
}
const fakeRead = (p: string) => files[p]!

test('sections in fixed order', () => {
  const t = renderBriefing(spec, 'checker', fakeRead)
  const idx = ['你是 checker@duo', '团队名册', 'NORMS 内容', 'checker brief 内容一', 'checker brief 内容二', 'wl send <地址>'].map((s) => t.indexOf(s))
  expect(idx.every((i) => i >= 0)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
})

test('roster lists every post with agent and marks the lead', () => {
  const t = renderBriefing(spec, 'checker', fakeRead)
  expect(t).toContain('builder@duo（牵头）')
  expect(t).toMatch(/checker@duo.*codex/)
  expect(t).not.toContain('checker@duo（牵头）')
})

test('does not include other posts\' briefs', () => {
  expect(renderBriefing(spec, 'checker', fakeRead)).not.toContain('builder brief 内容')
})

test('unknown post is an input error', () => {
  expect(() => renderBriefing(spec, 'ghost', fakeRead)).toThrow(expect.objectContaining({ kind: 'input', code: 'post_unknown' }))
})

test('exactly 12000 chars is allowed; over is an input error', () => {
  const sized = (n: number) => {
    const base = renderBriefing(spec, 'builder', () => '').length
    return renderBriefing(spec, 'builder', (p) => (p === '/t/NORMS.md' ? 'x'.repeat(n - base) : ''))
  }
  expect(sized(12000)).toHaveLength(12000)
  expect(() => sized(12001)).toThrow(expect.objectContaining({ kind: 'input', code: 'briefing_too_long' }))
})
