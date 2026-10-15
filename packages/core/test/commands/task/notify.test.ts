import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { WinglineError } from '../../../src/errors.js'
import { classifyPreview, neutralize, notifyPost, screenGuard } from '../../../src/commands/task/notify.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../../..')

const r6 = JSON.parse(fs.readFileSync(path.join(repoRoot, 'test/fixtures/receipts/orchestration-r6.json'), 'utf8'))
test('R6 real screens: the (Y/n) wrapper prompt is at_prompt, the idle claude screen is clear', () => {
  expect(classifyPreview(r6['terminal-show-at-yn-prompt'].terminal.preview)).toBe('at_prompt')
  expect(classifyPreview(r6['terminal-show-idle-claude'].terminal.preview)).toBe('clear')
})
test.each([
  'Do you want to proceed?', '❯ 1. Yes', '  › 2) No, and tell Claude what to do', 'Allow this command to run', '[y/N]', '(yes/no)',
  'Press Enter to continue', 'Esc to cancel', 'Do you trust the files in this folder', 'Continue?', 'Overwrite existing file? ',
])('prompt pattern: %s → at_prompt', (line) => {
  expect(classifyPreview(`some output\n${line}`)).toBe('at_prompt')
})
test('a terminal back at a shell prompt is unknown, never clear (typing there would run a command); agent input lines are not shell prompts', () => {
  expect(classifyPreview('build done\nUSER@Mac-mini wingline % ')).toBe('unknown')
  expect(classifyPreview('user@host:~/repo$ ')).toBe('unknown')
  expect(classifyPreview('root@box:/# ')).toBe('unknown')
  expect(classifyPreview('PS C:\\repo> ')).toBe('unknown')
  expect(classifyPreview('──────\n❯ \n──────\n⏵⏵ auto mode on')).toBe('clear')
})
test('neutralize defuses shell metacharacters and control characters in interpolated text', () => {
  expect(neutralize('修 $(rm -rf ~); `id` | a && b > c\n下一行\u0007', 200)).toBe('修 ＄(rm -rf ~)； ｀id｀ ｜ a ＆＆ b ＞ c 下一行')
  expect(neutralize('x'.repeat(100), 80)).toBe('x'.repeat(80) + '…')
})
test('only the last 8 lines count; empty preview is unknown', () => {
  expect(classifyPreview(['Do you want to proceed?', ...Array(8).fill('working…')].join('\n'))).toBe('clear')
  expect(classifyPreview('')).toBe('unknown')
  expect(classifyPreview('\n\n')).toBe('unknown')
})
test('notifyPost types only when the screen is clear; turn_started → notified, input only → notified_unconfirmed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(await notifyPost(deps, 'checker@duo', '[雁阵] 你有新任务 t1')).toEqual({ outcome: 'notified' })
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: '[雁阵] 你有新任务 t1' })
  o.sendStages = ['input_accepted']
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'notified_unconfirmed' })
})
test('notifyPost does not type at a prompt, on an unreadable screen, or to an offline post — and never throws', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'Do you want to run this command?\n❯ 1. Yes\n  2. No')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'at_prompt' })
  o.previews.set('term-c', '')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'screen_unknown' })
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'post_offline' })
  expect(o.sent).toEqual([])
})
test('a send failure is reported, not thrown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.failSendOnce = new WinglineError('uncertain', 'orca_timeout', 't')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'send_failed' })
})

test('screenGuard: missing terminal → offline; show fails → unknown; idle → clear; prompt → at_prompt', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(await screenGuard(deps, 'term-gone')).toBe('offline')
  o.faults.push({ method: 'terminalShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  expect(await screenGuard(deps, 'term-c')).toBe('unknown')
  expect(await screenGuard(deps, 'term-c')).toBe('clear')
  o.previews.set('term-c', 'Continue? (y/n)')
  expect(await screenGuard(deps, 'term-c')).toBe('at_prompt')
})
test('a question mark at the end of any of the last 8 lines is a prompt', () => {
  expect(classifyPreview('working…\nShould I delete the file?\n')).toBe('at_prompt')
  expect(classifyPreview(['Do you want to proceed?', ...Array(7).fill('working…')].join('\n'))).toBe('at_prompt')
})
test('neutralize maps every metacharacter to its full-width twin and strips control characters', () => {
  expect(neutralize('a`b$c;d|e&f<g>h\\i', 100)).toBe('a｀b＄c；d｜e＆f＜g＞h＼i')
  expect(neutralize('a\nb\u0007c\u0000d', 100)).toBe('a bcd')
  expect(neutralize('', 10)).toBe('')
  expect(neutralize('short', 10)).toBe('short')
})
test('notifyPost never throws: ambiguous duplicate terminals and a failing terminalShow both come back as not_notified', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dup', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect((await notifyPost(deps, 'checker@duo', 'x')).outcome).toBe('not_notified')
  o.terminals = o.terminals.filter((t) => t.handle !== 'term-dup')
  o.faults.push({ method: 'terminalShow', when: 'before', error: new Error('boom') })
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'screen_unknown' })
  expect(o.sent).toEqual([])
})
test('a send failure is also logged through deps.warn', async () => {
  const o = new FakeOrca(); const { deps, warnings } = seedRunningTeam(o)
  o.failSendOnce = new Error('boom')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'send_failed' })
  expect(warnings).toHaveLength(1)
})
test('notifyPost does not type at a terminal that fell back to a shell prompt', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'agent exited\nuser@host:~/repo$ ')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'screen_unknown' })
  expect(o.sent).toEqual([])
})
