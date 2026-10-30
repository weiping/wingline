import type { HandlerContext, Router } from './http.js'
import { checkParam } from './http.js'
import { postAddress, type CommandDeps } from '../commands/deps.js'
import { WinglineError } from '../errors.js'
import { auditedCommands, type AuditCtx, type AuditTable } from '../audit.js'
import { send } from '../commands/send.js'
import { createTask } from '../commands/task/create.js'
import { escalateTask, recoverTask, resolveGate } from '../commands/task/escalate.js'
import { claimTask, reassignTask, releaseTask } from '../commands/task/claim.js'
import { planTask } from '../commands/task/plan.js'
import { startTask } from '../commands/task/start.js'
import { doneTask, type DoneResult } from '../commands/task/done.js'
import type { Delivery } from '../commands/task/dispatch.js'
import { freezePostCmd, hushCmd, unfreezePostCmd, unhushCmd } from '../commands/dispatcher/controls.js'
import { dispatcherDown, dispatcherUp } from '../commands/dispatcher/lifecycle.js'
import { dispatcherReply } from '../commands/dispatcher/inbox.js'
import { discardDraftCmd, saveSpecCmd } from '../commands/spec.js'
import { down } from '../commands/down.js'
import { restore } from '../commands/restore/index.js'
import { up, type UpResult } from '../commands/up.js'
import type { DownResult } from '../commands/down.js'
import type { RestoreResult } from '../commands/restore/index.js'
import { initTeamCmd } from '../commands/init.js'
import { autostartInstall, autostartUninstall } from '../commands/autostart/index.js'
import { realAutostartSys } from '../commands/autostart/sys.js'

/** 控制台口径的参数：带 team 名（审计表靠它取团队），开关在路由层已归一成 boolean。 */
export interface ConsoleUpArgs { team: string; draft?: boolean; newRun?: boolean; adoptRun?: string }
export interface ConsoleDownArgs { team: string; close?: boolean }
export interface ConsoleRestoreArgs { team: string; dryRun?: boolean; noTasks?: boolean; sessions?: Record<string, string> }

export interface WriteCommands {
  send: typeof send
  createTask: typeof createTask
  escalateTask: typeof escalateTask
  reassignTask: typeof reassignTask
  recoverTask: typeof recoverTask
  resolveGate: typeof resolveGate
  claimTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<void>
  releaseTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<void>
  planTask: (deps: CommandDeps, a: { id: string; as?: string; text: string }) => Promise<void>
  startTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<{ delivery: Delivery; reason?: string; already?: true }>
  doneTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<DoneResult>
  freezePostCmd: typeof freezePostCmd
  unfreezePostCmd: typeof unfreezePostCmd
  hushCmd: typeof hushCmd
  unhushCmd: typeof unhushCmd
  dispatcherReply: typeof dispatcherReply
  saveSpecCmd: typeof saveSpecCmd
  discardDraftCmd: typeof discardDraftCmd
  up: (deps: CommandDeps, a: ConsoleUpArgs) => Promise<UpResult>
  down: (deps: CommandDeps, a: ConsoleDownArgs) => Promise<DownResult>
  restore: (deps: CommandDeps, a: ConsoleRestoreArgs) => Promise<RestoreResult>
  dispatcherUp: (deps: CommandDeps, a: { team: string }) => Promise<{ address: string; outcome: 'already_running' | 'started'; handle?: string }>
  dispatcherDown: (deps: CommandDeps, a: { team: string; close?: boolean }) => Promise<{ address: string; outcome: 'noop' | 'closed' | 'already_gone' }>
  initTeamCmd: typeof initTeamCmd
  autostartInstall: (deps: CommandDeps, a: { waitOrca?: string }) => Promise<{ platform: string; file: string; command: string[]; logPath: string; waitOrca: string }>
  autostartUninstall: (deps: CommandDeps) => Promise<{ file: string; removed: boolean }>
}

