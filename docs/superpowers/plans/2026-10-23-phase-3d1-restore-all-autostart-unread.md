# 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wl restore --all` 与 `wl autostart`（macOS / Linux）让机器重启、重新登录后团队自动接回；调度员在牵头岗 worktree 上有新待办时打 Orca 未读标记。

**Architecture:** 块 (a)：`restoreAll` 在 3A 的已审计 `restore` 之上逐团队调用，`waitForOrca` 先等 Orca 可达再等终端列表稳定；autostart 用纯函数生成 plist / systemd unit 与注册命令，经注入的执行器落地。块 (b)：`scan()` 末尾多一步，用 `ScanSnapshot` 与注册表推导待办键，新键才调一次 `worktreeSet({ unread: true })`。两块互不依赖，可分开合并。

**Tech Stack:** TypeScript、vitest、FakeOrca；launchd 用户代理、systemd 用户服务（经 `launchctl`、`systemctl --user`）。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md`（下称 spec）的第 0、6、7、8、10 节与第 11 节对应条目。块 (c)(d) 不在本 plan（3D-2，探针后写）。依赖的 3A、3C 已合并（PR #11）。

## Global Constraints

- 不新增运行时依赖；函数 ≤ 50 行。
- `patrol.unread_mark` 默认 `true`，取默认值时不进规格哈希（走 `patrolDelta`，`DEFAULT_PATROL` 里加 `unreadMark: true`）。
- 未读标记 = `orca worktree set --worktree <sel> --unread`（`--read` 为反向）；标记对象是牵头岗的 worktree（`resolveWorktrees` 解析成绝对路径后用 `path:<abs>`）；独立一次调用，不与 comment / status 合并，失败不动 `orca_sync.fail_count`。
- 首轮（调度员重启后）只把现有键写入 `unread_marks`、不标记；连续 3 次标记失败后本次运行期间不再尝试，并在 `wl attention` 的 `warnings` 里提示一次；红点不由雁阵清除。
- 待办键 = `<分节>:<任务 id | 岗位 | 消息 id | gate id>`；用 `ScanSnapshot`（`stale`、`openQuestions`）加注册表（`listFrozen`、`listPatrolState` 中 `level >= 1` 且未清除的行）推导，**不调用异步的 `attention()`**。
- `wl restore --all` 退出码：逐团队换算（有 `result` 取 `restoreExitCode` 的 0 / 2 / 3，有 `error` 取 `exitCodeOf`：input 1、orca 2、uncertain 3、internal 4），整体取最严重者，顺序 4 > 3 > 2 > 1 > 0。
- `restore` 持团队锁，拿不到立即抛 `team_busy`，不排队；`--all` 里记为该团队的 `error`，不中断其余团队。
- `--wait-orca`：每 10 秒 `orca status` 直到可达（超时 `runtime_unavailable`，退出码 2）；可达后每 10 秒 `terminalList`，连续 4 次采样（handle + connected 的集合）相同才放行（超时 `orca_not_settled`，uncertain 类，退出码 3，不做任何恢复）；整个等待共用一个期限；`wl autostart install` 默认 `15m`；间隔与次数为常量（`ORCA_POLL_MS = 10_000`、`SETTLE_SAMPLES = 4`），已按探针 6 校准。
- autostart 命令：`<node 绝对路径> <入口脚本绝对路径> restore --all --wait-orca <时长> --actor autostart --home <WINGLINE_HOME> --orca <Orca 可执行文件绝对路径>`；node、脚本、home、orca 都必须是绝对路径（`path.resolve` 脚本；其余不是 → `autostart_path_invalid`）；平台相关路径用目标平台的 `path.posix` 拼，不用宿主 `path`；系统命令参数数组启动，不经 shell。
- autostart 位置：macOS `~/Library/LaunchAgents/wingline.restore.plist`（`RunAtLoad = true`，`launchctl bootstrap gui/<uid> <plist>`，已加载先 `bootout`）；Linux `~/.config/systemd/user/wingline-restore.service`（`Type=oneshot`，`WantedBy=default.target`，`systemctl --user daemon-reload` 后 `enable`）；Windows 探针 5 之前一律 `autostart_unsupported`。
- plist / unit 带显式 `PATH=<node 所在目录>:<orca 所在目录>:` 加系统默认目录（去重）；plist 内容做 XML 转义（`& < > " '`）；unit 的 `ExecStart` 里含空格或引号的参数用双引号包裹并转义 `\` 与 `"`，`%` 写 `%%`，`$` 写 `$$`。
- 日志 `<home>/logs/autostart.log`：`install` 先 `mkdir -p <home>/logs`；超过 1 MB 先改名为 `autostart.log.1`（覆盖已有的 `.1`）；`status` 显示最后 20 行。
- 新错误码：`autostart_unsupported`（input，1）、`autostart_path_invalid`（input，1）、`autostart_failed`（internal，4，附原始输出）、`orca_not_settled`（uncertain，3）。
- 提交信息末尾附当前会话的两行署名（`Co-Authored-By` 与 `Claude-Session`，格式见 3A plan 的 Global Constraints，Session 链接用执行时的会话）。

## Review Focus

1. **`restore --all` 遇到手动 `wl restore` 持锁**：该团队 `error.code = 'team_busy'`，其余团队照常恢复，整体退出码 1。测试归 Task 5。
2. **没有任何 `up` 团队**：输出为空、退出码 0，不报错。测试归 Task 5。
3. **登录时 PATH 极简**：生成的 plist / unit 带显式 PATH，包含 node 与 orca 所在目录。快照测试归 Task 6，真机验证归 Task 7。
4. **路径含空格、`&`、`<`、`%`、`$`**（macOS 用户名含空格；脚本放在 `~/My Tools/`）：plist / unit 正确转义。测试归 Task 6。
5. **牵头岗的 worktree 解析不到**（`worktreeShow` 失败）：不标记、不写键，记事件 `unread_skipped`，下一轮重试，不计入 3 次失败。测试归 Task 4。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/spec/{schema,load,hash}.ts` | `patrol.unread_mark` |
| `packages/web/src/components/SpecForm.tsx` | `patrol` 字段白名单加 `unread_mark` |
| `packages/core/src/orca/{types,client}.ts`、`core/test/commands/fake-client.ts` | `worktreeSet({ unread })`、`ORCA_WORKTREE_SUPPORT.unread` |
| `packages/core/src/registry/{migrations,registry}.ts` | `unread_marks` 表与读写 |
| `packages/core/src/commands/dispatcher/unread.ts`（新） | `attentionKeys`、`markUnread` |
| `packages/core/src/commands/dispatcher/{loop,attention}.ts` | `scan()` 末尾接入；失败告警 |
| `packages/core/src/commands/restore/index.ts` | `as`、`restoreAll`、`waitForOrca`、`RestoreAllResult` |
| `packages/core/src/commands/self.ts` | `absoluteSelfCommand` |
| `packages/core/src/commands/autostart/{plan,apply,status}.ts`（新） | 自启动 |
| `packages/cli/src/{cli,output,audit-table}.ts` | `restore [team] --all`、`autostart` |
| `README.md`、`spikes/REPORT.md` | 说明与探针结论 |

