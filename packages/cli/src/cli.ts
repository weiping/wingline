import fs from 'node:fs'
import path from 'node:path'
import type { Writable } from 'node:stream'
import { Command, CommanderError } from 'commander'
import {
  Registry, WinglineError, claimTask, createCallLog, createOrcaClient, createOrcaRunner, createTask, doneTask, down, escalateTask, exitCodeOf,
  listStale, listTasks, planTask, ps, reassignTask, recoverTask, releaseTask, resolveGate, resolveOrcaExecutable, send, showTask, startTask,
  up, winglineHome, type CommandDeps,
} from '@wingline/core'
import verified from './verified.json' with { type: 'json' }
import {
  errorDoc, renderCreate, renderDone, renderDown, renderError, renderEscalate, renderList, renderPs, renderReassign, renderRecover, renderResolve,
  renderSend, renderShow, renderStale, renderStart, renderUp,
} from './output.js'

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
  createTask: typeof createTask
  listTasks: typeof listTasks
  listStale: typeof listStale
  showTask: typeof showTask
  claimTask: typeof claimTask
  releaseTask: typeof releaseTask
  reassignTask: typeof reassignTask
  startTask: typeof startTask
  planTask: typeof planTask
  doneTask: typeof doneTask
  escalateTask: typeof escalateTask
  resolveGate: typeof resolveGate
  recoverTask: typeof recoverTask
}

const realCommands: Commands = {
  up, ps, send, down, createTask, listTasks, listStale, showTask, claimTask, releaseTask, reassignTask, startTask, planTask, doneTask,
  escalateTask, resolveGate, recoverTask,
}
const splitList = (s: string | undefined) => s?.split(',').filter(Boolean)
/** done：通过 0；gate 失败/转人工/绕过后补跑失败 1。 */
const exitCodeOfDone = (r: { outcome: string }) => (r.outcome === 'done' ? 0 : 1)
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

const RUN_EXIT: Record<string, number> = { ambiguous: 1, failed: 2, lost: 2, uncertain: 3 }
/** 岗位结果与 Run 步骤取最严重者：失败/丢失 2 > 不确定 3 > 候选不唯一 1。 */
const exitCodeOfUp = (r: { posts: Array<{ outcome: string }>; run?: { outcome: string } }) => {
  const codes = [...r.posts.map((p) => (p.outcome === 'failed' ? 2 : p.outcome === 'uncertain' ? 3 : 0)), RUN_EXIT[r.run?.outcome ?? ''] ?? 0]
  return codes.includes(2) ? 2 : codes.includes(3) ? 3 : codes.includes(1) ? 1 : 0
}

type Execute = <T>(json: boolean, fn: (deps: CommandDeps) => Promise<T>, render: (r: T) => string, exitOf?: (r: T) => number) => Promise<void>
type AsJson = { as?: string; json?: boolean }

