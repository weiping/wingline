# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~335,839 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3394 nodes · 11016 edges · 156 communities (141 shown, 15 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1725 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `818e41ea`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- api-write.ts
- WinglineError
- Registry
- lifecycle.ts
- loop.ts
- done.ts
- api-spec.ts
- pages.test.tsx
- lib.ts
- vitest
- dispatch.ts
- core/src/audit-table.ts
- client.ts
- query.ts
- signals.ts
- opus-review.test.ts
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- cachedOrca
- dispatcher/inbox.ts
- server/index.ts
- cellWidth
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- dispatcher/inbox.review.test.ts
- ps
- .now
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- plan
- SpecForm.tsx
- unread.test.ts
- posts.test.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- 自检记录
- TimelineEvent
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- client.ts
- reduce.ts
- wl
- package.json
- cli/package.json
- inRange
- main.test.ts
- demo-question.ts
- TaskDetail.tsx
- api-read.ts
- with
- fake-orca.mjs
- 雁阵 Wingline 设计总纲
- Review Focus
- create.ts
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- autostart/index.ts
- CommandDeps
- TeamFeeds
- web/package.json
- TuiSession
- Inbox.tsx
- cli.ts
- .release
- Inbox.tsx
- Wingline 雁阵
- items.ts
- src/index.ts
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
- Wingline 阶段 0+1（验证 + MVP）实现计划
- spec.ts
- orca-worker.d.ts
- compilerOptions
- panel.test.tsx
- 6. 修订后的针对性复审（复审五，2026-10-15）
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- .taskCreate
- eventRow
- Panel
- autostart/plan.ts
- apply.ts
- core/tsconfig.json
- gates
- 雁阵岗位
- host.ts
- draft.ts
- pnpm-workspace.yaml
- README.md
- NewTeamDialog.tsx
- run
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- vitest
- protocol.ts
- TestPanel
- Wingline
- plan-change.ts
- resolveOrcaExecutable
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- File Structure
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- 3.4 前端界面与交互设计（`packages/web/src/`）
- server-fixture.ts
- orca/types.ts
- screen-signals.test.ts
- specHash
- phase-3d1.ts
- up
- TuiInput
- worktree-status.ts
- autostart/plan.test.ts
- phase-3d2.ts
- output.test.ts
- sse.ts
- open
- verdictRow
- TestWorker
- duo.live.test.ts
- contract-capture.ts
- Task 4: 未读标记（调度员）
- panel.check.ts
- caller-scope-probe.ts

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 161 edges
3. `vitest` - 133 edges
4. `Registry` - 126 edges
5. `seedRunningTeam()` - 100 edges
6. `loadTeamSpec()` - 91 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `attention()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `Task 6: 低成本 Minor 一批` --references--> `clearDeadLock()`  [INFERRED]
  docs/superpowers/plans/2026-10-21-phase-2-3-review-fixes.md → packages/core/src/commands/dispatcher/lifecycle.ts
- `4.5 展示` --references--> `postLine()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md → packages/core/src/commands/dispatcher/orca-sync.ts
- `Review Focus` --references--> `fresh()`  [INFERRED]
  docs/superpowers/plans/2026-10-24-phase-3d2d-remote-environment.md → packages/core/src/commands/dispatcher/screen-signals.ts

## Import Cycles
- None detected.

## Communities (156 total, 15 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.10
Nodes (26): checkLinks(), crossCheck(), DEFAULT_PATROL, environmentOf(), findHandsToCycle(), launchOf(), Links, Located (+18 more)

### Community 1 - "api-write.ts"
Cohesion: 0.10
Nodes (61): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 7: 任务执行流写接口, 9.4 派发与 `epoch` (+53 more)

### Community 2 - "WinglineError"
Cohesion: 0.11
Nodes (23): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, answerError(), reopenDispatch(), ledgered(), oneShot(), WinglineError, LedgerEntry, landedThenBroken() (+15 more)

