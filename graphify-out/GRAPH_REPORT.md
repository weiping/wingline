# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~336,377 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3395 nodes · 11023 edges · 150 communities (136 shown, 14 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1726 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aaf9a7a6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- create.ts
- fake-client.ts
- Registry
- lifecycle.review.test.ts
- loop.ts
- done.ts
- Commands
- pages.test.tsx
- lib.ts
- vitest
- dispatch.ts
- notifyPost
- client.ts
- query.ts
- scan
- File Structure
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- cachedOrca
- seedRunningTeam
- server/index.ts
- cellWidth
- edit.ts
- Screen
- screenGuard
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- stream.tsx
- orca-sync.test.ts
- ledger.ts
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- SpecForm.tsx
- unread.test.ts
- posts.test.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- advance.ts
- spec.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resumeCommand
- reduce.ts
- 自检记录
- package.json
- cli/package.json
- about.ts
- main.test.ts
- demo-question.ts
- TaskDetail.tsx
- api-read.ts
- with
- ref_node_fs
- 雁阵 Wingline 设计总纲
- call-log.ts
- TaskBoard.tsx
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/index.ts
- WinglineError
- sse.ts
- web/package.json
- TuiSession
- wl
- cli.ts
- TestPanel
- Inbox.tsx
- Wingline 雁阵
- items.ts
- status.ts
- signals.review.test.ts
- .withTeamLock
- 用例
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- 6. 修订后的针对性复审（复审五，2026-10-15）
- posts
- up.ts
- compilerOptions
- panel.tsx
- compilerOptions
- Wingline 阶段 0+1（验证 + MVP）实现计划
- spec.ts
- orca-worker.d.ts
- compilerOptions
- TestPanel
- 7. `wl tui`
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- File Structure
- eventRow
- planAutostart
- autostart/plan.ts
- apply.ts
- core/tsconfig.json
- gates
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- registry.test.ts
- run
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- vitest
- protocol.ts
- opus-review.test.ts
- Wingline
- plan-change.ts
- resolveOrcaExecutable
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- 3.4 前端界面与交互设计（`packages/web/src/`）
- createConsoleServer
- phase-3d2.ts
- 6.1 约定
- brief/render.ts
- phase-3d1.ts
- 雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计
- TuiInput
- worktree-status.ts
- autostart/plan.test.ts
- inRange
- output.test.ts
- 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan
- ps.ts
- .now

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 161 edges
3. `vitest` - 133 edges
4. `Registry` - 127 edges
5. `seedRunningTeam()` - 100 edges
6. `loadTeamSpec()` - 91 edges
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
- `Task 6: 低成本 Minor 一批` --references--> `clearDeadLock()`  [INFERRED]
  docs/superpowers/plans/2026-10-21-phase-2-3-review-fixes.md → packages/core/src/commands/dispatcher/lifecycle.ts
- `3D-1 探针 3：`worktree set --unread` / `--read`（2026-10-23，macOS，Orca 1.4.237）` --references--> `syncOrca()`  [INFERRED]
  spikes/REPORT.md → packages/core/src/commands/dispatcher/orca-sync.ts

## Import Cycles
- None detected.

## Communities (150 total, 14 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.12
Nodes (25): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, 4. `team.yaml` 扩展, canonical(), contentHash(), sha256(), specHash(), checkLinks(), crossCheck() (+17 more)

### Community 1 - "create.ts"
Cohesion: 0.11
Nodes (31): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, 9.4 派发与 `epoch`, actorInTeam(), assertReleasable(), claimTask(), fail(), teamOfAddress(), afterCreateError() (+23 more)

### Community 2 - "fake-client.ts"
Cohesion: 0.10
Nodes (19): CloseResult, RequestShowState, RunSummary, SendResult, TerminalSummary, TerminalView, WorkspaceStatus, Args (+11 more)