---

### Task 1: 探针 3 与 6（真机，人执行）

> **状态（2026-10-23）：** 探针 3 已跑完（结论与回执见 `spikes/REPORT.md` “3D-1 探针 3”、`test/fixtures/receipts/worktree-unread.json`），`ORCA_WORKTREE_SUPPORT.unread` 默认 `true`，Task 2 / 4 照此实现。探针 6 也已由人跑完（结论见 `spikes/REPORT.md` “3D-1 探针 6”）：稳定判据定为间隔 10 秒、连续 4 次相同。Step 1、2 已完成，Step 3 的提交尚未做。

**Files:**
- Create: `spikes/phase-3d1.ts`
- Modify: `spikes/REPORT.md`（新增“3D 探针 3、6”一节）、`test/fixtures/receipts/worktree-unread.json`（新，成立时）

**Interfaces:**
- Produces: REPORT 里的结论：(3) `--unread` / `--read` 的真实参数与回执、写 `--comment` / `--workspace-status` 是否清除未读、红点何时自动清除；(6) Orca 重启后 `terminalList` 稳定所需时间（采样序列）。后续任务按结论决定 `ORCA_WORKTREE_SUPPORT.unread` 与稳定判据常量。

> 沙箱无法完成时写好脚本、报告 NEEDS_CONTEXT，Task 2 按“`--unread` 可用”实现并把 `ORCA_WORKTREE_SUPPORT.unread` 默认 `true`，Task 5 用默认常量（间隔 10 秒、连续 4 次）。

