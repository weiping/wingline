# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 376 files · ~332,120 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3361 nodes · 10940 edges · 133 communities (122 shown, 11 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1742 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3bd4fbdb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lifecycle.ts
- api-write.ts
- vitest
- Registry
- escalate.ts
- loop.ts
- done.ts
- ref_node_fs
- pages.test.tsx
- lib.ts
- load.ts
- dispatch.ts
- spec.ts
- client.ts
- query.ts
- signals.ts
- api.ts
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- up
- 阶段 0 探针报告
- output.ts
- cachedOrca
- ledger.ts
- server/index.ts
- unread.ts
- edit.ts
- Screen
- ScanSnapshot
- self.ts
- orca-sync.ts
- patterns.ts
- api-read.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resolveOrcaExecutable
- loadTeamSpec
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- dispatcher/inbox.ts
- posts.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- identity.ts
- createConsoleServer
- 6. 修订后的针对性复审（复审五，2026-10-15）
- autostart/index.ts
- reduce.ts
- down
- package.json
- cli/package.json
- about.ts
- main.test.ts
- demo-question.ts
- TaskDetail.tsx
- .taskCreate
- with
- ref_node_fs
- 雁阵 Wingline 设计总纲
- cellWidth
- create.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/plan.ts
- ok
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- orcaError
- client.ts
- ref_node_child_process
- inbox.test.ts
- items.ts
- final-fixes.test.ts
- signals.review.test.ts
- resumeCommand
- CheckResult
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- up.ts
- compilerOptions
- panel.tsx
- compilerOptions
- 文件结构
- run
- orca-worker.d.ts
- compilerOptions
- orca-testing.d.ts
- dispatcher/inbox.review.test.ts
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- wl
- eventRow
- TestPanel
- registerAutostartCommands
- TuiInput
- core/tsconfig.json
- registerTaskCommands
- 雁阵岗位
- host.ts
- cli.ts
- pnpm-workspace.yaml
- .release
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- protocol.ts
- Wingline
- gates
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- ref_node_path
- core/src/audit-table.ts
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- WinglineError
- output.test.ts
- .withTeamLock

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 160 edges
3. `vitest` - 132 edges
4. `Registry` - 126 edges
5. `seedRunningTeam()` - 99 edges
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
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `Task 6: 低成本 Minor 一批` --references--> `clearDeadLock()`  [INFERRED]
  docs/superpowers/plans/2026-10-21-phase-2-3-review-fixes.md → packages/core/src/commands/dispatcher/lifecycle.ts

## Import Cycles
- None detected.

## Communities (133 total, 11 thin omitted)

### Community 0 - "lifecycle.ts"
Cohesion: 0.19
Nodes (15): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, addressOf(), clearDeadLock(), confirmStarted(), DISPATCHER_ACTIONS, dispatcherDown(), dispatcherLaunchCommand(), dispatcherUp() (+7 more)

### Community 1 - "api-write.ts"
Cohesion: 0.11
Nodes (32): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 12：端到端集成测试, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, 文件结构, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, 5. core 对外稳定面（插件专用）, freezePostCmd() (+24 more)