export interface WriteRouteSpec {
  pattern: string
  check: readonly ('team' | 'post' | 'id' | 'gateId' | 'messageId')[]
  fields: readonly string[]
  call: (cmds: WriteCommands, ctx: HandlerContext) => Promise<unknown>
}

/** 布尔开关：只收 true / false（缺省放行）。字符串 "false" 不再当成真值。 */
function checkBool(key: string, val: unknown): void {
  if (val !== undefined && typeof val !== 'boolean') {
    throw new WinglineError('input', 'invalid_param', `参数 ${key}=${val} 不合法`)
  }
}

/** 毫秒数：只收有限数字（缺省放行）。 */
function checkNumber(key: string, val: unknown): void {
  if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
    throw new WinglineError('input', 'invalid_param', `参数 ${key}=${val} 不合法`)
  }
}

/** 岗位 → 会话 id 的字符串映射：对象、且每个值都是字符串。 */
function parseSessions(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined
  const ok = !!raw && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every((v) => typeof v === 'string')
  if (!ok) throw new WinglineError('input', 'invalid_param', '参数 sessions 不合法')
  return raw as Record<string, string>
}

/** 标签：字符串数组。 */
function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) {
    throw new WinglineError('input', 'invalid_param', '参数 tags 不合法')
  }
  return raw as string[]
}

