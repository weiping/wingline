import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import type { CommandDeps } from './deps.js'

export const WINDOWS_UNSAFE = /["%$`]/

export interface SelfSpec {
  platform: NodeJS.Platform
  node: string
  script: string
  args: string[]
  home: string
  orca: string
  nodeOnPath?: boolean
}

/** 检查 Windows PATH 环境变量中是否存在 node.exe。 */
export function nodeOnPath(deps: CommandDeps): boolean {
  const dirs = (deps.env.PATH ?? deps.env.Path ?? '').split(path.delimiter).filter(Boolean)
  return dirs.some((d) => fs.existsSync(path.join(d, 'node.exe')))
}

function defaultUnsupported(why: string): WinglineError {
  return new WinglineError('input', 'self_launch_unsupported', `无法自动拼出启动命令：${why}`, {
    hint: 'Windows 上无法自动启动：请检查 PATH 或路径参数',
  })
}

/**
 * 组装自执行子命令的入口文件与参数列表（调度员、控制台等共用）。
 * Windows 下做前置安全校验：PATH 上必须有 node，路径与参数不能含 " % $ ` 等特殊字符。
 */
export function selfCommand(
  a: SelfSpec,
  o?: { unsupported?: (why: string) => WinglineError },
): { file: string; args: string[] } {
  const fail = o?.unsupported ?? defaultUnsupported
  if (a.platform === 'win32') {
    if (!a.nodeOnPath) throw fail('PATH 上找不到 node')
    if ([a.script, a.home, a.orca, ...a.args].some((p) => WINDOWS_UNSAFE.test(p))) {
      throw fail('路径含有 " % $ ` 之一')
    }
    return {
      file: 'node',
      args: [a.script, ...a.args, '--home', a.home, '--orca', a.orca],
    }
  }
  return {
    file: a.node,
    args: [a.script, ...a.args, '--home', a.home, '--orca', a.orca],
  }
}

const posixQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
const winQuote = (s: string) => `"${s}"`

function shouldQuote(arg: string, index: number, args: string[]): boolean {
  if (index === 0) return true
  if (index > 0 && (args[index - 1] === '--home' || args[index - 1] === '--orca')) return true
  if (/[\s'"]/.test(arg)) return true
  return false
}

/**
 * 将 { file, args } 渲染为可在 Orca 终端执行的命令行文本。
 * POSIX 使用单引号转义，Windows 使用双引号包裹路径。
 */
export function commandLine(c: { file: string; args: string[] }, platform: NodeJS.Platform): string {
  const win = platform === 'win32'
  const quote = win ? winQuote : posixQuote
  const head = win && c.file === 'node' ? 'node' : quote(c.file)
  const pieces = [head, ...c.args.map((a, i) => (shouldQuote(a, i, c.args) ? quote(a) : a))]
  return pieces.join(' ')
}
