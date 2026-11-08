# Graph Report - wingline  (2026-11-08)

## Corpus Check
- 379 files · ~336,613 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3396 nodes · 11024 edges · 149 communities (133 shown, 16 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1726 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `afa64af6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- load.ts
- query.test.ts
- fake-client.ts
- Registry
- WinglineError
- loop.ts
- done.ts
- escalate.ts
- pages.test.tsx
- lib.ts
- ref_node_fs
- dispatch.ts
- 阶段 2 探针：orchestration task/dispatch/gate（2026-10-13，Linux 本机真实 Orca 1.4.222）
- client.ts
- query.ts
- client.ts
- signals.ts
- Edit.tsx
- TaskBoard.tsx
- screen-signals.ts
- advance.ts
- posts.ts
- 阶段 0 探针报告
- output.ts
- cachedOrca
- done.test.ts
- server/index.ts
- cellWidth
- edit.ts
- Screen
- specHash
- self.ts
- orca-sync.ts
- parseResetTime
- commands/log.ts
- api-read.test.ts
- 复审修订（2026-10-23，第二轮）
- ledger.ts
- console.ts
- app.test.ts
- FakeOrca
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计
- SpecForm.tsx
- 自检记录
- posts.test.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- core/package.json
- advance.ts
- spec.ts
- 6. 分级处理
- resumeCommand
- reduce.ts
- Settings.tsx
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
- checkParam
- Panel
- 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）
- command.test.ts
- Review Focus
- src/index.ts
- TeamFeeds
- web/package.json
- TuiSession
- 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）
- cli.ts
- TestPanel
- Inbox.tsx
- Wingline 雁阵
- items.ts
- status.ts
- signals.review.test.ts
- .withTeamLock
- 用例
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- 6. 修订后的针对性复审（复审五，2026-10-15）
- posts
- up.ts
- compilerOptions
- panel.tsx
- compilerOptions
- Wingline 阶段 0+1（验证 + MVP）实现计划
- NewTeamDialog.tsx
- orca-worker.d.ts
- compilerOptions
- TestPanel
- 7. `wl tui`
- cli/tsconfig.json
- static.ts
- ActionDialog.tsx
- orca-plugin/package.json
- open
- eventRow
- verdictRow
- autostart/index.ts
- apply.ts
- core/tsconfig.json
- gates
- 雁阵岗位
- host.ts
- spec.ts
- pnpm-workspace.yaml
- README.md
- plainText
- TestWorker
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- vitest
- protocol.ts
- opus-review.test.ts
- Wingline
- plan-change.ts
- resolveOrcaExecutable
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计
- `wl console` 与 Orca 插件：功能对齐表
- registerBaseCommands
- contract-capture.ts
- createConsoleServer
- phase-3d2.ts
- Task 4: 未读标记（调度员）
- brief/render.ts
- phase-3d1.ts
- 雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计
- TuiInput
- worktree-status.ts
- plan
- self-absolute.test.ts
- output.test.ts
- panel.check.ts
- .now

## God Nodes (most connected - your core abstractions)
1. `WinglineError` - 270 edges
2. `FakeOrca` - 161 edges
3. `vitest` - 133 edges
4. `Registry` - 127 edges
5. `seedRunningTeam()` - 100 edges
6. `loadTeamSpec()` - 91 edges
7. `CommandDeps` - 89 edges
8. `up()` - 68 edges
9. `OrcaClient` - 52 edges
10. `attention()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `13. 风险` --references--> `cellWidth()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/cli/src/tui/width.ts
- `10. 测试` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3b-console-design.md → packages/core/src/audit.ts
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3b-console-design.md → packages/core/src/audit.ts
- `2. 全局约束补充` --references--> `auditedCommands()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md → packages/core/src/audit.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts

## Import Cycles
- None detected.

## Communities (149 total, 16 thin omitted)

### Community 0 - "load.ts"
Cohesion: 0.10
Nodes (27): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, Task 1: `posts[].environment` 字段, checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Links (+19 more)

### Community 1 - "query.test.ts"
Cohesion: 0.16
Nodes (8): StaleInput, NOW, ru(), stuckCreate(), uncertain(), ago(), NOW, verdict()

### Community 2 - "fake-client.ts"
Cohesion: 0.08
Nodes (23): harness(), SEND, world(), world(), Args, Executed, FakeTask, Fault (+15 more)

### Community 4 - "WinglineError"
Cohesion: 0.08
Nodes (39): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 6: 写接口, freezePostCmd(), hushCmd(), knownPost(), stillReady(), teamOf(), unfreezePostCmd() (+31 more)

### Community 5 - "loop.ts"
Cohesion: 0.13
Nodes (36): Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, PatrolOps, BACKOFF_MAX_MS, BACKOFF_START_MS, beat(), CHECK_FAILURES_BEFORE_DROP, CHECK_RERECORD_MS, CHECK_WAIT_MS (+28 more)

### Community 6 - "done.ts"
Cohesion: 0.09
Nodes (43): Task 12：`wl task done`, Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, awaitDelivered(), context(), createChild(), decide(), decideBypassed(), decideDispatched() (+35 more)

### Community 7 - "escalate.ts"
Cohesion: 0.16
Nodes (46): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 13：`wl task escalate` / `resolve` / `recover`, Task 14：CLI 接入——`wl task <sub>`, Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 9: 审计包装, Task 5: 路由器与读接口, Task 7: 任务执行流写接口, 2. 次要项（实现时顺手处理） (+38 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.06
Nodes (39): Task 10: 总览与时间线页, Task 5: 时间线不丢事件, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, ApiError, call(), csrfToken(), Envelope, ErrorBody (+31 more)

### Community 9 - "lib.ts"
Cohesion: 0.11
Nodes (31): { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree }, server (+23 more)

### Community 10 - "ref_node_fs"
Cohesion: 0.07
Nodes (24): MIGRATIONS, ActorSource, ExtColumn, OrcaSyncRow, PostStatus, RequestState, Row, SCREEN_SIGNAL_KINDS (+16 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.13
Nodes (29): Task 10：派发与通知、`create`、`plan`, Task 16：端到端流程测试, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, 文件结构, 6.4 写入, syncAfterChange(), aliveHandle(), announce() (+21 more)

### Community 12 - "阶段 2 探针：orchestration task/dispatch/gate（2026-10-13，Linux 本机真实 Orca 1.4.222）"
Cohesion: 0.29
Nodes (7): 结论, 补充探针：`run-use` 接管 + `check`/`ack`（2026-10-13，紧接上面那轮，同一个 Run）, 补充探针二：幂等重试 / `dispatch --inject` / `gate-create` 对已终态任务 / `WINGLINE_POST` 兼容性 / `lastOutputAt`（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 复审阶段 2 文档后列出的未验证假设）, 补充探针五：账本按谁分区 / 传输层错误的含义 / 被拒的 `worker_done` 进不进账本（2026-10-14，Linux 本机真实 Orca 1.4.222，针对阶段 2 第四次复审，下称 R5）, 补充探针六：一个终端能挂几个派发 / check 的 ack 语义 / reply 的身份 / macOS 终端环境变量 / 真实 agent 上的 `--inject`（2026-10-15，macOS 真机 Orca 1.4.224，针对阶段 2 第四次复审，下称 R6）, 补充探针四：失败的调用进不进账本 / 已落地的调用在环境变化后重放（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 第三次复审阶段 2 文档，下称 R4）, 阶段 2 探针：orchestration task/dispatch/gate（2026-10-13，Linux 本机真实 Orca 1.4.222）

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (16): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), OrcaEnvelope, OrcaRunner, Raw, RunOptions, fixture(), ROOT (+8 more)

### Community 14 - "query.ts"
Cohesion: 0.08
Nodes (44): Review Focus, 自检记录, 雁阵阶段 2A（任务工作流）实现计划, Review Focus, Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, 文件结构 (+36 more)

### Community 15 - "client.ts"
Cohesion: 0.10
Nodes (19): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+11 more)

### Community 16 - "signals.ts"
Cohesion: 0.08
Nodes (49): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, 阶段 3D 实现计划（索引）, File Structure, Global Constraints, Review Focus, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews` (+41 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.11
Nodes (30): errorText(), FormError, formHasField(), KIND, show(), SpecPreview(), runSteps(), applyLocal() (+22 more)

### Community 18 - "TaskBoard.tsx"
Cohesion: 0.17
Nodes (26): PsRow, FrozenRow, PostDetail, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL (+18 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.11
Nodes (31): OutletIo, advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), CONTEXT_RENOTIFY_MS, ContextSig, Ctx (+23 more)

### Community 20 - "advance.ts"
Cohesion: 0.09
Nodes (49): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 8：分级推进——`advancePatrol`, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, 4.6 状态存储与类型, act(), advance(), advancePatrol() (+41 more)

### Community 21 - "posts.ts"
Cohesion: 0.13
Nodes (33): Task 9：命令依赖、预检与 `up`, 自检记录, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 1. 应在实现前修改, 3. 核对过、确认没问题的点 (+25 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (34): Task 1: Codex 会话探针, 7.4 团队规格（首期子集）, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id (+26 more)

### Community 23 - "output.ts"
Cohesion: 0.10
Nodes (30): 6.5 `wl attention` 的 `warnings`, Awaited2, closureLine(), dispatcherLine(), dispatcherTitles(), DOWN_LABEL, LINK_LABEL, linkReason() (+22 more)

### Community 24 - "cachedOrca"
Cohesion: 0.17
Nodes (22): Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Router, buildRouter(), cachedOrca (+14 more)

### Community 25 - "done.test.ts"
Cohesion: 0.15
Nodes (12): seededDispatched(), checkerTask(), screensWorld(), dispatchedTask(), landedThenBroken(), readyTask(), dispatched(), rt() (+4 more)

### Community 26 - "server/index.ts"
Cohesion: 0.14
Nodes (21): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, Auth, checkHost(), checkWrite(), LoginTokenEntry, safeEqual(), sessionCookie(), SessionEntry (+13 more)

### Community 27 - "cellWidth"
Cohesion: 0.17
Nodes (12): Task 7: TUI 基础：宽度、屏幕、按键、输入框, LineInput, takeHead(), takeTail(), ARROWS, Key, parseKeys(), cellWidth() (+4 more)

### Community 28 - "edit.ts"
Cohesion: 0.14
Nodes (35): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+27 more)

### Community 29 - "Screen"
Cohesion: 0.13
Nodes (9): runTui(), TuiCmdArgs, at(), Screen, ScreenOut, TuiIo, TuiOutput, pickTeam() (+1 more)

### Community 30 - "specHash"
Cohesion: 0.07
Nodes (37): 升级与行为变化, Global Constraints, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, 12. 测试, 2. 关键事实：Orca 原生编排层（实测结论）, 10. 测试, 12. 风险, 1.1 与阶段 2A 的分工 (+29 more)

### Community 31 - "self.ts"
Cohesion: 0.08
Nodes (33): Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, Task 6: 低成本 Minor 一批, Assessment, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, Strengths, 前置复审项核验, 处置情况（2026-10-23 回填） (+25 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.07
Nodes (41): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask() (+33 more)

### Community 33 - "parseResetTime"
Cohesion: 0.26
Nodes (9): instantOf(), MONTHS, offsetMs(), parseClock(), parseDate(), parseResetTime(), Wall, wallIn() (+1 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.11
Nodes (30): Task 10: 时间线 `wl log` 与 CLI 接入, Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Critical, Issues, Minor, TuiReader (+22 more)

### Community 35 - "api-read.test.ts"
Cohesion: 0.17
Nodes (15): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes(), WriteRouteSpec, Handler, HandlerContext (+7 more)

### Community 36 - "复审修订（2026-10-23，第二轮）"
Cohesion: 0.12
Nodes (15): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, Task 6: `wl autostart`, 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出 (+7 more)

### Community 37 - "ledger.ts"
Cohesion: 0.09
Nodes (44): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 3: 不确定错误带上 `detail.retryRequest` (+36 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.08
Nodes (30): Task 9: 前端工程与基础设施, emptyAttention(), failure(), RunTuiOptions, SIGNALS, summaryOf(), WriteFn, initialTuiState() (+22 more)

### Community 40 - "FakeOrca"
Cohesion: 0.09
Nodes (10): TerminalView, chk(), FakeOrca, orcaError(), rejectionReceipt(), mk(), newTask(), status() (+2 more)

### Community 41 - "fresh"
Cohesion: 0.07
Nodes (35): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 2. 关键事实（实测）, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时 (+27 more)

### Community 42 - "find-session.ts"
Cohesion: 0.11
Nodes (24): File Structure, Global Constraints, Review Focus, Task 2: `findSession` 按环境搜索, Task 3: `restorePost` 接线、文档, Task 4: 真机检查（人执行，逐项勾选）, 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan, 0. 实施分块与前置条件 (+16 more)

### Community 43 - "app.tsx"
Cohesion: 0.17
Nodes (24): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout() (+16 more)

### Community 44 - "雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计"
Cohesion: 0.22
Nodes (8): 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）, 3.2 角色岗位增删与职责文档内联编辑, 3. 详细设计, 5. 留给实现者决定的细节（Left to the Builder）, 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗, 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由, 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计

### Community 45 - "SpecForm.tsx"
Cohesion: 0.17
Nodes (25): AddPostDialog(), AddPostFields(), BoolField(), BUDGETS, DocArea(), Docs, FieldBase, Frame() (+17 more)

### Community 46 - "自检记录"
Cohesion: 0.10
Nodes (22): 自检记录, Task 6: Orca 同步, Global Constraints, Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, 6. 未读标记（块 b）, TypeOutcome, ScanSnapshot, attentionKeys() (+14 more)

### Community 47 - "posts.test.ts"
Cohesion: 0.08
Nodes (31): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Global Constraints, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, Step, WAIT_SUBMIT_SEC (+23 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.09
Nodes (30): Task 10：`ps` 与 `send`, File Structure, Review Focus, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, Task 7: 收尾与真机验证, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 7.1 `wl restore --all` (+22 more)

### Community 49 - "init.ts"
Cohesion: 0.18
Nodes (19): Global Constraints, Task 1: 团队模板与 `initTeamCmd`, 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan, initFromImport(), initFromTemplate(), InitTeamArgs, initTeamCmd(), InitTeamMode (+11 more)

### Community 50 - "OrcaClient"
Cohesion: 0.07
Nodes (3): 3. 调度员主循环, 15.6 岗位终端按钮（2026-11-07）, OrcaClient

### Community 51 - "tui/render.ts"
Cohesion: 0.12
Nodes (28): Global Constraints, 10. 命令, 4.1 提问的转述, 4.2 回答：`wl dispatcher reply`, 4. 收件箱消息处理, eventLine(), filterText(), Row (+20 more)

### Community 52 - "core/package.json"
Cohesion: 0.10
Nodes (21): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+13 more)

### Community 53 - "advance.ts"
Cohesion: 0.10
Nodes (27): Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, askerOf(), BatchReport, checkWorkerDone(), Ctx, handleOne(), OPTION_LIMIT (+19 more)

### Community 54 - "spec.ts"
Cohesion: 0.14
Nodes (24): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, 15.2 其他坑, 15.3 探针 4：CLI 与插件的审计一致（成立）, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, 15.5 `createSpecFacade`（2026-11-07，探针 5 前置）, 15. P0 现状（2026-11-06 已落地）, auditedCommands(), coreAuditTable() (+16 more)

### Community 55 - "6. 分级处理"
Cohesion: 0.22
Nodes (8): 11. 不做的事（阶段 2B）, 6.1 状态与推进, 6.2 动作, 6.3 静默：`wl dispatcher hush`, 6.4 两个代跑动作, 6.5 `wl attention <team>`, 6.6 巡查动作记录, 6. 分级处理

### Community 56 - "resumeCommand"
Cohesion: 0.20
Nodes (8): Global Constraints, Review Focus, Task 5: `resumeCommand`, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 3. 待探针事项（plan 的 Task 0，由人在真机上执行）, RESUME_TEMPLATES, resumeCommand(), SESSION_ID

### Community 57 - "reduce.ts"
Cohesion: 0.21
Nodes (17): rowsOf(), advanceFlow(), applyFilter(), charKey(), confirmKey(), inputKey(), menuKey(), move() (+9 more)

### Community 58 - "Settings.tsx"
Cohesion: 0.22
Nodes (13): AboutAutostart, AboutItem, AboutTeam, Pill(), AutostartBody(), AutostartCard(), DISPATCHER, LABEL (+5 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (28): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, @weiping/wingline-core@workspace:*, engines (+20 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.22
Nodes (11): about(), autostartItem(), consoleItems(), dirBytes(), orcaPathItem(), orcaVersion(), cmp(), inRange() (+3 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (19): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+11 more)

### Community 63 - "demo-question.ts"
Cohesion: 0.28
Nodes (11): winglineHome(), Args, execFileAsync, ledgerPath(), main(), openRegistry(), parseArgs(), readLedger() (+3 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.13
Nodes (33): Task 11: 前端总览页与收件箱的生命周期按钮, api, CommandHint(), ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot() (+25 more)

### Community 65 - "api-read.ts"
Cohesion: 0.13
Nodes (33): Task 2: 缓存型 OrcaClient 与纯文本工具, Task 7: SSE, 6.2 写入, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API (+25 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 68 - "雁阵 Wingline 设计总纲"
Cohesion: 0.10
Nodes (20): 10. 参考, 1.1 要解决的问题, 1.2 命名, 1.3 成功标准, 1. 目标与定位, 2. 全局约束, 3. 总体架构, 4. 分阶段路线 (+12 more)

### Community 69 - "checkParam"
Cohesion: 0.13
Nodes (17): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 8: 全量验证与收尾, 阶段 3B 复审修复 Implementation Plan (+9 more)

### Community 70 - "Panel"
Cohesion: 0.18
Nodes (14): bringUp(), dispatcherAction(), dispatcherUpOnce(), downTeam(), loadDetail(), loadPosts(), loadPreview(), openTerminal() (+6 more)

### Community 71 - "雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）"
Cohesion: 0.11
Nodes (17): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 2.1 目标, 2.2 非目标 (+9 more)

### Community 72 - "command.test.ts"
Cohesion: 0.10
Nodes (6): chooseTeams(), tuiCmd(), In, ioOf(), Out, tui()

### Community 73 - "Review Focus"
Cohesion: 0.19
Nodes (17): Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 8: 新建团队与自动恢复写接口, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, 3.3.3 需要连带修改的两处 core 函数, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`） (+9 more)

### Community 74 - "src/index.ts"
Cohesion: 0.09
Nodes (30): AuditCtx, AuditEntry, AuditOptions, clip(), Command, summaryOf(), AnyCommand, CORE_AUDIT (+22 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.25
Nodes (4): Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, closeServer(), ServerContext, TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.11
Nodes (19): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+11 more)

### Community 78 - "待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）"
Cohesion: 0.40
Nodes (5): A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）, B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher）, C. Run 重启后是否保留（需要重启 Orca，在 B 之后做）, 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）, 执行结果（2026-10-13，macOS 真机，Orca 1.4.224，由 Claude 代为执行）

### Community 79 - "cli.ts"
Cohesion: 0.09
Nodes (37): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realAutostartSys, realCommands (+29 more)

### Community 81 - "Inbox.tsx"
Cohesion: 0.19
Nodes (26): notReady(), ActionDialog(), postOf(), Section(), STALE_REASON, DispatcherNotice(), Empty(), FrozenCard() (+18 more)

### Community 82 - "Wingline 雁阵"
Cohesion: 0.11
Nodes (19): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 功能, 发布, 在 Orca 终端里跑 `wl up` (+11 more)

### Community 83 - "items.ts"
Cohesion: 0.23
Nodes (18): 7.1 统一事件结构, 7.2 行为, 7. `wl log`, action(), freezeItem(), hushItem(), inboxRows(), matchesFilter() (+10 more)

### Community 84 - "status.ts"
Cohesion: 0.47
Nodes (5): Exec, autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 85 - "signals.review.test.ts"
Cohesion: 0.09
Nodes (26): 4.4 `context_low` 的处理, hhmm(), resetClock(), signalRank(), topSignal(), LADDERS, NUDGE_GRACE_MS, TerminalSummary (+18 more)

### Community 86 - ".withTeamLock"
Cohesion: 0.24
Nodes (8): Task 11：`down`, Task 8: `restore()` 编排, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑, 2. 命令, address(), holdLock(), fakeRunning()

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
Cohesion: 0.13
Nodes (15): Global Constraints, Task 4：OrcaClient 类型化方法, Wingline 阶段 0+1（验证 + MVP）实现计划, 7.10 首期验收, 7.1 仓库结构, 7.2 组件, 7.3 Orca 可执行文件的解析, 7.5 注册表 (+7 more)

### Community 91 - "6. 修订后的针对性复审（复审五，2026-10-15）"
Cohesion: 0.25
Nodes (7): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 3. 次要项（实现时顺手处理）, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.18
Nodes (22): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, adoptDiscovered(), adoptRun(), createRun(), discoverRun(), ensureRun(), findDeadAssignees(), keepOrReclaim() (+14 more)

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
Cohesion: 0.33
Nodes (7): Review Focus, Task 2：Orca 可执行文件解析与 Windows 转义, buildCmdLine(), escapeCmdArg(), run(), exec(), CASES

### Community 98 - "NewTeamDialog.tsx"
Cohesion: 0.24
Nodes (12): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), TEAM_TEMPLATES_UI, TemplateCards() (+4 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "TestPanel"
Cohesion: 0.15
Nodes (9): INBOX, POSTS, TASKS, TEAM, TEAM, assert, MockHost, MockHostOptions (+1 more)

### Community 102 - "7. `wl tui`"
Cohesion: 0.22
Nodes (10): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+2 more)

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.23
Nodes (10): applySecurityHeaders(), decodeUrlPath(), MIME, resolveUnder(), respondEmpty(), SECURITY_HEADERS, sendFile(), sendIndex() (+2 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "open"
Cohesion: 0.33
Nodes (7): InboxView(), loadInbox(), loadTaskDetail(), loadTasks(), open(), runWrite(), TasksView()

### Community 108 - "eventRow"
Cohesion: 0.20
Nodes (3): Task 2: 注册表迁移与读写, eventRow(), logRow()

### Community 110 - "autostart/index.ts"
Cohesion: 0.13
Nodes (24): DEFAULT_WAIT_ORCA, planOf(), targetsOf(), AutostartPlan, AutostartPlatform, execWord(), installedCommand(), pathEnv() (+16 more)

### Community 111 - "apply.ts"
Cohesion: 0.15
Nodes (14): applyAutostart(), failure(), LOG_ROTATE_BYTES, removeAutostart(), Reply, rotateLog(), run(), runStep() (+6 more)

### Community 112 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 113 - "gates"
Cohesion: 0.11
Nodes (17): 11. 错误处理, 13. 不做的事（阶段 2A）, 14. 风险, 1.1 成功标准, 1. 目标与定位, 3. 全局约束补充, 5.1 建立 Run, 5.2 协调者归属：唯一规则 (+9 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.16
Nodes (32): auditedInit(), claimTask(), createDeps(), dispatcherDown(), dispatcherUp(), doneTask(), downTeam(), freezePost() (+24 more)

### Community 116 - "spec.ts"
Cohesion: 0.13
Nodes (37): File Structure, Task 1: 工作区状态探针, Task 3: `wl attention` 的 `warnings`, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`） (+29 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "README.md"
Cohesion: 0.25
Nodes (3): 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 119 - "plainText"
Cohesion: 0.50
Nodes (3): Task 8: TUI 应用与 `wl tui`, flat(), plainText()

### Community 125 - "vitest"
Cohesion: 0.09
Nodes (32): Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, Task 2: 规格的校验、写回、预演与草稿（core）, PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, thresholdsFor(), loadTeamSpec(), hit() (+24 more)

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 127 - "opus-review.test.ts"
Cohesion: 0.13
Nodes (14): Task 6: 团队与调度员生命周期写接口, 11. 不做的事（阶段 3B）, 12. 不做的事（阶段 3C）, nextRequestId(), closePost(), down(), DownOutcome, DownResult (+6 more)

### Community 129 - "plan-change.ts"
Cohesion: 0.29
Nodes (11): classify(), diffFields(), fieldView(), flatten(), LAUNCH_FIELDS, planSpecChange(), Post, PostChange (+3 more)

### Community 130 - "resolveOrcaExecutable"
Cohesion: 0.09
Nodes (28): Task 12：CLI 包, Task 1：Monorepo 骨架、错误类型与 CI, Task 3：OrcaRunner、调用日志与假 orca, Task 5：阶段 0 探针、报告与真实回执, Task 6：团队规格读取与校验, Task 7：注册表, Task 8：启动包, 文件结构 (+20 more)

### Community 132 - "雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计"
Cohesion: 0.10
Nodes (23): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 4. `team.yaml` 扩展, 10. 错误处理, 11. 测试, 13. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 1） (+15 more)

### Community 133 - "`wl console` 与 Orca 插件：功能对齐表"
Cohesion: 0.33
Nodes (5): 1. 读侧（页面 / 视图）, 2. 写侧（操作）, 3. 体验差异（有意不同）, 4. 结论与路线, `wl console` 与 Orca 插件：功能对齐表

### Community 134 - "registerBaseCommands"
Cohesion: 0.19
Nodes (13): Task 2: `wl init` CLI 命令, collect(), exitCodeOfUp(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown() (+5 more)

### Community 135 - "contract-capture.ts"
Cohesion: 0.60
Nodes (4): main(), orcaVersion(), Receipt, sanitize()

### Community 136 - "createConsoleServer"
Cohesion: 0.13
Nodes (18): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 4: 静态资源与安全响应头, File Structure (+10 more)

### Community 137 - "phase-3d2.ts"
Cohesion: 0.43
Nodes (7): longestString(), [mode, ...rest], read(), rowsOf(), { runner, client, worktree }, sample(), sleep()

### Community 139 - "brief/render.ts"
Cohesion: 0.29
Nodes (4): BRIEFING_LIMIT, files, postDefaults, spec

### Community 140 - "phase-3d1.ts"
Cohesion: 0.29
Nodes (9): Task 1: 探针 3 与 6（真机，人执行）, pick(), { runner, client, worktree }, settle(), show(), Shown, signature(), sleep() (+1 more)

### Community 141 - "雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计"
Cohesion: 0.08
Nodes (27): 10. 测试, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open`, 4.3 控制接口 (+19 more)

### Community 143 - "worktree-status.ts"
Cohesion: 0.20
Nodes (6): accepted, lengths, originalStatus, { runner, worktree }, Shown, STATUSES

### Community 144 - "plan"
Cohesion: 0.14
Nodes (14): 7.1 调用方是谁（逻辑地址）, 7.2 某个地址的真实 handle, 7.3 派发与通知, 7.4 往岗位终端打字之前的画面检查, 7. 身份、通知与画面检查, 7. 冻结的实际效果（给 2A 的命令打补丁）, 1.1 目标（Goals）, 1.2 非目标（Non-Goals） (+6 more)

### Community 145 - "self-absolute.test.ts"
Cohesion: 0.50
Nodes (3): invalid, POSIX, WIN

### Community 146 - "output.test.ts"
Cohesion: 0.27
Nodes (9): eventSummary(), flat(), logPrinter(), pad2(), renderLog(), renderTimelineEvent(), event(), report() (+1 more)

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1006 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `load.ts`, `query.test.ts`, `resolveOrcaExecutable`, `Registry`, `fake-client.ts`, `loop.ts`, `registerBaseCommands`, `escalate.ts`, `createConsoleServer`, `done.ts`, `ref_node_fs`, `brief/render.ts`, `dispatch.ts`, `client.ts`, `query.ts`, `client.ts`, `signals.ts`, `lib.ts`, `screen-signals.ts`, `advance.ts`, `posts.ts`, `.now`, `output.ts`, `cachedOrca`, `done.test.ts`, `server/index.ts`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `api-read.test.ts`, `复审修订（2026-10-23，第二轮）`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `contract-capture.ts`, `find-session.ts`, `自检记录`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `advance.ts`, `spec.ts`, `resumeCommand`, `about.ts`, `main.test.ts`, `api-read.ts`, `checkParam`, `command.test.ts`, `Review Focus`, `src/index.ts`, `cli.ts`, `signals.review.test.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `static.ts`, `autostart/index.ts`, `apply.ts`, `spec.ts`, `vitest`, `opus-review.test.ts`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `load.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09879032258064516 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `query.test.ts`, `fake-client.ts`, `resolveOrcaExecutable`, `WinglineError`, `loop.ts`, `done.ts`, `escalate.ts`, `pages.test.tsx`, `ref_node_fs`, `brief/render.ts`, `dispatch.ts`, `client.ts`, `plan`, `self-absolute.test.ts`, `output.test.ts`, `screen-signals.ts`, `signals.ts`, `cachedOrca`, `done.test.ts`, `server/index.ts`, `cellWidth`, `edit.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `parseResetTime`, `commands/log.ts`, `api-read.test.ts`, `ledger.ts`, `console.ts`, `app.test.ts`, `FakeOrca`, `find-session.ts`, `app.tsx`, `自检记录`, `posts.test.ts`, `restore/index.ts`, `init.ts`, `advance.ts`, `spec.ts`, `resumeCommand`, `Settings.tsx`, `package.json`, `about.ts`, `main.test.ts`, `demo-question.ts`, `command.test.ts`, `Review Focus`, `src/index.ts`, `signals.review.test.ts`, `Wingline 阶段 0+1（验证 + MVP）实现计划`, `static.ts`, `autostart/index.ts`, `apply.ts`, `spec.ts`, `plainText`, `opus-review.test.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `fake-client.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07804878048780488 - nodes in this community are weakly interconnected._