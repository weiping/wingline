# Graph Report - wingline  (2026-11-07)

## Corpus Check
- 374 files · ~327,905 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 1, .cmd 1)

## Summary
- 3308 nodes · 10819 edges · 144 communities (131 shown, 13 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1752 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `45239921`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orca-sync.test.ts
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
- ledger.test.ts
- server/index.ts
- 自检记录
- edit.ts
- Screen
- 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计
- self.ts
- orca-sync.ts
- patterns.ts
- commands/log.ts
- 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计
- resolveOrcaExecutable
- load.ts
- console.ts
- app.test.ts
- Global Constraints
- fresh
- find-session.ts
- app.tsx
- 雁阵 Wingline 阶段 2A：任务工作流设计
- SpecForm.tsx
- fake-client.ts
- plan-change.ts
- restore/index.ts
- init.ts
- OrcaClient
- tui/render.ts
- CommandDeps
- gates
- create.ts
- File Structure
- autostart/index.ts
- reduce.ts
- auditedCommands
- package.json
- cli/package.json
- about.ts
- main.test.ts
- core/package.json
- TaskDetail.tsx
- 用例
- with
- errors.ts
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
- Inbox.tsx
- Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`
- client.ts
- screenGuard
- src/index.ts
- items.ts
- api-read.ts
- ledger.ts
- resumeCommand
- spec.ts
- orca.d.ts
- compilerOptions
- 7. 首期详细设计：阶段 1（MVP）
- call-log.ts
- posts
- up.ts
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
- TuiInput
- core/tsconfig.json
- cli.ts
- 雁阵岗位
- host.ts
- registerBaseCommands
- pnpm-workspace.yaml
- run.contract.test.ts
- fake-orca.mjs
- mkDeps
- builder.md
- checker.md
- NORMS.md
- uninstall.sh
- api-spec.ts
- protocol.ts
- TestWorker
- Wingline
- TeamSpec
- NewTeamDialog.tsx
- 3.4 前端界面与交互设计（`packages/web/src/`）
- screen-signals.test.ts
- core/src/audit-table.ts
- absoluteSelfCommand
- status.ts
- CallLog
- panel.check.ts
- app.ts
- WinglineError
- output.test.ts
- 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan
- .withTeamLock
- inRange

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
10. `Commands` - 46 edges

## Surprising Connections (you probably didn't know these)
- `7.1 统一事件结构` --references--> `action()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/cli/src/tui/items.ts
- `7.6 启动包` --references--> `renderBriefing()`  [INFERRED]
  docs/superpowers/specs/2026-10-10-wingline-design.md → packages/core/src/brief/render.ts
- `7.2 行为` --references--> `parseDuration()`  [INFERRED]
  docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md → packages/core/src/commands/dispatcher/controls.ts
- `Task 6: 低成本 Minor 一批` --references--> `clearDeadLock()`  [INFERRED]
  docs/superpowers/plans/2026-10-21-phase-2-3-review-fixes.md → packages/core/src/commands/dispatcher/lifecycle.ts
- `Review Focus` --references--> `fresh()`  [INFERRED]
  docs/superpowers/plans/2026-10-24-phase-3d2d-remote-environment.md → packages/core/src/commands/dispatcher/screen-signals.ts

## Import Cycles
- None detected.

## Communities (144 total, 13 thin omitted)

### Community 0 - "orca-sync.test.ts"
Cohesion: 0.09
Nodes (25): Task 2: 规格的校验、写回、预演与草稿（core）, SIGNAL_LABEL, canonical(), contentHash(), sha256(), specHash(), DEFAULT_PATROL, addTeam() (+17 more)

### Community 1 - "api-write.ts"
Cohesion: 0.13
Nodes (35): Task 11：CLI 接入——`wl dispatcher <sub>` 与 `wl attention`, Task 9: 审计包装, Task 6: 写接口, Task 6: 团队与调度员生命周期写接口, Task 7: 任务执行流写接口, Task 8: 新建团队与自动恢复写接口, 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）, Commands (+27 more)

### Community 2 - "FakeOrca"
Cohesion: 0.05
Nodes (33): harness(), CheckMessage, CheckResult, RequestShowState, TerminalView, WorkspaceStatus, chk(), seededDispatched() (+25 more)

### Community 3 - "Registry"
Cohesion: 0.05
Nodes (3): Registry, verdictRow(), addAuditor()

### Community 4 - "escalate.ts"
Cohesion: 0.16
Nodes (34): Task 11：`wl task claim` / `release` / `reassign` / `start`, Task 14：CLI 接入——`wl task <sub>`, Task 9：通用前置、查询、变迁记录、`staleReasons`, Task 3：`team.yaml` 的 `patrol` 字段 + 冻结真正生效, Task 5: 路由器与读接口, actorInTeam(), assertReleasable(), claimTask() (+26 more)

### Community 5 - "loadTeamSpec"
Cohesion: 0.09
Nodes (50): Task 10：`wl attention`、`wl dispatcher status`、`wl ps` 的调度员状态, Task 12：端到端集成测试, Task 1：`OrcaClient.check`/`reply`/`workerList`/`worktreeSet` + `lastOutputAt` + `FakeOrca` 的收件箱模型, Task 6：收件箱——去重、绕过上报核对、提问转述、`wl dispatcher reply`, Task 9：主循环——`connectDispatcher` / `loopOnce` / `runDispatcherLoop`，以及长期运行的维护, 文件结构, askerOf(), BatchReport (+42 more)

### Community 6 - "done.ts"
Cohesion: 0.13
Nodes (34): Task 12：`wl task done`, 自检记录, Delivery, DispatchOutcome, awaitDelivered(), context(), createChild(), Ctx (+26 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.07
Nodes (27): restore(), MIGRATIONS, ctxOf(), hit(), restarted(), EDITED, r6, fixture() (+19 more)

### Community 8 - "pages.test.tsx"
Cohesion: 0.08
Nodes (27): Task 10: 前端「新建团队」弹窗、侧栏与首页空态, api, resetApiForTests(), StreamProvider(), agentInput(), clone(), loaded(), Opts (+19 more)

### Community 9 - "lib.ts"
Cohesion: 0.06
Nodes (57): Task 1: 探针 3 与 6（真机，人执行）, { runner, client, worktree }, main(), sleep(), waitFile(), { runner, client, worktree }, searched, { runner, worktree } (+49 more)

### Community 10 - "up.ts"
Cohesion: 0.14
Nodes (31): 自检记录, File Structure, Task 4: 抽出拉起逻辑并写入会话标记, Task 7: 逐岗位判定与拉起, Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库, 1. 应在实现前修改, checkBriefingLimit(), postAddress() (+23 more)

### Community 11 - "dispatch.ts"
Cohesion: 0.13
Nodes (30): Task 10：派发与通知、`create`、`plan`, Task 16：端到端流程测试, Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`, Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`, 文件结构, 7.4 往岗位终端打字之前的画面检查, 6.4 写入, syncAfterChange() (+22 more)

### Community 12 - "Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）"
Cohesion: 0.13
Nodes (26): File Structure, Task 1: 工作区状态探针, Task 4: spec / about 接口、写命令表改造、`wl up --draft`, Task 5: 编辑器、关于页与草稿提醒（web）, Task 9: 文档与全量验证, Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）, 2. 方案对比与选型（Approaches）, 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`） (+18 more)

### Community 13 - "client.ts"
Cohesion: 0.12
Nodes (14): Task 15：契约测试——真实回执入库并钉住解析, createOrcaClient(), ORCA_WORKTREE_SUPPORT, OrcaEnvelope, OrcaRunner, Raw, RunOptions, json() (+6 more)

### Community 14 - "query.ts"
Cohesion: 0.05
Nodes (63): Review Focus, 雁阵阶段 2B（调度员与巡查熔断）实现计划, Task 8: `restore()` 编排, Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）, 5.2 执行步骤, staleSource(), as(), blockedWaiting() (+55 more)

### Community 15 - "signals.ts"
Cohesion: 0.11
Nodes (30): Task 7：巡查的读取与判定——`takeSnapshot` / `syncCursors` / `detectSignals`, Task 6: Orca 同步, activeHits(), detectSignals(), gateStreaks(), hasProgress(), Ladder, localHistory() (+22 more)

### Community 16 - "api.ts"
Cohesion: 0.10
Nodes (22): Task 10: 总览与时间线页, Task 9: 前端工程与基础设施, Task 5: 时间线不丢事件, Task 13: 前端任务详情页代岗位执行与关于页自动恢复, PsRow, ApiError, call(), csrfToken() (+14 more)

### Community 17 - "Edit.tsx"
Cohesion: 0.13
Nodes (27): errorText(), FormError, formHasField(), runSteps(), applyLocal(), Base, DraftBanner(), editInputs() (+19 more)

### Community 18 - "TaskDetail.tsx"
Cohesion: 0.24
Nodes (20): TimelineEvent, Page(), clock(), ErrorBox(), Loading(), SOURCE_LABEL, EventRow(), ApiState (+12 more)

### Community 19 - "screen-signals.ts"
Cohesion: 0.26
Nodes (19): advanceScreenSignals(), atDue(), AUTO_RESUME_GRACE_MS, clear(), ContextSig, Ctx, detailOf(), dueAt() (+11 more)

### Community 20 - "advance.ts"
Cohesion: 0.15
Nodes (37): Task 5：面向人的出口与人工控制——`typeTo`/`notifyHuman`、冻结、静默, Task 8：分级推进——`advancePatrol`, Global Constraints, Task 6: 画面信号的状态推进, 4.3 `usage_limit` 的处理, 4.6 状态存储与类型, act(), advance() (+29 more)

### Community 21 - "posts.ts"
Cohesion: 0.12
Nodes (19): 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan, Review Focus, Task 1: 标识与核对函数, Task 2: 接进 `settleResume` 与展示, Task 3: 文档与真机, landingResult(), noticeToken(), pause() (+11 more)

### Community 22 - "阶段 0 探针报告"
Cohesion: 0.06
Nodes (37): Task 1: Codex 会话探针, 3.1.1 内置预设模板, 3.1.2 `initTeamCmd(deps, args)` 与登记规则, 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）, claude(), 0. 前提, 1. 跑 session-id, 2. 探查会话 ID 到底在哪 (+29 more)

### Community 23 - "output.ts"
Cohesion: 0.09
Nodes (32): registerDispatcherCommands(), Awaited2, dispatcherLine(), dispatcherTitles(), DOWN_LABEL, eventSummary(), flat(), LINK_LABEL (+24 more)

### Community 24 - "api-write.test.ts"
Cohesion: 0.12
Nodes (28): CONSOLE_AUDIT, consoleCommands(), registerWriteRoutes(), WRITE_ROUTES, Handler, PARAM_RULES, RouteEntry, Router (+20 more)

### Community 25 - "ledger.test.ts"
Cohesion: 0.13
Nodes (19): Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`, Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`, adoptReceipt(), ledgered(), oneShot(), refreshCoordinator(), storedRow(), teamOf() (+11 more)

### Community 26 - "server/index.ts"
Cohesion: 0.09
Nodes (34): Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）, File Structure, Global Constraints, Review Focus, Task 1: 未预期的异常记一行日志（spec §9）, Task 2: `retryRequest` 校验类型与格式, Task 4: 3B spec 注明 M-15 的三项缺口, Task 5: 收尾 (+26 more)

### Community 27 - "自检记录"
Cohesion: 0.07
Nodes (37): 自检记录, 6. 未读标记（块 b）, Env, PatrolOps, AttentionReport, LoopOpts, resolveWorktrees(), SyncRound (+29 more)

### Community 28 - "edit.ts"
Cohesion: 0.15
Nodes (34): Task 3: `applySpecOp` 岗位增删, addPost(), appendPost(), applySpecOp(), assertPlaceable(), blockMap(), contentEnd(), deepestMap() (+26 more)

### Community 29 - "Screen"
Cohesion: 0.15
Nodes (6): at(), Screen, ScreenOut, TuiOutput, pickTeam(), MemOut

### Community 30 - "雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计"
Cohesion: 0.12
Nodes (17): 3. 核对过、确认没问题的点, 6.1 开关, 6.2 岗位状态, 6.3 worktree 汇总, 6. 同步到 Orca 原生界面（调度员）, 0. 实施分块与前置条件, 10. 错误处理, 12. 不做的事（阶段 3D） (+9 more)

### Community 31 - "self.ts"
Cohesion: 0.10
Nodes (24): File Structure, Global Constraints, Review Focus, Task 0: 分支与复审报告存档, Task 2: 安全响应头全覆盖（报告 I-9）, Task 3: selfCommand 共享（报告 I-4 / M-2）, Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）, Task 8: 全量验证与收尾 (+16 more)

### Community 32 - "orca-sync.ts"
Cohesion: 0.09
Nodes (37): Task 8: 文档——spec 漂移与 3C/3D 计划失效点, 修订记录, 4.4 `context_low` 的处理, 4.5 展示, commentLimit(), composeGroup(), Ctx, currentTask() (+29 more)

### Community 33 - "patterns.ts"
Cohesion: 0.09
Nodes (37): 3D-2 (c) 任务骨架（历史，已被可执行 plan 取代）, File Structure, Review Focus, Task 1: 样本与重置时间解析, Task 2: 模式表与 `detectScreen`, Task 4: 每轮读画面进 `previews`, Task 5: 注册表——`detail` 列与 `ScreenSignalKind`, Task 7: 展示 (+29 more)

### Community 34 - "commands/log.ts"
Cohesion: 0.12
Nodes (29): Global Constraints, Review Focus, 阶段 3B：本地 HTTP API 与控制台 Implementation Plan, Task 8: TUI 应用与 `wl tui`, Critical, Issues, Minor, TuiReader (+21 more)

### Community 35 - "雁阵 Wingline 阶段 2B：调度员与巡查熔断设计"
Cohesion: 0.14
Nodes (14): 10. 测试, 11. 不做的事（阶段 2B）, 1.1 与阶段 2A 的分工, 1.2 两条贯穿全文的底线, 1. 目标, 3. 调度员主循环, 6.1 状态与推进, 6.2 动作 (+6 more)

### Community 36 - "resolveOrcaExecutable"
Cohesion: 0.57
Nodes (5): direct(), fromExplicit(), ResolveOptions, resolveOrcaExecutable(), viaCmd()

### Community 37 - "load.ts"
Cohesion: 0.16
Nodes (18): Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first, checkLinks(), crossCheck(), environmentOf(), findHandsToCycle(), launchOf(), Links, Located (+10 more)

### Community 38 - "console.ts"
Cohesion: 0.15
Nodes (25): Task 8: 服务组装与 `wl console`, Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）, Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）, Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）, ConsoleArgs, consoleCmd(), ConsoleResult, foreground() (+17 more)

### Community 39 - "app.test.ts"
Cohesion: 0.10
Nodes (16): LineInput, initialTuiState(), TuiState, address(), FakeStdin, FAST, MemOut, on() (+8 more)

### Community 40 - "Global Constraints"
Cohesion: 0.25
Nodes (3): Global Constraints, Task 4: 未读标记（调度员）, patrolRow()

### Community 41 - "fresh"
Cohesion: 0.08
Nodes (29): 10. 测试, 11. 不做的事（阶段 3A）, 12. 风险, 1. 目标与成功标准, 3. 先补探针（plan 的 Task 0）, 4.1 生成与写入, 4.2 接回时, 4.3 标记不外泄 (+21 more)

### Community 42 - "find-session.ts"
Cohesion: 0.10
Nodes (28): Task 3: `OrcaClient.search`, Task 6: 确定会话 ID, Global Constraints, File Structure, Global Constraints, Review Focus, Task 1: `posts[].environment` 字段, Task 2: `findSession` 按环境搜索 (+20 more)

### Community 43 - "app.tsx"
Cohesion: 0.18
Nodes (21): isUnauthenticated(), App(), Expired(), Home(), Routed(), Session, Layout(), LayoutSide() (+13 more)

### Community 44 - "雁阵 Wingline 阶段 2A：任务工作流设计"
Cohesion: 0.06
Nodes (37): Task 4：OrcaClient 类型化方法, 7.4 团队规格（首期子集）, 10. 命令, 11. 错误处理, 13. 不做的事（阶段 2A）, 1.1 成功标准, 1. 目标与定位, 2. 关键事实：Orca 原生编排层（实测结论） (+29 more)

### Community 45 - "SpecForm.tsx"
Cohesion: 0.10
Nodes (34): Task 2: `patrol.unread_mark` 与 `worktreeSet({ unread })`, 一、plan 与 spec 脱节（阻塞，已处理）, 三、核对过的代码事实（成立）, 二、spec 的设计缺口（已补）, 五、遗留, 四、产出, 结论, 阶段 3D spec 与 plan 复审（第三轮） (+26 more)

### Community 46 - "fake-client.ts"
Cohesion: 0.09
Nodes (21): Task 2：注册表——心跳、巡查状态、冻结、静默、游标、提问、巡查事件, RunSummary, SendResult, seeded(), Args, bypassReport(), Executed, FakeTask (+13 more)

### Community 47 - "plan-change.ts"
Cohesion: 0.12
Nodes (23): 11. 测试, 4.1 页面 `/t/:team/edit`, 4.2 预演：`planSpecChange(current, next, { running, specPath })`, 4.3 保存与草稿, 4.4 接口（3B 的约定与安全校验，写接口进审计）, 4.5 `wl up <spec> --draft`, 4. 团队编辑器（控制台）, 15.2 其他坑 (+15 more)

### Community 48 - "restore/index.ts"
Cohesion: 0.11
Nodes (27): 阶段 3D 实现计划（索引）, File Structure, Task 3: 注册表迁移 `unread_marks`, Task 5: `wl restore --all`, 阶段 3D-1：登录后自动恢复与未读标记 Implementation Plan, 7.1 `wl restore --all`, 复审修订（2026-10-23，第二轮）, 实施记录（2026-10-25 回填） (+19 more)

### Community 49 - "init.ts"
Cohesion: 0.22
Nodes (16): Task 1: 团队模板与 `initTeamCmd`, initFromImport(), initFromTemplate(), InitTeamArgs, InitTeamMode, registerSpec(), writeTemplate(), renderBrief() (+8 more)

### Community 51 - "tui/render.ts"
Cohesion: 0.18
Nodes (19): filterText(), Row, body(), footer(), HELP, MIN_COLS, renderView(), TABS (+11 more)

### Community 52 - "CommandDeps"
Cohesion: 0.12
Nodes (29): Task 10：`ps` 与 `send`, Task 11：`down`, Task 12：CLI 包, Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）, 7.2 组件, 9.4 派发与 `epoch`, 6.2 写入, 6. 本次由设计方拍板的决定（请一并复核） (+21 more)

### Community 53 - "gates"
Cohesion: 0.12
Nodes (18): 5.1 登录, 5.2 读请求, 5.3 写请求, 5.4 通用, 5. 登录与安全, npm 安装（推荐）, Orca 可执行文件, 从源码安装（开发） (+10 more)

### Community 54 - "create.ts"
Cohesion: 0.15
Nodes (21): AuditEntry, AuditOptions, clip(), Command, summaryOf(), write(), afterCreateError(), CreateArgs (+13 more)

### Community 55 - "File Structure"
Cohesion: 0.16
Nodes (14): File Structure, Global Constraints, Review Focus, Task 1: 转述的 worker 原话中和 shell 元字符, Task 2: `--adopt-run` 不抢存活调度员的协调者身份, Task 6: 低成本 Minor 一批, Task 7: Windows CI 偶发超时, Task 9: 收尾 (+6 more)

### Community 56 - "autostart/index.ts"
Cohesion: 0.16
Nodes (14): Task 6: `wl autostart`, Exec, FsLike, Sleep, autostartInstall(), AutostartSys, DEFAULT_WAIT_ORCA, planOf() (+6 more)

### Community 57 - "reduce.ts"
Cohesion: 0.17
Nodes (21): Global Constraints, 3. 次要项（实现时顺手处理）, rowsOf(), advanceFlow(), applyFilter(), cancelled(), charKey(), confirmKey() (+13 more)

### Community 58 - "auditedCommands"
Cohesion: 0.07
Nodes (28): 10. 测试, 11. 不做的事（阶段 3B）, 12. 风险, 1. 目标与成功标准, 2. 全局约束补充, 3. 先补探针（plan 的 Task 0）, 4.1 命令, 4.2 `--open` (+20 more)

### Community 59 - "package.json"
Cohesion: 0.07
Nodes (25): devDependencies, @playwright/test@^1.64.1, tsx@^4.19.0, @types/node@^22.13.0, typescript@^5.7.0, vitest@^3.0.0, engines, node (+17 more)

### Community 60 - "cli/package.json"
Cohesion: 0.09
Nodes (23): bin, wingline, wl, dependencies, commander@^13.0.0, @weiping/wingline-core@workspace:^, description, engines (+15 more)

### Community 61 - "about.ts"
Cohesion: 0.17
Nodes (18): Review Focus, Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）, Task 9: 读接口扩展与未启动团队降级, 3.3.1 读接口扩展, 3.3.3 需要连带修改的两处 core 函数, 3.3.4 未启动团队与 Orca 不可达时的降级, 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）, about() (+10 more)

### Community 62 - "main.test.ts"
Cohesion: 0.10
Nodes (18): AUDIT, callLogOptions(), defaultMakeDeps(), installWarningFilter(), isReadOnlyCall(), which(), allDeps(), autostartWorld() (+10 more)

### Community 63 - "core/package.json"
Cohesion: 0.07
Nodes (28): dependencies, yaml@^2.6.0, zod@^3.24.0, description, engines, node, files, license (+20 more)

### Community 64 - "TaskDetail.tsx"
Cohesion: 0.15
Nodes (28): ActionButton(), AdoptRunDialog(), Candidate, dialogError(), DialogFoot(), DirectAction(), DispatcherState, DraftDialog() (+20 more)

### Community 65 - "用例"
Cohesion: 0.10
Nodes (21): 7.1 命令与视图, 7.2 按键, 7.3 操作, 7.4 数据, 7.5 渲染, 7. `wl tui`, msg(), q() (+13 more)

### Community 66 - "with"
Cohesion: 0.11
Nodes (20): runs-on, steps, jobs, e2e, test, node, os, name (+12 more)

### Community 67 - "errors.ts"
Cohesion: 0.11
Nodes (16): warningsOf(), applyDraftBeforeUp(), applyDraft(), discardDraft(), draftPathOf(), fileHash(), modeOf(), realTarget() (+8 more)

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
Cohesion: 0.13
Nodes (14): 10. 探针（阻塞实现）, 11. 实现阶段, 12. 风险, 13. 总纲修订建议（合并时改）, 14. 已确认事项（2026-11-06 定稿，取代原提问）, 1. 背景：旧约束 vs 新 API, 3. 选定架构（已拍板）, 4. 包与仓库布局（建议） (+6 more)

### Community 72 - "command.test.ts"
Cohesion: 0.13
Nodes (3): In, ioOf(), Out

### Community 73 - "autostart/plan.ts"
Cohesion: 0.15
Nodes (18): targetsOf(), execWord(), installedCommand(), pathEnv(), planAutostart(), planTargets(), plist(), Step (+10 more)

### Community 74 - "Settings.tsx"
Cohesion: 0.19
Nodes (17): Task 11: 前端总览页与收件箱的生命周期按钮, CommandHint(), Pill(), KIND, show(), SpecPreview(), DispatcherActions(), DispatcherCard() (+9 more)

### Community 75 - "TeamFeeds"
Cohesion: 0.16
Nodes (8): Assessment, Strengths, 前置复审项核验, 处置情况（2026-10-23 回填）, 阶段 3B 代码复审报告（2026-10-20）, closeServer(), cursorFrom(), TeamFeeds

### Community 76 - "web/package.json"
Cohesion: 0.13
Nodes (18): dependencies, preact@^10.27.0, devDependencies, jsdom@^26.1.0, @preact/preset-vite@^2.10.0, @testing-library/dom@^10.4.0, @testing-library/preact@^3.2.4, vite@^7.1.0 (+10 more)

### Community 78 - "Inbox.tsx"
Cohesion: 0.19
Nodes (26): notReady(), ActionDialog(), postOf(), Section(), STALE_REASON, DispatcherNotice(), Empty(), FrozenCard() (+18 more)

### Community 79 - "Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`"
Cohesion: 0.17
Nodes (4): Task 13：`wl task escalate` / `resolve` / `recover`, Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`, 12. 测试, 6. 注册表扩展

### Community 80 - "client.ts"
Cohesion: 0.13
Nodes (15): gateAndViewMethods(), inboxMethods(), Mutation, OrchestrationMethods, RawCheck, RawCheckMessage, RawTask, RawTerminal (+7 more)

### Community 81 - "screenGuard"
Cohesion: 0.33
Nodes (9): Global Constraints, Review Focus, 雁阵阶段 2A（任务工作流）实现计划, 14. 风险, 12. 风险, 5.2 信号, 6.5 `wl attention <team>`, screenGuard() (+1 more)

### Community 82 - "src/index.ts"
Cohesion: 0.19
Nodes (16): Task 4：调度员生命周期——健康判定、启动命令、`up`/`down`, addressOf(), clearDeadLock(), confirmStarted(), DISPATCHER_ACTIONS, dispatcherDown(), dispatcherLaunchCommand(), dispatcherUp() (+8 more)

### Community 83 - "items.ts"
Cohesion: 0.25
Nodes (19): action(), eventLine(), freezeItem(), hushItem(), inboxRows(), matchesFilter(), postRows(), recoverItem() (+11 more)

### Community 84 - "api-read.ts"
Cohesion: 0.12
Nodes (35): Task 10: 时间线 `wl log` 与 CLI 接入, Task 2: 缓存型 OrcaClient 与纯文本工具, Task 7: SSE, 6.1 约定, 6.2 读接口（GET）, 6.3 写接口（POST）, 6.4 SSE, 6. HTTP API (+27 more)

### Community 85 - "ledger.ts"
Cohesion: 0.26
Nodes (18): Task 3: 不确定错误带上 `detail.retryRequest`, attempt(), Ctx, DEFAULT_HINT(), hintFor(), indeterminate(), markUncertain(), OneShotCall (+10 more)

### Community 86 - "resumeCommand"
Cohesion: 0.14
Nodes (12): Global Constraints, Review Focus, Task 5: `resumeCommand`, 阶段 3A：重启恢复与审计时间线 Implementation Plan, 2. 关键事实（实测）, 3. 待探针事项（plan 的 Task 0，由人在真机上执行）, RESUME_TEMPLATES, resumeCommand() (+4 more)

### Community 87 - "spec.ts"
Cohesion: 0.17
Nodes (24): Task 12: 前端编辑页的角色增删、职责正文与保存并启动, 15.4 探针 5：3C/3E 编辑器能不能放进 components 面板（成立，不用 HTML）, currentSpec(), readDocs(), readText(), SpecEditResult, SpecForEdit, writeDocs() (+16 more)

### Community 88 - "orca.d.ts"
Cohesion: 0.09
Nodes (18): Align, Atom, AtomOptions, Disposable, Element, ElementChildrenAttribute, Gap, IconName (+10 more)

### Community 89 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, composite, declaration, jsx, jsxImportSource, noEmit, paths (+6 more)

### Community 90 - "7. 首期详细设计：阶段 1（MVP）"
Cohesion: 0.20
Nodes (11): 7.10 首期验收, 7.1 仓库结构, 7.3 Orca 可执行文件的解析, 7.5 注册表, 7.6 启动包, 7.7 命令, 7.8 错误处理, 7.9 测试 (+3 more)

### Community 91 - "call-log.ts"
Cohesion: 0.23
Nodes (9): Task 3: `terminalRead` 与 FakeOrca 的画面模型, CallEntry, CallLogOptions, createCallLog(), dayOf(), MESSAGE_FLAGS, pruneCallLogs(), lines() (+1 more)

### Community 92 - "posts"
Cohesion: 0.15
Nodes (12): lead, name, norms, posts, agent, brief, id, launch (+4 more)

### Community 93 - "up.ts"
Cohesion: 0.14
Nodes (27): Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务, Review Focus, Task 7: 收尾与真机验证, exitCodeOfUp(), adoptDiscovered(), adoptRun(), createRun(), discoverRun() (+19 more)

### Community 94 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, composite, declaration, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, skipLibCheck (+3 more)

### Community 95 - "panel.tsx"
Cohesion: 0.08
Nodes (15): PostDto, error, expanded, loading, loadPosts(), notice, openTerminal(), Panel() (+7 more)

### Community 96 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, jsx, jsxImportSource, lib, noEmit, extends (+2 more)

### Community 97 - "run.contract.test.ts"
Cohesion: 0.17
Nodes (14): Global Constraints, Review Focus, Task 13：`duo` 模板、岗位 skill、真机集成测试与 README, Task 1：Monorepo 骨架、错误类型与 CI, Task 2：Orca 可执行文件解析与 Windows 转义, Task 3：OrcaRunner、调用日志与假 orca, Task 6：团队规格读取与校验, Task 8：启动包 (+6 more)

### Community 98 - "run"
Cohesion: 0.18
Nodes (12): realAutostartSys, registerAutostartCommands(), run(), execute(), errorDoc, quoteWord(), renderAutostartInstall(), renderAutostartStatus() (+4 more)

### Community 100 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+7 more)

### Community 101 - "orca-testing.d.ts"
Cohesion: 0.18
Nodes (5): TEAM, assert, MockHost, MockHostOptions, orca/testing

### Community 102 - "README.md"
Cohesion: 0.22
Nodes (4): 升级与行为变化, 已知问题（合并后）, 遗留的 Orca 测试数据, 阶段 2A 发布说明

### Community 103 - "cli/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, resolveJsonModule, rootDir, extends, include, ../../tsconfig.base.json, references

### Community 104 - "static.ts"
Cohesion: 0.16
Nodes (17): File Structure, Task 11: 收件箱与岗位详情页, Task 12: 任务看板与任务详情页, Task 13: 端到端冒烟、CI 与文档, Task 1: 控制台标签页探针, Task 3: 登录、会话与请求校验, Task 4: 静态资源与安全响应头, applySecurityHeaders() (+9 more)

### Community 105 - "ActionDialog.tsx"
Cohesion: 0.28
Nodes (7): ActionDialogProps, FieldSpec, items, publish(), subs, toast(), ToastMsg

### Community 106 - "orca-plugin/package.json"
Cohesion: 0.18
Nodes (12): dependencies, @weiping/wingline-core@workspace:^, description, devDependencies, @types/node@^22.13.0, @types/node, @weiping/wingline-core, license (+4 more)

### Community 107 - "Wingline 雁阵"
Cohesion: 0.12
Nodes (17): License, `team.yaml` 字段速查, Wingline 雁阵, 与 Orca 自带的 `orca claude-teams` 的区别, 五步跑起来, 发布, 在 Orca 终端里跑 `wl up`, 在 Orca 里怎么用 (+9 more)

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
Cohesion: 0.11
Nodes (24): AsJson, DepsOverrides, Execute, exitCodeOfDone(), LOG_SOURCES, rawCommands, realCommands, registerTaskCommands() (+16 more)

### Community 114 - "雁阵岗位"
Cohesion: 0.33
Nodes (5): 不要做的事, 地址格式, 查看团队, 联系其他岗位, 雁阵岗位

### Community 115 - "host.ts"
Cohesion: 0.27
Nodes (12): Task 7：注册表, coreAuditTable(), winglineHome(), auditedInit(), createDeps(), openPostTerminal(), postDtos(), specForEditDto (+4 more)

### Community 116 - "registerBaseCommands"
Cohesion: 0.19
Nodes (13): Task 2: `wl init` CLI 命令, collect(), logArgs(), parseSessions(), registerBaseCommands(), restoreOptsError(), renderDown(), renderInit() (+5 more)

### Community 117 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, onlyBuiltDependencies, packages

### Community 118 - "run.contract.test.ts"
Cohesion: 0.20
Nodes (8): Task 5：阶段 0 探针、报告与真实回执, createOrcaRunner(), run(), exec(), Entry, FAKE, ROOT, runnerWith()

### Community 119 - "fake-orca.mjs"
Cohesion: 0.50
Nodes (3): argv, entry, script

### Community 120 - "mkDeps"
Cohesion: 0.15
Nodes (21): PATROL_INTERVAL_MS, REVIVE_WINDOW_MS, BACKOFF_START_MS, initialState(), LoopState, WAKE_GAP_MS, loadTeamSpec(), hit() (+13 more)

### Community 125 - "api-spec.ts"
Cohesion: 0.67
Nodes (5): assertFields(), isObj(), parseFiles(), parseSet(), registerSpecRoutes()

### Community 126 - "protocol.ts"
Cohesion: 0.40
Nodes (4): orca, PluginPanelEvents, PluginRequests, TeamSummary

### Community 129 - "TeamSpec"
Cohesion: 0.22
Nodes (8): Task 9：命令依赖、预检与 `up`, BRIEFING_LIMIT, renderBriefing(), Launch, TeamSpec, files, postDefaults, spec

### Community 130 - "NewTeamDialog.tsx"
Cohesion: 0.25
Nodes (13): DialogFooter(), DialogShell(), FormPane(), ImportFields(), importSteps(), ModeTabs(), NewTeamDialog(), TEAM_TEMPLATES_UI (+5 more)

### Community 131 - "3.4 前端界面与交互设计（`packages/web/src/`）"
Cohesion: 0.25
Nodes (8): 3.4.1 视觉、配色与按钮文案规范, 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）, 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）, 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）, 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）, 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）, 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）, 3.4 前端界面与交互设计（`packages/web/src/`）

### Community 132 - "screen-signals.test.ts"
Cohesion: 0.15
Nodes (11): CONTEXT_RENOTIFY_MS, SIGNAL_TAIL_LINES, BODY, idle, limit(), LIMIT_LINE(), MENU, TAIL (+3 more)

### Community 133 - "core/src/audit-table.ts"
Cohesion: 0.18
Nodes (6): AuditCtx, AuditTable, AnyCommand, CORE_AUDIT, ENTRIES, LooseEntry

### Community 134 - "absoluteSelfCommand"
Cohesion: 0.33
Nodes (5): 复审修订（2026-10-21，第一轮）, absoluteSelfCommand(), invalid, POSIX, WIN

### Community 135 - "status.ts"
Cohesion: 0.60
Nodes (4): autostartStatus, lingerOf(), LOG_TAIL_LINES, tailOf()

### Community 136 - "CallLog"
Cohesion: 0.40
Nodes (3): 3. 全局约束补充, 8. 长期运行, CallLog

### Community 138 - "app.ts"
Cohesion: 0.13
Nodes (17): Global Constraints, Review Focus, 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` Implementation Plan, emptyAttention(), failure(), runTui(), RunTuiOptions, SIGNALS (+9 more)

### Community 139 - "WinglineError"
Cohesion: 0.07
Nodes (35): Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件, answerError(), runPostGate(), GATE_BODY_LIMIT, GATE_OUTPUT_LIMIT_BYTES, gateBody(), gateCwd(), GateExecResult (+27 more)

### Community 140 - "output.test.ts"
Cohesion: 0.32
Nodes (7): Task 3: `wl attention` 的 `warnings`, 6.5 `wl attention` 的 `warnings`, renderAttention(), staleSections(), event(), report(), at()

### Community 142 - ".withTeamLock"
Cohesion: 0.16
Nodes (11): 1. 必须先改（阻塞实现）, 2. 应在同一轮修订里处理, 4. 从 OpenRig 吸收的功能（按建议阶段）, 5. 建议的下一步, 6. 修订后的针对性复审（复审五，2026-10-15）, 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总, 2.1 `wl dispatcher up`, 2.2 调度员是否在跑 (+3 more)

### Community 145 - "inRange"
Cohesion: 0.53
Nodes (4): cmp(), inRange(), parse(), V

## Knowledge Gaps
- **5 isolated node(s):** `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json`, `./tsconfig.base.json`, `plugin`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 975 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WinglineError` connect `WinglineError` to `orca-sync.test.ts`, `api-write.ts`, `TeamSpec`, `Registry`, `escalate.ts`, `loadTeamSpec`, `absoluteSelfCommand`, `ref_node_fs`, `done.ts`, `FakeOrca`, `app.ts`, `up.ts`, `Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）`, `dispatch.ts`, `query.ts`, `signals.ts`, `client.ts`, `lib.ts`, `advance.ts`, `posts.ts`, `output.ts`, `api-write.test.ts`, `ledger.test.ts`, `server/index.ts`, `自检记录`, `edit.ts`, `screen-signals.test.ts`, `self.ts`, `orca-sync.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `load.ts`, `console.ts`, `app.test.ts`, `find-session.ts`, `fake-client.ts`, `restore/index.ts`, `init.ts`, `CommandDeps`, `create.ts`, `autostart/index.ts`, `about.ts`, `main.test.ts`, `errors.ts`, `apply.ts`, `autostart/plan.ts`, `client.ts`, `src/index.ts`, `api-read.ts`, `ledger.ts`, `resumeCommand`, `spec.ts`, `7. 首期详细设计：阶段 1（MVP）`, `up.ts`, `run.contract.test.ts`, `static.ts`, `cli.ts`, `host.ts`, `registerBaseCommands`, `run.contract.test.ts`, `mkDeps`, `api-spec.ts`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `WinglineError` (e.g. with `Task 1：Monorepo 骨架、错误类型与 CI` and `Task 2：Orca 可执行文件解析与 Windows 转义`) actually correct?**
  _`WinglineError` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.base.json`, `../../tsconfig.base.json`, `../../tsconfig.base.json` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `orca-sync.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09009009009009009 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_fs` to `orca-sync.test.ts`, `TeamSpec`, `FakeOrca`, `api-write.ts`, `screen-signals.test.ts`, `escalate.ts`, `absoluteSelfCommand`, `NewTeamDialog.tsx`, `pages.test.tsx`, `WinglineError`, `output.test.ts`, `dispatch.ts`, `query.ts`, `signals.ts`, `client.ts`, `inRange`, `posts.ts`, `api-write.test.ts`, `ledger.test.ts`, `server/index.ts`, `Screen`, `self.ts`, `orca-sync.ts`, `patterns.ts`, `commands/log.ts`, `resolveOrcaExecutable`, `console.ts`, `app.test.ts`, `find-session.ts`, `fake-client.ts`, `restore/index.ts`, `init.ts`, `CommandDeps`, `create.ts`, `autostart/index.ts`, `package.json`, `main.test.ts`, `errors.ts`, `cellWidth`, `apply.ts`, `command.test.ts`, `autostart/plan.ts`, `Settings.tsx`, `src/index.ts`, `api-read.ts`, `resumeCommand`, `spec.ts`, `call-log.ts`, `run.contract.test.ts`, `run`, `static.ts`, `autostart/plan.test.ts`, `host.ts`, `run.contract.test.ts`, `mkDeps`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `FakeOrca` (e.g. with `Global Constraints` and `Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca``) actually correct?**
  _`FakeOrca` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `api-write.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12926829268292683 - nodes in this community are weakly interconnected._