# 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调度员从画面识别“上下文快满”“用量上限”并通知 / 暂停升级；写了 `environment` 的岗位能在远端环境里找回会话；有新待办时给牵头岗终端打未读标记；`wl restore --all` 与 `wl autostart` 实现登录后自动恢复。

**Architecture:** 画面判定集中到 `core/src/screen/`（迁入 2A 的 `classifyPreview` 模式），巡查新增两种信号走 2B 的 `patrol_state`/`advancePatrol` 之外的一个小状态推进器；远端环境只改 3A 的 `findSession`；未读标记是 `scan()` 末尾的一步；autostart 以纯函数生成三平台的文件与命令，经注入的执行器落地。

**Tech Stack:** TypeScript、vitest、FakeOrca；launchd / systemd 用户服务 / Windows 任务计划（经 `launchctl`、`systemctl`、`schtasks.exe`）。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md`（下称 spec）；依赖 3A、3C 的 plan 已完成。

## Global Constraints

- 不新增运行时依赖。
- 画面信号只通知与暂停升级：除“继续”提示外不往终端打字，且必须经 `screenGuard` 判定为 `clear`；从不冻结。
- `context_low` 成立条件：剩余 ≤ 10%，或明确的“快满”文字且无数字（`percent = null`）。
- `usage_limit` 暂停截止：`resetsAt + 2 分钟`；`resetsAt` 为空时 `now + 1 小时`；存于 `patrol_state.next_due_at`。
- 暂停期间 `no_progress`、`owner_idle`、`overdue` 只观察、不升级。
- 继续提示文本：`[雁阵] 用量已重置，请继续手上的任务 <id>`（无在办任务时 `[雁阵] 用量已重置，请继续`）。
- 画面信号只看最后 40 行；`screenGuard` 仍看最后 8 行（行为不变）。
- `posts[].environment` 格式：`^[a-z0-9._-]{1,64}$`，不符 → `environment_invalid`；未写时不进规格哈希。
- `patrol.unread_mark` 默认 `true`，取默认值时不进规格哈希；连续 3 次失败后本次调度员运行期间不再尝试。
- `wl restore --all` 退出码优先顺序：3 > 2 > 1 > 0；`--wait-orca` 每 10 秒探测一次，默认 15 分钟（`wl autostart install`）。
- autostart 位置：macOS `~/Library/LaunchAgents/wingline.restore.plist`；Linux `~/.config/systemd/user/wingline-restore.service`；Windows 任务 `\Wingline\Restore`，经 `%SystemRoot%\System32\schtasks.exe`。
- 新错误码：`environment_invalid`（1）、`autostart_unsupported`（1）、`autostart_failed`（internal，4）；沿用 `runtime_unavailable`（2）。
- 函数 ≤ 50 行；提交信息末尾附 3A plan 中的两行署名。

## Review Focus

1. **画面上同时有用量上限提示与确认框**：判定为 `at_prompt`（2A 的等批准处理），用量上限照常记录；到点时画面不是 `clear` 就不发“继续”。测试归 Task 3。
2. **重置时间是过去的时刻**（例如 “resets 9am” 而现在 10 点）：解析为明天 9 点，不会立即发“继续”。测试归 Task 2。
3. **调度员在暂停期间重启**：重启后首轮只观察，暂停截止时间从 `patrol_state.next_due_at` 读回，不丢失、不重复通知。测试归 Task 3。
4. **自启动路径含空格**（例如 `C:\Program Files\nodejs\node.exe`、macOS 用户名含空格）：生成的 plist / unit / `/TR` 都正确引用。测试归 Task 6。
5. **登录时 Orca 尚未就绪、等待中用户手动执行 `wl restore`**：两者经团队锁串行，第二个看到已恢复的岗位为 `kept`。测试归 Task 5。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `spikes/phase-3d.ts`（新） | 画面样本、远端环境搜索、未读标记三项探针 |
| `packages/core/test/contract/screens/`（新） | 画面样本 |
| `packages/core/src/screen/patterns.ts`（新） | 模式表与 `detectScreen` |
| `packages/core/src/screen/reset-time.ts`（新） | 重置时间解析 |
| `packages/core/src/commands/task/notify.ts` | `classifyPreview` 改为调用 `screen/patterns.ts` |
| `packages/core/src/commands/dispatcher/screen-signals.ts`（新） | 两种画面信号的状态推进 |
| `packages/core/src/commands/dispatcher/unread.ts`（新） | 未读标记 |
| `packages/core/src/commands/dispatcher/loop.ts`、`advance.ts` | 接入；暂停升级 |
| `packages/core/src/commands/restore/find-session.ts` | `environment` 与 `cwd` 规则 |
| `packages/core/src/commands/restore/index.ts` | `--all`、`--wait-orca`、`--actor` |
| `packages/core/src/commands/autostart/plan.ts`、`apply.ts`、`status.ts`（新） | 自启动 |
| `packages/core/src/spec/schema.ts`、`load.ts`、`hash.ts` | 新字段 |
| `packages/core/src/registry/*` | `unread_marks` |
| `packages/cli/src/cli.ts`、`output.ts` | `restore --all`、`autostart` |

---

### Task 1: 3D 探针

**Files:**
- Create: `spikes/phase-3d.ts`、`packages/core/test/contract/screens/*.txt`
- Modify: `spikes/REPORT.md`、`test/fixtures/receipts/search-remote.json`（新，成立时）、`test/fixtures/receipts/terminal-unread.json`（新，成立时）

**Interfaces:**
- Produces: 画面样本文件 `claude-context-low.txt`、`claude-usage-limit.txt`、`codex-context-low.txt`、`codex-usage-limit.txt`（取不到的不建；文档来源的在首行注明 `# source: docs, not captured`）；REPORT 中远端搜索字段与包装脚本 `--resume` 的结论、未读标记命令与参数。

> 需要真机（第 2 项在 Lima 环境）。沙箱里无法完成时写好脚本并报告 NEEDS_CONTEXT；后续任务用 spec 第 4.1 节的示例文本作为临时样本（文件首行 `# source: spec example`），并在相应测试名标 `(provisional)`。

- [ ] **Step 1: 写探针**（三个子命令 `screens`、`remote`、`unread`）：`screens` 开 Claude / Codex 终端并把 `terminal show` 的 `preview` 存档（用量上限无法触发时提示人从 agent 文档或源码粘贴原文）；`remote` 在 `--environment <env>` 下发标记、搜索、用包装脚本加 `--resume` 恢复并读屏；`unread` 列出 `orca --help` 中相关命令并对一个测试终端执行。
- [ ] **Step 2: 真机运行并记录**到 `spikes/REPORT.md`“3D 探针”一节；存样本与回执。
- [ ] **Step 3: 提交** — `git commit -m "spike: screen samples, remote session search, unread mark"`

---

### Task 2: 画面模式表与重置时间解析

**Files:**
- Create: `packages/core/src/screen/patterns.ts`、`packages/core/src/screen/reset-time.ts`
- Modify: `packages/core/src/commands/task/notify.ts`（`classifyPreview` 委托给 `guardOf`，`PROMPT_PATTERNS` 与 `SHELL_PROMPT` 迁入并从 `notify.ts` 重新导出）
- Test: `packages/core/test/screen/patterns.test.ts`、`packages/core/test/screen/reset-time.test.ts`；`packages/core/test/commands/task/notify.test.ts` 与 `contract.test.ts` 照跑

**Interfaces:**
- Produces:
  - `type ScreenSignal = { kind: 'context_low'; percent: number | null } | { kind: 'usage_limit'; resetsAt: Date | null }`
  - `guardOf(preview: string): 'clear' | 'at_prompt' | 'shell' | 'unknown'`（原 `classifyPreview` 逻辑，最后 8 行）
  - `detectScreen(agent: string, preview: string, now: Date): { guard: ReturnType<typeof guardOf>; signals: ScreenSignal[] }` — 信号只看最后 40 行；按 agent 查表，未知 agent 只做 `guard`
  - `SIGNAL_PATTERNS: Record<string, Array<{ kind: ScreenSignal['kind']; re: RegExp; extract(m: RegExpMatchArray, now: Date): ScreenSignal }>>`
  - `parseResetTime(text: string, now: Date, tz?: string): Date | null` — 支持 `3pm`、`3:30pm`、`15:00`、`(Asia/Shanghai)`、`in 2h`、`in 45m`；仅时刻时取最早的未来时刻

- [ ] **Step 1: 写失败测试**

```ts
test('claude context sample at 5% → context_low 5; at 30% → no signal', () => {})
test('claude usage-limit sample → usage_limit with the parsed reset time', () => {})
test('a quoted limit message above the last 40 lines is ignored', () => {})
test('unknown agent yields guard only', () => {})
test.each([
  ['resets 3pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-16T15:00:00+08:00'],
  ['resets 9am', '2026-10-16T10:00:00+08:00', 'Asia/Shanghai', '2026-10-17T09:00:00+08:00'],
  ['resets 15:30 (Asia/Shanghai)', '2026-10-16T01:00:00Z', undefined, '2026-10-16T15:30:00+08:00'],
  ['try again in 45m', '2026-10-16T10:00:00Z', undefined, '2026-10-16T10:45:00Z'],
])('parseResetTime(%s) at %s → %s', (text, now, tz, want) => {})
test('unparseable reset text → null', () => {})
test('guardOf keeps the 2A behaviour (all existing classifyPreview cases)', () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/screen` → FAIL。
- [ ] **Step 3: 实现**（样本从 `packages/core/test/contract/screens/` 读取）。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/task` 与 `test/orca/contract.test.ts` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(screen): signal patterns and reset time parsing"`

---

### Task 3: 画面信号的巡查处理

**Files:**
- Create: `packages/core/src/commands/dispatcher/screen-signals.ts`
- Modify: `packages/core/src/registry/registry.ts`（`PatrolSignal` 增加 `'context_low' | 'usage_limit'`）、`packages/core/src/commands/dispatcher/loop.ts`（`scan` 中调用）、`advance.ts`（暂停判定）、`attention.ts`（“处理中的信号”显示百分比与重置时间）、`orca-sync.ts`（3C，注释标记）
- Test: `packages/core/test/commands/dispatcher/screen-signals.test.ts`、`packages/core/test/commands/dispatcher/screen-signals.flow.test.ts`

**Interfaces:**
- Consumes: `detectScreen`（Task 2）、`notifyHuman`、`typeTo`、`ScanSnapshot`、`registry.getPatrolState/putPatrolState`、`posts.session_marker/session_id`（3A）
- Produces:
  - `advanceScreenSignals(deps: CommandDeps, ctx: Ctx, snap: ScanSnapshot, previews: Map<string, string>, o: { observeOnly: boolean }): Promise<void>`
  - `isUsagePaused(registry: Registry, team: string, post: string, now: Date): boolean` — `advancePatrol` 在推进 `no_progress`/`owner_idle`/`overdue` 之前调用，为真时只观察
  - `scan()` 每轮为每个存活岗位读一次 `terminalShow` 的 `preview`，放进 `previews` 供本函数与 3C 的注释使用
  - `context_low` 的去重键：`patrol_state.task_id` 存 `<session_marker>:<session_id ?? ''>`

- [ ] **Step 1: 写失败测试**（FakeOrca + `clock()`，`mkDeps(o, { now: c.now, monotonic: c.monotonic })`）

```ts
test('usage limit: lead and external notified once; no_progress does not escalate until reset+2m', async () => {})
test('at reset with the notice gone, the post gets one continue line and the signal clears', async () => {})
test('at reset with the notice still there, the signal stays and is re-notified per backoff', async () => {})
test('continue line is not typed while the screen is at a prompt', async () => {})
test('lead out of usage: only external outlet and attention, never notified about itself', async () => {})
test('context low: one notice per session; a new session marker clears it', async () => {})
test('neither signal ever freezes a post', async () => {})
test('first scan after restart only observes; pause deadline survives a restart', async () => {})
test('attention shows percent / reset time; Orca comment carries ⚠ marks', async () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（通知文本：用量 `[雁阵] <岗位> 用量已用完，预计 <HH:MM> 重置；期间不会提醒它`；上下文 `[雁阵] <岗位> 上下文剩余 <N%>，可能即将自动压缩或需要换会话`，`percent` 为空时写“不多”）。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/dispatcher` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(patrol): context-low and usage-limit screen signals"`

---

### Task 4: 远端环境与未读标记

**Files:**
- Create: `packages/core/src/commands/dispatcher/unread.ts`
- Modify: `packages/core/src/spec/schema.ts`、`load.ts`（`PostSpec.environment: string | null`、`PatrolSpec.unreadMark: boolean`）、`hash.ts`（`environment` 为空时不进哈希）、`packages/core/src/commands/restore/find-session.ts`、`packages/core/src/orca/types.ts`、`client.ts`（`terminalMarkUnread`）、`packages/core/test/commands/fake-client.ts`、`packages/core/src/registry/migrations.ts`/`registry.ts`（`unread_marks`）、`loop.ts`（`scan` 末尾调用）
- Test: `packages/core/test/commands/restore/find-session.test.ts`（追加）、`packages/core/test/commands/dispatcher/unread.test.ts`、`packages/core/test/spec/hash.test.ts`（追加）、`packages/core/test/registry/migrate-3d.test.ts`

**Interfaces:**
- Produces:
  - `findSession` 在 `post.environment` 非空时调用 `search({ query, agent, environment })`；`cwd` 规则：有且相同保留、为空保留、有但不同排除（3A 中“为空排除”的规则只对本机岗位保留）
  - `OrcaClient.terminalMarkUnread(a: { handle: string }): Promise<void>`（命令与参数按 Task 1 结论；不支持时实现为抛 `WinglineError('orca', 'unsupported', …)`）
  - `attentionKeys(report: AttentionReport): string[]` — 键为 `<分节>:<任务 id | 岗位 | 消息 id | gate id>`
  - `markUnread(deps: CommandDeps, ctx: Ctx, report: AttentionReport, o: { observeOnly: boolean; failures: { count: number } }): Promise<void>`
  - Registry：`listUnreadMarks(team: string): string[]`、`addUnreadMarks(team: string, keys: string[], at: string): void`、`removeUnreadMarks(team: string, keys: string[]): void`

- [ ] **Step 1: 写失败测试**

```ts
test('environment is passed to search; cwd null kept, same kept, different dropped', async () => {})
test('environment_invalid for "Lima Agent"', () => {})
test('a post without environment keeps the old spec hash; adding one changes it', () => {})
test('new attention keys mark the lead terminal once; same keys do not re-mark', async () => {})
test('a key that disappears and comes back counts as new', async () => {})
test('first scan only records keys', async () => {})
test('unread_mark: false never calls terminalMarkUnread', async () => {})
test('three failures stop marking for this run and add one warning', async () => {})
test('migration from a 3C database adds unread_marks', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat: remote-environment session search and unread mark"`

---

### Task 5: `wl restore --all`

**Files:**
- Modify: `packages/core/src/commands/restore/index.ts`、`packages/core/src/audit.ts`（`actor` 覆盖）、`packages/cli/src/cli.ts`、`output.ts`
- Test: `packages/core/test/commands/restore/restore-all.test.ts`、`packages/cli/test/main.test.ts`（追加）

**Interfaces:**
- Produces:
  - `restoreAll(deps: CommandDeps, a: { waitOrcaMs?: number; noTasks?: boolean; sleep?: (ms: number) => Promise<void> }): Promise<{ teams: RestoreResult[] }>` — 先 `waitForOrca`，再对 `status = up` 的团队依次 `restore`
  - `waitForOrca(deps: CommandDeps, timeoutMs: number, sleep: (ms: number) => Promise<void>): Promise<void>` — 每 10 秒 `orca status`；超时抛 `runtime_unavailable`
  - `restoreAllExitCode(r: { teams: RestoreResult[] }): number`
  - CLI：`wl restore --all [--wait-orca <时长>] [--no-tasks] [--json]`；`--all` 与 `<team>`、`--session` 互斥（输入错误）；隐藏选项 `--actor <name>`（只接受 `autostart`），传给 `auditedCommands` 的 `actor`

- [ ] **Step 1: 写失败测试**：只处理 `up` 的团队；退出码取最严重；等待在第 3 次探测时就绪；超时 → 退出码 2；`--all` 加 `<team>` → 退出码 1；`--actor autostart` 写入审计的 `actor`；与另一个持锁的 `restore` 并发时串行，第二个看到 `kept`。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): --all and --wait-orca"`

---

### Task 6: `wl autostart`

**Files:**
- Create: `packages/core/src/commands/autostart/plan.ts`、`apply.ts`、`status.ts`
- Modify: `packages/core/src/commands/dispatcher/lifecycle.ts`（抽出共用的绝对路径命令构造 `selfCommand(deps, args: string[]): { file: string; args: string[] }`）、`packages/cli/src/cli.ts`、`output.ts`、`README.md`
- Test: `packages/core/test/commands/autostart/plan.test.ts`、`apply.test.ts`、`status.test.ts`

**Interfaces:**
- Produces:
  - `type AutostartPlatform = 'darwin' | 'linux' | 'win32'`
  - `interface AutostartPlan { platform: AutostartPlatform; file?: { path: string; content: string }; register: Array<{ file: string; args: string[] }>; unregister: Array<{ file: string; args: string[] }> }`
  - `planAutostart(deps: CommandDeps, o: { platform: AutostartPlatform; homeDir: string; uid?: number; waitOrca: string }): AutostartPlan` — 命令为 `selfCommand(deps, ['restore', '--all', '--wait-orca', waitOrca, '--actor', 'autostart', '--home', deps.home, '--orca', deps.orcaPath])`；日志 `<home>/logs/autostart.log`
  - `windowsTaskCommand(file: string, args: string[]): string` — `/TR` 用的命令行：每个参数含空格或引号时用双引号包裹，内部双引号写作 `\"`
  - `applyAutostart(plan: AutostartPlan, exec: (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>, fsx?: Pick<typeof fs, 'writeFileSync' | 'renameSync' | 'rmSync' | 'mkdirSync'>): Promise<void>` — 先写临时文件再改名；注册失败删除刚写的文件并抛 `autostart_failed`（附原始输出）
  - `removeAutostart(plan, exec, fsx?): Promise<void>` — 未安装视为成功
  - `autostartStatus(plan, exec, readFile): Promise<{ installed: boolean; location: string; command: string; logTail: string[]; linger?: boolean }>`
  - 不支持的平台或 Linux 上 `systemctl --user` 不可用 → `autostart_unsupported`
  - CLI：`wl autostart install [--wait-orca <时长>]`、`uninstall`、`status`，均支持 `--json`

- [ ] **Step 1: 写失败测试**

```ts
test('macOS plan: plist with RunAtLoad, absolute ProgramArguments and log paths; bootout then bootstrap gui/<uid>', () => {
  // 内联快照比较 content；register 为 [launchctl bootout …(允许失败), launchctl bootstrap gui/501 <plist>]
})
test('linux plan: oneshot unit with WantedBy=default.target; daemon-reload then enable', () => {})
test('windows plan: schtasks /Create /F /SC ONLOGON /TN \\Wingline\\Restore /TR <cmd> via System32 absolute path', () => {})
test.each([
  ['C:\\Program Files\\nodejs\\node.exe', ['C:\\Users\\A B\\wl\\main.js', 'restore']],
])('windowsTaskCommand quotes paths with spaces', (file, args) => {
  expect(windowsTaskCommand(file, args)).toBe('"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\A B\\wl\\main.js" restore')
})
test('install twice overwrites; uninstall when absent succeeds', async () => {})
test('a failing register removes the written file and throws autostart_failed with the stderr', async () => {})
test('status reports location, command, last 20 log lines and linger on linux', async () => {})
test('no systemd user session → autostart_unsupported', async () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（`exec` 在 CLI 中为 `spawn(file, args, { shell: false })` 的 Promise 包装）。README 增加“登录后自动恢复”一节：三个平台的位置、`loginctl enable-linger` 说明、Orca 以系统服务运行时依靠 `--wait-orca`、卸载方法，以及远端环境的 `environment` 字段与包装脚本透传示例 `exec limactl shell agent claude "$@"`。
- [ ] **Step 4: 运行确认通过** — `pnpm typecheck && pnpm test`（已知的两例沙箱僵尸进程失败除外）→ PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(cli): wl autostart for login-time restore"`
