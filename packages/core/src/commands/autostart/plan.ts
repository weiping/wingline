import path from 'node:path'
import { WinglineError } from '../../errors.js'
import { parseDuration } from '../dispatcher/controls.js'
import { absoluteSelfCommand } from '../self.js'

export type AutostartPlatform = 'darwin' | 'linux'

interface Step {
  file: string
  args: string[]
  /** 失败不算错（例如 bootout 一个还没加载的代理）。 */
  allowFail?: boolean
}

export interface AutostartPlan {
  platform: AutostartPlatform
  /** Linux：用来判断有没有 systemd 用户会话；失败 → autostart_unsupported。 */
  probe?: Step
  file: { path: string; content: string }
  logPath: string
  register: Step[]
  unregister: Step[]
  /** Linux：`loginctl show-user` 用。 */
  user?: string
}

export interface PlanOptions {
  platform: NodeJS.Platform
  homeDir: string
  uid?: number
  user?: string
  node: string
  script: string
  /** WINGLINE_HOME */
  home: string
  orca: string
  /** 如 `15m`，原样写进命令行。 */
  waitOrca: string
}

const P = path.posix
const LABEL = 'wingline.restore'
const UNIT = 'wingline-restore.service'
const SYSTEM_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const xmlUnescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** 登录时的 PATH 极简，orca 可能是 `#!/usr/bin/env node` 之类的脚本：显式带上 node 与 orca 所在目录（去重，node 在前）。 */
function pathEnv(node: string, orca: string): string {
  return [...new Set([P.dirname(node), P.dirname(orca), ...SYSTEM_DIRS])].join(':')
}

/** systemd 单元里的值：`\`、`"` 转义，`%` 写 `%%`。 */
const unitValue = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')

/** ExecStart 里的一个词：含空白、引号、反斜杠时用双引号包裹；`%` 写 `%%`，`$` 写 `$$`。 */
function execWord(arg: string): string {
  const escaped = unitValue(arg).replace(/\$/g, () => '$$')
  return /[\s"'\\]/.test(arg) ? `"${escaped}"` : escaped
}

function plist(command: string[], env: string, log: string): string {
  const s = (v: string) => `<string>${xmlEscape(v)}</string>`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>', `  ${s(LABEL)}`,
    '  <key>ProgramArguments</key>', '  <array>', ...command.map((c) => `    ${s(c)}`), '  </array>',
    '  <key>RunAtLoad</key>', '  <true/>',
    '  <key>EnvironmentVariables</key>', '  <dict>', '    <key>PATH</key>', `    ${s(env)}`, '  </dict>',
    '  <key>StandardOutPath</key>', `  ${s(log)}`,
    '  <key>StandardErrorPath</key>', `  ${s(log)}`,
    '</dict>', '</plist>', '',
  ].join('\n')
}

function unitFile(command: string[], env: string, log: string): string {
  const logPath = log.replace(/%/g, '%%')
  return [
    '[Unit]', 'Description=Wingline: restore teams after login', '',
    '[Service]', 'Type=oneshot', `Environment="PATH=${unitValue(env)}"`, `ExecStart=${command.map(execWord).join(' ')}`,
    `StandardOutput=append:${logPath}`, `StandardError=append:${logPath}`, '',
    '[Install]', 'WantedBy=default.target', '',
  ].join('\n')
}

const unsupported = (why: string) =>
  new WinglineError('input', 'autostart_unsupported', `这个平台暂不支持自启动：${why}`, { hint: '登录后请手动执行 wl restore --all' })

/** 纯函数：生成文件内容与要执行的系统命令，不碰文件系统。 */
export function planAutostart(o: PlanOptions): AutostartPlan {
  if (o.platform !== 'darwin' && o.platform !== 'linux') throw unsupported(o.platform === 'win32' ? 'Windows 要等探针 5 之后' : o.platform)
  parseDuration(o.waitOrca)
  const c = absoluteSelfCommand({
    platform: o.platform, node: o.node, script: o.script, home: o.home, orca: o.orca,
    args: ['restore', '--all', '--wait-orca', o.waitOrca, '--actor', 'autostart'],
  })
  const command = [c.file, ...c.args]
  const env = pathEnv(o.node, o.orca)
  const logPath = P.join(o.home, 'logs', 'autostart.log')
  if (o.platform === 'darwin') {
    if (o.uid === undefined) throw unsupported('无法确定用户 ID')
    const target = `gui/${o.uid}/${LABEL}`
    const file = P.join(o.homeDir, 'Library', 'LaunchAgents', `${LABEL}.plist`)
    const bootout = { file: '/bin/launchctl', args: ['bootout', target], allowFail: true }
    return {
      platform: 'darwin', file: { path: file, content: plist(command, env, logPath) }, logPath,
      register: [bootout, { file: '/bin/launchctl', args: ['bootstrap', `gui/${o.uid}`, file] }],
      unregister: [bootout],
    }
  }
  const systemctl = '/usr/bin/systemctl'
  return {
    platform: 'linux', ...(o.user !== undefined ? { user: o.user } : {}), logPath,
    probe: { file: systemctl, args: ['--user', 'show-environment'] },
    file: { path: P.join(o.homeDir, '.config', 'systemd', 'user', UNIT), content: unitFile(command, env, logPath) },
    register: [{ file: systemctl, args: ['--user', 'daemon-reload'] }, { file: systemctl, args: ['--user', 'enable', UNIT] }],
    unregister: [{ file: systemctl, args: ['--user', 'disable', UNIT], allowFail: true }, { file: systemctl, args: ['--user', 'daemon-reload'], allowFail: true }],
  }
}

/** 把 ExecStart 的一行拆回词（与 execWord 互逆）。 */
function tokenize(line: string): string[] {
  const out: string[] = []
  let cur: string | null = null
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '\\' && quoted) { cur = (cur ?? '') + (line[++i] ?? ''); continue }
    if (c === '"') { quoted = !quoted; cur = cur ?? ''; continue }
    if (!quoted && /\s/.test(c)) { if (cur !== null) out.push(cur); cur = null; continue }
    if ((c === '%' || c === '$') && line[i + 1] === c) i++
    cur = (cur ?? '') + c
  }
  if (cur !== null) out.push(cur)
  return out
}

/** 从已安装的文件里读出它实际会执行的命令（`wl autostart status` 用它检查 node 与入口脚本还在不在）。 */
export function installedCommand(platform: AutostartPlatform, content: string): string[] {
  if (platform === 'darwin') {
    const block = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(content)?.[1] ?? ''
    return [...block.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => xmlUnescape(m[1]!))
  }
  const line = content.split(/\r?\n/).find((l) => l.startsWith('ExecStart='))
  return line ? tokenize(line.slice('ExecStart='.length)) : []
}
