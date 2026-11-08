# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~335,425 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3391 nodes · 11008 edges · 147 communities (137 shown, 10 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1725 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fe344465`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- WinglineError
- gate-exec.ts
- Registry
- src/index.ts
- loop.ts
- done.ts
- validate-text.test.ts
- pages.test.tsx
- lib.ts
- vitest
- dispatch.ts
- auditedCommands
- client.ts
- query.ts
- signals.ts
- escalate.ts
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- cachedOrca
- ledger.ts
- server/index.ts
- cellWidth
- edit.ts
- Screen
- ScanSnapshot
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- dispatcher/inbox.ts
- resumeCommand
- mkDeps
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- preflight.ts
- SpecForm.tsx
- unread.test.ts
- posts.test.ts
- errors.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- recoverTask
- createConsoleServer
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- fake-client.ts
- reduce.ts
- wl
- package.json
- cli/package.json
- about.ts
- main.test.ts
- demo-question.ts
- TaskDetail.tsx
- api-read.ts
- with
- fake-orca.mjs
- 雁阵 Wingline 设计总纲
- File Structure
- escalate.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/index.ts
- CommandDeps
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- cli.ts
- signals.test.ts
- Inbox.tsx
- Wingline 雁阵
- items.ts
- 7. `wl tui`
- signals.review.test.ts
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
- Wingline 阶段 0+1（验证 + MVP）实现计划
- spec.ts
- orca-worker.d.ts
- compilerOptions
- panel.test.tsx
- 6. 修订后的针对性复审（复审五，2026-10-15）
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- .taskCreate
- eventRow
- resolveOrcaExecutable
- autostart/plan.ts
- apply.ts
- core/tsconfig.json
- 雁阵 Wingline 阶段 2A：任务工作流设计
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- NewTeamDialog.tsx
- run
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- loadTeamSpec
- protocol.ts
- TestPanel
- Wingline
- plan-change.ts
- run.ts
- up
- gates
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- 3.4 前端界面与交互设计（`packages/web/src/`）
- server-fixture.ts
- result
- screen-signals.test.ts
- 文件结构
- 阶段 3D spec 与 plan 复审（第三轮）
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- TuiInput
- status.ts
- autostart/plan.test.ts
- 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）
- output.test.ts

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 161 edges
3. `vitest` - 133 edges
4. `Registry` - 126 edges
5. `seedRunningTeam()` - 100 edges
6. `loadTeamSpec()` - 91 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `attention()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/core/src/audit.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts

## Import Cycles
- None detected.

## Communities (147 total, 10 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.11
Nodes (25): checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Links, Located, locations (+17 more)

### Community 1 - "WinglineError"
Cohesion: 0.14
Nodes (28): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 6: 写接口, Commands, freezePostCmd(), hushCmd(), knownPost(), parseDuration(), stillReady() (+20 more)

### Community 2 - "gate-exec.ts"
Cohesion: 0.10
Nodes (21): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateCwd(), GateExecResult, gateOutputPath(), isStale(), killTree() (+13 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (5): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, Task 4: 未读标记（调度员）, Registry, verdictRow(), addAuditor()

### Community 4 - "src/index.ts"
Cohesion: 0.20
Nodes (14): addressOf(), clearDeadLock(), confirmStarted(), DISPATCHER_ACTIONS, dispatcherDown(), dispatcherHealth, dispatcherUp(), HEARTBEAT_STALE_MS (+6 more)

### Community 5 - "loop.ts"
Cohesion: 0.13
Nodes (39): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS (+31 more)

### Community 6 - "done.ts"
Cohesion: 0.12
Nodes (36): Task 12：`wl task done`, 6.4 写入, syncAfterChange(), awaitDelivered(), context(), createChild(), Ctx, decide() (+28 more)

### Community 7 - "validate-text.test.ts"
Cohesion: 0.25
Nodes (5): SIGNAL_TAIL_LINES, NOW, ROOT, sample(), repoDuo

### Community 8 - "pages.test.tsx"
Cohesion: 0.06
Nodes (41): Task 10: 总览与时间线页, Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, Task 10: 前端「新建团队」弹窗、侧栏与首页空态, api, ApiError, call(), csrfToken() (+33 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "vitest"
Cohesion: 0.06
Nodes (32): RestorePostOutcome, MIGRATIONS, ActorSource, AuditRow, ExtColumn, FrozenRow, PatrolEvent, PatrolStateRow (+24 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.13
Nodes (26): Task 10：派发与通知、`create`、`plan`, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith(), confirmReplay(), Dispatched (+18 more)

### Community 12 - "auditedCommands"
Cohesion: 0.09
Nodes (22): 10. 测试, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 7. 控制台页面, 8. 代码结构, 9. 错误处理, 雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计, 15.3 探针 4：CLI 与插件的审计一致（成立） (+14 more)

### Community 13 - "client.ts"
Cohesion: 0.11
Nodes (17): Task 15：契约测试——真实回执入库并钉住解析, Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaRunner, RunOptions, r6, fixture() (+9 more)

### Community 14 - "query.ts"
Cohesion: 0.09
Nodes (42): Task 14：CLI 接入——`wl task <sub>`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 5: 路由器与读接口, Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, 5.2 执行步骤, as(), blockedWaiting() (+34 more)

### Community 15 - "signals.ts"
Cohesion: 0.12
Nodes (33): Task 6: Orca 同步, File Structure, Task 1: 样本与重置时间解析, Task 4: 每轮读画面进 `previews`, Task 6: 画面信号的状态推进, Task 7: 展示, Task 8: 文档与真机核对, 6. 修订后的针对性复审（复审五，2026-10-15） (+25 more)

### Community 16 - "escalate.ts"
Cohesion: 0.08
Nodes (28): Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, WAIT_SUBMIT_SEC, escalateGate(), escalateTask(), fail(), openRecord(), Recorded, recordStillApplies() (+20 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.11
Nodes (30): errorText(), FormError, formHasField(), KIND, show(), SpecPreview(), runSteps(), applyLocal() (+22 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.17
Nodes (27): TimelineEvent, PsRow, PostDetail, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL (+19 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.10
Nodes (42): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Global Constraints, Env, LoopOpts, SyncRound, Ctx, EventMeta, HumanNotice (+34 more)

### Community 20 - "advance.ts"
Cohesion: 0.13
Nodes (35): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 8：分级推进——`advancePatrol`, 文件结构, 4.6 状态存储与类型, act(), advance(), advancePatrol() (+27 more)

### Community 21 - "posts.ts"
Cohesion: 0.13
Nodes (34): File Structure, Task 3: `OrcaClient.search`, Task 4: 抽出拉起逻辑并写入会话标记, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, Task 2: 接进 `settleResume` 与展示, 1. 应在实现前修改 (+26 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.07
Nodes (29): Task 1: Codex 会话探针, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15）, 3. 跑 resume-after-restart, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226） (+21 more)

### Community 23 - "output.ts"
Cohesion: 0.09
Nodes (36): registerDispatcherCommands(), Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL (+28 more)

### Community 24 - "cachedOrca"
Cohesion: 0.12
Nodes (33): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes() (+25 more)

### Community 25 - "ledger.ts"
Cohesion: 0.12
Nodes (29): Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, sendReply(), adoptReceipt(), attempt(), Ctx, DEFAULT_HINT(), fenced() (+21 more)

### Community 26 - "server/index.ts"
Cohesion: 0.12
Nodes (25): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+17 more)

### Community 27 - "cellWidth"
Cohesion: 0.21
Nodes (11): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+3 more)

### Community 28 - "edit.ts"
Cohesion: 0.12
Nodes (37): Global Constraints, Task 3: `applySpecOp` 岗位增删, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap() (+29 more)

### Community 29 - "Screen"
Cohesion: 0.16
Nodes (6): at(), Screen, ScreenOut, TuiOutput, pickTeam(), MemOut

### Community 30 - "ScanSnapshot"
Cohesion: 0.05
Nodes (38): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, Global Constraints, 10. 错误处理, 12. 不做的事（阶段 3C）, 13. 风险, 1. 目标与成功标准 (+30 more)

### Community 31 - "self.ts"
Cohesion: 0.09
Nodes (30): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变） (+22 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.08
Nodes (40): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 11. 测试, 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx (+32 more)

### Community 33 - "patterns.ts"
Cohesion: 0.13
Nodes (23): Task 2: 模式表与 `detectScreen`, 与 spec 的差异（先读这一节）, 4.1 模式表, classifyPreview(), ScreenState, AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW (+15 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.16
Nodes (23): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, currentCursor(), cursorOf(), EMPTY_CURSOR, followTimeline(), fromAudit() (+15 more)

### Community 35 - "dispatcher/inbox.ts"
Cohesion: 0.12
Nodes (22): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 1: 转述的 worker 原话中和 shell 元字符, 4.1 提问的转述, askerOf(), BatchReport, checkWorkerDone(), Ctx, handleOne() (+14 more)

### Community 36 - "resumeCommand"
Cohesion: 0.18
Nodes (9): Global Constraints, Review Focus, Task 5: `resumeCommand`, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 3. 待探针事项（plan 的 Task 0，由人在真机上执行）, RESUME_TEMPLATES, resumeCommand(), SESSION_ID (+1 more)

### Community 37 - "mkDeps"
Cohesion: 0.20
Nodes (8): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, Global Constraints, Review Focus, 阶段 2/3 复审修复 Implementation Plan, seeded(), mkDeps(), seeded(), seeded()

### Community 38 - "console.ts"
Cohesion: 0.13
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.07
Nodes (30): emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, LineInput (+22 more)

### Community 40 - "FakeOrca"
Cohesion: 0.08
Nodes (14): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, CheckMessage, CheckResult, WorkerView, FakeOrca, orcaError(), rejectionReceipt(), mk() (+6 more)

### Community 41 - "fresh"
Cohesion: 0.07
Nodes (32): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时 (+24 more)

### Community 42 - "find-session.ts"
Cohesion: 0.11
Nodes (27): Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+19 more)

### Community 43 - "app.tsx"
Cohesion: 0.18
Nodes (21): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+13 more)

### Community 44 - "preflight.ts"
Cohesion: 0.14
Nodes (15): Task 7: 任务执行流写接口, 2. 次要项（实现时顺手处理）, 10. 命令, 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7. 身份、通知与画面检查, 6. 本次由设计方拍板的决定（请一并复核） (+7 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.17
Nodes (25): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+17 more)

### Community 46 - "unread.test.ts"
Cohesion: 0.19
Nodes (12): warningsOf(), attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure() (+4 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.09
Nodes (22): Task 9：命令依赖、预检与 `up`, 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 3: 文档与真机, BRIEFING_LIMIT, renderBriefing(), Launch (+14 more)

### Community 48 - "errors.ts"
Cohesion: 0.17
Nodes (13): ORCA_POLL_MS, RestoreAllTeamError, RestoreArgs, RestoreResult, SETTLE_SAMPLES, UP_OUTCOME, UpResult, ErrorKind (+5 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (17): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode, registerSpec(), writeTemplate() (+9 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.18
Nodes (21): eventLine(), filterText(), Row, body(), footer(), header(), HELP, MIN_COLS (+13 more)

### Community 52 - "core/package.json"
Cohesion: 0.10
Nodes (21): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+13 more)

### Community 53 - "recoverTask"
Cohesion: 0.14
Nodes (32): Global Constraints, Review Focus, Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构 (+24 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.12
Nodes (17): File Structure, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, File Structure, Global Constraints, Review Focus (+9 more)

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.09
Nodes (20): 3. 全局约束补充, 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 4.2 回答：`wl dispatcher reply` (+12 more)

### Community 56 - "fake-client.ts"
Cohesion: 0.07
Nodes (31): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask (+23 more)

### Community 57 - "reduce.ts"
Cohesion: 0.21
Nodes (18): rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+10 more)

### Community 58 - "wl"
Cohesion: 0.14
Nodes (15): 12. 风险, 1. 目标与成功标准, 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, npm 安装（推荐） (+7 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.21
Nodes (13): about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes(), orcaPathItem() (+5 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.14
Nodes (32): Task 11: 前端总览页与收件箱的生命周期按钮, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, CommandHint(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot() (+24 more)

### Community 65 - "api-read.ts"
Cohesion: 0.12
Nodes (30): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 7: SSE, Task 8: TUI 应用与 `wl tui`, Minor, 6.2 写入, 6.1 约定, 6.2 读接口（GET） (+22 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "File Structure"
Cohesion: 0.11
Nodes (25): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 6: `wl autostart`, Task 7: 收尾与真机验证 (+17 more)

### Community 70 - "escalate.ts"
Cohesion: 0.14
Nodes (34): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 9: 审计包装, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, actorInTeam(), assertReleasable(), claimTask(), fail(), reassignTask() (+26 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (18): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+10 more)

### Community 72 - "command.test.ts"
Cohesion: 0.12
Nodes (8): chooseTeams(), tuiCmd(), TuiCmdArgs, TuiIo, In, ioOf(), Out, tui()

### Community 73 - "autostart/index.ts"
Cohesion: 0.15
Nodes (19): Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, cmds(), Exec, FsLike (+11 more)

### Community 74 - "CommandDeps"
Cohesion: 0.15
Nodes (21): Task 10：`ps` 与 `send`, Task 11：`down`, Task 12：CLI 包, Task 1: 未预期的异常记一行日志（spec §9）, 7.2 组件, 11. 不做的事（阶段 3B）, 3.3.4 未启动团队与 Orca 不可达时的降级, CommandDeps (+13 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.23
Nodes (5): LogCursor, cursorFrom(), Subscriber, TeamFeeds, TeamLoop

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.33
Nodes (10): Pill(), AutostartBody(), AutostartCard(), DISPATCHER, LABEL, Settings(), size(), SOURCE (+2 more)

### Community 79 - "cli.ts"
Cohesion: 0.11
Nodes (24): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+16 more)

### Community 80 - "signals.test.ts"
Cohesion: 0.25
Nodes (8): Verdict, iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 81 - "Inbox.tsx"
Cohesion: 0.17
Nodes (31): Task 11: 收件箱与岗位详情页, AttentionReport, StaleItem, notReady(), ActionDialog(), postOf(), Section(), Link() (+23 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (18): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 发布, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用 (+10 more)

### Community 83 - "items.ts"
Cohesion: 0.31
Nodes (15): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+7 more)

### Community 84 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 85 - "signals.review.test.ts"
Cohesion: 0.22
Nodes (10): NUDGE_GRACE_MS, BUDGET, iso(), NOW, quietC(), row(), snap(), SPEC (+2 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.38
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
Cohesion: 0.20
Nodes (11): 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令, 7.8 错误处理, 7.9 测试 (+3 more)

### Community 91 - "call-log.ts"
Cohesion: 0.23
Nodes (9): Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs(), lines() (+1 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.13
Nodes (27): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, File Structure, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, exitCodeOfUp() (+19 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (41): actor, bringUp(), busyTeam, detail, detailAddress, detailLoading, dispatcherAction(), dispatcherUpOnce() (+33 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "Wingline 阶段 0+1（验证 + MVP）实现计划"
Cohesion: 0.31
Nodes (7): Global Constraints, Review Focus, Task 2：Orca 可执行文件解析与 Windows 转义, Wingline 阶段 0+1（验证 + MVP）实现计划, buildCmdLine(), escapeCmdArg(), CASES

### Community 98 - "spec.ts"
Cohesion: 0.12
Nodes (40): File Structure, Task 1: 工作区状态探针, Task 2: 规格的校验、写回、预演与草稿（core）, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 12: 前端编辑页的角色增删、职责正文与保存并启动 (+32 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "panel.test.tsx"
Cohesion: 0.09
Nodes (12): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+4 more)

### Community 102 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.29
Nodes (6): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.26
Nodes (11): Task 4: 静态资源与安全响应头, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS (+3 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - ".taskCreate"
Cohesion: 0.12
Nodes (18): chk(), seededDispatched(), asked(), task(), checkerTask(), screensWorld(), ask(), setWorktreeSupport() (+10 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "resolveOrcaExecutable"
Cohesion: 0.29
Nodes (8): 15.2 其他坑, 15.6 岗位终端按钮（2026-11-07）, 15. P0 现状（2026-11-06 已落地）, direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 110 - "autostart/plan.ts"
Cohesion: 0.14
Nodes (18): AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions, plist(), Step (+10 more)

### Community 111 - "apply.ts"
Cohesion: 0.15
Nodes (15): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+7 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.10
Nodes (16): 11. 错误处理, 12. 测试, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+8 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.14
Nodes (34): coreAuditTable(), auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), freezePost() (+26 more)

### Community 116 - "draft.ts"
Cohesion: 0.17
Nodes (18): Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, applyDraft(), assertSpecSize(), checkSaveConflict(), discardDraft(), draftPathOf(), fileHash(), modeOf() (+10 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "NewTeamDialog.tsx"
Cohesion: 0.25
Nodes (13): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog(), TEAM_TEMPLATES_UI (+5 more)

### Community 120 - "run"
Cohesion: 0.17
Nodes (13): realAutostartSys, registerAutostartCommands(), run(), execute(), renderReady(), errorDoc, quoteWord(), renderAutostartInstall() (+5 more)

### Community 125 - "loadTeamSpec"
Cohesion: 0.07
Nodes (33): 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, SIGNAL_LABEL, canonical(), contentHash(), sha256(), specHash() (+25 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "plan-change.ts"
Cohesion: 0.29
Nodes (10): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, Post, PostChange, same() (+2 more)

### Community 130 - "run.ts"
Cohesion: 0.17
Nodes (11): Task 3：OrcaRunner、调用日志与假 orca, OrcaExecutable, createOrcaRunner(), run(), exec(), OrcaEnvelope, Raw, Entry (+3 more)

### Community 131 - "up"
Cohesion: 0.13
Nodes (16): 自检记录, Task 6: 团队与调度员生命周期写接口, 3. 核对过、确认没问题的点, 4. 建议的下一步, 阶段 3（3A–3D）spec 与计划复审, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+8 more)

### Community 132 - "gates"
Cohesion: 0.14
Nodes (15): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, 7.4 团队规格（首期子集）, 4. `team.yaml` 扩展, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台） (+7 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.19
Nodes (13): Task 2: `wl init` CLI 命令, 7.1 `wl restore --all`, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown() (+5 more)

### Community 135 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.15
Nodes (13): 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`） (+5 more)

