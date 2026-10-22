import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { WinglineError } from '../errors.js'
import { MIGRATIONS } from './migrations.js'

export type PostStatus = 'live' | 'offline' | 'uncertain' | 'closed'
export type RequestState = 'pending' | 'done' | 'uncertain' | 'failed'

export interface TeamRow {
  name: string
  specPath: string
  specHash: string
  runId: string | null
  coordinatorHandle: string | null
  status: 'up' | 'stopped'
}

export interface PostRow {
  address: string
  team: string
  agent: string
  worktree: string
  handle: string | null
  status: PostStatus
  isLead: boolean
  sessionMarker: string | null
  sessionId: string | null
  sessionAt: string | null
}

export interface RequestRow {
  state: RequestState
  receipt: string | null
  retryRequest: string | null
  args: string | null
  updatedAt: string
}

export type TaskKind = 'work' | 'review'
export interface TaskExtRow {
  taskId: string
  team: string
  tags: string[]
  kind: TaskKind
  plan: string | null
  claimedBy: string | null
  epoch: number
  gateFailures: number
  readySince: string | null
  dispatchedAt: string | null
}

export type Verdict = 'passed' | 'escalate' | 'bypassed'
export interface DoneVerdictRow {
  taskId: string
  epoch: number
  post: string
  verdict: Verdict
  gateFailures: number
  dispatchId: string
  reportFrom: string
  body: string | null
  result: string | null
  finishedAt: string | null
  createdAt: string
}

export type ActorSource = 'explicit' | 'implicit' | 'human'
export type TaskAction =
  | 'create' | 'claim' | 'release' | 'reassign' | 'plan' | 'start' | 'queued' | 'notify'
  | 'gate_failed' | 'done' | 'escalate' | 'resolve' | 'recover' | 'epoch_bump' | 'bypass_detected'
export interface TaskLogRow {
  id: number
  team: string
  taskId: string
  epoch: number
  at: string
  actor: string
  actorSource: ActorSource
  action: TaskAction
  detail: string | null
}

export interface AuditRow {
  id: number
  team: string
  at: string
  actor: string
  command: string
  target: string | null
  outcome: string
  detail: string | null
}

const auditRow = (r: Row): AuditRow => ({
  id: r.id as number,
  team: r.team as string,
  at: r.at as string,
  actor: r.actor as string,
  command: r.command as string,
  target: r.target as string | null,
  outcome: r.outcome as string,
  detail: r.detail as string | null,
})

/** task_ext 单列 setter 的列名白名单。 */
type ExtColumn = 'claimed_by' | 'plan' | 'ready_since' | 'dispatched_at'

const taskExtRow = (r: Row): TaskExtRow => ({
  taskId: r.task_id as string,
  team: r.team as string,
  tags: JSON.parse(r.tags as string) as string[],
  kind: r.kind as TaskKind,
  plan: r.plan as string | null,
  claimedBy: r.claimed_by as string | null,
  epoch: r.epoch as number,
  gateFailures: r.gate_failures as number,
  readySince: r.ready_since as string | null,
  dispatchedAt: r.dispatched_at as string | null,
})

const verdictRow = (r: Row): DoneVerdictRow => ({
  taskId: r.task_id as string,
  epoch: r.epoch as number,
  post: r.post as string,
  verdict: r.verdict as Verdict,
  gateFailures: r.gate_failures as number,
  dispatchId: r.dispatch_id as string,
  reportFrom: r.report_from as string,
  body: r.body as string | null,
  result: r.result as string | null,
  finishedAt: r.finished_at as string | null,
  createdAt: r.created_at as string,
})

const logRow = (r: Row): TaskLogRow => ({
  id: r.id as number,
  team: r.team as string,
  taskId: r.task_id as string,
  epoch: r.epoch as number,
  at: r.at as string,
  actor: r.actor as string,
  actorSource: r.actor_source as ActorSource,
  action: r.action as TaskAction,
  detail: r.detail as string | null,
})

export type PatrolSignal =
  | 'no_progress' | 'waiting_approval' | 'waiting_answer' | 'dead_assignee' | 'owner_idle'
  | 'overdue' | 'done_unfinished' | 'bypassed' | 'call_uncertain' | 'gate_streak'
