# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 378 files · ~334,521 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3384 nodes · 10999 edges · 139 communities (127 shown, 12 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1743 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f3d78c18`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- api-write.ts
- gate-exec.ts
- Registry
- deps.ts
- loop.ts
- done.ts
- vitest
- pages.test.tsx
- lib.ts
- cli.ts
- dispatch.ts
- spec.ts
- client.ts
- query.ts
- signals.ts
- stream.tsx
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
- attention
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 6. 注册表扩展
- 15.6 岗位终端按钮（2026-11-07）
- loadTeamSpec
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- gates
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
- WinglineError
- client.ts
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
- .now
- claim.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/index.ts
- resolveOrcaExecutable
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- registerBaseCommands
- dispatcher/inbox.ts
- TaskDetail.tsx
- Wingline 雁阵
- items.ts
- 7. `wl tui`
- signals.test.ts
- output.test.ts
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
- 文件结构
- spec.ts
- orca-worker.d.ts
- compilerOptions
- panel.test.tsx
- 3.4 前端界面与交互设计（`packages/web/src/`）
- cli/tsconfig.json
- static.ts
- api.ts
- orca-plugin/package.json
- wl
- eventRow
- resolveOrcaExecutable
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
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
- 在 Orca 里怎么用
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- 如何在真机上跑 session-id 和 resume-after-restart
- `wl console` 与 Orca 插件：功能对齐表
- verdictRow
- lifecycle.review.test.ts
- 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）
- audit.ts
- TestWorker

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
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/core/src/audit.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `Review Focus` --references--> `fresh()`  [INFERRED]
  docs/superpowers/plans/2026-10-24-phase-3d2d-remote-environment.md → packages/core/src/commands/dispatcher/screen-signals.ts

## Import Cycles
- None detected.

## Communities (139 total, 12 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.10
Nodes (25): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 1: `posts[].environment` 字段, 4. `team.yaml` 扩展, checkLinks(), crossCheck(), DEFAULT_PATROL, environmentOf(), findHandsToCycle() (+17 more)

### Community 1 - "api-write.ts"
Cohesion: 0.07
Nodes (72): Task 12：CLI 包, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 9: 审计包装, Task 6: 写接口 (+64 more)

### Community 2 - "gate-exec.ts"
Cohesion: 0.13
Nodes (16): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateCwd(), GateExecResult, gateOutputPath(), isStale(), killTree() (+8 more)

