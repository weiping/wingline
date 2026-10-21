# 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **复审修订（2026-10-21）：** 本计划写于 3A/3B 落地之前，开工前先按对应 spec 末尾的“复审修订”一节逐条调整相关 Task（路径、接口、探针前提都有变化）；与那一节冲突处以 spec 为准。其中第 3 条（TUI 复用 `consoleCommands()`）与第 1 条（`warnings` 新字段）会改动多个 Task。

**Goal:** 控制台的团队编辑器（保存 + 预演、草稿）与“关于与诊断”页、`wl up --draft`、调度员把工作区状态与卡片注释同步到 Orca、`wl tui`（总览 / 收件箱 / 时间线，可处理待办）。

**Architecture:** 规格相关的纯逻辑放在 `core/src/spec/`（`planSpecChange`、草稿保存与替换），服务端加 4 个 spec 接口与 1 个 about 接口；Orca 同步是调度员 `scan()` 末尾的一步，输入复用本轮的 `ScanSnapshot`；TUI 在进程内调用 core，复用 3B 的 `cachedOrca` 装饰器，自写 ANSI 渲染。

**Tech Stack:** TypeScript、`yaml`（Document API，已是 core 依赖）、`node:readline`/`node:tty`、Preact（控制台页面）、vitest。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md`（下称 spec）；依赖 3A、3B 的 plan 已完成。

> **状态（2026-10-20）：未开始。** 依赖的 3A、3B 已实现并合并（3A 见 `docs/superpowers/plans/2026-10-16-phase-3a-restore-timeline.md`，3B 见 `docs/superpowers/plans/2026-10-16-phase-3b-console.md` 与 `docs/superpowers/plans/2026-10-20-phase-3b-review-fixes.md`）。本计划是阶段 3 的下一个待实施项。

## Global Constraints

- 不新增运行时依赖。
- 写操作一律经 `auditedCommands`；控制台前缀 `console:`，TUI 前缀 `tui:`；执行者 `human`。
- 不得修改终端标题。
- 草稿文件名：`team.yaml` → `team.draft.yaml`（同目录、同名加 `.draft`）；备份 `team.yaml.bak`。
- 新字段 `patrol.workspace_status` 默认 `true`；`patrol.worktree_comment` 默认 `false`；取默认值时不进规格哈希（`patrolDelta`）。
- 工作区状态取值：`todo`、`in-progress`、`in-review`、`completed`；多岗位优先级 `in-review` > `in-progress` > `todo` > `completed`；注释最长 500 字符（或探针测得的上限，取小者），超出以 `…` 结尾。
- Orca 同步：只在值变化时写；连续 3 次失败后该 worktree 停止尝试直到调度员重启；重启后首轮只计算不写。
- 编辑器校验防抖 400 毫秒；`yaml` 字段 ≤ 64 KB。
- TUI 刷新：时间线每 2 秒，岗位与待办每 5 秒；总览底部 8 条时间线。
- 新错误码：`draft_not_found`（1）、`spec_conflict`（409）、`spec_invalid`（400）、`tui_not_tty`（1）、`tui_unsupported_terminal`（1，仅终端列数为 0 时）。
- 函数 ≤ 50 行；提交信息末尾附 3A plan 中的两行署名。

## Review Focus

1. **草稿与正式规格不在同一个目录可写**（例如规格在只读挂载上）：保存返回清楚的错误（`internal`，提示路径不可写），不留下临时文件。测试归 Task 2。
2. **YAML 里有用户注释与空行**：表单改一个字段后，其余部分逐字节不变（除被改的节点）。测试归 Task 3。
3. **两个岗位共用 worktree、其中一个被冻结**：状态按优先级汇总，注释两行都在且被冻结的一行带 `❄ 已冻结`。测试归 Task 5。
4. **TUI 运行中终端被缩到很窄（< 40 列）**：不抛异常、不换行错乱，显示“窗口太窄”提示，放大后恢复。测试归 Task 7。
5. **TUI 运行中进程收到未捕获异常**：终端恢复（退出备用屏幕、显示光标、关闭 raw 模式）后再打印错误。测试归 Task 7。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `spikes/worktree-status.ts`（新） | 工作区状态与注释参数探针 |
| `packages/core/src/spec/plan-change.ts`（新） | `planSpecChange` |
| `packages/core/src/spec/draft.ts`（新） | 草稿路径、保存（临时文件 + 改名）、`baseHash`、`--draft` 替换流程 |
| `packages/core/src/spec/edit.ts`（新） | 表单字段到 YAML Document 的写回 |
| `packages/core/src/commands/up.ts` | `--draft` |
| `packages/core/src/commands/about.ts`（新） | 关于与诊断 |
| `packages/core/src/server/api-spec.ts`（新） | spec 与 about 接口 |
| `packages/core/src/commands/dispatcher/orca-sync.ts`（新） | 状态计算、汇总、注释、写入 |
| `packages/core/src/commands/dispatcher/loop.ts`、`outlets.ts` | 接入同步；`worktreeComment` 改走同一写入函数 |
| `packages/core/src/orca/types.ts`、`client.ts` | `worktreeSet` 增加 `status` |
| `packages/core/src/spec/schema.ts`、`load.ts` | `patrol.workspace_status` |
| `packages/core/src/registry/*` | `orca_sync` 表 |
| `packages/web/src/pages/Edit.tsx`、`Settings.tsx` | 编辑器与关于页 |
| `packages/cli/src/tui/`（新） | `screen.ts`、`width.ts`、`keys.ts`、`input.ts`、`views/overview.ts`、`views/inbox.ts`、`views/timeline.ts`、`app.ts` |

---

### Task 1: 工作区状态探针

**Files:**
- Create: `spikes/worktree-status.ts`
- Modify: `spikes/REPORT.md`、`test/fixtures/receipts/worktree-set.json`（新，成立时）

**Interfaces:**
- Produces: REPORT 中 `orca worktree set` 的工作区状态参数名与可取值、`--comment` 的多行 / 长度上限 / 清空方式；成立时的脱敏回执。

> 需要真机。沙箱里无法完成时写好脚本、报告 NEEDS_CONTEXT；Task 2–8 不依赖结论（Task 4 的 `worktreeSet` 状态参数默认按 spec 写作 `--workspace-status`，以探针结论为准在 Task 4 修正）。

- [ ] **Step 1: 写探针**：在一个测试 worktree 上依次设置四种状态并 `worktree show --json` 读回；写入 3 行、600 字符的注释并读回；写空注释；输出 `RESULT worktree-status status=<参数名|无> values=<...> comment-multiline=<是|否> comment-max=<N|未知>`。
- [ ] **Step 2: 真机运行并记录**到 `spikes/REPORT.md`“3C 探针：工作区状态与注释”一节；存回执。
- [ ] **Step 3: 提交** — `git commit -m "spike: worktree workspace status and comment"`

---

### Task 2: 预演与草稿（core）

**Files:**
- Create: `packages/core/src/spec/plan-change.ts`、`packages/core/src/spec/draft.ts`
- Test: `packages/core/test/spec/plan-change.test.ts`、`packages/core/test/spec/draft.test.ts`

**Interfaces:**
- Consumes: `loadTeamSpec`（需要一个从字符串校验的入口：`loadTeamSpecFromText(text: string, specPath: string): TeamSpec`，在 `load.ts` 中从现有 `parseYaml` 抽出）
- Produces:
  - `type PostChange = { id: string; kind: 'added' | 'kept' | 'launch_changed' | 'removed' | 'brief_changed'; fields?: string[] }`
  - `interface SpecPlan { posts: PostChange[]; fields: Array<{ path: string; before: unknown; after: unknown }>; commands: string[]; closeSuggested: boolean }`
  - `planSpecChange(current: TeamSpec | null, next: TeamSpec, running: boolean, specPath: string): SpecPlan` — `commands`：运行中 `['wl down <team>', 'wl up <spec> --draft']`，停止或未登记 `['wl up <spec>']`；有 `launch_changed`/`removed` 时 `closeSuggested = true`
  - `validateSpecText(text: string, specPath: string): { spec: TeamSpec | null; errors: Array<{ path: string; code: string; message: string }> }`
  - `draftPathOf(specPath: string): string`；`fileHash(path: string): string | null`（sha256，不存在为 `null`）
  - `saveSpec(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): { wrote: 'draft' | 'spec'; path: string; hash: string }` — 先校验（失败抛 `spec_invalid`，`detail.errors`）；目标文件当前哈希 ≠ `baseHash` 抛 `spec_conflict`；写同目录临时文件后 `rename`
  - `discardDraft(specPath: string): void`
  - `applyDraft(specPath: string): void` — `draft_not_found`；校验失败抛与 `wl up` 相同的错误；复制为 `.bak` → 把草稿改名为正式规格；改名失败删除刚写的备份

- [ ] **Step 1: 写失败测试**

```ts
test('added, removed, launch_changed and brief_changed posts are classified', () => {})
test('running team gets down + up --draft; stopped team gets up only', () => {
  expect(planSpecChange(cur, next, true, '/t/duo/team.yaml').commands).toEqual(['wl down duo', 'wl up /t/duo/team.yaml --draft'])
})
test('closeSuggested only when a launch changed or a post was removed', () => {})
test('saveSpec writes the draft when running and the spec when stopped', () => {})
test('saveSpec rejects a stale baseHash with spec_conflict and invalid YAML with spec_invalid, writing nothing', () => {})
test('saveSpec in a read-only directory fails without leaving a temp file', () => { /* chmod 0o555 的目录；POSIX 才跑 */ })
test('applyDraft: missing draft, invalid draft (no file touched), success with .bak, rename failure cleans the backup', () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/spec` → FAIL。
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(spec): change preview and draft save/apply"`

---

### Task 3: 表单写回、`wl up --draft`、spec 与 about 接口

**Files:**
- Create: `packages/core/src/spec/edit.ts`、`packages/core/src/commands/about.ts`、`packages/core/src/server/api-spec.ts`
- Modify: `packages/core/src/commands/up.ts`（`UpArgs.draft?: boolean`）、`packages/cli/src/cli.ts`（`up` 加 `--draft`）、`packages/core/src/server/index.ts`（注册路由）、`packages/core/src/commands/dispatcher/attention.ts`（草稿提醒）
- Test: `packages/core/test/spec/edit.test.ts`、`packages/core/test/commands/about.test.ts`、`packages/core/test/server/api-spec.test.ts`、`packages/core/test/commands/up.test.ts`（追加）

**Interfaces:**
- Produces:
  - `setField(text: string, path: Array<string | number>, value: unknown): string` — 用 `parseDocument` + `doc.setIn` 写回，`doc.toString()` 输出；删除用 `value === undefined` → `deleteIn`
  - `up(deps, { specPath, draft: true })` → 先 `applyDraft(specPath)` 再照常执行；团队仍为 `up` 且草稿与现行哈希不同 → `team_spec_changed`，不改动文件
  - `interface AboutItem { key: string; value: string | number | null; source: 'env' | 'default' | 'registry' | 'file' }`；`about(deps: CommandDeps, o: { version: string; consoleFile: ConsoleFile | null }): { items: AboutItem[]; teams: Array<{ name: string; specPath: string; status: string; draft: boolean; dispatcher: string }> }`
  - 路由：`GET /api/teams/:team/spec`、`POST …/spec/validate`、`POST …/spec`、`POST …/spec/discard-draft`、`GET /api/about`（字段见 spec 第 4.4、5 节）；保存进审计（摘要只含 `wrote`、`path`、`hash`）
  - `GET …/spec` 与 `validate` 的响应含 `parsed`（`parseDocument(text).toJS()`，语法错误为 `null`）；`validate` 接受可选的 `set: { path, value }`，先 `setField` 再校验，返回新的 `{ yaml, parsed, errors, preview }`（复审 I-6）
  - `attention` 的告警一节增加 `{ kind: 'draft_pending', path, command: 'wl down <team> → wl up <spec> --draft' }`（存在草稿时）

- [ ] **Step 1: 写失败测试**

```ts
test('setField changes one scalar and leaves comments, blank lines and order byte-identical elsewhere', () => {
  const src = '# 团队\nversion: 1\nname: duo   # 名字\n\nposts:\n  - id: builder  # 牵头\n    agent: claude\n'
  const out = setField(src, ['posts', 0, 'agent'], 'codex')
  expect(out).toBe(src.replace('agent: claude', 'agent: codex'))
})
test('up --draft applies the draft then launches; with the team still up it refuses and touches nothing', async () => {})
test('about reports each item with its source (WINGLINE_ORCA → env, default home → default)', () => {})
test('POST spec returns 409 spec_conflict on a stale baseHash and 400 spec_invalid with per-field errors', async () => {})
test('validate never writes a file', async () => {})
test('validate with set applies the change via setField and returns the new yaml and parsed', async () => {})
test('GET spec returns parsed; a YAML syntax error gives parsed null and a yaml_syntax error', async () => {})
test('attention lists draft_pending when a draft exists', async () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat: spec editing API, wl up --draft, about"`

---

### Task 4: 编辑器与关于页（web）

**Files:**
- Create: `packages/web/src/pages/Edit.tsx`、`packages/web/src/pages/Settings.tsx`、`packages/web/src/components/SpecForm.tsx`、`packages/web/src/components/SpecPreview.tsx`
- Modify: `packages/web/src/router.ts`、`packages/web/src/components/Layout.tsx`（导航加“编辑”与“关于”）
- Test: `packages/web/test/edit.test.tsx`、`packages/web/test/settings.test.tsx`

**Interfaces:**
- Consumes: Task 3 的接口
- 前端不解析 YAML：表单显示 `parsed` 中的现值；每次修改调用 `POST …/spec/validate`，请求体为 `{ yaml, set: { path, value } }`，用返回的 `yaml` 与 `parsed` 刷新两个视图。YAML 视图直接提交文本（不带 `set`）。

- [ ] **Step 1: 写失败测试**：表单与 YAML 两个视图切换后内容一致；修改停顿 400 毫秒后才发 validate（假定时器）；错误显示在对应字段旁；预演列出岗位去向与命令，`closeSuggested` 时显示 `--close` 提示；已有草稿时默认载入草稿并显示“丢弃草稿”；409 时提示重新加载；关于页每项显示来源标签。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（页面底部注明 `team.yaml` 视为可信配置的一行文字）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(web): team editor and about page"`

---

### Task 5: Orca 同步

**Files:**
- Create: `packages/core/src/commands/dispatcher/orca-sync.ts`
- Modify: `packages/core/src/orca/types.ts`、`client.ts`（`worktreeSet(a: { worktree: string; comment?: string; status?: WorkspaceStatus })`）、`packages/core/test/commands/fake-client.ts`（记录 `status`）、`packages/core/src/spec/schema.ts`/`load.ts`（`workspace_status`）、`packages/core/src/registry/migrations.ts`/`registry.ts`（`orca_sync`）、`packages/core/src/commands/dispatcher/loop.ts`（`scan` 末尾调用）、`outlets.ts`（`worktreeComment` 改调 `syncWorktree` 的注释路径）
- Test: `packages/core/test/commands/dispatcher/orca-sync.test.ts`、`packages/core/test/registry/migrate-3c.test.ts`

**Interfaces:**
- Consumes: `ScanSnapshot`（`signals.ts`）、`registry.listPatrolState`、`getFrozen`、`getVerdict`
- Produces:
  - `type WorkspaceStatus = 'todo' | 'in-progress' | 'in-review' | 'completed'`
  - `postWorkspaceStatus(post: string, tasks: TaskRow[], local: { verdicts: Map<string, DoneVerdictRow[]> }): WorkspaceStatus`（spec 第 6.2 节表格，自上而下取第一条）
  - `summarize(rows: Array<{ post: string; status: WorkspaceStatus; line: string }>, maxLen: number): { status: WorkspaceStatus; comment: string }`
  - `postLine(post: string, task: TaskRow | null, flags: { signal?: string; frozen: boolean }): string` — 形如 `builder：实现登录（进行中，第 2 轮）⚠ 无进展`
  - `syncOrca(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec }, snap: ScanSnapshot, o: { observeOnly: boolean }): Promise<void>`
  - Registry：`getOrcaSync(worktree: string): OrcaSyncRow | null`、`putOrcaSync(r: OrcaSyncRow): void`、`interface OrcaSyncRow { worktree: string; team: string; status: string | null; comment: string | null; writtenAt: string | null; failCount: number }`
  - `PatrolSpec.workspaceStatus: boolean`（默认 `true`）

- [ ] **Step 1: 写失败测试**

```ts
test.each([
  ['dispatched task', 'in-progress'], ['work sent for review, review open', 'in-review'], ['only queued', 'todo'], ['nothing open', 'completed'],
])('post status: %s → %s', () => {})
test('two posts on one worktree: priority wins and the comment has one line each, frozen marked', () => {})
test('comment longer than 500 chars ends with …', () => {})
test('writes only when status or comment changed', async () => {})
test('first scan after start computes but does not write', async () => {})
test('three consecutive failures stop the worktree and add one attention warning; restart retries', async () => {})
test('workspace_status: false sends no status; worktree_comment: false sends no comment', async () => {})
test('default patrol values keep the 2A/2B spec hash', () => {})
test('migration from a 3B database adds orca_sync', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（Task 1 结论若与 `--workspace-status` 不同，在 `client.ts` 按实测参数名实现，并补契约测试）。
- [ ] **Step 4: 运行确认通过** — 同时跑 `packages/core/test/commands/dispatcher` 全部，2B 的 `worktree_comment` 测试按新注释格式更新断言。
- [ ] **Step 5: 提交** — `git commit -m "feat(dispatcher): sync workspace status and comments to Orca"`

---

### Task 6: TUI 基础：宽度、屏幕、按键

**Files:**
- Create: `packages/cli/src/tui/width.ts`、`packages/cli/src/tui/screen.ts`、`packages/cli/src/tui/keys.ts`、`packages/cli/src/tui/input.ts`
- Test: `packages/cli/test/tui/width.test.ts`、`screen.test.ts`、`keys.test.ts`、`input.test.ts`

**Interfaces:**
- Produces:
  - `cellWidth(s: string): number`；`fit(s: string, cols: number): string`（按显示宽度截断并补空格，截断时末尾 `…`，留 1 列余量）
  - `class Screen { constructor(out: Writable & { columns: number; rows: number }, o?: { altBuffer?: boolean }); enter(): void; render(lines: string[]): void; restore(): void; size(): { cols: number; rows: number } }` — `render` 只重写与上一帧不同的行；`restore` 幂等
  - `type Key = { name: 'up' | 'down' | 'enter' | 'tab' | 'escape' | 'backspace' | 'left' | 'right' | 'ctrl-c' | 'char'; ch?: string }`；`parseKeys(chunk: string): Key[]`
  - `class LineInput { constructor(prompt: string); feed(k: Key): 'continue' | 'submit' | 'cancel'; value: string; view(cols: number): string }`

- [ ] **Step 1: 写失败测试**

```ts
test.each([['abc', 3], ['雁阵', 4], ['é', 1], ['👍', 2], ['\x1b[31m', 0]])('cellWidth(%j) = %i', (s, n) => {})
test('fit truncates by display width with an ellipsis', () => { expect(fit('雁阵控制台', 7)).toBe('雁阵控…') })
test('render writes only changed lines on the second frame', () => { /* 内存流记录写入；第二帧只含第 2 行的光标定位与内容 */ })
test('restore leaves the alt buffer, shows the cursor and is idempotent', () => {})
test('parseKeys decodes arrows, enter, tab, esc, backspace and CJK chars', () => {})
test('LineInput edits with left/right/backspace and submits on enter, cancels on esc', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（`cellWidth` 用东亚宽字符区间表：U+1100–115F、U+2E80–A4CF、U+AC00–D7A3、U+F900–FAFF、U+FE30–FE4F、U+FF00–FF60、U+FFE0–FFE6、U+1F300–1F64F、U+1F900–1F9FF；组合字符 U+0300–036F 计 0）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(tui): display width, diffing screen and key parsing"`

---

### Task 7: TUI 应用与 `wl tui`

**Files:**
- Create: `packages/cli/src/tui/views/overview.ts`、`views/inbox.ts`、`views/timeline.ts`、`packages/cli/src/tui/app.ts`
- Modify: `packages/cli/src/cli.ts`（`tui [team]` 命令）
- Test: `packages/cli/test/tui/app.test.ts`、`packages/cli/test/tui/views.test.ts`

**Interfaces:**
- Consumes: Task 6；`cachedOrca`（3B，以 `{ ...deps, orca: cachedOrca(deps.orca) }` 传给 core 函数）、`ps`、`attention`、`readTimeline`/`readTimelineAfter`（3A）、`auditedCommands`（前缀 `tui:`）
- Produces:
  - `interface TuiState { view: 'overview' | 'inbox' | 'timeline'; selected: number; menu: MenuItem[] | null; input: LineInput | null; confirm: PendingAction | null; status: string; lastAction: PendingAction | null; stale: boolean }`
  - `reduce(s: TuiState, k: Key, data: TuiData): { state: TuiState; effect?: { kind: 'run'; action: PendingAction } | { kind: 'refresh' } | { kind: 'quit' } }` — 纯函数；`R` 在 `lastAction` 结果不确定时重放同一参数与 `retryRequest`
  - `renderView(s: TuiState, data: TuiData, size: { cols: number; rows: number }): string[]` — 宽度 < 40 时只返回一行“窗口太窄”
  - `runTui(deps: CommandDeps, team: string, io: { stdin: ReadStream; stdout: WriteStream }, o?: { signal?: AbortSignal }): Promise<void>` — 进入时 `Screen.enter`、raw 模式；`finally`、`process.on('exit')`、SIGINT/SIGTERM/SIGHUP 都调 `restore`；未捕获异常先 `restore` 再抛出
  - CLI：`wl tui [team]`；省略团队名的选择逻辑；非 TTY → `tui_not_tty`；列数为 0 → `tui_unsupported_terminal`；Windows 上没有 `WT_SESSION` 也没有 `TERM_PROGRAM` 时只打印一行警告后继续（复审 M-7）

- [ ] **Step 1: 写失败测试**

```ts
test('1/2/3 and Tab switch views; j/k move the selection within bounds', () => {})
test('Enter on a question opens reply, typing then Enter asks to confirm, y runs dispatcherReply via tui: audit', async () => {})
test('an uncertain result shows the hint and R replays the same args and retryRequest', async () => {})
test('rows without a write action show the wl command instead of a menu', () => {})
test('narrow window renders the too-narrow notice and recovers when widened', () => {})
test('an exception inside the loop restores the terminal before rethrowing', async () => {
  // 注入一个在第二次刷新时抛错的 attention；断言内存终端最后的写入含退出备用屏幕与显示光标序列，且 stdin.setRawMode(false) 被调用
})
test('not a TTY → tui_not_tty exit 1', async () => {})
test('on win32 without WT_SESSION/TERM_PROGRAM a warning is printed and the TUI still starts', async () => {})
test('screen snapshot of the overview view', () => { /* renderView 输出与内联快照比较 */ })
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(tui): wl tui with overview, inbox and timeline"`

---

### Task 8: 文档与全量验证

**Files:**
- Modify: `README.md`、`teams/duo/team.yaml`（`patrol:` 注释示例增加 `workspace_status`）、`test/live/duo.live.test.ts`

- [ ] **Step 1: 文档**：README 增加“编辑团队”（草稿与 `wl up --draft`）、“Orca 界面上的状态”（需要调度员在运行；两个开关）、“终端视图：`wl tui`”（按键表）三节，中文；`team.yaml` 注释示例补 `workspace_status: true`。
- [ ] **Step 2: 真机用例**：`test/live/duo.live.test.ts` 增加默认跳过、需人工确认的用例：调度员运行时开始一个任务，一个巡查周期后 `worktree show --json` 的工作区状态为 `in-progress`。
- [ ] **Step 3: 全量验证** — `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` → PASS（已知的两例沙箱僵尸进程失败除外）。
- [ ] **Step 4: 提交** — `git commit -m "docs: editor, Orca status sync and wl tui"`