export const WRITE_ROUTES: WriteRouteSpec[] = [
  {
    pattern: '/api/teams/:team/send',
    check: ['team'],
    fields: ['post', 'message', 'retryRequest'],
    call: async (cmds, ctx) => {
      checkParam('post', ctx.body.post)
      checkParam('message', ctx.body.message)
      const address = postAddress(ctx.body.post, ctx.params.team!)
      return cmds.send(ctx.deps, { address, message: ctx.body.message, retryRequest: ctx.body.retryRequest })
    },
  },
  {
    pattern: '/api/teams/:team/tasks',
    check: ['team'],
    fields: ['title', 'post', 'tags', 'parent', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { title, post, tags, parent, retryRequest } = ctx.body
      checkParam('title', title)
      if (post !== undefined) checkParam('post', post)
      if (parent !== undefined) checkParam('id', parent)
      return cmds.createTask(ctx.deps, { team: ctx.params.team!, title, post: post ? postAddress(post, ctx.params.team!) : undefined, tags: parseTags(tags), parent, retryRequest })
    },
  },
  {
    pattern: '/api/teams/:team/tasks/:id/escalate',
    check: ['team', 'id'],
    fields: ['reason', 'reopen', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { reason, reopen, retryRequest } = ctx.body
      checkParam('reason', reason)
      checkBool('reopen', reopen)
      return cmds.escalateTask(ctx.deps, { id: ctx.params.id!, reason, reopen, retryRequest })
    },
  },
  {
    pattern: '/api/teams/:team/tasks/:id/reassign',
    check: ['team', 'id'],
    fields: ['to', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { to } = ctx.body
      if (typeof to !== 'string') checkParam('post', to)
      const target = !to.includes('@') ? (checkParam('post', to), postAddress(to, ctx.params.team!)) : to
      return cmds.reassignTask(ctx.deps, { id: ctx.params.id!, to: target })
    },
  },
  {
    pattern: '/api/teams/:team/tasks/:id/recover',
    check: ['team', 'id'],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.recoverTask(ctx.deps, { id: ctx.params.id! }),
  },
  {
    pattern: '/api/teams/:team/tasks/:id/claim',
    check: ['team', 'id'],
    fields: ['as', 'retryRequest'],
    call: async (cmds, ctx) => cmds.claimTask(ctx.deps, { id: ctx.params.id!, as: actorOf(ctx) }),
  },
  {
    pattern: '/api/teams/:team/tasks/:id/release',
    check: ['team', 'id'],
    fields: ['as', 'retryRequest'],
    call: async (cmds, ctx) => cmds.releaseTask(ctx.deps, { id: ctx.params.id!, as: actorOf(ctx) }),
  },
  {
    pattern: '/api/teams/:team/tasks/:id/plan',
    check: ['team', 'id'],
    fields: ['as', 'text', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { text } = ctx.body
      if (typeof text !== 'string' || !text.trim()) throw new WinglineError('input', 'invalid_param', '参数 text 不合法')
      return cmds.planTask(ctx.deps, { id: ctx.params.id!, as: actorOf(ctx), text })
    },
  },
  {
    pattern: '/api/teams/:team/tasks/:id/start',
    check: ['team', 'id'],
    fields: ['as', 'retryRequest'],
    call: async (cmds, ctx) => cmds.startTask(ctx.deps, { id: ctx.params.id!, as: actorOf(ctx) }),
  },
  {
    pattern: '/api/teams/:team/tasks/:id/done',
    check: ['team', 'id'],
    fields: ['as', 'retryRequest'],
    call: async (cmds, ctx) => cmds.doneTask(ctx.deps, { id: ctx.params.id!, as: actorOf(ctx) }),
  },
  {
    pattern: '/api/teams/:team/gates/:gateId/resolve',
    check: ['team', 'gateId'],
    fields: ['resolution', 'reassign', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { resolution, reassign } = ctx.body
      checkParam('resolution', resolution)
      if (reassign !== undefined) checkParam('reassign', reassign)
      const target = reassign ? (reassign.includes('@') ? reassign : (checkParam('post', reassign), postAddress(reassign, ctx.params.team!))) : undefined
      return cmds.resolveGate(ctx.deps, { gateId: ctx.params.gateId!, resolution, reassign: target })
    },
  },
  {
    pattern: '/api/teams/:team/posts/:post/freeze',
    check: ['team', 'post'],
    fields: ['reason', 'retryRequest'],
    call: async (cmds, ctx) => {
      checkParam('reason', ctx.body.reason)
      return cmds.freezePostCmd(ctx.deps, { address: postAddress(ctx.params.post!, ctx.params.team!), reason: ctx.body.reason })
    },
  },
  {
    pattern: '/api/teams/:team/posts/:post/unfreeze',
    check: ['team', 'post'],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.unfreezePostCmd(ctx.deps, { address: postAddress(ctx.params.post!, ctx.params.team!) }),
  },
  {
    pattern: '/api/teams/:team/posts/:post/hush',
    check: ['team', 'post'],
    fields: ['forMs', 'retryRequest'],
    call: async (cmds, ctx) => {
      checkNumber('forMs', ctx.body.forMs)
      return cmds.hushCmd(ctx.deps, { address: postAddress(ctx.params.post!, ctx.params.team!), forMs: ctx.body.forMs })
    },
  },
  {
    pattern: '/api/teams/:team/posts/:post/unhush',
    check: ['team', 'post'],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.unhushCmd(ctx.deps, { address: postAddress(ctx.params.post!, ctx.params.team!) }),
  },
  {
    pattern: '/api/teams/:team/questions/:messageId/reply',
    check: ['team', 'messageId'],
    fields: ['body', 'again', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { body, again } = ctx.body
      checkParam('body', body)
      checkBool('again', again)
      return cmds.dispatcherReply(ctx.deps, { team: ctx.params.team!, messageId: ctx.params.messageId!, body, again })
    },
  },
  {
    pattern: '/api/teams/:team/spec',
    check: ['team'],
    fields: ['yaml', 'baseHash', 'running', 'files', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { yaml, baseHash, running, files } = ctx.body
      checkParam('yaml', yaml)
      if (baseHash !== null) checkParam('baseHash', baseHash)
      if (typeof running !== 'boolean') throw new WinglineError('input', 'invalid_param', '参数 running 不合法')
      return cmds.saveSpecCmd(ctx.deps, { team: ctx.params.team!, yaml, baseHash, running, files })
    },
  },
  {
    pattern: '/api/teams/:team/spec/discard-draft',
    check: ['team'],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.discardDraftCmd(ctx.deps, { team: ctx.params.team! }),
  },
  {
    pattern: '/api/teams/:team/up',
    check: ['team'],
    fields: ['draft', 'newRun', 'adoptRun', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { draft, newRun, adoptRun } = ctx.body
      checkBool('draft', draft)
      checkBool('newRun', newRun)
      if (adoptRun !== undefined) checkParam('adoptRun', adoptRun)
      return cmds.up(ctx.deps, { team: ctx.params.team!, draft, newRun, adoptRun })
    },
  },
  {
    pattern: '/api/teams/:team/down',
    check: ['team'],
    fields: ['close', 'retryRequest'],
    call: async (cmds, ctx) => {
      checkBool('close', ctx.body.close)
      return cmds.down(ctx.deps, { team: ctx.params.team!, close: !!ctx.body.close })
    },
  },
  {
    pattern: '/api/teams/:team/restore',
    check: ['team'],
    fields: ['dryRun', 'noTasks', 'sessions', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { dryRun, noTasks } = ctx.body
      checkBool('dryRun', dryRun)
      checkBool('noTasks', noTasks)
      return cmds.restore(ctx.deps, { team: ctx.params.team!, dryRun: !!dryRun, noTasks: !!noTasks, sessions: parseSessions(ctx.body.sessions) })
    },
  },
  {
    pattern: '/api/teams/:team/dispatcher/up',
    check: ['team'],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.dispatcherUp(ctx.deps, { team: ctx.params.team! }),
  },
  {
    pattern: '/api/teams/:team/dispatcher/down',
    check: ['team'],
    fields: ['close', 'retryRequest'],
    call: async (cmds, ctx) => {
      checkBool('close', ctx.body.close)
      return cmds.dispatcherDown(ctx.deps, { team: ctx.params.team!, close: ctx.body.close ?? true })
    },
  },
  {
    pattern: '/api/teams',
    check: [],
    fields: ['mode', 'name', 'repo', 'template', 'dir', 'specPath', 'retryRequest'],
    call: async (cmds, ctx) => {
      const { mode, name, repo, template, dir, specPath } = ctx.body
      if (mode !== 'template' && mode !== 'import') throw new WinglineError('input', 'invalid_param', '参数 mode 不合法')
      for (const key of ['name', 'repo', 'template', 'dir', 'specPath'] as const) {
        if (ctx.body[key] !== undefined) checkParam(key, ctx.body[key])
      }
      return cmds.initTeamCmd(ctx.deps, { mode, name, repo, template, dir, specPath })
    },
  },
  {
    pattern: '/api/autostart/install',
    check: [],
    fields: ['waitOrca', 'retryRequest'],
    call: async (cmds, ctx) => {
      if (ctx.body.waitOrca !== undefined) checkParam('waitOrca', ctx.body.waitOrca)
      return cmds.autostartInstall(ctx.deps, { waitOrca: ctx.body.waitOrca })
    },
  },
  {
    pattern: '/api/autostart/uninstall',
    check: [],
    fields: ['retryRequest'],
    call: async (cmds, ctx) => cmds.autostartUninstall(ctx.deps),
  },
]

