import fs from 'node:fs'
import path from 'node:path'
import type { Writable } from 'node:stream'
import { Command, CommanderError } from 'commander'
import {
  READ_ONLY_CALLS, Registry, type CallLogOptions, WinglineError, attention, auditedCommands, claimTask, createCallLog, createOrcaClient, createOrcaRunner, createTask, doneTask, down, escalateTask, exitCodeOf,
  listStale, listTasks, parseDuration, planTask, ps, reassignTask, recoverTask, releaseTask, resolveGate, resolveOrcaExecutable, restore, send, showTask, startTask,
  up, winglineHome, dispatcherUp, dispatcherDown, dispatcherStatus, dispatcherReply, freezePostCmd, unfreezePostCmd, hushCmd, unhushCmd, runDispatcherLoop, type CommandDeps,
} from '@wingline/core'
import { AUDIT } from './audit-table.js'
import verified from './verified.json' with { type: 'json' }
import {
  errorDoc, renderAttention, renderDispatcherDown, renderDispatcherStatus, renderDispatcherUp, renderUnfreeze, renderCreate, renderDone, renderDown, renderError, renderEscalate, renderList, renderPs, renderReassign, renderRecover, renderResolve,
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
  restore: typeof restore
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
  dispatcherUp: typeof dispatcherUp
  dispatcherDown: typeof dispatcherDown
  runDispatcherLoop: typeof runDispatcherLoop
  dispatcherStatus: typeof dispatcherStatus
  freezePostCmd: typeof freezePostCmd
  unfreezePostCmd: typeof unfreezePostCmd
  hushCmd: typeof hushCmd
  unhushCmd: typeof unhushCmd
  dispatcherReply: typeof dispatcherReply
  attention: typeof attention
}

const rawCommands: Commands = {
  up, ps, send, down, restore, createTask, listTasks, listStale, showTask, claimTask, releaseTask, reassignTask, startTask, planTask, doneTask,
  escalateTask, resolveGate, recoverTask, dispatcherUp, dispatcherDown, runDispatcherLoop, dispatcherStatus, freezePostCmd, unfreezePostCmd,
  hushCmd, unhushCmd, dispatcherReply, attention,
}
/** 表里登记过的写命令每执行一次写一行审计（spec 6.2）。 */
const realCommands: Commands = auditedCommands(rawCommands, AUDIT)
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

/** 只读轮询（spec 第 8 节）：调度员的 CallLog 只记摘要。 */
export const isReadOnlyCall = (args: string[]) => READ_ONLY_CALLS.some(([group, sub]) => args[0] === group && args[1] === sub)

/** `dispatcher run` 的覆盖项：Orca 启动的终端不继承 WINGLINE_HOME/WINGLINE_ORCA，所以由命令行显式传入。 */
export interface DepsOverrides {
  home?: string
  orca?: string
  summarize?: boolean
}

/** CallLog 选项：summarize 为真时只读轮询只记摘要。 */
export const callLogOptions = (o: DepsOverrides): CallLogOptions => (o.summarize ? { summarize: isReadOnlyCall } : {})

