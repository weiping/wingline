// 组装 wingline-core 需要的依赖：本地账本 + Orca 客户端。
// 与 wl CLI 用同一套 core 函数与同一条审计链；插件只是另一条入口。
import fs from 'node:fs'
import path from 'node:path'

import {
  auditedCommands,
  coreAuditTable,
  createCallLog,
  createOrcaClient,
  createOrcaRunner,
  Registry,
  initTeamCmd,
  resolveOrcaExecutable,
  winglineHome,
  type CommandDeps
} from '@weiping/wingline-core'

function which(name: string, env: NodeJS.ProcessEnv): string | null {
  const pathVar = env.PATH ?? ''
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        // 继续找下一个
      }
    }
  }
  return null
}

/** 一次性构造 deps；worker 生命周期内复用同一份。 */
export function createDeps(env: NodeJS.ProcessEnv = process.env): CommandDeps {
  const home = winglineHome(env)
  const exe = resolveOrcaExecutable({ env, platform: process.platform, which: (n) => which(n, env) })
  const runner = createOrcaRunner(exe, createCallLog(path.join(home, 'logs')))
  return {
    orca: createOrcaClient(runner),
    registry: Registry.open(path.join(home, 'state.db')),
    warn: (msg: string) => console.warn('[wingline]', msg),
    verifiedOrca: '>=1.4.214 <1.5.0',
    multilineSafe: !exe.viaCmd,
    home,
    orcaPath: exe.cmdPath ?? exe.file,
    env,
    now: () => new Date(),
    monotonic: () => performance.now()
  }
}

export function teamSummaries(deps: CommandDeps): Array<{
  name: string
  status: 'up' | 'stopped'
  runId: string | null
  posts: number
  specPath: string
}> {
  return deps.registry.listTeams().map((row) => ({
    name: row.name,
    status: row.status,
    runId: row.runId,
    posts: deps.registry.listPosts(row.name).length,
    specPath: row.specPath
  }))
}

/**
 * 与 CLI 同一张审计表、同一 actor（human），所以插件写出来的审计行和命令行写的是同一种东西。
 * 表在 core（core/src/audit-table.ts），CLI、控制台与插件共用。
 */
export function auditedInit() {
  return auditedCommands({ init: initTeamCmd }, coreAuditTable(), { actor: 'human' })
}