const ofAddress = (a: { address: string }) => a.address.split('@')[1] ?? '-'

/** 任务执行流的执行者：必填；不带 @ 时按本团队岗位解释，带 @ 时团队后缀必须一致。 */
function actorOf(ctx: HandlerContext): string {
  const raw = ctx.body.as
  if (typeof raw !== 'string' || !raw.trim()) throw new WinglineError('input', 'invalid_param', '参数 as 不合法')
  if (!raw.includes('@')) { checkParam('post', raw); return postAddress(raw, ctx.params.team!) }
  const [post, team] = raw.split('@')
  checkParam('post', post!)
  if (team !== ctx.params.team) throw new WinglineError('input', 'invalid_param', '执行者不属于该团队')
  return raw
}
const byTask = (idOf: (a: any) => string) => (_a: unknown, ctx: AuditCtx) => ctx.deps.registry.getTaskExt(idOf(_a))?.team ?? '-'
const byGate = (gateId: (a: any) => string) => (_a: unknown, ctx: AuditCtx) => ctx.deps.registry.getGate(gateId(_a))?.team ?? '-'

export const CONSOLE_AUDIT: AuditTable<WriteCommands> = {
  send: {
    command: 'send',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ message: a.message }),
  },
  createTask: {
    command: 'task create',
    team: (a) => a.team,
    target: (_a, ctx) => (ctx.result as { id?: string } | undefined)?.id ?? null,
    summary: (a) => ({ title: a.title, post: a.post, tags: a.tags, parent: a.parent }),
  },
  escalateTask: {
    command: 'task escalate',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ reason: a.reason, reopen: a.reopen }),
  },
  reassignTask: {
    command: 'task reassign',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ to: a.to }),
  },
  recoverTask: {
    command: 'task recover',
    team: byTask((a) => a.id),
    target: (a) => a.id,
  },
  resolveGate: {
    command: 'task resolve',
    team: byGate((a) => a.gateId),
    target: (a) => a.gateId,
    summary: (a) => ({ resolution: a.resolution, reassign: a.reassign }),
  },
  claimTask: {
    command: 'task claim',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ as: a.as }),
  },
  releaseTask: {
    command: 'task release',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ as: a.as }),
  },
  planTask: {
    command: 'task plan',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ as: a.as, text: a.text }),
  },
  startTask: {
    command: 'task start',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ as: a.as }),
  },
  doneTask: {
    command: 'task done',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ as: a.as }),
  },
  freezePostCmd: {
    command: 'dispatcher freeze',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ reason: a.reason }),
  },
  unfreezePostCmd: {
    command: 'dispatcher unfreeze',
    team: ofAddress,
    target: (a) => a.address,
  },
  hushCmd: {
    command: 'dispatcher hush',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ forMs: a.forMs }),
  },
  unhushCmd: {
    command: 'dispatcher unhush',
    team: ofAddress,
    target: (a) => a.address,
  },
  dispatcherReply: {
    command: 'dispatcher reply',
    team: (a) => a.team,
    target: (a) => a.messageId,
    summary: (a) => ({ body: a.body, again: a.again }),
  },
  // 不记 yaml 正文：参数侧只留 baseHash / running，结果侧留 wrote / hash
  saveSpecCmd: {
    command: 'spec save',
    team: (a) => a.team,
    target: (_a, ctx) => (ctx.result as { path?: string } | undefined)?.path ?? null,
    summary: (a, ctx) => {
      const r = ctx.result as { wrote?: string; hash?: string } | undefined
      // 哈希只留前 16 位：完整的 64 位会被审计摘要的 60 字符上限截断
      return { baseHash: a.baseHash?.slice(0, 16), running: a.running, wrote: r?.wrote, hash: r?.hash?.slice(0, 16) }
    },
  },
  discardDraftCmd: {
    command: 'spec discard-draft',
    team: (a) => a.team,
    summary: (_a, ctx) => ({ discarded: (ctx.result as { discarded?: boolean } | undefined)?.discarded }),
  },
  up: {
    command: 'up',
    team: (a) => a.team,
    summary: (a) => ({ draft: a.draft, newRun: a.newRun, adoptRun: a.adoptRun }),
  },
  down: {
    command: 'down',
    team: (a) => a.team,
    summary: (a) => ({ close: a.close }),
  },
  restore: {
    command: 'restore',
    team: (a) => a.team,
    skip: (a) => !!a.dryRun,
    summary: (a) => ({ dryRun: a.dryRun, noTasks: a.noTasks, session: Object.keys(a.sessions ?? {}) }),
  },
  dispatcherUp: {
    command: 'dispatcher up',
    team: (a) => a.team,
  },
  dispatcherDown: {
    command: 'dispatcher down',
    team: (a) => a.team,
    summary: (a) => ({ close: a.close }),
  },
  initTeamCmd: {
    command: 'init',
    // 新建团队没有 :team 路径参数：团队名从结果里取
    team: (_a, ctx) => (ctx.result as { team?: string } | undefined)?.team ?? '-',
    summary: (a, ctx) => ({ mode: a.mode, template: a.template, created: (ctx.result as { created?: boolean } | undefined)?.created }),
  },
  autostartInstall: {
    command: 'autostart install',
    team: () => '-',
    summary: (a) => ({ waitOrca: a.waitOrca }),
  },
  autostartUninstall: {
    command: 'autostart uninstall',
    team: () => '-',
  },
}

