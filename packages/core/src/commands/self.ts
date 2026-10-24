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

/**
 * 自启动（登录时由 launchd / systemd 执行）用的命令：登录时没有交互式 shell 的 PATH，所以 node、入口脚本、home、orca 全是绝对路径，
 * 且按目标平台的 path 规则判断（不用宿主的 path）。入口脚本先 resolve；其余不是绝对路径 → autostart_path_invalid。
 */
export function absoluteSelfCommand(a: SelfSpec): { file: string; args: string[] } {
  const P = a.platform === 'win32' ? path.win32 : path.posix
  const script = P.resolve(a.script)
  for (const [what, p] of [['node', a.node], ['home', a.home], ['orca', a.orca]] as const) {
    if (!P.isAbsolute(p)) {
      throw new WinglineError('input', 'autostart_path_invalid', `自启动命令里的 ${what} 必须是绝对路径：${p}`, { hint: '用绝对路径重新执行（--home / --orca），或检查 Node 的安装位置' })
    }
  }
  if (a.platform === 'win32' && [a.node, script, a.home, a.orca, ...a.args].some((p) => WINDOWS_UNSAFE.test(p))) {
    throw new WinglineError('input', 'autostart_path_invalid', '自启动命令里的路径含有 " % $ ` 之一')
  }
  return { file: a.node, args: [script, ...a.args, '--home', a.home, '--orca', a.orca] }
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
