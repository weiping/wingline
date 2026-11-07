# Graph Report - wingline  (2026-11-06)

## Corpus Check
- 371 files · ~325,444 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3271 nodes · 10678 edges · 130 communities (119 shown, 11 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1729 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d74d5d56`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- errors.ts
- WinglineError
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
- spec.ts
- createOrcaClient
- query.ts
- signals.ts
- cli.ts
- Edit.tsx
- TaskDetail.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- dispatcher/inbox.ts
- api-write.test.ts
- ledger.ts
- server/index.ts
- unread.ts
- edit.ts
- app.ts
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- screenGuard
- resolveOrcaExecutable
- load.ts
- console.ts
- app.test.ts
- taskPreflight
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- Overview.tsx
- plan-change.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- lifecycle.ts
- gates
- CommandDeps
- server-fixture.ts
- bypassed
- reduce.ts
- auditedCommands
- package.json
- cli/package.json
- about.ts
- main.test.ts
- core/package.json
- TeamActions.tsx
- 用例
- with
- ref_node_fs
- 雁阵 Wingline 设计总纲
- cellWidth
- wl
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/index.ts
- client.ts
- orca-sync.test.ts
- web/package.json
- TuiSession
- Inbox.tsx
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- Settings.tsx
- deps.ts
- fake-client.ts
- items.ts
- api-read.ts
- File Structure
- signals.review.test.ts
- ledger.ts
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- File Structure
- compilerOptions
- panel.tsx
- compilerOptions
- run.ts
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
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
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- TuiInput
- core/tsconfig.json
- 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总
- 雁阵岗位
- .withTeamLock
- PatrolStateRow
- pnpm-workspace.yaml
- 7. `wl tui`
- fake-orca.mjs
- signals.test.ts
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- api-spec.ts
- protocol.ts
- TestWorker
- Wingline
- PluginBridgeApi

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 155 edges
3. `vitest` - 130 edges
4. `Registry` - 125 edges
5. `seedRunningTeam()` - 96 edges
6. `loadTeamSpec()` - 90 edges
7. `CommandDeps` - 87 edges
8. `up()` - 68 edges
9. `OrcaClient` - 51 edges
10. `Commands` - 46 edges

## Surprising Connections (you probably didn't know these)
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
- `Task 7: TUI 基础：宽度、屏幕、按键、输入框` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/plans/2026-10-16-phase-3c-editor-sync-tui.md → packages/cli/src/tui/width.ts
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `10. 测试` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3b-console-design.md → packages/core/src/audit.ts
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3b-console-design.md → packages/core/src/audit.ts

## Import Cycles
- None detected.

## Communities (130 total, 11 thin omitted)

### Community 0 - "errors.ts"
Cohesion: 0.08
Nodes (28): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 2: 规格的校验、写回、预演与草稿（core）, BRIEFING_LIMIT, renderBriefing(), canonical(), contentHash(), sha256() (+20 more)

### Community 1 - "WinglineError"
Cohesion: 0.07
Nodes (65): Task 12：CLI 包, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, Task 7: 任务执行流写接口, Task 8: 新建团队与自动恢复写接口, 7.2 组件 (+57 more)

### Community 2 - "FakeOrca"
Cohesion: 0.05
Nodes (37): harness(), SPEC_FOOTER, CheckMessage, CheckResult, chk(), seededDispatched(), asked(), ctxOf() (+29 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (3): Registry, verdictRow(), addAuditor()

### Community 4 - "escalate.ts"
Cohesion: 0.11
Nodes (44): Task 14：CLI 接入——`wl task <sub>`, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, PatrolOps, actorInTeam(), reassignTask(), teamOfAddress(), afterCreateError() (+36 more)

### Community 5 - "loadTeamSpec"
Cohesion: 0.10
Nodes (43): PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS, CHECK_WAIT_MS (+35 more)

### Community 6 - "done.ts"
Cohesion: 0.08
Nodes (48): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 6.1 开关, 6.3 worktree 汇总, 6.4 写入, 6.5 `wl attention` 的 `warnings`, 6. 同步到 Orca 原生界面（调度员）, syncAfterChange() (+40 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.05
Nodes (22): cleanups, MemOut, MIGRATIONS, world(), hit(), restarted(), repoRoot, CASES (+14 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.07
Nodes (32): Task 9: 前端工程与基础设施, api, ApiError, call(), csrfToken(), Envelope, ErrorBody, resetApiForTests() (+24 more)

### Community 9 - "src/index.ts"
Cohesion: 0.05
Nodes (59): Task 1: 探针 3 与 6（真机，人执行）, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, WorkspaceStatus, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree } (+51 more)

### Community 10 - "up.ts"
Cohesion: 0.13
Nodes (37): Task 10：`ps` 与 `send`, File Structure, Task 3: `OrcaClient.search`, Task 4: 抽出拉起逻辑并写入会话标记, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起, 1. 应在实现前修改, checkBriefingLimit() (+29 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.23
Nodes (16): aliveHandle(), announce(), busyIn(), busyWith(), confirmReplay(), Dispatched, dispatchedElsewhere(), dispatchKey() (+8 more)

### Community 12 - "spec.ts"
Cohesion: 0.13
Nodes (33): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 7: TUI 基础：宽度、屏幕、按键、输入框, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`） (+25 more)

### Community 13 - "createOrcaClient"
Cohesion: 0.12
Nodes (15): createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaRunner, RunOptions, r6, fixture(), ROOT, clientWith() (+7 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (38): Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, 6.1 约定, gateBody(), blockedWaiting(), callUncertain(), commandOfKey(), deadAssignee(), DEFAULT_STALE (+30 more)

### Community 15 - "signals.ts"
Cohesion: 0.21
Nodes (19): Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder, localHistory() (+11 more)

### Community 16 - "cli.ts"
Cohesion: 0.05
Nodes (89): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, Task 10: 时间线 `wl log` 与 CLI 接入, 7.1 `wl restore --all`, AsJson, collect(), DepsOverrides, Execute, exitCodeOfDone() (+81 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.09
Nodes (40): SpecPlan, errorText(), DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs() (+32 more)

### Community 18 - "TaskDetail.tsx"
Cohesion: 0.16
Nodes (33): notReady(), Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), Link() (+25 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.22
Nodes (20): advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, CONTEXT_RENOTIFY_MS, ContextSig, Ctx, detailOf(), dueAt() (+12 more)

### Community 20 - "advance.ts"
Cohesion: 0.19
Nodes (27): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+19 more)

### Community 21 - "posts.ts"
Cohesion: 0.12
Nodes (25): Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, FRESH_REFUSE, Landing (+17 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (38): Task 1: Codex 会话探针, Task 5: `resumeCommand`, 7.4 团队规格（首期子集）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15） (+30 more)

### Community 23 - "dispatcher/inbox.ts"
Cohesion: 0.07
Nodes (48): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Global Constraints, Review Focus, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, 自检记录, 雁阵阶段 2B（调度员与巡查熔断）实现计划, Env (+40 more)

### Community 24 - "api-write.test.ts"
Cohesion: 0.12
Nodes (29): Task 4: spec / about 接口、写命令表改造、`wl up --draft`, CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry (+21 more)

### Community 25 - "ledger.ts"
Cohesion: 0.13
Nodes (19): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, 6. 修订后的针对性复审（复审五，2026-10-15）, adoptReceipt(), ledgered(), oneShot(), refreshCoordinator(), storedRow() (+11 more)

### Community 26 - "server/index.ts"
Cohesion: 0.08
Nodes (34): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, File Structure, Global Constraints, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾 (+26 more)

### Community 27 - "unread.ts"
Cohesion: 0.29
Nodes (10): attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS (+2 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "app.ts"
Cohesion: 0.12
Nodes (18): emptyAttention(), runTui(), RunTuiOptions, SIGNALS, WriteFn, TuiCmdArgs, at(), Screen (+10 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.10
Nodes (17): Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 10. 测试, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D）, 1. 目标与成功标准 (+9 more)

### Community 31 - "self.ts"
Cohesion: 0.09
Nodes (29): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+21 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.11
Nodes (32): commentLimit(), composeGroup(), Ctx, currentTask(), cut(), flat(), groupByWorktree(), inReview() (+24 more)

### Community 33 - "patterns.ts"
Cohesion: 0.10
Nodes (26): Task 2: 模式表与 `detectScreen`, 13. 风险, AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW, contextLow(), detectScreen(), hashOf() (+18 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.12
Nodes (28): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Task 8: TUI 应用与 `wl tui`, Critical, Issues, Minor, TuiReader (+20 more)

### Community 35 - "screenGuard"
Cohesion: 0.08
Nodes (44): Global Constraints, Review Focus, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 自检记录, 雁阵阶段 2A（任务工作流）实现计划, 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, Task 1: 转述的 worker 原话中和 shell 元字符, Global Constraints (+36 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.19
Nodes (16): Task 7：注册表, 2. 命令, 15.1 踩坑：本机 Orca 1.4.250 安装缺 `orca.d.ts`, 15.2 其他坑, 15. P0 现状（2026-11-06 已落地）, defaultMakeDeps(), which(), direct() (+8 more)

### Community 37 - "load.ts"
Cohesion: 0.09
Nodes (24): Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Links (+16 more)

### Community 38 - "console.ts"
Cohesion: 0.17
Nodes (23): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+15 more)

### Community 39 - "app.test.ts"
Cohesion: 0.11
Nodes (16): initialTuiState(), TuiData, address(), FakeStdin, FAST, MemOut, on(), withQuestion (+8 more)

### Community 40 - "taskPreflight"
Cohesion: 0.11
Nodes (34): Task 10：派发与通知、`create`、`plan`, Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 15：契约测试——真实回执入库并钉住解析, Task 16：端到端流程测试, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态 (+26 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (28): 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄 (+20 more)

### Community 42 - "find-session.ts"
Cohesion: 0.10
Nodes (28): Task 2: 注册表迁移与读写, Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+20 more)

### Community 43 - "app.tsx"
Cohesion: 0.16
Nodes (24): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout() (+16 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.11
Nodes (19): 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+11 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.15
Nodes (28): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, SpecEditOp, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs (+20 more)

### Community 46 - "Overview.tsx"
Cohesion: 0.12
Nodes (23): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, Task 11: 前端总览页与收件箱的生命周期按钮, TimelineEvent, PsRow, PostDetail, Pill(), PostCard() (+15 more)

### Community 47 - "plan-change.ts"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.11
Nodes (24): 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 实施记录（2026-10-25 回填） (+16 more)

### Community 49 - "init.ts"
Cohesion: 0.15
Nodes (24): Global Constraints, Review Focus, Task 1: 团队模板与 `initTeamCmd`, Task 2: `wl init` CLI 命令, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, initFromImport(), initFromTemplate() (+16 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.20
Nodes (19): eventLine(), filterText(), Row, body(), footer(), header(), HELP, MIN_COLS (+11 more)

### Community 52 - "lifecycle.ts"
Cohesion: 0.17
Nodes (19): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, addressOf(), clearDeadLock(), confirmStarted(), DISPATCHER_ACTIONS, dispatcherDown(), dispatcherHealth, dispatcherLaunchCommand() (+11 more)

### Community 53 - "gates"
Cohesion: 0.12
Nodes (17): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 发布, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用 (+9 more)

### Community 54 - "CommandDeps"
Cohesion: 0.19
Nodes (14): CommandDeps, Ctx, Actor, actorOf(), requireActor(), resolveActor(), ActorSource, AuditRow (+6 more)

### Community 55 - "server-fixture.ts"
Cohesion: 0.20
Nodes (4): ConsoleServer, seen, FixtureConsole, startFixtureConsole()

### Community 56 - "bypassed"
Cohesion: 0.13
Nodes (15): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 6.1 状态与推进, 6.2 动作 (+7 more)

### Community 57 - "reduce.ts"
Cohesion: 0.14
Nodes (22): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey() (+14 more)

### Community 58 - "auditedCommands"
Cohesion: 0.10
Nodes (19): 10. 测试, 11. 不做的事（阶段 3B）, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open` (+11 more)

### Community 59 - "package.json"
Cohesion: 0.09
Nodes (23): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, engines, node (+15 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.21
Nodes (13): about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes(), orcaPathItem() (+5 more)

### Community 62 - "main.test.ts"
Cohesion: 0.07
Nodes (25): AUDIT, callLogOptions(), installWarningFilter(), isReadOnlyCall(), allDeps(), autostartWorld(), cmds(), exec() (+17 more)

### Community 63 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 64 - "TeamActions.tsx"
Cohesion: 0.20
Nodes (21): ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState, DraftDialog() (+13 more)

### Community 65 - "用例"
Cohesion: 0.18
Nodes (11): Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审, 用例三：自领任务, 用例二：转人工决策, 用例四：无人值守 (+3 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "ref_node_fs"
Cohesion: 0.15
Nodes (17): applyDraftBeforeUp(), applyDraft(), checkSaveConflict(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget() (+9 more)

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "cellWidth"
Cohesion: 0.18
Nodes (11): LineInput, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+3 more)

### Community 70 - "wl"
Cohesion: 0.17
Nodes (13): npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发）, 安装, 3C 真机验证（续）：真实 agent、多个团队共用一个 worktree（2026-10-22，macOS，Orca 1.4.237，claude 2.1.308，codex-cli 0.163.0）, 3D-1 真机验证：`wl autostart`（2026-10-24，macOS，Orca 1.4.237，node v24.18.0）, A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）, B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher） (+5 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (17): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.2 非目标, 2.3 反目标 (+9 more)

### Community 72 - "command.test.ts"
Cohesion: 0.10
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/index.ts"
Cohesion: 0.06
Nodes (54): Task 6: `wl autostart`, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, applyAutostart(), Exec, failure() (+46 more)

### Community 74 - "client.ts"
Cohesion: 0.11
Nodes (18): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+10 more)

### Community 75 - "orca-sync.test.ts"
Cohesion: 0.17
Nodes (11): SIGNAL_LABEL, addTeam(), builder, busyDuo(), busyTrio(), hold(), reviewTasks, snapOf() (+3 more)

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 77 - "TuiSession"
Cohesion: 0.24
Nodes (3): failure(), summaryOf(), TuiSession

### Community 78 - "Inbox.tsx"
Cohesion: 0.32
Nodes (16): ActionDialog(), postOf(), Section(), STALE_REASON, DispatcherNotice(), Empty(), FrozenCard(), GatesCard() (+8 more)

### Community 79 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.15
Nodes (5): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 80 - "Settings.tsx"
Cohesion: 0.19
Nodes (14): Task 13: 前端任务详情页代岗位执行与关于页自动恢复, CommandHint(), KIND, show(), SpecPreview(), AutostartBody(), AutostartCard(), DISPATCHER (+6 more)

### Community 81 - "deps.ts"
Cohesion: 0.15
Nodes (16): 自检记录, 2.1 `wl dispatcher up`, 3.3.4 未启动团队与 Orca 不可达时的降级, nextRequestId(), preflight(), WAIT_SUBMIT_SEC, closePost(), DownOutcome (+8 more)

### Community 82 - "fake-client.ts"
Cohesion: 0.13
Nodes (14): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, RunSummary, SendResult, seeded(), Args, Executed, FakeTask, Fault (+6 more)

### Community 83 - "items.ts"
Cohesion: 0.30
Nodes (16): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+8 more)

### Community 84 - "api-read.ts"
Cohesion: 0.09
Nodes (38): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 3: 登录、会话与请求校验, Task 5: 路由器与读接口 (+30 more)

### Community 85 - "File Structure"
Cohesion: 0.10
Nodes (20): File Structure, Task 1: 样本与重置时间解析, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, Task 7: 展示, Task 8: 文档与真机核对, 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补） (+12 more)

### Community 86 - "signals.review.test.ts"
Cohesion: 0.18
Nodes (12): LADDERS, NUDGE_GRACE_MS, Verdict, BUDGET, iso(), NOW, quietC(), row() (+4 more)

### Community 87 - "ledger.ts"
Cohesion: 0.26
Nodes (18): Task 3: 不确定错误带上 `detail.retryRequest`, attempt(), Ctx, DEFAULT_HINT(), hintFor(), indeterminate(), LedgerCall, markUncertain() (+10 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.11
Nodes (17): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+9 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.18
Nodes (12): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令, 7.8 错误处理 (+4 more)

### Community 91 - "call-log.ts"
Cohesion: 0.13
Nodes (15): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+7 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "File Structure"
Cohesion: 0.09
Nodes (27): File Structure, Global Constraints, Review Focus, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾, 阶段 2/3 复审修复 Implementation Plan (+19 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.12
Nodes (6): error, loading, refresh(), setup(), teams, plugin

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "run.ts"
Cohesion: 0.13
Nodes (18): Global Constraints, Review Focus, Task 11：`down`, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验 (+10 more)

### Community 98 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.15
Nodes (15): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 10. 错误处理, 11. 测试, 12. 不做的事（阶段 3C）, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 1） (+7 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.15
Nodes (6): teamSummaries(), activate(), shared(), orca/worker, OrcaWorkerApi, register()

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
Cohesion: 0.24
Nodes (12): Task 4: 静态资源与安全响应头, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty() (+4 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "gates"
Cohesion: 0.18
Nodes (12): 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台） (+4 more)

### Community 110 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.11
Nodes (18): 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals）, 1. 背景、意图与成功标准, 2. 方案对比与选型（Approaches）, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`） (+10 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总"
Cohesion: 0.29
Nodes (6): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - ".withTeamLock"
Cohesion: 0.60
Nodes (3): 2.2 调度员是否在跑, holdLock(), fakeRunning()

### Community 116 - "PatrolStateRow"
Cohesion: 0.24
Nodes (9): Review Focus, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, 4.4 `context_low` 的处理, 4.5 展示, 4. 读画面的巡查信号（块 c，探针 1、2 之后）, hhmm(), resetClock(), signalSummary() (+1 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 119 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 120 - "signals.test.ts"
Cohesion: 0.29
Nodes (7): iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 125 - "api-spec.ts"
Cohesion: 0.67
Nodes (5): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes()

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 963 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `errors.ts`, `FakeOrca`, `Registry`, `escalate.ts`, `loadTeamSpec`, `done.ts`, `ref_node_fs`, `src/index.ts`, `up.ts`, `dispatch.ts`, `spec.ts`, `createOrcaClient`, `query.ts`, `signals.ts`, `cli.ts`, `advance.ts`, `posts.ts`, `dispatcher/inbox.ts`, `api-write.test.ts`, `ledger.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `app.ts`, `雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `screenGuard`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `taskPreflight`, `find-session.ts`, `restore/index.ts`, `init.ts`, `lifecycle.ts`, `CommandDeps`, `about.ts`, `main.test.ts`, `ref_node_fs`, `command.test.ts`, `autostart/index.ts`, `client.ts`, `orca-sync.test.ts`, `deps.ts`, `fake-client.ts`, `api-read.ts`, `File Structure`, `ledger.ts`, `7. 首期详细设计：阶段 1（MVP）`, `run.ts`, `static.ts`, `signals.test.ts`, `api-spec.ts`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `errors.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08176100628930817 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_fs` to `errors.ts`, `WinglineError`, `FakeOrca`, `escalate.ts`, `loadTeamSpec`, `pages.test.tsx`, `spec.ts`, `createOrcaClient`, `query.ts`, `cli.ts`, `api-write.test.ts`, `ledger.ts`, `server/index.ts`, `雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计`, `self.ts`, `patterns.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `restore/index.ts`, `lifecycle.ts`, `CommandDeps`, `package.json`, `about.ts`, `main.test.ts`, `ref_node_fs`, `cellWidth`, `command.test.ts`, `autostart/index.ts`, `orca-sync.test.ts`, `deps.ts`, `fake-client.ts`, `api-read.ts`, `File Structure`, `signals.review.test.ts`, `call-log.ts`, `static.ts`, `雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计`, `signals.test.ts`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `WinglineError` be split into smaller, more focused modules?**
  _Cohesion score 0.07237871674491393 - nodes in this community are weakly interconnected._