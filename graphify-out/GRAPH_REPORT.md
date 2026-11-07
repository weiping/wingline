# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 374 files · ~329,648 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3324 nodes · 10855 edges · 152 communities (140 shown, 12 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1755 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8c6c9a8b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- seedRunningTeam
- api-write.ts
- FakeOrca
- Registry
- escalate.ts
- loadTeamSpec
- done.ts
- ref_node_fs
- pages.test.tsx
- lib.ts
- up.ts
- dispatch.ts
- Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）
- client.ts
- query.ts
- signals.ts
- api.ts
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
- Screen
- screenGuard
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resolveOrcaExecutable
- load.ts
- console.ts
- app.test.ts
- ScanSnapshot
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- mkDeps
- plan-change.ts
- File Structure
- init.ts
- OrcaClient
- tui/render.ts
- CommandDeps
- gates
- claim.ts
- result
- autostart/index.ts
- reduce.ts
- auditedCommands
- package.json
- cli/package.json
- about.ts
- main.test.ts
- core/package.json
- TaskDetail.tsx
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- with
- vitest
- 雁阵 Wingline 设计总纲
- cellWidth
- apply.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/plan.ts
- Settings.tsx
- TeamFeeds
- web/package.json
- TuiSession
- TaskDetail.tsx
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- client.ts
- taskPreflight
- src/index.ts
- items.ts
- api-read.ts
- signals.review.test.ts
- resumeCommand
- spec.ts
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务
- compilerOptions
- panel.tsx
- compilerOptions
- run.contract.test.ts
- run
- orca-worker.d.ts
- compilerOptions
- orca-testing.d.ts
- README.md
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- Wingline 雁阵
- eventRow
- TestPanel
- autostart/plan.test.ts
- tui/types.ts
- core/tsconfig.json
- cli.ts
- 雁阵岗位
- host.ts
- registerBaseCommands
- pnpm-workspace.yaml
- phase-3d1.ts
- fake-orca.mjs
- 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- api-spec.ts
- protocol.ts
- TestWorker
- Wingline
- gates
- NewTeamDialog.tsx
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- screen-signals.test.ts
- core/src/audit-table.ts
- restore/index.ts
- status.ts
- 6. 注册表扩展
- panel.check.ts
- 用例
- WinglineError
- output.test.ts
- 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan
- .withTeamLock
- signals.test.ts
- worktree-status.ts
- inRange
- phase-3d2.ts
- 在 Orca 里怎么用
- verdictRow
- registerAutostartCommands
- contract-capture.ts
- pane-identity-probe.ts

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 159 edges
3. `vitest` - 131 edges
4. `Registry` - 125 edges
5. `seedRunningTeam()` - 98 edges
6. `loadTeamSpec()` - 91 edges
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
- `4.5 展示` --references--> `postLine()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md → packages/core/src/commands/dispatcher/orca-sync.ts

## Import Cycles
- None detected.

## Communities (152 total, 12 thin omitted)

### Community 0 - "seedRunningTeam"
Cohesion: 0.06
Nodes (27): harness(), specOf(), WARNING_ACTIONS, warningsOf(), SIGNAL_LABEL, ORCA_WORKTREE_SUPPORT, addTeam(), builder (+19 more)

### Community 1 - "api-write.ts"
Cohesion: 0.12
Nodes (46): Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, 自检记录, Task 9: 审计包装, Task 6: 写接口, Task 7: 任务执行流写接口, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 6. 本次由设计方拍板的决定（请一并复核） (+38 more)

### Community 2 - "FakeOrca"
Cohesion: 0.05
Nodes (42): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, CheckMessage, CheckResult, CloseResult, RequestShowState, RunSummary, SendResult, TerminalSummary (+34 more)

### Community 3 - "Registry"
Cohesion: 0.05
Nodes (3): Task 3: 注册表迁移 `unread_marks`, Registry, addAuditor()

### Community 4 - "escalate.ts"
Cohesion: 0.11
Nodes (29): Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, afterCreateError(), CreateArgs, createOnly(), createTask(), dispatchCreated(), recordNewTask(), rerunCommand() (+21 more)

### Community 5 - "loadTeamSpec"
Cohesion: 0.10
Nodes (46): Task 2: 规格的校验、写回、预演与草稿（core）, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS (+38 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (45): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 6.4 写入, syncAfterChange(), taskSpec(), awaitDelivered(), context(), createChild() (+37 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.08
Nodes (19): MIGRATIONS, ActorSource, ExtColumn, PatrolStateRow, PostStatus, Row, SCREEN_SIGNAL_KINDS, TaskAction (+11 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.07
Nodes (34): Task 9: 前端工程与基础设施, Review Focus, Task 10: 前端「新建团队」弹窗、侧栏与首页空态, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, ApiError, call(), csrfToken(), Envelope (+26 more)

### Community 9 - "lib.ts"
Cohesion: 0.12
Nodes (26): { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, main(), main() (+18 more)

### Community 10 - "up.ts"
Cohesion: 0.20
Nodes (26): Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, checkBriefingLimit(), postAddress(), requestId(), ensureMarker(), lifetimeGen(), newSessionMarker() (+18 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.20
Nodes (21): Task 10：派发与通知、`create`、`plan`, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith(), confirmReplay() (+13 more)

### Community 12 - "Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）"
Cohesion: 0.17
Nodes (27): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 11. 测试, 4.4 接口（3B 的约定与安全校验，写接口进审计） (+19 more)

### Community 13 - "client.ts"
Cohesion: 0.13
Nodes (15): createOrcaClient(), OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture(), ROOT, clientWith() (+7 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (42): 5.2 信号, 6.5 `wl attention <team>`, as(), blockedWaiting(), bypassed(), callUncertain(), commandOfKey(), deadAssignee() (+34 more)

### Community 15 - "signals.ts"
Cohesion: 0.16
Nodes (28): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, scan(), isUsagePaused(), activeHits() (+20 more)

### Community 16 - "api.ts"
Cohesion: 0.13
Nodes (15): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, PsRow, PostCard(), PostCardProps, STATUS, TeamView, postPath() (+7 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.11
Nodes (30): FormError, formHasField(), KIND, show(), SpecPreview(), runSteps(), Step, applyLocal() (+22 more)

### Community 18 - "TaskDetail.tsx"
Cohesion: 0.17
Nodes (30): TimelineEvent, PostDetail, api, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL (+22 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.13
Nodes (32): Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman(), NotifyHumanResult, outcomeOf(), OutletIo (+24 more)

### Community 20 - "advance.ts"
Cohesion: 0.16
Nodes (31): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+23 more)

### Community 21 - "posts.ts"
Cohesion: 0.10
Nodes (29): Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, recorded(), stepDone() (+21 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.05
Nodes (42): 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15） (+34 more)

### Community 23 - "output.ts"
Cohesion: 0.11
Nodes (28): Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL, logPrinter() (+20 more)

### Community 24 - "api-write.test.ts"
Cohesion: 0.12
Nodes (28): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry, Router (+20 more)

### Community 25 - "dispatcher/inbox.ts"
Cohesion: 0.06
Nodes (65): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份 (+57 more)

### Community 26 - "server/index.ts"
Cohesion: 0.08
Nodes (41): File Structure, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 4: 静态资源与安全响应头, Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, File Structure (+33 more)

### Community 27 - "unread.ts"
Cohesion: 0.27
Nodes (10): 11. 测试, attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure() (+2 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.15
Nodes (11): runTui(), chooseTeams(), TuiCmdArgs, at(), Screen, ScreenOut, TuiIo, pickTeam() (+3 more)

### Community 30 - "screenGuard"
Cohesion: 0.09
Nodes (36): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, File Structure, Global Constraints, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews`, Task 7: 展示, Task 8: 文档与真机核对 (+28 more)

