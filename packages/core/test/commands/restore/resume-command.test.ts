import { expect, test } from 'vitest'
import { resumeCommand, supportsResume } from '../../../src/commands/restore/resume-command.js'

test('claude keeps every launch flag and appends --resume', () => {
  expect(resumeCommand('claude', 'claude --dangerously-skip-permissions --model opus', 'a1-b2')).toBe('claude --dangerously-skip-permissions --model opus --resume a1-b2')
})

test('unsupported agents return null', () => {
  expect(resumeCommand('gemini', 'gemini', 'x')).toBeNull()
  expect(supportsResume('gemini')).toBe(false)
  expect(supportsResume('claude')).toBe(true)
})

test('session ids with shell metacharacters are rejected', () => {
  expect(() => resumeCommand('claude', 'claude', 'x; rm -rf ~')).toThrow(expect.objectContaining({ code: 'session_override_invalid' }))
})

test('codex follows the probe result (pending probe)', () => {
  // Task 1 真机探针未定案：按 spec §5.3 退路，Codex 归为"无接回能力"
  expect(resumeCommand('codex', 'codex --model gpt-6-astra', 'sess-1')).toBeNull()
  expect(supportsResume('codex')).toBe(false)
})
