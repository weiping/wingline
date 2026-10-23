import { parseDuration } from '../dispatcher/controls.js'
import type { CommandDeps } from '../deps.js'
import { applyAutostart, removeAutostart, type Exec, type FsLike } from './apply.js'
import { installedCommand, planAutostart, type AutostartPlan } from './plan.js'
import { autostartStatus, type AutostartStatus } from './status.js'

export { applyAutostart, removeAutostart, type Exec, type FsLike } from './apply.js'
export { installedCommand, planAutostart, type AutostartPlan, type AutostartPlatform, type PlanOptions } from './plan.js'
export { autostartStatus, type AutostartStatus } from './status.js'

/** 登录时 Orca 常常还没起来：默认最多等 15 分钟。 */
export const DEFAULT_WAIT_ORCA = '15m'

/** 宿主环境（平台、用户、node、入口脚本、系统命令与文件系统），由 CLI 注入，测试里不碰真实系统。 */
export interface AutostartSys {
  platform: NodeJS.Platform
  homeDir: string
  uid?: number
  user?: string
  node: string
  script: string
  exec: Exec
  fs: FsLike
}

function planOf(deps: CommandDeps, sys: AutostartSys, waitOrca: string): AutostartPlan {
  return planAutostart({
    platform: sys.platform, homeDir: sys.homeDir, uid: sys.uid, user: sys.user, node: sys.node, script: sys.script,
    home: deps.home, orca: deps.orcaPath, waitOrca,
  })
}

export async function autostartInstall(deps: CommandDeps, sys: AutostartSys, a: { waitOrca?: string } = {}) {
  const waitOrca = a.waitOrca ?? DEFAULT_WAIT_ORCA
  parseDuration(waitOrca)
  const plan = planOf(deps, sys, waitOrca)
  await applyAutostart(plan, sys.exec, sys.fs)
  return { platform: plan.platform, file: plan.file.path, command: installedCommand(plan.platform, plan.file.content), logPath: plan.logPath, waitOrca }
}

export async function autostartUninstall(deps: CommandDeps, sys: AutostartSys) {
  const plan = planOf(deps, sys, DEFAULT_WAIT_ORCA)
  return { file: plan.file.path, ...(await removeAutostart(plan, sys.exec, sys.fs)) }
}

export async function autostartStatusOf(deps: CommandDeps, sys: AutostartSys): Promise<AutostartStatus & { platform: string; user?: string; logPath: string }> {
  const plan = planOf(deps, sys, DEFAULT_WAIT_ORCA)
  const status = await autostartStatus(plan, sys.exec, {
    readFile: (p) => sys.fs.readFileSync(p, 'utf8'),
    exists: (p) => sys.fs.existsSync(p),
  })
  return { ...status, platform: plan.platform, ...(plan.user !== undefined ? { user: plan.user } : {}), logPath: plan.logPath }
}