- [ ] **Step 1: 写探针** `spikes/phase-3d1.ts`，两个子命令：`unread`（对一个测试 worktree 依次执行 `orca worktree set --worktree <sel> --unread`、写 `--comment`、`--read`，每步后用 `orca worktree show` 读回状态并存档）、`settle`（重启 Orca 后每 5 秒记录 `terminalList` 的 handle + connected 集合，直到连续 6 次相同）。
- [ ] **Step 2: 真机运行并记录**到 `spikes/REPORT.md`；成立时存回执为 `test/fixtures/receipts/worktree-unread.json`。
- [ ] **Step 3: 提交** — `git commit -m "spike: worktree unread mark and terminal-list settle time"`

---

### Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`

**Files:**
- Modify: `packages/core/src/spec/schema.ts`（`patrolSchema` 加 `unread_mark: z.boolean().default(true)`）、`spec/load.ts`（`PatrolSpec.unreadMark: boolean`，`DEFAULT_PATROL.unreadMark = true`）、`packages/web/src/components/SpecForm.tsx:138`（白名单加 `['unread_mark', true]`）、`packages/core/src/orca/types.ts:124`、`orca/client.ts:241`、`core/test/commands/fake-client.ts:318`
- Test: `packages/core/test/spec/hash.test.ts`（追加）、`packages/core/test/spec/load.test.ts`（追加）、`packages/core/test/orca/client.test.ts`（追加）

**Interfaces:**
- Produces:
  - `PatrolSpec.unreadMark: boolean`（默认 `true`）
  - `OrcaClient.worktreeSet(a: { worktree: string; comment?: string; status?: WorkspaceStatus; unread?: boolean }): Promise<void>` — `unread: true` → 追加 `--unread`，`false` → `--read`；至少带 comment / status / unread 之一，否则抛 `internal`
  - `ORCA_WORKTREE_SUPPORT.unread: boolean`（默认 `true`；探针 3 不成立时改 `false`）
  - `FakeOrca.comments` 的元素增加 `unread?: boolean`

- [ ] **Step 1: 写失败测试**

```ts
test('a team without patrol.unread_mark keeps the old spec hash; unread_mark: false changes it', () => {
  expect(specHash(loadWith({}))).toBe(HASH_BEFORE_3D1)
  expect(specHash(loadWith({ patrol: { unread_mark: false } }))).not.toBe(HASH_BEFORE_3D1)
  expect(specHash(loadWith({ patrol: { unread_mark: true } }))).toBe(HASH_BEFORE_3D1)
})
test('worktreeSet({ unread: true }) runs `worktree set --worktree path:/w/a --unread`', async () => {
  await client.worktreeSet({ worktree: 'path:/w/a', unread: true })
  expect(runner.lastArgs).toEqual(['worktree', 'set', '--worktree', 'path:/w/a', '--unread'])
})
test('worktreeSet({ unread: false }) uses --read', async () => { /* 同上，末尾为 '--read' */ })
test('worktreeSet with no field throws internal', async () => {
  await expect(client.worktreeSet({ worktree: 'path:/w/a' })).rejects.toMatchObject({ code: 'internal' })
})
test('worktreeSet with comment and status still builds the old argv', async () => { /* 与改动前的断言一致 */ })
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/spec packages/core/test/orca/client.test.ts` → FAIL。
- [ ] **Step 3: 实现** 上述签名；`FakeOrca.worktreeSet` 把 `unread` 原样记入 `comments`。`view/snapshot.ts` 的 `WRITE_METHODS` 已含 `worktreeSet`，无需改。
- [ ] **Step 4: 运行确认通过**，连同 `pnpm typecheck`（`SpecForm` 的白名单与 `PatrolSpec` 有类型对照时一并修）。
- [ ] **Step 5: 提交** — `git commit -m "feat(spec,orca): patrol.unread_mark and worktreeSet unread"`

