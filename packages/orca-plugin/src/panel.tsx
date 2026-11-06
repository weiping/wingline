// 无构建步骤：Orca 加载时转译 JSX。state 只放 atom，不放 DOM。
import { atom, Badge, Button, Callout, EmptyState, Heading, plugin, read, Row, set, Stack, Text } from 'orca'

import type { TeamSummary } from './protocol.js'

const teams = atom<TeamSummary[] | null>(null)
const error = atom<string | null>(null)
const loading = atom(false)

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

export function setup(): void {
  void refresh()
}

export default function Panel() {
  const list = read(teams)
  const err = read(error)
  const busy = read(loading)
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
      {err !== null && <Callout tone="danger" title="读不到团队账本">{err}</Callout>}
      {list === null && err === null && <Text muted>正在读取…</Text>}
      {list !== null && list.length === 0 && (
        <EmptyState title="还没有团队" description="先在终端里执行 wl up <team.yaml> 登记一个团队。" />
      )}
      {list !== null &&
        list.map((team) => (
          <Stack key={team.name} gap="xs">
            <Row justify="between">
              <Text weight="medium">{team.name}</Text>
              <Badge tone={team.status === 'up' ? 'success' : 'neutral'}>{team.status}</Badge>
            </Row>
            <Text muted size="xs">
              {team.posts} 个岗位
            </Text>
          </Stack>
        ))}
    </Stack>
  )
}