### Community 4 - "lifecycle.review.test.ts"
Cohesion: 0.18
Nodes (5): HEARTBEAT_STALE_MS, P, L, hit(), restarted()

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (45): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, Task 4: 未读标记（调度员）, PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat() (+37 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (44): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 6.4 写入, syncAfterChange(), awaitDelivered(), context(), createChild(), decide() (+36 more)

### Community 7 - "Commands"
Cohesion: 0.14
Nodes (48): Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 6: 团队与调度员生命周期写接口 (+40 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.07
Nodes (33): Task 9: 前端工程与基础设施, Task 10: 前端「新建团队」弹窗、侧栏与首页空态, api, ApiError, call(), csrfToken(), Envelope, ErrorBody (+25 more)

### Community 9 - "lib.ts"
Cohesion: 0.12
Nodes (27): { runner, client, worktree }, { runner, client, worktree }, searched, { runner, worktree }, server, main(), orcaVersion(), Receipt (+19 more)

### Community 10 - "vitest"
Cohesion: 0.12
Nodes (12): MIGRATIONS, ActorSource, ExtColumn, OrcaSyncRow, PostStatus, Row, SCREEN_SIGNAL_KINDS, TaskAction (+4 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.19
Nodes (19): 7.4 往岗位终端打字之前的画面检查, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith(), confirmReplay(), Dispatched (+11 more)

### Community 12 - "notifyPost"
Cohesion: 0.15
Nodes (16): Global Constraints, Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 15：契约测试——真实回执入库并钉住解析, Task 16：端到端流程测试, 文件结构, 雁阵阶段 2A（任务工作流）实现计划, 10. 命令, 7.1 调用方是谁（逻辑地址） (+8 more)

### Community 13 - "client.ts"
Cohesion: 0.07
Nodes (31): createOrcaClient(), gateAndViewMethods(), inboxMethods(), Mutation, ORCA_WORKTREE_SUPPORT, OrchestrationMethods, RawCheck, RawCheckMessage (+23 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (55): Task 10：派发与通知、`create`、`plan`, Task 9：通用前置、查询、变迁记录、`staleReasons`, 自检记录, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 5: 路由器与读接口, 14. 风险, 5.2 信号, 6.5 `wl attention <team>` (+47 more)

### Community 15 - "scan"
Cohesion: 0.16
Nodes (24): Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, isUsagePaused(), activeHits(), detectSignals(), gateStreaks() (+16 more)

### Community 16 - "File Structure"
Cohesion: 0.09
Nodes (33): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 1: 样本与重置时间解析, Task 4: 每轮读画面进 `previews`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, Task 7: 展示 (+25 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.09
Nodes (40): errorText(), DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+32 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.16
Nodes (30): TimelineEvent, PostDetail, isUnauthenticated(), App(), Expired(), Page(), Routed(), Session (+22 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.23
Nodes (21): notifyHuman(), advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS, ContextSig, Ctx (+13 more)

### Community 20 - "advance.ts"
Cohesion: 0.17
Nodes (28): Task 8：分级推进——`advancePatrol`, 11. 测试, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+20 more)

### Community 21 - "posts.ts"
Cohesion: 0.12
Nodes (37): Task 10：`ps` 与 `send`, 自检记录, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 1. 应在实现前修改, 2. 次要项（实现时顺手处理） (+29 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (37): claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15）, 3. 跑 resume-after-restart, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-19，macOS，Orca 1.4.227） (+29 more)

### Community 23 - "output.ts"
Cohesion: 0.10
Nodes (29): 6.5 `wl attention` 的 `warnings`, Awaited2, closureLine(), dispatcherLine(), dispatcherTitles(), DOWN_LABEL, LINK_LABEL, linkReason() (+21 more)

### Community 24 - "cachedOrca"
Cohesion: 0.10
Nodes (37): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes() (+29 more)

### Community 25 - "seedRunningTeam"
Cohesion: 0.09
Nodes (24): harness(), takeSnapshot(), chk(), seededDispatched(), checkerTask(), BODY, idle, MENU (+16 more)

### Community 26 - "server/index.ts"
Cohesion: 0.13
Nodes (21): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+13 more)

### Community 27 - "cellWidth"
Cohesion: 0.20
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+4 more)

### Community 28 - "edit.ts"
Cohesion: 0.14
Nodes (35): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+27 more)

### Community 29 - "Screen"
Cohesion: 0.17
Nodes (6): at(), Screen, ScreenOut, TuiOutput, pickTeam(), MemOut

### Community 30 - "screenGuard"
Cohesion: 0.12
Nodes (18): Review Focus, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 12. 风险, 5.2 执行步骤, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D）, 13. 风险 (+10 more)

### Community 31 - "self.ts"
Cohesion: 0.07
Nodes (40): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, Task 8: 全量验证与收尾 (+32 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.12
Nodes (28): 6. 未读标记（块 b）, Env, commentLimit(), composeGroup(), Ctx, currentTask(), cut(), groupByWorktree() (+20 more)

### Community 33 - "patterns.ts"
Cohesion: 0.11
Nodes (26): Task 2: 模式表与 `detectScreen`, 与 spec 的差异（先读这一节）, 4.1 模式表, classifyPreview(), ScreenState, AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW (+18 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.09
Nodes (35): File Structure, Global Constraints, Review Focus, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 2: 缓存型 OrcaClient 与纯文本工具 (+27 more)

### Community 35 - "stream.tsx"
Cohesion: 0.15
Nodes (12): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, PsRow, PostCardProps, TeamView, Handlers, Listener, StreamContext (+4 more)

### Community 36 - "orca-sync.test.ts"
Cohesion: 0.17
Nodes (11): SIGNAL_LABEL, syncOrca(), addTeam(), builder, busyDuo(), busyTrio(), reviewTasks, snapOf() (+3 more)

### Community 37 - "ledger.ts"
Cohesion: 0.12
Nodes (38): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, sendReply(), adoptReceipt(), attempt(), Ctx, DEFAULT_HINT() (+30 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (24): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+16 more)

### Community 39 - "app.test.ts"
Cohesion: 0.07
Nodes (29): failure(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, LineInput, initialTuiState(), Effect (+21 more)

### Community 40 - "FakeOrca"
Cohesion: 0.09
Nodes (10): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, WorkerView, hold(), bypassReport(), FakeOrca, orcaError(), mk(), newTask() (+2 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (29): Task 1: Codex 会话探针, 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入 (+21 more)

### Community 42 - "find-session.ts"
Cohesion: 0.07
Nodes (37): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, Task 1: 标识与核对函数, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索 (+29 more)

### Community 43 - "app.tsx"
Cohesion: 0.15
Nodes (22): Home(), Layout(), LayoutSide(), NAV, NavTarget, STATE_TEXT, Link(), PostCard() (+14 more)

### Community 44 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.12
Nodes (15): 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals）, 1. 背景、意图与成功标准, 2. 方案对比与选型（Approaches）, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`） (+7 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.14
Nodes (29): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, SpecEditOp, SpecValidateInput, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea() (+21 more)

### Community 46 - "unread.test.ts"
Cohesion: 0.20
Nodes (10): warningsOf(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS (+2 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.12
Nodes (17): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Global Constraints, Review Focus, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, Launch, landingResult(), noticeToken() (+9 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.11
Nodes (26): File Structure, Review Focus, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 实施记录（2026-10-25 回填） (+18 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (17): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode, registerSpec(), writeTemplate() (+9 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.16
Nodes (23): 4.1 提问的转述, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理, eventLine(), filterText(), Row, body(), footer() (+15 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (29): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+21 more)

### Community 53 - "advance.ts"
Cohesion: 0.09
Nodes (30): Task 12：端到端集成测试, Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, 文件结构, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, 阶段 2/3 复审修复 Implementation Plan (+22 more)

### Community 54 - "spec.ts"
Cohesion: 0.23
Nodes (17): 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, currentSpec(), docFiles(), readDocs(), readText(), SaveSpecArgs, SpecEditResult, SpecForEdit (+9 more)

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.11
Nodes (18): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段 (+10 more)

### Community 56 - "resumeCommand"
Cohesion: 0.25
Nodes (6): Global Constraints, Review Focus, Task 5: `resumeCommand`, 阶段 3A：重启恢复与审计时间线 Implementation Plan, RESUME_TEMPLATES, resumeCommand()

### Community 57 - "reduce.ts"
Cohesion: 0.22
Nodes (17): rowsOf(), advanceFlow(), applyFilter(), charKey(), confirmKey(), inputKey(), menuKey(), move() (+9 more)

### Community 58 - "自检记录"
Cohesion: 0.10
Nodes (25): Review Focus, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, 自检记录, 雁阵阶段 2B（调度员与巡查熔断）实现计划, Global Constraints, Review Focus, Task 6: Orca 同步, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan (+17 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.24
Nodes (12): Task 9: 读接口扩展与未启动团队降级, about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes() (+4 more)

### Community 62 - "main.test.ts"
Cohesion: 0.08
Nodes (19): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+11 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.15
Nodes (28): ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState, DraftDialog() (+20 more)

### Community 65 - "api-read.ts"
Cohesion: 0.17
Nodes (21): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, TuiReader, attention(), dispatcherStatus, groupWarnings(), lastCommand(), pendingCount(), specOf() (+13 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "ref_node_fs"
Cohesion: 0.10
Nodes (14): darwinSys, ROOT, spec, main(), sleep(), waitFile(), confirm(), main() (+6 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "call-log.ts"
Cohesion: 0.19
Nodes (11): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+3 more)

### Community 70 - "TaskBoard.tsx"
Cohesion: 0.26
Nodes (12): StaleItem, notReady(), STALE_REASON, BoardColumns(), BoardFilters(), COLUMNS, CreateTaskDialog(), NotReadyBoard() (+4 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (18): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+10 more)

### Community 72 - "command.test.ts"
Cohesion: 0.09
Nodes (10): emptyAttention(), runTui(), chooseTeams(), tuiCmd(), TuiCmdArgs, TuiIo, In, ioOf() (+2 more)

### Community 73 - "autostart/index.ts"
Cohesion: 0.20
Nodes (10): Exec, FsLike, Sleep, AutostartSys, DEFAULT_WAIT_ORCA, targetsOf(), planTargets(), TargetOptions (+2 more)

### Community 74 - "WinglineError"
Cohesion: 0.05
Nodes (61): Task 11：`down`, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, 3.3.4 未启动团队与 Orca 不可达时的降级, AuditCtx, AuditEntry, AuditOptions, AuditTable, clip() (+53 more)

### Community 75 - "sse.ts"
Cohesion: 0.23
Nodes (5): LogCursor, cursorFrom(), Subscriber, TeamFeeds, TeamLoop

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "wl"
Cohesion: 0.17
Nodes (13): npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发）, 安装, 3C 真机验证（续）：真实 agent、多个团队共用一个 worktree（2026-10-22，macOS，Orca 1.4.237，claude 2.1.308，codex-cli 0.163.0）, 3D-1 真机验证：`wl autostart`（2026-10-24，macOS，Orca 1.4.237，node v24.18.0）, A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）, B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher） (+5 more)

### Community 79 - "cli.ts"
Cohesion: 0.13
Nodes (21): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+13 more)

### Community 81 - "Inbox.tsx"
Cohesion: 0.20
Nodes (26): Task 11: 前端总览页与收件箱的生命周期按钮, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, ActionDialog(), CommandHint(), Pill(), postOf(), Section(), KIND (+18 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.08
Nodes (28): 7.4 团队规格（首期子集）, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台）, gates(), yaml() (+20 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (18): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), matchesFilter() (+10 more)

### Community 84 - "status.ts"
Cohesion: 0.60
Nodes (4): autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 85 - "signals.review.test.ts"
Cohesion: 0.12
Nodes (17): Verdict, BUDGET, iso(), NOW, quietC(), row(), snap(), SPEC (+9 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.28
Nodes (5): 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, holdLock(), fakeRunning()

### Community 87 - "用例"
Cohesion: 0.18
Nodes (11): Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审, 用例三：自领任务, 用例二：转人工决策, 用例四：无人值守 (+3 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.17
Nodes (13): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.18
Nodes (10): Global Constraints, 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总 (+2 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.13
Nodes (29): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, Task 8: `restore()` 编排, 3. 核对过、确认没问题的点, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, exitCodeOfUp(), adoptDiscovered(), adoptRun(), applyDraftBeforeUp() (+21 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (45): PostDto, PreviewDto, actor, bringUp(), busyTeam, confirmingDown, detail, detailAddress (+37 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "Wingline 阶段 0+1（验证 + MVP）实现计划"
Cohesion: 0.24
Nodes (9): Global Constraints, Review Focus, Task 2：Orca 可执行文件解析与 Windows 转义, Wingline 阶段 0+1（验证 + MVP）实现计划, buildCmdLine(), escapeCmdArg(), run(), exec() (+1 more)

### Community 98 - "spec.ts"
Cohesion: 0.18
Nodes (25): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 11. 测试 (+17 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "TestPanel"
Cohesion: 0.09
Nodes (12): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+4 more)

### Community 102 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.29
Nodes (10): applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS, sendFile() (+2 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "File Structure"
Cohesion: 0.22
Nodes (8): File Structure, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 9: 收尾, 修订记录, postWorkspaceStatus()

### Community 108 - "eventRow"
Cohesion: 0.12
Nodes (7): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 注册表迁移与读写, Global Constraints, restoreExitCode(), eventRow(), logRow(), patrolRow()

### Community 109 - "planAutostart"
Cohesion: 0.28
Nodes (6): planOf(), pathEnv(), planAutostart(), BASE, linux(), mac()

### Community 110 - "autostart/plan.ts"
Cohesion: 0.19
Nodes (14): Task 6: `wl autostart`, AutostartPlatform, execWord(), installedCommand(), PlanOptions, plist(), Step, SYSTEM_DIRS (+6 more)

### Community 111 - "apply.ts"
Cohesion: 0.16
Nodes (14): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+6 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "gates"
Cohesion: 0.12
Nodes (17): 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+9 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.16
Nodes (34): coreAuditTable(), ps(), auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask() (+26 more)

### Community 116 - "draft.ts"
Cohesion: 0.20
Nodes (14): applyDraft(), checkSaveConflict(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget(), sha256() (+6 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "registry.test.ts"
Cohesion: 0.28
Nodes (6): post(), running, running2b, seededRegistry(), team, tmpDb()

### Community 120 - "run"
Cohesion: 0.18
Nodes (15): realAutostartSys, registerAutostartCommands(), registerDispatcherCommands(), run(), execute(), renderReady(), errorDoc, quoteWord() (+7 more)

### Community 125 - "vitest"
Cohesion: 0.08
Nodes (32): Task 2: 规格的校验、写回、预演与草稿（core）, REVIVE_WINDOW_MS, loadTeamSpec(), hit(), world(), hit(), world(), ctxOf() (+24 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 127 - "opus-review.test.ts"
Cohesion: 0.29
Nodes (4): NOW, rt(), ru(), unreachable()

### Community 129 - "plan-change.ts"
Cohesion: 0.29
Nodes (10): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, Post, PostChange, same() (+2 more)

### Community 130 - "resolveOrcaExecutable"
Cohesion: 0.11
Nodes (23): Task 12：CLI 包, Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包 (+15 more)

### Community 131 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.17
Nodes (5): 12. 测试, 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 132 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.15
Nodes (12): 10. 错误处理, 12. 不做的事（阶段 3C）, 13. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 1）, 5. 关于与诊断（控制台 `/settings`，只读）, 6.1 开关, 6.3 worktree 汇总 (+4 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.24
Nodes (10): Task 2: `wl init` CLI 命令, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown(), renderInit() (+2 more)

### Community 135 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.29
Nodes (7): 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）, 3.4 前端界面与交互设计（`packages/web/src/`）

### Community 136 - "createConsoleServer"
Cohesion: 0.10
Nodes (16): File Structure, Global Constraints, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan (+8 more)

### Community 137 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 138 - "6.1 约定"
Cohesion: 0.29
Nodes (7): 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API, limit(), LIMIT_LINE()

### Community 139 - "brief/render.ts"
Cohesion: 0.25
Nodes (6): Task 9：命令依赖、预检与 `up`, BRIEFING_LIMIT, renderBriefing(), files, postDefaults, spec

### Community 140 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 141 - "雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计"
Cohesion: 0.10
Nodes (21): 10. 测试, 11. 不做的事（阶段 3B）, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open` (+13 more)

### Community 143 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 144 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 145 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

### Community 146 - "output.test.ts"
Cohesion: 0.27
Nodes (9): eventSummary(), flat(), logPrinter(), pad2(), renderLog(), renderTimelineEvent(), event(), report() (+1 more)

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1005 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `create.ts`, `resolveOrcaExecutable`, `fake-client.ts`, `loop.ts`, `registerBaseCommands`, `Commands`, `createConsoleServer`, `done.ts`, `vitest`, `brief/render.ts`, `dispatch.ts`, `client.ts`, `query.ts`, `scan`, `File Structure`, `lib.ts`, `advance.ts`, `posts.ts`, `ps.ts`, `output.ts`, `.now`, `cachedOrca`, `server/index.ts`, `seedRunningTeam`, `edit.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `orca-sync.test.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `unread.test.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `advance.ts`, `spec.ts`, `resumeCommand`, `about.ts`, `main.test.ts`, `api-read.ts`, `ref_node_fs`, `command.test.ts`, `autostart/index.ts`, `cli.ts`, `signals.review.test.ts`, `.withTeamLock`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `spec.ts`, `static.ts`, `autostart/plan.ts`, `apply.ts`, `host.ts`, `draft.ts`, `registry.test.ts`, `vitest`, `opus-review.test.ts`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12183908045977011 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `create.ts`, `fake-client.ts`, `resolveOrcaExecutable`, `lifecycle.review.test.ts`, `loop.ts`, `done.ts`, `Commands`, `pages.test.tsx`, `vitest`, `brief/render.ts`, `dispatch.ts`, `client.ts`, `query.ts`, `autostart/plan.test.ts`, `inRange`, `output.test.ts`, `cachedOrca`, `seedRunningTeam`, `server/index.ts`, `cellWidth`, `edit.ts`, `Screen`, `self.ts`, `patterns.ts`, `commands/log.ts`, `orca-sync.test.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `fresh`, `find-session.ts`, `unread.test.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `advance.ts`, `spec.ts`, `resumeCommand`, `package.json`, `main.test.ts`, `api-read.ts`, `ref_node_fs`, `call-log.ts`, `command.test.ts`, `autostart/index.ts`, `WinglineError`, `sse.ts`, `signals.review.test.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `static.ts`, `planAutostart`, `apply.ts`, `draft.ts`, `registry.test.ts`, `opus-review.test.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `create.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11414141414141414 - nodes in this community are weakly interconnected._