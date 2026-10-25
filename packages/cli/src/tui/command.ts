import { WinglineError, type CommandDeps, type TeamRow } from '@weiping/wingline-core'
import { runTui } from './app.js'
import type { TuiIo } from './types.js'
import { pickTeam } from './views/picker.js'

export interface TuiCmdArgs {
  team?: string
  io: TuiIo
  /** 以下几项只在测试里替换。 */
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  warn?: (message: string) => void
  run?: typeof runTui
  pick?: typeof pickTeam
}

function chooseTeams(deps: CommandDeps, name: string | undefined): TeamRow[] {
  if (name !== undefined) {
    const t = deps.registry.getTeam(name)
    if (!t) throw new WinglineError('input', 'team_unknown', `团队 ${name} 未登记`, { hint: '先执行 wl up <team.yaml>' })
    return [t]
  }
  const teams = deps.registry.listTeams()
  if (teams.length === 0) throw new WinglineError('input', 'team_unknown', '还没有登记任何团队', { hint: '先执行 wl up <team.yaml>' })
  return teams
}

/** `wl tui [team]`：检查终端，选定团队，进入全屏视图。 */
export async function tuiCmd(deps: CommandDeps, a: TuiCmdArgs): Promise<Record<string, never>> {
  if (!a.io.stdout.isTTY || !a.io.stdin.isTTY) {
    throw new WinglineError('input', 'tui_not_tty', 'wl tui 需要在交互式终端里运行', { hint: '直接在终端里运行 wl tui，输入输出都不要重定向' })
  }
  if (!(a.io.stdout.columns > 0)) {
    throw new WinglineError('input', 'tui_unsupported_terminal', '终端没有报告窗口宽度，无法布局', { hint: '换一个终端模拟器，或改用 wl attention / wl log' })
  }
  const env = a.env ?? deps.env
  if ((a.platform ?? process.platform) === 'win32' && !env.WT_SESSION && !env.TERM_PROGRAM) {
    ;(a.warn ?? ((m) => process.stderr.write(`警告：${m}\n`)))('当前终端可能不支持 VT 序列，显示异常请改用 Windows Terminal')
  }
  const teams = chooseTeams(deps, a.team)
  const name = teams.length === 1 ? teams[0]!.name : await (a.pick ?? pickTeam)(teams, a.io)
  if (name === null) return {}
  await (a.run ?? runTui)(deps, name, a.io, {})
  return {}
}