### Community 4 - "lifecycle.ts"
Cohesion: 0.12
Nodes (22): 2. 次要项（实现时顺手处理）, 4. 建议的下一步, 5. 修订后的针对性复核（2026-10-16）, 阶段 3（3A–3D）spec 与计划复审, 前置复审项核验, team(), addressOf(), clearDeadLock() (+14 more)

### Community 5 - "loop.ts"
Cohesion: 0.11
Nodes (44): Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PATROL_INTERVAL_MS, handleOne(), processBatch(), BACKOFF_MAX_MS, BACKOFF_START_MS, beat() (+36 more)

### Community 6 - "done.ts"
Cohesion: 0.08
Nodes (48): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, 自检记录, Delivery, DispatchOutcome, awaitDelivered(), context(), createChild() (+40 more)

### Community 7 - "api-spec.ts"
Cohesion: 0.13
Nodes (20): Assessment, Critical, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Issues, Minor, Strengths, 处置情况（2026-10-23 回填）, 阶段 3B 代码复审报告（2026-10-20） (+12 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.06
Nodes (39): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, Task 10: 前端「新建团队」弹窗、侧栏与首页空态, api, ApiError, call(), csrfToken(), Envelope (+31 more)

### Community 9 - "lib.ts"
Cohesion: 0.11
Nodes (28): { runner, client, worktree }, { runner, client, worktree }, searched, { runner, worktree }, server, main(), main(), confirm() (+20 more)

### Community 10 - "vitest"
Cohesion: 0.09
Nodes (19): MIGRATIONS, ActorSource, AuditRow, ExtColumn, PatrolStateRow, PostStatus, Row, SCREEN_SIGNAL_KINDS (+11 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.12
Nodes (27): Task 16：端到端流程测试, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 7.4 往岗位终端打字之前的画面检查, aliveHandle(), announce(), bumpRound(), busyIn() (+19 more)

### Community 12 - "core/src/audit-table.ts"
Cohesion: 0.20
Nodes (5): AuditCtx, AnyCommand, CORE_AUDIT, ENTRIES, LooseEntry

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (17): Task 4：OrcaClient 类型化方法, createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture() (+9 more)

### Community 14 - "query.ts"
Cohesion: 0.09
Nodes (46): Task 10：派发与通知、`create`、`plan`, Task 9：通用前置、查询、变迁记录、`staleReasons`, Review Focus, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, 雁阵阶段 2B（调度员与巡查熔断）实现计划, Task 8: `restore()` 编排, staleSource(), busyWith() (+38 more)

### Community 15 - "signals.ts"
Cohesion: 0.14
Nodes (31): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 文件结构, Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理 (+23 more)

### Community 16 - "opus-review.test.ts"
Cohesion: 0.29
Nodes (4): NOW, rt(), ru(), unreachable()

### Community 17 - "Edit.tsx"
Cohesion: 0.14
Nodes (24): FormError, formHasField(), applyLocal(), Base, DraftBanner(), editInputs(), Editor(), EditorBody() (+16 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.17
Nodes (26): PsRow, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), PostCard() (+18 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.14
Nodes (30): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, Review Focus, 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan, notifyHuman(), advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear() (+22 more)

### Community 20 - "advance.ts"
Cohesion: 0.14
Nodes (33): Task 8：分级推进——`advancePatrol`, 4.6 状态存储与类型, act(), advance(), advancePatrol(), announce(), autoRecover(), baseId() (+25 more)

### Community 21 - "posts.ts"
Cohesion: 0.12
Nodes (32): Task 10：`ps` 与 `send`, File Structure, Task 3: `OrcaClient.search`, Task 4: 抽出拉起逻辑并写入会话标记, Task 6: 确定会话 ID, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, postAddress() (+24 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.05
Nodes (44): Task 1: Codex 会话探针, Task 5: `resumeCommand`, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, syncAfterChange(), claude(), 0. 前提 (+36 more)

### Community 23 - "output.ts"
Cohesion: 0.09
Nodes (34): registerDispatcherCommands(), Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL (+26 more)

### Community 24 - "cachedOrca"
Cohesion: 0.12
Nodes (29): consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry, Router, statusOf() (+21 more)

### Community 25 - "dispatcher/inbox.ts"
Cohesion: 0.07
Nodes (51): Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 3: 不确定错误带上 `detail.retryRequest`, Task 6: 低成本 Minor 一批 (+43 more)

### Community 26 - "server/index.ts"
Cohesion: 0.09
Nodes (32): Task 13: 端到端冒烟、CI 与文档, Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, File Structure, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾 (+24 more)

### Community 27 - "cellWidth"
Cohesion: 0.19
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, 13. 风险, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+4 more)

### Community 28 - "edit.ts"
Cohesion: 0.14
Nodes (35): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+27 more)

### Community 29 - "Screen"
Cohesion: 0.16
Nodes (9): runTui(), TuiCmdArgs, at(), Screen, ScreenOut, TuiIo, TuiOutput, pickTeam() (+1 more)

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.09
Nodes (19): Global Constraints, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D）, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充 (+11 more)

### Community 31 - "self.ts"
Cohesion: 0.13
Nodes (20): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, Task 8: 全量验证与收尾 (+12 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.07
Nodes (43): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 11. 测试, 修订记录, commentLimit(), composeGroup(), Ctx, currentTask(), cut() (+35 more)

### Community 33 - "patterns.ts"
Cohesion: 0.09
Nodes (34): File Structure, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews`, Task 7: 展示, Task 8: 文档与真机核对, 与 spec 的差异（先读这一节）, 12. 风险 (+26 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.19
Nodes (21): Task 8: TUI 应用与 `wl tui`, currentCursor(), cursorOf(), EMPTY_CURSOR, followTimeline(), fromAudit(), fromPatrol(), fromTaskLog() (+13 more)

### Community 35 - "dispatcher/inbox.review.test.ts"
Cohesion: 0.16
Nodes (9): CheckMessage, CheckResult, chk(), asked(), ctxOf(), ctxOf(), msg(), question() (+1 more)

### Community 36 - "ps"
Cohesion: 0.18
Nodes (15): Task 10: 时间线 `wl log` 与 CLI 接入, 1. 应在实现前修改, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API, emptyAttention() (+7 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (24): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+16 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (18): LineInput, initialTuiState(), Effect, TuiState, address(), FakeStdin, FAST, harness() (+10 more)

### Community 40 - "FakeOrca"
Cohesion: 0.12
Nodes (6): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, WorkerView, WorkspaceStatus, FakeOrca, mk(), status()

### Community 41 - "fresh"
Cohesion: 0.09
Nodes (26): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄 (+18 more)

### Community 42 - "find-session.ts"
Cohesion: 0.09
Nodes (32): Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选） (+24 more)

### Community 43 - "app.tsx"
Cohesion: 0.17
Nodes (23): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+15 more)

### Community 44 - "plan"
Cohesion: 0.22
Nodes (10): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7. 身份、通知与画面检查, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals）, 1.3 反目标（Anti-Goals） (+2 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.17
Nodes (25): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+17 more)

### Community 46 - "unread.test.ts"
Cohesion: 0.29
Nodes (10): attentionKeys(), AttentionParts, Ctx, leadWorktree(), markLead(), markUnread(), recordFailure(), UNREAD_MAX_FAILS (+2 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.12
Nodes (19): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+11 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.09
Nodes (31): 阶段 3D 实现计划（索引）, Review Focus, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 7.1 `wl restore --all`, 实施记录（2026-10-25 回填）, 3.3.4 未启动团队与 Orca 不可达时的降级, preflight(), ORCA_POLL_MS (+23 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (17): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode, registerSpec(), writeTemplate() (+9 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.16
Nodes (27): eventLine(), filterText(), matchesFilter(), Row, timelineRows(), body(), footer(), HELP (+19 more)

### Community 52 - "core/package.json"
Cohesion: 0.10
Nodes (21): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+13 more)

### Community 53 - "自检记录"
Cohesion: 0.12
Nodes (20): 自检记录, Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, PatrolOps, LoopOpts, Ctx, EventMeta (+12 more)

### Community 54 - "TimelineEvent"
Cohesion: 0.10
Nodes (17): File Structure, Global Constraints, Review Focus, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 1: 控制台标签页探针, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 3: 登录、会话与请求校验 (+9 more)

### Community 55 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.07
Nodes (25): Global Constraints, Review Focus, 雁阵阶段 2A（任务工作流）实现计划, 14. 风险, 3. 全局约束补充, 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工 (+17 more)

### Community 56 - "client.ts"
Cohesion: 0.13
Nodes (14): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+6 more)

### Community 57 - "reduce.ts"
Cohesion: 0.17
Nodes (20): Global Constraints, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey(), inputKey() (+12 more)

### Community 58 - "wl"
Cohesion: 0.11
Nodes (20): 12. 风险, 1. 目标与成功标准, 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, npm 安装（推荐） (+12 more)

### Community 59 - "package.json"
Cohesion: 0.08
Nodes (26): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+18 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

### Community 62 - "main.test.ts"
Cohesion: 0.09
Nodes (20): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+12 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.33
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.12
Nodes (37): Task 11: 前端总览页与收件箱的生命周期按钮, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, CommandHint(), Pill(), KIND, show(), SpecPreview(), ActionButton() (+29 more)

### Community 65 - "api-read.ts"
Cohesion: 0.19
Nodes (20): Task 5: 路由器与读接口, Task 3: `wl attention` 的 `warnings`, Task 6: Orca 同步, attention(), dispatcherStatus, groupWarnings(), lastCommand(), pendingCount() (+12 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "Review Focus"
Cohesion: 0.10
Nodes (23): File Structure, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, 一、plan 与 spec 脱节（阻塞，已处理） (+15 more)

### Community 70 - "create.ts"
Cohesion: 0.38
Nodes (7): afterCreateError(), CreateArgs, createOnly(), dispatchCreated(), rerunCommand(), taskSpec(), shellQuote()

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (18): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+10 more)

### Community 72 - "command.test.ts"
Cohesion: 0.10
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "autostart/index.ts"
Cohesion: 0.12
Nodes (24): Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, about(), AboutAutostart (+16 more)

### Community 74 - "CommandDeps"
Cohesion: 0.11
Nodes (25): Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, AuditEntry, AuditOptions, clip(), Command, summaryOf(), write(), CommandDeps (+17 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.29
Nodes (3): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, closeServer(), TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.11
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 77 - "TuiSession"
Cohesion: 0.19
Nodes (4): failure(), summaryOf(), TuiSession, PendingAction

### Community 78 - "Inbox.tsx"
Cohesion: 0.29
Nodes (9): AutostartBody(), AutostartCard(), DISPATCHER, LABEL, Settings(), size(), SOURCE, TeamRows() (+1 more)

### Community 79 - "cli.ts"
Cohesion: 0.11
Nodes (24): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+16 more)

### Community 80 - ".release"
Cohesion: 0.18
Nodes (4): orcaError(), rejectionReceipt(), dispatcherRunning(), dispatcherRunning()

### Community 81 - "Inbox.tsx"
Cohesion: 0.38
Nodes (15): ActionDialog(), postOf(), Section(), DispatcherNotice(), Empty(), FrozenCard(), GatesCard(), hushBody() (+7 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (19): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 功能, 发布, 在 Orca 终端里跑 `wl up` (+11 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (15): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), postRows() (+7 more)

### Community 84 - "src/index.ts"
Cohesion: 0.25
Nodes (11): StaleItem, notReady(), STALE_REASON, BoardColumns(), BoardFilters(), COLUMNS, CreateTaskDialog(), NotReadyBoard() (+3 more)

### Community 85 - "signals.review.test.ts"
Cohesion: 0.12
Nodes (18): NUDGE_GRACE_MS, Verdict, BUDGET, iso(), NOW, quietC(), row(), snap() (+10 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.24
Nodes (6): Task 11：`down`, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, holdLock(), fakeRunning()

### Community 87 - "用例"
Cohesion: 0.10
Nodes (22): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+14 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.17
Nodes (13): 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.4 团队规格（首期子集）, 7.5 注册表, 7.6 启动包, 7.7 命令 (+5 more)

### Community 91 - "call-log.ts"
Cohesion: 0.19
Nodes (11): Task 3: `terminalRead` 与 FakeOrca 的画面模型, 7.2 `wl autostart`, 7. 登录后自动恢复（块 a）, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS (+3 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.16
Nodes (23): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, 3. 核对过、确认没问题的点, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), findDeadAssignees() (+15 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.05
Nodes (25): PostDto, PreviewDto, TaskDto, actor, busyTeam, confirmingDown, detail, detailAddress (+17 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "Wingline 阶段 0+1（验证 + MVP）实现计划"
Cohesion: 0.31
Nodes (7): Global Constraints, Review Focus, Task 2：Orca 可执行文件解析与 Windows 转义, Wingline 阶段 0+1（验证 + MVP）实现计划, buildCmdLine(), escapeCmdArg(), CASES

### Community 98 - "spec.ts"
Cohesion: 0.14
Nodes (36): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`）, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, currentSpec(), docFiles(), readDocs(), readSpecForEdit() (+28 more)

### Community 99 - "orca-worker.d.ts"
Cohesion: 0.17
Nodes (3): orca/worker, OrcaWorkerApi, register()

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "panel.test.tsx"
Cohesion: 0.15
Nodes (9): INBOX, POSTS, TASKS, TEAM, TEAM, assert, MockHost, MockHostOptions (+1 more)

### Community 102 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.25
Nodes (7): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

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

### Community 107 - ".taskCreate"
Cohesion: 0.18
Nodes (15): seededDispatched(), task(), checkerTask(), world(), screensWorld(), newTask(), seed(), dispatchedTask() (+7 more)

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 109 - "Panel"
Cohesion: 0.18
Nodes (14): bringUp(), dispatcherAction(), dispatcherUpOnce(), downTeam(), loadDetail(), loadPosts(), loadPreview(), openTerminal() (+6 more)

### Community 110 - "autostart/plan.ts"
Cohesion: 0.11
Nodes (30): Task 6: `wl autostart`, Exec, DEFAULT_WAIT_ORCA, planOf(), AutostartPlan, AutostartPlatform, execWord(), installedCommand() (+22 more)

### Community 111 - "apply.ts"
Cohesion: 0.15
Nodes (14): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+6 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "gates"
Cohesion: 0.07
Nodes (32): Task 15：契约测试——真实回执入库并钉住解析, Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, 10. 命令, 11. 错误处理, 12. 测试, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位 (+24 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.16
Nodes (32): coreAuditTable(), auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), downTeam() (+24 more)

### Community 116 - "draft.ts"
Cohesion: 0.27
Nodes (9): applyDraftBeforeUp(), applyDraft(), modeOf(), realTarget(), sha256(), SPEC_MAX_BYTES, textHash(), writeAtomic() (+1 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "NewTeamDialog.tsx"
Cohesion: 0.23
Nodes (15): errorText(), DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog() (+7 more)

### Community 120 - "run"
Cohesion: 0.24
Nodes (12): realAutostartSys, registerAutostartCommands(), run(), execute(), renderReady(), errorDoc, quoteWord(), renderAutostartInstall() (+4 more)

### Community 125 - "vitest"
Cohesion: 0.07
Nodes (41): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, SPEC_FOOTER, loadTeamSpec(), hit(), world(), ctxOf(), ctxOf(), world() (+33 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "plan-change.ts"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 130 - "resolveOrcaExecutable"
Cohesion: 0.11
Nodes (19): Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.6 岗位终端按钮（2026-11-07）, 15. P0 现状（2026-11-06 已落地）, direct(), fromExplicit() (+11 more)

### Community 131 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.20
Nodes (3): Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 6. 注册表扩展, registerTeam()

### Community 132 - "File Structure"
Cohesion: 0.23
Nodes (12): File Structure, Task 1: 工作区状态探针, Task 2: 规格的校验、写回、预演与草稿（core）, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, 10. 错误处理, 4.4 接口（3B 的约定与安全校验，写接口进审计） (+4 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.18
Nodes (14): Task 2: `wl init` CLI 命令, collect(), exitCodeOfUp(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown() (+6 more)

### Community 135 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.20
Nodes (10): 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`） (+2 more)

### Community 136 - "server-fixture.ts"
Cohesion: 0.20
Nodes (4): ConsoleServer, seen, FixtureConsole, startFixtureConsole()

### Community 137 - "orca/types.ts"
Cohesion: 0.18
Nodes (8): 自检记录, CloseResult, RequestShowState, RunSummary, SendResult, SendStage, TerminalSummary, TerminalView

### Community 138 - "screen-signals.test.ts"
Cohesion: 0.18
Nodes (9): CONTEXT_RENOTIFY_MS, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL, ROOT (+1 more)

### Community 139 - "specHash"
Cohesion: 0.12
Nodes (20): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包, Task 9：命令依赖、预检与 `up`, 文件结构, BRIEFING_LIMIT (+12 more)

### Community 140 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 141 - "up"
Cohesion: 0.06
Nodes (46): Task 12：CLI 包, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Global Constraints, Review Focus, 阶段 3A：重启恢复与审计时间线 Implementation Plan, Global Constraints, Task 6: 团队与调度员生命周期写接口, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan (+38 more)

### Community 143 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 144 - "autostart/plan.test.ts"
Cohesion: 0.50
Nodes (3): BASE, execStart(), unit()

### Community 145 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 146 - "output.test.ts"
Cohesion: 0.83
Nodes (3): event(), report(), at()

### Community 147 - "sse.ts"
Cohesion: 0.43
Nodes (4): LogCursor, cursorFrom(), Subscriber, TeamLoop

### Community 148 - "open"
Cohesion: 0.33
Nodes (7): InboxView(), loadInbox(), loadTaskDetail(), loadTasks(), open(), runWrite(), TasksView()

### Community 152 - "contract-capture.ts"
Cohesion: 0.60
Nodes (4): main(), orcaVersion(), Receipt, sanitize()

### Community 155 - "caller-scope-probe.ts"
Cohesion: 1.00
Nodes (3): main(), sleep(), waitFile()

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1006 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `api-write.ts`, `resolveOrcaExecutable`, `Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log``, `File Structure`, `lifecycle.ts`, `registerBaseCommands`, `loop.ts`, `done.ts`, `Registry`, `vitest`, `specHash`, `dispatch.ts`, `up`, `query.ts`, `signals.ts`, `client.ts`, `screen-signals.test.ts`, `opus-review.test.ts`, `advance.ts`, `posts.ts`, `output.ts`, `cachedOrca`, `dispatcher/inbox.ts`, `server/index.ts`, `caller-scope-probe.ts`, `edit.ts`, `Screen`, `contract-capture.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `ps`, `api-spec.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `unread.test.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `lib.ts`, `client.ts`, `main.test.ts`, `api-read.ts`, `Review Focus`, `create.ts`, `command.test.ts`, `autostart/index.ts`, `CommandDeps`, `cli.ts`, `.release`, `signals.review.test.ts`, `.withTeamLock`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `spec.ts`, `static.ts`, `autostart/plan.ts`, `apply.ts`, `draft.ts`, `vitest`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `api-write.ts`, `WinglineError`, `resolveOrcaExecutable`, `lifecycle.ts`, `loop.ts`, `done.ts`, `pages.test.tsx`, `screen-signals.test.ts`, `specHash`, `dispatch.ts`, `vitest`, `query.ts`, `client.ts`, `autostart/plan.test.ts`, `opus-review.test.ts`, `output.test.ts`, `sse.ts`, `advance.ts`, `duo.live.test.ts`, `cachedOrca`, `server/index.ts`, `cellWidth`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `commands/log.ts`, `dispatcher/inbox.review.test.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `package.json`, `inRange`, `main.test.ts`, `api-read.ts`, `Review Focus`, `create.ts`, `command.test.ts`, `autostart/index.ts`, `CommandDeps`, `Inbox.tsx`, `signals.review.test.ts`, `call-log.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `spec.ts`, `static.ts`, `autostart/plan.ts`, `apply.ts`, `draft.ts`, `NewTeamDialog.tsx`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10175438596491228 - nodes in this community are weakly interconnected._