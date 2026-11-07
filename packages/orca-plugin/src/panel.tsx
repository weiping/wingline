// 无构建步骤：Orca 加载时转译 JSX。state 只放 atom，不放 DOM。
import { atom, Badge, Button, Callout, Card, EmptyState, Heading, plugin, read, Row, set, Spinner, Stack, Text } from 'orca'

import type { PostDto } from './host.js'
import type { TeamSummary } from './protocol.js'

const teams = atom<TeamSummary[] | null>(null)
const error = atom<string | null>(null)
const loading = atom(true)
/** 展开了岗位列表的团队名（一次只展开一个，保持侧栏窄）。 */
const expanded = atom<string | null>(null)
/** 每个团队的岗位列表，按团队名存。 */
const posts = atom<Record<string, PostDto[]>>({})
const postsLoading = atom<string | null>(null)
const notice = atom<string | null>(null)

async function refresh(): Promise<void> {
  set(loading, true)
  try {
    const answer = await plugin.request('teams.list')
    set(teams, answer.teams as TeamSummary[])
    set(error, null)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(loading, false)
  }
}

async function loadPosts(team: string): Promise<void> {
  set(postsLoading, team)
  try {
    const answer = await plugin.request('team.posts', { team })
    set(posts, { ...read(posts), [team]: answer.posts as PostDto[] })
    set(error, null)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(postsLoading, null)
  }
}

async function toggle(team: string): Promise<void> {
  if (read(expanded) === team) {
    set(expanded, null)
    return
  }
  set(expanded, team)
  await loadPosts(team)
}

async function openTerminal(address: string): Promise<void> {
  try {
    const answer = await plugin.request('post.openTerminal', { address })
    if (answer.navigated) {
      set(notice, `已切到 ${address}`)
    } else {
      set(notice, `${address} 没有存活的终端，先 wl up 或 wl restore`)
    }
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

export function setup(ctx: import('orca').PanelContext): void {
  ctx.subscriptions.push(plugin.on('teams.changed', (payload) => set(teams, payload.teams as TeamSummary[])))
  void refresh()
}

export default function Panel() {
  const list = read(teams)
  const err = read(error)
  const busy = read(loading)
  const open = read(expanded)
  const allPosts = read(posts)
  const loadingTeam = read(postsLoading)
  const hint = read(notice)
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>雁阵</Heading>
        <Row gap="xs">
          {list !== null && <Badge tone="accent">{list.length} 个团队</Badge>}
          <Button variant="ghost" onPress={refresh} disabled={busy}>
            刷新
          </Button>
        </Row>
      </Row>
      {err !== null && <Callout tone="danger" title="操作失败">{err}</Callout>}
      {hint !== null && <Callout tone="accent" title="已切换窗口">{hint}</Callout>}
      {list !== null && list.length === 0 && busy && <Spinner label="正在读取账本" labelHidden />}
      {list !== null && list.length === 0 && !busy && (
        <EmptyState title="还没有团队" description="先在终端里执行 wl up <team.yaml> 登记一个团队。" />
      )}
      {list !== null &&
        list.map((team) => {
          const isOpen = open === team.name
          const rows = allPosts[team.name] ?? []
          return (
            <Card key={team.name} title={team.name} description={`${team.posts} 个岗位 · ${team.status}`}>
              <Stack gap="xs">
                <Row justify="between">
                  <Badge tone={team.status === 'up' ? 'success' : 'neutral'}>{team.status}</Badge>
                  {team.runId != null && team.runId.length > 0 && (
                    <Text muted size="xs">Run {team.runId.slice(0, 8)}…</Text>
                  )}
                </Row>
                <Row gap="xs">
                  <Button variant="outline" size="sm" onPress={() => toggle(team.name)}>
                    {isOpen ? '收起岗位' : '岗位终端'}
                  </Button>
                </Row>
                {isOpen && loadingTeam === team.name && <Spinner label="正在读取岗位" labelHidden />}
                {isOpen &&
                  rows.map((post) => (
                    <Row key={post.address} justify="between" gap="xs">
                      <Text size="xs">
                        {post.address}
                        {post.isLead ? '（牵头岗）' : ''}
                      </Text>
                      <Row gap="xs">
                        <Badge tone={post.status === 'live' ? 'success' : post.status === 'uncertain' ? 'warning' : 'neutral'}>
                          {post.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={post.handle === null}
                          onPress={() => openTerminal(post.address)}
                        >
                          打开终端
                        </Button>
                      </Row>
                    </Row>
                  ))}
                {isOpen && loadingTeam !== team.name && rows.length === 0 && (
                  <Text muted size="xs">
                    这个团队还没有岗位。
                  </Text>
                )}
              </Stack>
            </Card>
          )
        })}
    </Stack>
  )
}
