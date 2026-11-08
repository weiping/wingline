// 无构建步骤：Orca 加载时转译 JSX。state 只放 atom，不放 DOM。
import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  CodeView,
  EmptyState,
  Heading,
  Input,
  plugin,
  read,
  Row,
  set,
  Spinner,
  Stack,
  Text
} from 'orca'

import type { InboxDto, PostDetailDto, PostDto, PreviewDto, TaskDetailDto, TaskDto } from './host.js'
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

/** 写操作的身份：claim / done 要「以岗位身份」执行。 */
const actor = atom('actor', '')
/** 预览的岗位地址与内容。 */
const preview = atom<PreviewDto | null>(null)
const previewAddress = atom('previewAddress', '')
/** 岗位详情（时间线 + 任务历史）。 */
const detail = atom<PostDetailDto | null>(null)
const detailAddress = atom('detailAddress', '')
/** 回答提问的草稿，按 messageId 存。 */
const replyDrafts = atom<Record<string, string>>({})
/** 「停止岗位」的二段确认：第一次点亮，再点才执行。 */
const confirmingDown = atom<Record<string, boolean>>({})
/** 任务详情（计划 / 历史 / gate 输出），按任务 id 存。 */
const taskDetails = atom<Record<string, TaskDetailDto>>({})
const detailLoading = atom('detailLoading', '')

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
    if (answer.navigated) set(notice, `已切到 ${address}`)
    else set(notice, answer.reason ?? `${address} 无法切换`)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

async function bringUp(team: string, opts: { draft?: boolean; newRun?: boolean; adoptRun?: string } = {}): Promise<void> {
  set(busyTeam, team)
  set(notice, `正在拉起 ${team} 的岗位（可能要 1–2 分钟）…`)
  try {
    set(notice, `正在拉起 ${team} 的岗位并等待就绪（可能要 1–2 分钟）…`)
    // worker 内部会等到岗位真正 live（或超时）才回，回执带每岗位 outcome 与就绪数
    // plugin.request 的 timeoutMs 上限是 120000；up 本身约 60s，worker 再等最多 20s 就绪。
    const r = await plugin.request('team.up', { team, ...opts }, { timeoutMs: 120000 })
    const posts = (r.posts ?? []) as Array<{ address: string; outcome: string; reason?: string }>
    const started = posts.filter((p) => p.outcome === 'launched' || p.outcome === 'already_live')
    const bad = posts.filter((p) => p.outcome !== 'launched' && p.outcome !== 'already_live')
    const live = typeof r.live === 'number' ? r.live : 0
    const total = typeof r.total === 'number' ? r.total : posts.length
    const parts: string[] = []
    parts.push(bad.length === 0 ? `${started.length} 个岗位已启动` : `${started.length} 个已启动，${bad.length} 个未就绪（${bad.map((p) => `${p.address} ${p.outcome}`).join('、')}）`)
    parts.push(total > 0 ? (live >= total ? `${live} 个已就绪` : `${live}/${total} 已就绪`) : '未读到岗位状态')
    // Run 没绑上（协调者身份对不上）时，调度员还得重新启动一次才能认领
    if (r.run && r.run.outcome !== 'ok') {
      parts.push(`Run 未绑定（${r.run.reason ?? r.run.outcome}），需再点「启动调度员」认领协调者`)
    }
    set(notice, `${team}：${parts.join('｜')}`)
    set(error, null)
    await refresh()
    await loadPosts(team)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(busyTeam, null)
  }
}

async function dispatcherUpOnce(team: string): Promise<'started' | 'already_running'> {
  // core 的 dispatcherUp 内部会轮询心跳最多 30s，面板超时要给足（上限 120s）。
  const r = await plugin.request('team.dispatcher-up', { team }, { timeoutMs: 120000 })
  return r.outcome as 'started' | 'already_running'
}

async function downTeam(team: string, close: boolean): Promise<void> {
  set(busyTeam, team)
  set(confirmingDown, { ...read(confirmingDown), [team]: false })
  try {
    const r = await plugin.request('team.down', { team, close }, { timeoutMs: 120000 })
    const posts = (r.posts ?? []) as Array<{ address: string; outcome: string; reason?: string }>
    const closed = posts.filter((p) => p.outcome === 'closed').length
    const uncertain = posts.filter((p) => p.outcome === 'uncertain').length
    set(notice, close
      ? `已停止：${closed} 个终端关闭${uncertain > 0 ? `，${uncertain} 个结果不确定` : ''}`
      : `团队已标为 stopped（终端未动）`)
    set(error, null)
    await refresh()
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(busyTeam, null)
  }
}

