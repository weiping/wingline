# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 377 files · ~333,329 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3374 nodes · 10968 edges · 139 communities (130 shown, 9 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1743 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6442b8ed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- attention
- api-write.ts
- vitest
- Registry
- escalate.ts
- loop.ts
- done.ts
- ref_node_fs
- pages.test.tsx
- lib.ts
- .fail
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
- claude
- cli.ts
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
- 雁阵阶段 2B（调度员与巡查熔断）实现计划
- autostart/index.ts
- reduce.ts
- up
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
- up.test.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/plan.ts
- run.ts
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- ps
- client.ts
- outlets.ts
- Wingline 雁阵
- items.ts
- final-fixes.test.ts
- signals.review.test.ts
- 阶段 0 探针报告
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
- WinglineError
- doc.ts
- orca-worker.d.ts
- compilerOptions
- orca-testing.d.ts
- 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- wl
- eventRow
- facade.ts
- gates
- TuiInput
- core/tsconfig.json
- 7. `wl tui`
- 雁阵岗位
- host.ts
- signals.test.ts
- pnpm-workspace.yaml
- README.md
- advance.review.test.ts
- 阶段 3D spec 与 plan 复审（第三轮）
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- 3.4 前端界面与交互设计（`packages/web/src/`）
- protocol.ts
- opus-review.test.ts
- Wingline
- gates
- 在 Orca 里怎么用
- 如何在真机上跑 session-id 和 resume-after-restart
- screen-signals.test.ts
- `wl console` 与 Orca 插件：功能对齐表
- 5. 登录与安全
- Task 4: 未读标记（调度员）
- verdictRow
- CommandDeps
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
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `自检记录` --references--> `TypeOutcome`  [INFERRED]
  docs/superpowers/plans/2026-10-13-phase-2b-dispatcher-patrol.md → packages/core/src/commands/dispatcher/outlets.ts
- `Review Focus` --references--> `fresh()`  [INFERRED]
  docs/superpowers/plans/2026-10-24-phase-3d2d-remote-environment.md → packages/core/src/commands/dispatcher/screen-signals.ts

## Import Cycles
- None detected.

## Communities (139 total, 9 thin omitted)

### Community 0 - "attention"
Cohesion: 0.12
Nodes (29): Task 12：端到端集成测试, Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, 文件结构, 自检记录, Task 3: `wl attention` 的 `warnings`, Task 6: Orca 同步, Global Constraints (+21 more)