export interface PatrolStateRow {
  team: string
  post: string
  signal: PatrolSignal
  taskId: string
  level: number
  since: string
  levelAt: string
  lastNudgedAt: string | null
  notifyCount: number
  nextDueAt: string | null
  clearedAt: string | null
}
export interface FrozenRow {
  post: string
  reason: string
  signal: string | null
  frozenAt: string
}
export interface QuestionRow {
  team: string
  messageId: string
  taskId: string | null
  dispatchId: string | null
  asker: string
  body: string
  options: string[]
  relayedAt: string
  answeredAt: string | null
}
export interface PatrolEvent {
  team: string
  post?: string | null
  signal?: string | null
  taskId?: string | null
  action: string
  outcome?: string | null
  messageId?: string | null
  detail?: unknown
}

/** 调度员上次写进 Orca 的工作区状态与注释（3C）：只在值变化时再写，fail_count 连续失败 3 次后停手。 */
export interface OrcaSyncRow {
  worktree: string
  team: string
  status: string | null
  comment: string | null
  writtenAt: string | null
  failCount: number
}

const orcaSyncRow = (r: Row): OrcaSyncRow => ({
  worktree: r.worktree as string,
  team: r.team as string,
  status: r.status as string | null,
  comment: r.comment as string | null,
  writtenAt: r.written_at as string | null,
  failCount: r.fail_count as number,
})

const patrolRow = (r: Row): PatrolStateRow => ({
  team: r.team as string,
  post: r.post as string,
  signal: r.signal as PatrolSignal,
  taskId: r.task_id as string,
  level: r.level as number,
  since: r.since as string,
  levelAt: r.level_at as string,
  lastNudgedAt: r.last_nudged_at as string | null,
  notifyCount: r.notify_count as number,
  nextDueAt: r.next_due_at as string | null,
  clearedAt: r.cleared_at as string | null,
})

const frozenRow = (r: Row): FrozenRow => ({
  post: r.post as string, reason: r.reason as string, signal: r.signal as string | null, frozenAt: r.frozen_at as string,
})

const questionRow = (r: Row): QuestionRow => ({
  team: r.team as string,
  messageId: r.message_id as string,
  taskId: r.task_id as string | null,
  dispatchId: r.dispatch_id as string | null,
  asker: r.asker as string,
  body: r.body as string,
  options: JSON.parse(r.options as string) as string[],
  relayedAt: r.relayed_at as string,
  answeredAt: r.answered_at as string | null,
})

const eventRow = (r: Row): PatrolEvent & { id: number; at: string } => ({
  id: r.id as number,
  at: r.at as string,
  team: r.team as string,
  post: r.post as string | null,
  signal: r.signal as string | null,
  taskId: r.task_id as string | null,
  action: r.action as string,
  outcome: r.outcome as string | null,
  messageId: r.message_id as string | null,
  detail: r.detail === null ? null : JSON.parse(r.detail as string),
})

const RECEIPT_LIMIT = 16 * 1024
const BUSY_TIMEOUT_MS = 5000

type Row = Record<string, string | number | null>

const teamRow = (r: Row): TeamRow => ({
  name: r.name as string,
  specPath: r.spec_path as string,
  specHash: r.spec_hash as string,
  runId: r.run_id as string | null,
  coordinatorHandle: r.coordinator_handle as string | null,
  status: r.status as TeamRow['status'],
})

