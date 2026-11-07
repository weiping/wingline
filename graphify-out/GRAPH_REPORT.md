# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 374 files · ~327,142 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3294 nodes · 10788 edges · 151 communities (131 shown, 20 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1749 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1a74adc2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- loadTeamSpec
- Commands
- FakeOrca
- Registry
- escalate.ts
- loadTeamSpec
- done.ts
- ref_node_fs
- pages.test.tsx
- src/index.ts
- up.ts
- dispatch.ts
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- client.ts
- query.ts
- signals.ts
- TimelineEvent
- Edit.tsx
- TaskDetail.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- api-write.test.ts
- dispatcher/inbox.ts
- server/index.ts
- unread.ts
- edit.ts
- app.ts
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resolveOrcaExecutable
- load.ts
- console.ts
- app.test.ts
- Task 4: 未读标记（调度员）
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- createConsoleServer
- plan-change.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- WinglineError
- gates
- CommandDeps
- dispatcher/inbox.ts
- autostart/index.ts
- reduce.ts
- auditedCommands
- package.json
- cli/package.json
- about.ts
- main.test.ts
- core/package.json
- TaskDetail.tsx
- 用例
- with
- errors.ts
- 雁阵 Wingline 设计总纲
- cellWidth
- apply.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/plan.ts
- .now
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- finish
- screenGuard
- rereview.test.ts
- items.ts
- api-read.ts
- orca-sync.test.ts
- signals.test.ts
- spec.ts
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- up.ts
- compilerOptions
- panel.tsx
- compilerOptions
- run.contract.test.ts
- api-read.ts
- orca-worker.d.ts
- compilerOptions
- orca-testing.d.ts
- README.md
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- gates
- eventRow
- TestPanel
- autostart/plan.test.ts
- TuiInput
- core/tsconfig.json
- cli.ts
- 雁阵岗位
- winglineHome
- File Structure
- pnpm-workspace.yaml
- phase-3d1.ts
- fake-orca.mjs
- mkDeps
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- api-spec.ts
- protocol.ts
- TestWorker
- Wingline
- PluginBridgeApi
- NewTeamDialog.tsx
- 3.4 前端界面与交互设计（`packages/web/src/`）
- screen-signals.test.ts
- core/src/audit-table.ts
- 阶段 3B 代码复审报告（2026-10-20）
- status.ts
- worktree-status.ts
- plan
- auditedCommands
- opus-review.test.ts
- duo.live.test.ts
- verdictRow
- 6. 修订后的针对性复审（复审五，2026-10-15）
- 6. 注册表扩展
- .withTeamLock
- inRange
- notify.test.ts
- contract-capture.ts
- log.test.ts
- pane-identity-probe.ts
- patrolRow

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 157 edges
3. `vitest` - 131 edges
4. `Registry` - 125 edges
5. `seedRunningTeam()` - 98 edges
6. `loadTeamSpec()` - 91 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `Commands` - 46 edges

## Surprising Connections (you probably didn't know these)
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `10. 测试` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3b-console-design.md → packages/core/src/audit.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts

## Import Cycles
- None detected.

## Communities (151 total, 20 thin omitted)

### Community 0 - "loadTeamSpec"
Cohesion: 0.07
Nodes (40): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 2: 规格的校验、写回、预演与草稿（core）, 5.1 字段, BRIEFING_LIMIT, renderBriefing(), canonical(), contentHash() (+32 more)

### Community 1 - "Commands"
Cohesion: 0.25
Nodes (20): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 5: `wl restore --all`, 7.1 `wl restore --all`, Commands, cmds(), freezePostCmd() (+12 more)

### Community 2 - "FakeOrca"
Cohesion: 0.04
Nodes (46): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, CheckMessage, CheckResult, CloseResult, RequestShowState, RunSummary, SendResult, TerminalView (+38 more)

### Community 4 - "escalate.ts"
Cohesion: 0.22
Nodes (28): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, Task 7: 任务执行流写接口, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, actorInTeam(), assertReleasable() (+20 more)

