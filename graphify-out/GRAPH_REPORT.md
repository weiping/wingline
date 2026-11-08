# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 378 files · ~334,996 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3387 nodes · 10994 edges · 137 communities (125 shown, 12 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1725 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a25d994e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- .fail
- api-write.ts
- gate-exec.ts
- Registry
- deps.ts
- loop.ts
- done.ts
- vitest
- pages.test.tsx
- lib.ts
- registry.test.ts
- dispatch.ts
- 15. P0 现状（2026-11-06 已落地）
- client.ts
- query.ts
- scan
- stream.tsx
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- up.ts
- 阶段 0 探针报告
- cli.ts
- cachedOrca
- ledger.ts
- server/index.ts
- cellWidth
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 6. 注册表扩展
- resumeCommand
- mkDeps
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- SpecForm.tsx
- WinglineError
- posts.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- screenGuard
- createConsoleServer
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- client.ts
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
- outlets.ts
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- parseResetTime
- signals.test.ts
- TaskDetail.tsx
- Wingline 雁阵
- items.ts
- 7. `wl tui`
- signals.test.ts
- .withTeamLock
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
- 6. 修订后的针对性复审（复审五，2026-10-15）
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- 5. 后续阶段要点（边界说明）
- eventRow
- resolveOrcaExecutable
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- Task 4: 未读标记（调度员）
- core/tsconfig.json
- 雁阵 Wingline 阶段 2A：任务工作流设计
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- NewTeamDialog.tsx
- 6. 首期详细设计：阶段 0（验证）
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
- 4. `wl console` 进程
- patrolRow
- `wl console` 与 Orca 插件：功能对齐表
- verdictRow
- lifecycle.review.test.ts
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

## Communities (137 total, 12 thin omitted)

### Community 0 - ".fail"
Cohesion: 0.23
Nodes (10): checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Located, patrolOf(), resolveFile() (+2 more)

### Community 1 - "api-write.ts"
Cohesion: 0.10
Nodes (52): Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, Task 8: 文档——spec 漂移与 3C/3D 计划失效点, Task 5: `wl restore --all`, Review Focus (+44 more)

### Community 2 - "gate-exec.ts"
Cohesion: 0.20
Nodes (12): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, GateExecResult, isStale(), killTree(), pruneGateOutputs(), runGate() (+4 more)

### Community 3 - "Registry"
Cohesion: 0.05
Nodes (3): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, Registry, addAuditor()

### Community 4 - "deps.ts"
Cohesion: 0.10
Nodes (35): Task 11：`down`, 自检记录, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, CommandDeps, nextRequestId(), WAIT_SUBMIT_SEC, addressOf(), clearDeadLock() (+27 more)

