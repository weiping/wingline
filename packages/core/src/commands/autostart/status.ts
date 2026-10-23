import type { Exec } from './apply.js'
import { installedCommand, type AutostartPlan } from './plan.js'

export const LOG_TAIL_LINES = 20

export interface AutostartStatus {
  installed: boolean
  location: string
  /** 已安装的文件里实际会执行的命令（按词拆开）；没安装为空。 */
  command: string[]
  /** 命令里已经不存在的 node / 入口脚本路径。 */
  commandMissing: string[]
  logTail: string[]
  /** Linux：`loginctl show-user` 的 Linger；读不到或非 Linux 为 undefined。 */
  linger: boolean | undefined
}

async function lingerOf(plan: AutostartPlan, exec: Exec): Promise<boolean | undefined> {
  if (plan.platform !== 'linux' || !plan.user) return undefined
  try {
    const r = await exec('/usr/bin/loginctl', ['show-user', plan.user, '-p', 'Linger'])
    const m = r.code === 0 ? /Linger=(yes|no)/.exec(r.stdout) : null
    return m ? m[1] === 'yes' : undefined
  } catch {
    return undefined
  }
}

function tailOf(read: () => string): string[] {
  try {
    return read().split(/\r?\n/).filter((l, i, all) => l !== '' || i < all.length - 1).slice(-LOG_TAIL_LINES)
  } catch {
    return []
  }
}

export async function autostartStatus(
  plan: AutostartPlan, exec: Exec, io: { readFile: (p: string) => string; exists: (p: string) => boolean },
): Promise<AutostartStatus> {
  const logTail = tailOf(() => io.readFile(plan.logPath))
  if (!io.exists(plan.file.path)) return { installed: false, location: plan.file.path, command: [], commandMissing: [], logTail, linger: undefined }
  const command = installedCommand(plan.platform, io.readFile(plan.file.path))
  return {
    installed: true, location: plan.file.path, command,
    commandMissing: command.slice(0, 2).filter((p) => !io.exists(p)),
    logTail, linger: await lingerOf(plan, exec),
  }
}
