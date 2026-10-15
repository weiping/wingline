import { WinglineError } from '../errors.js'
import type { PostRow } from '../registry/registry.js'
import { nextRequestId, preflight, type CommandDeps } from './deps.js'
import { locatePost } from './locate.js'

export type DownOutcome = 'stopped' | 'closed' | 'uncertain' | 'already_gone'

export interface DownResult {
  team: string
  posts: Array<{ address: string; outcome: DownOutcome; reason?: string }>
}

type PostResult = DownResult['posts'][number]

async function closePost(deps: CommandDeps, post: PostRow, specHash: string): Promise<PostResult> {
  const { orca, registry } = deps
  const { address } = post
  try {
    const located = await locatePost(orca, address)
    if (!located) {
      registry.setPostStatus(address, 'closed')
      return { address, outcome: 'already_gone' }
    }
    const id = nextRequestId(registry, post.team, address.split('@')[0]!, 'close', specHash)
    registry.beginRequest(id)
    const { ptyKilled } = await orca.terminalClose({ handle: located.handle }).catch((err) => {
      registry.finishRequest(id, 'uncertain', { error: String(err) })
      throw err
    })
    registry.finishRequest(id, ptyKilled ? 'done' : 'uncertain', { ptyKilled })
    registry.setPostStatus(address, ptyKilled ? 'closed' : 'uncertain')
    return ptyKilled ? { address, outcome: 'closed' } : { address, outcome: 'uncertain', reason: 'Orca 未确认进程已退出' }
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    registry.setPostStatus(address, 'uncertain')
    return { address, outcome: 'uncertain', reason: err.message }
  }
}

export async function down(deps: CommandDeps, args: { team: string; close: boolean }): Promise<DownResult> {
  const { registry } = deps
  const team = registry.getTeam(args.team)
  if (!team) throw new WinglineError('input', 'team_unknown', `没有团队 ${args.team}`, { hint: '用 wl ps 查看现有团队' })
  return registry.withTeamLock(args.team, async () => {
    const posts = registry.listPosts(args.team)
    if (!args.close) {
      registry.setTeamStatus(args.team, 'stopped')
      return { team: args.team, posts: posts.map((p) => ({ address: p.address, outcome: 'stopped' as const })) }
    }
    await preflight(deps)
    const results: PostResult[] = []
    for (const p of posts) results.push(await closePost(deps, p, team.specHash))
    registry.setTeamStatus(args.team, 'stopped')
    const result = { team: args.team, posts: results }
    if (results.some((r) => r.outcome === 'uncertain')) {
      throw new WinglineError('uncertain', 'close_unconfirmed', `团队 ${args.team} 有岗位未确认关闭，终端可能仍在运行`, {
        hint: '用 wl ps 查看状态，确认后在 Orca 中手动关闭',
        detail: result,
      })
    }
    return result
  })
}
