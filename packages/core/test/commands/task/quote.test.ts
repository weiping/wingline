import { expect, test } from 'vitest'
import { createTask } from '../../../src/commands/task/create.js'
import { shellQuote } from '../../../src/commands/task/quote.js'
import { WinglineError } from '../../../src/errors.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

// —— Windows：重跑命令的引号按平台 ——
test('Windows: shellQuote takes the platform — POSIX single quotes on posix, a cmd/PowerShell-pasteable double-quoted form on win32', () => {
  expect(shellQuote("it's here", 'linux')).toBe("'it'\\''s here'")
  expect(shellQuote("it's here", 'darwin')).toBe("'it'\\''s here'")
  const win = shellQuote('say "hi" now', 'win32')
  expect(win.startsWith('"') && win.endsWith('"')).toBe(true)
  expect(win).not.toContain("'")
  expect(shellQuote('plain title', 'win32')).toBe('"plain title"')
})
test('Windows: the create and escalate retry hints use the platform quoting', async () => {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')!
  const uncertain = () => new WinglineError('uncertain', 'orca_timeout', 't')
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
    o.faults.push({ method: 'taskCreate', when: 'after', error: uncertain() }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
    const err = await createTask(deps, { team: 'duo', title: "it's a title" }).catch((e) => e)
    expect(err.hint).toContain('--title "it\'s a title"')
    expect(err.hint).not.toContain("'it")
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
})

