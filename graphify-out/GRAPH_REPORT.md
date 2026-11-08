# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 378 files · ~334,065 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3382 nodes · 10990 edges · 146 communities (133 shown, 13 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1743 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5269b5d9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 自检记录
- api-write.ts
- vitest
- Registry
- WinglineError
- loop.ts
- done.ts
- ref_node_fs
- pages.test.tsx
- lib.ts
- cli.ts
- dispatch.ts
- spec.ts
- client.ts
- query.ts
- signals.ts
- AttentionReport
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- CommandDeps
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
- 15. P0 现状（2026-11-06 已落地）
- loadTeamSpec
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- fake-client.ts
- posts.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- create.ts
- createConsoleServer
- plan
- apply.ts
- reduce.ts
- auditedCommands
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
- cellWidth
- seedRunningTeam
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/plan.ts
- resolveOrcaExecutable
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- attention
- dispatcher/inbox.ts
- TaskDetail.tsx
- Wingline 雁阵
- items.ts
- api-read.test.ts
- signals.test.ts
- resumeCommand
- 用例
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
- spec.ts
- orca-worker.d.ts
- compilerOptions
- panel.test.tsx
- 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- wl
- eventRow
- Review Focus
- gates
- TuiInput
- core/tsconfig.json
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- NewTeamDialog.tsx
- 阶段 3D spec 与 plan 复审（第三轮）
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- orca-sync.test.ts
- protocol.ts
- TestPanel
- Wingline
- gates
- Panel
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- ref_node_url
- `wl console` 与 Orca 插件：功能对齐表
- attention.ts
- lifecycle.test.ts
- server-fixture.ts
- File Structure
- autostart/plan.test.ts
- audit.ts
- TestWorker
- 6. 审计事件
- .withTeamLock
- panel.check.ts
- 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan
- 7. `wl log`

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

## Communities (146 total, 13 thin omitted)

### Community 0 - "自检记录"
Cohesion: 0.07
Nodes (36): Global Constraints, Review Focus, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, 文件结构, 自检记录, 雁阵阶段 2B（调度员与巡查熔断）实现计划 (+28 more)

### Community 1 - "api-write.ts"
Cohesion: 0.10
Nodes (47): Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, Task 7: 任务执行流写接口, 11. 不做的事（阶段 3B）, 12. 不做的事（阶段 3C） (+39 more)

