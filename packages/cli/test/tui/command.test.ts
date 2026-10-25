import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { expect, test, vi } from 'vitest'
import type { CommandDeps, TeamRow } from '@weiping/wingline-core'
import { run, type Commands } from '../../src/cli.js'
import { tuiCmd } from '../../src/tui/command.js'
import { pickTeam } from '../../src/tui/views/picker.js'

class Out extends Writable {
  isTTY: boolean
  columns: number
  rows = 24
  chunks: string[] = []
  constructor(tty = true, columns = 80) {
    super()
    this.isTTY = tty
    this.columns = columns
  }
  _write(chunk: Buffer | string, _e: BufferEncoding, cb: () => void) { this.chunks.push(String(chunk)); cb() }
}
class In extends EventEmitter {
  isTTY: boolean
  raw: boolean[] = []
  constructor(tty = true) {
    super()
    this.isTTY = tty
  }
  setRawMode(b: boolean) { this.raw.push(b); return this }
  resume() { return this }
  pause() { return this }
  setEncoding() { return this }
  press(s: string) { this.emit('data', s) }
}

const team = (name: string, status: TeamRow['status'] = 'up'): TeamRow => ({ name, specPath: `/t/${name}.yaml`, specHash: 'h', runId: 'r', coordinatorHandle: 'c', status })
const depsOf = (teams: TeamRow[]) => ({ registry: { listTeams: () => teams, getTeam: (n: string) => teams.find((t) => t.name === n) ?? null } }) as unknown as CommandDeps
// 这几个测试不关心平台：固定成 linux，免得在 Windows 上走到“终端可能不支持 VT”的分支（那条有专门的测试）
const tui = (deps: CommandDeps, a: Parameters<typeof tuiCmd>[1]) => tuiCmd(deps, { platform: 'linux', env: {}, ...a })
const ioOf = (o: { stdin?: In; stdout?: Out } = {}) => ({ stdin: (o.stdin ?? new In()) as never, stdout: (o.stdout ?? new Out()) as never })

test('not a TTY → tui_not_tty (input error), before touching the registry', async () => {
  const deps = { registry: { listTeams: () => { throw new Error('should not be read') } } } as unknown as CommandDeps
  await expect(tuiCmd(deps, { io: ioOf({ stdout: new Out(false) }) })).rejects.toMatchObject({ kind: 'input', code: 'tui_not_tty' })
  await expect(tuiCmd(deps, { io: ioOf({ stdin: new In(false) }) })).rejects.toMatchObject({ kind: 'input', code: 'tui_not_tty' })
})

test('a TTY that reports zero columns → tui_unsupported_terminal', async () => {
  await expect(tuiCmd(depsOf([team('duo')]), { io: ioOf({ stdout: new Out(true, 0) }) })).rejects.toMatchObject({ kind: 'input', code: 'tui_unsupported_terminal' })
})

test('no team argument: one team enters directly, several show the picker, none → team_unknown', async () => {
  const run = vi.fn(async () => {})
  const pick = vi.fn(async () => 'b')
  await tui(depsOf([team('only')]), { io: ioOf(), run: run as never, pick })
  expect(run).toHaveBeenLastCalledWith(expect.anything(), 'only', expect.anything(), expect.anything())
  expect(pick).not.toHaveBeenCalled()

  await tui(depsOf([team('a'), team('b')]), { io: ioOf(), run: run as never, pick })
  expect(pick).toHaveBeenCalledOnce()
  expect(run).toHaveBeenLastCalledWith(expect.anything(), 'b', expect.anything(), expect.anything())

  await expect(tui(depsOf([]), { io: ioOf(), run: run as never, pick })).rejects.toMatchObject({ code: 'team_unknown' })
})

test('leaving the picker without a choice ends quietly', async () => {
  const run = vi.fn(async () => {})
  await tui(depsOf([team('a'), team('b')]), { io: ioOf(), run: run as never, pick: async () => null })
  expect(run).not.toHaveBeenCalled()
})

