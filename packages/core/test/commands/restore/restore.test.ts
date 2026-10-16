import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { DUO_YAML } from '../../spec/helpers.js'
import { FakeOrca, mkDeps, seedRunningTeam } from '../fake-client.js'
import { restore, restoreExitCode, type RestorePostOutcome } from '../../../src/commands/restore/index.js'

/** 岗位带着标记 WLS-aaaa1111（claude/builder）时的搜索命中。 */
const hit = (sessionId: string) => ({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId, cwd: os.tmpdir() })

/** 团队 duo 正在运行，但 Orca 刚重启过：所有终端都没了，builder 的会话可按标记找回。 */
function restarted(o: FakeOrca) {
  const made = seedRunningTeam(o)
  o.terminals = []
  made.registry.setSessionMarker('builder@duo', 'WLS-aaaa1111', new Date().toISOString())
  o.sessions.push(hit('s1'))
  return made
}

/** 往注册表插一行死 pid 的调度员锁（spec 第 2.2 节的"失联"）。 */
function forgeDeadDispatcher(home: string): void {
  const dead = spawnSync(process.execPath, ['-e', '']).pid!
  const db = new DatabaseSync(path.join(home, 'state.db'))
  db.prepare("INSERT OR REPLACE INTO locks(team, pid, at, heartbeat_at) VALUES ('dispatcher:duo', ?, ?, NULL)").run(dead, new Date().toISOString())
  db.close()
}

test('unknown team → team_unknown; stopped team → team_stopped with a wl up hint', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(restore(deps, { team: 'nope' })).rejects.toMatchObject({ code: 'team_unknown' })
  const o = new FakeOrca()
  const made = seedRunningTeam(o)
  made.registry.setTeamStatus('duo', 'stopped')
  await expect(restore(made.deps, { team: 'duo' })).rejects.toMatchObject({
    code: 'team_stopped',
    hint: expect.stringContaining('wl up'),
  })
})

test('--session for a post not in the team, or a malformed id → session_override_invalid', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  await expect(restore(made.deps, { team: 'duo', sessions: { ghost: 's1' } })).rejects.toMatchObject({ code: 'session_override_invalid' })
  await expect(restore(made.deps, { team: 'duo', sessions: { builder: 'bad id!' } })).rejects.toMatchObject({ code: 'session_override_invalid' })
})

test('spec changed on disk → team_spec_changed before any Orca write', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  fs.writeFileSync(made.registry.getTeam('duo')!.specPath, DUO_YAML.replace('opus', 'sonnet'))
  await expect(restore(made.deps, { team: 'duo' })).rejects.toMatchObject({ code: 'team_spec_changed' })
  expect(o.created).toEqual([])
  expect(o.sent).toEqual([])
})

test('another process holds the team lock → team_busy', async () => {
  const made = restarted(new FakeOrca())
  await made.registry.withTeamLock('duo', () =>
    expect(restore(made.deps, { team: 'duo' })).rejects.toMatchObject({ code: 'team_busy' }))
})

test('coordinator is reclaimed after posts; dead_assignee tasks are recovered to their owners', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  o.tasks.push({ id: 'task-1', status: 'dispatched', title: '干活', spec: 'spec-1', parentId: null, assigneeHandle: 'term-b', dispatchId: 'ctx-9', result: null })
  made.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  const r = await restore(made.deps, { team: 'duo' })
  expect(r.posts.map((p) => [p.address, p.outcome])).toEqual([['builder@duo', 'resumed'], ['checker@duo', 'fresh']])
  expect(r.run!.outcome).toBe('reclaimed')
  expect(r.run!.runId).toBe('run-1')
  expect(r.tasks).toEqual([{ taskId: 'task-1', owner: 'builder@duo', outcome: 'recovered' }])
})

