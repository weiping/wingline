import { spawn } from 'node:child_process'
import { WinglineError } from '../errors.js'
import type { CallLog } from '../log/call-log.js'
import { buildCmdLine } from './cmd-escape.js'
import type { OrcaExecutable } from './resolve.js'

export type OrcaEnvelope<T> =
  | { id: string; ok: true; result: T }
  | { id: string; ok: false; error: { code: string; message: string; data?: unknown } }

export interface RunOptions {
  timeoutMs?: number
}

export interface OrcaRunner {
  json<T>(args: string[], opts?: RunOptions): Promise<T>
  text(args: string[], opts?: RunOptions): Promise<string>
}

const DEFAULT_TIMEOUT_MS = 120_000
const EXCERPT = 500

interface Raw {
  stdout: string
  stderr: string
  exitCode: number | null
}

function exec(exe: OrcaExecutable, args: string[], timeoutMs: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const child = exe.viaCmd
      ? spawn(exe.file, [...exe.prefixArgs, buildCmdLine(exe.cmdPath!, args)], { windowsVerbatimArguments: true, shell: false })
      : spawn(exe.file, [...exe.prefixArgs, ...args], { shell: false })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d))
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        err.code === 'ENOENT'
          ? new WinglineError('input', 'orca_not_found', `无法启动 Orca：${exe.file}`, {
              hint: '请安装 Orca，或设置环境变量 WINGLINE_ORCA 指向它',
              cause: err,
            })
          : new WinglineError('internal', 'spawn_failed', `无法启动 Orca：${err.message}`, { cause: err }),
      )
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new WinglineError('uncertain', 'orca_timeout', `Orca 调用超过 ${timeoutMs} ms，结果不确定`, { detail: { stdout, stderr } }))
      } else {
        resolve({ stdout, stderr, exitCode })
      }
    })
  })
}

export function createOrcaRunner(exe: OrcaExecutable, log: CallLog): OrcaRunner {
  async function run(args: string[], opts: RunOptions | undefined): Promise<Raw> {
    const started = Date.now()
    let raw: Raw | undefined
    try {
      raw = await exec(exe, args, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      return raw
    } finally {
      log.record({
        args,
        ms: Date.now() - started,
        exitCode: raw?.exitCode ?? null,
        stdout: raw?.stdout ?? '',
        stderr: raw?.stderr ?? '',
      })
    }
  }

  return {
    async text(args, opts) {
      return (await run(args, opts)).stdout
    },
    async json<T>(args: string[], opts?: RunOptions): Promise<T> {
      const raw = await run([...args, '--json'], opts)
      let env: OrcaEnvelope<T>
      try {
        env = JSON.parse(raw.stdout) as OrcaEnvelope<T>
      } catch (cause) {
        throw new WinglineError(
          'internal',
          'bad_json',
          `Orca 输出不是 JSON（可能是 Orca 版本不兼容）：${raw.stdout.slice(0, EXCERPT)}\n日志：${log.path()}`,
          { detail: { stderr: raw.stderr, exitCode: raw.exitCode }, cause },
        )
      }
      if (env.ok) return env.result
      throw new WinglineError('orca', env.error.code, env.error.message, {
        detail: env.error.data,
        hint: env.error.code === 'runtime_unavailable' ? '运行 orca open 启动 Orca' : undefined,
      })
    },
  }
}
