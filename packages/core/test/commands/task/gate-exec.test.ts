import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { WinglineError } from '../../../src/errors.js'
import { GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateBody, gateCwd, runGate, writeGateOutput } from '../../../src/commands/task/gate-exec.js'
import { FakeOrca, seedRunningTeam } from '../fake-client.js'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../../..')

const opts = (over: Partial<{ cwd: string; timeoutMs: number }> = {}) => ({ cwd: process.cwd(), timeoutMs: 30_000, ...over })
test('null command passes without spawning', async () => {
  expect(await runGate(null, opts())).toEqual({ passed: true, output: '', timedOut: false })
})
test('exit code decides pass/fail; stdout and stderr are captured in full', async () => {
  expect((await runGate('node -e "process.exit(0)"', opts())).passed).toBe(true)
  const r = await runGate('node -e "console.log(\'hi\'); console.error(\'err\'); process.stdout.write(\'x\'.repeat(6000)); process.exit(1)"', opts())
  expect(r).toMatchObject({ passed: false, timedOut: false })
  expect(r.output).toContain('hi'); expect(r.output).toContain('err'); expect(r.output.length).toBeGreaterThan(6000)
})
test('quotes, &&, and 中文 survive the shell round trip', async () => {
  const r = await runGate('node -e "console.log(\'a \\"b\\" 中文\')" && node -e "process.exit(0)"', opts())
  expect(r).toMatchObject({ passed: true, output: expect.stringContaining('a "b" 中文') })
})
test('runs in the given cwd', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-'))
  expect((await runGate('node -e "process.stdout.write(process.cwd())"', opts({ cwd: dir }))).output).toContain(fs.realpathSync(dir))
})
test('timeout kills the whole process tree, counts as a failure and says so', async () => {
  const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-')), 'pid')
  process.env.WL_PID_FILE = pidFile
  const cmd = 'node -e "const c=require(\'child_process\').spawn(process.execPath,[\'-e\',\'require(\\"fs\\").writeFileSync(process.env.WL_PID_FILE,String(process.pid));setTimeout(()=>{},60000)\'],{stdio:\'ignore\'});setTimeout(()=>{},60000)"'
  const r = await runGate(cmd, opts({ timeoutMs: 1500 }))
  expect(r).toMatchObject({ passed: false, timedOut: true, output: expect.stringContaining('（gate 超时，已终止）') })
  const grandchild = Number(fs.readFileSync(pidFile, 'utf8'))
  await new Promise((res) => setTimeout(res, 300))
  expect(() => process.kill(grandchild, 0)).toThrow()
})
test('a gate that floods its output is killed at the cap, keeping the tail', async () => {
  // 每秒 64 MB 的输出：没有上限时这条 gate 会一直吃到超时（12 秒 ≈ 768 MB）
  const r = await runGate('node -e "setInterval(()=>process.stdout.write(\'x\'.repeat(1048576)),1)"', opts({ timeoutMs: 12_000 }))
  expect(r).toMatchObject({ passed: false, timedOut: false, overflowed: true })
  expect(r.output.length).toBeLessThan(GATE_OUTPUT_LIMIT_BYTES * 1.5)
  expect(r.output.length).toBeGreaterThan(GATE_OUTPUT_LIMIT_BYTES / 2)
  expect(r.output.endsWith('已终止，只保留尾部）')).toBe(true)
})
test('output below the cap is kept whole and not marked', async () => {
  const r = await runGate('node -e "process.stdout.write(\'y\'.repeat(1048576)); process.exit(0)"', opts())
  expect(r).toMatchObject({ passed: true, timedOut: false })
  expect(r.overflowed).toBeUndefined()
  expect(r.output).not.toContain('超过')
})

test('gateCwd: path: selector directly; other selectors via worktree show; unreadable → gate_cwd_unknown', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  expect(await gateCwd(deps, 'builder@duo')).toBe(os.tmpdir())                // seedRunningTeam 给 builder 的是 path:<tmpdir>
  registry.upsertPost({ ...registry.getPost('checker@duo')!, worktree: 'id:w1' })
  o.worktreePaths.set('id:w1', '/repo/wt')
  expect(await gateCwd(deps, 'checker@duo')).toBe('/repo/wt')
  o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'selector_not_found', 'x') })
  await expect(gateCwd(deps, 'checker@duo')).rejects.toMatchObject({ code: 'gate_cwd_unknown' })
})
test('writeGateOutput / gateBody: full output in the file, the tail in --body, one line when multiline is unsafe', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const out = 'head\n' + 'y'.repeat(5000) + '\nTAIL'
  const file = writeGateOutput(home, 'duo', 't1', 0, 1, out)
  expect(file).toBe(path.join(home, 'logs', 'duo', 'gate-t1-0-1.txt'))
  expect(fs.readFileSync(file, 'utf8')).toBe(out)
  const body = gateBody(out, file, true)!
  expect(body.length).toBe(GATE_BODY_LIMIT); expect(body.endsWith('TAIL')).toBe(true)
  expect(gateBody(out, file, false)).toBe(`gate 输出见 ${file}`)
  expect(gateBody('', file, true)).toBeNull()
})

