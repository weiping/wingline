/** 按顺序执行；PRAGMA user_version 记录已执行的数量。 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE teams (
    name TEXT PRIMARY KEY,
    spec_path TEXT NOT NULL,
    spec_hash TEXT NOT NULL,
    run_id TEXT,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE posts (
    address TEXT PRIMARY KEY,
    team TEXT NOT NULL REFERENCES teams(name),
    agent TEXT NOT NULL,
    worktree TEXT NOT NULL,
    handle TEXT,
    status TEXT NOT NULL,
    is_lead INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    receipt TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE locks (
    team TEXT PRIMARY KEY,
    pid INTEGER NOT NULL,
    at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE teams ADD COLUMN coordinator_handle TEXT;
  ALTER TABLE requests ADD COLUMN retry_request TEXT;
  ALTER TABLE requests ADD COLUMN args TEXT;
  CREATE TABLE task_ext (task_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), tags TEXT NOT NULL DEFAULT '[]',
    kind TEXT NOT NULL DEFAULT 'work', plan TEXT, claimed_by TEXT, epoch INTEGER NOT NULL DEFAULT 0,
    gate_failures INTEGER NOT NULL DEFAULT 0, ready_since TEXT, dispatched_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE task_done (task_id TEXT NOT NULL, epoch INTEGER NOT NULL, post TEXT NOT NULL, verdict TEXT NOT NULL,
    gate_failures INTEGER NOT NULL, dispatch_id TEXT NOT NULL, report_from TEXT NOT NULL, body TEXT, result TEXT,
    finished_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (task_id, epoch));
  CREATE TABLE gates (gate_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), task_id TEXT NOT NULL);
  CREATE TABLE task_log (id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, task_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    at TEXT NOT NULL, actor TEXT NOT NULL, actor_source TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
  CREATE INDEX task_log_task ON task_log(task_id, id);
  `,
]