### Community 4 - "deps.ts"
Cohesion: 0.11
Nodes (24): Task 11：`down`, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, nextRequestId(), preflight(), WAIT_SUBMIT_SEC, closePost() (+16 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (40): PATROL_INTERVAL_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS, CHECK_WAIT_MS (+32 more)

### Community 6 - "done.ts"
Cohesion: 0.15
Nodes (30): Task 12：`wl task done`, awaitDelivered(), context(), createChild(), decide(), decideBypassed(), decideDispatched(), deliverChild() (+22 more)

### Community 7 - "vitest"
Cohesion: 0.08
Nodes (18): MIGRATIONS, darwinSys, hit(), restarted(), CASES, T0, team, tmpDb() (+10 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (23): resetApiForTests(), StreamProvider(), agentInput(), clone(), loaded(), Opts, PARSED, server() (+15 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "cli.ts"
Cohesion: 0.10
Nodes (31): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realAutostartSys, realCommands (+23 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.10
Nodes (40): Task 10：派发与通知、`create`、`plan`, Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 7.4 往岗位终端打字之前的画面检查, 5.7 重跑安全, 6.4 写入, PatrolOps (+32 more)

### Community 12 - "spec.ts"
Cohesion: 0.16
Nodes (22): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`）, 15.2 其他坑 (+14 more)

### Community 13 - "client.ts"
Cohesion: 0.11
Nodes (17): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), OrcaEnvelope, OrcaRunner, Raw, RunOptions, r6, fixture() (+9 more)

### Community 14 - "query.ts"
Cohesion: 0.09
Nodes (38): Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 5: 路由器与读接口, blockedWaiting(), callUncertain(), commandOfKey(), deadAssignee(), DEFAULT_STALE, DoneClosure (+30 more)

### Community 15 - "signals.ts"
Cohesion: 0.11
Nodes (38): Review Focus, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, 文件结构, 雁阵阶段 2B（调度员与巡查熔断）实现计划, Task 6: 画面信号的状态推进 (+30 more)

### Community 16 - "stream.tsx"
Cohesion: 0.13
Nodes (18): Task 10: 总览与时间线页, Task 11: 收件箱与岗位详情页, Task 5: 时间线不丢事件, TuiData, posts, AttentionReport, TimelineEvent, PsRow (+10 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.12
Nodes (29): errorText(), FormError, formHasField(), KIND, show(), SpecPreview(), applyLocal(), Base (+21 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.23
Nodes (20): Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), PostCard(), STATUS (+12 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.11
Nodes (39): CommandDeps, Env, SyncRound, Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman() (+31 more)

### Community 20 - "advance.ts"
Cohesion: 0.17
Nodes (30): Task 8：分级推进——`advancePatrol`, 4.3 `usage_limit` 的处理, 4.6 状态存储与类型, 4. 读画面的巡查信号（块 c，探针 1、2 之后）, act(), advance(), advancePatrol(), announce() (+22 more)

### Community 21 - "posts.ts"
Cohesion: 0.14
Nodes (33): Task 10：`ps` 与 `send`, 自检记录, Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, checkBriefingLimit() (+25 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.08
Nodes (28): Task 1: Codex 会话探针, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 2A 契约抓取（Task 15，2026-10-15）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-19，macOS，Orca 1.4.227） (+20 more)

### Community 23 - "output.ts"
Cohesion: 0.08
Nodes (38): registerDispatcherCommands(), Awaited2, closureLine(), dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat() (+30 more)

### Community 24 - "cachedOrca"
Cohesion: 0.14
Nodes (25): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Router, buildRouter(), ServerContext, cachedOrca (+17 more)

### Community 25 - "ledger.ts"
Cohesion: 0.12
Nodes (36): Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 3: 不确定错误带上 `detail.retryRequest`, adoptReceipt(), attempt(), Ctx, DEFAULT_HINT(), hintFor(), indeterminate() (+28 more)

### Community 26 - "server/index.ts"
Cohesion: 0.10
Nodes (32): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Task 1: 未预期的异常记一行日志（spec §9）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie() (+24 more)

### Community 27 - "attention"
Cohesion: 0.11
Nodes (24): Task 6: Orca 同步, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API, 11. 测试, attention() (+16 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.10
Nodes (18): Task 8: TUI 应用与 `wl tui`, emptyAttention(), runTui(), RunTuiOptions, SIGNALS, WriteFn, TuiCmdArgs, at() (+10 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.07
Nodes (25): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, Global Constraints, Task 4: 未读标记（调度员）, 3. 核对过、确认没问题的点, 6.1 开关, 6.2 岗位状态 (+17 more)

### Community 31 - "self.ts"
Cohesion: 0.07
Nodes (36): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+28 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.10
Nodes (35): 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask(), cut(), flat(), groupByWorktree() (+27 more)

### Community 33 - "patterns.ts"
Cohesion: 0.08
Nodes (41): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, File Structure, Global Constraints, Review Focus, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind` (+33 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.08
Nodes (40): Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, File Structure, Global Constraints, Review Focus, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档 (+32 more)

### Community 35 - "6. 注册表扩展"
Cohesion: 0.24
Nodes (4): 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 37 - "loadTeamSpec"
Cohesion: 0.10
Nodes (27): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 9：命令依赖、预检与 `up`, Task 2: 规格的校验、写回、预演与草稿（core）, BRIEFING_LIMIT, renderBriefing(), canonical(), contentHash(), sha256() (+19 more)

### Community 38 - "console.ts"
Cohesion: 0.14
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.08
Nodes (28): Task 7: TUI 基础：宽度、屏幕、按键、输入框, LineInput, takeHead(), takeTail(), ARROWS, Key, parseKeys(), initialTuiState() (+20 more)

### Community 40 - "FakeOrca"
Cohesion: 0.04
Nodes (39): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, CheckMessage, CheckResult (+31 more)

### Community 41 - "fresh"
Cohesion: 0.09
Nodes (26): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时 (+18 more)

### Community 42 - "find-session.ts"
Cohesion: 0.09
Nodes (31): Task 2: 注册表迁移与读写, Task 5: `resumeCommand`, Global Constraints, File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档 (+23 more)

### Community 43 - "app.tsx"
Cohesion: 0.17
Nodes (23): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+15 more)

### Community 44 - "gates"
Cohesion: 0.08
Nodes (32): 10. 命令, 11. 错误处理, 12. 测试, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论） (+24 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.17
Nodes (25): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+17 more)

### Community 46 - "fake-client.ts"
Cohesion: 0.06
Nodes (32): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, REVIVE_WINDOW_MS, RunSummary, SEND, hit(), world(), hit(), world() (+24 more)

### Community 47 - "posts.ts"
Cohesion: 0.15
Nodes (16): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+8 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.08
Nodes (32): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 3: 注册表迁移 `unread_marks`, Task 7: 收尾与真机验证 (+24 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (16): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, InitTeamMode, registerSpec(), writeTemplate(), renderBrief() (+8 more)

### Community 50 - "OrcaClient"
Cohesion: 0.05
Nodes (27): Global Constraints, Review Focus, 自检记录, 雁阵阶段 2A（任务工作流）实现计划, Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, 10. 测试, 11. 不做的事（阶段 2B） (+19 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.16
Nodes (22): Global Constraints, eventLine(), filterText(), Row, body(), footer(), header(), HELP (+14 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 53 - "create.ts"
Cohesion: 0.17
Nodes (19): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, afterCreateError(), CreateArgs, createOnly(), createTask(), dispatchCreated(), recordNewTask(), rerunCommand() (+11 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.25
Nodes (7): File Structure, Review Focus, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan, assertExactFields()

### Community 55 - "WinglineError"
Cohesion: 0.09
Nodes (21): chooseTeams(), tuiCmd(), tui(), WinglineError, fail(), LedgerEntry, orcaErr(), ru() (+13 more)

### Community 56 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 57 - "reduce.ts"
Cohesion: 0.22
Nodes (18): rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey(), menuKey() (+10 more)

### Community 58 - "auditedCommands"
Cohesion: 0.15
Nodes (14): 10. 测试, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+6 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (28): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+20 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.17
Nodes (16): Task 9: 读接口扩展与未启动团队降级, about(), AboutAutostart, AboutItem, AboutTeam, autostartItem(), consoleItems(), dirBytes() (+8 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.14
Nodes (32): Task 11: 前端总览页与收件箱的生命周期按钮, CommandHint(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction() (+24 more)

### Community 65 - "api-read.ts"
Cohesion: 0.15
Nodes (23): dispatcherStatus, groupWarnings(), pendingCount(), FrozenRow, buildPostDetail(), loadPostPreview(), offlinePosts(), registerLogRoute() (+15 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 70 - "claim.ts"
Cohesion: 0.27
Nodes (18): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, actorInTeam(), assertReleasable(), claimTask(), fail(), reassignTask(), releaseTask() (+10 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (18): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+10 more)

### Community 72 - "command.test.ts"
Cohesion: 0.14
Nodes (3): In, ioOf(), Out

### Community 73 - "autostart/index.ts"
Cohesion: 0.06
Nodes (48): applyAutostart(), Exec, failure(), FsLike, LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog() (+40 more)

### Community 74 - "resolveOrcaExecutable"
Cohesion: 0.20
Nodes (8): Task 5：阶段 0 探针、报告与真实回执, createOrcaRunner(), run(), exec(), Entry, FAKE, ROOT, runnerWith()

### Community 75 - "TeamFeeds"
Cohesion: 0.13
Nodes (11): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Assessment, Critical, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Issues, Minor, Strengths, 处置情况（2026-10-23 回填） (+3 more)

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 77 - "TuiSession"
Cohesion: 0.22
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "Inbox.tsx"
Cohesion: 0.30
Nodes (10): Pill(), AutostartBody(), AutostartCard(), DISPATCHER, LABEL, Settings(), size(), SOURCE (+2 more)

### Community 79 - "registerBaseCommands"
Cohesion: 0.19
Nodes (13): Task 2: `wl init` CLI 命令, collect(), exitCodeOfUp(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown() (+5 more)

### Community 80 - "dispatcher/inbox.ts"
Cohesion: 0.11
Nodes (29): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 7: Windows CI 偶发超时, Task 9: 收尾, 阶段 2/3 复审修复 Implementation Plan (+21 more)

### Community 81 - "TaskDetail.tsx"
Cohesion: 0.19
Nodes (26): notReady(), ActionDialog(), postOf(), Section(), STALE_REASON, DispatcherNotice(), Empty(), FrozenCard() (+18 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.17
Nodes (12): License, `team.yaml` 字段速查, Wingline 雁阵, 功能, 发布, 巡查与通知：`patrol:` 配置, 开发, 开发工具：造一条演示提问 (+4 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (18): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), matchesFilter() (+10 more)

### Community 84 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 85 - "signals.test.ts"
Cohesion: 0.08
Nodes (33): 自检记录, 4.4 `context_low` 的处理, TypeOutcome, NUDGE_GRACE_MS, ScanSnapshot, SignalHit, WorkerView, DoneVerdictRow (+25 more)

### Community 86 - "output.test.ts"
Cohesion: 0.38
Nodes (6): 6.5 `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at()

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
Nodes (13): Task 4：OrcaClient 类型化方法, 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.19
Nodes (11): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+3 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.15
Nodes (25): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, Task 8: `restore()` 编排, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), ensureRun() (+17 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (42): PostDto, PreviewDto, TaskDto, actor, bringUp(), busyTeam, detail, detailAddress (+34 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "文件结构"
Cohesion: 0.18
Nodes (13): Global Constraints, Review Focus, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包 (+5 more)

### Community 98 - "spec.ts"
Cohesion: 0.23
Nodes (18): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), SaveSpecArgs, SpecEditResult, SpecForEdit, writeDocs(), DOC_LIMIT_BYTES (+10 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.17
Nodes (3): orca/worker, OrcaWorkerApi, register()

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "panel.test.tsx"
Cohesion: 0.11
Nodes (11): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+3 more)

### Community 102 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.29
Nodes (7): 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）, 3.4 前端界面与交互设计（`packages/web/src/`）

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.44
Nodes (8): applySecurityHeaders(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), sendFile(), sendIndex(), serveStatic()

### Community 105 - "api.ts"
Cohesion: 0.12
Nodes (17): Task 9: 前端工程与基础设施, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, api, ApiError, call(), csrfToken(), Envelope, ErrorBody (+9 more)

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "wl"
Cohesion: 0.17
Nodes (13): 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发） (+5 more)

### Community 108 - "eventRow"
Cohesion: 0.22
Nodes (3): Task 10: 时间线 `wl log` 与 CLI 接入, eventRow(), logRow()

### Community 109 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 110 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.12
Nodes (19): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 10. 错误处理, 11. 测试, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 1）, 4.1 页面 `/t/:team/edit` (+11 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.16
Nodes (6): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 9.1 P1：有稳定本地键, 9.2 P2：以 id 为键（没有稳定本地实体）, 9.3 各调用用哪种, 9.4 派发与 `epoch`, 9. 编排写调用的幂等账本

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.17
Nodes (29): coreAuditTable(), ps(), auditedInit(), claimTask(), createDeps(), doneTask(), freezePost(), inboxDto (+21 more)

### Community 116 - "draft.ts"
Cohesion: 0.26
Nodes (16): Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, applyDraftBeforeUp(), applyDraft(), assertSpecSize(), checkSaveConflict(), discardDraft(), draftPathOf(), fileHash() (+8 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "NewTeamDialog.tsx"
Cohesion: 0.22
Nodes (15): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+7 more)

### Community 120 - "阶段 3D spec 与 plan 复审（第三轮）"
Cohesion: 0.29
Nodes (6): 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮）

### Community 125 - "orca-sync.test.ts"
Cohesion: 0.17
Nodes (11): SIGNAL_LABEL, addTeam(), builder, busyDuo(), busyTrio(), hold(), reviewTasks, snapOf() (+3 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 130 - "在 Orca 里怎么用"
Cohesion: 0.29
Nodes (7): 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用, 岗位之间怎么说话, 岗位在 Orca 界面里能看见什么, 概念对照

### Community 131 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.20
Nodes (9): 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3. 详细设计, 4. 错误处理、边界与安全约束, 5. 留给实现者决定的细节（Left to the Builder）, 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗, 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由 (+1 more)

### Community 132 - "如何在真机上跑 session-id 和 resume-after-restart"
Cohesion: 0.29
Nodes (7): 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 3. 跑 resume-after-restart, 4. 收尾, 5. 交给 Claude Code 执行, 如何在真机上跑 session-id 和 resume-after-restart

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 135 - "lifecycle.review.test.ts"
Cohesion: 0.17
Nodes (7): 6. 修订后的针对性复审（复审五，2026-10-15）, HEARTBEAT_STALE_MS, holdLock(), P, fakeRunning(), L, dispatcherRunning()

### Community 136 - "待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）"
Cohesion: 0.40
Nodes (5): A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）, B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher）, C. Run 重启后是否保留（需要重启 Orca，在 B 之后做）, 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）, 执行结果（2026-10-13，macOS 真机，Orca 1.4.224，由 Claude 代为执行）

### Community 139 - "audit.ts"
Cohesion: 0.13
Nodes (12): AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf(), AnyCommand, CORE_AUDIT (+4 more)

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1004 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `api-write.ts`, `gate-exec.ts`, `Registry`, `deps.ts`, `loop.ts`, `done.ts`, `vitest`, `lib.ts`, `cli.ts`, `audit.ts`, `spec.ts`, `dispatch.ts`, `query.ts`, `signals.ts`, `client.ts`, `advance.ts`, `posts.ts`, `output.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `attention`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `fake-client.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `create.ts`, `createConsoleServer`, `client.ts`, `about.ts`, `main.test.ts`, `api-read.ts`, `claim.ts`, `autostart/index.ts`, `resolveOrcaExecutable`, `registerBaseCommands`, `dispatcher/inbox.ts`, `signals.test.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `文件结构`, `spec.ts`, `static.ts`, `resolveOrcaExecutable`, `host.ts`, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `load.ts`, `api-write.ts`, `gate-exec.ts`, `loop.ts`, `lifecycle.review.test.ts`, `pages.test.tsx`, `dispatch.ts`, `client.ts`, `query.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `Screen`, `self.ts`, `patterns.ts`, `commands/log.ts`, `loadTeamSpec`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `app.tsx`, `fake-client.ts`, `restore/index.ts`, `create.ts`, `WinglineError`, `package.json`, `about.ts`, `main.test.ts`, `api-read.ts`, `claim.ts`, `command.test.ts`, `autostart/index.ts`, `resolveOrcaExecutable`, `Inbox.tsx`, `signals.test.ts`, `output.test.ts`, `call-log.ts`, `spec.ts`, `api.ts`, `resolveOrcaExecutable`, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07436708860759493 - nodes in this community are weakly interconnected._