# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 375 files · ~331,340 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3345 nodes · 10900 edges · 143 communities (131 shown, 12 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1742 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ec3944b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- attention.ts
- api-write.ts
- FakeOrca
- Registry
- escalate.ts
- loop.ts
- done.ts
- ref_node_fs
- pages.test.tsx
- lib.ts
- findSession
- dispatch.ts
- spec.ts
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
- cachedOrca
- ledger.ts
- server/index.ts
- unread.ts
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resolveOrcaExecutable
- loadTeamSpec
- console.ts
- app.test.ts
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- fresh
- Task 2: `findSession` 按环境搜索
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- dispatcher/inbox.ts
- markerHighlighted
- File Structure
- init.ts
- OrcaClient
- tui/render.ts
- .bumpEpoch
- wl
- server-fixture.ts
- 6. 修订后的针对性复审（复审五，2026-10-15）
- autostart/index.ts
- reduce.ts
- auditedCommands
- package.json
- cli/package.json
- about.ts
- main.test.ts
- 如何在真机上跑 session-id 和 resume-after-restart
- TaskDetail.tsx
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- with
- draft.ts
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
- .now
- client.ts
- screenGuard
- File Structure
- items.ts
- api-read.ts
- signals.review.test.ts
- resumeCommand
- caller-scope-probe.ts
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务
- compilerOptions
- panel.tsx
- compilerOptions
- 文件结构
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
- TuiInput
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
- protocol.ts
- TestWorker
- Wingline
- gates
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- screen-signals.test.ts
- core/src/audit-table.ts
- status.ts
- 6. 注册表扩展
- 用例
- WinglineError
- output.test.ts
- .withTeamLock
- signals.test.ts
- worktree-status.ts
- phase-3d2.ts
- verdictRow
- contract-capture.ts

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 160 edges
3. `vitest` - 132 edges
4. `Registry` - 125 edges
5. `seedRunningTeam()` - 99 edges
6. `loadTeamSpec()` - 91 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `attention()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/core/src/audit.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `4.5 展示` --references--> `postLine()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md → packages/core/src/commands/dispatcher/orca-sync.ts

## Import Cycles
- None detected.

## Communities (143 total, 12 thin omitted)

### Community 0 - "attention.ts"
Cohesion: 0.09
Nodes (18): AboutTeam, dispatcherStatus, groupWarnings(), pendingCount(), specOf(), WARNING_ACTIONS, warningsOf(), confirmStarted() (+10 more)

### Community 1 - "api-write.ts"
Cohesion: 0.06
Nodes (76): Task 12：CLI 包, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 9: 审计包装, Task 6: 写接口, Task 5: `wl restore --all`, Global Constraints (+68 more)

### Community 2 - "FakeOrca"
Cohesion: 0.05
Nodes (58): PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, BACKOFF_START_MS, WAKE_GAP_MS, SIGNAL_LABEL, CheckMessage, CheckResult, CloseResult (+50 more)

### Community 4 - "escalate.ts"
Cohesion: 0.10
Nodes (54): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, actorInTeam(), assertReleasable(), claimTask() (+46 more)