function registerTaskCommands(program: Command, commands: Commands, execute: Execute): void {
  const task = program.command('task').description('任务工作流')
  const sub = (spec: string, desc: string) => task.command(spec).description(desc).option('--json', '输出 JSON')
  sub('create <team>', '建任务').requiredOption('--title <t>', '标题').option('--post <addr>', '直接派给岗位').option('--tags <a,b>', '标签')
    .option('--parent <id>', '父任务').option('--as <addr>', '以该岗位身份').option('--retry-request <id>', '重跑上次不确定的创建')
    .action((team: string, o: AsJson & { title: string; post?: string; tags?: string; parent?: string; retryRequest?: string }) =>
      execute(!!o.json, (d) => commands.createTask(d, { team, title: o.title, post: o.post, tags: splitList(o.tags), parent: o.parent, as: o.as, retryRequest: o.retryRequest }), (r) => renderCreate(r, o.post)))
  sub('list [team]', '列出任务').option('--mine', '只看我的').option('--status <s>', '按状态').option('--tags <a,b>', '按标签')
    .option('--stale', '只列卡住的任务').option('--as <addr>', '以该岗位身份')
    .action((team: string | undefined, o: AsJson & { mine?: boolean; status?: string; tags?: string; stale?: boolean }) => {
      if (!o.stale) return execute(!!o.json, (d) => commands.listTasks(d, { team, mine: o.mine, status: o.status, tags: splitList(o.tags), as: o.as }), renderList)
      const stale = (d: CommandDeps) => {
        if (!team) throw new WinglineError('input', 'team_required', '--stale 需要指定团队', { hint: 'wl task list <team> --stale' })
        return commands.listStale(d, team)
      }
      return execute(!!o.json, stale, renderStale)
    })
  sub('show <id>', '查看任务').option('--team <team>', '团队').option('--history', '附变迁记录')
    .action((id: string, o: AsJson & { team?: string; history?: boolean }) =>
      execute(!!o.json, (d) => commands.showTask(d, { id, team: o.team, history: !!o.history }), renderShow))
  sub('claim <id>', '认领').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson) => execute(!!o.json, (d) => commands.claimTask(d, { id, as: o.as }).then(() => ({ id })), (r) => `任务 ${r.id} 已认领\n`))
  sub('release <id>', '放弃认领').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson) => execute(!!o.json, (d) => commands.releaseTask(d, { id, as: o.as }).then(() => ({ id })), (r) => `任务 ${r.id} 已放回\n`))
  sub('reassign <id>', '改派').requiredOption('--to <addr>', '新主人').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson & { to: string }) => execute(!!o.json, (d) => commands.reassignTask(d, { id, to: o.to, as: o.as }), (r) => renderReassign(r, id, o.to)))
  sub('start <id>', '开始').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson) => execute(!!o.json, (d) => commands.startTask(d, { id, as: o.as }), (r) => renderStart(r, id, o.as)))
  sub('plan <id> <text>', '写计划')
    .action((id: string, text: string, o: AsJson) => execute(!!o.json, (d) => commands.planTask(d, { id, text }).then(() => ({ id })), (r) => `任务 ${r.id} 计划已记录\n`))
  sub('done <id>', '完成').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson) => execute(!!o.json, (d) => commands.doneTask(d, { id, as: o.as }), renderDone, exitCodeOfDone))
  sub('escalate <id>', '转人工决策').requiredOption('--reason <text>', '理由').option('--reopen', '重开已终态的任务').option('--as <addr>', '以该岗位身份')
    .option('--retry-request <id>', '重跑上次不确定的 escalate')
    .action((id: string, o: AsJson & { reason: string; reopen?: boolean; retryRequest?: string }) =>
      execute(!!o.json, (d) => commands.escalateTask(d, { id, reason: o.reason, reopen: !!o.reopen, as: o.as, retryRequest: o.retryRequest }), renderEscalate))
  sub('resolve <gateId>', '决策').requiredOption('--resolution <text>', '决定').option('--reassign <addr>', '同时改派').option('--as <addr>', '以该岗位身份')
    .action((gateId: string, o: AsJson & { resolution: string; reassign?: string }) =>
      execute(!!o.json, (d) => commands.resolveGate(d, { gateId, resolution: o.resolution, reassign: o.reassign, as: o.as }), renderResolve))
  sub('recover <id>', '恢复派给已消失终端的任务').option('--as <addr>', '以该岗位身份')
    .action((id: string, o: AsJson) => execute(!!o.json, (d) => commands.recoverTask(d, { id, as: o.as }), (r) => renderRecover(r, id)))
}

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
    .option('--adopt-run <id>', '找回指定的 Run').option('--new-run', '丢弃旧 Run，新建一个')
    .action((specPath: string, o: { json?: boolean; adoptRun?: string; newRun?: boolean }) => {
      if (o.adoptRun && o.newRun) {
        io.stderr.write('错误：--adopt-run 与 --new-run 互斥\n')
        code = 1
        return
      }
      return execute(!!o.json, (d) => commands.up(d, { specPath, adoptRun: o.adoptRun, newRun: o.newRun }), renderUp, exitCodeOfUp)
    })
  program.command('ps [team]').description('查看岗位状态').option('--json', '输出 JSON')
    .action((team: string | undefined, o: { json?: boolean }) => execute(!!o.json, (d) => commands.ps(d, { team }), renderPs))
  program.command('send <post@team> <message>').description('给岗位发消息').option('--json', '输出 JSON')
    .option('--retry-request <id>', '确认上次未确认的发送：传入当时报告的 Orca 请求 ID，消息须与原来完全相同，不会重复发送')
    .action((address: string, message: string, o: { json?: boolean; retryRequest?: string }) =>
      execute(!!o.json, (d) => commands.send(d, { address, message, retryRequest: o.retryRequest }), renderSend))
  program.command('down <team>').description('停止团队；加 --close 关闭终端').option('--close', '关闭岗位终端').option('--json', '输出 JSON')
    .action((team: string, o: { close?: boolean; json?: boolean }) => execute(!!o.json, (d) => commands.down(d, { team, close: !!o.close }), renderDown))

  registerTaskCommands(program, commands, execute)

  try {
    await program.parseAsync(argv, { from: 'user' })
  } catch (err) {
    if (!(err instanceof CommanderError)) throw err
    code = err.exitCode === 0 ? 0 : 1
  }
  return code
}