### Community 136 - "server-fixture.ts"
Cohesion: 0.20
Nodes (4): ConsoleServer, seen, FixtureConsole, startFixtureConsole()

### Community 137 - "result"
Cohesion: 0.20
Nodes (11): Task 4：OrcaClient 类型化方法, 2. 关键事实：Orca 原生编排层（实测结论）, result(), 结论, 补充探针：`run-use` 接管 + `check`/`ack`（2026-10-13，紧接上面那轮，同一个 Run）, 补充探针三：重放语义 / 协调者换手 / gate 对任务状态的影响 / pane 身份（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 第二次复审阶段 2 文档）, 补充探针二：幂等重试 / `dispatch --inject` / `gate-create` 对已终态任务 / `WINGLINE_POST` 兼容性 / `lastOutputAt`（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 复审阶段 2 文档后列出的未验证假设）, 补充探针五：账本按谁分区 / 传输层错误的含义 / 被拒的 `worker_done` 进不进账本（2026-10-14，Linux 本机真实 Orca 1.4.222，针对阶段 2 第四次复审，下称 R5） (+3 more)

### Community 138 - "screen-signals.test.ts"
Cohesion: 0.22
Nodes (7): CONTEXT_RENOTIFY_MS, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL

### Community 139 - "文件结构"
Cohesion: 0.29
Nodes (7): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包, 文件结构