---

### Task 3: 注册表迁移 `unread_marks`

**Files:**
- Modify: `packages/core/src/registry/migrations.ts`（`MIGRATIONS` 追加一条）、`registry/registry.ts`、`packages/core/test/registry/migrate-3c.test.ts:22`、`packages/core/test/registry/patrol.review.test.ts:149-150`
- Test: `packages/core/test/registry/migrate-3d1.test.ts`

**Interfaces:**
- Produces（`Registry` 方法）：
  - `listUnreadMarks(team: string): string[]`
  - `addUnreadMarks(team: string, keys: string[], at: string): void`（已存在的键忽略）
  - `removeUnreadMarks(team: string, keys: string[]): void`
- 迁移 SQL：`CREATE TABLE unread_marks (team TEXT NOT NULL, item_key TEXT NOT NULL, marked_at TEXT NOT NULL, PRIMARY KEY (team, item_key))`

- [ ] **Step 1: 写失败测试** `migrate-3d1.test.ts`

```ts
test('a 3C database upgrades and gains unread_marks; spec hashes unchanged', () => {
  const raw = open3cDatabase()                       // 先执行 MIGRATIONS.slice(0, MIGRATIONS.length - 1)
  const r = new Registry(raw)
  expect(r.schemaVersion()).toBe(MIGRATIONS.length)
  expect(tableNames(raw)).toContain('unread_marks')
})
test('add / list / remove unread marks per team; duplicates ignored', () => {
  r.addUnreadMarks('duo', ['stale:t1', 'stale:t1', 'frozen:builder'], AT)
  expect(r.listUnreadMarks('duo').sort()).toEqual(['frozen:builder', 'stale:t1'])
  r.removeUnreadMarks('duo', ['stale:t1'])
  expect(r.listUnreadMarks('duo')).toEqual(['frozen:builder'])
  expect(r.listUnreadMarks('other')).toEqual([])
})
```

同时修两处既有断言：`migrate-3c.test.ts:22` 的 `toBe(5)` 改成 `toBeGreaterThanOrEqual(5)`；`patrol.review.test.ts:149-150` 的 `MIGRATIONS.length - 1` 改成固定的 `slice(0, 2)` 与 `user_version = 2`（它测的是 2A 库升级）。

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/registry` → 新测试 FAIL，`migrate-3c` 在加迁移后会失败（所以先改它）。
- [ ] **Step 3: 实现** 迁移与三个方法。
- [ ] **Step 4: 运行确认通过** — `packages/core/test/registry` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(registry): unread_marks table"`

---

### Task 4: 未读标记（调度员）

**Files:**
- Create: `packages/core/src/commands/dispatcher/unread.ts`
- Modify: `packages/core/src/commands/dispatcher/loop.ts:258`（`syncOrca` 之后调用）、`attention.ts`（`warningsOf` 增加失败告警）
- Test: `packages/core/test/commands/dispatcher/unread.test.ts`