test('a task whose owner came back ambiguous is skipped with a retry hint', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  made.registry.setSessionMarker('checker@duo', 'WLS-bbbb2222', new Date().toISOString())
  o.sessions.push(
    { marker: 'WLS-bbbb2222', agent: 'codex', sessionId: 'c1', cwd: os.tmpdir() },
    { marker: 'WLS-bbbb2222', agent: 'codex', sessionId: 'c2', cwd: os.tmpdir() },
  )
  o.tasks.push({ id: 'task-1', status: 'dispatched', title: '干活', spec: 'spec-1', parentId: null, assigneeHandle: 'term-c', dispatchId: 'ctx-9', result: null })
  made.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  const r = await restore(made.deps, { team: 'duo' })
  expect(r.posts.find((p) => p.address === 'checker@duo')!.outcome).toBe('ambiguous')
  expect(r.tasks).toEqual([{
    taskId: 'task-1', owner: 'checker@duo', outcome: 'skipped',
    reason: expect.stringContaining('主人未接回'),
    retry: expect.stringContaining('wl task recover task-1'),
  }])
})

test('--no-tasks skips recovery', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  o.tasks.push({ id: 'task-1', status: 'dispatched', title: '干活', spec: 'spec-1', parentId: null, assigneeHandle: 'term-b', dispatchId: 'ctx-9', result: null })
  made.registry.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  const r = await restore(made.deps, { team: 'duo', noTasks: true })
  expect(r.tasks).toEqual([])
  expect(o.calls).not.toContain('taskList')
})

test('a stale dispatcher is restarted; a never-started one is left alone', async () => {
  const o = new FakeOrca()
  const made = restarted(o)
  forgeDeadDispatcher(made.home)
  // 调度员终端被创建后模拟它的进程写下了心跳锁，confirmStarted 才能确认
  o.onCreate = () => {
    if (o.created.at(-1)!.title !== 'dispatcher@duo') return
    const db = new DatabaseSync(path.join(made.home, 'state.db'))
    db.prepare("INSERT OR REPLACE INTO locks(team, pid, at, heartbeat_at) VALUES ('dispatcher:duo', ?, ?, NULL)").run(process.pid, new Date().toISOString())
    db.close()
  }
  const r = await restore(made.deps, { team: 'duo' })
  expect(r.dispatcher).toMatchObject({ action: 'restarted', state: 'running' })
  expect(o.created.at(-1)!.title).toBe('dispatcher@duo')

  const o2 = new FakeOrca()
  const made2 = restarted(o2)
  const r2 = await restore(made2.deps, { team: 'duo' })
  expect(r2.dispatcher).toEqual({ action: 'skipped', state: 'never' })
  expect(o2.created.filter((c) => c.title === 'dispatcher@duo')).toEqual([])
})

test('exit code: all good 0, any ambiguous/uncertain 3, orca failure without uncertainty 2', () => {
  const base = { team: 'duo', dryRun: false, dispatcher: { action: 'skipped' as const, state: 'never' }, tasks: [] }
  const posts = (outcome: RestorePostOutcome) => [{ address: 'a@duo', outcome }]
  expect(restoreExitCode({ ...base, posts: posts('kept'), run: { outcome: 'kept', runId: 'run-1' } })).toBe(0)
  expect(restoreExitCode({ ...base, posts: posts('ambiguous') })).toBe(3)
  expect(restoreExitCode({ ...base, posts: posts('kept'), run: { outcome: 'uncertain', runId: null } })).toBe(3)
  expect(restoreExitCode({ ...base, posts: posts('uncertain'), run: { outcome: 'lost', runId: 'run-1' } })).toBe(3)
  expect(restoreExitCode({ ...base, posts: posts('failed') })).toBe(2)
  expect(restoreExitCode({ ...base, posts: posts('kept'), run: { outcome: 'lost', runId: 'run-1' } })).toBe(2)
  expect(restoreExitCode({ ...base, posts: posts('kept'), run: { outcome: 'kept', runId: 'run-1' }, tasks: [{ taskId: 't', owner: 'a@duo', outcome: 'failed' }] })).toBe(2)
  expect(restoreExitCode({ ...base, posts: posts('kept'), run: { outcome: 'kept', runId: 'run-1' }, tasks: [{ taskId: 't', owner: 'a@duo', outcome: 'skipped', reason: '主人未接回' }] })).toBe(3)
})
