import { WinglineError } from '../errors.js'

const CMD_META = /[\^&|<>()!"]/g

/** Quote per MSVCRT argv rules, then neutralise cmd.exe metacharacters. */
export function escapeCmdArg(arg: string): string {
  if (arg.includes('\n') || arg.includes('\r')) {
    throw new WinglineError('input', 'cmd_newline_unsupported', 'Windows .cmd 包装无法安全传递换行', {
      hint: 'Orca 的 Windows 安装只提供 orca.cmd（1.4.224 实测），换行无法经 cmd.exe 传递：请改成单行，或把内容写进文件后只发送路径',
    })
  }
  const quoted = '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"'
  // % 之后插入 ^，让 cmd 把 %^NAME% 当作未定义变量而不展开；结尾的 % 后面已是 ^"，不能再加，否则会多出一个字面 ^
  return quoted.replace(CMD_META, '^$&').replace(/%(?!\^"$)/g, '%^')
}

// cmd.exe 的命令行上限是 8191 个字符，留出余量
const CMD_LINE_LIMIT = 8000

/** Command line for `cmd.exe /d /s /c`; the outer quote pair is the one /s strips. */
export function buildCmdLine(cmdPath: string, args: string[]): string {
  const line = `""${cmdPath}" ${args.map(escapeCmdArg).join(' ')}"`
  if (line.length > CMD_LINE_LIMIT) {
    throw new WinglineError('input', 'cmd_line_too_long', `经 orca.cmd 的命令行有 ${line.length} 个字符，超过 cmd.exe 的上限`, {
      hint: '内容太长：把它写进文件，只发送文件路径',
    })
  }
  return line
}