**Interfaces:**
- Consumes: `ScanSnapshot.stale` / `.openQuestions`（`signals.ts`）、`Registry.listFrozen` / `.listPatrolState`、`resolveWorktrees(deps, posts)`（`orca-sync.ts:132`）、Task 2 的 `worktreeSet`、Task 3 的 `unread_marks` 方法
- Produces:
  - `attentionKeys(p: { stale: StaleItem[]; questions: QuestionRow[]; frozen: FrozenRow[]; signals: PatrolStateRow[] }): string[]` — 纯函数；键为 `stale:<taskId>`、`question:<messageId>`、`frozen:<post>`、`signal:<signal>:<post>:<taskId>`（只含 `level >= 1` 且未清除的信号行）；gate 键为 `gate:<gateId>`（取自 `stale` 里 gate 类条目）
  - `markUnread(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec }, snap: ScanSnapshot, o: { observeOnly: boolean; failures: { count: number } }): Promise<void>` — 流程：`spec.patrol.unreadMark` 为假或 `ORCA_WORKTREE_SUPPORT.unread` 为假 → 直接返回；算出键；首轮（`observeOnly`）只 `addUnreadMarks`；否则有新键 → 标记牵头岗 worktree，成功后写入新键；已从键集消失的键 `removeUnreadMarks`；`failures.count >= 3` 不再尝试
  - `LoopState` 增加 `unreadFailures: { count: number }`；`warningsOf` 在 `count >= 3` 时追加一条 “Orca 未读标记连续失败，本次调度员运行期间已停止尝试”（读自 `patrol_events`，事件 `unread_gave_up`）

- [ ] **Step 1: 写失败测试**（FakeOrca + `clock()`；牵头岗 worktree 为 `path:/w/lead`）

```ts
test('a new attention key marks the lead worktree once; the same keys do not mark again', async () => {
  await markUnread(deps, ctx, snapWith({ stale: [item('t1')] }), { observeOnly: false, failures })
  await markUnread(deps, ctx, snapWith({ stale: [item('t1')] }), { observeOnly: false, failures })
  expect(orca.comments.filter((c) => c.unread === true)).toEqual([{ worktree: 'path:/w/lead', unread: true }])
})
test('a key that disappears and comes back counts as new', async () => { /* 三轮：t1 → 空 → t1；共标记 2 次 */ })
test('the first scan after a restart only records keys', async () => {
  await markUnread(deps, ctx, snapWith({ stale: [item('t1')] }), { observeOnly: true, failures })
  expect(orca.comments).toEqual([])
  expect(deps.registry.listUnreadMarks('duo')).toEqual(['stale:t1'])
})
test('unread_mark: false never calls worktreeSet', async () => { expect(orca.comments).toEqual([]) })
test('the mark is its own worktreeSet call: no comment, no status, orca_sync.fail_count untouched', async () => {
  expect(orca.comments[0]).toEqual({ worktree: 'path:/w/lead', unread: true })
})
test('a failing worktreeSet writes nothing to unread_marks and retries next round; 3 failures stop the run and warn once', async () => {
  // 连续 3 轮 worktreeSet 抛错 → 第 4 轮不再调用；warningsOf 含“未读标记连续失败”恰好一条
})
test('lead worktree that cannot be resolved: no mark, no key, event unread_skipped, not counted as a failure', async () => {
  expect(failures.count).toBe(0)
})
test('does not call attention(): taskList / terminalList call counts are unchanged by markUnread', async () => {})
test('attentionKeys matches the entries attention() reports (stale, questions, frozen, signals)', async () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/dispatcher/unread.test.ts` → FAIL。
- [ ] **Step 3: 实现** 上述两个函数与 `scan()` 接入；`worktreeSet` 的选择器用 `` `path:${abs}` ``（同 3C）。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/dispatcher` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(patrol): unread mark on the lead worktree for new attention items"`

---

### Task 5: `wl restore --all`

**Files:**
- Modify: `packages/core/src/commands/restore/index.ts`（`RestoreArgs.as`、`restoreAll`、`waitForOrca`）、`packages/core/src/errors.ts`（若错误码在此登记）、`packages/cli/src/cli.ts:258`（`restore [team]`、`--all`、`--wait-orca`、隐藏 `--actor`、`--home`、`--orca`）、`output.ts`（`renderRestoreAll`）、`packages/cli/test/main.test.ts`（追加 `--all` 用例）
- Test: `packages/core/test/commands/restore/restore-all.test.ts`、`packages/cli/test/main.test.ts`（追加）

