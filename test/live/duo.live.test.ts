// 真机集成测试：需要本机已安装并运行 Orca，并会在其中创建/关闭终端。
// 运行：WINGLINE_LIVE_WORKTREE=<Orca worktree 选择器> [WINGLINE_LIVE_BUILDER_LAUNCH=<命令>] [WINGLINE_LIVE_CHECKER_LAUNCH=<命令>] pnpm test:live
// 两个 LAUNCH 都换成非 agent 命令时，同时设 WINGLINE_LIVE_EXPECT_SEND=unconfirmed（非 agent 观察不到“开始处理”，send 只能是 send_unconfirmed）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { expect, test } from 'vitest'
import { defaultMakeDeps, run } from '../../packages/cli/src/cli.js'

const ROOT = path.resolve(__dirname, '../..')

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-live-'))
  const team = path.join(dir, 'duo')
  fs.cpSync(path.join(ROOT, 'teams/duo'), team, { recursive: true })
  const worktree = process.env.WINGLINE_LIVE_WORKTREE ?? 'current'
  const yaml = path.join(team, 'team.yaml')
  let text = fs.readFileSync(yaml, 'utf8').replaceAll('worktree: current', `worktree: ${worktree}`)
  // 本机没有 codex 时，用 WINGLINE_LIVE_CHECKER_LAUNCH 换掉 checker 的启动命令
  const checker = process.env.WINGLINE_LIVE_CHECKER_LAUNCH
  if (checker) text = text.replace(/    launch: .*\n/, `    launch: '${checker}'\n`)
  // CI 上没有已登录的 agent：用一个只读 stdin 的 node 进程占位 builder
  const builder = process.env.WINGLINE_LIVE_BUILDER_LAUNCH
  if (builder) text = text.replace('    agent: claude\n    model: opus\n', `    agent: claude\n    launch: '${builder}'\n`)
  fs.writeFileSync(yaml, text)
  return { yaml, env: { ...process.env, WINGLINE_HOME: path.join(dir, 'home') } }
}

async function wl(argv: string[], env: NodeJS.ProcessEnv) {
  const out: string[] = []
  const stdout = new PassThrough().on('data', (d) => out.push(String(d)))
  const code = await run(argv, { stdout, stderr: new PassThrough(), env })
  return { code, json: JSON.parse(out.join('')) as { ok: boolean; result?: any; error?: any } }
}

test('spec 7.10 acceptance 1–5: up → up again → ps → send → down --close', async () => {
  const { yaml, env } = sandbox()
  try {
    const titles = async () => (await defaultMakeDeps(env, () => {}).orca.terminalList()).map((t) => t.title)

    const first = await wl(['up', yaml, '--json'], env)
    expect(first.json.result.posts.map((p: any) => p.outcome)).toEqual(['launched', 'launched'])
    expect(await titles()).toEqual(expect.arrayContaining(['builder@duo', 'checker@duo']))

    const before = (await titles()).length
    const second = await wl(['up', yaml, '--json'], env)
    expect(second.json.result.posts.map((p: any) => p.outcome)).toEqual(['already_live', 'already_live'])
    expect((await titles()).length).toBe(before)

    const listed = await wl(['ps', 'duo', '--json'], env)
    expect(listed.json.result.map((r: any) => r.status)).toEqual(['live', 'live'])

    // 岗位刚收到启动包时通常还在干活：此时只能“输入”而观察不到新一轮开始，wl send 按设计报 send_unconfirmed（退出码 3）。
    // 空闲时必须是 delivered（已用空闲的 Claude 单独验证过）。两种结果都证明 send 没有重发、没有误报。
    const deps = defaultMakeDeps(env, () => {})
    const checker = (await deps.orca.terminalList()).find((t) => t.title === 'checker@duo')!
    const expectUnconfirmed = process.env.WINGLINE_LIVE_EXPECT_SEND === 'unconfirmed'
    const idle = (await deps.orca.terminalWait({ handle: checker.handle, forState: 'tui-idle', timeoutMs: 30_000 })).satisfied
    const sent = await wl(['send', 'checker@duo', '你好', '--json'], env)
    if (idle && !expectUnconfirmed) expect(sent.json).toMatchObject({ ok: true, result: { outcome: 'delivered' } })
    else expect(sent.json).toMatchObject({ ok: false, error: { code: 'send_unconfirmed' } })

    const closed = await wl(['down', 'duo', '--close', '--json'], env)
    expect(closed.json.result.posts.map((p: any) => p.outcome)).toEqual(['closed', 'closed'])
    expect(await titles()).not.toEqual(expect.arrayContaining(['builder@duo']))
  } finally {
    // 失败时也别把终端留在 Orca 里
    await wl(['down', 'duo', '--close', '--json'], env).catch(() => {})
  }
}, 300_000)

// 重启 orca-serve 杀不掉岗位终端（pty 由独立 daemon 持有），所以用关闭 builder 终端来模拟终端丢失。
// 运行：WL_LIVE_RESTART=1 并保证 builder 用真 claude（不要设 WINGLINE_LIVE_BUILDER_LAUNCH）；本机无 codex 时设 WINGLINE_LIVE_CHECKER_LAUNCH=claude
const liveRestart = process.env.WL_LIVE_RESTART === '1'
test.skipIf(!liveRestart)('restore resumes builder session after its terminal is closed', async () => {
  const { yaml, env } = sandbox()
  const marker = `WLS-LIVE-${Date.now().toString(16)}`
  try {
    const deps = defaultMakeDeps(env, () => {})
    const up = await wl(['up', yaml, '--json'], env)
    expect(up.json.ok).toBe(true)
    const handleOf = async () =>
      (await wl(['ps', 'duo', '--json'], env)).json.result.find((r: { address: string }) => r.address === 'builder@duo').handle as string
    const first = await handleOf()
    await deps.orca.terminalWait({ handle: first, forState: 'tui-idle', timeoutMs: 60_000 })
    await wl(['send', 'builder@duo', `只回复收到。${marker}`, '--json'], env)
    await deps.orca.terminalWait({ handle: first, forState: 'tui-idle', timeoutMs: 60_000 })
    await new Promise((r) => setTimeout(r, 10_000)) // 等 Orca 把会话写进索引
    await deps.orca.terminalClose({ handle: first })

    const restored = await wl(['restore', 'duo', '--json'], env)
    expect(restored.json.ok).toBe(true)
    const builder = restored.json.result.posts.find((p: { address: string }) => p.address === 'builder@duo')
    expect(builder).toMatchObject({ outcome: 'resumed' })
    expect(builder.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await handleOf()).not.toBe(first)
  } finally {
    await wl(['down', 'duo', '--close', '--json'], env).catch(() => {})
  }
}, 600_000)
