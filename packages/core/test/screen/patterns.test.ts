import { expect, test } from 'vitest'
import { detectScreen, SIGNAL_TAIL_LINES } from '../../src/screen/patterns.js'
import { sample } from './samples.js'

const NOW = new Date('2026-10-16T09:00:00+08:00')
const claude = (text: string) => detectScreen('claude', text, NOW)

test('claude context-low sample → context_low 7 with the footer line as notice and a 12-hex hash (provisional)', () => {
  const r = claude(sample('claude-context-low'))
  expect(r.signals).toHaveLength(1)
  expect(r.signals[0]).toMatchObject({ kind: 'context_low', percent: 7, notice: 'Context low (7% remaining) · Run /compact to compact & continue' })
  expect(r.signals[0]!.noticeHash).toMatch(/^[0-9a-f]{12}$/)
  expect(r.guard).toBe('clear')
})

test('claude usage-limit sample → usage_limit with the parsed reset time and no auto-continue (provisional)', () => {
  const r = claude(sample('claude-usage-limit'))
  expect(r.signals).toEqual([expect.objectContaining({ kind: 'usage_limit', autoResume: null, notice: expect.stringMatching(/^⎿\s+You've hit your session limit|^You've hit your session limit/) })])
  expect((r.signals[0] as { resetsAt: Date | null }).resetsAt?.toISOString()).toBe(new Date('2026-10-16T15:00:00+08:00').toISOString())
})

test('auto-continue banner → autoResume armed; "Automatic continue cancelled" → cancelled (provisional)', () => {
  expect(claude(sample('claude-usage-limit-auto-resume')).signals[0]).toMatchObject({ kind: 'usage_limit', autoResume: 'armed' })
  expect(claude(sample('claude-usage-limit-cancelled')).signals[0]).toMatchObject({ kind: 'usage_limit', autoResume: 'cancelled' })
})

test('quoted or mid-line mentions in the conversation do not trigger (provisional)', () => {
  expect(claude(sample('claude-quoted-text')).signals).toEqual([])
})

test('a footer truncated by a narrow pane ("Context low (1…") does not trigger, nor does a percentage that is not a number', () => {
  expect(claude('x\n  Context low (1…\n❯').signals).toEqual([])
  expect(claude('x\n  Context low (soon% remaining)\n❯').signals).toEqual([])
})

test('only the last SIGNAL_TAIL_LINES lines count, and the bottom-most match of a kind wins', () => {
  expect(SIGNAL_TAIL_LINES).toBe(40)
  const filler = Array.from({ length: 45 }, (_, i) => `line ${i}`)
  expect(claude(['  Context low (3% remaining)', ...filler].join('\n')).signals).toEqual([])
  expect(claude(['  Context low (3% remaining)', ...filler.slice(0, 5), '  Context low (9% remaining)', 'x'].join('\n')).signals[0]).toMatchObject({ percent: 9 })
})

test('a context_low line and a usage_limit line on one screen give both signals, context_low first', () => {
  const r = claude("  ⎿  You've hit your weekly limit · resets Oct 20, 3pm\n  Context low (4% remaining)\n❯")
  expect(r.signals.map((s) => s.kind)).toEqual(['context_low', 'usage_limit'])
})

test('unknown agent yields guard only; guard still looks at the last 8 lines (same as classifyPreview)', () => {
  expect(detectScreen('codex', sample('claude-context-low'), NOW).signals).toEqual([])
  expect(claude('Do you want to proceed?\n❯ 1. Yes').guard).toBe('at_prompt')
  expect(claude('').guard).toBe('unknown')
})

test('CRLF text gives exactly the same result as LF', () => {
  for (const name of ['claude-context-low', 'claude-usage-limit', 'claude-usage-limit-auto-resume', 'claude-quoted-text']) {
    expect(claude(sample(name, { crlf: true }))).toEqual(claude(sample(name)))
  }
})

test('the notice hash is stable for the same line and differs for a different reset time', () => {
  const a = claude("  ⎿  You've hit your session limit · resets 3pm (Asia/Shanghai)").signals[0]!
  expect(a.noticeHash).toBe(claude("  ⎿  You've hit your session limit · resets 3pm (Asia/Shanghai)").signals[0]!.noticeHash)
  expect(a.noticeHash).not.toBe(claude("  ⎿  You've hit your session limit · resets 4pm (Asia/Shanghai)").signals[0]!.noticeHash)
})