### Community 1 - "api-write.ts"
Cohesion: 0.17
Nodes (32): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, Task 7: 任务执行流写接口, 2. 次要项（实现时顺手处理）, 6.2 岗位状态, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`） (+24 more)

### Community 2 - "vitest"
Cohesion: 0.07
Nodes (22): cleanups, applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), modeOf(), realTarget(), SPEC_MAX_BYTES (+14 more)

### Community 3 - "Registry"
Cohesion: 0.04
Nodes (5): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, Task 3: 注册表迁移 `unread_marks`, registerTeam(), Registry, addAuditor()

### Community 4 - "escalate.ts"
Cohesion: 0.18
Nodes (30): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, actorInTeam(), assertReleasable(), claimTask(), fail() (+22 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (47): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, PatrolOps, handleOne(), processBatch(), sendReply(), HEARTBEAT_TAKEOVER_MS (+39 more)

### Community 6 - "done.ts"
Cohesion: 0.15
Nodes (31): Task 12：`wl task done`, taskSpec(), awaitDelivered(), context(), createChild(), Ctx, decide(), decideBypassed() (+23 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.10
Nodes (16): MIGRATIONS, ExtColumn, PostStatus, Row, SCREEN_SIGNAL_KINDS, Verdict, T0, team (+8 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (26): resetApiForTests(), TEAM_TEMPLATES_UI, StreamProvider(), agentInput(), clone(), loaded(), Opts, PARSED (+18 more)

### Community 9 - "lib.ts"
Cohesion: 0.05
Nodes (59): Task 1: 探针 3 与 6（真机，人执行）, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, WorkspaceStatus, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree } (+51 more)

### Community 10 - ".fail"
Cohesion: 0.15
Nodes (16): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, 11. 测试, 4.4 接口（3B 的约定与安全校验，写接口进审计）, checkLinks(), crossCheck(), environmentOf() (+8 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.12
Nodes (28): Task 10：派发与通知、`create`、`plan`, 自检记录, 9.4 派发与 `epoch`, aliveHandle(), announce(), bumpRound(), busyIn(), busyWith() (+20 more)

### Community 12 - "spec.ts"
Cohesion: 0.16
Nodes (30): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+22 more)

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (15): createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaRunner, RunOptions, r6, fixture(), ROOT, clientWith() (+7 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (43): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 8: `restore()` 编排, 5.2 信号, 6.5 `wl attention <team>`, staleSource(), blockedWaiting() (+35 more)

### Community 15 - "signals.ts"
Cohesion: 0.15
Nodes (27): Global Constraints, Task 4: 每轮读画面进 `previews`, Task 6: 画面信号的状态推进, 4.2 数据来源, 4.3 `usage_limit` 的处理, 4.4 `context_low` 的处理, 4. 读画面的巡查信号（块 c，探针 1、2 之后）, activeHits() (+19 more)

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
Cohesion: 0.19
Nodes (23): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, notifyHuman(), advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), ContextSig, Ctx (+15 more)

### Community 20 - "advance.ts"
Cohesion: 0.16
Nodes (31): Task 8：分级推进——`advancePatrol`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover() (+23 more)

### Community 21 - "up"
Cohesion: 0.16
Nodes (30): Task 10：`ps` 与 `send`, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, checkBriefingLimit(), postAddress(), requestId(), WAIT_SUBMIT_SEC (+22 more)

### Community 22 - "claude"
Cohesion: 0.18
Nodes (12): Task 1: Codex 会话探针, claude(), 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-19，macOS，Orca 1.4.227）, 3D-2（块 c）探针 2（部分）：从 claude 2.1.310 程序本体提取的提示原文（2026-10-24）, Linux headless 真机 resume-after-restart 补充验证（2026-10-13，Orca 1.4.222，由 Claude 代为执行）, 结论, 补充探针：`run-use` 接管 + `check`/`ack`（2026-10-13，紧接上面那轮，同一个 Run）, 补充探针二：幂等重试 / `dispatch --inject` / `gate-create` 对已终态任务 / `WINGLINE_POST` 兼容性 / `lastOutputAt`（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 复审阶段 2 文档后列出的未验证假设） (+4 more)

### Community 23 - "cli.ts"
Cohesion: 0.05
Nodes (89): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: `wl init` CLI 命令, AsJson, callLogOptions(), collect(), defaultMakeDeps(), DepsOverrides, Execute (+81 more)

### Community 24 - "cachedOrca"
Cohesion: 0.11
Nodes (31): assertExactFields(), CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry (+23 more)

### Community 25 - "ledger.ts"
Cohesion: 0.07
Nodes (57): Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 3: 不确定错误带上 `detail.retryRequest`, Task 7: Windows CI 偶发超时 (+49 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (19): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+11 more)

### Community 27 - "unread.ts"
Cohesion: 0.29
Nodes (10): attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS (+2 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.10
Nodes (21): Task 8: TUI 应用与 `wl tui`, emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn (+13 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.11
Nodes (17): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, 6.1 开关, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D）, 1. 目标与成功标准 (+9 more)

### Community 31 - "self.ts"
Cohesion: 0.07
Nodes (38): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+30 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.11
Nodes (33): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut() (+25 more)

### Community 33 - "patterns.ts"
Cohesion: 0.09
Nodes (34): Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, File Structure, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 3: `terminalRead` 与 FakeOrca 的画面模型, Task 7: 展示, Task 8: 文档与真机核对, 与 spec 的差异（先读这一节） (+26 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.11
Nodes (29): Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, TuiReader, currentCursor() (+21 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.13
Nodes (15): 10. 测试, 11. 不做的事（阶段 2B）, 12. 风险, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 6.1 状态与推进 (+7 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.26
Nodes (9): 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.6 岗位终端按钮（2026-11-07）, 15. P0 现状（2026-11-06 已落地）, direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable() (+1 more)

### Community 37 - "loadTeamSpec"
Cohesion: 0.05
Nodes (48): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Global Constraints, Task 2: 规格的校验、写回、预演与草稿（core）, BRIEFING_LIMIT, renderBriefing(), SIGNAL_LABEL, canonical() (+40 more)

### Community 38 - "console.ts"
Cohesion: 0.13
Nodes (27): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, 4. 建议的下一步, 5. 修订后的针对性复核（2026-10-16）, 阶段 3（3A–3D）spec 与计划复审, ConsoleArgs (+19 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (16): LineInput, initialTuiState(), TuiState, address(), FakeStdin, FAST, MemOut, on() (+8 more)

### Community 40 - "FakeOrca"
Cohesion: 0.04
Nodes (47): harness(), HEARTBEAT_STALE_MS, SPEC_FOOTER, CheckMessage, CheckResult, RequestShowState, TerminalView, chk() (+39 more)

### Community 41 - "fresh"
Cohesion: 0.07
Nodes (33): Task 5: `resumeCommand`, 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入 (+25 more)

### Community 42 - "find-session.ts"
Cohesion: 0.12
Nodes (24): Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan (+16 more)

### Community 43 - "app.tsx"
Cohesion: 0.12
Nodes (45): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Page(), Routed(), Session (+37 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.09
Nodes (18): 11. 错误处理, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 3. 全局约束补充, 5.1 建立 Run, 5.2 协调者归属：唯一规则 (+10 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.17
Nodes (25): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+17 more)

### Community 46 - "fake-client.ts"
Cohesion: 0.11
Nodes (16): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, RunSummary, seeded(), Args, Executed, FakeTask, Fault, mkDeps() (+8 more)

### Community 47 - "posts.ts"
Cohesion: 0.15
Nodes (16): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+8 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.09
Nodes (33): 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 一、plan 与 spec 脱节（阻塞，已处理）, 7.1 `wl restore --all` (+25 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (16): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, InitTeamMode, registerSpec(), writeTemplate(), renderBrief() (+8 more)

### Community 50 - "OrcaClient"
Cohesion: 0.07
Nodes (7): Task 15：契约测试——真实回执入库并钉住解析, Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 6: 确定会话 ID, 12. 测试, 2. 关键事实：Orca 原生编排层（实测结论）, OrcaClient, result()

### Community 51 - "tui/render.ts"
Cohesion: 0.13
Nodes (27): Task 3: `OrcaClient.search`, 10. 命令, 4.1 提问的转述, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理, eventLine(), filterText(), Row (+19 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 53 - "create.ts"
Cohesion: 0.19
Nodes (21): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, afterCreateError(), CreateArgs, createOnly(), createTask(), dispatchCreated(), recordNewTask(), rerunCommand() (+13 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.12
Nodes (21): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 4: 静态资源与安全响应头, Task 7: SSE (+13 more)

### Community 55 - "雁阵阶段 2B（调度员与巡查熔断）实现计划"
Cohesion: 0.14
Nodes (18): Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, Task 9：通用前置、查询、变迁记录、`staleReasons`, 文件结构, 雁阵阶段 2A（任务工作流）实现计划, Global Constraints, Review Focus, 雁阵阶段 2B（调度员与巡查熔断）实现计划 (+10 more)

### Community 56 - "autostart/index.ts"
Cohesion: 0.08
Nodes (39): Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3.4 未启动团队与 Orca 不可达时的降级, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`） (+31 more)