test('a team name that is not registered → team_unknown', async () => {
  await expect(tui(depsOf([team('duo')]), { team: 'ghost', io: ioOf(), run: vi.fn() as never })).rejects.toMatchObject({ code: 'team_unknown' })
  const run = vi.fn(async () => {})
  await tui(depsOf([team('duo')]), { team: 'duo', io: ioOf(), run: run as never })
  expect(run).toHaveBeenCalledOnce()
})

test('on win32 without WT_SESSION/TERM_PROGRAM a warning is printed and the TUI still starts', async () => {
  const run = vi.fn(async () => {})
  const warn = vi.fn()
  await tuiCmd(depsOf([team('duo')]), { io: ioOf(), run: run as never, platform: 'win32', env: {}, warn })
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('Windows Terminal'))
  expect(run).toHaveBeenCalledOnce()

  const quiet = vi.fn()
  await tuiCmd(depsOf([team('duo')]), { io: ioOf(), run: run as never, platform: 'win32', env: { WT_SESSION: 'x' }, warn: quiet })
  await tuiCmd(depsOf([team('duo')]), { io: ioOf(), run: run as never, platform: 'win32', env: { TERM_PROGRAM: 'vscode' }, warn: quiet })
  await tuiCmd(depsOf([team('duo')]), { io: ioOf(), run: run as never, platform: 'linux', env: {}, warn: quiet })
  expect(quiet).not.toHaveBeenCalled()
})

test('pickTeam: arrows move, Enter chooses, q or Esc leaves with null', async () => {
  const teams = [team('a'), team('b', 'stopped'), team('c')]
  const stdin = new In()
  const stdout = new Out()
  const chosen = pickTeam(teams, { stdin: stdin as never, stdout: stdout as never })
  await new Promise((r) => setTimeout(r, 5))
  expect(stdout.chunks.join('')).toContain('b')
  stdin.press('\x1b[B')
  stdin.press('j')
  stdin.press('\x1b[A')
  stdin.press('\r')
  expect(await chosen).toBe('b')
  expect(stdin.raw).toEqual([true, false])
  expect(stdout.chunks.join('').endsWith('\x1b[?1049l')).toBe(true)

  for (const k of ['q', '\x1b', '\x03']) {
    const s = new In()
    const p = pickTeam(teams, { stdin: s as never, stdout: new Out() as never })
    await new Promise((r) => setTimeout(r, 5))
    s.press(k)
    expect(await p).toBeNull()
  }
})

function cliIo() {
  const err: string[] = []
  const stdout = new PassThrough()
  const stderr = new PassThrough().on('data', (d) => err.push(String(d)))
  return { io: { stdout, stderr, env: {} as NodeJS.ProcessEnv }, err: () => err.join('') }
}
const noopCommands = (tui: Commands['tui']) => ({ tui }) as unknown as Commands
const fakeMakeDeps = () => ({ registry: { close: () => {}, listTeams: () => [] } }) as unknown as CommandDeps

test('wl tui outside a TTY exits 1 with tui_not_tty', async () => {
  const h = cliIo()
  const code = await run(['tui'], h.io, noopCommands(tuiCmd), fakeMakeDeps)
  expect(code).toBe(1)
  expect(h.err()).toContain('wl tui 需要在交互式终端里运行')
})

test('wl tui [team] passes the team name through', async () => {
  const seen: unknown[] = []
  const h = cliIo()
  const code = await run(['tui', 'duo'], h.io, noopCommands((async (_d: unknown, a: { team?: string }) => { seen.push(a.team); return {} }) as never), fakeMakeDeps)
  expect(code).toBe(0)
  expect(seen).toEqual(['duo'])
  await run(['tui'], cliIo().io, noopCommands((async (_d: unknown, a: { team?: string }) => { seen.push(a.team); return {} }) as never), fakeMakeDeps)
  expect(seen).toEqual(['duo', undefined])
})
