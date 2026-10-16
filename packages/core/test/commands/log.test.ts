import { expect, test } from 'vitest'
import { followTimeline, parseSince, readTimeline, type TimelineEvent } from '../../src/commands/log.js'
import { attention } from '../../src/commands/dispatcher/attention.js'
import { ps } from '../../src/commands/ps.js'
import { restore } from '../../src/commands/restore/index.js'
import { FakeOrca, seedRunningTeam } from './fake-client.js'

/** 可控时钟：写库的 at、排序与 --since 都由它推进。 */
function clock(start = '2026-10-16T10:00:00.000Z') {
  let t = new Date(start).getTime()
  return { now: () => new Date(t), at: (s: string) => { t = new Date(s).getTime() } }
}

const setup = () => {
  const c = clock()
  const made = seedRunningTeam(new FakeOrca(), { now: c.now })
  return { c, deps: made.deps, registry: made.registry }
}

const at = (s: string) => new Date(s).toISOString()

test('merges the three sources by time and maps actor/target/action per spec', async () => {
  const { c, deps, registry } = setup()
  c.at('2026-10-16T10:00:00.000Z')
  registry.appendTaskLog({ team: 'duo', taskId: 'task-1', epoch: 2, actor: 'builder@duo', actorSource: 'explicit', action: 'claim' })
  c.at('2026-10-16T10:00:01.000Z')
  registry.appendPatrolEvent({ team: 'duo', signal: 'no_progress', taskId: 'task-1', action: 'notify_lead', outcome: 'sent' })
  c.at('2026-10-16T10:00:02.000Z')
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok', detail: { message: '在吗' } })

  const { events, cursor } = await readTimeline(deps, { team: 'duo' })

  expect(events).toEqual([
    { id: 'task:1', at: at('2026-10-16T10:00:00Z'), source: 'task', actor: 'builder@duo', action: 'claim', target: 'task-1#2', outcome: null, detail: null },
    { id: 'patrol:1', at: at('2026-10-16T10:00:01Z'), source: 'patrol', actor: 'dispatcher@duo', action: 'no_progress/notify_lead', target: 'task-1', outcome: 'sent', detail: null },
    { id: 'command:1', at: at('2026-10-16T10:00:02Z'), source: 'command', actor: 'human', action: 'send', target: 'builder@duo', outcome: 'ok', detail: { message: '在吗' } },
  ])
  expect(cursor).toEqual({ task: 1, patrol: 1, command: 1 })
})

test('ties on the same timestamp sort task < patrol < command, then by id', async () => {
  const { deps, registry } = setup()
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'c1', target: null, outcome: 'ok' })
  registry.appendPatrolEvent({ team: 'duo', action: 'p1' })
  registry.appendTaskLog({ team: 'duo', taskId: 'task-1', epoch: 1, actor: 'builder@duo', actorSource: 'explicit', action: 'create' })
  registry.appendTaskLog({ team: 'duo', taskId: 'task-2', epoch: 1, actor: 'checker@duo', actorSource: 'explicit', action: 'create' })
  registry.appendPatrolEvent({ team: 'duo', action: 'p2' })
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'c2', target: null, outcome: 'ok' })

  const { events } = await readTimeline(deps, { team: 'duo' })
  expect(events.map((e) => e.id)).toEqual(['task:1', 'task:2', 'patrol:1', 'patrol:2', 'command:1', 'command:2'])
})

