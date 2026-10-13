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
}

const RECEIPT_LIMIT = 16 * 1024
const BUSY_TIMEOUT_MS = 5000

type Row = Record<string, string | number | null>

const now = () => new Date().toISOString()

const teamRow = (r: Row): TeamRow => ({
  name: r.name as string,
  specPath: r.spec_path as string,
  specHash: r.spec_hash as string,
  runId: r.run_id as string | null,
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
})

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class Registry {
  private constructor(private readonly db: DatabaseSync) {}

  static open(file: string): Registry {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const db = new DatabaseSync(file)
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    Registry.migrate(db)
    return new Registry(db)
  }

  private static migrate(db: DatabaseSync): void {
    const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec('BEGIN IMMEDIATE')
      try {
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
        `INSERT INTO teams(name, spec_path, spec_hash, run_id, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET spec_path = excluded.spec_path, spec_hash = excluded.spec_hash,
           run_id = excluded.run_id, status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(t.name, t.specPath, t.specHash, t.runId, t.status, now())
  }

  listPosts(team: string): PostRow[] {
    return (this.db.prepare('SELECT * FROM posts WHERE team = ? ORDER BY rowid').all(team) as Row[]).map(postRow)
  }

  upsertPost(p: PostRow): void {
    this.db
      .prepare(
        `INSERT INTO posts(address, team, agent, worktree, handle, status, is_lead, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET team = excluded.team, agent = excluded.agent, worktree = excluded.worktree,
           handle = excluded.handle, status = excluded.status, is_lead = excluded.is_lead, updated_at = excluded.updated_at`,
      )
      .run(p.address, p.team, p.agent, p.worktree, p.handle, p.status, p.isLead ? 1 : 0, now())
  }

  setPostHandle(address: string, handle: string | null): void {
    this.db.prepare('UPDATE posts SET handle = ?, updated_at = ? WHERE address = ?').run(handle, now(), address)
  }

  setPostStatus(address: string, status: PostStatus): void {
    this.db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE address = ?').run(status, now(), address)
  }

  getRequest(id: string): { state: RequestState; receipt: string | null } | null {
    const r = this.db.prepare('SELECT state, receipt FROM requests WHERE id = ?').get(id) as Row | undefined
    return r ? { state: r.state as RequestState, receipt: r.receipt as string | null } : null
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
      .run(id, now())
  }

  finishRequest(id: string, state: Exclude<RequestState, 'pending'>, receipt?: unknown): void {
    const text = receipt === undefined ? null : JSON.stringify(receipt).slice(0, RECEIPT_LIMIT)
    this.db.prepare('UPDATE requests SET state = ?, receipt = ?, updated_at = ? WHERE id = ?').run(state, text, now(), id)
  }

  /** 跨进程互斥：持锁方 pid 仍存活时，其他持有者收到 team_busy；死进程的锁被接管。 */
  async withTeamLock<T>(team: string, fn: () => Promise<T> | T): Promise<T> {
    this.acquire(team)
    try {
      return await fn()
    } finally {
      this.db.prepare('DELETE FROM locks WHERE team = ? AND pid = ?').run(team, process.pid)
    }
  }

  private acquire(team: string): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const held = this.db.prepare('SELECT pid FROM locks WHERE team = ?').get(team) as { pid: number } | undefined
      if (held && pidAlive(held.pid)) {
        throw new WinglineError('input', 'team_busy', `团队 ${team} 正在被另一个 wl 命令（pid ${held.pid}）操作`, {
          hint: '等待其完成后重试',
        })
      }
      this.db.prepare('INSERT OR REPLACE INTO locks(team, pid, at) VALUES (?, ?, ?)').run(team, process.pid, now())
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}
