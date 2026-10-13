import { WinglineError } from '../errors.js'

const CMD_META = /[\^&|<>()!"]/g

/** Quote per MSVCRT argv rules, then neutralise cmd.exe metacharacters. */
export function escapeCmdArg(arg: string): string {
  if (arg.includes('\n') || arg.includes('\r')) {
    throw new WinglineError('input', 'cmd_newline_unsupported', 'Windows .cmd 包装无法安全传递换行', {
      hint: '安装 orca.exe 或设置 WINGLINE_ORCA 指向 orca.exe',
    })
  }
  const quoted = '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"'
  return quoted.replace(CMD_META, '^$&').replace(/%/g, '%^')
}

/** Command line for `cmd.exe /d /s /c`; the outer quote pair is the one /s strips. */
export function buildCmdLine(cmdPath: string, args: string[]): string {
  return `""${cmdPath}" ${args.map(escapeCmdArg).join(' ')}"`
}