test('the environment is inherited by the gate command', async () => {
  process.env.WL_GATE_ENV = 'from-parent'
  const r = await runGate('node -e "process.stdout.write(process.env.WL_GATE_ENV)"', opts())
  expect(r.output).toContain('from-parent')
})
test('a timeout keeps the output produced so far and appends the marker; a fast command is not marked timed out', async () => {
  const slow = await runGate('node -e "console.log(\'started\'); setTimeout(()=>{},60000)"', opts({ timeoutMs: 1200 }))
  expect(slow).toMatchObject({ passed: false, timedOut: true })
  expect(slow.output).toContain('started'); expect(slow.output).toContain('（gate 超时，已终止）')
  const fast = await runGate('node -e "process.exit(0)"', opts({ timeoutMs: 20_000 }))
  expect(fast).toMatchObject({ passed: true, timedOut: false })
  expect(fast.output).not.toContain('超时')
})
test('a missing cwd fails the gate; it never silently runs in process.cwd()', async () => {
  const r = await runGate('node -e "process.stdout.write(process.cwd())"', opts({ cwd: path.join(os.tmpdir(), 'wl-no-such-dir-xyz') })).catch(() => null)
  expect(r === null || r.passed === false).toBe(true)
  if (r) expect(r.output).not.toContain(process.cwd())
})
test('shell: true appears only in gate-exec.ts, and gate-exec.ts never mentions process.cwd()', () => {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (f.endsWith('.ts') && /shell:\s*true/.test(fs.readFileSync(f, 'utf8'))) found.push(path.relative(repoRoot, f).split(path.sep).join('/'))
    }
  }
  for (const pkg of fs.readdirSync(path.join(repoRoot, 'packages'))) walk(path.join(repoRoot, 'packages', pkg, 'src'))
  expect(found).toEqual(['packages/core/src/commands/task/gate-exec.ts'])
  expect(fs.readFileSync(path.join(repoRoot, 'packages/core/src/commands/task/gate-exec.ts'), 'utf8')).not.toContain('process.cwd()')
})
test('gateCwd: an absolute path: selector never calls worktree show; "current" goes through worktree show', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ ...registry.getPost('builder@duo')!, worktree: 'path:/some/abs/wt' })
  o.orch.length = 0
  expect(await gateCwd(deps, 'builder@duo')).toBe('/some/abs/wt')
  expect(o.callsOf('worktreeShow')).toEqual([])
  registry.upsertPost({ ...registry.getPost('checker@duo')!, worktree: 'current' })
  o.worktreePaths.set('current', '/repo/current')
  expect(await gateCwd(deps, 'checker@duo')).toBe('/repo/current')
})
test('gateCwd: any failure to read the worktree (not only selector_not_found) is gate_cwd_unknown, never process.cwd()', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ ...registry.getPost('checker@duo')!, worktree: 'id:w1' })
  o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await gateCwd(deps, 'checker@duo').catch((e) => e)
  expect(err).toMatchObject({ code: 'gate_cwd_unknown' })
})
test('writeGateOutput creates the directory, overwrites the same name, and removes only gate-*.txt older than 7 days in that directory', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const dir = path.join(home, 'logs', 'duo'); const other = path.join(home, 'logs', 'other-team')
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(other, { recursive: true })
  const old = (f: string, days: number) => { fs.writeFileSync(f, 'x'); const t = new Date(Date.now() - days * 86_400_000); fs.utimesSync(f, t, t) }
  old(path.join(dir, 'gate-old-0-1.txt'), 8)
  old(path.join(dir, 'gate-recent-0-1.txt'), 6)
  old(path.join(dir, 'notes.txt'), 30)
  old(path.join(dir, 'gate-old-0-2.log'), 30)
  old(path.join(other, 'gate-old-0-1.txt'), 30)
  const file = writeGateOutput(home, 'duo', 't1', 0, 1, 'first')
  expect(fs.readdirSync(dir).sort()).toEqual(['gate-recent-0-1.txt', 'gate-t1-0-1.txt', 'gate-old-0-2.log', 'notes.txt'].sort())
  expect(fs.readdirSync(other)).toEqual(['gate-old-0-1.txt'])
  expect(writeGateOutput(home, 'duo', 't1', 0, 1, 'second')).toBe(file)
  expect(fs.readFileSync(file, 'utf8')).toBe('second')
})
test('writeGateOutput into a fresh home creates logs/<team>', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const file = writeGateOutput(home, 'solo', 't9', 2, 3, 'out')
  expect(file).toBe(path.join(home, 'logs', 'solo', 'gate-t9-2-3.txt'))
  expect(fs.readFileSync(file, 'utf8')).toBe('out')
})
test('gateBody: short output is returned whole; a long single-line output is tailed even when multiline is unsafe', () => {
  expect(gateBody('short\nout', '/f', true)).toBe('short\nout')
  const one = 'z'.repeat(GATE_BODY_LIMIT + 50)
  expect(gateBody(one, '/f', false)).toBe(one.slice(-GATE_BODY_LIMIT))
  expect(gateBody('a\nb', '/f', false)).toBe('gate 输出见 /f')
  expect(GATE_BODY_LIMIT).toBe(4000)
})