**Interfaces:**
- Produces:
  - `RestoreArgs.as?: string` — 审计读 `a.as ?? o.actor`（`audit.ts` 已支持），`restore` 本体忽略；`as = 'autostart'` 时 `resolveActor` 直接返回，不查 `terminalList`
  - `type RestoreAllResult = { teams: Array<{ team: string; result?: RestoreResult; error?: { kind: ErrorKind; code: string; message: string; hint?: string } }> }`
  - `restoreAll(deps: CommandDeps, a: { waitOrcaMs?: number; dryRun?: boolean; noTasks?: boolean; as?: string }, o: { restoreOne: (a: RestoreArgs) => Promise<RestoreResult>; sleep?: (ms: number) => Promise<void> }): Promise<RestoreAllResult>` — 先 `waitForOrca`（有 `waitOrcaMs` 时），再对 `teams.status = up` 的团队串行调 `restoreOne({ team, dryRun?, noTasks?, as? })`（`as` 由调用方给，不写死；没给就不带这个键）；单团队抛错捕获为该团队的 `error`
  - `waitForOrca(deps: CommandDeps, timeoutMs: number, sleep: (ms: number) => Promise<void>): Promise<void>` — 常量 `ORCA_POLL_MS = 10_000`、`SETTLE_SAMPLES = 4`
  - `restoreAllExitCode(r: RestoreAllResult): 0 | 1 | 2 | 3 | 4`
  - CLI：`wl restore [team] --all [--wait-orca <时长>] [--dry-run] [--no-tasks] [--json]`；`--all` 与 `<team>`、`--session` 互斥（输入错误，退出码 1）；`restoreOne` 在 CLI 层传入已审计的 `commands.restore`；`restoreAll` 由 CLI 直接调用核心函数，不放进 `Commands`，所以不进 `AUDIT` / `WRITE_COMMANDS`，`main.test.ts` 的审计表断言无需改；没有 `up` 团队时人读输出“没有处于运行状态的团队，无需恢复”、`--json` 为 `{ teams: [] }`、退出码 0

- [ ] **Step 1: 写失败测试**（FakeOrca；`sleep` 注入为立即返回并计数）

```ts
test('only teams with status up are restored, one restoreOne call each, in order', async () => {
  const r = await restoreAll(deps, {}, { restoreOne })
  expect(restoreOne.mock.calls.map(([a]) => a.team)).toEqual(['duo', 'trio'])
  expect(restoreOne.mock.calls[0]![0].as).toBe('autostart')
})
test('a team that throws team_busy gets an error and the rest still run; exit code 1', async () => {
  expect(r.teams[0]).toMatchObject({ team: 'duo', error: { code: 'team_busy', kind: 'input' } })
  expect(r.teams[1]!.result).toBeDefined()
  expect(restoreAllExitCode(r)).toBe(1)
})
test('exit code is the most severe: internal 4 > uncertain 3 > orca 2 > input 1 > 0', () => {})
test('no team is up: empty result, exit code 0', async () => {
  expect(await restoreAll(deps, {}, { restoreOne })).toEqual({ teams: [] })
})
test('waitForOrca: status becomes reachable on the 3rd poll; sleeps 2 x 10s between polls', async () => {
  expect(sleeps).toEqual([10_000, 10_000, /* 之后进入稳定采样 */])
})
test('waitForOrca: never reachable within the budget → runtime_unavailable', async () => {})
test('settle: terminal sets A, B, B, B, B pass (4 identical in a row); A, B, B, B, C does not; sets that keep changing → orca_not_settled and restoreOne never called', async () => {})
test('settle: a 15s plateau of 2 terminals between unreachable and the final 3 (the probe-6 shape) does not pass early', async () => {
  // 采样序列取自 spikes/out/phase-3d1/darwin/settle-samples.json 的形状：2,2,2 后变 3，3 要连续 4 次才放行
})
test('settle sampling counts handle + connected, not titles', async () => {})
test('--all with <team> or --session exits 1 with an input error', async () => {})
test('--actor autostart is recorded as the audit actor, one audit row per team, and does not call terminalList', async () => {})
test('--dry-run --all is not audited (AUDIT.restore.skip)', async () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/restore/restore-all.test.ts packages/cli/test/main.test.ts` → FAIL。
- [ ] **Step 3: 实现** 上述签名；`--wait-orca` 的整个等待共用一个期限（`waitForOrca` 内部分配给“可达”与“稳定”两个阶段）；不替用户启动 Orca。`restore` 子命令同时声明 `--home` / `--orca` 并经 `execute(..., overrides)` 生效（照 `dispatcher run`，`cli.ts:170`）。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/restore`、`packages/cli` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): --all with --wait-orca and autostart actor"`

