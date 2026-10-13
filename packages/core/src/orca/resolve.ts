import { WinglineError } from '../errors.js'

export interface OrcaExecutable {
  file: string
  prefixArgs: string[]
  viaCmd: boolean
  /** The .cmd wrapper to run through cmd.exe; set only when viaCmd. */
  cmdPath?: string
  source: 'WINGLINE_ORCA' | 'ORCA_CLI_COMMAND' | 'path'
}

export interface ResolveOptions {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  which: (name: string) => string | null
}

function direct(file: string, source: OrcaExecutable['source']): OrcaExecutable {
  return { file, prefixArgs: [], viaCmd: false, source }
}

function viaCmd(cmdPath: string, env: NodeJS.ProcessEnv, source: OrcaExecutable['source']): OrcaExecutable {
  return { file: env.ComSpec ?? 'cmd.exe', prefixArgs: ['/d', '/s', '/c'], viaCmd: true, cmdPath, source }
}

function fromExplicit(file: string, o: ResolveOptions, source: OrcaExecutable['source']): OrcaExecutable {
  return o.platform === 'win32' && /\.(cmd|bat)$/i.test(file) ? viaCmd(file, o.env, source) : direct(file, source)
}

export function resolveOrcaExecutable(o: ResolveOptions): OrcaExecutable {
  if (o.env.WINGLINE_ORCA) return fromExplicit(o.env.WINGLINE_ORCA, o, 'WINGLINE_ORCA')
  if (o.env.ORCA_CLI_COMMAND) return fromExplicit(o.env.ORCA_CLI_COMMAND, o, 'ORCA_CLI_COMMAND')

  if (o.platform === 'win32') {
    const exe = o.which('orca.exe')
    if (exe) return direct(exe, 'path')
    const cmd = o.which('orca.cmd')
    if (cmd) return viaCmd(cmd, o.env, 'path')
  } else {
    // 自动解析时 Linux 永不使用裸 orca：它通常是 GNOME 读屏器
    const found = o.which(o.platform === 'linux' ? 'orca-ide' : 'orca')
    if (found) return direct(found, 'path')
  }
  throw new WinglineError('input', 'orca_not_found', '找不到 Orca 可执行文件', {
    hint: '请安装 Orca，或设置环境变量 WINGLINE_ORCA 指向它',
  })
}
