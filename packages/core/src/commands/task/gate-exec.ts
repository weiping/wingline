import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../../errors.js'
import type { CommandDeps } from '../deps.js'

export interface GateExecResult {
  passed: boolean
  /** 完整输出（不截断）。 */
  output: string
  timedOut: boolean
  /** 被 Ctrl-C / SIGTERM 中断（不计为 gate 失败）。 */
  interrupted?: boolean
}

const TIMEOUT_MARK = '\n（gate 超时，已终止）'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 超时要杀整棵进程树：POSIX 杀进程组，Windows 用 taskkill /T。 */
function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      // 用绝对路径，不经 PATH 查找
      const exe = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
      spawn(exe, ['/T', '/F', '/PID', String(pid)], { shell: false, windowsHide: true, stdio: 'ignore' }).on('error', () => {})
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // 进程已经结束
  }
}

const SIGNALS = ['SIGINT', 'SIGTERM'] as const

function spawnGate(command: string, opts: { cwd: string; timeoutMs: number }): Promise<GateExecResult> {
  return new Promise((resolve) => {
    // gate 是用户在 team.yaml 里写的完整 shell 命令行，必须经 shell 解释（2A spec 第 3 节约束 6，总纲 §2.4）；全项目只此一处。
    const child = spawn(command, { shell: true, cwd: opts.cwd, detached: process.platform !== 'win32', windowsHide: true })
    const chunks: Buffer[] = []
    let timedOut = false
    let interrupted = false
    // 运行期间 Ctrl-C / SIGTERM：把 gate 的整个进程组一起杀掉，不留孤儿
    const onSignal = () => {
      interrupted = true
      killTree(child.pid!)
    }
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid!)
    }, opts.timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      SIGNALS.forEach((s) => process.off(s, onSignal))
    }
    SIGNALS.forEach((s) => process.on(s, onSignal))
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', (err) => {
      cleanup()
      resolve({ passed: false, output: `无法启动 gate：${err.message}`, timedOut: false })
    })
    child.on('close', (code) => {
      cleanup()
      const output = Buffer.concat(chunks).toString('utf8') + (timedOut ? TIMEOUT_MARK : '')
      resolve({ passed: code === 0 && !timedOut && !interrupted, output, timedOut, ...(interrupted ? { interrupted } : {}) })
    })
  })
}

export async function runGate(command: string | null, opts: { cwd: string; timeoutMs: number }): Promise<GateExecResult> {
  if (command === null) return { passed: true, output: '', timedOut: false }
  return spawnGate(command, opts)
}

/** 岗位 worktree 根目录：path:<abs> → abs；否则 worktree show；读不出 → gate_cwd_unknown（不退回到别处）。 */
export async function gateCwd(deps: CommandDeps, address: string): Promise<string> {
  const post = deps.registry.getPost(address)
  if (!post) throw new WinglineError('input', 'post_unknown', `岗位 ${address} 没有登记`, { hint: '先执行 wl up' })
  const selector = post.worktree
  if (selector.startsWith('path:')) return selector.slice('path:'.length)
  try {
    return (await deps.orca.worktreeShow({ worktree: selector })).path
  } catch (err) {
    throw new WinglineError('input', 'gate_cwd_unknown', `读不出岗位 ${address} 的 worktree 目录（${selector}）`, {
      hint: '确认 Orca 在运行且该 worktree 仍存在；gate 不会在其他目录里运行',
      cause: err,
    })
  }
}

/** 清理候选可能在列出之后被别的进程删掉：stat 不到就当没有。 */
function isStale(file: string, now: Date): boolean {
  try {
    return now.getTime() - fs.statSync(file).mtimeMs > WEEK_MS
  } catch {
    return false
  }
}

export const GATE_BODY_LIMIT = 4000

export const gateOutputPath = (home: string, team: string, taskId: string, epoch: number, n: number): string =>
  path.join(home, 'logs', team, `gate-${taskId}-${epoch}-${n}.txt`)

/** 删除 <home>/logs/<team>/ 下 7 天前的 gate-*.txt。 */
export function pruneGateOutputs(home: string, team: string, now: Date): void {
  const dir = path.join(home, 'logs', team)
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name)
    if (/^gate-.*\.txt$/.test(name) && isStale(file, now)) fs.rmSync(file, { force: true })
  }
}

/** 写 <home>/logs/<team>/gate-<task>-<epoch>-<n>.txt，写之前清理 7 天前的旧输出；返回路径。 */
export function writeGateOutput(home: string, team: string, taskId: string, epoch: number, n: number, output: string): string {
  fs.mkdirSync(path.join(home, 'logs', team), { recursive: true })
  pruneGateOutputs(home, team, new Date())
  const file = gateOutputPath(home, team, taskId, epoch, n)
  fs.writeFileSync(file, output)
  return file
}

/** --body：空输出 → null；multilineSafe 或无换行 → 末尾 GATE_BODY_LIMIT 字符；否则一行"gate 输出见 <路径>"。 */
export function gateBody(output: string, file: string, multilineSafe: boolean): string | null {
  if (output === '') return null
  if (multilineSafe || !/[\r\n]/.test(output)) return output.slice(-GATE_BODY_LIMIT)
  return `gate 输出见 ${file}`
}