### Community 2 - "vitest"
Cohesion: 0.09
Nodes (29): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, exitCodeOf(), darwinSys, hit(), world(), world(), seeded(), Args (+21 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (4): Task 4: 未读标记（调度员）, Registry, verdictRow(), addAuditor()

### Community 4 - "escalate.ts"
Cohesion: 0.13
Nodes (44): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 9: 审计包装, Task 7: 任务执行流写接口, 7.1 `wl restore --all`, Commands (+36 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (46): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, 自检记录, PATROL_INTERVAL_MS, PatrolOps, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP (+38 more)

### Community 6 - "done.ts"
Cohesion: 0.10
Nodes (39): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, awaitDelivered(), context(), createChild(), decide(), decideBypassed(), decideDispatched() (+31 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.07
Nodes (24): Env, Ctx, LedgerCall, MIGRATIONS, ActorSource, ExtColumn, PatrolStateRow, PostStatus (+16 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (26): resetApiForTests(), TEAM_TEMPLATES_UI, StreamProvider(), agentInput(), clone(), loaded(), Opts, PARSED (+18 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (58): Task 1: 探针 3 与 6（真机，人执行）, UpArgs, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched (+50 more)

### Community 10 - "load.ts"
Cohesion: 0.09
Nodes (29): Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, 11. 测试, checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf() (+21 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.10
Nodes (37): Task 10：派发与通知、`create`、`plan`, Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 7.4 往岗位终端打字之前的画面检查, 9.4 派发与 `epoch`, 6.4 写入, syncAfterChange() (+29 more)

### Community 12 - "spec.ts"
Cohesion: 0.13
Nodes (43): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+35 more)

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (15): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture() (+7 more)

### Community 14 - "query.ts"
Cohesion: 0.07
Nodes (57): Review Focus, Task 9：通用前置、查询、变迁记录、`staleReasons`, 自检记录, 雁阵阶段 2A（任务工作流）实现计划, Review Focus, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 雁阵阶段 2B（调度员与巡查熔断）实现计划, 5.2 信号 (+49 more)

### Community 15 - "signals.ts"
Cohesion: 0.08
Nodes (47): File Structure, Global Constraints, Review Focus, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews`, Task 6: 画面信号的状态推进, Task 7: 展示, Task 8: 文档与真机核对 (+39 more)

### Community 16 - "api.ts"
Cohesion: 0.10
Nodes (23): Task 10: 总览与时间线页, Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, TimelineEvent, PsRow, PostDetail, api (+15 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.09
Nodes (39): errorText(), DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+31 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.29
Nodes (10): notReady(), STALE_REASON, BoardColumns(), BoardFilters(), COLUMNS, CreateTaskDialog(), NotReadyBoard(), StuckSection() (+2 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.13
Nodes (35): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 4.3 `usage_limit` 的处理, Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman(), NotifyHumanResult (+27 more)

### Community 20 - "advance.ts"
Cohesion: 0.15
Nodes (31): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+23 more)

### Community 21 - "up"
Cohesion: 0.11
Nodes (37): Task 10：`ps` 与 `send`, 自检记录, File Structure, Task 3: `OrcaClient.search`, Task 4: 抽出拉起逻辑并写入会话标记, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库 (+29 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.07
Nodes (33): Task 1: Codex 会话探针, Task 5: `resumeCommand`, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15）, 3. 跑 resume-after-restart (+25 more)

### Community 23 - "output.ts"
Cohesion: 0.11
Nodes (28): Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL, logPrinter() (+20 more)

### Community 24 - "cachedOrca"
Cohesion: 0.11
Nodes (34): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes() (+26 more)

### Community 25 - "ledger.ts"
Cohesion: 0.13
Nodes (35): Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, 6. 修订后的针对性复审（复审五，2026-10-15）, sendReply(), adoptReceipt(), attempt(), Ctx, DEFAULT_HINT() (+27 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (22): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+14 more)

### Community 27 - "unread.ts"
Cohesion: 0.29
Nodes (10): attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS (+2 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (33): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), assertPlaceable(), blockMap(), contentEnd(), deepestMap(), deleteFirstOfItem() (+25 more)

### Community 29 - "Screen"
Cohesion: 0.12
Nodes (19): Task 8: TUI 应用与 `wl tui`, 1. 应在实现前修改, emptyAttention(), runTui(), RunTuiOptions, SIGNALS, WriteFn, TuiCmdArgs (+11 more)

### Community 30 - "ScanSnapshot"
Cohesion: 0.07
Nodes (32): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, Global Constraints, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立） (+24 more)

### Community 31 - "self.ts"
Cohesion: 0.08
Nodes (34): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+26 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.07
Nodes (47): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut() (+39 more)

### Community 33 - "patterns.ts"
Cohesion: 0.12
Nodes (21): Task 1: 样本与重置时间解析, AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW, contextLow(), hashOf(), lastMatch(), SIGNAL_TAIL_LINES (+13 more)

### Community 34 - "api-read.ts"
Cohesion: 0.05
Nodes (78): Global Constraints, Review Focus, Task 10: 时间线 `wl log` 与 CLI 接入, 阶段 3A：重启恢复与审计时间线 Implementation Plan, Global Constraints, Review Focus, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 5: 路由器与读接口 (+70 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.12
Nodes (16): 10. 测试, 11. 不做的事（阶段 2B）, 12. 风险, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 6.1 状态与推进 (+8 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 37 - "loadTeamSpec"
Cohesion: 0.10
Nodes (29): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 2: 规格的校验、写回、预演与草稿（core）, BRIEFING_LIMIT, renderBriefing(), restore(), canonical() (+21 more)

### Community 38 - "console.ts"
Cohesion: 0.12
Nodes (25): Task 1: 控制台标签页探针, Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.11
Nodes (16): initialTuiState(), TuiState, address(), FakeStdin, FAST, harness(), MemOut, on() (+8 more)

### Community 40 - "FakeOrca"
Cohesion: 0.11
Nodes (8): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, TerminalView, WorkerView, FakeOrca, mk(), status(), seed(), seed()

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (30): Task 8: `restore()` 编排, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄 (+22 more)

### Community 42 - "find-session.ts"
Cohesion: 0.11
Nodes (26): Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan (+18 more)

### Community 43 - "app.tsx"
Cohesion: 0.12
Nodes (45): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Page(), Routed(), Session (+37 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.08
Nodes (26): 10. 命令, 11. 错误处理, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run (+18 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.12
Nodes (31): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 12: 前端编辑页的角色增删、职责正文与保存并启动, SpecEditOp, SpecValidateInput, PatrolSpec, AddPostDialog(), AddPostFields(), BoolField() (+23 more)

### Community 46 - "dispatcher/inbox.ts"
Cohesion: 0.09
Nodes (29): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时 (+21 more)

### Community 47 - "posts.ts"
Cohesion: 0.10
Nodes (26): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, Launch, FRESH_REFUSE, Landing (+18 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.12
Nodes (22): 阶段 3D 实现计划（索引）, File Structure, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 实施记录（2026-10-25 回填）, ORCA_POLL_MS, orcaReachable() (+14 more)

### Community 49 - "init.ts"
Cohesion: 0.16
Nodes (22): Global Constraints, Review Focus, Task 1: 团队模板与 `initTeamCmd`, Task 2: `wl init` CLI 命令, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, initFromImport(), initFromTemplate(), InitTeamArgs (+14 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.19
Nodes (20): eventLine(), filterText(), Row, body(), footer(), header(), HELP, MIN_COLS (+12 more)

### Community 52 - "core/package.json"
Cohesion: 0.10
Nodes (20): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+12 more)

### Community 53 - "identity.ts"
Cohesion: 0.24
Nodes (11): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, AuditEntry, AuditOptions, clip(), Command, summaryOf(), write(), Actor (+3 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.08
Nodes (20): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 3: 登录、会话与请求校验, File Structure, Global Constraints, Review Focus (+12 more)

### Community 55 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.29
Nodes (6): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 56 - "autostart/index.ts"
Cohesion: 0.08
Nodes (36): Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 3.3.3 需要连带修改的两处 core 函数, 3.3.4 未启动团队与 Orca 不可达时的降级, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`） (+28 more)

### Community 57 - "reduce.ts"
Cohesion: 0.15
Nodes (21): Global Constraints, advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+13 more)

### Community 58 - "down"
Cohesion: 0.05
Nodes (41): 10. 测试, 11. 不做的事（阶段 3B）, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+33 more)

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
Nodes (17): AUDIT, callLogOptions(), installWarningFilter(), isReadOnlyCall(), allDeps(), autostartWorld(), exec(), execAll() (+9 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.28
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.15
Nodes (29): clock(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState (+21 more)

### Community 65 - ".taskCreate"
Cohesion: 0.18
Nodes (12): chk(), seededDispatched(), screensWorld(), newTask(), dispatchedTask(), landedThenBroken(), readyTask(), dispatched() (+4 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "ref_node_fs"
Cohesion: 0.16
Nodes (13): applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), modeOf(), realTarget(), SPEC_MAX_BYTES, writeAtomic() (+5 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.07
Nodes (24): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明, 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准 (+16 more)

### Community 69 - "cellWidth"
Cohesion: 0.17
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, LineInput, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+4 more)

### Community 70 - "create.ts"
Cohesion: 0.29
Nodes (10): Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, afterCreateError(), CreateArgs, createOnly(), createTask(), dispatchCreated(), recordNewTask(), rerunCommand() (+2 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.15
Nodes (12): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 4. 包与仓库布局（建议）, 6. 协议（`src/protocol.ts`） (+4 more)

### Community 72 - "command.test.ts"
Cohesion: 0.09
Nodes (7): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui(), MemOut

### Community 73 - "autostart/plan.ts"
Cohesion: 0.10
Nodes (26): execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions, planTargets(), plist(), Step (+18 more)

### Community 74 - "ok"
Cohesion: 0.17
Nodes (9): 3. 全局约束补充, 8. 长期运行, 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.6 岗位终端按钮（2026-11-07）, 15. P0 现状（2026-11-06 已落地）, CallLog, ok() (+1 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.23
Nodes (5): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Strengths, closeServer(), cursorFrom(), TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.13
Nodes (18): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+10 more)

### Community 77 - "TuiSession"
Cohesion: 0.22
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "Inbox.tsx"
Cohesion: 0.16
Nodes (30): Task 11: 前端总览页与收件箱的生命周期按钮, ActionDialog(), CommandHint(), Pill(), postOf(), Section(), KIND, show() (+22 more)

### Community 80 - "client.ts"
Cohesion: 0.11
Nodes (16): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+8 more)

### Community 81 - "ref_node_child_process"
Cohesion: 0.22
Nodes (5): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, defaultMakeDeps(), which(), clientWith(), ROOT

### Community 82 - "inbox.test.ts"
Cohesion: 0.29
Nodes (5): CheckMessage, checkerTask(), ctxOf(), msg(), question()

### Community 83 - "items.ts"
Cohesion: 0.30
Nodes (16): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+8 more)

### Community 84 - "final-fixes.test.ts"
Cohesion: 0.38
Nodes (4): NOW, ru(), stuckCreate(), uncertain()

### Community 85 - "signals.review.test.ts"
Cohesion: 0.12
Nodes (18): NUDGE_GRACE_MS, Verdict, BUDGET, iso(), NOW, quietC(), row(), snap() (+10 more)

### Community 86 - "resumeCommand"
Cohesion: 0.15
Nodes (12): 10. 测试, 2. 关键事实（实测）, 3. 待探针事项（plan 的 Task 0，由人在真机上执行）, RESUME_TEMPLATES, resumeCommand(), SESSION_ID, 3D-2 探针 1（补充）与探针 4（2026-10-24，macOS，Orca 1.4.237，claude 2.1.x）, macOS 真机探查（2026-10-13，Orca 1.4.224，有界面，按下面「如何在真机上跑」的第 0–2、4 步执行） (+4 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.15
Nodes (14): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包 (+6 more)

### Community 91 - "call-log.ts"
Cohesion: 0.11
Nodes (17): Task 12：CLI 包, Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs() (+9 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.18
Nodes (20): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, exitCodeOfUp(), adoptDiscovered(), adoptRun(), createRun(), discoverRun(), findDeadAssignees(), keepOrReclaim() (+12 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (34): PostDto, PreviewDto, TaskDto, actor, busyTeam, error, expanded, inbox (+26 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "文件结构"
Cohesion: 0.17
Nodes (13): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包 (+5 more)

### Community 98 - "run"
Cohesion: 0.24
Nodes (11): realAutostartSys, registerDispatcherCommands(), run(), execute(), renderReady(), errorDoc, renderDispatcherDown(), renderDispatcherUp() (+3 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.09
Nodes (11): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, assert, MockHost (+3 more)

### Community 102 - "dispatcher/inbox.review.test.ts"
Cohesion: 0.40
Nodes (3): asked(), ctxOf(), task()

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.25
Nodes (11): Task 4: 静态资源与安全响应头, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS (+3 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "wl"
Cohesion: 0.04
Nodes (56): 12. 风险, 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, 3. 选定架构（已拍板） (+48 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 110 - "registerAutostartCommands"
Cohesion: 0.50
Nodes (5): registerAutostartCommands(), quoteWord(), renderAutostartInstall(), renderAutostartStatus(), renderAutostartUninstall()

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "registerTaskCommands"
Cohesion: 0.16
Nodes (15): exitCodeOfDone(), registerTaskCommands(), splitList(), closureLine(), deliveryLine(), linkReason(), renderCreate(), renderDone() (+7 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.23
Nodes (21): coreAuditTable(), auditedInit(), claimTask(), createDeps(), doneTask(), freezePost(), inboxDto, openPostTerminal() (+13 more)

### Community 116 - "cli.ts"
Cohesion: 0.13
Nodes (21): AsJson, collect(), DepsOverrides, Execute, LOG_SOURCES, logArgs(), parseSessions(), rawCommands (+13 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - ".release"
Cohesion: 0.40
Nodes (3): hold(), dispatcherRunning(), dispatcherRunning()

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.15
Nodes (19): 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台）, classify(), diffFields() (+11 more)

### Community 131 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.13
Nodes (17): 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals）, 1. 背景、意图与成功标准, 2. 方案对比与选型（Approaches）, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`） (+9 more)

### Community 132 - "ref_node_path"
Cohesion: 0.14
Nodes (7): ROOT, ROOT, MESSY, ENV_YAML, repoDuo, here, yaml

### Community 133 - "core/src/audit-table.ts"
Cohesion: 0.20
Nodes (5): AuditCtx, AnyCommand, CORE_AUDIT, ENTRIES, LooseEntry

### Community 136 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.19
Nodes (4): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 12. 测试, 6. 注册表扩展, team()

### Community 139 - "WinglineError"
Cohesion: 0.11
Nodes (27): Task 11：`down`, Task 3：OrcaRunner、调用日志与假 orca, CommandDeps, nextRequestId(), closePost(), DownOutcome, PostResult, locatePost() (+19 more)

### Community 140 - "output.test.ts"
Cohesion: 0.83
Nodes (3): event(), report(), at()

### Community 142 - ".withTeamLock"
Cohesion: 0.38
Nodes (5): 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, holdLock(), fakeRunning()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 994 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `lifecycle.ts`, `api-write.ts`, `vitest`, `Registry`, `escalate.ts`, `loop.ts`, `done.ts`, `ref_node_fs`, `lib.ts`, `load.ts`, `dispatch.ts`, `spec.ts`, `client.ts`, `query.ts`, `signals.ts`, `advance.ts`, `up`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `api-read.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `find-session.ts`, `dispatcher/inbox.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `identity.ts`, `createConsoleServer`, `autostart/index.ts`, `down`, `about.ts`, `main.test.ts`, `ref_node_fs`, `create.ts`, `command.test.ts`, `autostart/plan.ts`, `orcaError`, `client.ts`, `final-fixes.test.ts`, `signals.review.test.ts`, `resumeCommand`, `7. 首期详细设计：阶段 1（MVP）`, `call-log.ts`, `up.ts`, `文件结构`, `static.ts`, `cli.ts`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1073170731707317 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `lifecycle.ts`, `api-write.ts`, `escalate.ts`, `loop.ts`, `done.ts`, `ref_node_fs`, `ref_node_path`, `pages.test.tsx`, `WinglineError`, `output.test.ts`, `spec.ts`, `dispatch.ts`, `signals.ts`, `query.ts`, `client.ts`, `advance.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `api-read.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `find-session.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `identity.ts`, `autostart/index.ts`, `package.json`, `about.ts`, `main.test.ts`, `demo-question.ts`, `.taskCreate`, `ref_node_fs`, `cellWidth`, `create.ts`, `command.test.ts`, `autostart/plan.ts`, `ref_node_child_process`, `inbox.test.ts`, `final-fixes.test.ts`, `signals.review.test.ts`, `resumeCommand`, `call-log.ts`, `文件结构`, `dispatcher/inbox.review.test.ts`, `static.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `vitest` be split into smaller, more focused modules?**
  _Cohesion score 0.0912568306010929 - nodes in this community are weakly interconnected._