import { WinglineError } from '../errors.js'
import type { TerminalSummary } from '../orca/types.js'
import type { PostRow } from '../registry/registry.js'
import { preflight, type CommandDeps } from './deps.js'

export interface PsRow {
  address: string
  agent: string
  status: 'live' | 'offline' | 'uncertain'
  handle: string | null
  worktree: string
  isLead: boolean
}

function statusOf(matches: TerminalSummary[]): PsRow['status'] {
  if (matches.length === 0) return 'offline'
  return matches.length === 1 && matches[0]!.connected ? 'live' : 'uncertain'
}

function row(post: PostRow, matches: TerminalSummary[]): PsRow {
  const handle = matches.length === 1 ? matches[0]!.handle : post.handle
  return { address: post.address, agent: post.agent, status: statusOf(matches), handle, worktree: post.worktree, isLead: post.isLead }
}

/** 只读；唯一的写入是终端 handle 变化时更新 posts.handle。 */
export async function ps(deps: CommandDeps, args: { team?: string }): Promise<PsRow[]> {
  const { registry, orca } = deps
  const teams = args.team ? [registry.getTeam(args.team)] : registry.listTeams()
  if (args.team && !teams[0]) {
    throw new WinglineError('input', 'team_unknown', `没有团队 ${args.team}`, { hint: '先执行 wl up <team.yaml>' })
  }
  await preflight(deps)
  const terminals = await orca.terminalList()
  return teams.flatMap((t) =>
    registry.listPosts(t!.name).map((post) => {
      const r = row(post, terminals.filter((x) => x.title === post.address))
      if (r.handle !== post.handle) registry.setPostHandle(post.address, r.handle)
      return r
    }),
  )
}