const postRow = (r: Row): PostRow => ({
  address: r.address as string,
  team: r.team as string,
  agent: r.agent as string,
  worktree: r.worktree as string,
  handle: r.handle as string | null,
  status: r.status as PostStatus,
  isLead: r.is_lead === 1,
  sessionMarker: r.session_marker as string | null,
  sessionId: r.session_id as string | null,
  sessionAt: r.session_at as string | null,
})

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class Registry {
  private constructor(
    private readonly db: DatabaseSync,
    private readonly clock: () => Date,
  ) {}

  private now(): string {
    return this.clock().toISOString()
  }

  static open(file: string, o: { now?: () => Date } = {}): Registry {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const db = new DatabaseSync(file)
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    Registry.migrate(db)
    return new Registry(db, o.now ?? (() => new Date()))
  }

  /** 已执行的迁移数量（PRAGMA user_version）。 */
  schemaVersion(): number {
    return (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  }

  private static migrate(db: DatabaseSync): void {
    const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (current > MIGRATIONS.length) {
      throw new WinglineError('input', 'registry_too_new', `注册表由更新版本的 wingline 写入（版本 ${current}，本程序只认识到 ${MIGRATIONS.length}）`, {
        hint: '升级 wingline 后重试；不要用旧版本打开这个数据库',
      })
    }
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec('BEGIN IMMEDIATE')
      try {
        // 等写锁期间别的进程可能已经执行完这一步：拿到锁后重新读版本
        if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version > v) {
          db.exec('ROLLBACK')
          continue
        }
        db.exec(MIGRATIONS[v]!)
        db.exec(`PRAGMA user_version = ${v + 1}`)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  }

  getTeam(name: string): TeamRow | null {
    const r = this.db.prepare('SELECT * FROM teams WHERE name = ?').get(name) as Row | undefined
    return r ? teamRow(r) : null
  }

  listTeams(): TeamRow[] {
    return (this.db.prepare('SELECT * FROM teams ORDER BY name').all() as Row[]).map(teamRow)
  }

  getPost(address: string): PostRow | null {
    const r = this.db.prepare('SELECT * FROM posts WHERE address = ?').get(address) as Row | undefined
    return r ? postRow(r) : null
  }

  upsertTeam(t: TeamRow): void {
    this.db
      .prepare(
        `INSERT INTO teams(name, spec_path, spec_hash, run_id, coordinator_handle, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET spec_path = excluded.spec_path, spec_hash = excluded.spec_hash,
           run_id = excluded.run_id, coordinator_handle = excluded.coordinator_handle, status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(t.name, t.specPath, t.specHash, t.runId, t.coordinatorHandle, t.status, this.now())
  }

  /** 只改状态这一列：不覆盖并发刷新过的 coordinator_handle / run_id（spec 第 5.2 节）。 */
  setTeamStatus(team: string, status: TeamRow['status']): void {
    this.db.prepare('UPDATE teams SET status = ?, updated_at = ? WHERE name = ?').run(status, this.now(), team)
  }

  /** 已有团队重新 wl up：只更新规格与状态。 */
  markTeamUp(team: string, specPath: string, specHash: string): void {
    this.db.prepare("UPDATE teams SET spec_path = ?, spec_hash = ?, status = 'up', updated_at = ? WHERE name = ?").run(specPath, specHash, this.now(), team)
  }

  updateCoordinatorHandle(team: string, handle: string | null): void {
    this.db.prepare('UPDATE teams SET coordinator_handle = ?, updated_at = ? WHERE name = ?').run(handle, this.now(), team)
  }

  setRunId(team: string, runId: string | null): void {
    this.db.prepare('UPDATE teams SET run_id = ?, updated_at = ? WHERE name = ?').run(runId, this.now(), team)
  }

  listPosts(team: string): PostRow[] {
    return (this.db.prepare('SELECT * FROM posts WHERE team = ? ORDER BY rowid').all(team) as Row[]).map(postRow)
  }

  upsertPost(p: PostRow): void {
    this.db
      .prepare(
        `INSERT INTO posts(address, team, agent, worktree, handle, status, is_lead, session_marker, session_id, session_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET team = excluded.team, agent = excluded.agent, worktree = excluded.worktree,
           handle = excluded.handle, status = excluded.status, is_lead = excluded.is_lead, updated_at = excluded.updated_at`,
      )
      .run(p.address, p.team, p.agent, p.worktree, p.handle, p.status, p.isLead ? 1 : 0, p.sessionMarker, p.sessionId, p.sessionAt, this.now())
  }

  setPostHandle(address: string, handle: string | null): void {
    this.db.prepare('UPDATE posts SET handle = ?, updated_at = ? WHERE address = ?').run(handle, this.now(), address)
  }

  setPostStatus(address: string, status: PostStatus): void {
    this.db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE address = ?').run(status, this.now(), address)
  }

  /** 换标记即换代：缓存的 session_id 一并作废（spec 第 4 节）。 */
  setSessionMarker(address: string, marker: string, at: string): void {
    this.db.prepare('UPDATE posts SET session_marker = ?, session_at = ?, session_id = NULL, updated_at = ? WHERE address = ?').run(marker, at, this.now(), address)
  }

  setSessionId(address: string, sessionId: string): void {
    this.db.prepare('UPDATE posts SET session_id = ?, updated_at = ? WHERE address = ?').run(sessionId, this.now(), address)
  }

  getRequest(id: string): RequestRow | null {
    const r = this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Row | undefined
    if (!r) return null
    return {
      state: r.state as RequestState,
      receipt: r.receipt as string | null,
      retryRequest: r.retry_request as string | null,
      args: r.args as string | null,
      updatedAt: r.updated_at as string,
    }
  }

  openIntent(id: string, retryRequest: string, args: unknown): void {
    this.db
      .prepare(
        `INSERT INTO requests(id, state, receipt, retry_request, args, updated_at) VALUES (?, 'pending', NULL, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(id, retryRequest, JSON.stringify(args), this.now())
  }

  /** 换 id 与参数；给了 expectedOld 时是比较后交换：旧 id 已被别的进程换掉则不动，返回 false。 */
  reissueIntent(id: string, retryRequest: string, args: unknown, expectedOld?: string): boolean {
    const where = expectedOld === undefined ? 'id = ?' : 'id = ? AND retry_request = ?'
    const binds = expectedOld === undefined ? [id] : [id, expectedOld]
    const r = this.db
      .prepare(`UPDATE requests SET state = 'pending', receipt = NULL, retry_request = ?, args = ?, updated_at = ? WHERE ${where}`)
      .run(retryRequest, JSON.stringify(args), this.now(), ...binds)
    return Number(r.changes) > 0
  }

  dropRequest(id: string): void {
    this.db.prepare('DELETE FROM requests WHERE id = ?').run(id)
  }

  listOpenRequests(prefix: string): Array<{ id: string; state: RequestState; updatedAt: string; args: string | null }> {
    const rows = this.db
      .prepare("SELECT id, state, updated_at, args FROM requests WHERE state IN ('pending','uncertain') AND substr(id, 1, ?) = ? ORDER BY id")
      .all(prefix.length, prefix) as Row[]
    return rows.map((r) => ({ id: r.id as string, state: r.state as RequestState, updatedAt: r.updated_at as string, args: r.args as string | null }))
  }

  /** 原子地认领一条本地记录（直接记为 done，可带结果）：第一个调用者得到 true，其余得到 false。 */
  claimRequest(id: string, receipt?: unknown): boolean {
    const text = receipt === undefined ? null : JSON.stringify(receipt)
    const r = this.db
      .prepare("INSERT INTO requests(id, state, receipt, updated_at) VALUES (?, 'done', ?, ?) ON CONFLICT(id) DO NOTHING")
      .run(id, text, this.now())
    return Number(r.changes) > 0
  }

  beginRequest(id: string): void {
    if (this.getRequest(id)?.state === 'done') {
      throw new WinglineError('internal', 'request_already_done', `请求 ${id} 已完成，不应再次发起`)
    }
    this.db
      .prepare(
        `INSERT INTO requests(id, state, receipt, updated_at) VALUES (?, 'pending', NULL, ?)
         ON CONFLICT(id) DO UPDATE SET state = 'pending', receipt = NULL, updated_at = excluded.updated_at`,
      )
      .run(id, this.now())
  }

  finishRequest(id: string, state: Exclude<RequestState, 'pending'>, receipt?: unknown): void {
    const text = receipt === undefined ? null : JSON.stringify(receipt).slice(0, RECEIPT_LIMIT)
    this.db.prepare('UPDATE requests SET state = ?, receipt = ?, updated_at = ? WHERE id = ?').run(state, text, this.now(), id)
  }

  /**
   * 跨进程互斥：持锁方 pid 仍存活时，其他持有者收到 team_busy；死进程的锁被接管。
   * 给了 takeoverAfterMs 时，心跳（缺省取 at）早于该时长的锁也视为死锁（spec 第 2.2 节）。
   */
  async withTeamLock<T>(team: string, fn: () => Promise<T> | T, o: { takeoverAfterMs?: number } = {}): Promise<T> {
    this.acquire(team, o.takeoverAfterMs)
    try {
      return await fn()
    } finally {
      this.db.prepare('DELETE FROM locks WHERE team = ? AND pid = ?').run(team, process.pid)
    }
  }

  private lockIsLive(held: { pid: number; at: string; heartbeat_at: string | null }, takeoverAfterMs?: number): boolean {
    if (!pidAlive(held.pid)) return false
    if (takeoverAfterMs === undefined) return true
    const last = Date.parse(held.heartbeat_at ?? held.at)
    return this.clock().getTime() - last <= takeoverAfterMs
  }

  private acquire(team: string, takeoverAfterMs?: number): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const held = this.db.prepare('SELECT pid, at, heartbeat_at FROM locks WHERE team = ?').get(team) as
        | { pid: number; at: string; heartbeat_at: string | null }
        | undefined
      if (held && this.lockIsLive(held, takeoverAfterMs)) {
        throw new WinglineError('input', 'team_busy', `团队 ${team} 正在被另一个 wl 命令（pid ${held.pid}）操作`, {
          hint: '等待其完成后重试',
        })
      }
      this.db.prepare('INSERT OR REPLACE INTO locks(team, pid, at, heartbeat_at) VALUES (?, ?, ?, NULL)').run(team, process.pid, this.now())
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** 只更新本进程持有的那一行；返回该行是否仍归本进程。 */
  heartbeat(key: string): boolean {
    const r = this.db.prepare('UPDATE locks SET heartbeat_at = ? WHERE team = ? AND pid = ?').run(this.now(), key, process.pid)
    return Number(r.changes) === 1
  }

  /** 只删指定 pid 持有的那一行（进程已死、没来得及自己清理时用）。 */
  deleteLockOf(key: string, pid: number): void {
    this.db.prepare('DELETE FROM locks WHERE team = ? AND pid = ?').run(key, pid)
  }

  getLock(key: string): { pid: number; at: string; heartbeatAt: string | null } | null {
    const r = this.db.prepare('SELECT pid, at, heartbeat_at FROM locks WHERE team = ?').get(key) as Row | undefined
    return r ? { pid: r.pid as number, at: r.at as string, heartbeatAt: r.heartbeat_at as string | null } : null
  }

  insertTaskExt(row: { taskId: string; team: string; tags: string[]; kind: TaskKind; claimedBy?: string | null; readySince?: string | null }): void {
    this.db
      .prepare(
        `INSERT INTO task_ext(task_id, team, tags, kind, claimed_by, ready_since, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO NOTHING`,
      )
      .run(row.taskId, row.team, JSON.stringify(row.tags), row.kind, row.claimedBy ?? null, row.readySince ?? null, this.now())
  }

  getTaskExt(taskId: string): TaskExtRow | null {
    const r = this.db.prepare('SELECT * FROM task_ext WHERE task_id = ?').get(taskId) as Row | undefined
    return r ? taskExtRow(r) : null
  }

  /** 行不存在时按默认值插入；column 来自 ExtColumn 白名单。 */
  private upsertExt(team: string, taskId: string, column: ExtColumn, value: string | null): void {
    this.db
      .prepare(
        `INSERT INTO task_ext(task_id, team, created_at, ${column}) VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET ${column} = excluded.${column}`,
      )
      .run(taskId, team, this.now(), value)
  }

  private ensureExt(team: string, taskId: string): void {
    this.db.prepare('INSERT INTO task_ext(task_id, team, created_at) VALUES (?, ?, ?) ON CONFLICT(task_id) DO NOTHING').run(taskId, team, this.now())
  }

  setClaimedBy(team: string, taskId: string, claimedBy: string | null): void {
    this.upsertExt(team, taskId, 'claimed_by', claimedBy)
  }

  setPlan(team: string, taskId: string, plan: string): void {
    this.upsertExt(team, taskId, 'plan', plan)
  }

  setReadySince(team: string, taskId: string, at: string): void {
    this.upsertExt(team, taskId, 'ready_since', at)
  }

  setDispatchedAt(team: string, taskId: string, at: string): void {
    this.upsertExt(team, taskId, 'dispatched_at', at)
  }

  incrementGateFailures(team: string, taskId: string): number {
    this.ensureExt(team, taskId)
    this.db.prepare('UPDATE task_ext SET gate_failures = gate_failures + 1 WHERE task_id = ?').run(taskId)
    return this.getTaskExt(taskId)!.gateFailures
  }

  /** 比较后更新：返回此刻的 epoch（别人已加过时就是别人加后的值）。 */
  bumpEpoch(team: string, taskId: string, fromEpoch: number, resetGateFailures: boolean): number {
    this.ensureExt(team, taskId)
    const reset = resetGateFailures ? ', gate_failures = 0' : ''
    this.db.prepare(`UPDATE task_ext SET epoch = epoch + 1${reset} WHERE task_id = ? AND epoch = ?`).run(taskId, fromEpoch)
    return this.getTaskExt(taskId)!.epoch
  }

  getVerdict(taskId: string, epoch: number): DoneVerdictRow | null {
    const r = this.db.prepare('SELECT * FROM task_done WHERE task_id = ? AND epoch = ?').get(taskId, epoch) as Row | undefined
    return r ? verdictRow(r) : null
  }

  /** 先落盘者胜；escalate 时在同一事务里把 gate_failures 钉进 task_ext。 */
  recordVerdict(row: Omit<DoneVerdictRow, 'result' | 'finishedAt' | 'createdAt'>): DoneVerdictRow {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.getVerdict(row.taskId, row.epoch)
      if (existing) {
        this.db.exec('COMMIT')
        return existing
      }
      if (row.verdict === 'escalate') {
        this.db.prepare('UPDATE task_ext SET gate_failures = ? WHERE task_id = ?').run(row.gateFailures, row.taskId)
      }
      this.db
        .prepare(
          `INSERT INTO task_done(task_id, epoch, post, verdict, gate_failures, dispatch_id, report_from, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(row.taskId, row.epoch, row.post, row.verdict, row.gateFailures, row.dispatchId, row.reportFrom, row.body, this.now())
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
    return this.getVerdict(row.taskId, row.epoch)!
  }

  finishVerdict(taskId: string, epoch: number, result: unknown): void {
    this.db
      .prepare('UPDATE task_done SET result = ?, finished_at = ? WHERE task_id = ? AND epoch = ?')
      .run(JSON.stringify(result), this.now(), taskId, epoch)
  }

  listUnfinishedVerdicts(team: string): DoneVerdictRow[] {
    const sql = `SELECT d.* FROM task_done d JOIN task_ext e ON e.task_id = d.task_id
                 WHERE e.team = ? AND d.finished_at IS NULL ORDER BY d.created_at, d.task_id`
    return (this.db.prepare(sql).all(team) as Row[]).map(verdictRow)
  }

  listVerdictsOf(taskId: string): DoneVerdictRow[] {
    return (this.db.prepare('SELECT * FROM task_done WHERE task_id = ? ORDER BY epoch').all(taskId) as Row[]).map(verdictRow)
  }

  recordGate(gateId: string, team: string, taskId: string): void {
    this.db.prepare('INSERT INTO gates(gate_id, team, task_id) VALUES (?, ?, ?) ON CONFLICT(gate_id) DO NOTHING').run(gateId, team, taskId)
  }

  getGate(gateId: string): { team: string; taskId: string } | null {
    const r = this.db.prepare('SELECT team, task_id FROM gates WHERE gate_id = ?').get(gateId) as Row | undefined
    return r ? { team: r.team as string, taskId: r.task_id as string } : null
  }

  listGates(team: string): Array<{ gateId: string; taskId: string }> {
    const rows = this.db.prepare('SELECT gate_id, task_id FROM gates WHERE team = ? ORDER BY rowid').all(team) as Row[]
    return rows.map((r) => ({ gateId: r.gate_id as string, taskId: r.task_id as string }))
  }

  appendTaskLog(row: Omit<TaskLogRow, 'id' | 'at' | 'detail'> & { detail?: unknown }): void {
    const detail = row.detail === undefined || row.detail === null ? null : typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail)
    this.db
      .prepare('INSERT INTO task_log(team, task_id, epoch, at, actor, actor_source, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.team, row.taskId, row.epoch, this.now(), row.actor, row.actorSource, row.action, detail)
  }

  listTaskLog(taskId: string): TaskLogRow[] {
    return (this.db.prepare('SELECT * FROM task_log WHERE task_id = ? ORDER BY id').all(taskId) as Row[]).map(logRow)
  }

  // —— 阶段 2B：巡查状态、冻结、静默、游标、提问、巡查事件 ——

  getPatrolState(team: string, post: string, signal: PatrolSignal, taskId: string): PatrolStateRow | null {
    const r = this.db.prepare('SELECT * FROM patrol_state WHERE team = ? AND post = ? AND signal = ? AND task_id = ?').get(team, post, signal, taskId) as Row | undefined
    return r ? patrolRow(r) : null
  }

  listPatrolState(team: string): PatrolStateRow[] {
    return (this.db.prepare('SELECT * FROM patrol_state WHERE team = ? ORDER BY rowid').all(team) as Row[]).map(patrolRow)
  }

  putPatrolState(s: PatrolStateRow): void {
    this.db
      .prepare(
        `INSERT INTO patrol_state(team, post, signal, task_id, level, since, level_at, last_nudged_at, notify_count, next_due_at, cleared_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team, post, signal, task_id) DO UPDATE SET level = excluded.level, since = excluded.since, level_at = excluded.level_at,
           last_nudged_at = excluded.last_nudged_at, notify_count = excluded.notify_count, next_due_at = excluded.next_due_at, cleared_at = excluded.cleared_at`,
      )
      .run(s.team, s.post, s.signal, s.taskId, s.level, s.since, s.levelAt, s.lastNudgedAt, s.notifyCount, s.nextDueAt, s.clearedAt)
  }

  /** unfreeze 用：该岗位所有巡查行回到 level 0 并标记已清除（spec 第 7 节）。 */
  resetPatrolForPost(post: string, at: string): void {
    this.db.prepare('UPDATE patrol_state SET level = 0, cleared_at = ?, last_nudged_at = NULL WHERE post = ?').run(at, post)
  }

  freezePost(a: { post: string; team: string; reason: string; signal?: string | null }): void {
    this.db
      .prepare('INSERT INTO frozen_posts(post, team, reason, signal, frozen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post) DO NOTHING')
      .run(a.post, a.team, a.reason, a.signal ?? null, this.now())
  }

  unfreezePost(post: string): void {
    this.db.prepare('DELETE FROM frozen_posts WHERE post = ?').run(post)
  }

  getFrozen(post: string): FrozenRow | null {
    const r = this.db.prepare('SELECT * FROM frozen_posts WHERE post = ?').get(post) as Row | undefined
    return r ? frozenRow(r) : null
  }

  listFrozen(team: string): FrozenRow[] {
    return (this.db.prepare('SELECT * FROM frozen_posts WHERE team = ? ORDER BY frozen_at, post').all(team) as Row[]).map(frozenRow)
  }

  hush(team: string, post: string, until: string): void {
    this.db.prepare('INSERT INTO hushes(post, team, until) VALUES (?, ?, ?) ON CONFLICT(post) DO UPDATE SET until = excluded.until').run(post, team, until)
  }

  unhush(post: string): void {
    this.db.prepare('DELETE FROM hushes WHERE post = ?').run(post)
  }

  hushedUntil(post: string): string | null {
    const r = this.db.prepare('SELECT until FROM hushes WHERE post = ?').get(post) as Row | undefined
    return r ? (r.until as string) : null
  }

  listHushes(team: string): Array<{ post: string; until: string }> {
    const rows = this.db.prepare('SELECT post, until FROM hushes WHERE team = ? ORDER BY post').all(team) as Row[]
    return rows.map((r) => ({ post: r.post as string, until: r.until as string }))
  }

  getCursor(post: string): string | null {
    const r = this.db.prepare('SELECT after FROM patrol_cursor WHERE post = ?').get(post) as Row | undefined
    return r ? (r.after as string) : null
  }

  setCursor(team: string, post: string, after: string): void {
    this.db.prepare('INSERT INTO patrol_cursor(post, team, after) VALUES (?, ?, ?) ON CONFLICT(post) DO UPDATE SET after = excluded.after').run(post, team, after)
  }

  recordQuestion(q: Omit<QuestionRow, 'answeredAt'>): boolean {
    const r = this.db
      .prepare(
        `INSERT INTO questions(message_id, team, task_id, dispatch_id, asker, body, options, relayed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO NOTHING`,
      )
      .run(q.messageId, q.team, q.taskId, q.dispatchId, q.asker, q.body, JSON.stringify(q.options), q.relayedAt)
    return Number(r.changes) > 0
  }

  getQuestion(messageId: string): QuestionRow | null {
    const r = this.db.prepare('SELECT * FROM questions WHERE message_id = ?').get(messageId) as Row | undefined
    return r ? questionRow(r) : null
  }

  listOpenQuestions(team: string): QuestionRow[] {
    return (this.db.prepare('SELECT * FROM questions WHERE team = ? AND answered_at IS NULL ORDER BY rowid').all(team) as Row[]).map(questionRow)
  }

  answerQuestion(messageId: string, at: string): void {
    this.db.prepare('UPDATE questions SET answered_at = ? WHERE message_id = ?').run(at, messageId)
  }

  /** message_id 冲突（已处理过的消息）→ false。 */
  appendPatrolEvent(e: PatrolEvent): boolean {
    const detail = e.detail === undefined || e.detail === null ? null : JSON.stringify(e.detail)
    const r = this.db
      .prepare(
        `INSERT INTO patrol_events(team, at, post, signal, task_id, action, outcome, message_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(e.team, this.now(), e.post ?? null, e.signal ?? null, e.taskId ?? null, e.action, e.outcome ?? null, e.messageId ?? null, detail)
    return Number(r.changes) > 0
  }

  /**
   * 时间线三表共用的分页，返回 id 升序。不给 afterId：取最新 limit 条；给了 afterId（含 0）：取游标之后最早的 limit 条，
   * 这样游标落后超过 limit 行时也只是分批追上，不会跳行。
   */
  private pageRows(table: 'patrol_events' | 'audit_events' | 'task_log', team: string, o: { afterId?: number; since?: string; limit?: number }): Row[] {
    const forward = o.afterId !== undefined
    const rows = this.db
      .prepare(`SELECT * FROM ${table} WHERE team = ? AND at >= ? AND id > ? ORDER BY id ${forward ? 'ASC' : 'DESC'} LIMIT ?`)
      .all(team, o.since ?? '', o.afterId ?? 0, o.limit ?? 1000) as Row[]
    return forward ? rows : rows.reverse()
  }

  listPatrolEvents(team: string, o: { afterId?: number; since?: string; limit?: number } = {}): Array<PatrolEvent & { id: number; at: string }> {
    return this.pageRows('patrol_events', team, o).map(eventRow)
  }

  // —— 阶段 3A：审计事件、团队任务日志、时间线游标 ——
  // 三者共用 pageRows 的分页语义：id 升序；不带 afterId 取最新 limit 条；带 afterId 取游标之后最早的 limit 条。

  appendAudit(r: Omit<AuditRow, 'id' | 'at' | 'detail'> & { at?: string; detail?: unknown }): void {
    const detail = r.detail === undefined || r.detail === null ? null : typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)
    this.db
      .prepare('INSERT INTO audit_events(team, at, actor, command, target, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.team, r.at ?? this.now(), r.actor, r.command, r.target, r.outcome, detail)
  }

  // —— 阶段 3C：Orca 同步状态 ——

  getOrcaSync(worktree: string): OrcaSyncRow | null {
    const r = this.db.prepare('SELECT * FROM orca_sync WHERE worktree = ?').get(worktree) as Row | undefined
    return r ? orcaSyncRow(r) : null
  }

  putOrcaSync(s: OrcaSyncRow): void {
    this.db
      .prepare(
        `INSERT INTO orca_sync(worktree, team, status, comment, written_at, fail_count) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(worktree) DO UPDATE SET team = excluded.team, status = excluded.status, comment = excluded.comment,
           written_at = excluded.written_at, fail_count = excluded.fail_count`,
      )
      .run(s.worktree, s.team, s.status, s.comment, s.writtenAt, s.failCount)
  }

  listOrcaSync(team: string): OrcaSyncRow[] {
    return (this.db.prepare('SELECT * FROM orca_sync WHERE team = ? ORDER BY worktree').all(team) as Row[]).map(orcaSyncRow)
  }

  /** 调度员启动时调用：此前停手的 worktree 重新尝试。 */
  resetOrcaSyncFailures(team: string): void {
    this.db.prepare('UPDATE orca_sync SET fail_count = 0 WHERE team = ?').run(team)
  }

  listAudit(team: string, o: { afterId?: number; since?: string; limit?: number } = {}): AuditRow[] {
    return this.pageRows('audit_events', team, o).map(auditRow)
  }

  /** 删除 before 之前的审计行；给 team 时只清该团队（wl log / 调度员循环都按团队触发）。 */
  pruneAudit(before: string, team?: string): number {
    const sql = team === undefined
      ? 'DELETE FROM audit_events WHERE at < ?'
      : 'DELETE FROM audit_events WHERE at < ? AND team = ?'
    return Number(this.db.prepare(sql).run(before, ...(team === undefined ? [] : [team])).changes)
  }

  listTeamTaskLog(team: string, o: { afterId?: number; since?: string; limit?: number } = {}): TaskLogRow[] {
    return this.pageRows('task_log', team, o).map(logRow)
  }

  /** team 是否写过 actions 之一的事件。 */
  hasPatrolEventOf(team: string, actions: readonly string[]): boolean {
    const marks = actions.map(() => '?').join(', ')
    return this.db.prepare(`SELECT 1 FROM patrol_events WHERE team = ? AND action IN (${marks}) LIMIT 1`).get(team, ...actions) !== undefined
  }

  prunePatrolEvents(before: string): number {
    return Number(this.db.prepare('DELETE FROM patrol_events WHERE at < ?').run(before).changes)
  }

  /** finished_at > after（null 表示不限）的已完成判定，按 finished_at 升序。 */
  listFinishedVerdictsAfter(post: string, after: string | null): DoneVerdictRow[] {
    const sql = 'SELECT * FROM task_done WHERE post = ? AND finished_at IS NOT NULL AND finished_at > ? ORDER BY finished_at, task_id'
    return (this.db.prepare(sql).all(post, after ?? '') as Row[]).map(verdictRow)
  }

  /** 2A done 写下的交付记录（requests 里 done:%:delivered:<target> 且 done 的行）。 */
  listDeliveries(target: string, since?: string): Array<{ key: string; target: string; taskId: string; delivery: string; at: string }> {
    const rows = this.db
      .prepare("SELECT id, receipt, updated_at FROM requests WHERE state = 'done' AND id LIKE 'done:%:delivered:' || ? AND updated_at >= ? ORDER BY updated_at, id")
      .all(target, since ?? '') as Row[]
    return rows.map((r) => ({ key: r.id as string, at: r.updated_at as string, ...(JSON.parse(r.receipt as string) as { target: string; taskId: string; delivery: string }) }))
  }

  close(): void {
    this.db.close()
  }
}
