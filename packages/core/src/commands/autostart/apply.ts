import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../../errors.js'
import type { AutostartPlan } from './plan.js'

export type Exec = (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>
export type FsLike = Pick<typeof fs, 'mkdirSync' | 'writeFileSync' | 'readFileSync' | 'renameSync' | 'rmSync' | 'existsSync' | 'statSync'>

/** autostart.log 超过这个大小，安装时先改名为 autostart.log.1（覆盖已有的 .1）。 */
export const LOG_ROTATE_BYTES = 1024 * 1024

type Step = NonNullable<AutostartPlan['probe']>
type Reply = Awaited<ReturnType<Exec>>

/** 命令起不来（ENOENT 等）按退出码 127 处理，不让它直接抛出去。 */
async function run(exec: Exec, c: Step): Promise<Reply> {
  try {
    return await exec(c.file, c.args)
  } catch (err) {
    return { code: 127, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
  }
}

function failure(c: Step, r: Reply): WinglineError {
  const out = r.stderr.trim() || r.stdout.trim()
  return new WinglineError('internal', 'autostart_failed', `${c.file} ${c.args.join(' ')} 失败（退出码 ${r.code}）${out ? `：${out}` : ''}`, {
    detail: { stdout: r.stdout, stderr: r.stderr },
  })
}

function rotateLog(logPath: string, fsx: FsLike): void {
  if (!fsx.existsSync(logPath) || fsx.statSync(logPath).size <= LOG_ROTATE_BYTES) return
  fsx.rmSync(`${logPath}.1`, { force: true })
  fsx.renameSync(logPath, `${logPath}.1`)
}

/**
 * 写文件（先写临时文件再改名）并注册；注册失败则恢复原来的文件（原来没有就删掉刚写的），不留半成品。
 * Linux 上没有 systemd 用户会话 → autostart_unsupported，什么都不写。
 */
export async function applyAutostart(plan: AutostartPlan, exec: Exec, fsx: FsLike = fs): Promise<void> {
  if (plan.probe) {
    const r = await run(exec, plan.probe)
    if (r.code !== 0) {
      throw new WinglineError('input', 'autostart_unsupported', '没有可用的 systemd 用户会话，无法安装自启动', {
        hint: `登录后请手动执行 wl restore --all${r.stderr.trim() ? `（${r.stderr.trim()}）` : ''}`,
      })
    }
  }
  fsx.mkdirSync(path.dirname(plan.file.path), { recursive: true })
  fsx.mkdirSync(path.dirname(plan.logPath), { recursive: true })
  rotateLog(plan.logPath, fsx)
  const previous = fsx.existsSync(plan.file.path) ? fsx.readFileSync(plan.file.path, 'utf8') : null
  const tmp = `${plan.file.path}.tmp`
  try {
    fsx.writeFileSync(tmp, plan.file.content)
    fsx.renameSync(tmp, plan.file.path)
    for (const c of plan.register) {
      const r = await run(exec, c)
      if (r.code !== 0 && !c.allowFail) throw failure(c, r)
    }
  } catch (err) {
    fsx.rmSync(tmp, { force: true })
    if (previous !== null) fsx.writeFileSync(plan.file.path, previous)
    else fsx.rmSync(plan.file.path, { force: true })
    throw err instanceof WinglineError ? err : new WinglineError('internal', 'autostart_failed', `安装自启动失败：${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

/** 从服务管理器注销并删除自己的文件（日志留着）；没安装过也算成功。 */
export async function removeAutostart(plan: AutostartPlan, exec: Exec, fsx: FsLike = fs): Promise<{ removed: boolean }> {
  for (const c of plan.unregister) await run(exec, c)
  const removed = fsx.existsSync(plan.file.path)
  fsx.rmSync(plan.file.path, { force: true })
  return { removed }
}
