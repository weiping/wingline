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
]