### Community 5 - "loop.ts"
Cohesion: 0.18
Nodes (25): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, BACKOFF_MAX_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS, CHECK_WAIT_MS, checkedSpec(), claimRun() (+17 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (42): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, taskSpec(), awaitDelivered(), context(), createChild(), Ctx, decide() (+34 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.07
Nodes (24): RestorePostOutcome, MIGRATIONS, ExtColumn, PatrolStateRow, PostStatus, Row, SCREEN_SIGNAL_KINDS, darwinSys (+16 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (25): resetApiForTests(), StreamProvider(), agentInput(), clone(), loaded(), Opts, PARSED, server() (+17 more)

### Community 9 - "lib.ts"
Cohesion: 0.11
Nodes (29): UpArgs, { runner, client, worktree }, { runner, client, worktree }, searched, { runner, worktree }, server, main(), main() (+21 more)

### Community 10 - "findSession"
Cohesion: 0.25
Nodes (8): Task 7: 逐岗位判定与拉起, 0. 实施分块与前置条件, 5.1 字段, 5.4 接回后的核对（2026-10-24 补充）, 5. 远端环境的会话恢复（块 d）, findSession(), notice(), 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）

### Community 11 - "dispatch.ts"
Cohesion: 0.13
Nodes (25): Task 10：派发与通知、`create`、`plan`, 6.4 写入, syncAfterChange(), aliveHandle(), bumpRound(), busyIn(), busyWith(), confirmReplay() (+17 more)

### Community 12 - "spec.ts"
Cohesion: 0.10
Nodes (51): File Structure, Task 1: 工作区状态探针, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`）, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML） (+43 more)

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (17): Task 4：OrcaClient 类型化方法, createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture() (+9 more)

### Community 14 - "query.ts"
Cohesion: 0.06
Nodes (62): Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 文件结构, Task 8: `restore()` 编排, Task 5: 路由器与读接口 (+54 more)

### Community 15 - "signals.ts"
Cohesion: 0.17
Nodes (23): Task 6: Orca 同步, Task 4: 每轮读画面进 `previews`, scan(), activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder (+15 more)

### Community 16 - "api.ts"
Cohesion: 0.10
Nodes (21): Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, PsRow, PostDetail, ApiError, call(), csrfToken(), Envelope (+13 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (27): errorText(), FormError, formHasField(), runSteps(), applyLocal(), Base, DraftBanner(), editInputs() (+19 more)

### Community 18 - "TaskDetail.tsx"
Cohesion: 0.16
Nodes (31): Task 11: 前端总览页与收件箱的生命周期按钮, TimelineEvent, notReady(), Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL (+23 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.12
Nodes (36): Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman() (+28 more)

### Community 20 - "advance.ts"
Cohesion: 0.16
Nodes (30): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+22 more)

### Community 21 - "posts.ts"
Cohesion: 0.19
Nodes (24): File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, postAddress(), requestId(), ensureMarker(), lifetimeGen(), newSessionMarker() (+16 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.09
Nodes (26): Task 1: Codex 会话探针, claude(), 2A 契约抓取（Task 15，2026-10-15）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-19，macOS，Orca 1.4.227）, 3B 探针：控制台标签页（2026-10-19，macOS Orca 1.4.229）, 3C 探针：工作区状态与注释（2026-10-22，macOS，Orca 1.4.237）, 3C 真机验证（续二）：权限确认框信号、真 agent 长任务, 3D-1 Linux systemd 真机验证（2026-10-25，Lima VM `agent`，Linux 6.8 aarch64，node 24.22.0） (+18 more)

### Community 23 - "output.ts"
Cohesion: 0.09
Nodes (32): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, exitCodeOfUp(), Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat() (+24 more)

### Community 24 - "cachedOrca"
Cohesion: 0.19
Nodes (20): Task 4: spec / about 接口、写命令表改造、`wl up --draft`, assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), consoleCommands(), registerWriteRoutes() (+12 more)

### Community 25 - "ledger.ts"
Cohesion: 0.14
Nodes (34): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, adoptReceipt(), attempt(), Ctx, DEFAULT_HINT(), hintFor() (+26 more)

### Community 26 - "server/index.ts"
Cohesion: 0.09
Nodes (33): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, File Structure, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan (+25 more)

### Community 27 - "unread.ts"
Cohesion: 0.24
Nodes (12): resolveWorktrees(), tidy(), attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread() (+4 more)

### Community 28 - "edit.ts"
Cohesion: 0.06
Nodes (63): Task 3: `applySpecOp` 岗位增删, dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files (+55 more)

### Community 29 - "Screen"
Cohesion: 0.08
Nodes (20): emptyAttention(), runTui(), RunTuiOptions, SIGNALS, WriteFn, chooseTeams(), tuiCmd(), TuiCmdArgs (+12 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.18
Nodes (10): 10. 错误处理, 12. 不做的事（阶段 3D）, 1. 目标与成功标准, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, 8. 注册表迁移, 9. 代码结构, 复审修订（2026-10-21，第一轮） (+2 more)

### Community 31 - "self.ts"
Cohesion: 0.09
Nodes (28): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Task 8: 全量验证与收尾 (+20 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.07
Nodes (44): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 11. 测试, 修订记录, commentLimit(), composeGroup(), Ctx, currentTask() (+36 more)

### Community 33 - "patterns.ts"
Cohesion: 0.09
Nodes (33): File Structure, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 7: 展示, Task 8: 文档与真机核对, 与 spec 的差异（先读这一节）, 4.1 模式表, 4.2 数据来源 (+25 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.13
Nodes (27): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Task 8: TUI 应用与 `wl tui`, TuiReader, currentCursor(), cursorOf(), EMPTY_CURSOR (+19 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.14
Nodes (15): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理, 6.1 状态与推进 (+7 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 37 - "loadTeamSpec"
Cohesion: 0.04
Nodes (72): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, Task 2: 规格的校验、写回、预演与草稿（core）, Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, BRIEFING_LIMIT, checkBriefingLimit() (+64 more)

### Community 38 - "console.ts"
Cohesion: 0.14
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.12
Nodes (16): initialTuiState(), address(), FakeStdin, FAST, harness(), MemOut, on(), withQuestion (+8 more)

### Community 40 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.11
Nodes (17): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, 10. 错误处理, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 1）, 5. 关于与诊断（控制台 `/settings`，只读） (+9 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (28): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄 (+20 more)

### Community 42 - "Task 2: `findSession` 按环境搜索"
Cohesion: 0.15
Nodes (11): File Structure, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan, 5.3 探针 4 的结论（2026-10-24）, postRow() (+3 more)

### Community 43 - "app.tsx"
Cohesion: 0.12
Nodes (33): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout() (+25 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.14
Nodes (14): 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+6 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.09
Nodes (33): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 12: 前端编辑页的角色增删、职责正文与保存并启动, WorkspaceStatus, SpecEditOp, SpecValidateInput, handOver(), AddPostDialog(), AddPostFields() (+25 more)

### Community 46 - "dispatcher/inbox.ts"
Cohesion: 0.17
Nodes (19): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, answerError(), askerOf(), BatchReport, checkWorkerDone(), Ctx, handleOne(), OPTION_LIMIT (+11 more)

### Community 47 - "markerHighlighted"
Cohesion: 0.15
Nodes (16): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Global Constraints, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, restorePostLines(), markerHighlighted() (+8 more)

### Community 48 - "File Structure"
Cohesion: 0.08
Nodes (30): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 6: `wl autostart`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan (+22 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (16): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, InitTeamMode, registerSpec(), writeTemplate(), renderBrief() (+8 more)

### Community 50 - "OrcaClient"
Cohesion: 0.07
Nodes (4): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, 3. 调度员主循环, OrcaClient, WorkerView

### Community 51 - "tui/render.ts"
Cohesion: 0.20
Nodes (19): eventLine(), filterText(), Row, body(), footer(), HELP, MIN_COLS, renderView() (+11 more)

### Community 52 - ".bumpEpoch"
Cohesion: 0.25
Nodes (5): 9.1 P1：有稳定本地键, 9.2 P2：以 id 为键（没有稳定本地实体）, 9.3 各调用用哪种, 9.4 派发与 `epoch`, 9. 编排写调用的幂等账本

### Community 53 - "wl"
Cohesion: 0.13
Nodes (16): npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发）, 安装, 3C 真机验证（续）：真实 agent、多个团队共用一个 worktree（2026-10-22，macOS，Orca 1.4.237，claude 2.1.308，codex-cli 0.163.0）, 3D-1 真机验证：`wl autostart`（2026-10-24，macOS，Orca 1.4.237，node v24.18.0）, 3D-2 远端环境真机验证（2026-10-24，macOS，Orca 1.4.237，Lima VM `agent` 里的 claude 2.1.301）, A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复） (+8 more)

### Community 54 - "server-fixture.ts"
Cohesion: 0.28
Nodes (3): seen, FixtureConsole, startFixtureConsole()

### Community 55 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.25
Nodes (7): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 56 - "autostart/index.ts"
Cohesion: 0.15
Nodes (18): Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, Exec, FsLike, Sleep, autostartInstall() (+10 more)

### Community 57 - "reduce.ts"
Cohesion: 0.13
Nodes (25): LineInput, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey() (+17 more)

### Community 58 - "auditedCommands"
Cohesion: 0.11
Nodes (19): 10. 测试, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+11 more)

### Community 59 - "package.json"
Cohesion: 0.09
Nodes (23): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, engines, node (+15 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.28
Nodes (10): about(), autostartItem(), consoleItems(), dirBytes(), orcaPathItem(), orcaVersion(), cmp(), inRange() (+2 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "如何在真机上跑 session-id 和 resume-after-restart"
Cohesion: 0.29
Nodes (7): 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 3. 跑 resume-after-restart, 4. 收尾, 5. 交给 Claude Code 执行, 如何在真机上跑 session-id 和 resume-after-restart

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.22
Nodes (18): ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState, DraftDialog() (+10 more)

### Community 65 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "draft.ts"
Cohesion: 0.09
Nodes (30): applyDraftBeforeUp(), HandlerContext, PARAM_RULES, RouteEntry, statusOf(), applyDraft(), checkSaveConflict(), discardDraft() (+22 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "cellWidth"
Cohesion: 0.18
Nodes (13): Task 7: TUI 基础：宽度、屏幕、按键、输入框, 13. 风险, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+5 more)

### Community 70 - "apply.ts"
Cohesion: 0.16
Nodes (13): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+5 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.08
Nodes (22): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.6 岗位终端按钮（2026-11-07） (+14 more)

### Community 72 - "command.test.ts"
Cohesion: 0.18
Nodes (3): In, ioOf(), Out

### Community 73 - "autostart/plan.ts"
Cohesion: 0.16
Nodes (16): AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), plist(), Step, SYSTEM_DIRS (+8 more)

### Community 74 - "Settings.tsx"
Cohesion: 0.19
Nodes (11): AboutAutostart, AboutItem, api, ApiState, AutostartBody(), AutostartCard(), DISPATCHER, LABEL (+3 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.27
Nodes (3): Strengths, cursorFrom(), TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.11
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 77 - "TuiSession"
Cohesion: 0.22
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "TaskDetail.tsx"
Cohesion: 0.12
Nodes (41): Task 10: 总览与时间线页, Task 11: 收件箱与岗位详情页, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, AttentionReport, StaleItem, ActionDialog(), CommandHint(), Pill() (+33 more)

### Community 80 - "client.ts"
Cohesion: 0.11
Nodes (16): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+8 more)

### Community 81 - "screenGuard"
Cohesion: 0.09
Nodes (33): Global Constraints, Review Focus, Task 15：契约测试——真实回执入库并钉住解析, Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 自检记录, 雁阵阶段 2A（任务工作流）实现计划 (+25 more)

### Community 82 - "File Structure"
Cohesion: 0.17
Nodes (13): File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾 (+5 more)

### Community 83 - "items.ts"
Cohesion: 0.31
Nodes (15): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+7 more)

### Community 84 - "api-read.ts"
Cohesion: 0.09
Nodes (34): Task 10: 时间线 `wl log` 与 CLI 接入, File Structure, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 3: 登录、会话与请求校验, Task 7: SSE (+26 more)

### Community 85 - "signals.review.test.ts"
Cohesion: 0.22
Nodes (10): NUDGE_GRACE_MS, BUDGET, iso(), NOW, quietC(), row(), snap(), SPEC (+2 more)

### Community 86 - "resumeCommand"
Cohesion: 0.14
Nodes (13): Global Constraints, Review Focus, Task 3: `OrcaClient.search`, Task 5: `resumeCommand`, Task 6: 确定会话 ID, 阶段 3A：重启恢复与审计时间线 Implementation Plan, Global Constraints, 2. 关键事实（实测） (+5 more)

### Community 87 - "caller-scope-probe.ts"
Cohesion: 1.00
Nodes (3): main(), sleep(), waitFile()

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.18
Nodes (12): 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包, 7.7 命令, 7.8 错误处理 (+4 more)

### Community 91 - "call-log.ts"
Cohesion: 0.11
Nodes (17): Task 5：阶段 0 探针、报告与真实回执, Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs() (+9 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务"
Cohesion: 0.29
Nodes (12): 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), keepOrReclaim(), newRunKey(), newRunStep() (+4 more)

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
Cohesion: 0.14
Nodes (16): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包 (+8 more)

### Community 98 - "run"
Cohesion: 0.17
Nodes (12): realAutostartSys, registerAutostartCommands(), run(), execute(), renderReady(), errorDoc, quoteWord(), renderAutostartInstall() (+4 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.11
Nodes (10): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, assert, MockHost (+2 more)

### Community 102 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

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

### Community 107 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (18): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 功能, 发布, 在 Orca 终端里跑 `wl up` (+10 more)

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
Cohesion: 0.10
Nodes (28): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerDispatcherCommands() (+20 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.23
Nodes (21): coreAuditTable(), auditedInit(), claimTask(), createDeps(), doneTask(), freezePost(), inboxDto, openPostTerminal() (+13 more)

### Community 116 - "registerBaseCommands"
Cohesion: 0.19
Nodes (14): Task 2: `wl init` CLI 命令, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown(), renderInit() (+6 more)

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

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.22
Nodes (10): 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台） (+2 more)

### Community 131 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.15
Nodes (13): 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`） (+5 more)

### Community 132 - "screen-signals.test.ts"
Cohesion: 0.18
Nodes (9): CONTEXT_RENOTIFY_MS, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL, ROOT (+1 more)

### Community 133 - "core/src/audit-table.ts"
Cohesion: 0.13
Nodes (12): AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf(), AnyCommand, CORE_AUDIT (+4 more)

### Community 135 - "status.ts"
Cohesion: 0.47
Nodes (5): AutostartPlan, autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 136 - "6. 注册表扩展"
Cohesion: 0.24
Nodes (4): 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 138 - "用例"
Cohesion: 0.17
Nodes (12): Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审, 用例三：自领任务, 用例二：转人工决策, 用例四：无人值守 (+4 more)

### Community 139 - "WinglineError"
Cohesion: 0.05
Nodes (52): Task 10：`ps` 与 `send`, Task 11：`down`, 自检记录, CommandDeps, nextRequestId(), preflight(), Step, WAIT_SUBMIT_SEC (+44 more)

### Community 140 - "output.test.ts"
Cohesion: 0.38
Nodes (6): Task 3: `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at()

### Community 142 - ".withTeamLock"
Cohesion: 0.28
Nodes (5): 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, holdLock(), fakeRunning()

### Community 143 - "signals.test.ts"
Cohesion: 0.25
Nodes (8): Verdict, iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 144 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 146 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 150 - "contract-capture.ts"
Cohesion: 0.60
Nodes (4): main(), orcaVersion(), Receipt, sanitize()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 990 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `attention.ts`, `api-write.ts`, `FakeOrca`, `escalate.ts`, `core/src/audit-table.ts`, `loop.ts`, `done.ts`, `ref_node_fs`, `screen-signals.test.ts`, `findSession`, `dispatch.ts`, `spec.ts`, `client.ts`, `query.ts`, `signals.ts`, `.withTeamLock`, `signals.test.ts`, `lib.ts`, `advance.ts`, `posts.ts`, `contract-capture.ts`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `dispatcher/inbox.ts`, `markerHighlighted`, `File Structure`, `init.ts`, `autostart/index.ts`, `about.ts`, `main.test.ts`, `draft.ts`, `apply.ts`, `autostart/plan.ts`, `.now`, `client.ts`, `screenGuard`, `api-read.ts`, `resumeCommand`, `caller-scope-probe.ts`, `7. 首期详细设计：阶段 1（MVP）`, `call-log.ts`, `文件结构`, `static.ts`, `cli.ts`, `registerBaseCommands`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `attention.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08739495798319327 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_fs` to `attention.ts`, `api-write.ts`, `FakeOrca`, `screen-signals.test.ts`, `escalate.ts`, `done.ts`, `pages.test.tsx`, `WinglineError`, `output.test.ts`, `dispatch.ts`, `query.ts`, `signals.test.ts`, `client.ts`, `spec.ts`, `ledger.ts`, `server/index.ts`, `Screen`, `orca-sync.ts`, `patterns.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `app.tsx`, `File Structure`, `autostart/index.ts`, `package.json`, `about.ts`, `main.test.ts`, `draft.ts`, `cellWidth`, `apply.ts`, `autostart/plan.ts`, `signals.review.test.ts`, `call-log.ts`, `文件结构`, `run`, `static.ts`, `autostart/plan.test.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06397016637980493 - nodes in this community are weakly interconnected._