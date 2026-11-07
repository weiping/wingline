// 无构建步骤：Orca 加载时转译 JSX。state 只放 atom，不放 DOM。
import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Heading,
  plugin,
  read,
  Row,
  set,
  Spinner,
  Stack,
  Text
} from 'orca'

import type { InboxDto, PostDto, TaskDto } from './host.js'
import type { TeamSummary } from './protocol.js'

type View = 'posts' | 'inbox' | 'tasks'

const teams = atom<TeamSummary[] | null>(null)
const error = atom<string | null>(null)
const notice = atom<string | null>(null)
const loading = atom(true)

/** 展开了详情的团队名（一次只展开一个，保持侧栏窄）。 */
const expanded = atom<string | null>(null)
/** 当前查看的视图。 */
const view = atom<View>('posts')
/** 每个团队的岗位列表，按团队名存。 */
const posts = atom<Record<string, PostDto[]>>({})
/** 每个团队的收件箱。 */
const inbox = atom<Record<string, InboxDto>>({})
/** 每个团队的任务列表。 */
const tasks = atom<Record<string, TaskDto[]>>({})
const busyTeam = atom<string | null>(null)

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
  try {
    const answer = await plugin.request('team.posts', { team })
    set(posts, { ...read(posts), [team]: answer.posts as PostDto[] })
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

async function loadInbox(team: string): Promise<void> {
  try {
    const answer = await plugin.request('team.inbox', { team })
    set(inbox, { ...read(inbox), [team]: answer as InboxDto })
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

async function loadTasks(team: string): Promise<void> {
  try {
    const answer = await plugin.request('team.tasks', { team })
    set(tasks, { ...read(tasks), [team]: answer.tasks as TaskDto[] })
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

async function open(team: string): Promise<void> {
  set(expanded, team)
  set(busyTeam, team)
  try {
    const v = read(view)
    if (v === 'posts') await loadPosts(team)
    else if (v === 'inbox') await loadInbox(team)
    else await loadTasks(team)
  } finally {
    set(busyTeam, null)
  }
}

async function switchView(next: View, team: string): Promise<void> {
  set(view, next)
  await open(team)
}

async function openTerminal(address: string): Promise<void> {
  try {
    const answer = await plugin.request('post.openTerminal', { address })
    set(notice, answer.navigated ? `已切到 ${address}` : `${address} 没有存活的终端，先 wl up 或 wl restore`)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

export function setup(ctx: import('orca').PanelContext): void {
  ctx.subscriptions.push(plugin.on('teams.changed', (payload) => set(teams, payload.teams as TeamSummary[])))
  void refresh()
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  live: 'success',
  running: 'success',
  done: 'neutral',
  succeeded: 'neutral',
  ready: 'warning',
  dispatched: 'success',
  uncertain: 'warning',
  failed: 'danger',
  escalated: 'danger'
}

function PostsView({ rows }: { rows: PostDto[] }) {
  if (rows.length === 0) {
    return <Text muted size="xs">这个团队还没有岗位。</Text>
  }
  return (
    <Stack gap="xs">
      {rows.map((post) => (
        <Row key={post.address} justify="between" gap="xs">
          <Text size="xs">
            {post.address}
            {post.isLead ? '（牵头岗）' : ''}
          </Text>
          <Row gap="xs">
            <Badge tone={STATUS_TONE[post.status] ?? 'neutral'}>{post.status}</Badge>
            <Button variant="ghost" size="sm" disabled={post.handle === null} onPress={() => openTerminal(post.address)}>
              打开终端
            </Button>
          </Row>
        </Row>
      ))}
    </Stack>
  )
}

function InboxView({ box }: { box: InboxDto | undefined }) {
  if (!box) return <Text muted size="xs">没有收件箱数据。</Text>
  if (box.pending === 0) {
    return <Text muted size="xs">没有要处理的事项。</Text>
  }
  return (
    <Stack gap="xs">
      {box.frozen.map((f) => (
        <Row key={`frozen-${f.post}`} justify="between" gap="xs">
          <Text size="xs">冻结：{f.post}</Text>
          <Badge tone="danger">冻结</Badge>
        </Row>
      ))}
      {box.signals.map((s) => (
        <Row key={`sig-${s.post}-${s.signal}`} justify="between" gap="xs">
          <Text size="xs">
            信号：{s.post} · {s.summary ?? s.signal}
          </Text>
          <Badge tone={s.level >= 2 ? 'warning' : 'neutral'}>L{s.level}</Badge>
        </Row>
      ))}
      {box.questions.map((q) => (
        <Row key={`q-${q.messageId}`} justify="between" gap="xs">
          <Text size="xs" truncate>
            提问：{q.asker} · {q.body}
          </Text>
          <Badge tone="warning">待答</Badge>
        </Row>
      ))}
      {box.stale.map((s) => (
        <Row key={`stale-${s.taskId}`} justify="between" gap="xs">
          <Text size="xs" truncate>
            滞留：{s.title}
          </Text>
          <Badge tone="warning">{s.reason}</Badge>
        </Row>
      ))}
      {box.warnings.map((w, i) => (
        <Text key={`warn-${i}`} size="xs">
          提示：{w}
        </Text>
      ))}
      {box.unavailable.map((u, i) => (
        <Text key={`un-${i}`} size="xs" muted>
          取不到：{u}
        </Text>
      ))}
    </Stack>
  )
}

function TasksView({ rows }: { rows: TaskDto[] | undefined }) {
  if (!rows) return <Text muted size="xs">没有任务数据。</Text>
  if (rows.length === 0) return <Text muted size="xs">这个团队还没有任务。</Text>
  return (
    <Stack gap="xs">
      {rows.map((t) => (
        <Row key={t.id} justify="between" gap="xs">
          <Text size="xs" truncate>
            {t.title}
          </Text>
          <Row gap="xs">
            {t.claimedBy !== null && (
              <Text size="xs" muted>
                {t.claimedBy}
              </Text>
            )}
            <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status}</Badge>
          </Row>
        </Row>
      ))}
    </Stack>
  )
}

export default function Panel() {
  const list = read(teams)
  const err = read(error)
  const busy = read(loading)
  const openTeam = read(expanded)
  const currentView = read(view)
  const allPosts = read(posts)
  const allInbox = read(inbox)
  const allTasks = read(tasks)
  const loadingTeam = read(busyTeam)
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
          const isOpen = openTeam === team.name
          const box = allInbox[team.name]
          const pending = box?.pending ?? 0
          return (
            <Card key={team.name}>
              <Stack gap="xs">
                <Row justify="between" gap="xs">
                  <Row gap="xs">
                    <Text weight="medium">{team.name}</Text>
                    <Badge tone={team.status === 'up' ? 'success' : 'neutral'}>{team.status}</Badge>
                  </Row>
                  {pending > 0 && <Badge tone="warning">{pending} 待处理</Badge>}
                </Row>
                <Text muted size="xs">
                  {team.posts} 个岗位
                </Text>
                {isOpen ? (
                  <>
                    <Row gap="xs">
                      <Button
                        variant={currentView === 'posts' ? 'solid' : 'ghost'}
                        size="sm"
                        onPress={() => switchView('posts', team.name)}
                      >
                        岗位
                      </Button>
                      <Button
                        variant={currentView === 'inbox' ? 'solid' : 'ghost'}
                        size="sm"
                        onPress={() => switchView('inbox', team.name)}
                      >
                        收件箱
                      </Button>
                      <Button
                        variant={currentView === 'tasks' ? 'solid' : 'ghost'}
                        size="sm"
                        onPress={() => switchView('tasks', team.name)}
                      >
                        任务
                      </Button>
                    </Row>
                    {loadingTeam === team.name && <Spinner label="正在读取" labelHidden />}
                    {loadingTeam !== team.name && currentView === 'posts' && (
                      <PostsView rows={allPosts[team.name] ?? []} />
                    )}
                    {loadingTeam !== team.name && currentView === 'inbox' && <InboxView box={box} />}
                    {loadingTeam !== team.name && currentView === 'tasks' && (
                      <TasksView rows={allTasks[team.name]} />
                    )}
                    <Row gap="xs">
                      <Button variant="ghost" size="sm" onPress={() => open(team.name)}>
                        重读
                      </Button>
                      <Button variant="ghost" size="sm" onPress={() => set(expanded, null)}>
                        收起
                      </Button>
                    </Row>
                  </>
                ) : (
                  <Row gap="xs">
                    <Button variant="outline" size="sm" onPress={() => open(team.name)}>
                      展开
                    </Button>
                  </Row>
                )}
              </Stack>
            </Card>
          )
        })}
    </Stack>
  )
}