### Community 31 - "self.ts"
Cohesion: 0.08
Nodes (30): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+22 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.10
Nodes (32): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, commentLimit(), composeGroup(), Ctx, currentTask(), cut(), flat() (+24 more)

### Community 33 - "patterns.ts"
Cohesion: 0.15
Nodes (17): AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW, contextLow(), hashOf(), lastMatch(), USAGE_LIMIT, usageLimit() (+9 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.12
Nodes (29): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Task 8: TUI 应用与 `wl tui`, Critical, Issues, Minor, currentCursor() (+21 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.15
Nodes (14): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 6.1 状态与推进, 6.2 动作, 6.3 静默：`wl dispatcher hush` (+6 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.13
Nodes (21): Task 12：CLI 包, Task 1：Monorepo 骨架、错误类型与 CI, Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包, 文件结构 (+13 more)

### Community 37 - "load.ts"
Cohesion: 0.07
Nodes (34): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, BRIEFING_LIMIT, renderBriefing(), checkLinks() (+26 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (24): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+16 more)

### Community 39 - "app.test.ts"
Cohesion: 0.09
Nodes (18): LineInput, initialTuiState(), TuiData, TuiState, address(), FakeStdin, FAST, MemOut (+10 more)

### Community 40 - "ScanSnapshot"
Cohesion: 0.11
Nodes (16): Global Constraints, Review Focus, Task 6: Orca 同步, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, Global Constraints, Task 4: 未读标记（调度员）, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 3. 核对过、确认没问题的点 (+8 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (27): 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄, 4.4 阶段 3 之前启动的岗位 (+19 more)

### Community 42 - "find-session.ts"
Cohesion: 0.13
Nodes (23): Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan (+15 more)

### Community 43 - "app.tsx"
Cohesion: 0.18
Nodes (22): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+14 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.11
Nodes (18): 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+10 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.15
Nodes (27): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, PatrolSpec, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs (+19 more)

### Community 46 - "mkDeps"
Cohesion: 0.15
Nodes (12): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, ORCA_POLL_MS, SETTLE_SAMPLES, seeded(), mkDeps(), seeded(), A, B (+4 more)

### Community 47 - "plan-change.ts"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 48 - "File Structure"
Cohesion: 0.10
Nodes (25): 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 5: `wl restore --all`, Task 6: `wl autostart`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 一、plan 与 spec 脱节（阻塞，已处理） (+17 more)

### Community 49 - "init.ts"
Cohesion: 0.24
Nodes (14): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamMode, registerSpec(), writeTemplate(), renderBrief(), renderNorms() (+6 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.21
Nodes (18): eventLine(), filterText(), Row, body(), footer(), HELP, MIN_COLS, renderView() (+10 more)

### Community 52 - "CommandDeps"
Cohesion: 0.14
Nodes (24): Task 10：`ps` 与 `send`, Task 11：`down`, 自检记录, 2.1 `wl dispatcher up`, CommandDeps, nextRequestId(), preflight(), Step (+16 more)

### Community 53 - "gates"
Cohesion: 0.17
Nodes (13): Review Focus, 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, 3. 选定架构（已拍板）, npm 安装（推荐） (+5 more)

### Community 54 - "claim.ts"
Cohesion: 0.28
Nodes (12): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, actorInTeam(), assertReleasable(), fail(), teamOfAddress(), Actor, actorOf(), isOwnTerminal() (+4 more)

### Community 55 - "result"
Cohesion: 0.15
Nodes (15): Task 15：契约测试——真实回执入库并钉住解析, 10. 命令, 7.1 调用方是谁（逻辑地址）, 6.2 岗位状态, 7.1 `wl restore --all`, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals） (+7 more)

### Community 56 - "autostart/index.ts"
Cohesion: 0.17
Nodes (14): Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Exec, FsLike, Sleep, autostartInstall(), AutostartSys, autostartUninstall() (+6 more)

### Community 57 - "reduce.ts"
Cohesion: 0.18
Nodes (19): 3. 次要项（实现时顺手处理）, advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+11 more)

### Community 58 - "auditedCommands"
Cohesion: 0.13
Nodes (16): 10. 测试, 11. 不做的事（阶段 3B）, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open` (+8 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (25): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, engines, node (+17 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.19
Nodes (16): Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3.4 未启动团队与 Orca 不可达时的降级, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, about(), AboutAutostart, AboutItem (+8 more)

### Community 62 - "main.test.ts"
Cohesion: 0.11
Nodes (16): AUDIT, callLogOptions(), installWarningFilter(), isReadOnlyCall(), allDeps(), autostartWorld(), exec(), execAll() (+8 more)

### Community 63 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.27
Nodes (16): errorText(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DispatcherState, DraftDialog(), parseSessions() (+8 more)

### Community 65 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.11
Nodes (18): 10. 错误处理, 12. 不做的事（阶段 3C）, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 1）, 5. 关于与诊断（控制台 `/settings`，只读）, 7.1 命令与视图, 7.2 按键, 7.3 操作 (+10 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "vitest"
Cohesion: 0.08
Nodes (34): restore(), applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget() (+26 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "cellWidth"
Cohesion: 0.18
Nodes (13): Task 7: TUI 基础：宽度、屏幕、按键、输入框, 13. 风险, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+5 more)

### Community 70 - "apply.ts"
Cohesion: 0.16
Nodes (14): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+6 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (17): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+9 more)

### Community 72 - "command.test.ts"
Cohesion: 0.11
Nodes (5): tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/plan.ts"
Cohesion: 0.18
Nodes (15): execWord(), pathEnv(), planAutostart(), PlanOptions, planTargets(), plist(), Step, SYSTEM_DIRS (+7 more)

### Community 74 - "Settings.tsx"
Cohesion: 0.33
Nodes (10): Pill(), AutostartBody(), AutostartCard(), DISPATCHER, LABEL, Settings(), size(), SOURCE (+2 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.15
Nodes (9): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Assessment, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Strengths, 处置情况（2026-10-23 回填）, 阶段 3B 代码复审报告（2026-10-20）, closeServer(), cursorFrom() (+1 more)

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 77 - "TuiSession"
Cohesion: 0.22
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "TaskDetail.tsx"
Cohesion: 0.14
Nodes (37): Task 11: 收件箱与岗位详情页, Task 11: 前端总览页与收件箱的生命周期按钮, AttentionReport, StaleItem, notReady(), ActionDialog(), CommandHint(), postOf() (+29 more)

### Community 80 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 81 - "taskPreflight"
Cohesion: 0.12
Nodes (26): Global Constraints, Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 16：端到端流程测试, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构, 自检记录, 雁阵阶段 2A（任务工作流）实现计划 (+18 more)

### Community 82 - "src/index.ts"
Cohesion: 0.17
Nodes (18): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 6: 团队与调度员生命周期写接口, addressOf(), clearDeadLock(), confirmStarted(), DISPATCHER_ACTIONS, dispatcherDown(), dispatcherLaunchCommand() (+10 more)

### Community 83 - "items.ts"
Cohesion: 0.30
Nodes (16): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+8 more)

### Community 84 - "api-read.ts"
Cohesion: 0.10
Nodes (41): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 5: 路由器与读接口, Task 7: SSE, 1. 应在实现前修改, 6.2 写入, 6.1 约定, 6.2 读接口（GET） (+33 more)

### Community 85 - "signals.review.test.ts"
Cohesion: 0.20
Nodes (11): NUDGE_GRACE_MS, Verdict, BUDGET, iso(), NOW, quietC(), row(), snap() (+3 more)

### Community 86 - "resumeCommand"
Cohesion: 0.12
Nodes (17): File Structure, Global Constraints, Review Focus, Task 1: Codex 会话探针, Task 3: `OrcaClient.search`, Task 5: `resumeCommand`, Task 6: 确定会话 ID, 阶段 3A：重启恢复与审计时间线 Implementation Plan (+9 more)

### Community 87 - "spec.ts"
Cohesion: 0.24
Nodes (15): 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), SpecEditResult, DOC_LIMIT_BYTES, docRelsOf(), readDocText(), resolveDocPath(), writeDocAtomic() (+7 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.17
Nodes (13): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.14
Nodes (13): Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs(), lines() (+5 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务"
Cohesion: 0.23
Nodes (14): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, exitCodeOfUp(), adoptDiscovered(), adoptRun(), createRun(), discoverRun(), keepOrReclaim() (+6 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.06
Nodes (26): PostDto, TaskDto, busyTeam, error, expanded, inbox, InboxView(), loadInbox() (+18 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "run.contract.test.ts"
Cohesion: 0.24
Nodes (9): Global Constraints, Review Focus, Task 2：Orca 可执行文件解析与 Windows 转义, Wingline 阶段 0+1（验证 + MVP）实现计划, buildCmdLine(), escapeCmdArg(), run(), exec() (+1 more)

### Community 98 - "run"
Cohesion: 0.25
Nodes (11): realAutostartSys, registerDispatcherCommands(), run(), execute(), renderReady(), errorDoc, renderDispatcherDown(), renderDispatcherUp() (+3 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.17
Nodes (3): orca/worker, OrcaWorkerApi, register()

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.14
Nodes (8): INBOX, POSTS, TASKS, TEAM, assert, MockHost, MockHostOptions, orca/testing

### Community 102 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.22
Nodes (11): applySecurityHeaders(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS, sendFile(), sendIndex() (+3 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "Wingline 雁阵"
Cohesion: 0.18
Nodes (11): License, `team.yaml` 字段速查, Wingline 雁阵, 功能, 发布, 巡查与通知：`patrol:` 配置, 开发, 快速开始 (+3 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 110 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 111 - "tui/types.ts"
Cohesion: 0.13
Nodes (7): Effect, Step, TimelineFilterSpec, TuiInput, TuiOutput, View, TimelineSource

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "cli.ts"
Cohesion: 0.11
Nodes (25): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+17 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.35
Nodes (12): coreAuditTable(), auditedInit(), createDeps(), inboxDto, openPostTerminal(), postDtos(), specForEditDto, taskDtos() (+4 more)

### Community 116 - "registerBaseCommands"
Cohesion: 0.15
Nodes (17): Task 2: `wl init` CLI 命令, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown(), renderInit() (+9 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 119 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 120 - "阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan"
Cohesion: 0.27
Nodes (9): Review Focus, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, hhmm(), resetClock(), signalRank(), signalSummary(), topSignal(), LADDERS (+1 more)

### Community 125 - "api-spec.ts"
Cohesion: 0.31
Nodes (9): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), SpecEditOp, SpecValidateInput (+1 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.20
Nodes (11): 7.4 团队规格（首期子集）, 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft` (+3 more)

### Community 130 - "NewTeamDialog.tsx"
Cohesion: 0.28
Nodes (12): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog(), TEAM_TEMPLATES_UI (+4 more)

### Community 131 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.12
Nodes (15): 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`） (+7 more)

### Community 132 - "screen-signals.test.ts"
Cohesion: 0.15
Nodes (11): CONTEXT_RENOTIFY_MS, SIGNAL_TAIL_LINES, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL (+3 more)

### Community 133 - "core/src/audit-table.ts"
Cohesion: 0.13
Nodes (12): AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf(), AnyCommand, CORE_AUDIT (+4 more)

### Community 134 - "restore/index.ts"
Cohesion: 0.22
Nodes (7): RestoreAllTeamError, UP_OUTCOME, RestorePostOutcome, RESUME_TEMPLATES, SESSION_ID, ErrorKind, EXIT_CODES

### Community 135 - "status.ts"
Cohesion: 0.36
Nodes (7): installedCommand(), tokenize(), xmlUnescape(), autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 136 - "6. 注册表扩展"
Cohesion: 0.24
Nodes (4): 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 138 - "用例"
Cohesion: 0.18
Nodes (11): Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审, 用例三：自领任务, 用例二：转人工决策, 用例四：无人值守 (+3 more)

### Community 139 - "WinglineError"
Cohesion: 0.11
Nodes (15): SPEC_FOOTER, WinglineError, SEND, darwinSys, LedgerEntry, C, readyTask(), rt() (+7 more)

### Community 140 - "output.test.ts"
Cohesion: 0.32
Nodes (7): Task 3: `wl attention` 的 `warnings`, 6.5 `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at()

### Community 142 - ".withTeamLock"
Cohesion: 0.15
Nodes (10): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, 2.2 调度员是否在跑, 2. 命令 (+2 more)

### Community 143 - "signals.test.ts"
Cohesion: 0.29
Nodes (7): iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 144 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 145 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

### Community 146 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 147 - "在 Orca 里怎么用"
Cohesion: 0.29
Nodes (7): 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用, 岗位之间怎么说话, 岗位在 Orca 界面里能看见什么, 概念对照

### Community 149 - "registerAutostartCommands"
Cohesion: 0.50
Nodes (5): registerAutostartCommands(), quoteWord(), renderAutostartInstall(), renderAutostartStatus(), renderAutostartUninstall()

### Community 150 - "contract-capture.ts"
Cohesion: 0.60
Nodes (4): main(), orcaVersion(), Receipt, sanitize()

### Community 151 - "pane-identity-probe.ts"
Cohesion: 1.00
Nodes (3): main(), sleep(), waitFile()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 982 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `seedRunningTeam`, `api-write.ts`, `FakeOrca`, `Registry`, `escalate.ts`, `loadTeamSpec`, `core/src/audit-table.ts`, `restore/index.ts`, `done.ts`, `ref_node_fs`, `up.ts`, `dispatch.ts`, `Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）`, `client.ts`, `query.ts`, `signals.ts`, `.withTeamLock`, `signals.test.ts`, `lib.ts`, `advance.ts`, `posts.ts`, `contract-capture.ts`, `output.ts`, `api-write.test.ts`, `dispatcher/inbox.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `Screen`, `screen-signals.test.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `mkDeps`, `File Structure`, `init.ts`, `CommandDeps`, `claim.ts`, `about.ts`, `main.test.ts`, `vitest`, `apply.ts`, `command.test.ts`, `autostart/plan.ts`, `client.ts`, `taskPreflight`, `src/index.ts`, `api-read.ts`, `resumeCommand`, `spec.ts`, `7. 首期详细设计：阶段 1（MVP）`, `Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务`, `run.contract.test.ts`, `static.ts`, `cli.ts`, `registerBaseCommands`, `pane-identity-probe.ts`, `api-spec.ts`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `seedRunningTeam` be split into smaller, more focused modules?**
  _Cohesion score 0.06294326241134751 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `seedRunningTeam`, `api-write.ts`, `FakeOrca`, `screen-signals.test.ts`, `loadTeamSpec`, `restore/index.ts`, `escalate.ts`, `done.ts`, `ref_node_fs`, `pages.test.tsx`, `WinglineError`, `output.test.ts`, `client.ts`, `query.ts`, `signals.test.ts`, `inRange`, `api-write.test.ts`, `dispatcher/inbox.ts`, `server/index.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `mkDeps`, `init.ts`, `claim.ts`, `autostart/index.ts`, `package.json`, `main.test.ts`, `cellWidth`, `apply.ts`, `command.test.ts`, `autostart/plan.ts`, `src/index.ts`, `signals.review.test.ts`, `spec.ts`, `call-log.ts`, `run.contract.test.ts`, `static.ts`, `autostart/plan.test.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12336719883889695 - nodes in this community are weakly interconnected._