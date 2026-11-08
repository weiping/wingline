# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~336,869 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3401 nodes · 11035 edges · 152 communities (136 shown, 16 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1726 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1148a2e1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- .fail
- final-fixes.test.ts
- orca-sync.test.ts
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
- fake-client.ts
- patterns.ts
- Edit.tsx
- start.ts
- screen-signals.ts
- advance.ts
- posts.ts
- result
- output.ts
- cachedOrca
- .now
- server/index.ts
- cellWidth
- edit.ts
- app.ts
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- 雁阵阶段 2B（调度员与巡查熔断）实现计划
- commands/log.ts
- api-spec.ts
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
- outlets.ts
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
- 雁阵 Wingline 阶段 2A：任务工作流设计
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- Review Focus
- WinglineError
- TeamFeeds
- web/package.json
- TuiSession
- wl
- cli.ts
- TestPanel
- Overview.tsx
- Wingline 雁阵
- items.ts
- mkDeps
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
- TeamActions.tsx
- NewTeamDialog.tsx
- orca-worker.d.ts
- compilerOptions
- TestPanel
- gates
- cli/tsconfig.json
- static.ts
- api.ts
- orca-plugin/package.json
- Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）
- eventRow
- run
- autostart/index.ts
- apply.ts
- core/tsconfig.json
- phase-3d1.ts
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- 自检记录
- 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- vitest
- protocol.ts
- patterns.ts
- Wingline
- plan-change.ts
- 文件结构
- 6. 注册表扩展
- verdictRow
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- File Structure
- attention.ts
- signals.test.ts
- output.test.ts
- loadTeamSpec
- worktree-status.ts
- down
- tui/types.ts
- 复审修订（2026-10-23，第二轮）
- 阶段 3B 代码复审报告（2026-10-20）
- Global Constraints
- unread.test.ts
- phase-3d2.ts
- autostart/plan.test.ts
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- 阶段 3B：本地 HTTP API 与控制台 Implementation Plan
- log.test.ts

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
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
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

## Communities (152 total, 16 thin omitted)

### Community 0 - ".fail"
Cohesion: 0.23
Nodes (10): checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Located, patrolOf(), resolveFile() (+2 more)

### Community 1 - "final-fixes.test.ts"
Cohesion: 0.14
Nodes (19): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateBody(), gateCwd(), GateExecResult, gateOutputPath(), isStale() (+11 more)

### Community 2 - "orca-sync.test.ts"
Cohesion: 0.16
Nodes (15): canonical(), contentHash(), sha256(), specHash(), DEFAULT_PATROL, addTeam(), builder, busyDuo() (+7 more)

