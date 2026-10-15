import fs from 'node:fs'
import path from 'node:path'
import type { Writable } from 'node:stream'
import { Command, CommanderError } from 'commander'
import {
  Registry, createCallLog, createOrcaClient, createOrcaRunner, down, exitCodeOf, ps, resolveOrcaExecutable,
  send, up, winglineHome, type CommandDeps,
} from '@wingline/core'
import verified from './verified.json' with { type: 'json' }
import { errorDoc, renderDown, renderError, renderPs, renderSend, renderUp } from './output.js'

export interface RunIO {
  stdout: Writable
  stderr: Writable
  env: NodeJS.ProcessEnv
}

export interface Commands {
  up: typeof up
  ps: typeof ps
  send: typeof send
  down: typeof down
}

const realCommands: Commands = { up, ps, send, down }
const PACKAGE_VERSION = (JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

function which(name: string, env: NodeJS.ProcessEnv): string | null {
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, name)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
  }
  return null
}

export function defaultMakeDeps(env: NodeJS.ProcessEnv, warn: (m: string) => void): CommandDeps {
  const home = winglineHome(env)
  const exe = resolveOrcaExecutable({ env, platform: process.platform, which: (n) => which(n, env) })
  const runner = createOrcaRunner(exe, createCallLog(path.join(home, 'logs')))
  return {
    orca: createOrcaClient(runner),
    registry: Registry.open(path.join(home, 'state.db')),
    warn,
    verifiedOrca: verified.verifiedOrca,
    multilineSafe: !exe.viaCmd,
    home,
    env,
    now: () => new Date(),
  }
}

/** node:sqlite 在 Node 22 上会打印实验特性警告；只屏蔽它，其他警告照常输出。 */
export function installWarningFilter(stderr: Writable): void {
  process.removeAllListeners('warning')
  process.on('warning', (w) => {
    if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return
    stderr.write(`(${w.name}) ${w.message}\n`)
  })
}

const exitCodeOfUp = (r: { posts: Array<{ outcome: string }> }) =>
  r.posts.some((p) => p.outcome === 'failed') ? 2 : r.posts.some((p) => p.outcome === 'uncertain') ? 3 : 0

export async function run(
  argv: string[],
  io: RunIO,
  commands: Commands = realCommands,
  makeDeps: (env: NodeJS.ProcessEnv, warn: (m: string) => void) => CommandDeps = defaultMakeDeps,
): Promise<number> {
  let code = 0

  async function execute<T>(json: boolean, fn: (deps: CommandDeps) => Promise<T>, render: (r: T) => string, exitOf: (r: T) => number = () => 0) {
    let deps: CommandDeps | undefined
    try {
      deps = makeDeps(io.env, (m) => io.stderr.write(`警告：${m}\n`))
      const result = await fn(deps)
      io.stdout.write(json ? JSON.stringify({ ok: true, result }) + '\n' : render(result))
      code = exitOf(result)
    } catch (err) {
      const doc = errorDoc(err)
      if (json) io.stdout.write(JSON.stringify({ ok: false, error: doc }) + '\n')
      else io.stderr.write(renderError(doc))
      code = exitCodeOf(err)
    } finally {
      deps?.registry.close()
    }
  }

  const program = new Command()
    .name('wingline')
    .description('雁阵 Wingline：在 Orca 之上运行常驻 agent 团队')
    .version(PACKAGE_VERSION)
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.stdout.write(s), writeErr: (s) => io.stderr.write(s) })

  program.command('up <team.yaml>').description('拉起团队的全部岗位').option('--json', '输出 JSON')
    .action((specPath: string, o: { json?: boolean }) => execute(!!o.json, (d) => commands.up(d, { specPath }), renderUp, exitCodeOfUp))
  program.command('ps [team]').description('查看岗位状态').option('--json', '输出 JSON')
    .action((team: string | undefined, o: { json?: boolean }) => execute(!!o.json, (d) => commands.ps(d, { team }), renderPs))
  program.command('send <post@team> <message>').description('给岗位发消息').option('--json', '输出 JSON')
    .option('--retry-request <id>', '确认上次未确认的发送：传入当时报告的 Orca 请求 ID，消息须与原来完全相同，不会重复发送')
    .action((address: string, message: string, o: { json?: boolean; retryRequest?: string }) =>
      execute(!!o.json, (d) => commands.send(d, { address, message, retryRequest: o.retryRequest }), renderSend))
  program.command('down <team>').description('停止团队；加 --close 关闭终端').option('--close', '关闭岗位终端').option('--json', '输出 JSON')
    .action((team: string, o: { close?: boolean; json?: boolean }) => execute(!!o.json, (d) => commands.down(d, { team, close: !!o.close }), renderDown))

  try {
    await program.parseAsync(argv, { from: 'user' })
  } catch (err) {
    if (!(err instanceof CommanderError)) throw err
    code = err.exitCode === 0 ? 0 : 1
  }
  return code
}