test('--task, --post, --source and --since filter; --limit keeps the newest n', async () => {
  const { c, deps, registry } = setup()
  c.at('2026-10-16T10:00:00.000Z')
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok' })
  c.at('2026-10-16T10:00:01.000Z')
  registry.appendTaskLog({ team: 'duo', taskId: 'task-1', epoch: 1, actor: 'checker@duo', actorSource: 'explicit', action: 'claim' })
  c.at('2026-10-16T10:00:02.000Z')
  registry.appendPatrolEvent({ team: 'duo', signal: 'no_progress', taskId: 'task-2', action: 'notify_lead', outcome: 'sent' })
  c.at('2026-10-16T10:00:03.000Z')
  registry.appendTaskLog({ team: 'duo', taskId: 'task-2', epoch: 3, actor: 'builder@duo', actorSource: 'explicit', action: 'done' })
  c.at('2026-10-16T10:00:05.000Z')

  const ids = async (a: Parameters<typeof readTimeline>[1]) => (await readTimeline(deps, a)).events.map((e) => e.id)

  // 任务过滤命中任意 epoch
  expect(await ids({ team: 'duo', task: 'task-2' })).toEqual(['patrol:1', 'task:2'])
  // 岗位过滤看 actor 或 target
  expect(await ids({ team: 'duo', post: 'builder' })).toEqual(['command:1', 'task:2'])
  expect(await ids({ team: 'duo', source: 'patrol' })).toEqual(['patrol:1'])
  // since 保留 at >= 起点的那一条
  expect(await ids({ team: 'duo', since: '2s' })).toEqual(['task:2'])
  // limit 取最新的 n 条，仍按时间升序
  expect(await ids({ team: 'duo', limit: 2 })).toEqual(['patrol:1', 'task:2'])
})

test('--since rejects garbage with duration_invalid', async () => {
  const { deps } = setup()
  expect(parseSince('90s', new Date('2026-10-16T10:00:00Z'))).toBe('2026-10-16T09:58:30.000Z')
  expect(parseSince('2026-10-16T09:00:00Z', new Date('2026-10-16T10:00:00Z'))).toBe('2026-10-16T09:00:00.000Z')
  expect(() => parseSince('昨天', new Date('2026-10-16T10:00:00Z'))).toThrowError(
    expect.objectContaining({ code: 'duration_invalid' }) as Error,
  )
  await expect(readTimeline(deps, { team: 'duo', since: '很久以前' })).rejects.toMatchObject({ code: 'duration_invalid' })
})

test('follow emits only rows after the cursor, never twice, and stops on abort', async () => {
  const { c, deps, registry } = setup()
  c.at('2026-10-16T10:00:00.000Z')
  registry.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok' })

  const seen: TimelineEvent[] = []
  const ctl = new AbortController()
  let rounds = 0
  await followTimeline(
    deps,
    { team: 'duo', cursor: { task: 0, patrol: 0, command: 1 } },
    (e) => seen.push(e),
    {
      signal: ctl.signal,
      sleep: async () => {
        rounds++
        if (rounds === 1) {
          c.at('2026-10-16T10:00:01.000Z')
          registry.appendTaskLog({ team: 'duo', taskId: 'task-9', epoch: 1, actor: 'builder@duo', actorSource: 'explicit', action: 'create' })
          registry.appendAudit({ team: 'duo', actor: 'human', command: 'task done', target: 'task-9', outcome: 'ok' })
        }
        if (rounds === 3) ctl.abort()
      },
    },
  )

  expect(rounds).toBe(3)
  expect(seen.map((e) => e.id)).toEqual(['task:1', 'command:2'])
  // 第一轮那条已经在游标之前，不重复发
  expect(seen.some((e) => e.id === 'command:1')).toBe(false)
})

test('unknown team → team_unknown', async () => {
  const { deps } = setup()
  await expect(readTimeline(deps, { team: 'nope' })).rejects.toMatchObject({ code: 'team_unknown' })
})

test('session markers stay out of ps, attention and restore, but not out of the registry', async () => {
  const { deps, registry } = setup()
  const marker = 'WLS-0a1b2c3d'
  registry.setSessionMarker('builder@duo', marker, '2026-10-16T10:00:00.000Z')
  registry.setSessionId('builder@duo', 'claude-session-1')

  expect(JSON.stringify(await ps(deps, { team: 'duo' }))).not.toContain('WLS-')
  expect(JSON.stringify(await attention(deps, 'duo'))).not.toContain('WLS-')
  expect(JSON.stringify(await restore(deps, { team: 'duo', dryRun: true }))).not.toContain('WLS-')
  // 标记本身仍在库里：只是不外泄，不是抹掉
  expect(registry.getPost('builder@duo')?.sessionMarker).toBe(marker)
})