### Community 4 - "WinglineError"
Cohesion: 0.15
Nodes (24): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 6: 写接口, Commands, autostartInstall(), freezePostCmd(), hushCmd(), knownPost(), parseDuration() (+16 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (45): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS (+37 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (47): Task 12：`wl task done`, 自检记录, 6.4 写入, syncAfterChange(), afterCreateError(), CreateArgs, createOnly(), dispatchCreated() (+39 more)

### Community 7 - "escalate.ts"
Cohesion: 0.14
Nodes (39): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 14：CLI 接入——`wl task <sub>`, Task 9: 审计包装, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, Task 7: 任务执行流写接口, actorInTeam(), assertReleasable(), claimTask() (+31 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (25): resetApiForTests(), StreamProvider(), agentInput(), clone(), loaded(), Opts, PARSED, server() (+17 more)

### Community 9 - "lib.ts"
Cohesion: 0.09
Nodes (36): UpArgs, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+28 more)

### Community 10 - "ref_node_fs"
Cohesion: 0.07
Nodes (20): HEARTBEAT_STALE_MS, MIGRATIONS, ActorSource, ExtColumn, PostStatus, Row, SCREEN_SIGNAL_KINDS, TaskAction (+12 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.19
Nodes (20): Task 10：派发与通知、`create`、`plan`, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith(), confirmReplay(), Dispatched (+12 more)

### Community 12 - "signals.ts"
Cohesion: 0.20
Nodes (21): Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 4: 每轮读画面进 `previews`, activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder, localHistory() (+13 more)

### Community 13 - "client.ts"
Cohesion: 0.07
Nodes (30): createOrcaClient(), gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask (+22 more)

### Community 14 - "query.ts"
Cohesion: 0.09
Nodes (49): Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 8: `restore()` 编排, 5.2 信号, 6.5 `wl attention <team>`, 3.3.4 未启动团队与 Orca 不可达时的降级, staleSource(), taskPreflight() (+41 more)

### Community 15 - "fake-client.ts"
Cohesion: 0.10
Nodes (23): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, handleOne(), processBatch(), CheckMessage, CheckResult, CloseResult, RequestShowState, RunSummary (+15 more)

### Community 16 - "patterns.ts"
Cohesion: 0.18
Nodes (14): File Structure, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 7: 展示, Task 8: 文档与真机核对, instantOf(), MONTHS, offsetMs() (+6 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (27): errorText(), FormError, formHasField(), Step, applyLocal(), Base, DraftBanner(), editInputs() (+19 more)

### Community 18 - "start.ts"
Cohesion: 0.11
Nodes (18): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, AuditCtx, AuditEntry, AuditOptions, AuditTable, clip(), Command, summaryOf() (+10 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.24
Nodes (20): advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS, ContextSig, Ctx, detailOf() (+12 more)

### Community 20 - "advance.ts"
Cohesion: 0.17
Nodes (30): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 8：分级推进——`advancePatrol`, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, act(), advance(), announce(), autoRecover() (+22 more)

### Community 21 - "posts.ts"
Cohesion: 0.16
Nodes (29): 自检记录, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 6: 团队与调度员生命周期写接口, 1. 应在实现前修改, 2. 次要项（实现时顺手处理）, 4. 建议的下一步 (+21 more)

### Community 22 - "result"
Cohesion: 0.14
Nodes (15): Task 15：契约测试——真实回执入库并钉住解析, 12. 测试, 2. 关键事实：Orca 原生编排层（实测结论）, 6.2 岗位状态, 6.3 worktree 汇总, 6. 同步到 Orca 原生界面（调度员）, result(), 结论 (+7 more)

### Community 23 - "output.ts"
Cohesion: 0.11
Nodes (28): registerDispatcherCommands(), Awaited2, closureLine(), dispatcherLine(), dispatcherTitles(), DOWN_LABEL, LINK_LABEL, linkReason() (+20 more)

### Community 24 - "cachedOrca"
Cohesion: 0.14
Nodes (26): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry, Router (+18 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (18): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+10 more)

### Community 27 - "cellWidth"
Cohesion: 0.18
Nodes (13): Task 7: TUI 基础：宽度、屏幕、按键、输入框, 13. 风险, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+5 more)

### Community 28 - "edit.ts"
Cohesion: 0.13
Nodes (36): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+28 more)

### Community 29 - "app.ts"
Cohesion: 0.09
Nodes (21): emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, TuiCmdArgs (+13 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.15
Nodes (13): 6.1 开关, 10. 错误处理, 11. 测试, 12. 不做的事（阶段 3D）, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充, 8. 注册表迁移 (+5 more)

### Community 31 - "self.ts"
Cohesion: 0.10
Nodes (27): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变） (+19 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.08
Nodes (39): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut() (+31 more)

### Community 33 - "雁阵阶段 2B（调度员与巡查熔断）实现计划"
Cohesion: 0.20
Nodes (11): Global Constraints, Review Focus, Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 雁阵阶段 2A（任务工作流）实现计划, Global Constraints, Review Focus (+3 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.21
Nodes (20): TuiReader, currentCursor(), cursorOf(), EMPTY_CURSOR, followTimeline(), fromAudit(), fromPatrol(), fromTaskLog() (+12 more)

### Community 35 - "api-spec.ts"
Cohesion: 0.29
Nodes (12): registerLogRoute(), registerPostRoutes(), registerReadRoutes(), registerTaskRoutes(), registerTeamRoutes(), assertFields(), isObj(), parseFiles() (+4 more)

### Community 36 - "TaskBoard.tsx"
Cohesion: 0.29
Nodes (10): notReady(), STALE_REASON, BoardColumns(), BoardFilters(), COLUMNS, CreateTaskDialog(), NotReadyBoard(), StuckSection() (+2 more)

### Community 37 - "ledger.ts"
Cohesion: 0.05
Nodes (70): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 3: 不确定错误带上 `detail.retryRequest` (+62 more)

### Community 38 - "console.ts"
Cohesion: 0.12
Nodes (25): Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground(), liveServer() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (17): LineInput, initialTuiState(), TuiState, address(), FakeStdin, FAST, harness(), MemOut (+9 more)

### Community 40 - "FakeOrca"
Cohesion: 0.06
Nodes (25): chk(), seededDispatched(), asked(), task(), checkerTask(), world(), screensWorld(), bypassReport() (+17 more)

### Community 41 - "fresh"
Cohesion: 0.07
Nodes (35): Global Constraints, Review Focus, Task 5: `resumeCommand`, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准 (+27 more)

### Community 42 - "find-session.ts"
Cohesion: 0.11
Nodes (27): Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+19 more)

### Community 43 - "app.tsx"
Cohesion: 0.12
Nodes (33): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, SOURCE_LABEL (+25 more)

### Community 44 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.18
Nodes (13): 10. 命令, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals）, 1. 背景、意图与成功标准, 2. 方案对比与选型（Approaches）, 5. 留给实现者决定的细节（Left to the Builder） (+5 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.15
Nodes (27): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, PatrolSpec, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs (+19 more)

### Community 46 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.15
Nodes (13): 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`） (+5 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.08
Nodes (31): Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, WAIT_SUBMIT_SEC, Launch (+23 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.11
Nodes (27): File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 7.1 `wl restore --all`, ORCA_POLL_MS (+19 more)

### Community 49 - "init.ts"
Cohesion: 0.14
Nodes (25): Global Constraints, Review Focus, Task 1: 团队模板与 `initTeamCmd`, Task 2: `wl init` CLI 命令, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, cmds() (+17 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.20
Nodes (17): filterText(), Row, body(), footer(), header(), HELP, MIN_COLS, renderView() (+9 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 53 - "outlets.ts"
Cohesion: 0.22
Nodes (10): Ctx, EventMeta, HumanNotice, notifyExternal(), NotifyHumanResult, outcomeOf(), postWebhook(), REASON_OUTCOME (+2 more)

### Community 54 - "spec.ts"
Cohesion: 0.21
Nodes (20): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), SaveSpecArgs, SpecEditResult, SpecForEdit, writeDocs(), DOC_LIMIT_BYTES (+12 more)

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.12
Nodes (17): 10. 测试, 11. 不做的事（阶段 2B）, 12. 风险, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 4.2 回答：`wl dispatcher reply` (+9 more)

### Community 56 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (33): Task 1: Codex 会话探针, 7.4 团队规格（首期子集）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15）, 3. 跑 resume-after-restart (+25 more)

### Community 57 - "reduce.ts"
Cohesion: 0.22
Nodes (17): rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+9 more)

### Community 58 - "api-read.ts"
Cohesion: 0.16
Nodes (13): Task 5: 路由器与读接口, Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, FrozenRow, PatrolStateRow, buildPostDetail(), loadPostPreview() (+5 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.18
Nodes (17): Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems() (+9 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.18
Nodes (18): 2.1 `wl dispatcher up`, 2. 命令, direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd(), winglineHome() (+10 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.14
Nodes (38): Task 11: 前端总览页与收件箱的生命周期按钮, ActionDialog(), CommandHint(), clock(), Pill(), postOf(), Section(), PostCard() (+30 more)

### Community 65 - "attention"
Cohesion: 0.16
Nodes (20): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 7: SSE, Task 8: TUI 应用与 `wl tui`, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE (+12 more)

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
Cohesion: 0.12
Nodes (15): File Structure, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan, assertExactFields() (+7 more)

### Community 70 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.09
Nodes (21): 11. 错误处理, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 3. 全局约束补充, 5.1 建立 Run, 5.2 协调者归属：唯一规则 (+13 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.14
Nodes (13): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 4. 包与仓库布局（建议）, 5. core 对外稳定面（插件专用） (+5 more)

### Community 72 - "command.test.ts"
Cohesion: 0.10
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "Review Focus"
Cohesion: 0.21
Nodes (9): 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, Exec, FsLike, AutostartSys, autostartUninstall(), targetsOf() (+1 more)

### Community 74 - "WinglineError"
Cohesion: 0.09
Nodes (41): Task 10：`ps` 与 `send`, Task 11：`down`, CommandDeps, nextRequestId(), preflight(), addressOf(), clearDeadLock(), confirmStarted() (+33 more)

### Community 76 - "web/package.json"
Cohesion: 0.11
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "wl"
Cohesion: 0.11
Nodes (19): 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, 3. 选定架构（已拍板）, npm 安装（推荐）, Orca 可执行文件 (+11 more)

### Community 79 - "cli.ts"
Cohesion: 0.13
Nodes (20): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+12 more)

### Community 81 - "Overview.tsx"
Cohesion: 0.13
Nodes (29): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, TimelineEvent, PsRow, PostDto, Page(), ErrorBox(), Loading() (+21 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (18): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 发布, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用 (+10 more)

### Community 83 - "items.ts"
Cohesion: 0.25
Nodes (19): action(), eventLine(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem() (+11 more)

### Community 84 - "mkDeps"
Cohesion: 0.21
Nodes (9): Task 12：端到端集成测试, Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, 文件结构, seeded(), mkDeps(), seeded(), world() (+1 more)

### Community 85 - "signals.review.test.ts"
Cohesion: 0.20
Nodes (11): NUDGE_GRACE_MS, Verdict, BUDGET, iso(), NOW, quietC(), row(), snap() (+3 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.38
Nodes (3): 2.2 调度员是否在跑, holdLock(), fakeRunning()

### Community 87 - "用例"
Cohesion: 0.10
Nodes (21): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+13 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.18
Nodes (12): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令, 7.8 错误处理 (+4 more)

### Community 91 - "call-log.ts"
Cohesion: 0.10
Nodes (19): Task 5：阶段 0 探针、报告与真实回执, Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf() (+11 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.14
Nodes (24): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, 3. 核对过、确认没问题的点, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, exitCodeOfUp(), adoptDiscovered(), adoptRun(), createRun(), discoverRun() (+16 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (45): actor, bringUp(), busyTeam, confirmingDown, detail, detailAddress, detailLoading, downTeam() (+37 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "TeamActions.tsx"
Cohesion: 0.25
Nodes (17): ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DispatcherState, DraftDialog(), parseSessions() (+9 more)

### Community 98 - "NewTeamDialog.tsx"
Cohesion: 0.26
Nodes (13): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog(), TEAM_TEMPLATES_UI (+5 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "TestPanel"
Cohesion: 0.09
Nodes (12): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+4 more)

### Community 102 - "gates"
Cohesion: 0.17
Nodes (13): 4. `team.yaml` 扩展, 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft` (+5 more)

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.44
Nodes (8): applySecurityHeaders(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), sendFile(), sendIndex(), serveStatic()

### Community 105 - "api.ts"
Cohesion: 0.13
Nodes (17): Task 9: 前端工程与基础设施, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, api, ApiError, call(), csrfToken(), Envelope, ErrorBody (+9 more)

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）"
Cohesion: 0.14
Nodes (28): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+20 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "run"
Cohesion: 0.20
Nodes (14): Task 12：CLI 包, realAutostartSys, registerAutostartCommands(), run(), execute(), renderReady(), errorDoc, quoteWord() (+6 more)

### Community 110 - "autostart/index.ts"
Cohesion: 0.12
Nodes (26): DEFAULT_WAIT_ORCA, planOf(), AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions (+18 more)

### Community 111 - "apply.ts"
Cohesion: 0.15
Nodes (15): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+7 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.14
Nodes (37): coreAuditTable(), auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), downTeam() (+29 more)

### Community 116 - "draft.ts"
Cohesion: 0.11
Nodes (19): applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget(), sha256() (+11 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "自检记录"
Cohesion: 0.31
Nodes (10): 自检记录, PatrolOps, AttentionReport, LoopOpts, OutletIo, Env, ScanSnapshot, StaleItem (+2 more)

### Community 120 - "阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan"
Cohesion: 0.14
Nodes (16): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, Review Focus, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, 4.6 状态存储与类型, hhmm(), resetClock() (+8 more)

### Community 125 - "vitest"
Cohesion: 0.09
Nodes (20): ctxOf(), ctxOf(), dispatcherRunning(), seed(), dispatcherRunning(), yaml(), r6, ru() (+12 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 127 - "patterns.ts"
Cohesion: 0.13
Nodes (22): Global Constraints, 与 spec 的差异（先读这一节）, 4.1 模式表, 4.2 数据来源, 4.4 `context_low` 的处理, 4. 读画面的巡查信号（块 c，探针 1、2 之后）, classifyPreview(), ScreenState (+14 more)

### Community 129 - "plan-change.ts"
Cohesion: 0.26
Nodes (12): 11. 测试, classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post (+4 more)

### Community 130 - "文件结构"
Cohesion: 0.17
Nodes (14): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包 (+6 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.15
Nodes (16): collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), eventSummary(), flat(), logPrinter() (+8 more)

### Community 135 - "File Structure"
Cohesion: 0.24
Nodes (10): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 4: 静态资源与安全响应头, Task 8: 服务组装与 `wl console` (+2 more)

### Community 136 - "attention.ts"
Cohesion: 0.27
Nodes (9): Task 6: Orca 同步, dispatcherStatus, groupWarnings(), lastCommand(), pendingCount(), specOf(), WARNING_ACTIONS, warningsOf() (+1 more)

### Community 137 - "signals.test.ts"
Cohesion: 0.29
Nodes (7): iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 138 - "output.test.ts"
Cohesion: 0.32
Nodes (7): Task 3: `wl attention` 的 `warnings`, 6.5 `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at()

### Community 139 - "loadTeamSpec"
Cohesion: 0.08
Nodes (31): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 2: 规格的校验、写回、预演与草稿（core）, BRIEFING_LIMIT, renderBriefing(), advancePatrol(), keyOf() (+23 more)

### Community 140 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 141 - "down"
Cohesion: 0.06
Nodes (35): 7.2 组件, 6.1 表, 6.2 写入, 6.3 参数摘要, 6.4 清理, 6. 审计事件, 10. 测试, 11. 不做的事（阶段 3B） (+27 more)

### Community 143 - "复审修订（2026-10-23，第二轮）"
Cohesion: 0.10
Nodes (18): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, Task 6: `wl autostart`, 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出 (+10 more)

### Community 144 - "阶段 3B 代码复审报告（2026-10-20）"
Cohesion: 0.22
Nodes (8): Assessment, Critical, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Issues, Minor, Strengths, 阶段 3B 代码复审报告（2026-10-20）, cursorFrom()

### Community 145 - "Global Constraints"
Cohesion: 0.29
Nodes (5): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Global Constraints, Task 4: 未读标记（调度员）, 6. 未读标记（块 b）, stale()

### Community 146 - "unread.test.ts"
Cohesion: 0.32
Nodes (4): attentionKeys(), markUnread(), isScreenSignal(), world()

### Community 147 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 148 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 149 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.19
Nodes (3): Task 13：`wl task escalate` / `resolve` / `recover`, Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 9.4 派发与 `epoch`

### Community 150 - "阶段 3B：本地 HTTP API 与控制台 Implementation Plan"
Cohesion: 0.50
Nodes (3): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1009 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `.fail`, `final-fixes.test.ts`, `文件结构`, `Registry`, `WinglineError`, `loop.ts`, `registerBaseCommands`, `escalate.ts`, `attention.ts`, `done.ts`, `ref_node_fs`, `loadTeamSpec`, `signals.ts`, `down`, `dispatch.ts`, `复审修订（2026-10-23，第二轮）`, `query.ts`, `client.ts`, `start.ts`, `orca-sync.test.ts`, `advance.ts`, `posts.ts`, `Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log``, `output.ts`, `cachedOrca`, `unread.test.ts`, `server/index.ts`, `edit.ts`, `app.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `api-spec.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `File Structure`, `fresh`, `find-session.ts`, `FakeOrca`, `lib.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `signals.test.ts`, `spec.ts`, `api-read.ts`, `about.ts`, `main.test.ts`, `demo-question.ts`, `attention`, `createConsoleServer`, `command.test.ts`, `fake-client.ts`, `cli.ts`, `mkDeps`, `.withTeamLock`, `7. 首期详细设计：阶段 1（MVP）`, `call-log.ts`, `up.ts`, `static.ts`, `Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）`, `autostart/index.ts`, `apply.ts`, `draft.ts`, `vitest`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `final-fixes.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13666666666666666 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `final-fixes.test.ts`, `orca-sync.test.ts`, `文件结构`, `WinglineError`, `loop.ts`, `escalate.ts`, `pages.test.tsx`, `signals.test.ts`, `output.test.ts`, `loadTeamSpec`, `ref_node_fs`, `dispatch.ts`, `query.ts`, `fake-client.ts`, `复审修订（2026-10-23，第二轮）`, `client.ts`, `unread.test.ts`, `start.ts`, `autostart/plan.test.ts`, `patterns.ts`, `log.test.ts`, `cachedOrca`, `server/index.ts`, `cellWidth`, `edit.ts`, `app.ts`, `self.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `fresh`, `find-session.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `spec.ts`, `api-read.ts`, `package.json`, `about.ts`, `main.test.ts`, `demo-question.ts`, `command.test.ts`, `Review Focus`, `WinglineError`, `mkDeps`, `signals.review.test.ts`, `call-log.ts`, `NewTeamDialog.tsx`, `autostart/index.ts`, `apply.ts`, `draft.ts`, `patterns.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Registry` be split into smaller, more focused modules?**
  _Cohesion score 0.0553306342780027 - nodes in this community are weakly interconnected._