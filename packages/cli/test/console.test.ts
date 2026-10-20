import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createConsoleServer, exitCodeOf, writeConsoleFile, type CommandDeps } from '@wingline/core'
import { consoleCmd, renderConsole } from '../src/console.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../../core/test/commands/fake-client.js'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

function webRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-cli-web-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>')
  cleanups.push(() => fs.rmSync(dir, { recursive: true }))
  return dir
}

/** 起一个真实服务并写下 console.json，模拟“已有控制台在运行”（pid 取本进程，必然存活）。 */
async function runningConsole(deps: CommandDeps) {
  const srv = await createConsoleServer(deps, { port: 0, webRoot: webRoot() })
  writeConsoleFile(deps.home, { pid: process.pid, port: srv.port, startedAt: new Date().toISOString(), controlKey: srv.controlKey })
  cleanups.push(() => srv.close())
  return srv
}

test('--link without a running console is console_not_running', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(consoleCmd(deps, { link: true })).rejects.toMatchObject({ code: 'console_not_running', kind: 'input' })
})

test('--link with a running console prints a fresh login link', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await runningConsole(deps)
  const res = await consoleCmd(deps, { link: true })
  expect(res.outcome).toBe('link')
  expect(res.url).toContain('/auth?token=')
  expect(renderConsole(res)).toContain('控制台登录链接：')
})

test('a running console is not started twice: plain start only reports the link', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await runningConsole(deps)
  const res = await consoleCmd(deps, {})
  expect(res).toMatchObject({ outcome: 'link' })
})

test('--open with a running console opens the link in an Orca tab in the team worktree', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  await runningConsole(deps)
  const res = await consoleCmd(deps, { open: true })
  expect(res).toMatchObject({ outcome: 'opened', tab: 'opened' })
  expect(o.tabCreateCalls).toEqual([{ url: res.url, worktree: `path:${os.tmpdir()}` }])
})

test('--open reports console_tab_unsupported when Orca cannot open the tab, and still returns the link', async () => {
  const o = new FakeOrca()
  o.tabCreateSupported = false
  const { deps } = seedRunningTeam(o)
  await runningConsole(deps)
  const res = await consoleCmd(deps, { open: true })
  expect(res).toMatchObject({ outcome: 'opened', tab: 'unsupported' })
  expect(renderConsole(res)).toContain('console_tab_unsupported')
  expect(renderConsole(res)).toContain(res.url)
})

test('--open with no running team and no --worktree is console_no_worktree', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(consoleCmd(deps, { open: true })).rejects.toMatchObject({ code: 'console_no_worktree' })
})

test('服务在运行但没有任何团队：--open 降级为链接 + worktree 提示，退出不报错', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await runningConsole(deps)
  const res = await consoleCmd(deps, { open: true })
  expect(res).toMatchObject({
    outcome: 'opened',
    tab: 'unsupported',
    tabReason: 'worktree',
  })
  const out = renderConsole(res)
  expect(out).toContain(res.url)
  expect(out).toContain('console_no_worktree')
  expect(out).toContain('wl up')
  expect(out).toContain('--worktree')
})

test('a port that is already taken is console_port_in_use', async () => {
  const { deps } = mkDeps(new FakeOrca())
  const blocker = net.createServer()
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()))
  cleanups.push(() => new Promise<void>((resolve) => blocker.close(() => resolve())))
  const port = (blocker.address() as net.AddressInfo).port
  await expect(consoleCmd(deps, { port, webRoot: webRoot() })).rejects.toMatchObject({ code: 'console_port_in_use' })
  expect(fs.existsSync(path.join(deps.home, 'console.json'))).toBe(false)
})

test('--open 新服务 confirmMs 内未就绪 → console_start_unconfirmed（kind uncertain，CLI 映射退出码 3）', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  // 无运行中的服务、无团队：用 --worktree 跳过工作区推导，confirmMs: 0 表示一轮都不等
  const err = await consoleCmd(deps, {
    open: true, worktree: `path:${os.tmpdir()}`, confirmMs: 0, sleep: async () => {},
  }).then(() => null, (e: unknown) => e)
  expect(err).toMatchObject({ kind: 'uncertain', code: 'console_start_unconfirmed' })
  expect(exitCodeOf(err)).toBe(3)
  // 新开的终端确实发出去了，只是不确定它有没有跑起来
  expect(o.created).toHaveLength(1)
  expect(o.created[0]).toMatchObject({ title: 'console@wingline' })
})

test('缺省 confirmMs 仍是 10 秒窗口：每 200ms 轮询一次，共 50 次', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o)
  const naps: number[] = []
  await expect(consoleCmd(deps, {
    open: true, worktree: `path:${os.tmpdir()}`,
    sleep: async (ms) => { naps.push(ms) },
  })).rejects.toMatchObject({ code: 'console_start_unconfirmed' })
  expect(naps).toHaveLength(50)
  expect(new Set(naps)).toEqual(new Set([200]))
})