async function dispatcherAction(team: string, up: boolean): Promise<void> {
  set(busyTeam, team)
  try {
    if (up) {
      set(notice, `正在启动调度员（新建终端 + 等心跳，最多 1 分钟）…`)
      let outcome: 'started' | 'already_running'
      try {
        outcome = await dispatcherUpOnce(team)
      } catch (err) {
        // 「终端在但进程死了」→ 关掉旧终端重试一次
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('dispatcher_stale')) throw err
        set(notice, '检测到失联的调度员终端，先关闭再重试…')
        await plugin.request('team.dispatcher-down', { team, close: true }, { timeoutMs: 60000 })
        outcome = await dispatcherUpOnce(team)
      }
      set(notice, outcome === 'started' ? `调度员已启动（${team}）` : '调度员本来就在跑')
    } else {
      const r = await plugin.request('team.dispatcher-down', { team, close: true }, { timeoutMs: 60000 })
      set(notice, r.outcome === 'closed' ? '调度员已停止（终端已关闭）' : r.outcome === 'already_gone' ? '调度员终端已经不在（锁已清）' : '无法停止：core 在 close=false 时是 noop')
    }
    set(error, null)
    await refresh()
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(busyTeam, null)
  }
}

async function loadTaskDetail(id: string): Promise<void> {
  set(detailLoading, id)
  try {
    const answer = await plugin.request('task.detail', { id })
    set(taskDetails, { ...read(taskDetails), [id]: answer as TaskDetailDto })
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  } finally {
    set(detailLoading, '')
  }
}

