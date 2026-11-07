import type { AuditCtx, AuditTable } from './audit.js'
import type { CommandDeps } from './commands/deps.js'

/** 审计表里命令的最小形状：吃 deps 打头，后面参数不限于一个。 */
type AnyCommand = (deps: CommandDeps, ...a: any[]) => Promise<unknown>

/** 地址参数取 `@` 之后的团队名；解析不出（没有 `@`）记 `-`。 */
const ofAddress = (a: { address: string }): string => a.address.split('@')[1] ?? '-'

/** 任务 id 的团队名从注册表查；查不到（任务不存在、已被清理）记 `-`。 */
const byTask = (idOf: (a: any) => string) => (_a: unknown, ctx: AuditCtx): string =>
  ctx.deps.registry.getTaskExt(idOf(_a))?.team ?? '-'

const byGate = (gateId: (a: any) => string) => (_a: unknown, ctx: AuditCtx): string =>
  ctx.deps.registry.getGate(gateId(_a))?.team ?? '-'

/** 只有结果里才有团队名（up 成功时）；失败或没跑出结果记 `-`。 */
const byResult = (_a: unknown, ctx: AuditCtx): string => (ctx.result as { team?: string } | undefined)?.team ?? '-'

const id = (a: { id: string }) => a.id

/**
 * 写命令 → 审计行（spec 6.2、6.3）。摘要只放位置参数与开关：正文与理由类字段统一由
 * `auditedCommands` 截到 60 字，规格文件、webhook 地址、会话标记都不进摘要。
 *
 * 表放在 core 而不是 CLI 包：CLI、控制台（3B）与 Orca 插件都写同一批审计行，
 * 谁调用都得是同一张表，否则「同一件事、两种记录」就查不清了。
 */
/** 审计表条目的宽松形状；定型由 coreAuditTable 按调用方的命令集完成。 */
interface LooseEntry {
  command: string
  team: (a: any, ctx: AuditCtx) => string
  target?: (a: any, ctx: AuditCtx) => string | null
  summary?: (a: any, ctx: AuditCtx) => Record<string, unknown>
  skip?: (a: any) => boolean
}

const ENTRIES: Record<string, LooseEntry> = {
  init: {
    command: 'init',
    team: byResult,
    summary: (a, ctx) => ({ mode: a.mode, template: a.template, created: (ctx.result as { created?: boolean } | undefined)?.created })
  },
  up: {
    command: 'up',
    team: byResult,
    summary: (a) => ({ adoptRun: a.adoptRun, newRun: a.newRun, draft: a.draft })
  },
  down: { command: 'down', team: (a) => a.team, summary: (a) => ({ close: a.close }) },
  restore: {
    command: 'restore',
    team: (a) => a.team,
    skip: (a) => !!a.dryRun,
    summary: (a) => ({ dryRun: !!a.dryRun, noTasks: !!a.noTasks, session: Object.keys(a.sessions ?? {}) })
  },
  send: { command: 'send', team: ofAddress, target: (a) => a.address, summary: (a) => ({ message: a.message }) },
  createTask: {
    command: 'task create',
    team: (a) => a.team,
    target: (_a, ctx) => (ctx.result as { id?: string } | undefined)?.id ?? null,
    summary: (a) => ({ title: a.title, post: a.post, tags: a.tags, parent: a.parent, as: a.as })
  },
  claimTask: { command: 'task claim', team: byTask(id), target: id, summary: (a) => ({ as: a.as }) },
  releaseTask: { command: 'task release', team: byTask(id), target: id, summary: (a) => ({ as: a.as }) },
  reassignTask: { command: 'task reassign', team: byTask(id), target: id, summary: (a) => ({ to: a.to }) },
  startTask: { command: 'task start', team: byTask(id), target: id, summary: (a) => ({ as: a.as }) },
  planTask: { command: 'task plan', team: byTask(id), target: id, summary: (a) => ({ text: a.text }) },
  doneTask: { command: 'task done', team: byTask(id), target: id, summary: (a) => ({ as: a.as, resumeEpoch: a.resumeEpoch }) },
  escalateTask: {
    command: 'task escalate',
    team: byTask(id),
    target: (a) => a.id,
    summary: (a) => ({ reason: a.reason, reopen: a.reopen, as: a.as })
  },
  resolveGate: {
    command: 'task resolve',
    team: byGate((a) => a.gateId),
    target: (a) => a.gateId,
    summary: (a) => ({ resolution: a.resolution, reassign: a.reassign, as: a.as })
  },
  recoverTask: { command: 'task recover', team: byTask(id), target: (a) => a.id, summary: (a) => ({ as: a.as }) },
  dispatcherUp: { command: 'dispatcher up', team: (a) => a.team, summary: (a) => ({ platform: a.platform }) },
  dispatcherDown: { command: 'dispatcher down', team: (a) => a.team, summary: (a) => ({ close: a.close }) },
  freezePostCmd: { command: 'dispatcher freeze', team: ofAddress, target: (a) => a.address, summary: (a) => ({ reason: a.reason }) },
  unfreezePostCmd: { command: 'dispatcher unfreeze', team: ofAddress, target: (a) => a.address },
  hushCmd: { command: 'dispatcher hush', team: ofAddress, target: (a) => a.address, summary: (a) => ({ forMs: a.forMs }) },
  unhushCmd: { command: 'dispatcher unhush', team: ofAddress, target: (a) => a.address },
  dispatcherReply: {
    command: 'dispatcher reply',
    team: (a) => a.team,
    target: (a) => a.messageId,
    summary: (a) => ({ body: a.body, again: a.again })
  }
}

/** 取一张按调用方命令集定型的审计表；内容始终是同一张表。 */
export function coreAuditTable<C extends { [K in keyof C]: (deps: CommandDeps, ...a: any[]) => Promise<unknown> }>(): AuditTable<C> {
  return ENTRIES as unknown as AuditTable<C>
}

/** 宽松版：给不想定型的一方（如插件 worker）用。 */
export const CORE_AUDIT: AuditTable<Record<string, AnyCommand>> = coreAuditTable()
