// 真机集成测试：需要本机已安装并运行 Orca，并会在其中创建/关闭终端。
// 运行：WINGLINE_LIVE_WORKTREE=<Orca worktree 选择器> [WINGLINE_LIVE_CHECKER_LAUNCH=<命令>] pnpm test:live
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
  const idle = (await deps.orca.terminalWait({ handle: checker.handle, forState: 'tui-idle', timeoutMs: 30_000 })).satisfied
  const sent = await wl(['send', 'checker@duo', '你好', '--json'], env)
  if (idle) expect(sent.json).toMatchObject({ ok: true, result: { outcome: 'delivered' } })
  else expect(sent.json).toMatchObject({ ok: false, error: { code: 'send_unconfirmed' } })

  const closed = await wl(['down', 'duo', '--close', '--json'], env)
  expect(closed.json.result.posts.map((p: any) => p.outcome)).toEqual(['closed', 'closed'])
  expect(await titles()).not.toEqual(expect.arrayContaining(['builder@duo']))
}, 300_000)