async function loadPreview(address: string): Promise<void> {
  set(previewAddress, address)
  set(preview, null)
  try {
    const answer = await plugin.request('post.preview', { address })
    set(preview, answer as PreviewDto)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

async function loadDetail(team: string, address: string): Promise<void> {
  set(detailAddress, address)
  set(detail, null)
  try {
    const answer = await plugin.request('post.detail', { team, address })
    set(detail, answer as PostDetailDto)
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

const WRITE_METHODS = {
  reply: 'write.reply',
  freeze: 'write.freeze',
  unfreeze: 'write.unfreeze',
  claim: 'write.claimTask',
  done: 'write.doneTask'
} as const

async function runWrite(
  kind: keyof typeof WRITE_METHODS,
  args: Record<string, unknown>,
  reload: () => Promise<void>,
  okText: string
): Promise<void> {
  try {
    await plugin.request(WRITE_METHODS[kind], args)
    set(notice, okText)
    set(error, null)
    await reload()
  } catch (err) {
    set(error, err instanceof Error ? err.message : String(err))
  }
}

export function setup(ctx: import('orca').PanelContext): void {
  ctx.subscriptions.push(plugin.on('teams.changed', (payload) => set(teams, payload.teams as TeamSummary[])))
  // worker 轮询推送：面板开着时免手刷。
  ctx.subscriptions.push(plugin.on('inbox.changed', ({ team, inbox: box }) => set(inbox, { ...read(inbox), [team]: box })))
  ctx.subscriptions.push(plugin.on('tasks.changed', ({ team, tasks: rows }) => set(tasks, { ...read(tasks), [team]: rows })))
  ctx.subscriptions.push(plugin.on('posts.changed', ({ team, posts: rows }) => set(posts, { ...read(posts), [team]: rows })))
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

function PostsView({ rows, team }: { rows: PostDto[]; team: string }) {
  const shownPreview = read(preview)
  const previewFor = read(previewAddress)
  const shownDetail = read(detail)
  const detailFor = read(detailAddress)
  if (rows.length === 0) {
    return <Text muted size="xs">这个团队还没有岗位。</Text>
  }
  const offline = rows.some((r) => r.status !== 'live')
  return (
    <Stack gap="xs">
      {offline && (
        <Button variant="outline" size="sm" onPress={() => bringUp(team)}>
          重拉离线岗位（wl up 幂等，活终端不动）
        </Button>
      )}
      {rows.map((post) => (
        <Stack key={post.address} gap="xs">
          <Row justify="between" gap="xs">
            <Text size="xs">
              {post.address}
              {post.isLead ? '（牵头岗）' : ''}
            </Text>
            <Row gap="xs">
              <Badge tone={STATUS_TONE[post.status] ?? 'neutral'}>{post.status}</Badge>
              <Button variant="ghost" size="sm" disabled={post.status !== 'live'} onPress={() => openTerminal(post.address)}>
                打开终端
              </Button>
              <Button variant="ghost" size="sm" disabled={post.status !== 'live'} onPress={() => loadPreview(post.address)}>
                预览
              </Button>
              <Button variant="ghost" size="sm" onPress={() => loadDetail(team, post.address)}>
                详情
              </Button>
            </Row>
          </Row>
          {previewFor === post.address && shownPreview !== null && (
            <Stack gap="xs">
              {shownPreview.error !== undefined && (
                <Text size="xs" muted>
                  读不到屏幕：{shownPreview.error}
                </Text>
              )}
              {shownPreview.error === undefined && shownPreview.lines.length > 0 && (
                <CodeView
                  code={shownPreview.lines.join('\n')}
                  label={`${post.address} 最后 ${shownPreview.lines.length} 行`}
                  maxHeight={220}
                />
              )}
              {shownPreview.error === undefined && shownPreview.lines.length === 0 && (
                <Text size="xs" muted>
                  终端还没有输出。
                </Text>
              )}
            </Stack>
          )}
          {detailFor === post.address && shownDetail !== null && <PostDetailView d={shownDetail} />}
        </Stack>
      ))}
    </Stack>
  )
}

function PostDetailView({ d }: { d: PostDetailDto }) {
  return (
    <Stack gap="xs">
      {d.currentTask !== null && (
        <Text size="xs">
          当前任务：{d.currentTask.title}（{d.currentTask.status}）
        </Text>
      )}
      {d.currentTask === null && <Text size="xs" muted>当前没有进行中的任务。</Text>}
      {d.queued.length > 0 && (
        <Text size="xs" muted>
          排队 {d.queued.length} 条：{d.queued.map((t) => t.title).join('、')}
        </Text>
      )}
      {d.frozen !== null && <Text size="xs">已冻结：{d.frozen.reason}</Text>}
      {d.hushedUntil !== null && <Text size="xs" muted>静音到 {d.hushedUntil}</Text>}
      {d.signals.map((s) => (
        <Text key={`${s.signal}-${s.since}`} size="xs">
          信号：{s.summary ?? s.signal}（L{s.level}）
        </Text>
      ))}
      <Text size="xs" muted>
        时间线（最近 {d.events.length} 条）：
      </Text>
      {d.events.length === 0 && <Text size="xs" muted>还没有事件。</Text>}
      {d.events.slice(-12).reverse().map((e) => (
        <Text key={e.id} size="xs">
          {e.at.slice(11, 19)} {e.action}
          {e.target !== null ? ` → ${e.target}` : ''}
          {e.outcome !== null && e.outcome !== 'ok' ? `（${e.outcome}）` : ''} · {e.actor}
        </Text>
      ))}
    </Stack>
  )
}

function InboxView({ box, team }: { box: InboxDto | undefined; team: string }) {
  if (!box) return <Text muted size="xs">没有收件箱数据。</Text>
  if (box.pending === 0) {
    return <Text muted size="xs">没有要处理的事项。</Text>
  }
  return (
    <Stack gap="xs">
      {box.frozen.map((f) => (
        <Row key={`frozen-${f.post}`} justify="between" gap="xs">
          <Text size="xs" truncate>
            冻结：{f.post}
          </Text>
          <Row gap="xs">
            <Badge tone="danger">冻结</Badge>
            <Button
              variant="outline"
              size="sm"
              onPress={() => runWrite('unfreeze', { address: f.post }, () => loadInbox(team), `已解冻 ${f.post}`)}
            >
              解冻
            </Button>
          </Row>
        </Row>
      ))}
      {box.signals.map((s) => {
        const isFrozen = box.frozen.some((f) => f.post === s.post)
        return (
          <Row key={`sig-${s.post}-${s.signal}`} justify="between" gap="xs">
            <Text size="xs" truncate>
              信号：{s.post} · {s.summary ?? s.signal}
            </Text>
            <Row gap="xs">
              <Badge tone={s.level >= 2 ? 'warning' : 'neutral'}>L{s.level}</Badge>
              <Button
                variant="outline"
                size="sm"
                onPress={() => runWrite('freeze', { address: s.post, reason: `面板冻结：${s.summary ?? s.signal}` }, () => loadInbox(team), `已冻结 ${s.post}`)}
              >
                冻结岗位
              </Button>
            </Row>
          </Row>
        )
      })}
      {box.questions.map((q) => {
        const draft = read(replyDrafts)[q.messageId] ?? ''
        return (
          <Stack key={`q-${q.messageId}`} gap="xs">
            <Row justify="between" gap="xs">
              <Text size="xs" truncate>
                提问：{q.asker} · {q.body}
              </Text>
              <Badge tone="warning">待答</Badge>
            </Row>
            <Row gap="xs">
              <Input
                label="回答内容"
                placeholder="回答内容"
                value={draft}
                onChange={(v: string) => set(replyDrafts, { ...read(replyDrafts), [q.messageId]: v })}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={draft.trim().length === 0}
                onPress={() =>
                  runWrite('reply', { team, messageId: q.messageId, body: draft }, () => loadInbox(team), `已回答 ${q.asker}`)
                }
              >
                发送回答
              </Button>
            </Row>
          </Stack>
        )
      })}
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

function TasksView({ rows, team }: { rows: TaskDto[] | undefined; team: string }) {
  const actorText = read(actor)
  const details = read(taskDetails)
  const loadingId = read(detailLoading)
  if (!rows) return <Text muted size="xs">没有任务数据。</Text>
  if (rows.length === 0) return <Text muted size="xs">这个团队还没有任务。</Text>
  return (
    <Stack gap="xs">
      <Row gap="xs">
        <Input
          label="操作身份"
          placeholder="post@team"
          value={actorText}
          onChange={(v: string) => set(actor, v)}
        />
      </Row>
      {rows.map((t) => {
        const d = details[t.id]
        return (
          <Stack key={t.id} gap="xs">
            <Row justify="between" gap="xs">
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
            <Row gap="xs">
              <Button
                variant="outline"
                size="sm"
                disabled={actorText.trim().length === 0 || t.status !== 'ready'}
                onPress={() => runWrite('claim', { id: t.id, as: actorText }, () => loadTasks(team), `已认领 ${t.title}`)}
              >
                认领
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={actorText.trim().length === 0 || (t.status !== 'dispatched' && t.status !== 'ready')}
                onPress={() =>
                  runWrite('done', { id: t.id, as: actorText }, () => loadTasks(team), `已提交完成 ${t.title}`)
                }
              >
                完成
              </Button>
              {loadingId === t.id ? (
                <Spinner label="读取详情" labelHidden />
              ) : (
                <Button variant="ghost" size="sm" onPress={() => loadTaskDetail(t.id)}>
                  详情
                </Button>
              )}
            </Row>
            {d !== undefined && (
              <Stack gap="xs">
                {d.plan !== null && <Text size="xs">计划：{d.plan}</Text>}
                {d.outcome !== null && <Text size="xs">结果：{d.outcome}</Text>}
                {d.gateFailures > 0 && <Text size="xs">闸门连败 {d.gateFailures} 次</Text>}
                {d.gateOutput !== null && <CodeView code={d.gateOutput.slice(-800)} label="gate 输出（尾部）" maxHeight={160} />}
                {d.history.length > 0 && (
                  <>
                    <Text size="xs" muted>
                      历史（最近 {Math.min(d.history.length, 8)} 条）：
                    </Text>
                    {d.history.slice(-8).reverse().map((h) => (
                      <Text key={`${h.at}-${h.action}`} size="xs">
                        {h.at.slice(11, 19)} {h.action} · {h.actor}
                      </Text>
                    ))}
                  </>
                )}
              </Stack>
            )}
          </Stack>
        )
      })}
      <Text size="xs" muted>
        写操作以「操作身份」岗位执行，进审计（actor=human）。
      </Text>
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
      {hint !== null && <Callout tone="accent" title="已完成">{hint}</Callout>}
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
                  {team.posts} 个岗位 · 调度员 {team.dispatcherState}
                </Text>
                <Row gap="xs">
                  {(team.status === 'stopped' || (team.offlinePosts !== null && team.offlinePosts > 0)) && (
                    <Button variant="outline" size="sm" disabled={loadingTeam === team.name} onPress={() => bringUp(team.name)}>
                      拉起岗位
                    </Button>
                  )}
                  {team.status === 'up' && (
                    <Button
                      variant={read(confirmingDown)[team.name] ? 'solid' : 'outline'}
                      tone={read(confirmingDown)[team.name] ? 'danger' : 'neutral'}
                      size="sm"
                      disabled={loadingTeam === team.name}
                      onPress={() => {
                        if (read(confirmingDown)[team.name]) {
                          void downTeam(team.name, true)
                        } else {
                          set(confirmingDown, { ...read(confirmingDown), [team.name]: true })
                          set(notice, '再点一次确认：将关闭岗位终端（agent 会话结束）')
                        }
                      }}
                    >
                      {read(confirmingDown)[team.name] ? '确认停止？' : '停止岗位'}
                    </Button>
                  )}
                  {team.dispatcherState !== 'running' && (
                    <Button variant="outline" size="sm" disabled={loadingTeam === team.name} onPress={() => dispatcherAction(team.name, true)}>
                      启动调度员
                    </Button>
                  )}
                  {team.dispatcherState === 'running' && (
                    <Button variant="ghost" size="sm" disabled={loadingTeam === team.name} onPress={() => dispatcherAction(team.name, false)}>
                      停止调度员
                    </Button>
                  )}
                </Row>
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
                      <PostsView rows={allPosts[team.name] ?? []} team={team.name} />
                    )}
                    {loadingTeam !== team.name && currentView === 'inbox' && <InboxView box={box} team={team.name} />}
                    {loadingTeam !== team.name && currentView === 'tasks' && (
                      <TasksView rows={allTasks[team.name]} team={team.name} />
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
