import { WinglineError } from './errors.js'
import type { CommandDeps } from './commands/deps.js'
import { actorOf, resolveActor } from './commands/task/identity.js'

/** 命令执行后的可见上下文：团队名有的要查注册表（任务 id、gate id），有的只能从结果里取（up）。 */
export interface AuditCtx {
  deps: CommandDeps
  result?: unknown
  failed: boolean
}

export interface AuditEntry<A> {
  /** 审计 command 列里记的名字，用 CLI 风格（如 `task done`、`dispatcher freeze`）。 */
  command: string
  team: (a: A, ctx: AuditCtx) => string
  /** 任务创建这类只有结果里才有 id 的命令，从 ctx.result 取。 */
  target?: (a: A, ctx: AuditCtx) => string | null
  /** 只放位置参数与开关；正文类字段会在写入前统一 clip。 */
  summary?: (a: A) => Record<string, unknown>
  /** 返回 true 就不写这一行（如 restore --dry-run）。 */
  skip?: (a: A) => boolean
}

export type AuditTable<C> = { [K in keyof C]?: AuditEntry<Parameters<Extract<C[K], (...x: any) => any>>[1]> }

/** CLI Commands 里属于写命令的字段：每一条都要在审计表里登记。 */
export const WRITE_COMMANDS: readonly string[] = [
  'up', 'down', 'restore', 'send', 'createTask', 'claimTask', 'releaseTask', 'reassignTask', 'startTask', 'planTask',
  'doneTask', 'escalateTask', 'resolveGate', 'recoverTask', 'dispatcherUp', 'dispatcherDown', 'freezePostCmd',
  'unfreezePostCmd', 'hushCmd', 'unhushCmd', 'dispatcherReply',
]

/** 换行与控制字符换成空格（一一对应，长度不变），超长截断并标明原长。 */
const CONTROL = /[\x00-\x1f\x7f]/g

export function clip(s: string, n = 60): string {
  const flat = s.replace(CONTROL, ' ')
  return flat.length <= n ? flat : `${flat.slice(0, n)}…（共 ${flat.length} 字）`
}

/** 命令一律吃 deps 打头；后面的参数不限于一个（follow 类的命令还要 emit 与信号）。 */
type Command = (deps: CommandDeps, ...a: any[]) => Promise<unknown>

export interface AuditOptions {
  /** command 列的前缀，给包在更大界面里的调用方（3B）区分来源用。 */
  prefix?: string
  /** 命令参数里没有 `--as` 时的执行者。 */
  actor?: string
}

/** 摘要里的字符串统一截断；未填的开关不记。 */
function summaryOf(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue
    out[k] = typeof v === 'string' ? clip(v) : v
  }
  return out
}

/**
 * 写一行审计。任何一步出错都只 warn 一次：命令的结果与退出码不因此改变。
 * 执行者在命令执行之后才解析，解析不出来记 `unknown`、不重试（Orca 不可达时不该再多一次失败调用）。
 */
async function write(deps: CommandDeps, entry: AuditEntry<any>, a: any, outcome: string, o: AuditOptions, result?: unknown): Promise<void> {
  try {
    const as = (a as { as?: string } | null | undefined)?.as ?? o.actor
    let actor = 'unknown'
    try {
      // 复审 I-1a：actor 是用户可控的 --as 值，压平控制字符，别让 wl log 里的行被伪造
      actor = clip(actorOf(await resolveActor(deps, as)).actor)
    } catch {
      // Orca 不可达：记 unknown
    }
    const detail = entry.summary ? summaryOf(entry.summary(a)) : undefined
    const ctx: AuditCtx = { deps, result, failed: outcome !== 'ok' }
    deps.registry.appendAudit({
      team: entry.team(a, ctx),
      actor,
      command: o.prefix ? `${o.prefix} ${entry.command}` : entry.command,
      target: entry.target?.(a, ctx) ?? null,
      outcome,
      ...(detail !== undefined ? { detail } : {}),
    })
  } catch (err) {
    deps.warn(`审计写入失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 表里有的命令包一层审计；表里没有的原样返回。 */
export function auditedCommands<C extends { [K in keyof C]: Command }>(c: C, table: AuditTable<C>, o: AuditOptions = {}): C {
  const out: Record<string, unknown> = {}
  for (const name of Object.keys(c) as Array<keyof C & string>) {
    const fn = c[name] as Command
    const entry = table[name] as AuditEntry<any> | undefined
    if (!entry) {
      out[name] = fn
      continue
    }
    out[name] = async (deps: CommandDeps, a: any) => {
      if (entry.skip?.(a)) return fn(deps, a)
      try {
        const result = await fn(deps, a)
        await write(deps, entry, a, 'ok', o, result)
        return result
      } catch (err) {
        await write(deps, entry, a, err instanceof WinglineError ? `${err.kind}:${err.code}` : 'internal:unknown', o)
        throw err
      }
    }
  }
  return out as C
}