### Community 5 - "loadTeamSpec"
Cohesion: 0.14
Nodes (31): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, processBatch(), BACKOFF_MAX_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS, CHECK_WAIT_MS, checkedSpec() (+23 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (40): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 6.4 写入, syncAfterChange(), dispatchTo(), awaitDelivered(), createChild(), decide() (+32 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.07
Nodes (27): GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, MIGRATIONS, ActorSource, ExtColumn, PostRow, PostStatus, Row (+19 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.06
Nodes (37): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, ApiError, call(), csrfToken(), Envelope, ErrorBody (+29 more)

### Community 9 - "src/index.ts"
Cohesion: 0.15
Nodes (22): { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, main(), main() (+14 more)

### Community 10 - "up.ts"
Cohesion: 0.14
Nodes (30): File Structure, Task 1: Codex 会话探针, Task 4: 抽出拉起逻辑并写入会话标记, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, checkBriefingLimit(), requestId() (+22 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.18
Nodes (21): Task 10：派发与通知、`create`、`plan`, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith(), confirmReplay(), Dispatched (+13 more)

### Community 12 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.20
Nodes (9): 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3. 详细设计, 4. 错误处理、边界与安全约束, 5. 留给实现者决定的细节（Left to the Builder）, 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗, 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由 (+1 more)

### Community 13 - "client.ts"
Cohesion: 0.07
Nodes (29): createOrcaClient(), gateAndViewMethods(), inboxMethods(), Mutation, ORCA_WORKTREE_SUPPORT, OrchestrationMethods, RawCheck, RawCheckMessage (+21 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (52): Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 文件结构, Task 5: 路由器与读接口 (+44 more)

### Community 15 - "signals.ts"
Cohesion: 0.18
Nodes (23): Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder (+15 more)

### Community 16 - "TimelineEvent"
Cohesion: 0.11
Nodes (21): File Structure, Global Constraints, Review Focus, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验 (+13 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (27): errorText(), FormError, formHasField(), runSteps(), applyLocal(), Base, DraftBanner(), editInputs() (+19 more)

### Community 18 - "TaskDetail.tsx"
Cohesion: 0.17
Nodes (27): api, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), ApiState (+19 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.12
Nodes (35): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman(), NotifyHumanResult, outcomeOf() (+27 more)

### Community 20 - "advance.ts"
Cohesion: 0.20
Nodes (26): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+18 more)

### Community 21 - "posts.ts"
Cohesion: 0.15
Nodes (16): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+8 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (38): Task 5: `resumeCommand`, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪 (+30 more)

### Community 23 - "output.ts"
Cohesion: 0.08
Nodes (42): exitCodeOfDone(), registerTaskCommands(), splitList(), Awaited2, closureLine(), deliveryLine(), dispatcherLine(), dispatcherTitles() (+34 more)

### Community 24 - "api-write.test.ts"
Cohesion: 0.18
Nodes (22): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Router, buildRouter(), ServerContext, cachedOrca (+14 more)

### Community 25 - "dispatcher/inbox.ts"
Cohesion: 0.12
Nodes (37): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, sendReply(), adoptReceipt(), attempt(), Ctx, DEFAULT_HINT() (+29 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (22): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+14 more)

### Community 27 - "unread.ts"
Cohesion: 0.18
Nodes (16): Env, LoopState, SyncRound, attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead() (+8 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "app.ts"
Cohesion: 0.11
Nodes (20): emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, TuiCmdArgs (+12 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.10
Nodes (20): 6.1 开关, 6.3 worktree 汇总, 6. 同步到 Orca 原生界面（调度员）, 0. 实施分块与前置条件, 10. 错误处理, 11. 测试, 12. 不做的事（阶段 3D）, 13. 风险 (+12 more)

### Community 31 - "self.ts"
Cohesion: 0.09
Nodes (28): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Task 8: 全量验证与收尾 (+20 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.08
Nodes (39): Task 6: Orca 同步, Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 修订记录, commentLimit(), composeGroup(), Ctx, currentTask() (+31 more)

### Community 33 - "patterns.ts"
Cohesion: 0.13
Nodes (24): Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, 与 spec 的差异（先读这一节）, 4.1 模式表, classifyPreview(), ScreenState, AUTO_ARMED, AUTO_CANCELLED (+16 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.16
Nodes (24): Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, TuiReader, currentCursor(), cursorOf(), EMPTY_CURSOR, followTimeline() (+16 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.12
Nodes (16): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理 (+8 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 37 - "load.ts"
Cohesion: 0.20
Nodes (11): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, 4. `team.yaml` 扩展, checkLinks(), crossCheck(), findHandsToCycle(), launchOf(), Located, patrolOf() (+3 more)

### Community 38 - "console.ts"
Cohesion: 0.14
Nodes (23): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+15 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (16): LineInput, initialTuiState(), TuiState, address(), FakeStdin, FAST, harness(), MemOut (+8 more)

### Community 41 - "fresh"
Cohesion: 0.07
Nodes (35): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时 (+27 more)

### Community 42 - "find-session.ts"
Cohesion: 0.12
Nodes (24): Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+16 more)

### Community 43 - "app.tsx"
Cohesion: 0.15
Nodes (26): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+18 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.08
Nodes (26): Task 15：契约测试——真实回执入库并钉住解析, 10. 命令, 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 3. 全局约束补充 (+18 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.15
Nodes (27): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, PatrolSpec, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs (+19 more)

### Community 46 - "createConsoleServer"
Cohesion: 0.18
Nodes (12): File Structure, Global Constraints, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan (+4 more)

### Community 47 - "plan-change.ts"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.09
Nodes (29): Task 3: `OrcaClient.search`, File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 6: `wl autostart`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 复审修订（2026-10-21，第一轮） (+21 more)

### Community 49 - "init.ts"
Cohesion: 0.19
Nodes (20): Task 1: 团队模板与 `initTeamCmd`, Task 2: `wl init` CLI 命令, renderInit(), initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode (+12 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.19
Nodes (20): eventLine(), filterText(), Row, body(), footer(), header(), HELP, MIN_COLS (+12 more)

### Community 52 - "WinglineError"
Cohesion: 0.05
Nodes (76): Task 10：`ps` 与 `send`, Task 11：`down`, Task 12：CLI 包, 自检记录, Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 8: `restore()` 编排, Global Constraints (+68 more)

### Community 53 - "gates"
Cohesion: 0.09
Nodes (25): 3. 选定架构（已拍板）, License, npm 安装（推荐）, Orca 可执行文件, `team.yaml` 字段速查, Wingline 雁阵, 从源码安装（开发）, 功能 (+17 more)

### Community 54 - "CommandDeps"
Cohesion: 0.12
Nodes (29): CommandDeps, WAIT_SUBMIT_SEC, afterCreateError(), CreateArgs, createOnly(), dispatchCreated(), recordNewTask(), rerunCommand() (+21 more)

### Community 55 - "dispatcher/inbox.ts"
Cohesion: 0.19
Nodes (17): Task 1: 转述的 worker 原话中和 shell 元字符, 4.1 提问的转述, answerError(), askerOf(), BatchReport, checkWorkerDone(), Ctx, handleOne() (+9 more)

### Community 56 - "autostart/index.ts"
Cohesion: 0.19
Nodes (13): Task 8: 新建团队与自动恢复写接口, Exec, FsLike, removeAutostart(), autostartInstall(), AutostartSys, autostartUninstall(), DEFAULT_WAIT_ORCA (+5 more)

### Community 57 - "reduce.ts"
Cohesion: 0.19
Nodes (19): rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+11 more)

### Community 58 - "auditedCommands"
Cohesion: 0.11
Nodes (17): 10. 测试, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口, 4. `wl console` 进程 (+9 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (25): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, engines, node (+17 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.22
Nodes (14): Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, about(), AboutAutostart, AboutItem, AboutTeam, autostartItem() (+6 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.12
Nodes (37): Task 11: 前端总览页与收件箱的生命周期按钮, notReady(), CommandHint(), Pill(), KIND, show(), SpecPreview(), ActionButton() (+29 more)

### Community 65 - "用例"
Cohesion: 0.10
Nodes (21): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+13 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "errors.ts"
Cohesion: 0.08
Nodes (25): warningsOf(), applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget() (+17 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "cellWidth"
Cohesion: 0.21
Nodes (11): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+3 more)

### Community 70 - "apply.ts"
Cohesion: 0.15
Nodes (14): applyAutostart(), failure(), LOG_ROTATE_BYTES, Reply, rotateLog(), run(), runStep(), Sleep (+6 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.12
Nodes (16): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.2 非目标, 2.3 反目标 (+8 more)

### Community 72 - "command.test.ts"
Cohesion: 0.10
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/plan.ts"
Cohesion: 0.14
Nodes (18): AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions, plist(), Step (+10 more)

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.20
Nodes (26): StaleItem, ActionDialog(), postOf(), Section(), STALE_REASON, DispatcherNotice(), Empty(), FrozenCard() (+18 more)

### Community 79 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.20
Nodes (3): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 12. 测试, 9.4 派发与 `epoch`

### Community 80 - "finish"
Cohesion: 0.17
Nodes (13): { runner, worktree }, server, confirm(), finish(), longestString(), [mode, ...rest], read(), remote() (+5 more)

### Community 81 - "screenGuard"
Cohesion: 0.12
Nodes (24): Global Constraints, Review Focus, Task 16：端到端流程测试, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 自检记录, 雁阵阶段 2A（任务工作流）实现计划 (+16 more)

### Community 82 - "rereview.test.ts"
Cohesion: 0.18
Nodes (6): HEARTBEAT_STALE_MS, fakeRunning(), L, hold(), ru(), unreachable()

### Community 83 - "items.ts"
Cohesion: 0.31
Nodes (15): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+7 more)

### Community 84 - "api-read.ts"
Cohesion: 0.13
Nodes (27): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 8: TUI 应用与 `wl tui`, 1. 应在实现前修改, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE (+19 more)

### Community 85 - "orca-sync.test.ts"
Cohesion: 0.18
Nodes (9): SIGNAL_LABEL, builder, busyDuo(), busyTrio(), reviewTasks, snapOf(), task(), WA (+1 more)

### Community 86 - "signals.test.ts"
Cohesion: 0.12
Nodes (20): ScanSnapshot, TerminalSummary, DoneVerdictRow, Verdict, BUDGET, iso(), NOW, quietC() (+12 more)

### Community 87 - "spec.ts"
Cohesion: 0.13
Nodes (39): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 12: 前端编辑页的角色增删、职责正文与保存并启动, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+31 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.11
Nodes (17): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+9 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.17
Nodes (13): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.19
Nodes (11): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+3 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.11
Nodes (28): File Structure, Global Constraints, Review Focus, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾, 阶段 2/3 复审修复 Implementation Plan (+20 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.11
Nodes (6): error, loading, refresh(), setup(), teams, plugin

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "run.contract.test.ts"
Cohesion: 0.11
Nodes (20): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 8：启动包 (+12 more)

### Community 98 - "api-read.ts"
Cohesion: 0.32
Nodes (12): signalSummary(), FrozenRow, buildPostDetail(), loadPostPreview(), offlinePosts(), PostDetail, registerLogRoute(), registerPostRoutes() (+4 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.15
Nodes (12): coreAuditTable(), createSpecFacade(), facaded(), auditedInit(), createDeps(), specForEditDto, teamSummaries(), which() (+4 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.16
Nodes (4): assert, MockHost, MockHostOptions, orca/testing

### Community 102 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.13
Nodes (18): WriteRouteSpec, Handler, HandlerContext, PARAM_RULES, RouteEntry, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath() (+10 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "gates"
Cohesion: 0.13
Nodes (16): 7.4 团队规格（首期子集）, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台）, gates(), yaml() (+8 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 110 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "cli.ts"
Cohesion: 0.09
Nodes (38): AsJson, collect(), DepsOverrides, Execute, exitCodeOfUp(), LOG_SOURCES, logArgs(), parseSessions() (+30 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "winglineHome"
Cohesion: 0.50
Nodes (3): Task 7：注册表, 2. 命令, winglineHome()

### Community 116 - "File Structure"
Cohesion: 0.13
Nodes (19): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 4: 每轮读画面进 `previews`, Task 7: 展示, Task 8: 文档与真机核对, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan (+11 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 119 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 120 - "mkDeps"
Cohesion: 0.11
Nodes (24): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, BACKOFF_START_MS, initialState(), WAKE_GAP_MS, SignalHit, hit() (+16 more)

### Community 125 - "api-spec.ts"
Cohesion: 0.67
Nodes (5): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes()

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 130 - "NewTeamDialog.tsx"
Cohesion: 0.19
Nodes (15): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+7 more)

### Community 131 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.29
Nodes (7): 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）, 3.4 前端界面与交互设计（`packages/web/src/`）

### Community 132 - "screen-signals.test.ts"
Cohesion: 0.15
Nodes (11): CONTEXT_RENOTIFY_MS, SIGNAL_TAIL_LINES, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL (+3 more)

### Community 133 - "core/src/audit-table.ts"
Cohesion: 0.13
Nodes (12): AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf(), AnyCommand, CORE_AUDIT (+4 more)

### Community 134 - "阶段 3B 代码复审报告（2026-10-20）"
Cohesion: 0.20
Nodes (9): Assessment, Critical, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Issues, Minor, Strengths, 处置情况（2026-10-23 回填）, 阶段 3B 代码复审报告（2026-10-20） (+1 more)

### Community 135 - "status.ts"
Cohesion: 0.60
Nodes (4): autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 136 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 137 - "plan"
Cohesion: 0.22
Nodes (10): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7. 身份、通知与画面检查, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals） (+2 more)

### Community 138 - "auditedCommands"
Cohesion: 0.09
Nodes (23): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, 2. 全局约束补充, 10. 错误处理, 11. 测试, 13. 风险, 1. 目标与成功标准 (+15 more)

### Community 139 - "opus-review.test.ts"
Cohesion: 0.25
Nodes (5): gateBody(), NOW, rt(), ru(), unreachable()

### Community 140 - "duo.live.test.ts"
Cohesion: 0.13
Nodes (9): Task 3: `wl attention` 的 `warnings`, 6.5 `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at(), MemOut (+1 more)

### Community 142 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.25
Nodes (7): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 145 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

### Community 146 - "notify.test.ts"
Cohesion: 0.40
Nodes (3): r6, fixture(), ROOT

### Community 147 - "contract-capture.ts"
Cohesion: 0.60
Nodes (4): main(), orcaVersion(), Receipt, sanitize()

### Community 149 - "pane-identity-probe.ts"
Cohesion: 1.00
Nodes (3): main(), sleep(), waitFile()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 970 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `loadTeamSpec`, `Commands`, `FakeOrca`, `Registry`, `escalate.ts`, `core/src/audit-table.ts`, `loadTeamSpec`, `done.ts`, `ref_node_fs`, `screen-signals.test.ts`, `up.ts`, `dispatch.ts`, `opus-review.test.ts`, `client.ts`, `query.ts`, `signals.ts`, `.withTeamLock`, `src/index.ts`, `notify.test.ts`, `contract-capture.ts`, `advance.ts`, `posts.ts`, `pane-identity-probe.ts`, `output.ts`, `api-write.test.ts`, `dispatcher/inbox.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `app.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `fresh`, `find-session.ts`, `createConsoleServer`, `restore/index.ts`, `init.ts`, `CommandDeps`, `dispatcher/inbox.ts`, `autostart/index.ts`, `about.ts`, `main.test.ts`, `errors.ts`, `apply.ts`, `command.test.ts`, `autostart/plan.ts`, `Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log``, `rereview.test.ts`, `api-read.ts`, `orca-sync.test.ts`, `signals.test.ts`, `spec.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `run.contract.test.ts`, `api-read.ts`, `static.ts`, `cli.ts`, `winglineHome`, `mkDeps`, `api-spec.ts`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `loadTeamSpec` be split into smaller, more focused modules?**
  _Cohesion score 0.07259615384615385 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_fs` to `loadTeamSpec`, `Commands`, `FakeOrca`, `screen-signals.test.ts`, `escalate.ts`, `done.ts`, `pages.test.tsx`, `dispatch.ts`, `duo.live.test.ts`, `opus-review.test.ts`, `query.ts`, `client.ts`, `inRange`, `notify.test.ts`, `log.test.ts`, `api-write.test.ts`, `dispatcher/inbox.ts`, `server/index.ts`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `resolveOrcaExecutable`, `console.ts`, `app.test.ts`, `fresh`, `find-session.ts`, `app.tsx`, `restore/index.ts`, `WinglineError`, `CommandDeps`, `autostart/index.ts`, `package.json`, `main.test.ts`, `errors.ts`, `cellWidth`, `apply.ts`, `command.test.ts`, `autostart/plan.ts`, `rereview.test.ts`, `api-read.ts`, `orca-sync.test.ts`, `signals.test.ts`, `spec.ts`, `call-log.ts`, `run.contract.test.ts`, `static.ts`, `autostart/plan.test.ts`, `winglineHome`, `mkDeps`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `FakeOrca` be split into smaller, more focused modules?**
  _Cohesion score 0.04439301493793393 - nodes in this community are weakly interconnected._