---

### Task 6: `wl autostart`

**Files:**
- Create: `packages/core/src/commands/autostart/plan.ts`、`apply.ts`、`status.ts`
- Modify: `packages/core/src/commands/self.ts`（新增 `absoluteSelfCommand`）、`packages/cli/src/cli.ts`、`output.ts`、`README.md`
- Test: `packages/core/test/commands/autostart/plan.test.ts`、`apply.test.ts`、`status.test.ts`、`packages/core/test/commands/self.test.ts`（追加）

**Interfaces:**
- Consumes: Task 5 的 `restore --all --actor autostart` 命令行；`parseDuration`（`controls.ts:8`）；`WINDOWS_UNSAFE`
- Produces:
  - `absoluteSelfCommand(a: SelfSpec): { file: string; args: string[] }` — 不依赖 PATH：`node`、`script`、`home`、`orca` 都按 `a.platform` 对应的 `path.posix` / `path.win32` 检查绝对性，脚本先 `path.resolve`；不合 → `autostart_path_invalid`；`win32` 仍做 `WINDOWS_UNSAFE` 校验。参数列表与 `selfCommand` 一样末尾追加 `--home <home> --orca <orca>`
  - `type AutostartPlatform = 'darwin' | 'linux'`
  - `interface AutostartPlan { platform: AutostartPlatform; file: { path: string; content: string }; logPath: string; register: Array<{ file: string; args: string[]; allowFail?: boolean }>; unregister: Array<{ file: string; args: string[]; allowFail?: boolean }> }`
  - `planAutostart(o: { platform: NodeJS.Platform; homeDir: string; uid?: number; node: string; script: string; home: string; orca: string; waitOrca: string }): AutostartPlan` — `platform` 为 `win32` 或其它 → 抛 `autostart_unsupported`
  - `type Exec = (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>`
  - `applyAutostart(plan: AutostartPlan, exec: Exec, fsx?: FsLike): Promise<void>` — `mkdir -p` 日志目录；日志 > 1 MB 先轮转为 `.1`；先写临时文件再改名；`register` 依次执行（`allowFail` 的命令失败不算）；注册失败删除刚写的文件并抛 `autostart_failed`（附 stderr）
  - `removeAutostart(plan: AutostartPlan, exec: Exec, fsx?: FsLike): Promise<void>` — 执行 `unregister`，删文件；没安装过 → 成功
  - `autostartStatus(plan: AutostartPlan, exec: Exec, io: { readFile: (p: string) => string; exists: (p: string) => boolean }): Promise<{ installed: boolean; location: string; command: string[]; commandMissing: string[]; logTail: string[]; linger: boolean | undefined }>` — `command` 是从**已安装的文件**里解析出的词（`installedCommand`，不是按当前环境重算的），`commandMissing` 列出命令中已不存在的 node / 入口脚本；Linux 上用 `loginctl show-user <user> -p Linger` 填 `linger`，未开启时 CLI 渲染提示“无界面或 SSH 场景需要 loginctl enable-linger <user>”
  - CLI：`wl autostart install [--wait-orca <时长，默认 15m>] [--json]`、`uninstall`、`status`

- [ ] **Step 1: 写失败测试**（`path.posix` 显式构造期望值，不用宿主 `path`）

