# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~336,735 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3402 nodes · 11038 edges · 146 communities (134 shown, 12 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1726 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `91213c7d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- create.ts
- loadTeamSpec
- Registry
- WinglineError
- loop.ts
- done.ts
- escalate.ts
- pages.test.tsx
- lib.ts
- ref_node_fs
- dispatch.ts
- signals.ts
- client.ts
- query.ts
- client.ts
- patterns.ts
- Edit.tsx
- resolveOrcaExecutable
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- cachedOrca
- lifecycle.review.test.ts
- server/index.ts
- cellWidth
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- Settings.tsx
- commands/log.ts
- Panel
- TaskBoard.tsx
- ledger.ts
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- SpecForm.tsx
- 3.4 前端界面与交互设计（`packages/web/src/`）
- posts.test.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- dispatcher/inbox.ts
- spec.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- 阶段 0 探针报告
- reduce.ts
- api-read.ts
- package.json
- cli/package.json
- about.ts
- main.test.ts
- demo-question.ts
- TaskDetail.tsx
- attention
- with
- fake-orca.mjs
- 雁阵 Wingline 设计总纲
- createConsoleServer
- gates
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- Review Focus
- CommandDeps
- sse.ts
- web/package.json
- TuiSession
- wl
- cli.ts
- TestPanel
- Overview.tsx
- Wingline 雁阵
- items.ts
- status.ts
- signals.test.ts
- .withTeamLock
- 用例
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- up.ts
- compilerOptions
- panel.tsx
- compilerOptions
- TeamActions.tsx
- NewTeamDialog.tsx
- orca-worker.d.ts
- compilerOptions
- TestPanel
- 7. `wl tui`
- cli/tsconfig.json
- static.ts
- api.ts
- orca-plugin/package.json
- saveSpecCmd
- eventRow
- run
- autostart/index.ts
- apply.ts
- core/tsconfig.json
- defaultMakeDeps
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- signal-summary.ts
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- fake-client.ts
- protocol.ts
- screenGuard
- Wingline
- plan-change.ts
- 文件结构
- 6. 注册表扩展
- verdictRow
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- 5. 登录与安全
- TestWorker
- 6. 审计事件
- output.test.ts
- TeamSpec
- screen.test.ts
- down
- tui/types.ts
- self-absolute.test.ts
- 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan
- inRange
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 161 edges
3. `vitest` - 133 edges
4. `Registry` - 127 edges
5. `seedRunningTeam()` - 100 edges
6. `loadTeamSpec()` - 93 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `attention()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `3D-1 探针 3：`worktree set --unread` / `--read`（2026-10-23，macOS，Orca 1.4.237）` --references--> `syncOrca()`  [INFERRED]
  spikes/REPORT.md → packages/core/src/commands/dispatcher/orca-sync.ts
- `自检记录` --references--> `TypeOutcome`  [INFERRED]
  docs/superpowers/plans/2026-10-13-phase-2b-dispatcher-patrol.md → packages/core/src/commands/dispatcher/outlets.ts

## Import Cycles
- None detected.

## Communities (146 total, 12 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.10
Nodes (27): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf() (+19 more)

### Community 1 - "create.ts"
Cohesion: 0.17
Nodes (14): Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, afterCreateError(), CreateArgs, createOnly(), createTask(), dispatchCreated(), recordNewTask(), rerunCommand() (+6 more)

### Community 2 - "loadTeamSpec"
Cohesion: 0.10
Nodes (20): Task 2: 规格的校验、写回、预演与草稿（core）, 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, applyDraftBeforeUp() (+12 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (4): Task 4: 未读标记（调度员）, patrolRow(), Registry, addAuditor()

### Community 4 - "WinglineError"
Cohesion: 0.12
Nodes (37): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, Task 7: 任务执行流写接口, Commands, freezePostCmd(), hushCmd() (+29 more)

### Community 5 - "loop.ts"
Cohesion: 0.12
Nodes (42): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS (+34 more)

### Community 6 - "done.ts"
Cohesion: 0.11
Nodes (40): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, awaitDelivered(), context(), createChild(), decide(), decideBypassed(), decideDispatched() (+32 more)

### Community 7 - "escalate.ts"
Cohesion: 0.09
Nodes (56): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 14：CLI 接入——`wl task <sub>`, Task 16：端到端流程测试, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, actorInTeam() (+48 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (27): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, @testing-library/preact@^3.2.4, resetApiForTests(), StreamProvider(), agentInput(), clone(), loaded(), Opts (+19 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "ref_node_fs"
Cohesion: 0.08
Nodes (21): MIGRATIONS, ActorSource, ExtColumn, PatrolStateRow, PostStatus, Row, SCREEN_SIGNAL_KINDS, TaskAction (+13 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.15
Nodes (25): Task 10：派发与通知、`create`、`plan`, 6.4 写入, syncAfterChange(), aliveHandle(), bumpRound(), busyIn(), busyWith(), confirmReplay() (+17 more)

### Community 12 - "signals.ts"
Cohesion: 0.20
Nodes (22): Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 6: 画面信号的状态推进, activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder, localHistory() (+14 more)

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (16): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture(), ROOT (+8 more)

### Community 14 - "query.ts"
Cohesion: 0.10
Nodes (36): Review Focus, 自检记录, 雁阵阶段 2A（任务工作流）实现计划, Task 6: Orca 同步, 5.2 信号, 6.5 `wl attention <team>`, staleSource(), DispatchOutcome (+28 more)

### Community 15 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 16 - "patterns.ts"
Cohesion: 0.10
Nodes (28): File Structure, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, Task 7: 展示, Task 8: 文档与真机核对, ScreenSignalKind, AUTO_ARMED (+20 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.12
Nodes (27): FormError, formHasField(), SpecPath, runSteps(), applyLocal(), Base, DraftBanner(), editInputs() (+19 more)

### Community 18 - "resolveOrcaExecutable"
Cohesion: 0.16
Nodes (13): Task 5：阶段 0 探针、报告与真实回执, direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd(), createOrcaRunner(), run() (+5 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.12
Nodes (31): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, 4.3 `usage_limit` 的处理, advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS (+23 more)

### Community 20 - "advance.ts"
Cohesion: 0.18
Nodes (28): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+20 more)

### Community 21 - "posts.ts"
Cohesion: 0.15
Nodes (30): Task 4: 抽出拉起逻辑并写入会话标记, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 1. 应在实现前修改, 3. 核对过、确认没问题的点, 4. 建议的下一步, 阶段 3（3A–3D）spec 与计划复审, checkBriefingLimit(), postAddress() (+22 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.10
Nodes (21): 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 3. 跑 resume-after-restart (+13 more)

### Community 23 - "output.ts"
Cohesion: 0.09
Nodes (33): registerDispatcherCommands(), Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL (+25 more)

### Community 24 - "cachedOrca"
Cohesion: 0.10
Nodes (36): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes() (+28 more)

### Community 26 - "server/index.ts"
Cohesion: 0.13
Nodes (22): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+14 more)

### Community 27 - "cellWidth"
Cohesion: 0.20
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+4 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.23
Nodes (5): at(), Screen, ScreenOut, TuiOutput, pickTeam()

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.12
Nodes (17): 6.1 开关, 6.2 岗位状态, 6.3 worktree 汇总, 6.5 `wl attention` 的 `warnings`, 6. 同步到 Orca 原生界面（调度员）, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D） (+9 more)

### Community 31 - "self.ts"
Cohesion: 0.07
Nodes (40): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变） (+32 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.06
Nodes (52): 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut(), flat() (+44 more)

### Community 33 - "Settings.tsx"
Cohesion: 0.21
Nodes (12): AboutAutostart, AboutItem, AboutTeam, AutostartBody(), AutostartCard(), DISPATCHER, LABEL, Settings() (+4 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.12
Nodes (28): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Critical, Issues, Minor, currentCursor(), cursorOf() (+20 more)

### Community 35 - "Panel"
Cohesion: 0.17
Nodes (16): bringUp(), downTeam(), InboxView(), loadInbox(), loadPosts(), loadTaskDetail(), loadTasks(), open() (+8 more)

### Community 36 - "TaskBoard.tsx"
Cohesion: 0.28
Nodes (11): notReady(), STALE_REASON, BoardColumns(), BoardFilters(), COLUMNS, CreateTaskDialog(), NotReadyBoard(), StuckSection() (+3 more)

### Community 37 - "ledger.ts"
Cohesion: 0.11
Nodes (38): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Global Constraints, Review Focus, Task 3: 不确定错误带上 `detail.retryRequest`, 阶段 2/3 复审修复 Implementation Plan, adoptReceipt(), attempt() (+30 more)

### Community 38 - "console.ts"
Cohesion: 0.13
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.09
Nodes (22): emptyAttention(), runTui(), RunTuiOptions, SIGNALS, WriteFn, LineInput, initialTuiState(), TuiState (+14 more)

### Community 40 - "FakeOrca"
Cohesion: 0.05
Nodes (43): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, REVIVE_WINDOW_MS, CheckMessage, CheckResult, RequestShowState, TerminalView, hit(), world() (+35 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (35): File Structure, Global Constraints, Review Focus, Task 1: Codex 会话探针, Task 3: `OrcaClient.search`, Task 5: `resumeCommand`, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起 (+27 more)

### Community 42 - "find-session.ts"
Cohesion: 0.12
Nodes (24): Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan (+16 more)

### Community 43 - "app.tsx"
Cohesion: 0.17
Nodes (23): Task 3: `wl attention` 的 `warnings`, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout() (+15 more)

### Community 44 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.15
Nodes (15): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7. 身份、通知与画面检查, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals）, 1. 背景、意图与成功标准 (+7 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.18
Nodes (24): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+16 more)

### Community 46 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.20
Nodes (10): 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`） (+2 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.12
Nodes (19): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+11 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.06
Nodes (42): File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 6: `wl autostart`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 一、plan 与 spec 脱节（阻塞，已处理） (+34 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (17): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode, registerSpec(), writeTemplate() (+9 more)

### Community 50 - "OrcaClient"
Cohesion: 0.07
Nodes (4): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, 3. 调度员主循环, OrcaClient, WorkerView

### Community 51 - "tui/render.ts"
Cohesion: 0.16
Nodes (21): eventLine(), filterText(), Row, body(), footer(), HELP, MIN_COLS, renderView() (+13 more)

### Community 52 - "core/package.json"
Cohesion: 0.10
Nodes (21): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+13 more)

### Community 53 - "dispatcher/inbox.ts"
Cohesion: 0.10
Nodes (32): Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 1: 转述的 worker 原话中和 shell 元字符, 4.1 提问的转述, askerOf(), BatchReport, checkWorkerDone(), Ctx (+24 more)

### Community 54 - "spec.ts"
Cohesion: 0.15
Nodes (35): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`）, 4. 错误处理、边界与安全约束, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, coreAuditTable(), currentSpec(), docFiles() (+27 more)

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.13
Nodes (16): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理, 6.1 状态与推进 (+8 more)

### Community 56 - "阶段 0 探针报告"
Cohesion: 0.10
Nodes (20): 2A 契约抓取（Task 15，2026-10-15）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）, 3B 探针：控制台标签页（2026-10-19，macOS Orca 1.4.229）, 3C 探针：工作区状态与注释（2026-10-22，macOS，Orca 1.4.237）, 3C 真机验证（续二）：权限确认框信号、真 agent 长任务, 3C 真机验证（续四）：批准动作查清，信号清除与长任务收尾已验证, 3D-1 Linux systemd 真机验证（2026-10-25，Lima VM `agent`，Linux 6.8 aarch64，node 24.22.0）, 3D-1 探针 3：`worktree set --unread` / `--read`（2026-10-23，macOS，Orca 1.4.237） (+12 more)

### Community 57 - "reduce.ts"
Cohesion: 0.18
Nodes (20): 3. 次要项（实现时顺手处理）, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey() (+12 more)

### Community 58 - "api-read.ts"
Cohesion: 0.19
Nodes (15): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, FrozenRow, buildPostDetail(), loadPostPreview(), offlinePosts(), PostDetail (+7 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.21
Nodes (13): Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, about(), autostartItem(), consoleItems(), dirBytes() (+5 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), installWarningFilter(), isReadOnlyCall(), allDeps(), autostartWorld(), cmds(), exec() (+10 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.14
Nodes (36): Task 11: 前端总览页与收件箱的生命周期按钮, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, address(), ActionDialog(), CommandHint(), Pill(), postOf(), Section() (+28 more)

### Community 65 - "attention"
Cohesion: 0.12
Nodes (28): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 5: 路由器与读接口, Task 7: SSE, Task 8: TUI 应用与 `wl tui`, 6.2 写入, 6.1 约定, 6.2 读接口（GET） (+20 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "createConsoleServer"
Cohesion: 0.09
Nodes (20): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, File Structure, Global Constraints (+12 more)

### Community 70 - "gates"
Cohesion: 0.09
Nodes (24): 11. 错误处理, 12. 测试, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run (+16 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (18): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+10 more)

### Community 72 - "command.test.ts"
Cohesion: 0.11
Nodes (10): chooseTeams(), tuiCmd(), TuiCmdArgs, TuiIo, In, ioOf(), Out, tui() (+2 more)

### Community 73 - "Review Focus"
Cohesion: 0.17
Nodes (16): 3.3.1 读接口扩展, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 3.3.3 需要连带修改的两处 core 函数, 3.3.4 未启动团队与 Orca 不可达时的降级, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, FsLike, removeAutostart(), autostartInstall() (+8 more)

### Community 74 - "CommandDeps"
Cohesion: 0.08
Nodes (32): Task 10：`ps` 与 `send`, Task 11：`down`, 自检记录, AuditCtx, AuditEntry, AuditOptions, clip(), Command (+24 more)

### Community 75 - "sse.ts"
Cohesion: 0.23
Nodes (5): LogCursor, cursorFrom(), Subscriber, TeamFeeds, TeamLoop

### Community 76 - "web/package.json"
Cohesion: 0.13
Nodes (18): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, vite@^7.1.0, name (+10 more)

### Community 77 - "TuiSession"
Cohesion: 0.22
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "wl"
Cohesion: 0.14
Nodes (15): 12. 风险, 1. 目标与成功标准, npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发）, 安装, 3C 真机验证（续）：真实 agent、多个团队共用一个 worktree（2026-10-22，macOS，Orca 1.4.237，claude 2.1.308，codex-cli 0.163.0）, 3D-1 真机验证：`wl autostart`（2026-10-24，macOS，Orca 1.4.237，node v24.18.0） (+7 more)

### Community 79 - "cli.ts"
Cohesion: 0.11
Nodes (24): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+16 more)

### Community 81 - "Overview.tsx"
Cohesion: 0.24
Nodes (20): api, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), ApiState (+12 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (19): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 功能, 发布, 在 Orca 终端里跑 `wl up` (+11 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (18): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), matchesFilter() (+10 more)

### Community 84 - "status.ts"
Cohesion: 0.38
Nodes (6): Exec, AutostartPlan, autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 85 - "signals.test.ts"
Cohesion: 0.07
Nodes (33): 自检记录, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, 6. 未读标记（块 b）, PatrolOps, LoopOpts, OutletIo, Env, LADDERS (+25 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.38
Nodes (5): 10. 命令, 2.2 调度员是否在跑, 2. 命令, holdLock(), fakeRunning()

### Community 87 - "用例"
Cohesion: 0.17
Nodes (12): Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审, 用例三：自领任务, 用例二：转人工决策, 用例四：无人值守 (+4 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.17
Nodes (13): 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.20
Nodes (9): Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs(), lines() (+1 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.11
Nodes (34): Task 9：命令依赖、预检与 `up`, Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, File Structure, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 7: Windows CI 偶发超时, Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 9: 收尾, 2.1 `wl dispatcher up` (+26 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.04
Nodes (33): PreviewDto, RestoreResultDto, TaskDto, actor, busyTeam, confirmingDown, detail, detailAddress (+25 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "TeamActions.tsx"
Cohesion: 0.23
Nodes (19): errorText(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState (+11 more)

### Community 98 - "NewTeamDialog.tsx"
Cohesion: 0.25
Nodes (13): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog(), TEAM_TEMPLATES_UI (+5 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "TestPanel"
Cohesion: 0.11
Nodes (11): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+3 more)

### Community 102 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.26
Nodes (11): Task 4: 静态资源与安全响应头, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS (+3 more)

### Community 105 - "api.ts"
Cohesion: 0.09
Nodes (25): Task 10: 总览与时间线页, Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, PsRow, PostDto, ApiError, call(), csrfToken() (+17 more)

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "saveSpecCmd"
Cohesion: 0.21
Nodes (13): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立） (+5 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "run"
Cohesion: 0.24
Nodes (12): realAutostartSys, registerAutostartCommands(), run(), execute(), renderReady(), errorDoc, quoteWord(), renderAutostartInstall() (+4 more)

### Community 110 - "autostart/index.ts"
Cohesion: 0.11
Nodes (21): AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions, plist(), Step (+13 more)

### Community 111 - "apply.ts"
Cohesion: 0.15
Nodes (13): applyAutostart(), failure(), LOG_ROTATE_BYTES, Reply, rotateLog(), run(), runStep(), Sleep (+5 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "defaultMakeDeps"
Cohesion: 0.22
Nodes (7): defaultMakeDeps(), which(), tmpDb(), world(), post(), seededRegistry(), tmpDb()

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.16
Nodes (33): auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), downTeam(), freezePost() (+25 more)

### Community 116 - "draft.ts"
Cohesion: 0.24
Nodes (13): applyDraft(), checkSaveConflict(), draftPathOf(), fileHash(), modeOf(), realTarget(), sha256(), SPEC_MAX_BYTES (+5 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 120 - "signal-summary.ts"
Cohesion: 0.53
Nodes (5): hhmm(), resetClock(), signalRank(), signalSummary(), topSignal()

### Community 125 - "fake-client.ts"
Cohesion: 0.08
Nodes (33): listStale(), RunSummary, ctxOf(), ctxOf(), Args, bypassReport(), Executed, FakeTask (+25 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 127 - "screenGuard"
Cohesion: 0.10
Nodes (31): Global Constraints, Global Constraints, Review Focus, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, 文件结构, 雁阵阶段 2B（调度员与巡查熔断）实现计划 (+23 more)

### Community 129 - "plan-change.ts"
Cohesion: 0.26
Nodes (12): 11. 测试, classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post (+4 more)

### Community 130 - "文件结构"
Cohesion: 0.15
Nodes (16): Global Constraints, Review Focus, Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 4：OrcaClient 类型化方法, Task 6：团队规格读取与校验 (+8 more)

### Community 131 - "6. 注册表扩展"
Cohesion: 0.19
Nodes (6): 2. 次要项（实现时顺手处理）, 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, team(), CallLog

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.16
Nodes (16): Global Constraints, Task 2: `wl init` CLI 命令, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown() (+8 more)

### Community 135 - "5. 登录与安全"
Cohesion: 0.40
Nodes (5): 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全

### Community 137 - "6. 审计事件"
Cohesion: 0.50
Nodes (4): 6.1 表, 6.3 参数摘要, 6.4 清理, 6. 审计事件

### Community 138 - "output.test.ts"
Cohesion: 0.83
Nodes (3): event(), report(), at()

### Community 139 - "TeamSpec"
Cohesion: 0.20
Nodes (8): BRIEFING_LIMIT, Env, Launch, Ctx, TeamSpec, files, postDefaults, spec

### Community 141 - "down"
Cohesion: 0.08
Nodes (27): Task 12：CLI 包, 10. 测试, 11. 不做的事（阶段 3B）, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+19 more)

### Community 142 - "tui/types.ts"
Cohesion: 0.17
Nodes (6): Effect, Step, TimelineFilterSpec, TuiInput, View, TimelineSource

### Community 143 - "self-absolute.test.ts"
Cohesion: 0.50
Nodes (3): invalid, POSIX, WIN

### Community 145 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

### Community 149 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.14
Nodes (7): Task 13：`wl task escalate` / `resolve` / `recover`, Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 9.1 P1：有稳定本地键, 9.2 P2：以 id 为键（没有稳定本地实体）, 9.3 各调用用哪种, 9.4 派发与 `epoch`, 9. 编排写调用的幂等账本

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1010 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `create.ts`, `文件结构`, `loadTeamSpec`, `Registry`, `loop.ts`, `registerBaseCommands`, `escalate.ts`, `done.ts`, `lib.ts`, `ref_node_fs`, `TeamSpec`, `signals.ts`, `down`, `dispatch.ts`, `query.ts`, `client.ts`, `client.ts`, `resolveOrcaExecutable`, `screen-signals.ts`, `advance.ts`, `posts.ts`, `Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log``, `output.ts`, `cachedOrca`, `server/index.ts`, `edit.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `fresh`, `find-session.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `dispatcher/inbox.ts`, `spec.ts`, `api-read.ts`, `about.ts`, `main.test.ts`, `attention`, `createConsoleServer`, `command.test.ts`, `Review Focus`, `CommandDeps`, `cli.ts`, `signals.test.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `static.ts`, `autostart/index.ts`, `apply.ts`, `defaultMakeDeps`, `draft.ts`, `fake-client.ts`, `screenGuard`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09879032258064516 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_fs` to `create.ts`, `loadTeamSpec`, `文件结构`, `WinglineError`, `loop.ts`, `done.ts`, `escalate.ts`, `pages.test.tsx`, `output.test.ts`, `TeamSpec`, `screen.test.ts`, `down`, `dispatch.ts`, `self-absolute.test.ts`, `client.ts`, `inRange`, `resolveOrcaExecutable`, `screen-signals.ts`, `patterns.ts`, `cachedOrca`, `lifecycle.review.test.ts`, `server/index.ts`, `cellWidth`, `self.ts`, `orca-sync.ts`, `Settings.tsx`, `commands/log.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `spec.ts`, `api-read.ts`, `package.json`, `about.ts`, `main.test.ts`, `attention`, `command.test.ts`, `Review Focus`, `CommandDeps`, `sse.ts`, `signals.test.ts`, `call-log.ts`, `NewTeamDialog.tsx`, `static.ts`, `autostart/index.ts`, `apply.ts`, `draft.ts`, `fake-client.ts`, `screenGuard`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `loadTeamSpec` be split into smaller, more focused modules?**
  _Cohesion score 0.09852216748768473 - nodes in this community are weakly interconnected._