### Community 140 - "阶段 3D spec 与 plan 复审（第三轮）"
Cohesion: 0.29
Nodes (6): 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮）

### Community 141 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.29
Nodes (6): 2. 方案对比与选型（Approaches）, 4. 错误处理、边界与安全约束, 5. 留给实现者决定的细节（Left to the Builder）, 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗, 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由, 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计

### Community 143 - "status.ts"
Cohesion: 0.60
Nodes (4): autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 144 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 145 - "待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）"
Cohesion: 0.40
Nodes (5): A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）, B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher）, C. Run 重启后是否保留（需要重启 Orca，在 B 之后做）, 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）, 执行结果（2026-10-13，macOS 真机，Orca 1.4.224，由 Claude 代为执行）

### Community 146 - "output.test.ts"
Cohesion: 0.83
Nodes (3): event(), report(), at()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1005 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `run.ts`, `gate-exec.ts`, `src/index.ts`, `loop.ts`, `registerBaseCommands`, `done.ts`, `up`, `Registry`, `vitest`, `文件结构`, `auditedCommands`, `dispatch.ts`, `query.ts`, `signals.ts`, `escalate.ts`, `screen-signals.test.ts`, `client.ts`, `advance.ts`, `posts.ts`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `edit.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `dispatcher/inbox.ts`, `resumeCommand`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `preflight.ts`, `unread.test.ts`, `posts.test.ts`, `errors.ts`, `init.ts`, `lib.ts`, `recoverTask`, `createConsoleServer`, `fake-client.ts`, `about.ts`, `main.test.ts`, `api-read.ts`, `File Structure`, `escalate.ts`, `command.test.ts`, `autostart/index.ts`, `CommandDeps`, `cli.ts`, `signals.test.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `spec.ts`, `static.ts`, `.taskCreate`, `resolveOrcaExecutable`, `autostart/plan.ts`, `apply.ts`, `draft.ts`, `loadTeamSpec`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `WinglineError`, `gate-exec.ts`, `up`, `src/index.ts`, `loop.ts`, `run.ts`, `validate-text.test.ts`, `pages.test.tsx`, `screen-signals.test.ts`, `dispatch.ts`, `auditedCommands`, `client.ts`, `query.ts`, `autostart/plan.test.ts`, `escalate.ts`, `output.test.ts`, `advance.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `cellWidth`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `commands/log.ts`, `dispatcher/inbox.ts`, `resumeCommand`, `mkDeps`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `preflight.ts`, `unread.test.ts`, `posts.test.ts`, `errors.ts`, `init.ts`, `package.json`, `about.ts`, `main.test.ts`, `api-read.ts`, `escalate.ts`, `command.test.ts`, `autostart/index.ts`, `CommandDeps`, `TeamFeeds`, `signals.test.ts`, `signals.review.test.ts`, `call-log.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `spec.ts`, `static.ts`, `.taskCreate`, `resolveOrcaExecutable`, `autostart/plan.ts`, `apply.ts`, `draft.ts`, `run`, `loadTeamSpec`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `WinglineError` be split into smaller, more focused modules?**
  _Cohesion score 0.13630229419703105 - nodes in this community are weakly interconnected._