// 真机集成测试：需要本机已安装并运行 Orca，并会在其中创建/关闭终端。
// 运行：WINGLINE_LIVE_WORKTREE=<Orca worktree 选择器> [WINGLINE_LIVE_BUILDER_LAUNCH=<命令>] [WINGLINE_LIVE_CHECKER_LAUNCH=<命令>] pnpm test:live
// 两个 LAUNCH 都换成非 agent 命令时，同时设 WINGLINE_LIVE_EXPECT_SEND=unconfirmed（非 agent 观察不到“开始处理”，send 只能是 send_unconfirmed）
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
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
// 读渲染后的屏幕：接回的会话头部会画出它的会话文件路径（含会话 ID），接回提示也会出现在输入框里
const screenOf = (handle: string): string => {
  const out = execFileSync(process.env.WINGLINE_ORCA ?? 'orca', ['terminal', 'read', '--terminal', handle, '--screen', '--json'], { encoding: 'utf8' })
  return (JSON.parse(out).result.terminal.tail as string[]).join('\n')
}
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
    const second = await handleOf()
    expect(second).not.toBe(first)
    let screen = ''
    for (let i = 0; i < 30 && !(screen.includes(marker) && screen.includes('重启后已接回本会话')); i++) {
      await new Promise((r) => setTimeout(r, 3_000))
      screen = screenOf(second)
    }
    // 重启前发的标记只会出现在原会话里（新开会话的启动包不含它）；会话 ID 不一定画在屏幕上（因 claude 版本而异）
    expect(screen).toContain(marker)
    expect(screen).toContain('重启后已接回本会话')
  } finally {
    await wl(['down', 'duo', '--close', '--json'], env).catch(() => {})
  }
}, 600_000)
// 控制台真机用例：需人工看一眼 Orca 内置浏览器里是否打开了控制台；默认跳过。
// 运行：WL_LIVE_CONSOLE=1 WINGLINE_LIVE_WORKTREE=<Orca worktree 选择器> pnpm test:live -t "console --open"
test.skipIf(process.env.WL_LIVE_CONSOLE !== '1')('console --open opens the console tab in Orca (manual check)', async () => {
  const { env } = sandbox()
  // 不自动关闭 console@wingline 终端：关了服务就停，人还没看就没了。看完请手动关掉它和标签页。
  // 用构建后的入口子进程执行：Orca 里新开的 console@wingline 终端要靠 process.argv[1] 找到 wl 入口，vitest 里不成立
  const out = execFileSync(process.execPath, ['packages/cli/dist/main.js', 'console', '--open', '--worktree', process.env.WINGLINE_LIVE_WORKTREE ?? '', '--json'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  })
  const res = JSON.parse(out) as { ok: boolean; result: { outcome: string; url: string } }
  expect(res.ok).toBe(true)
  expect(res.result.outcome).toBe('opened')
  console.log(`\n>>> 请在 Orca 里确认控制台标签页已打开，看完后手动关闭 console@wingline 终端：${res.result.url}\n`)
}, 300_000)

// 3C 真机用例（默认跳过，需人工确认）：调度员运行时给 builder 派一个任务，一个巡查周期后 worktree 的工作区状态应为 in-progress。
// 前提：Orca 版本在已验证范围内（工作区状态参数已在 1.4.237 上验证，ORCA_WORKTREE_SUPPORT.workspaceStatus 为 true）。
// 运行：WL_LIVE_WORKSPACE_STATUS=1 WINGLINE_LIVE_WORKTREE=<Orca worktree 选择器> pnpm test:live -t "workspace status"
test.skipIf(process.env.WL_LIVE_WORKSPACE_STATUS !== '1')('workspace status follows the dispatcher: a started task makes the worktree in-progress (manual confirm)', async () => {
  const { yaml, env } = sandbox()
  const worktree = process.env.WINGLINE_LIVE_WORKTREE ?? 'current'
  const orca = defaultMakeDeps(env, () => {}).orcaPath
  const shown = () => (JSON.parse(execFileSync(orca, ['worktree', 'show', '--worktree', worktree, '--json'], { encoding: 'utf8' })) as { result: { worktree: { workspaceStatus: string; comment: string } } }).result.worktree
  const original = shown()
  // 先把状态预置成 todo：worktree 本来就是 in-progress 的话，看到 in-progress 说明不了什么
  execFileSync(orca, ['worktree', 'set', '--worktree', worktree, '--workspace-status', 'todo', '--json'])
  try {
    await wl(['up', yaml, '--json'], env)
    await wl(['dispatcher', 'up', 'duo', '--json'], env)
    const created = await wl(['task', 'create', 'duo', '--title', '3C 真机：工作区状态', '--post', 'builder@duo', '--json'], env)
    expect(created.json.ok).toBe(true)
    // 重启后第一轮只观察不写（约 5 分钟），第二个巡查周期（约 10 分钟）才写：最多等 15 分钟
    let seen = shown()
    for (let i = 0; i < 60 && seen.workspaceStatus !== 'in-progress'; i++) {
      await new Promise((r) => setTimeout(r, 15_000))
      seen = shown()
    }
    expect(seen.workspaceStatus).toBe('in-progress')
  } finally {
    await wl(['dispatcher', 'down', 'duo', '--close', '--json'], env).catch(() => {})
    await wl(['down', 'duo', '--close', '--json'], env).catch(() => {})
    // Orca CLI 的 `--comment ""` 会被忽略，原来是空的注释只能还原成一个空格
    execFileSync(orca, ['worktree', 'set', '--worktree', worktree, '--workspace-status', original.workspaceStatus, '--comment', original.comment === '' ? ' ' : original.comment, '--json'])
  }
}, 1_200_000)