```ts
test('macOS plan: plist has RunAtLoad, absolute ProgramArguments, log paths and a PATH containing the node and orca dirs', () => {
  const plan = planAutostart({ ...BASE, platform: 'darwin', uid: 501 })
  expect(plan.file.path).toBe('/Users/me/Library/LaunchAgents/wingline.restore.plist')
  expect(plan.file.content).toContain('<key>RunAtLoad</key>\n  <true/>')
  expect(plan.file.content).toContain('<string>restore</string>')
  expect(plan.file.content).toContain('/opt/node/bin:/opt/orca/bin:')
  expect(plan.register).toEqual([
    { file: '/bin/launchctl', args: ['bootout', 'gui/501/wingline.restore'], allowFail: true },
    { file: '/bin/launchctl', args: ['bootstrap', 'gui/501', plan.file.path] },
  ])
})
test('plist escapes & < > " \' in paths', () => {
  const plan = planAutostart({ ...BASE, platform: 'darwin', script: '/Users/a&b/<wl>/main.js' })
  expect(plan.file.content).toContain('/Users/a&amp;b/&lt;wl&gt;/main.js')
})
test('linux plan: oneshot unit, WantedBy=default.target, Environment=PATH, daemon-reload then enable', () => {
  expect(plan.register.map((c) => c.args)).toEqual([['--user', 'daemon-reload'], ['--user', 'enable', 'wingline-restore.service']])
})
test('unit ExecStart quotes args with spaces and escapes \\ " % $', () => {
  expect(execStartOf(plan)).toBe('"/opt/my node/bin/node" "/home/a b/wl/main.js" restore --all --wait-orca 15m --actor autostart --home "/home/a b/.wingline" --orca "/opt/orca/bin/orca"')
  // 另有 % → %%、$ → $$、" → \" 的用例
})
test('win32 and unknown platforms throw autostart_unsupported', () => {
  expect(() => planAutostart({ ...BASE, platform: 'win32' })).toThrow(expect.objectContaining({ code: 'autostart_unsupported' }))
})
test('a relative node / script / home / orca path throws autostart_path_invalid', () => {})
test('install twice overwrites the same file; uninstall when absent succeeds', async () => {})
test('a failing register removes the written file and throws autostart_failed carrying stderr', async () => {})
test('install creates <home>/logs and rotates an autostart.log over 1 MB to autostart.log.1', async () => {})
test('status reports location, command, the last 20 log lines, linger on linux', async () => {})
test('status lists a node path that no longer exists in commandMissing', async () => {})
test('uninstall plan runs launchctl bootout / systemctl disable and deletes only our own file', async () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/autostart packages/core/test/commands/self.test.ts` → FAIL。
- [ ] **Step 3: 实现** 上述签名（`exec` 在 CLI 层为 `spawn(file, args, { shell: false })` 的 Promise 包装）。README 增加“登录后自动恢复”一节：两个平台的位置、安装即执行一次（macOS）、`loginctl enable-linger` 说明、Orca 以系统服务运行时依靠 `--wait-orca`、卸载方法、Windows 暂不支持。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(cli): wl autostart for login-time restore (macOS, Linux)"`

---

### Task 7: 收尾与真机验证

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md`（顶部状态行标注 3D-1 已实现）、`docs/superpowers/plans/2026-10-16-phase-3d-screen-signals-remote-autostart.md`（索引状态）

- [ ] **Step 1: 全量验证** — `pnpm typecheck && pnpm test`（已知的两例沙箱僵尸进程失败除外）→ PASS；贴出输出再声明完成。
- [ ] **Step 2: 真机检查（人执行，逐项勾选）**：(a) macOS `wl autostart install` 后立即执行一次，`autostart.log` 有结果；(b) 重新登录后 Orca 就绪时所有 `up` 团队被恢复，时间线每个团队一行、执行者 `autostart`；(c) launchd 最小环境下 `node` 与 `orca` 都能启动，日志里没有 “command not found”；(d) 有新待办时 Orca 侧栏里牵头岗 workspace 出现未读标记，同一批不重复标记。
- [ ] **Step 3: 更新 spec 与索引 plan 的状态行；提交** — `git commit -m "docs: mark phase 3d-1 done"`