/** 控制台用 `console:`，TUI 用 `tui:`；两者共用同一张审计表，执行者都是 human。 */
export function auditedWriteCommands(prefix: 'console:' | 'tui:'): WriteCommands {
  const raw: WriteCommands = {
    send,
    createTask,
    escalateTask,
    reassignTask,
    recoverTask,
    resolveGate,
    // 任务执行流：控制台口径只透传 id/as（+plan 的 text），resumeEpoch 等其余参数不暴露
    claimTask: (deps, a) => claimTask(deps, { id: a.id, as: a.as }),
    releaseTask: (deps, a) => releaseTask(deps, { id: a.id, as: a.as }),
    planTask: (deps, a) => planTask(deps, { id: a.id, as: a.as, text: a.text }),
    startTask: (deps, a) => startTask(deps, { id: a.id, as: a.as }),
    doneTask: (deps, a) => doneTask(deps, { id: a.id, as: a.as }),
    freezePostCmd,
    unfreezePostCmd,
    hushCmd,
    unhushCmd,
    dispatcherReply,
    saveSpecCmd,
    discardDraftCmd,
    // core 的 up 吃 specPath，控制台给的是 team 名：包装层先查注册表换算
    up: async (deps, a) => {
      const row = deps.registry.getTeam(a.team)
      if (!row) throw new WinglineError('input', 'team_unknown', `团队 ${a.team} 未登记`)
      return up(deps, { specPath: row.specPath, draft: a.draft, newRun: a.newRun, adoptRun: a.adoptRun })
    },
    down: (deps, a) => down(deps, { team: a.team, close: !!a.close }),
    restore: (deps, a) => restore(deps, { team: a.team, dryRun: !!a.dryRun, noTasks: !!a.noTasks, sessions: a.sessions }),
    dispatcherUp: (deps, a) => dispatcherUp(deps, { team: a.team }),
    dispatcherDown: (deps, a) => dispatcherDown(deps, { team: a.team, close: a.close ?? true }),
    initTeamCmd,
    // 系统宿主（launchd/systemd）只有真实执行时才能取：默认 realAutostartSys，测试经 cmds 注入替换
    autostartInstall: (deps, a) => autostartInstall(deps, realAutostartSys(), { waitOrca: a.waitOrca }),
    autostartUninstall: (deps) => autostartUninstall(deps, realAutostartSys()),
  }
  return auditedCommands(raw, CONSOLE_AUDIT, { prefix, actor: 'human' })
}

export const consoleCommands = (): WriteCommands => auditedWriteCommands('console:')

function assertExactFields(body: any, allowed: readonly string[]): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new WinglineError('input', 'unknown_field', '请求体必须是 JSON 对象')
  }
  const allowedSet = new Set(allowed)
  for (const k of Object.keys(body)) {
    if (!allowedSet.has(k)) {
      throw new WinglineError('input', 'unknown_field', `未知字段 ${k}`)
    }
  }
}

export function registerWriteRoutes(r: Router, cmds: WriteCommands): void {
  for (const spec of WRITE_ROUTES) {
    r.post(spec.pattern, async (ctx: HandlerContext) => {
      for (const key of spec.check) {
        checkParam(key, ctx.params[key])
      }
      assertExactFields(ctx.body, spec.fields)
      if (ctx.body.retryRequest !== undefined) checkParam('retryRequest', ctx.body.retryRequest)
      return spec.call(cmds, ctx)
    })
  }
}
