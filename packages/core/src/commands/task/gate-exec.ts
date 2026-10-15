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
}

const TIMEOUT_MARK = '\n（gate 超时，已终止）'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 超时要杀整棵进程树：POSIX 杀进程组，Windows 用 taskkill /T。 */
function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { shell: false, windowsHide: true, stdio: 'ignore' })
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // 进程已经结束
  }
}

function spawnGate(command: string, opts: { cwd: string; timeoutMs: number }): Promise<GateExecResult> {
  return new Promise((resolve) => {
    // gate 是用户在 team.yaml 里写的完整 shell 命令行，必须经 shell 解释（2A spec 第 3 节约束 6，总纲 §2.4）；全项目只此一处。
    const child = spawn(command, { shell: true, cwd: opts.cwd, detached: process.platform !== 'win32', windowsHide: true })
    const chunks: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid!)
    }, opts.timeoutMs)
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ passed: false, output: `无法启动 gate：${err.message}`, timedOut: false })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8') + (timedOut ? TIMEOUT_MARK : '')
      resolve({ passed: code === 0 && !timedOut, output, timedOut })
    })
  })
}

export async function runGate(command: string | null, opts: { cwd: string; timeoutMs: number }): Promise<GateExecResult> {
  if (command === null) return { passed: true, output: '', timedOut: false }
  return spawnGate(command, opts)
}

/** 岗位 worktree 根目录：path:<abs> → abs；否则 worktree show；读不出 → gate_cwd_unknown（不退回到别处）。 */
export async function gateCwd(deps: CommandDeps, address: string): Promise<string> {
  const selector = deps.registry.getPost(address)!.worktree
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

export const GATE_BODY_LIMIT = 4000

/** 写 <home>/logs/<team>/gate-<task>-<epoch>-<n>.txt，写之前删除同目录 7 天前的 gate-*.txt；返回路径。 */
export function writeGateOutput(home: string, team: string, taskId: string, epoch: number, n: number, output: string): string {
  const dir = path.join(home, 'logs', team)
  fs.mkdirSync(dir, { recursive: true })
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name)
    if (/^gate-.*\.txt$/.test(name) && Date.now() - fs.statSync(file).mtimeMs > WEEK_MS) fs.rmSync(file)
  }
  const file = path.join(dir, `gate-${taskId}-${epoch}-${n}.txt`)
  fs.writeFileSync(file, output)
  return file
}

/** --body：空输出 → null；multilineSafe 或无换行 → 末尾 GATE_BODY_LIMIT 字符；否则一行"gate 输出见 <路径>"。 */
export function gateBody(output: string, file: string, multilineSafe: boolean): string | null {
  if (output === '') return null
  if (multilineSafe || !output.includes('\n')) return output.slice(-GATE_BODY_LIMIT)
  return `gate 输出见 ${file}`
}