### Community 2 - "vitest"
Cohesion: 0.08
Nodes (12): P, hit(), restarted(), invalid, POSIX, WIN, rt(), unreachable() (+4 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (4): Task 4: 未读标记（调度员）, Registry, verdictRow(), addAuditor()

### Community 4 - "WinglineError"
Cohesion: 0.07
Nodes (48): Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, 2.1 `wl dispatcher up`, 5.7 重跑安全, nextRequestId(), WAIT_SUBMIT_SEC, answerError() (+40 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (42): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS (+34 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (49): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 自检记录, announce(), Delivery, DispatchOutcome, awaitDelivered(), context() (+41 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.10
Nodes (17): MIGRATIONS, ActorSource, ExtColumn, PostStatus, Row, SCREEN_SIGNAL_KINDS, TaskAction, T0 (+9 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.06
Nodes (42): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, PsRow, api, ApiError, call(), csrfToken() (+34 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "cli.ts"
Cohesion: 0.08
Nodes (42): Task 10: 时间线 `wl log` 与 CLI 接入, Global Constraints, AsJson, collect(), DepsOverrides, Execute, exitCodeOfDone(), exitCodeOfUp() (+34 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.16
Nodes (24): Task 10：派发与通知、`create`、`plan`, 9.4 派发与 `epoch`, 6.4 写入, syncAfterChange(), aliveHandle(), bumpRound(), busyIn(), busyWith() (+16 more)

### Community 12 - "spec.ts"
Cohesion: 0.15
Nodes (29): File Structure, Task 1: 工作区状态探针, Task 2: 规格的校验、写回、预演与草稿（core）, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存） (+21 more)

### Community 13 - "client.ts"
Cohesion: 0.07
Nodes (31): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), gateAndViewMethods(), inboxMethods(), Mutation, ORCA_WORKTREE_SUPPORT, OrchestrationMethods, RawCheck (+23 more)

### Community 14 - "query.ts"
Cohesion: 0.07
Nodes (51): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 16：端到端流程测试, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 8: `restore()` 编排, 3.3.4 未启动团队与 Orca 不可达时的降级, staleSource() (+43 more)

### Community 15 - "signals.ts"
Cohesion: 0.15
Nodes (30): Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, File Structure, Task 4: 每轮读画面进 `previews`, Task 6: 画面信号的状态推进, Task 7: 展示, Task 8: 文档与真机核对, 6. 修订后的针对性复审（复审五，2026-10-15）, 4.3 `usage_limit` 的处理 (+22 more)

### Community 16 - "AttentionReport"
Cohesion: 0.18
Nodes (12): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 9: 前端工程与基础设施, 6.1 开关, 6.2 岗位状态 (+4 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (26): FormError, formHasField(), runSteps(), applyLocal(), Base, DraftBanner(), editInputs(), Editor() (+18 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.17
Nodes (25): notReady(), Page(), ErrorBox(), Loading(), ApiState, useApi(), STALE_REASON, Edit() (+17 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.23
Nodes (21): notifyHuman(), advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS, ContextSig, Ctx (+13 more)

### Community 20 - "advance.ts"
Cohesion: 0.19
Nodes (27): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+19 more)

### Community 21 - "CommandDeps"
Cohesion: 0.07
Nodes (65): Task 10：`ps` 与 `send`, Task 11：`down`, Task 12：CLI 包, 自检记录, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库 (+57 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (38): Task 1: Codex 会话探针, Task 5: `resumeCommand`, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id (+30 more)

### Community 23 - "output.ts"
Cohesion: 0.07
Nodes (44): registerDispatcherCommands(), Awaited2, closureLine(), dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat() (+36 more)

### Community 24 - "cachedOrca"
Cohesion: 0.19
Nodes (21): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Router, buildRouter(), ServerContext, cachedOrca (+13 more)

### Community 25 - "ledger.ts"
Cohesion: 0.12
Nodes (36): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, adoptReceipt(), attempt(), Ctx, DEFAULT_HINT(), hintFor() (+28 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (21): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+13 more)

### Community 27 - "unread.ts"
Cohesion: 0.33
Nodes (8): attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.10
Nodes (22): emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, TuiCmdArgs (+14 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.10
Nodes (23): Global Constraints, Review Focus, 雁阵阶段 2A（任务工作流）实现计划, Global Constraints, Review Focus, Task 6: Orca 同步, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, 14. 风险 (+15 more)

### Community 31 - "self.ts"
Cohesion: 0.09
Nodes (28): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+20 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.09
Nodes (38): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut() (+30 more)

### Community 33 - "patterns.ts"
Cohesion: 0.10
Nodes (29): Global Constraints, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, 与 spec 的差异（先读这一节）, 4.1 模式表, classifyPreview(), ScreenState, AUTO_ARMED (+21 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.14
Nodes (25): Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, currentCursor(), cursorOf(), EMPTY_CURSOR, followTimeline(), fromAudit() (+17 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.09
Nodes (19): 3. 全局约束补充, 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 2. 命令, 3. 调度员主循环 (+11 more)

### Community 36 - "15. P0 现状（2026-11-06 已落地）"
Cohesion: 0.33
Nodes (5): 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.6 岗位终端按钮（2026-11-07）, 15. P0 现状（2026-11-06 已落地）, coreAuditTable()

### Community 37 - "loadTeamSpec"
Cohesion: 0.06
Nodes (46): Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, BRIEFING_LIMIT, REVIVE_WINDOW_MS, canonical(), contentHash(), sha256(), specHash() (+38 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (24): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+16 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (16): LineInput, initialTuiState(), TuiState, address(), FakeStdin, FAST, MemOut, on() (+8 more)

### Community 40 - "FakeOrca"
Cohesion: 0.08
Nodes (13): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, CheckMessage (+5 more)

### Community 41 - "fresh"
Cohesion: 0.12
Nodes (21): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.2 接回时, 4.3 标记不外泄, 4.4 阶段 3 之前启动的岗位 (+13 more)

### Community 42 - "find-session.ts"
Cohesion: 0.19
Nodes (18): Global Constraints, Global Constraints, Task 2: `findSession` 按环境搜索, 11. 测试, 5.1 字段, 5.2 会话的确定顺序, 5.4 接回后的核对（2026-10-24 补充）, 5. 远端环境的会话恢复（块 d） (+10 more)

### Community 43 - "app.tsx"
Cohesion: 0.14
Nodes (29): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, clock(), SOURCE_LABEL (+21 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.11
Nodes (22): 10. 命令, 11. 错误处理, 12. 测试, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run (+14 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.16
Nodes (26): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase (+18 more)

### Community 46 - "fake-client.ts"
Cohesion: 0.07
Nodes (28): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, Global Constraints, Review Focus, 阶段 2/3 复审修复 Implementation Plan, CloseResult, OrchestrationTask, RequestShowState, RunSummary (+20 more)

### Community 47 - "posts.ts"
Cohesion: 0.15
Nodes (16): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+8 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.13
Nodes (21): File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 7.1 `wl restore --all`, 实施记录（2026-10-25 回填） (+13 more)

### Community 49 - "init.ts"
Cohesion: 0.19
Nodes (20): Task 1: 团队模板与 `initTeamCmd`, Task 2: `wl init` CLI 命令, renderInit(), initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode (+12 more)

### Community 50 - "OrcaClient"
Cohesion: 0.07
Nodes (3): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, OrcaClient

### Community 51 - "tui/render.ts"
Cohesion: 0.16
Nodes (22): eventLine(), filterText(), Row, footer(), header(), HELP, MIN_COLS, renderView() (+14 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (29): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+21 more)

### Community 53 - "create.ts"
Cohesion: 0.12
Nodes (32): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, actorInTeam(), assertReleasable(), claimTask(), fail(), teamOfAddress(), afterCreateError(), CreateArgs (+24 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.18
Nodes (11): Task 13: 端到端冒烟、CI 与文档, File Structure, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan (+3 more)

### Community 55 - "plan"
Cohesion: 0.20
Nodes (11): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7.4 往岗位终端打字之前的画面检查, 7. 身份、通知与画面检查, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals） (+3 more)

### Community 56 - "apply.ts"
Cohesion: 0.15
Nodes (15): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+7 more)

### Community 57 - "reduce.ts"
Cohesion: 0.20
Nodes (18): rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+10 more)

### Community 58 - "auditedCommands"
Cohesion: 0.07
Nodes (31): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, 10. 测试, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open` (+23 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.16
Nodes (16): about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes(), orcaPathItem() (+8 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (19): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+11 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.27
Nodes (16): errorText(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DispatcherState, DraftDialog(), parseSessions() (+8 more)

### Community 65 - "api-read.ts"
Cohesion: 0.26
Nodes (13): FrozenRow, buildPostDetail(), loadPostPreview(), offlinePosts(), PostDetail, registerLogRoute(), registerPostRoutes(), registerReadRoutes() (+5 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.12
Nodes (16): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+8 more)

### Community 69 - "cellWidth"
Cohesion: 0.21
Nodes (11): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+3 more)

### Community 70 - "seedRunningTeam"
Cohesion: 0.09
Nodes (22): harness(), chk(), seededDispatched(), checkerTask(), world(), screensWorld(), world(), seedRunningTeam() (+14 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.13
Nodes (14): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 3. 选定架构（已拍板）, 4. 包与仓库布局（建议） (+6 more)

### Community 72 - "command.test.ts"
Cohesion: 0.12
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/plan.ts"
Cohesion: 0.11
Nodes (31): Task 6: `wl autostart`, autostartInstall(), DEFAULT_WAIT_ORCA, planOf(), AutostartPlatform, execWord(), installedCommand(), pathEnv() (+23 more)

### Community 74 - "resolveOrcaExecutable"
Cohesion: 0.19
Nodes (11): Task 5：阶段 0 探针、报告与真实回执, direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd(), createOrcaRunner(), Entry (+3 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.19
Nodes (7): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, LogCursor, closeServer(), cursorFrom(), Subscriber, TeamFeeds, TeamLoop

### Community 76 - "web/package.json"
Cohesion: 0.13
Nodes (18): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+10 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.19
Nodes (17): Task 11: 前端总览页与收件箱的生命周期按钮, CommandHint(), Pill(), KIND, show(), SpecPreview(), DispatcherActions(), DispatcherCard() (+9 more)

### Community 79 - "attention"
Cohesion: 0.20
Nodes (17): Task 2: 缓存型 OrcaClient 与纯文本工具, Task 5: 路由器与读接口, Task 7: SSE, Task 8: TUI 应用与 `wl tui`, 1. 应在实现前修改, 6.2 写入, 6.1 约定, 6.2 读接口（GET） (+9 more)

### Community 80 - "dispatcher/inbox.ts"
Cohesion: 0.11
Nodes (28): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 1: 转述的 worker 原话中和 shell 元字符, askerOf(), BatchReport, checkWorkerDone(), Ctx, handleOne(), OPTION_LIMIT (+20 more)

### Community 81 - "TaskDetail.tsx"
Cohesion: 0.19
Nodes (28): ActionDialog(), postOf(), Section(), ActionButton(), DirectAction(), DispatcherNotice(), Empty(), FrozenCard() (+20 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (19): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 功能, 发布, 在 Orca 终端里跑 `wl up` (+11 more)

### Community 83 - "items.ts"
Cohesion: 0.31
Nodes (15): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+7 more)

### Community 84 - "api-read.test.ts"
Cohesion: 0.15
Nodes (17): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), WriteRouteSpec, Handler, HandlerContext (+9 more)

### Community 85 - "signals.test.ts"
Cohesion: 0.10
Nodes (23): 4.2 数据来源, 4.4 `context_low` 的处理, 4. 读画面的巡查信号（块 c，探针 1、2 之后）, NUDGE_GRACE_MS, TerminalSummary, PatrolStateRow, Verdict, BUDGET (+15 more)

### Community 86 - "resumeCommand"
Cohesion: 0.14
Nodes (13): 6.1 探针, 6.2 报告, 6.3 回执样本, 6. 首期详细设计：阶段 0（验证）, 2. 关键事实（实测）, 3. 待探针事项（plan 的 Task 0，由人在真机上执行）, resumeCommand(), 3D-2 探针 1（补充）与探针 4（2026-10-24，macOS，Orca 1.4.237，claude 2.1.x） (+5 more)

### Community 87 - "用例"
Cohesion: 0.12
Nodes (16): 7.2 按键, msg(), q(), Orca 界面上的状态, 控制台：`wl console`, 时间线：`wl log`, 用例, 用例一：实现 → 闸门 → 自动评审 (+8 more)

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
Cohesion: 0.17
Nodes (11): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+3 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务"
Cohesion: 0.11
Nodes (25): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, File Structure, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`） (+17 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (31): PostDto, PreviewDto, TaskDto, actor, busyTeam, detail, detailAddress, detailLoading (+23 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "文件结构"
Cohesion: 0.14
Nodes (17): Global Constraints, Review Focus, Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 7：注册表 (+9 more)

### Community 98 - "spec.ts"
Cohesion: 0.20
Nodes (21): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), SaveSpecArgs, SpecEditResult, SpecForEdit, writeDocs(), DOC_LIMIT_BYTES (+13 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "panel.test.tsx"
Cohesion: 0.15
Nodes (9): INBOX, POSTS, TASKS, TEAM, TEAM, assert, MockHost, MockHostOptions (+1 more)

### Community 102 - "阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan"
Cohesion: 0.17
Nodes (12): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, Review Focus, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, 一、plan 与 spec 脱节（阻塞，已处理）, 复审修订（2026-10-23，第二轮）, RestoreAllResult (+4 more)

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.33
Nodes (10): Task 4: 静态资源与安全响应头, applySecurityHeaders(), assertWebBuilt(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), sendFile() (+2 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "wl"
Cohesion: 0.10
Nodes (22): 12. 风险, 1. 目标与成功标准, 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, 2.1 目标 (+14 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "Review Focus"
Cohesion: 0.17
Nodes (16): Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, registerAutostartCommands() (+8 more)

### Community 110 - "gates"
Cohesion: 0.17
Nodes (13): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, 7.4 团队规格（首期子集）, 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿 (+5 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.17
Nodes (3): Task 13：`wl task escalate` / `resolve` / `recover`, Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 6. 注册表扩展

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.18
Nodes (27): signalSummary(), auditedInit(), claimTask(), createDeps(), doneTask(), freezePost(), inboxDto, openPostTerminal() (+19 more)

### Community 116 - "draft.ts"
Cohesion: 0.24
Nodes (14): applyDraftBeforeUp(), applyDraft(), checkSaveConflict(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget() (+6 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "NewTeamDialog.tsx"
Cohesion: 0.23
Nodes (14): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+6 more)

### Community 120 - "阶段 3D spec 与 plan 复审（第三轮）"
Cohesion: 0.29
Nodes (6): 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮）

### Community 125 - "orca-sync.test.ts"
Cohesion: 0.18
Nodes (9): SIGNAL_LABEL, builder, busyDuo(), busyTrio(), reviewTasks, snapOf(), task(), WA (+1 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.29
Nodes (10): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, Post, PostChange, same() (+2 more)

### Community 130 - "Panel"
Cohesion: 0.24
Nodes (10): InboxView(), loadInbox(), loadPosts(), loadTaskDetail(), loadTasks(), open(), Panel(), runWrite() (+2 more)

### Community 131 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.22
Nodes (8): 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3. 详细设计, 5. 留给实现者决定的细节（Left to the Builder）, 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗, 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由, 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "attention.ts"
Cohesion: 0.28
Nodes (8): dispatcherStatus, groupWarnings(), lastCommand(), specOf(), WARNING_ACTIONS, warningsOf(), unreadGaveUp(), TeamView

### Community 135 - "lifecycle.test.ts"
Cohesion: 0.22
Nodes (3): L, hold(), dispatcherRunning()

### Community 136 - "server-fixture.ts"
Cohesion: 0.28
Nodes (3): seen, FixtureConsole, startFixtureConsole()

### Community 137 - "File Structure"
Cohesion: 0.25
Nodes (6): File Structure, Review Focus, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan, 5.3 探针 4 的结论（2026-10-24）

### Community 138 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 139 - "audit.ts"
Cohesion: 0.14
Nodes (12): AuditCtx, AuditEntry, AuditOptions, AuditTable, clip(), Command, summaryOf(), AnyCommand (+4 more)

### Community 141 - "6. 审计事件"
Cohesion: 0.50
Nodes (4): 6.1 表, 6.3 参数摘要, 6.4 清理, 6. 审计事件

### Community 142 - ".withTeamLock"
Cohesion: 0.47
Nodes (4): Task 9：命令依赖、预检与 `up`, 2.2 调度员是否在跑, holdLock(), fakeRunning()

### Community 145 - "7. `wl log`"
Cohesion: 0.67
Nodes (3): 7.1 统一事件结构, 7.2 行为, 7. `wl log`

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1004 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `api-write.ts`, `vitest`, `Registry`, `loop.ts`, `attention.ts`, `done.ts`, `ref_node_fs`, `lifecycle.test.ts`, `cli.ts`, `audit.ts`, `spec.ts`, `dispatch.ts`, `query.ts`, `signals.ts`, `client.ts`, `lib.ts`, `advance.ts`, `CommandDeps`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `fake-client.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `create.ts`, `createConsoleServer`, `apply.ts`, `about.ts`, `main.test.ts`, `api-read.ts`, `seedRunningTeam`, `command.test.ts`, `autostart/plan.ts`, `resolveOrcaExecutable`, `attention`, `dispatcher/inbox.ts`, `api-read.test.ts`, `signals.test.ts`, `resumeCommand`, `7. 首期详细设计：阶段 1（MVP）`, `Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务`, `文件结构`, `spec.ts`, `static.ts`, `Review Focus`, `Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log``, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `自检记录` be split into smaller, more focused modules?**
  _Cohesion score 0.07051282051282051 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `自检记录`, `api-write.ts`, `WinglineError`, `loop.ts`, `done.ts`, `lifecycle.test.ts`, `ref_node_fs`, `pages.test.tsx`, `autostart/plan.test.ts`, `dispatch.ts`, `client.ts`, `query.ts`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `Screen`, `self.ts`, `patterns.ts`, `commands/log.ts`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `find-session.ts`, `fake-client.ts`, `restore/index.ts`, `init.ts`, `create.ts`, `apply.ts`, `package.json`, `about.ts`, `main.test.ts`, `api-read.ts`, `cellWidth`, `seedRunningTeam`, `command.test.ts`, `autostart/plan.ts`, `resolveOrcaExecutable`, `TeamFeeds`, `Inbox.tsx`, `dispatcher/inbox.ts`, `api-read.test.ts`, `signals.test.ts`, `resumeCommand`, `call-log.ts`, `文件结构`, `spec.ts`, `Review Focus`, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10286382232612508 - nodes in this community are weakly interconnected._