### Community 5 - "loop.ts"
Cohesion: 0.10
Nodes (46): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, HEARTBEAT_TAKEOVER_MS, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP (+38 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (43): Task 12：`wl task done`, Task 15：契约测试——真实回执入库并钉住解析, 10. 命令, 6.2 岗位状态, 6.4 写入, syncAfterChange(), dispatchTo(), awaitDelivered() (+35 more)

### Community 7 - "vitest"
Cohesion: 0.06
Nodes (32): Links, locations, MODEL_FLAG_AGENTS, parseYamlText(), Path, TaskBudgets, darwinSys, ctxOf() (+24 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.07
Nodes (29): ApiError, call(), Envelope, ErrorBody, resetApiForTests(), StreamProvider(), agentInput(), clone() (+21 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "registry.test.ts"
Cohesion: 0.11
Nodes (11): MIGRATIONS, T0, team, tmpDb(), world(), post(), running, running2b (+3 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.27
Nodes (15): Task 10：派发与通知、`create`、`plan`, aliveHandle(), bumpRound(), busyIn(), busyWith(), confirmReplay(), Dispatched, dispatchedElsewhere() (+7 more)

### Community 12 - "15. P0 现状（2026-11-06 已落地）"
Cohesion: 0.67
Nodes (3): 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15. P0 现状（2026-11-06 已落地）

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (16): createOrcaClient(), OrcaEnvelope, OrcaRunner, Raw, RunOptions, r6, fixture(), ROOT (+8 more)

### Community 14 - "query.ts"
Cohesion: 0.09
Nodes (43): Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 14. 风险, 12. 风险, 5.2 信号, 6.5 `wl attention <team>`, staleSource(), blockedWaiting() (+35 more)

### Community 15 - "scan"
Cohesion: 0.18
Nodes (19): Task 6: Orca 同步, Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, warningsOf(), scan(), isUsagePaused(), activeHits() (+11 more)

### Community 16 - "stream.tsx"
Cohesion: 0.11
Nodes (22): Task 10: 总览与时间线页, Task 11: 收件箱与岗位详情页, Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, TuiData, AttentionReport, TimelineEvent, PsRow (+14 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (26): FormError, formHasField(), runSteps(), applyLocal(), Base, DraftBanner(), editInputs(), Editor() (+18 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.17
Nodes (31): notReady(), Page(), clock(), ErrorBox(), Loading(), Section(), SOURCE_LABEL, EventRow() (+23 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.24
Nodes (20): advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS, ContextSig, Ctx, detailOf() (+12 more)

### Community 20 - "advance.ts"
Cohesion: 0.18
Nodes (28): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+20 more)

### Community 21 - "up.ts"
Cohesion: 0.10
Nodes (44): Task 10：`ps` 与 `send`, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, 1. 应在实现前修改, 3. 核对过、确认没问题的点, 4. 建议的下一步, 阶段 3（3A–3D）spec 与计划复审, 4.1 生成与写入 (+36 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (37): Task 5: `resumeCommand`, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪, 2A 契约抓取（Task 15，2026-10-15）, 3. 跑 resume-after-restart, 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226） (+29 more)

### Community 23 - "cli.ts"
Cohesion: 0.05
Nodes (94): Task 2: `wl init` CLI 命令, 7.1 `wl restore --all`, AsJson, callLogOptions(), collect(), defaultMakeDeps(), DepsOverrides, Execute (+86 more)

### Community 24 - "cachedOrca"
Cohesion: 0.22
Nodes (18): registerWriteRoutes(), Router, buildRouter(), ServerContext, cachedOrca, harness(), BAD_BODIES, makeRecordingCmds() (+10 more)

### Community 25 - "ledger.ts"
Cohesion: 0.06
Nodes (68): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份 (+60 more)

### Community 26 - "server/index.ts"
Cohesion: 0.12
Nodes (23): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+15 more)

### Community 27 - "cellWidth"
Cohesion: 0.16
Nodes (13): Task 7: TUI 基础：宽度、屏幕、按键、输入框, LineInput, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+5 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.08
Nodes (22): emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, TuiCmdArgs (+14 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.08
Nodes (27): 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮）, 6.1 开关 (+19 more)

### Community 31 - "self.ts"
Cohesion: 0.07
Nodes (34): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Task 8: 全量验证与收尾 (+26 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.07
Nodes (52): Global Constraints, 6. 未读标记（块 b）, Env, WARNING_ACTIONS, LoopState, commentLimit(), composeGroup(), Ctx (+44 more)

### Community 33 - "patterns.ts"
Cohesion: 0.21
Nodes (15): Task 2: 模式表与 `detectScreen`, 与 spec 的差异（先读这一节）, 4.1 模式表, classifyPreview(), AUTO_ARMED, AUTO_CANCELLED, CONTEXT_LOW, contextLow() (+7 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.06
Nodes (55): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, 文件结构, Task 10: 时间线 `wl log` 与 CLI 接入, File Structure, Global Constraints, Review Focus (+47 more)

### Community 35 - "6. 注册表扩展"
Cohesion: 0.24
Nodes (4): 3. 全局约束补充, 6. 注册表扩展, 8. 长期运行, CallLog

### Community 36 - "resumeCommand"
Cohesion: 0.12
Nodes (16): File Structure, Global Constraints, Review Focus, Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, Task 8: `restore()` 编排, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 10. 测试 (+8 more)

### Community 37 - "mkDeps"
Cohesion: 0.10
Nodes (15): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, PARAM_RULES, RouteEntry, statusOf(), SECURITY_HEADERS, seeded(), mkDeps(), seeded() (+7 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (26): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+18 more)

### Community 39 - "app.test.ts"
Cohesion: 0.12
Nodes (16): initialTuiState(), TuiState, address(), FakeStdin, FAST, harness(), MemOut, on() (+8 more)

### Community 40 - "FakeOrca"
Cohesion: 0.05
Nodes (37): CheckMessage, CheckResult, RequestShowState, TerminalView, WorkspaceStatus, chk(), seededDispatched(), asked() (+29 more)

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (29): Task 1: Codex 会话探针, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.2 接回时, 4.3 标记不外泄 (+21 more)

### Community 42 - "find-session.ts"
Cohesion: 0.11
Nodes (25): Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+17 more)

### Community 43 - "app.tsx"
Cohesion: 0.16
Nodes (26): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout() (+18 more)

### Community 44 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.08
Nodes (25): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7. 身份、通知与画面检查, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals） (+17 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.15
Nodes (27): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase (+19 more)

### Community 46 - "WinglineError"
Cohesion: 0.06
Nodes (30): SPEC_FOOTER, gateCwd(), WinglineError, RunSummary, SEND, fail(), world(), Args (+22 more)

### Community 47 - "posts.ts"
Cohesion: 0.08
Nodes (31): Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, Launch, FRESH_REFUSE (+23 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.10
Nodes (26): 阶段 3D 实现计划（索引）, File Structure, Review Focus, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 3: 注册表迁移 `unread_marks`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 实施记录（2026-10-25 回填） (+18 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (16): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, InitTeamMode, registerSpec(), writeTemplate(), renderBrief() (+8 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.14
Nodes (23): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, eventLine(), filterText(), Row, body(), footer() (+15 more)

### Community 52 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 53 - "screenGuard"
Cohesion: 0.12
Nodes (23): Global Constraints, Review Focus, Task 13：`wl task escalate` / `resolve` / `recover`, Task 16：端到端流程测试, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构 (+15 more)

### Community 54 - "createConsoleServer"
Cohesion: 0.22
Nodes (8): File Structure, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾, 阶段 3B 复审跟进小修复 Implementation Plan, assertExactFields()

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.12
Nodes (17): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 5.1 每轮扫描的输入, 5.3 `team.yaml` 新增字段 (+9 more)

### Community 56 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 57 - "reduce.ts"
Cohesion: 0.18
Nodes (20): 3. 次要项（实现时顺手处理）, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey() (+12 more)

### Community 58 - "wl"
Cohesion: 0.06
Nodes (42): Task 12：CLI 包, 升级与行为变化, Global Constraints, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, 7.2 组件, 6.2 写入, 10. 测试, 11. 不做的事（阶段 3B） (+34 more)

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
Cohesion: 0.06
Nodes (26): AUDIT, installWarningFilter(), allDeps(), autostartWorld(), exec(), execAll(), io(), makeDeps() (+18 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.18
Nodes (24): errorText(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState (+16 more)

### Community 65 - "api-read.ts"
Cohesion: 0.19
Nodes (20): dispatcherStatus, groupWarnings(), pendingCount(), PostRow, buildPostDetail(), loadPostPreview(), offlinePosts(), registerLogRoute() (+12 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.18
Nodes (11): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+3 more)

### Community 69 - "File Structure"
Cohesion: 0.15
Nodes (18): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, File Structure, Review Focus, Task 1: 样本与重置时间解析, Task 4: 每轮读画面进 `previews`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, Task 7: 展示, Task 8: 文档与真机核对 (+10 more)

### Community 70 - "escalate.ts"
Cohesion: 0.13
Nodes (40): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, actorInTeam(), assertReleasable(), claimTask(), fail(), reassignTask(), teamOfAddress() (+32 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (17): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.2 非目标, 2.3 反目标 (+9 more)

### Community 72 - "command.test.ts"
Cohesion: 0.11
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/index.ts"
Cohesion: 0.06
Nodes (55): Task 6: `wl autostart`, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, applyAutostart(), Exec, failure() (+47 more)

### Community 74 - "outlets.ts"
Cohesion: 0.21
Nodes (13): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Ctx, EventMeta, HumanNotice, notifyExternal(), notifyHuman(), NotifyHumanResult, outcomeOf() (+5 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.24
Nodes (4): Strengths, closeServer(), cursorFrom(), TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.12
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.24
Nodes (9): api, ApiState, AutostartBody(), AutostartCard(), DISPATCHER, LABEL, size(), SOURCE (+1 more)

### Community 79 - "parseResetTime"
Cohesion: 0.26
Nodes (9): instantOf(), MONTHS, offsetMs(), parseClock(), parseDate(), parseResetTime(), Wall, wallIn() (+1 more)

### Community 80 - "signals.test.ts"
Cohesion: 0.29
Nodes (7): iso(), NOW, row(), snap(), SPEC, st(), term()

### Community 81 - "TaskDetail.tsx"
Cohesion: 0.18
Nodes (25): Task 11: 前端总览页与收件箱的生命周期按钮, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, ActionDialog(), CommandHint(), Pill(), postOf(), KIND, show() (+17 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.17
Nodes (12): License, `team.yaml` 字段速查, Wingline 雁阵, 功能, 发布, 巡查与通知：`patrol:` 配置, 开发, 开发工具：造一条演示提问 (+4 more)

### Community 83 - "items.ts"
Cohesion: 0.31
Nodes (15): action(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem(), replyItem() (+7 more)

### Community 84 - "7. `wl tui`"
Cohesion: 0.25
Nodes (9): 7.1 命令与视图, 7.2 按键, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q(), 终端视图：`wl tui` (+1 more)

### Community 85 - "signals.test.ts"
Cohesion: 0.07
Nodes (45): 自检记录, PatrolOps, LoopOpts, OutletIo, Env, Ladder, localHistory(), NUDGE_GRACE_MS (+37 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.25
Nodes (5): Task 9：命令依赖、预检与 `up`, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, fakeRunning()

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
Cohesion: 0.13
Nodes (15): Task 5：阶段 0 探针、报告与真实回执, Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs() (+7 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务"
Cohesion: 0.32
Nodes (12): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), keepOrReclaim(), newRunKey(), newRunStep() (+4 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (43): PostDto, PreviewDto, TaskDto, actor, bringUp(), busyTeam, detail, detailAddress (+35 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "文件结构"
Cohesion: 0.14
Nodes (16): Global Constraints, Review Focus, Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 7：注册表 (+8 more)

### Community 98 - "spec.ts"
Cohesion: 0.23
Nodes (19): 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, readDocs(), readText(), SaveSpecArgs, SpecEditResult, SpecForEdit, writeDocs(), DOC_LIMIT_BYTES (+11 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.17
Nodes (3): orca/worker, OrcaWorkerApi, register()

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "panel.test.tsx"
Cohesion: 0.11
Nodes (11): POSTS, TEAM, INBOX, POSTS, TASKS, TEAM, TEAM, assert (+3 more)

### Community 102 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.29
Nodes (6): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

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

### Community 107 - "5. 后续阶段要点（边界说明）"
Cohesion: 0.40
Nodes (5): 5.1 团队规格的完整形态, 5.2 调度员（阶段 2）, 5.3 巡查与熔断（阶段 2）, 5.4 控制台（阶段 3）, 5. 后续阶段要点（边界说明）

### Community 108 - "eventRow"
Cohesion: 0.17
Nodes (5): Task 2: 注册表迁移与读写, eventRow(), logRow(), limit(), LIMIT_LINE()

### Community 109 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 110 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.16
Nodes (14): 10. 错误处理, 11. 测试, 12. 不做的事（阶段 3C）, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 1）, 5. 关于与诊断（控制台 `/settings`，只读） (+6 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.14
Nodes (14): 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论）, 5.1 建立 Run, 5.2 协调者归属：唯一规则, 5. Run 与协调者身份 (+6 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.17
Nodes (30): coreAuditTable(), auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), freezePost() (+22 more)

### Community 116 - "draft.ts"
Cohesion: 0.13
Nodes (35): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+27 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.25
Nodes (3): 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "NewTeamDialog.tsx"
Cohesion: 0.24
Nodes (12): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), TEAM_TEMPLATES_UI, TemplateCards() (+4 more)

### Community 120 - "6. 首期详细设计：阶段 0（验证）"
Cohesion: 0.50
Nodes (4): 6.1 探针, 6.2 报告, 6.3 回执样本, 6. 首期详细设计：阶段 0（验证）

### Community 125 - "orca-sync.test.ts"
Cohesion: 0.14
Nodes (16): SIGNAL_LABEL, canonical(), contentHash(), sha256(), specHash(), DEFAULT_PATROL, addTeam(), builder (+8 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "gates"
Cohesion: 0.14
Nodes (21): Task 2: 规格的校验、写回、预演与草稿（core）, 4. `team.yaml` 扩展, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台） (+13 more)

### Community 130 - "在 Orca 里怎么用"
Cohesion: 0.29
Nodes (7): 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用, 岗位之间怎么说话, 岗位在 Orca 界面里能看见什么, 概念对照

### Community 131 - "4. `wl console` 进程"
Cohesion: 0.50
Nodes (4): 4.1 命令, 4.2 `--open`, 4.3 控制接口, 4. `wl console` 进程

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 135 - "lifecycle.review.test.ts"
Cohesion: 0.18
Nodes (5): holdLock(), P, L, dispatcherRunning(), dispatcherRunning()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1004 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `.fail`, `gates`, `api-write.ts`, `gate-exec.ts`, `deps.ts`, `loop.ts`, `done.ts`, `vitest`, `lib.ts`, `registry.test.ts`, `dispatch.ts`, `client.ts`, `query.ts`, `advance.ts`, `up.ts`, `cli.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `edit.ts`, `Screen`, `雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resumeCommand`, `mkDeps`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `posts.ts`, `restore/index.ts`, `init.ts`, `createConsoleServer`, `client.ts`, `wl`, `about.ts`, `main.test.ts`, `api-read.ts`, `escalate.ts`, `command.test.ts`, `autostart/index.ts`, `signals.test.ts`, `signals.test.ts`, `.withTeamLock`, `7. 首期详细设计：阶段 1（MVP）`, `Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务`, `文件结构`, `spec.ts`, `static.ts`, `resolveOrcaExecutable`, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10102843315184513 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `api-write.ts`, `gate-exec.ts`, `loop.ts`, `done.ts`, `lifecycle.review.test.ts`, `pages.test.tsx`, `registry.test.ts`, `client.ts`, `query.ts`, `up.ts`, `cli.ts`, `cachedOrca`, `ledger.ts`, `server/index.ts`, `cellWidth`, `Screen`, `self.ts`, `patterns.ts`, `commands/log.ts`, `resumeCommand`, `mkDeps`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计`, `WinglineError`, `posts.ts`, `restore/index.ts`, `init.ts`, `tui/render.ts`, `package.json`, `about.ts`, `main.test.ts`, `escalate.ts`, `command.test.ts`, `autostart/index.ts`, `parseResetTime`, `signals.test.ts`, `signals.test.ts`, `call-log.ts`, `spec.ts`, `resolveOrcaExecutable`, `draft.ts`, `orca-sync.test.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Registry` be split into smaller, more focused modules?**
  _Cohesion score 0.04547858276044421 - nodes in this community are weakly interconnected._