export function defaultMakeDeps(inputEnv: NodeJS.ProcessEnv, warn: (m: string) => void, o: DepsOverrides = {}): CommandDeps {
  const env = { ...inputEnv, ...(o.home ? { WINGLINE_HOME: o.home } : {}), ...(o.orca ? { WINGLINE_ORCA: o.orca } : {}) }
  const home = winglineHome(env)
  const exe = resolveOrcaExecutable({ env, platform: process.platform, which: (n) => which(n, env) })
  const runner = createOrcaRunner(exe, createCallLog(path.join(home, 'logs'), undefined, callLogOptions(o)))
  return {
    orca: createOrcaClient(runner),
    registry: Registry.open(path.join(home, 'state.db')),
    warn,
    verifiedOrca: verified.verifiedOrca,
    multilineSafe: !exe.viaCmd,
    home,
    orcaPath: exe.cmdPath ?? exe.file,
    env,
    now: () => new Date(),
    monotonic: () => performance.now(),
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

type Execute = <T>(
  json: boolean, fn: (deps: CommandDeps) => Promise<T>, render: (r: T) => string, exitOf?: (r: T) => number, overrides?: DepsOverrides,
) => Promise<void>
type AsJson = { as?: string; json?: boolean }

function registerDispatcherCommands(program: Command, commands: Commands, execute: Execute, io: RunIO): void {
  const disp = program.command('dispatcher').description('调度员：收件箱中继与巡查')
  const sub = (spec: string, desc: string) => disp.command(spec).description(desc).option('--json', '输出 JSON')
  type J = { json?: boolean }
  sub('up <team>', '启动调度员').action((team: string, o: J) => execute(!!o.json, (d) => commands.dispatcherUp(d, { team }), renderDispatcherUp))
  sub('down <team>', '停止调度员；加 --close 关闭其终端').option('--close', '关闭调度员终端')
    .action((team: string, o: J & { close?: boolean }) => execute(!!o.json, (d) => commands.dispatcherDown(d, { team, close: !!o.close }), renderDispatcherDown))
  disp.command('run <team>').description('在当前终端运行调度员循环（长期运行）').option('--home <path>', '数据目录（等价 WINGLINE_HOME）')
    .option('--orca <path>', 'Orca 可执行文件（等价 WINGLINE_ORCA）')
    .action((team: string, o: { home?: string; orca?: string }) => {
      const ctl = new AbortController()
      const stop = () => { io.stderr.write('收到信号，正在停止…\n'); ctl.abort() }
      process.once('SIGINT', stop); process.once('SIGTERM', stop); process.once('SIGHUP', stop)
      return execute(false, (d) => commands.runDispatcherLoop(d, team, { signal: ctl.signal }).then(() => ({})), () => '', undefined,
        { home: o.home, orca: o.orca, summarize: true }).finally(() => { process.off('SIGINT', stop); process.off('SIGTERM', stop); process.off('SIGHUP', stop) })
    })
  sub('status <team>', '调度员状态').action((team: string, o: J) => execute(!!o.json, (d) => commands.dispatcherStatus(d, team), renderDispatcherStatus))
  sub('freeze <post@team>', '冻结岗位（不再派发给它）').requiredOption('--reason <text>', '理由')
    .action((address: string, o: J & { reason: string }) =>
      execute(!!o.json, (d) => commands.freezePostCmd(d, { address, reason: o.reason }).then(() => ({ address })), (r) => `${r.address} 已冻结\n`))
  sub('unfreeze <post@team>', '解冻岗位').action((address: string, o: J) =>
    execute(!!o.json, (d) => commands.unfreezePostCmd(d, { address }), (r) => renderUnfreeze(r, address)))
  sub('hush <post@team>', '暂停往岗位终端自动打字').option('--for <时长>', '如 15m、2h；默认 30 分钟')
    .action((address: string, o: J & { for?: string }) =>
      execute(!!o.json, async (d) => commands.hushCmd(d, { address, forMs: o.for === undefined ? undefined : parseDuration(o.for) }), (r) => `${address} 静音至 ${r.until}\n`))
  sub('unhush <post@team>', '取消静音').action((address: string, o: J) =>
    execute(!!o.json, (d) => commands.unhushCmd(d, { address }).then(() => ({ address })), (r) => `${r.address} 已取消静音\n`))
  sub('reply <team> <message_id>', '以协调者身份回答岗位的提问').requiredOption('--body <text>', '回答').option('--again', '再回答一次已答过的问题')
    .action((team: string, messageId: string, o: J & { body: string; again?: boolean }) =>
      execute(!!o.json, (d) => commands.dispatcherReply(d, { team, messageId, body: o.body, again: !!o.again }),
        (r) => (r.duplicate ? `消息 ${r.messageId} 已回答过，未重复发送\n` : `已回答，消息 ${r.messageId}\n`)))
}

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
      return execute(!!o.json, (d) => commands.listStale(d, team), renderStale)
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

function registerBaseCommands(program: Command, commands: Commands, execute: Execute): void {
  program.command('up <team.yaml>').description('拉起团队的全部岗位').option('--json', '输出 JSON')
    .option('--adopt-run <id>', '找回指定的 Run').option('--new-run', '丢弃旧 Run，新建一个')
    .action((specPath: string, o: { json?: boolean; adoptRun?: string; newRun?: boolean }) =>
      execute(!!o.json, async (d) => {
        if (o.adoptRun && o.newRun) throw new WinglineError('input', 'run_flags_conflict', '--adopt-run 与 --new-run 互斥')
        return commands.up(d, { specPath, adoptRun: o.adoptRun, newRun: o.newRun })
      }, (r) => renderUp(r, { newRun: o.newRun }), exitCodeOfUp))
  program.command('ps [team]').description('查看岗位状态').option('--json', '输出 JSON')
    .action((team: string | undefined, o: { json?: boolean }) => execute(!!o.json, (d) => commands.ps(d, { team }), renderPs))
  program.command('attention <team>').description('需要人处理的事项汇总').option('--json', '输出 JSON')
    .action((team: string, o: { json?: boolean }) => execute(!!o.json, (d) => commands.attention(d, team), renderAttention))
  program.command('send <post@team> <message>').description('给岗位发消息').option('--json', '输出 JSON')
    .option('--retry-request <id>', '确认上次未确认的发送：传入当时报告的 Orca 请求 ID，消息须与原来完全相同，不会重复发送')
    .action((address: string, message: string, o: { json?: boolean; retryRequest?: string }) =>
      execute(!!o.json, (d) => commands.send(d, { address, message, retryRequest: o.retryRequest }), renderSend))
  program.command('down <team>').description('停止团队；加 --close 关闭终端').option('--close', '关闭岗位终端').option('--json', '输出 JSON')
    .action((team: string, o: { close?: boolean; json?: boolean }) => execute(!!o.json, (d) => commands.down(d, { team, close: !!o.close }), renderDown))
}

export async function run(
  argv: string[],
  io: RunIO,
  commands: Commands = realCommands,
  makeDeps: (env: NodeJS.ProcessEnv, warn: (m: string) => void, overrides?: DepsOverrides) => CommandDeps = defaultMakeDeps,
): Promise<number> {
  let code = 0
  const json = argv.includes('--json')

  async function execute<T>(json: boolean, fn: (deps: CommandDeps) => Promise<T>, render: (r: T) => string, exitOf: (r: T) => number = () => 0, overrides?: DepsOverrides) {
    let deps: CommandDeps | undefined
    try {
      deps = makeDeps(io.env, (m) => io.stderr.write(`警告：${m}\n`), overrides)
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
    .configureOutput({ writeOut: (s) => io.stdout.write(s), writeErr: (s) => { if (!json) io.stderr.write(s) } })

  registerBaseCommands(program, commands, execute)
  registerTaskCommands(program, commands, execute)
  registerDispatcherCommands(program, commands, execute, io)

  try {
    await program.parseAsync(argv, { from: 'user' })
  } catch (err) {
    if (!(err instanceof CommanderError)) throw err
    code = err.exitCode === 0 ? 0 : 1
    // --json 时用法错误也要给出一份合法的 JSON 文档
    if (json && code !== 0) io.stdout.write(JSON.stringify({ ok: false, error: { kind: 'input', code: 'usage', message: err.message.replace(/^error: /, '') } }) + '\n')
  }
  return code
}