### Community 57 - "reduce.ts"
Cohesion: 0.20
Nodes (19): 3. 次要项（实现时顺手处理）, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey() (+11 more)

### Community 58 - "up"
Cohesion: 0.05
Nodes (53): Task 12：CLI 包, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Global Constraints, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, 7.2 组件, 7. 冻结的实际效果（给 2A 的命令打补丁）, 6.2 写入, 10. 测试 (+45 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (28): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+20 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.21
Nodes (13): about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes(), orcaPathItem() (+5 more)

### Community 62 - "main.test.ts"
Cohesion: 0.11
Nodes (15): AUDIT, installWarningFilter(), allDeps(), autostartWorld(), cmds(), exec(), execAll(), io() (+7 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.15
Nodes (29): clock(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState (+21 more)

### Community 65 - "api-read.ts"
Cohesion: 0.22
Nodes (17): FrozenRow, buildPostDetail(), loadPostPreview(), offlinePosts(), registerLogRoute(), registerPostRoutes(), registerReadRoutes(), registerTaskRoutes() (+9 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "cellWidth"
Cohesion: 0.19
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth(), charWidth() (+4 more)

### Community 70 - "up.test.ts"
Cohesion: 0.18
Nodes (12): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateCwd(), GateExecResult, isStale(), killTree(), pruneGateOutputs() (+4 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (17): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.2 非目标, 2.3 反目标 (+9 more)

### Community 72 - "command.test.ts"
Cohesion: 0.09
Nodes (7): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui(), MemOut

### Community 73 - "autostart/plan.ts"
Cohesion: 0.09
Nodes (29): Task 6: `wl autostart`, AutostartPlatform, execWord(), installedCommand(), pathEnv(), planAutostart(), PlanOptions, planTargets() (+21 more)

### Community 74 - "run.ts"
Cohesion: 0.16
Nodes (13): Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, buildCmdLine(), OrcaExecutable, createOrcaRunner(), run(), exec(), OrcaEnvelope (+5 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.19
Nodes (7): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, LogCursor, closeServer(), cursorFrom(), Subscriber, TeamFeeds, TeamLoop

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.16
Nodes (30): Task 11: 前端总览页与收件箱的生命周期按钮, ActionDialog(), CommandHint(), Pill(), postOf(), Section(), KIND, show() (+22 more)

### Community 79 - "ps"
Cohesion: 0.17
Nodes (15): Task 2: 缓存型 OrcaClient 与纯文本工具, Task 5: 路由器与读接口, 1. 应在实现前修改, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API (+7 more)

### Community 80 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 81 - "outlets.ts"
Cohesion: 0.21
Nodes (11): Ctx, EventMeta, HumanNotice, notifyExternal(), NotifyHumanResult, outcomeOf(), postWebhook(), REASON_OUTCOME (+3 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.17
Nodes (12): License, `team.yaml` 字段速查, Wingline 雁阵, 功能, 发布, 巡查与通知：`patrol:` 配置, 开发, 开发工具：造一条演示提问 (+4 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (18): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), matchesFilter() (+10 more)

### Community 84 - "final-fixes.test.ts"
Cohesion: 0.38
Nodes (4): NOW, ru(), stuckCreate(), uncertain()

### Community 85 - "signals.review.test.ts"
Cohesion: 0.22
Nodes (10): NUDGE_GRACE_MS, BUDGET, iso(), NOW, quietC(), row(), snap(), SPEC (+2 more)

### Community 86 - "阶段 0 探针报告"
Cohesion: 0.11
Nodes (19): syncAfterChange(), 2A 契约抓取（Task 15，2026-10-15）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）, 3B 探针：控制台标签页（2026-10-19，macOS Orca 1.4.229）, 3C 探针：工作区状态与注释（2026-10-22，macOS，Orca 1.4.237）, 3C 真机验证（续五）：派发时立即同步, 3C 真机验证（续六）：`wl task done` 收尾后立即同步, 3C 真机验证（续四）：批准动作查清，信号清除与长任务收尾已验证 (+11 more)

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
Nodes (13): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.29
Nodes (7): CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs(), mk()

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.16
Nodes (24): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, 3. 核对过、确认没问题的点, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), ensureRun() (+16 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (35): actor, busyTeam, detail, detailAddress, error, expanded, inbox, InboxView() (+27 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "WinglineError"
Cohesion: 0.09
Nodes (26): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包, Wingline 阶段 0+1（验证 + MVP）实现计划 (+18 more)

### Community 98 - "doc.ts"
Cohesion: 0.40
Nodes (9): 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), writeDocs(), DOC_LIMIT_BYTES, docRelsOf(), readDocText(), resolveDocPath(), writeDocAtomic() (+1 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.17
Nodes (3): orca/worker, OrcaWorkerApi, register()

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.06
Nodes (12): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, assert, MockHost (+4 more)

### Community 102 - "阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan"
Cohesion: 0.31
Nodes (8): Review Focus, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, hhmm(), resetClock(), signalRank(), signalSummary(), topSignal(), LADDERS

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.44
Nodes (8): applySecurityHeaders(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), sendFile(), sendIndex(), serveStatic()

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "wl"
Cohesion: 0.13
Nodes (16): Review Focus, 12. 风险, 1. 目标与成功标准, npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发）, 安装, 3C 真机验证（续）：真实 agent、多个团队共用一个 worktree（2026-10-22，macOS，Orca 1.4.237，claude 2.1.308，codex-cli 0.163.0） (+8 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "facade.ts"
Cohesion: 0.24
Nodes (9): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, SpecEditResult, SpecForEdit, SpecEditOp, SpecSaveInput, SpecValidateInput, SpecError, SpecPlan (+1 more)

### Community 110 - "gates"
Cohesion: 0.22
Nodes (10): 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段, 5. 巡查, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台） (+2 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.18
Nodes (25): coreAuditTable(), auditedInit(), claimTask(), createDeps(), doneTask(), freezePost(), inboxDto, openPostTerminal() (+17 more)

### Community 116 - "signals.test.ts"
Cohesion: 0.29
Nodes (7): iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "advance.review.test.ts"
Cohesion: 0.32
Nodes (5): REVIVE_WINDOW_MS, hit(), world(), hit(), world()

### Community 120 - "阶段 3D spec 与 plan 复审（第三轮）"
Cohesion: 0.29
Nodes (6): 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮）

### Community 125 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.29
Nodes (7): 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）, 3.4 前端界面与交互设计（`packages/web/src/`）

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 127 - "opus-review.test.ts"
Cohesion: 0.33
Nodes (3): NOW, ru(), unreachable()

### Community 129 - "gates"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 130 - "在 Orca 里怎么用"
Cohesion: 0.29
Nodes (7): 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用, 岗位之间怎么说话, 岗位在 Orca 界面里能看见什么, 概念对照

### Community 131 - "如何在真机上跑 session-id 和 resume-after-restart"
Cohesion: 0.29
Nodes (7): 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 3. 跑 resume-after-restart, 4. 收尾, 5. 交给 Claude Code 执行, 如何在真机上跑 session-id 和 resume-after-restart

### Community 132 - "screen-signals.test.ts"
Cohesion: 0.16
Nodes (9): CONTEXT_RENOTIFY_MS, SIGNAL_TAIL_LINES, BODY, idle, MENU, TAIL, NOW, ROOT (+1 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "5. 登录与安全"
Cohesion: 0.40
Nodes (5): 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全

### Community 139 - "CommandDeps"
Cohesion: 0.08
Nodes (33): Task 11：`down`, 自检记录, AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf() (+25 more)

### Community 142 - ".withTeamLock"
Cohesion: 0.14
Nodes (11): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑 (+3 more)

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1001 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `attention`, `api-write.ts`, `vitest`, `Registry`, `escalate.ts`, `loop.ts`, `done.ts`, `ref_node_fs`, `screen-signals.test.ts`, `lib.ts`, `.fail`, `CommandDeps`, `spec.ts`, `dispatch.ts`, `query.ts`, `signals.ts`, `.withTeamLock`, `client.ts`, `advance.ts`, `up`, `cli.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `unread.ts`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `FakeOrca`, `fresh`, `find-session.ts`, `fake-client.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `create.ts`, `createConsoleServer`, `雁阵阶段 2B（调度员与巡查熔断）实现计划`, `autostart/index.ts`, `up`, `about.ts`, `main.test.ts`, `api-read.ts`, `up.test.ts`, `command.test.ts`, `autostart/plan.ts`, `run.ts`, `ps`, `client.ts`, `final-fixes.test.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `doc.ts`, `static.ts`, `signals.test.ts`, `advance.review.test.ts`, `opus-review.test.ts`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `attention` be split into smaller, more focused modules?**
  _Cohesion score 0.11553030303030302 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `api-write.ts`, `screen-signals.test.ts`, `loop.ts`, `escalate.ts`, `ref_node_fs`, `pages.test.tsx`, `CommandDeps`, `client.ts`, `query.ts`, `cli.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `self.ts`, `patterns.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `FakeOrca`, `fresh`, `find-session.ts`, `fake-client.ts`, `restore/index.ts`, `create.ts`, `autostart/index.ts`, `package.json`, `about.ts`, `main.test.ts`, `cellWidth`, `up.test.ts`, `command.test.ts`, `autostart/plan.ts`, `run.ts`, `TeamFeeds`, `ps`, `final-fixes.test.ts`, `signals.review.test.ts`, `call-log.ts`, `doc.ts`, `signals.test.ts`, `advance.review.test.ts`, `opus-review.test.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `vitest` be split into smaller, more focused modules?**
  _Cohesion score 0.07279562542720437 - nodes in this community are weakly interconnected._