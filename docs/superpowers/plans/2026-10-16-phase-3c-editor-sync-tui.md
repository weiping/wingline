# 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 控制台的团队编辑器（保存 + 预演、草稿）与“关于与诊断”页、`wl up --draft`、`wl attention` 的告警、调度员把工作区状态与卡片注释同步到 Orca、`wl tui`（总览 / 收件箱 / 时间线，可处理待办）。

**Architecture:** 规格相关的纯逻辑放在 `core/src/spec/`（从字符串校验、表单写回、预演、草稿保存与替换），`commands/spec.ts` 把它包成写命令进审计，服务端在 `api-spec.ts` 加只读与校验接口、在 `api-write.ts` 加两条写路由；Orca 同步是调度员 `scan()` 末尾的一步，输入为本轮 `ScanSnapshot` 加注册表的 `getVerdict`；TUI 在进程内调用 core，复用 3B 的 `cachedOrca` 与改造后的 `auditedWriteCommands('tui:')`，自写 ANSI 渲染。

**Tech Stack:** TypeScript、`yaml`（Document API，已是 core 依赖）、`node:readline`/`node:tty`、Preact（控制台页面）、vitest。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md`（下称 spec）。

> **状态（2026-10-22）：未开始。** 依赖的 3A、3B 已实现并合并。2026-10-21 复审指出的 5 处前提失效与 2026-10-22 复审的补充，已并入 spec 正文与本计划各 Task，不再需要另行对照。

## Global Constraints

- 不新增运行时依赖。
- 写操作一律经 `auditedCommands`；控制台前缀 `console:`，TUI 前缀 `tui:`；执行者 `human`。两者共用 `CONSOLE_AUDIT` 与 `auditedWriteCommands(prefix)`。
- 不得修改终端标题；外部文本显示或写入 Orca 前一律经 `plainText`（`core/src/view/plain-text.ts`）。
- 草稿文件名：`team.yaml` → `team.draft.yaml`（同目录、同名加 `.draft`）；备份 `team.yaml.bak`。
- 新字段 `patrol.workspace_status` 默认 `true`；`patrol.worktree_comment` 默认 `false`；取默认值时不进规格哈希（`patrolDelta`）。
- 工作区状态取值：`todo`、`in-progress`、`in-review`、`completed`；多岗位优先级 `in-review` > `in-progress` > `todo` > `completed`；注释最长 500 字符（或探针测得的 `commentMax`，取小者），超出以 `…` 结尾，`…` 计入长度。
- Orca 同步：只在值变化时写；`fail_count ≥ 3` 停止尝试，调度员启动时清零；重启后首轮只计算不写。
- 编辑器校验防抖 400 毫秒；`yaml` 字段 ≤ 48 KB（UTF-8 字节），超出 400 `spec_too_large`；请求体仍受 3B 的 64 KB 上限。
- TUI 刷新：时间线每 2 秒，岗位与待办每 5 秒；总览底部 8 条时间线；宽度 < 40 列只显示“窗口太窄”。
- 新错误码：`draft_not_found`（退出码 1）、`spec_conflict`（409）、`spec_too_large`（400）、`tui_not_tty`（退出码 1）、`tui_unsupported_terminal`（退出码 1，仅终端列数为 0 时）；`spec_invalid`（400）沿用 `loadTeamSpec` 已有的错误码。
- 函数 ≤ 50 行；提交信息末尾附 3A plan 中的两行署名。

## Review Focus

1. **外部文本里的 ANSI/OSC 序列**：一条正文为 `hi\x1b]0;pwned\x07\x1b[2J` 的提问出现在收件箱与总览里，终端标题不变、屏幕不被清空，显示为 `hi`。测试归 Task 8；Orca 注释同理，测试归 Task 6。
2. **运行中的团队、还没有草稿时第一次保存**：客户端发 `baseHash: null, running: true`，写出草稿并成功，不报 409。测试归 Task 2（core）与 Task 5（前端取值）。
3. **YAML 里有用户注释与空行**：表单改一个字段后，其余部分逐字节不变（除被改的节点）。测试归 Task 2。
4. **同一个 worktree 被两种选择器指向**（一个岗位 `path:/w/a`，另一个 `current` 解析为 `/w/a`）：归为一组，只写一次，注释两行都在。测试归 Task 6。
5. **TUI 运行中进程收到未捕获异常**：终端恢复（退出备用屏幕、显示光标、关闭 raw 模式）后再打印错误。测试归 Task 8。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `spikes/worktree-status.ts`（新） | 工作区状态与注释参数探针 |
| `packages/core/src/spec/load.ts` | 抽出 `validateSpecText`；`loadTeamSpec` 读文件后调用它 |
| `packages/core/src/spec/edit.ts`（新） | `setField`：Document API 写回一处 |
| `packages/core/src/spec/plan-change.ts`（新） | `planSpecChange` |
| `packages/core/src/spec/draft.ts`（新） | 草稿路径、文件哈希、保存（临时文件 + 改名）、丢弃、`--draft` 替换流程 |
| `packages/core/src/commands/spec.ts`（新） | `readSpecForEdit`、`validateSpecEdit`、`saveSpecCmd`、`discardDraftCmd` |
| `packages/core/src/commands/about.ts`（新） | 关于与诊断（异步） |
| `packages/core/src/commands/up.ts` | `--draft` |
| `packages/core/src/commands/dispatcher/attention.ts` | `warnings` |
| `packages/core/src/server/api-spec.ts`（新） | `GET spec`、`validate`、`GET about` |
| `packages/core/src/server/api-write.ts`、`index.ts`、`sse.ts` | 两条写路由；`auditedWriteCommands(prefix)`；注册路由；`attentionCounts.warnings` |
| `packages/core/src/commands/dispatcher/orca-sync.ts`（新） | 状态计算、归组、汇总、注释、写入 |
| `packages/core/src/commands/dispatcher/loop.ts`、`advance.ts`、`outlets.ts` | 接入同步；启动时清零；`worktreeComment` 改走同一写入函数 |
| `packages/core/src/orca/types.ts`、`client.ts` | `worktreeSet` 的 `status`、`comment` 可选；`ORCA_WORKTREE_SUPPORT` |
| `packages/core/src/spec/schema.ts`、`load.ts` | `patrol.workspace_status` |
| `packages/core/src/registry/migrations.ts`、`registry.ts` | `orca_sync` 表与读写方法 |
| `packages/cli/src/cli.ts`、`output.ts` | `up --draft`、`tui [team]`；`renderAttention` 的告警一节 |
| `packages/web/src/pages/Edit.tsx`、`Settings.tsx`、`Overview.tsx`、`Inbox.tsx`，`components/SpecForm.tsx`、`SpecPreview.tsx`、`Layout.tsx`，`stream.tsx`、`router.ts` | 编辑器、关于页、草稿提醒、告警 |
| `packages/cli/src/tui/`（新） | `width.ts`、`screen.ts`、`keys.ts`、`input.ts`、`views/overview.ts`、`views/inbox.ts`、`views/timeline.ts`、`views/picker.ts`、`app.ts` |

---

### Task 1: 工作区状态探针

**Files:**
- Create: `spikes/worktree-status.ts`
- Modify: `spikes/REPORT.md`、`test/fixtures/receipts/worktree-set.json`（新，成立时）

**Interfaces:**
- Produces: REPORT 中 `orca worktree set` 的工作区状态参数名与可取值、`--comment` 的多行 / 长度上限 / 清空方式；成立时的脱敏回执。Task 6 据此填写 `ORCA_WORKTREE_SUPPORT`。

> 需要真机。沙箱里无法完成时写好脚本、报告 NEEDS_CONTEXT；Task 2–9 不依赖结论（Task 6 的状态参数默认按 spec 写作 `--workspace-status`，`ORCA_WORKTREE_SUPPORT` 默认 `{ workspaceStatus: false, comment: true, commentMax: null }`，以探针结论为准在 Task 6 修正）。

- [ ] **Step 1: 写探针**：在一个测试 worktree 上依次设置四种状态并 `worktree show --json` 读回；写入 3 行、600 字符的注释并读回；写空注释；输出 `RESULT worktree-status status=<参数名|无> values=<...> comment-multiline=<是|否> comment-max=<N|未知>`。
- [ ] **Step 2: 真机运行并记录**到 `spikes/REPORT.md`“3C 探针：工作区状态与注释”一节；存回执。
- [ ] **Step 3: 提交** — `git commit -m "spike: worktree workspace status and comment"`

---

### Task 2: 规格的校验、写回、预演与草稿（core）

**Files:**
- Create: `packages/core/src/spec/edit.ts`、`plan-change.ts`、`draft.ts`
- Modify: `packages/core/src/spec/load.ts`
- Test: `packages/core/test/spec/validate-text.test.ts`、`edit.test.ts`、`plan-change.test.ts`、`draft.test.ts`

**Interfaces:**
- Consumes: `loadTeamSpec`、`specHash`（`spec/hash.ts`）
- Produces:
  - `type SpecError = { path: Array<string | number>; code: string; message: string; line: number | null }`
  - `validateSpecText(text: string, specPath: string, o?: { platform?: NodeJS.Platform }): { spec: TeamSpec | null; parsed: unknown | null; errors: SpecError[] }` — 从 `parseYaml` 抽出“解析字符串”的部分；`loadTeamSpec` 改为读文件后调用它，`errors[0]` 非空时抛出与现在完全相同的 `WinglineError`（现有 `load` 测试不改断言）。`errors` 至多一条；语法错误 `code = 'spec_invalid'`、`path = []`；`parsed` 为 `doc.toJS()`，语法错误时为 `null`
  - `setField(text: string, path: Array<string | number>, value: unknown): string` — `parseDocument` + `doc.setIn`，`value === null` → `doc.deleteIn`，`doc.toString()` 输出；`text` 有语法错误时抛 `spec_invalid`
  - `type PostChange = { id: string; kind: 'added' | 'kept' | 'launch_changed' | 'removed' | 'brief_changed'; fields?: string[] }`
  - `interface SpecPlan { posts: PostChange[]; fields: Array<{ path: string; before: unknown; after: unknown }>; commands: string[]; closeSuggested: boolean }`
  - `planSpecChange(current: TeamSpec | null, next: TeamSpec, o: { running: boolean; specPath: string }): SpecPlan`
  - `draftPathOf(specPath: string): string`；`fileHash(path: string): string | null`（sha256 hex，不存在为 `null`）；`textHash(text: string): string`
  - `saveSpec(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): { wrote: 'draft' | 'spec'; path: string; hash: string }` — 顺序：48 KB 检查（`spec_too_large`）→ 校验（`spec_invalid`，`detail.errors`）→ 目标文件哈希 = `textHash(text)` 则直接返回 → 目标文件哈希 ≠ `baseHash` 抛 `spec_conflict` → 写同目录临时文件 `.<name>.<pid>.tmp` 后 `rename`，失败时删临时文件并抛 `internal`（消息含路径）。`running` 的一致性由调用方（Task 4）检查
  - `discardDraft(specPath: string): { discarded: boolean }`
  - `applyDraft(specPath: string, o: { runningHash: string | null }): void` — 顺序：草稿不存在 → `draft_not_found`；`loadTeamSpec(草稿)` 失败原样抛出；`runningHash` 非空且 `specHash(草稿) !== runningHash` → `team_spec_changed`（提示 `wl down <team>`）；复制为 `.bak` → 改名；改名失败删除刚写的备份后重抛

- [ ] **Step 1: 写失败测试**

```ts
test('validateSpecText returns parsed and no errors for teams/duo/team.yaml', () => {})
test('validateSpecText on a YAML syntax error gives parsed null and one spec_invalid error with a line', () => {
  expect(r.errors).toEqual([{ path: [], code: 'spec_invalid', message: expect.any(String), line: 3 }])
})
test('validateSpecText reports links_unknown_post with its path', () => {
  expect(r.errors[0]).toMatchObject({ code: 'links_unknown_post', path: ['links', 'ghost'] })
})
test('loadTeamSpec still throws the same error codes after the refactor', () => {})
test('setField changes one scalar and leaves comments, blank lines and order byte-identical elsewhere', () => {
  const src = '# 团队\nversion: 1\nname: duo   # 名字\n\nposts:\n  - id: builder  # 牵头\n    agent: claude\n'
  expect(setField(src, ['posts', 0, 'agent'], 'codex')).toBe(src.replace('agent: claude', 'agent: codex'))
})
test('setField with null deletes the key', () => {})
test('added, kept, removed, launch_changed and brief_changed posts are classified', () => {})
test('running team gets down + up --draft; stopped team gets up only', () => {
  expect(planSpecChange(cur, next, { running: true, specPath: '/t/duo/team.yaml' }).commands).toEqual(['wl down duo', 'wl up /t/duo/team.yaml --draft'])
  expect(planSpecChange(cur, next, { running: false, specPath: '/t/duo/team.yaml' }).commands).toEqual(['wl up /t/duo/team.yaml'])
})
test('current null makes every post added', () => {})
test('closeSuggested only when a launch changed or a post was removed', () => {})
test('field diffs list lead, gates, budgets and patrol before/after', () => {})
test('saveSpec writes the draft when running and the spec when stopped', () => {})
test('saveSpec on a running team with no draft accepts baseHash null', () => {
  expect(saveSpec({ specPath, text, baseHash: null, running: true })).toMatchObject({ wrote: 'draft', path: draftPathOf(specPath) })
})
test('saveSpec rejects a stale baseHash with spec_conflict, writing nothing', () => {})
test('saveSpec resent with identical content succeeds without rewriting', () => {})
test('saveSpec rejects invalid YAML with spec_invalid and detail.errors, writing nothing', () => {})
test('saveSpec rejects text over 48 KB with spec_too_large', () => { /* 'a'.repeat(48 * 1024 + 1) 的注释行 */ })
test('saveSpec in a read-only directory fails without leaving a temp file', () => { /* chmod 0o555；POSIX 才跑 */ })
test('discardDraft removes the draft and is a no-op when none exists', () => {
  expect(discardDraft(specPath)).toEqual({ discarded: false })
})
test('applyDraft: missing → draft_not_found; invalid → no file touched; running with a different hash → team_spec_changed', () => {})
test('applyDraft allows a comment-only draft while running (same specHash)', () => {})
test('applyDraft success writes .bak and replaces the spec; rename failure removes the backup and leaves the spec intact', () => {})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/spec` → FAIL。
- [ ] **Step 3: 实现。** `planSpecChange` 的字段差异按 `lead`、`links`、`gates`、`budgets`、`patrol` 顶层键做深比较，`path` 用点号拼接（如 `budgets.task.max_rounds`）；岗位比较 `agent`/`model`/`launch`/`worktree` 判 `launch_changed`，只有 `briefPaths` 变化判 `brief_changed`。
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/spec` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(spec): text validation, field write-back, change preview, drafts"`

---

### Task 3: `wl attention` 的 `warnings`

**Files:**
- Modify: `packages/core/src/commands/dispatcher/attention.ts`、`packages/core/src/server/sse.ts`、`packages/cli/src/output.ts`、`packages/web/src/stream.tsx`、`packages/web/src/components/Layout.tsx`、`packages/web/src/pages/Inbox.tsx`
- Test: `packages/core/test/commands/dispatcher/attention.test.ts`、`packages/core/test/server/sse.test.ts`、`packages/cli/test/output.test.ts`、`packages/web/test/pages.test.tsx`（均追加）

**Interfaces:**
- Consumes: Task 2 的 `draftPathOf`
- Produces:
  - `AttentionReport.warnings: string[]`；`attention()` 内由 `warningsOf(deps, team, spec): string[]` 生成。本 Task 只实现草稿一种来源：`有未应用的规格草稿：<草稿路径>（执行 wl down <team> 后 wl up <spec> --draft）`；Task 6 追加另外两种
  - SSE 快照 `attentionCounts.warnings: number`；`Layout` 顶栏待办数计入
  - `renderAttention` 在最前面输出“告警”一节，每条一行；没有告警时不输出这一节

- [ ] **Step 1: 写失败测试**

```ts
test('attention lists the draft warning when team.draft.yaml exists and drops it after discard', async () => {
  expect(r.warnings).toEqual([`有未应用的规格草稿：${draft}（执行 wl down duo 后 wl up ${spec} --draft）`])
})
test('SSE snapshot attentionCounts includes warnings', async () => {})
test('renderAttention prints a 告警 section first only when there are warnings', () => {})
test('inbox page shows warnings above the sections; top bar count includes them', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/commands/dispatcher packages/core/test/server packages/cli/test packages/web/test` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(attention): warnings section with pending-draft notice"`

---

### Task 4: spec / about 接口、写命令表改造、`wl up --draft`

**Files:**
- Create: `packages/core/src/commands/spec.ts`、`packages/core/src/commands/about.ts`、`packages/core/src/server/api-spec.ts`
- Modify: `packages/core/src/server/api-write.ts`、`packages/core/src/server/index.ts`、`packages/core/src/commands/up.ts`（`UpArgs.draft?: boolean`）、`packages/cli/src/cli.ts`（`up` 加 `--draft`）
- Test: `packages/core/test/commands/spec.test.ts`、`packages/core/test/commands/about.test.ts`、`packages/core/test/server/api-spec.test.ts`、`packages/core/test/server/api-write.test.ts`、`packages/core/test/commands/up.test.ts`（后两者追加）

**Interfaces:**
- Consumes: Task 2 全部；`dispatcherHealth`；`resolveOrcaExecutable`（`orca/resolve.ts`）与 `inRange`（`commands/version-range.ts`）
- Produces:
  - `readSpecForEdit(deps, team: string): { specPath: string; yaml: string; parsed: unknown | null; hash: string; draft: { yaml: string; parsed: unknown | null; hash: string } | null; running: boolean }` — 团队未登记 → `team_unknown`；`running = teams.status === 'up'`
  - `validateSpecEdit(deps, a: { team: string; yaml: string; set?: { path: Array<string | number>; value: unknown } }): { yaml: string; parsed: unknown | null; errors: SpecError[]; preview: SpecPlan | null }` — 先 48 KB 检查，再 `setField`（若有），再 `validateSpecText`；`current` 取 `loadTeamSpec(specPath)`，读不到为 `null`
  - `saveSpecCmd(deps, a: { team: string; yaml: string; baseHash: string | null; running: boolean; retryRequest?: string }): Promise<{ wrote: 'draft' | 'spec'; path: string; hash: string }>` — `a.running` 与 `teams.status === 'up'` 不同 → `spec_conflict`（“团队状态已变化，请重新加载”）
  - `discardDraftCmd(deps, a: { team: string; retryRequest?: string }): Promise<{ discarded: boolean }>`
  - `WriteCommands` 增加 `saveSpecCmd`、`discardDraftCmd`；`CONSOLE_AUDIT` 对应条目：`command: 'spec save'` / `'spec discard-draft'`，`summary` 只含 `{ wrote, path, hash }` / `{ discarded }`（结果侧）或 `{ baseHash, running }`（参数侧），不含 `yaml`
  - `WRITE_ROUTES` 增加 `POST /api/teams/:team/spec`（`fields: ['yaml', 'baseHash', 'running', 'retryRequest']`）与 `POST /api/teams/:team/spec/discard-draft`（`fields: ['retryRequest']`）
  - `auditedWriteCommands(prefix: 'console:' | 'tui:'): WriteCommands`；`consoleCommands()` 保留为 `auditedWriteCommands('console:')`
  - `registerSpecRoutes(r: Router)`：`GET /api/teams/:team/spec`、`POST /api/teams/:team/spec/validate`（`fields: ['yaml', 'set']`，不进审计）、`GET /api/about`；在 `buildRouter` 中注册
  - `interface AboutItem { key: string; value: string | number | boolean | null; source: 'env' | 'default' | 'registry' | 'file' | 'orca'; note?: string }`
  - `about(deps: CommandDeps, o: { version: string; consoleFile: ConsoleFile | null; env?: NodeJS.ProcessEnv }): Promise<{ items: AboutItem[]; teams: Array<{ name: string; specPath: string; status: string; draft: boolean; dispatcher: DispatcherHealth['state'] }> }>` — Orca 版本取不到时 `value: null`、`note` 为错误码
  - `up(deps, { specPath, draft: true })` → `applyDraft(specPath, { runningHash: team?.status === 'up' ? team.specHash : null })` 后照常执行

- [ ] **Step 1: 写失败测试**

```ts
test('GET spec returns parsed, hash, draft and running', async () => {})
test('GET spec with a YAML syntax error gives parsed null', async () => {})
test('validate never writes a file and returns preview null when errors exist', async () => {})
test('validate with set applies setField and returns the new yaml and parsed', async () => {})
test('validate with set on a syntax error → 400 spec_invalid', async () => {})
test('validate with yaml over 48 KB → 400 spec_too_large', async () => {})
test('validate is not audited', async () => { /* registry.listAudit 为空 */ })
test('POST spec: 409 spec_conflict on stale baseHash; 409 when running differs; 400 spec_invalid with detail.errors', async () => {})
test('POST spec audit row has console: prefix and no yaml in the summary', async () => {})
test('discard-draft returns { discarded } and is audited', async () => {})
// api-write.test.ts 现有的三个 test.each(WRITE_ROUTES) 自动覆盖两条新路由（retryRequest 格式、原样重试、审计前缀）
test("auditedWriteCommands('tui:') writes audit rows with the tui: prefix", async () => {})
test('about reports each item with its source (WINGLINE_ORCA → env, default home → default)', async () => {})
test('about keeps the other items when orca --version fails', async () => {
  expect(r.items.find((i) => i.key === 'orca.version')).toMatchObject({ value: null, source: 'orca' })
})
test('up --draft applies the draft then launches', async () => {})
test('up --draft with the team still up and a different specHash refuses and touches nothing', async () => {})
test('wl up --draft without a draft exits 1 with draft_not_found', async () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test packages/cli/test` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat: spec editing API, wl up --draft, about"`

---

### Task 5: 编辑器、关于页与草稿提醒（web）

**Files:**
- Create: `packages/web/src/pages/Edit.tsx`、`packages/web/src/pages/Settings.tsx`、`packages/web/src/components/SpecForm.tsx`、`packages/web/src/components/SpecPreview.tsx`
- Modify: `packages/web/src/router.ts`（`/t/:team/edit`、`/settings`）、`packages/web/src/components/Layout.tsx`（导航加“编辑”与“关于”）、`packages/web/src/pages/Overview.tsx`（草稿提醒）、`packages/web/src/api.ts`
- Test: `packages/web/test/edit.test.tsx`、`packages/web/test/settings.test.tsx`、`packages/web/test/pages.test.tsx`（追加）

**Interfaces:**
- Consumes: Task 4 的接口
- 前端不解析 YAML：表单显示 `parsed` 中的现值；每次表单修改调用 `POST …/spec/validate`，请求体 `{ yaml, set: { path, value } }`，用返回的 `yaml` 与 `parsed` 刷新两个视图。YAML 视图直接提交文本（不带 `set`）。
- 保存请求体：`{ yaml, running, baseHash: running ? draft?.hash ?? null : hash }`（`running`、`hash`、`draft` 取自加载时的 `GET …/spec`；保存成功后用返回的 `hash` 更新本地的基准）。
- 已有草稿时默认载入 `draft.yaml`。

- [ ] **Step 1: 写失败测试**

```tsx
test('form and YAML views stay in sync after switching', async () => {})
test('validate fires only after 400 ms of inactivity', async () => { /* vi.useFakeTimers；399 ms 时 fetch 未调用，400 ms 时调用一次 */ })
test('a syntax error makes the form read-only with a notice', async () => {})
test('the error is shown next to its field (path posts.0.agent)', async () => {})
test('preview lists post changes and commands; closeSuggested shows the --close hint', async () => {})
test('running team without a draft saves with baseHash null and running true', async () => {
  expect(lastBody).toEqual({ yaml: expect.any(String), running: true, baseHash: null })
})
test('an existing draft is loaded by default and 丢弃草稿 is shown', async () => {})
test('409 asks the user to reload', async () => {})
test('the trusted-config notice is shown at the bottom', async () => {})
test('settings page shows each item with its source label', async () => {})
test('overview shows the pending-draft notice when attention.warnings has one', async () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/web/test` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(web): team editor, about page and draft notice"`

---

### Task 6: Orca 同步

**Files:**
- Create: `packages/core/src/commands/dispatcher/orca-sync.ts`
- Modify: `packages/core/src/orca/types.ts`、`client.ts`、`packages/core/test/commands/fake-client.ts`（记录 `status`）、`packages/core/src/spec/schema.ts`、`load.ts`、`packages/core/src/registry/migrations.ts`、`registry.ts`、`packages/core/src/commands/dispatcher/loop.ts`、`advance.ts`、`outlets.ts`、`attention.ts`
- Test: `packages/core/test/commands/dispatcher/orca-sync.test.ts`、`packages/core/test/registry/migrate-3c.test.ts`、`packages/core/test/orca/client.test.ts`（追加）、2B 的 `worktree_comment` 相关测试（改断言）

**Interfaces:**
- Consumes: `ScanSnapshot`（`signals.ts`）、`registry.getVerdict(taskId, epoch)`、`listPatrolState`、`getFrozen`、`getPost`、`orca.worktreeShow`、`plainText`；Task 3 的 `warningsOf`
- Produces:
  - `worktreeSet(a: { worktree: string; comment?: string; status?: WorkspaceStatus }): Promise<void>`（两者都缺省时抛 `internal`，调用方保证至少带一个）
  - `ORCA_WORKTREE_SUPPORT: { workspaceStatus: boolean; comment: boolean; commentMax: number | null }`（`client.ts`，按 Task 1 结论）
  - `type WorkspaceStatus = 'todo' | 'in-progress' | 'in-review' | 'completed'`
  - `postWorkspaceStatus(p: { address: string; handle: string | null }, tasks: TaskRow[], verdictOf: (taskId: string, epoch: number) => DoneVerdictRow | null): WorkspaceStatus` — spec 第 6.2 节表格，自上而下取第一条
  - `SIGNAL_LABEL: Record<PatrolSignal, string>`：`no_progress` 无进展、`waiting_approval` 等待批准、`waiting_answer` 等待回答、`dead_assignee` 执行者失联、`owner_idle` 负责人空闲、`overdue` 超时、`done_unfinished` 未做完、`bypassed` 绕过流程、`call_uncertain` 调用结果不确定、`gate_streak` gate 连续失败
  - `postLine(id: string, task: TaskRow | null, flags: { signal: PatrolSignal | null; frozen: boolean }): string` — 有任务：`builder：实现登录（进行中，第 2 轮）`（状态中文：`dispatched` 进行中、`ready` 排队、`blocked` 阻塞；轮次为 `epoch + 1`）；无任务：`builder：空闲`；之后依次追加 ` ⚠ <SIGNAL_LABEL>`、` ❄ 已冻结`；标题经 `plainText` 并把换行替换为空格
  - `summarize(rows: Array<{ status: WorkspaceStatus; line: string }>, maxLen: number): { status: WorkspaceStatus; comment: string }`
  - `resolveWorktrees(deps, posts: PostRow[]): Promise<Map<string, string>>` — 岗位地址 → 绝对路径；`path:` 去前缀，其余按选择器去重后各调一次 `worktreeShow`，失败的岗位不在结果里
  - `syncOrca(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec }, snap: ScanSnapshot, o: { observeOnly: boolean }): Promise<void>` — 在 `loop.ts` 的 `scan()` 里 `advancePatrol` 之后调用，`observeOnly` 取 `st.observeOnlyNextScan`；整个函数包在 try/catch 中，异常只记 `patrol_events`，不向外抛
  - `syncWorktreeForPost(deps, ctx, post: string): Promise<void>` — 供 `advance.ts` 原来调 `worktreeComment` 的两处使用：重新计算该岗位所在 worktree 并按同一规则写入；`outlets.ts` 的 `worktreeComment` 删除
  - Registry：`interface OrcaSyncRow { worktree: string; team: string; status: string | null; comment: string | null; writtenAt: string | null; failCount: number }`；`getOrcaSync(worktree: string): OrcaSyncRow | null`、`putOrcaSync(r: OrcaSyncRow): void`、`listOrcaSync(team: string): OrcaSyncRow[]`、`resetOrcaSyncFailures(team: string): void`（调度员启动时，在 `loop.ts` 初始化 `st` 处调用）
  - `PatrolSpec.workspaceStatus: boolean`（默认 `true`，进 `DEFAULT_PATROL`）
  - `warningsOf` 追加：`Orca 不支持工作区状态：patrol.workspace_status 不起作用`（开关为 `true` 且 `!ORCA_WORKTREE_SUPPORT.workspaceStatus`；注释同理，文案“卡片注释”、字段 `patrol.worktree_comment`）；`Orca 同步已停止：<worktree>（连续 3 次失败，重启调度员后重试）`（`listOrcaSync(team)` 中 `failCount >= 3` 的每一行）

- [ ] **Step 1: 写失败测试**

```ts
test.each([
  ['dispatched to its handle', 'in-progress'],
  ['open review child whose parent verdict is sent_for_review by this post', 'in-review'],
  ['only ready tasks claimed by it', 'todo'],
  ['nothing open', 'completed'],
])('post status: %s → %s', () => {})
test('dispatched beats in-review; handle null never matches in-progress', () => {})
test('an unparsable verdict result does not count as in-review', () => {})
test('postLine formats task, idle, signal and frozen', () => {
  expect(postLine('builder', task, { signal: 'no_progress', frozen: true })).toBe('builder：实现登录（进行中，第 2 轮） ⚠ 无进展 ❄ 已冻结')
  expect(postLine('reviewer', null, { signal: null, frozen: false })).toBe('reviewer：空闲')
})
test('control sequences in a task title are stripped from the comment', () => {
  expect(postLine('builder', { ...task, title: 'a\x1b]0;x\x07b\nc' }, none)).toBe('builder：ab c（进行中，第 2 轮）')
})
test('comment longer than 500 chars is cut to 500 ending with …', () => {
  expect(summarize(rows, 500).comment).toHaveLength(500)
})
test('two posts on one worktree: priority wins and the comment has one line each', () => {})
test('path:/w/a and current resolving to /w/a are grouped and written once', async () => {})
test('worktreeShow is called once per selector per scan; a failing selector skips its post', async () => {})
test('writes only when status or comment changed', async () => {})
test('first scan after start computes but does not write or touch orca_sync', async () => {})
test('a failure records a patrol_events row with action orca_sync, outcome failed', async () => {})
test('three consecutive failures stop the worktree and show a warning; dispatcher start resets fail_count', async () => {})
test('workspace_status false sends no status; worktree_comment false sends no comment; both false makes no call', async () => {})
test('unsupported item with its switch on yields an Orca 不支持 warning', () => {})
test('default patrol values keep the 2A/2B spec hash', () => {})
test('advance notifications go through syncWorktreeForPost instead of overwriting the comment', async () => {})
test('worktreeSet passes --workspace-status and --comment only when given', async () => { /* client.test.ts 契约 */ })
test('migration from a 3B database adds orca_sync', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（Task 1 结论若与 `--workspace-status` 不同，在 `client.ts` 按实测参数名实现并改契约测试；填写 `ORCA_WORKTREE_SUPPORT`）。
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test` → PASS；2B 的 `worktree_comment` 测试按新注释格式更新断言。
- [ ] **Step 5: 提交** — `git commit -m "feat(dispatcher): sync workspace status and comments to Orca"`

---

### Task 7: TUI 基础：宽度、屏幕、按键、输入框

**Files:**
- Create: `packages/cli/src/tui/width.ts`、`screen.ts`、`keys.ts`、`input.ts`
- Test: `packages/cli/test/tui/width.test.ts`、`screen.test.ts`、`keys.test.ts`、`input.test.ts`

**Interfaces:**
- Produces:
  - `cellWidth(s: string): number`；`fit(s: string, cols: number): string`（按显示宽度截断并补空格，截断时末尾 `…`，留 1 列余量）
  - `class Screen { constructor(out: Writable & { columns: number; rows: number }); enter(): void; render(lines: string[]): void; invalidate(): void; restore(): void; size(): { cols: number; rows: number } }` — `enter` 写 `\x1b[?1049h\x1b[?25l`；`render` 只重写与上一帧不同的行；`invalidate` 让下一帧整屏重绘（尺寸变化时用）；`restore` 写 `\x1b[?25h\x1b[?1049l`，幂等
  - `type Key = { name: 'up' | 'down' | 'enter' | 'tab' | 'escape' | 'backspace' | 'left' | 'right' | 'ctrl-c' | 'char'; ch?: string }`；`parseKeys(chunk: string): Key[]`
  - `class LineInput { constructor(prompt: string); feed(k: Key): 'continue' | 'submit' | 'cancel'; value: string; view(cols: number): string }` — 只接受可打印字符

- [ ] **Step 1: 写失败测试**

```ts
test.each([['abc', 3], ['雁阵', 4], ['é', 1], ['é', 1], ['👍', 2], ['\x1b[31m', 0]])('cellWidth(%j) = %i', (s, n) => {
  expect(cellWidth(s)).toBe(n)
})
test('fit truncates by display width with an ellipsis', () => { expect(fit('雁阵控制台', 7)).toBe('雁阵控…') })
test('fit pads short strings to the width', () => { expect(fit('ab', 4)).toBe('ab  ') })
test('render writes only changed lines on the second frame', () => { /* 内存流记录写入；第二帧只含第 2 行的光标定位与内容 */ })
test('invalidate makes the next render redraw every line', () => {})
test('restore writes show-cursor and leave-alt-buffer once even if called twice', () => {})
test('parseKeys decodes arrows, enter, tab, esc, backspace, ctrl-c and CJK chars', () => {
  expect(parseKeys('\x1b[A\r\t雁')).toEqual([{ name: 'up' }, { name: 'enter' }, { name: 'tab' }, { name: 'char', ch: '雁' }])
})
test('LineInput edits with left/right/backspace, ignores control chars, submits on enter, cancels on esc', () => {})
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（`cellWidth` 先剥 ANSI 序列；东亚宽字符区间表：U+1100–115F、U+2E80–A4CF、U+AC00–D7A3、U+F900–FAFF、U+FE30–FE4F、U+FF00–FF60、U+FFE0–FFE6、U+1F300–1F64F、U+1F900–1F9FF；组合字符 U+0300–036F 计 0；其余控制字符计 0）。
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/cli/test/tui` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(tui): display width, diffing screen, keys and line input"`

---

### Task 8: TUI 应用与 `wl tui`

**Files:**
- Create: `packages/cli/src/tui/views/overview.ts`、`views/inbox.ts`、`views/timeline.ts`、`views/picker.ts`、`packages/cli/src/tui/app.ts`
- Modify: `packages/cli/src/cli.ts`（`tui [team]` 命令）
- Test: `packages/cli/test/tui/app.test.ts`、`packages/cli/test/tui/views.test.ts`

**Interfaces:**
- Consumes: Task 7；Task 3 的 `warnings`；Task 4 的 `auditedWriteCommands('tui:')`；`cachedOrca`（以 `{ ...deps, orca: cachedOrca(deps.orca) }` 传给 core 函数，写操作后调 `invalidate()`）、`ps`、`attention`、`readTimeline`/`readTimelineAfter`（3A）、`plainText`
- Produces:
  - `interface PendingAction { command: keyof WriteCommands; args: Record<string, unknown>; label: string }`
  - `interface TuiState { view: 'overview' | 'inbox' | 'timeline'; selected: number; menu: MenuItem[] | null; input: LineInput | null; confirm: PendingAction | null; filter: TimelineFilter | null; help: boolean; status: string; lastUncertain: PendingAction | null; stale: boolean }`
  - `reduce(s: TuiState, k: Key, data: TuiData): { state: TuiState; effect?: { kind: 'run'; action: PendingAction } | { kind: 'refresh' } | { kind: 'quit' } }` — 纯函数；`R` 仅在 `lastUncertain` 非空时产生 `run`，参数与 `retryRequest` 与上一次相同；`/` 打开过滤输入，解析 `source:` / `post:` / `task:`，空输入清除
  - `renderView(s: TuiState, data: TuiData, size: { cols: number; rows: number }): string[]` — 宽度 < 40 时只返回 `['窗口太窄']`；所有外部文本经 `plainText` 并把换行替换为空格后再 `fit`
  - `pickTeam(teams: TeamRow[], io): Promise<string | null>`（`views/picker.ts`）
  - `runTui(deps: CommandDeps, team: string, io: { stdin: ReadStream; stdout: WriteStream }, o?: { signal?: AbortSignal }): Promise<void>` — 进入时 `Screen.enter`、raw 模式；`stdout` 的 `resize` 事件 → `Screen.invalidate()` 后重绘；`finally`、`process.on('exit')`、SIGINT/SIGTERM/SIGHUP 都调 `restore` 与 `setRawMode(false)`；未捕获异常先恢复再抛出；读取循环异常置 `stale = true`，顶部显示“数据过期”，下一轮继续
  - CLI：`wl tui [team]`；省略团队名时 0 个 → `team_unknown`，1 个直接进入，多个调 `pickTeam`；非 TTY → `tui_not_tty`；列数为 0 → `tui_unsupported_terminal`；`win32` 且没有 `WT_SESSION` 也没有 `TERM_PROGRAM` 时只打印一行警告后继续（复审 M-7）

- [ ] **Step 1: 写失败测试**

```ts
test('1/2/3 and Tab switch views; j/k move the selection within bounds', () => {})
test('Enter on a question opens reply, typing then Enter asks to confirm, y runs dispatcherReply with a tui: audit row', async () => {})
test('any key other than y at the confirm prompt cancels', () => {})
test('an uncertain result shows the hint and R replays the same args and retryRequest', async () => {})
test('R does nothing when there is no uncertain action', () => {})
test('rows without a write action show the wl command instead of a menu', () => {})
test('inbox shows warnings as a read-only section', () => {})
test('/ post:builder filters the timeline; an empty filter clears it', () => {})
test('? toggles the help overlay', () => {})
test('a question body with ANSI/OSC sequences renders as plain text', () => {
  const lines = renderView(inbox, dataWithQuestion('hi\x1b]0;pwned\x07\x1b[2J'), { cols: 80, rows: 24 })
  expect(lines.join('\n')).not.toMatch(/\x1b/)
  expect(lines.some((l) => l.includes('hi'))).toBe(true)
})
test('narrow window renders the too-narrow notice and recovers when widened', () => {})
test('a resize event triggers a full redraw', async () => {})
test('a failing read marks the data stale without exiting', async () => {})
test('an exception inside the loop restores the terminal before rethrowing', async () => {
  // 注入一个在第二次刷新时抛错的 attention；断言内存终端最后的写入含 \x1b[?25h 与 \x1b[?1049l，且 stdin.setRawMode(false) 被调用
})
test('not a TTY → tui_not_tty exit 1', async () => {})
test('no team argument: one team enters directly, several show the picker, none → team_unknown', async () => {})
test('on win32 without WT_SESSION/TERM_PROGRAM a warning is printed and the TUI still starts', async () => {})
test('screen snapshot of the overview view', () => { /* renderView 输出与内联快照比较 */ })
```

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 运行确认通过** — `pnpm vitest run packages/cli/test/tui` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(tui): wl tui with overview, inbox and timeline"`

---

### Task 9: 文档与全量验证

**Files:**
- Modify: `README.md`、`teams/duo/team.yaml`（`patrol:` 注释示例增加 `workspace_status`）、`test/live/duo.live.test.ts`

- [ ] **Step 1: 文档**：README 增加“编辑团队”（草稿与 `wl up --draft`）、“Orca 界面上的状态”（需要调度员在运行；两个开关；该状态由雁阵维护，手动修改会在下次变化时被覆盖）、“终端视图：`wl tui`”（按键表）三节，中文；`team.yaml` 注释示例补 `workspace_status: true`。
- [ ] **Step 2: 真机用例**：`test/live/duo.live.test.ts` 增加默认跳过、需人工确认的用例：调度员运行时开始一个任务，一个巡查周期后 `worktree show --json` 的工作区状态为 `in-progress`。
- [ ] **Step 3: 全量验证** — `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` → PASS（已知的两例沙箱僵尸进程失败除外）。
- [ ] **Step 4: 提交** — `git commit -m "docs: editor, Orca status sync and wl tui"`
