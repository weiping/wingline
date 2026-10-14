# 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）子项目 B —— 调度员进程、巡查信号、三级升级（提示/通知/冻结）。
- 依赖：阶段 2A（`docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`，下称 2A）已实现的 `teams.run_id`/`coordinator_handle`、第 5.2 节的协调者归属规则、第 9 节的幂等账本、`task_ext.claimed_by`、`task_done` 表、`wl task` 命令族、`OrcaClient` 的 `runUse`/`runShow`/`taskList`/`terminalList`。
- 不含：巡查信号里的"消耗过快"（需要 token 统计）、"原地打转"（没有可靠数据源）、"陪护"诊断岗、冻结后的任何自动恢复/重试。
- 承接：总纲 5.2、5.3 节；细节以本文档和实测结论（`spikes/REPORT.md`"补充探针：run-use 接管 + check/ack"、"补充探针二"、"补充探针三"，下称 R3）为准。

> **2026-10-14 修订：** 用 Opus 复审时发现主循环的超时处理、巡查节拍、换行传递几处和实测不符，按"补充探针二"修正了第 3、4、5、6、8、11 节。
>
> **2026-10-14 第三次修订（本版）：** Opus 第二次复审 + R3 探针。改动：第 1.1、3 节的协调者归属改为引用 2A 第 5.2 节的唯一规则（二次修订里 2A `wl up` 每次 `run-use` 与本文调度员启动 `run-use` 互相打架），调度员在任何调用被 `consumer_fenced` 时自动收回身份，并用一把进程级锁保证同一团队只有一个调度员；启动时只有 `run_not_found` 才致命；第 2 节调度员启动命令按平台分别拼写；第 4 节收件箱转述改为"永远 ack、转述尽力而为"，修掉忙碌时刷屏和超长消息永久卡死；消息字段按 R3 实测（`from_handle`）；第 5 节"闸门连败"改用 2A 的本地 `task_done` 记录（R3：终态任务在 `task-list` 里没有 assignee），扫描范围改按 `claimed_by`；第 6 节第 2 级去掉 `send --type escalation`（R3：协调者发不了 escalation），每个岗位的升级动作互相隔离；第 7 节标题改为"四个命令"并定义冻结跳过派发的记录方式；第 10 节补"无进展"信号的结构性盲区；第 11 节风险表重写。

## 1. 目标

阶段 2A 让团队在没有任何后台进程的情况下也能跑任务工作流。阶段 2B 加一层自动化：

1. **调度员**：每个团队可选地起一个专用 Orca 终端 `dispatcher@<team>`，长期运行，持有 Run 的协调者身份，替团队"看着"——而不是替岗位干活。
2. **巡查**：定期检查每个有在办任务的岗位，发现"卡住了"的信号，三级升级处理，绝不杀进程。

### 1.1 与阶段 2A 的分工

2A 的 `wl task done` 已经把"跑 gate、按 `reviewed_by`/`hands_to` 建后续任务"做成岗位自己触发的同步逻辑——调度员看到 `worker_done` 消息时这些事早已做完，只需要 ack。调度员新增的价值是**巡查**和**收件箱转述**。

**协调者身份归谁，以 2A 第 5.2 节那张表为唯一规则**，本文不另立规则：调度员启动时、以及任何调用被 `consumer_fenced` 时 `run-use` 到自己；`wl up` 只在当前协调者终端已经不存活时才 `run-use` 回 lead，所以调度员在跑（它的终端是活的）期间 `wl up` 不会把身份拿走。调度员退出、终端被关闭后，协调者 handle 仍指向那个死终端——2A 的调用照样可用（2A 第 2 节事实 1：值匹配不看终端死活），下一次 `wl up` 会把它收回给 lead。`check` 只认当前协调者（R3-A6），这正是调度员必须持有身份的原因。

## 2. `wl dispatcher` 命令

调度员**不**随 `wl up` 自动创建——团队不开它也能用 2A 的全部能力。

- **`wl dispatcher up <team>`**：按标题查找/创建终端 `dispatcher@<team>`（复用阶段 1 的 `locatePost`），worktree 用 lead 岗位的 worktree，`--command` 为启动命令（见下），不是 LLM agent，不等 `tui-idle`。
- **`wl dispatcher down <team> [--close]`**：不带 `--close` 什么也不做；带 `--close` 则 `terminal close` 这一个终端（不影响岗位终端和 Run；不交还协调者身份，理由见 1.1）。
- **`wl dispatcher run <team>`**（由上面的终端内部运行，人也可以手动跑）：见第 3 节。
- **`wl dispatcher freeze <post@team> --reason <text>`** / **`wl dispatcher unfreeze <post@team>`**：人工冻结/解冻，和巡查自动冻结走同一套底层逻辑。

**启动命令按平台拼写**（复审 W5：Orca 终端里解释 `--command` 的是终端自己的 shell，雁阵无从得知它是 sh、cmd 还是 PowerShell）：

- POSIX：`'<node 路径>' '<main.js 路径>' dispatcher run <team>`，按 POSIX shell 单引号规则转义（`'` → `'\''`）。Linux/macOS 上 Orca 终端的 shell 是 sh 系（bash/zsh），这一形式在两者里都成立。
- Windows：只有两个路径都只含字母、数字和 `\ / : . _ -` 时，才用不加引号的 `<node 路径> <main.js 路径> dispatcher run <team>`——这一形式在 cmd 和 PowerShell 里都是合法的。路径含空格等字符时报输入错误 `dispatcher_launch_unsupported`，提示在一个手动打开、标题设为 `dispatcher@<team>` 的终端里运行 `wl dispatcher run <team>`。Windows 上这条启动路径**未在真机验证**。
- 团队名本身只含 `[a-z0-9-]`（阶段 1 校验），不需要转义。

## 3. 调度员主循环

```
持有本地进程锁 dispatcher:<team>（registry.withTeamLock 的同一张 locks 表；已被一个存活进程持有 → team_busy 退出）
connect：循环执行 run-use --id <run_id> --from $ORCA_TERMINAL_HANDLE，直到成功
  · run_not_found → 报错退出（唯一致命情形）
  · 其他错误（如 Orca 刚重启时的 runtime_unavailable）→ 记日志，退避后重试
  成功 → 把 coordinator_handle 写回 teams.coordinator_handle
state = { lastScanAt: 0, pendingAck: null, lastRelayedDelivery: null }（进程内，不持久化）
循环：
  尝试：
    batch = check --terminal $ORCA_TERMINAL_HANDLE --run <run_id> [--ack <state.pendingAck>] --wait --timeout-ms 300000
    state.pendingAck = null
    若 batch.messages 非空：处理（第 4 节；永远成功），state.pendingAck = batch.deliveryId
    若 now - state.lastScanAt >= PATROL_INTERVAL_MS（300000）：巡查扫描（第 5、6 节），state.lastScanAt = now
  捕获 consumer_fenced：run-use 收回身份（同 connect 的一次尝试），记一条警告"协调者身份曾被另一个终端拿走，已收回"，立即继续
  捕获其他异常：记日志，退避 5 秒后继续
```

- **一个调度员一把锁：** 锁表沿用阶段 1 `withTeamLock` 的实现（持锁进程死了锁会被接管），键是 `dispatcher:<team>`，与 `wl task`/`wl up` 用的团队锁互不干扰。这样"人手滑又开了一个 `wl dispatcher run`"会立即 `team_busy` 退出，不会出现两个调度员互相 `run-use` 抢身份的乒乓（二次修订里这一条是"不做运行时互斥，加一句文档提醒"）。
- **`consumer_fenced` 自愈：** 有了 2A 第 5.2 节的规则，正常操作下不会有人把身份从活着的调度员身上拿走；仍可能发生的情形是有人手动 `orca orchestration run-use`。收回一次就继续，不退出。
- **ack 随下一次 `check` 一起发**（`check --ack <上一批 deliveryId> --wait`）：`check --help` 写明 `--ack` 是"先确认上一整批，再取/等下一批"。处理完一批不单独再调一次 `check --ack`。进程在处理完、下一次 `check` 之前崩溃，重启后这一批会作为 `replayed: true` 再来一次，转述可能重复一次（见第 4 节）。
- **`check --wait` 的进程级超时留余量**：`OrcaClient.check()` 对 `--wait` 调用传 `{ timeoutMs: timeoutMs + WAIT_PROCESS_SLACK_MS }`，和阶段 1 `terminalWait` 同一个常量；否则 `OrcaRunner` 默认的 120 秒会先于 Orca 的 300 秒把调用杀掉。
- **巡查节拍按墙钟，不按循环次数**：收件箱消息密集时 `check --wait` 会立刻返回，循环跑得很快；巡查只在距上次扫描满 5 分钟时执行，所以三级升级每 5 分钟最多推进一级。
- 进程异常退出：下次 `wl dispatcher up`（终端还在则人工在终端里重跑 `wl dispatcher run`）即可恢复；收件箱是 Run 级持久的（补充探针 #2），`patrol_state`/`frozen_posts` 在 sqlite。

## 4. 收件箱消息处理

`check` 返回的消息字段按 R3-A9 实测：`id`、`type`、`from_handle`、`subject`、`body`、`payload`（JSON 字符串）。

| type | 处理 |
| --- | --- |
| `worker_done` | 不做任何事，随批次 ack。任务状态、gate、后续任务都已在 2A 的 `wl task done` 里处理完。 |
| `question` | 转述给牵头岗：`wl send <lead@team> "<发送方地址> 问：<body>（msg id: <id>，用 orca orchestration reply --id <id> --body \"<回答>\" 来回复）"`。不自动关联回复。 |
| `escalation` | 同 `question`，动词换成"上报"。 |
| 其他 | 不处理，随批次 ack。 |

**转述是尽力而为的通知，永远不阻塞 ack**（复审 M8）：转述失败（牵头岗正忙 `send_unconfirmed`、牵头岗终端不在 `post_offline`、任何别的错误）只记一条警告，这一批照样在下一次 `check` 时 ack。理由：消息的原文始终在 Orca 里（`orca orchestration check --all`、Orca 界面），转述只是提醒，不是唯一的信息来源；而"转述失败就不 ack"会造成两种实际故障——牵头岗一忙，同一批消息每次循环都被原样重放、重复转述，刷屏且没有退避；一条转述永远发不出去的消息（比如超过 `wl send` 的 4000 字符上限）会永久堵住它后面的所有消息。

转述文本的构造保证它本身能发出去：

- 发送方地址：在 `terminal list` 里找 `from_handle` 对应终端的标题；找不到写"未知岗位（<handle>）"。
- `body` 截断到 3000 字符，超出部分写"…（全文见 orca orchestration check --all）"——整条转述因此总在 4000 字符以内。
- Windows（`!multilineSafe`）上把 `body` 里的换行折成空格（`wl send` 在那里拒绝含换行的消息）。
- 同一个 `deliveryId` 已经转述过、这次是 `replayed: true` 的重放（ack 之前进程没崩、只是上一次 `check --ack` 本身失败了）→ 不再转述，只 ack。

## 5. 巡查

每次扫描对该团队**当前有 `dispatched` 任务**的每个岗位评估两个信号。"有 `dispatched` 任务的岗位"取 `task-list` 里 `status == dispatched` 的任务，按 2A 的 `task_ext.claimed_by` 归到岗位地址（不按 `assignee_handle` 反查 handle → 岗位：`claimed_by` 是 2A 里"这是谁的任务"的唯一稳定来源）。

### 5.1 无进展

`terminal list --include-visual-layouts` 里标题等于该岗位地址的终端的 `lastOutputAt`（Unix 毫秒数字，补充探针二 #5）；`now - lastOutputAt > patrol.no_progress_minutes`（默认 20）折算的毫秒数 → "无进展"。找不到该岗位的终端或 `lastOutputAt` 为空 → 同样判定为"无进展"（岗位终端没了比"没输出"更需要人看）。

### 5.2 闸门连败（岗位级）

读 2A 的 `task_done` 表：该岗位（`post` 列）最近 `patrol.post_failure_streak`（默认 3）条**已完成**（`finished_at` 非空）的判定，按 `finished_at` 倒序；条数达到阈值且全部是 `verdict = escalate` → "闸门连败"。

不用 `task-list`：R3-B4 实测已终态的任务在 `task-list` 里没有 `assignee_handle`，二次修订"按 assignee 筛最近几次终态 dispatch"的做法拿不到任何数据。本地 `task_done` 只记录经 `wl task done` 上报的结果——绕过雁阵直接用 Orca CLI 上报的不算在内，和 2A 的信任边界一致。

> 这和 2A 的 `budgets.task.max_gate_failures` 是两回事：2A 管"同一个任务内重试几次"，这里管"这个岗位接连几个任务都以 escalate 收场"，所以字段名也分开（`patrol.*` vs `budgets.*`）。

### 5.3 `team.yaml` 新增字段

```yaml
patrol:
  no_progress_minutes: 20     # 可选，默认 20
  post_failure_streak: 3      # 可选，默认 3
```

## 6. 三级升级

```sql
patrol_state(
  post TEXT PRIMARY KEY,       -- <post>@<team>
  signal TEXT NOT NULL,        -- no_progress | post_failure_streak
  level INTEGER NOT NULL,      -- 1（已提示）| 2（已通知牵头岗）| 3（已冻结）
  since TEXT NOT NULL
)

frozen_posts(
  post TEXT PRIMARY KEY,
  team TEXT NOT NULL REFERENCES teams(name),
  reason TEXT NOT NULL,
  frozen_at TEXT NOT NULL
)
```

每次扫描，对每个命中信号或已有 `patrol_state` 行的岗位：已冻结 → 跳过（不再发消息、不再改状态）；信号已消失 → 删 `patrol_state` 行（`frozen_posts` 不受影响，冻结是单向的）；信号仍在 → `level + 1`（没有行则为 1）并执行该级动作：

| 升级到 | 动作 |
| --- | --- |
| 1（提示岗位） | `wl send <post@team> "巡查提示：<无进展已 N 分钟 / 最近 M 个任务都以 escalate 收场>，需要帮忙请用 wl task escalate"` |
| 2（通知牵头岗） | `wl send <lead@team> "<post> 触发巡查信号 <signal>，已提示但未恢复，请关注"` |
| 3（冻结） | 先写 `frozen_posts`，再 `wl send <lead@team> "<post> 已冻结，不会再分配新任务，需要 wl dispatcher unfreeze 解除"` |

- **第 2 级不在 Orca 里留 escalation 消息**：二次修订写的是"同时 `orchestration send --type escalation --to <lead handle> --from <coordinator_handle>`"，R3-D3 实测协调者发 `escalation` 一律 `sender_not_assignee`（`escalation` 是 worker → 协调者方向的消息）。留痕改由本地 `patrol_state` 与 `CallLog` 里那条 `wl send` 承担。
- **每个岗位的升级互相隔离**（复审 M9）：一个岗位的动作出任何错（`post_offline`、`send_unconfirmed`——`wl send` 对后者是抛 `uncertain` 错误而不是返回值）只记警告，不中断对其他岗位的扫描。**level 在执行动作之前写入**，含义是"这一级已经尝试过"：动作失败不回滚 level，下一轮也不会重复同一级的动作，而是在信号仍在时升到下一级——通知没送达不代表信号消失，而一直卡在同一级重发同一条提示只会刷屏。冻结这一级先写本地 `frozen_posts`（不会失败于 Orca），通知牵头岗失败不影响冻结已生效。
- 三级都不杀进程、不关终端、不动任务状态。
- 这些消息都是雁阵拼的固定模板，不含换行、远小于 4000 字符。

## 7. 冻结的实际效果（给 2A 四个命令打补丁）

`frozen_posts` 里有记录的岗位：

- `wl task create --post <冻结的地址>` → `post_frozen`，在任何 Orca 调用之前拒绝。
- `wl task claim`、`wl task start`（调用方是冻结的岗位）→ `post_frozen`。
- **`wl task done` 的连接派发（目标是冻结的岗位）**：不是人工指派，拒绝了也没有调用方可以报错——子任务照建（`task-create`，`claimed_by = 目标`），**跳过派发**，`DoneResult.linkedTasks` 里这一项记 `delivery: 'skipped_frozen'`，命令输出里明确写出"已建未派发（<目标> 已冻结）"，并 `deps.warn` 一行。冻结检查在解析目标 handle **之前**做（冻结的岗位终端可能根本不在，没必要去查，也不会因为查不到而让 `done` 失败）。解冻后目标岗位自己 `wl task start <子任务>` 即可（`claimed_by` 已经是它）。注意这一项的痕迹在命令结果和 `task_ext` 里，不在 `CallLog`——跳过的调用不产生 Orca 调用，`CallLog` 里自然没有记录（二次修订"`CallLog` 能看到"的说法是错的）。

`wl task done`/`plan`/`list`/`show` 不受影响——冻结岗位手头的任务允许正常收尾。`wl dispatcher unfreeze` 删除 `frozen_posts` 行并清掉 `patrol_state` 该岗位的行（否则下一次扫描会立刻再冻结）。

## 8. 错误处理

- 主循环的"尝试/捕获"包住整个循环体，是唯一的异常边界：任何未预料的异常只记日志、退避 5 秒继续，**只有 connect 阶段的 `run_not_found` 让进程退出**（Run 本身没了，继续跑没有意义）。`consumer_fenced` 在循环里自愈（第 3 节）。
- 收件箱处理不会失败（第 4 节），所以不存在"一条消息失败拖住整批"的情况。
- 巡查扫描中单个岗位的失败被隔离（第 6 节）；`task-list`/`terminal list` 本身失败则这一轮扫描整体跳过、`lastScanAt` 不更新，下一次循环再试。

## 9. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | 信号判定边界、三级升级状态转移与按岗位隔离、收件箱"永远 ack"、转述截断/去重、冻结拦截、启动命令按平台拼写 | vitest，注入假 `OrcaClient`/`Registry` |
| 契约 | `check`（含 `from_handle`/`payload`）回执解析 | 按 `spikes/out/replay-probe/` 的真实回执做 fixture |
| 集成 | 调度员连上 → ack worker_done → 一个岗位连续 escalate → 提示/通知/冻结 → `create --post` 被拒；`wl up` 在调度员运行时不动协调者；调度员被 fence 后自愈 | 假 `OrcaClient`/`Registry` |

## 10. 不做的事（阶段 2B）

- 不做"消耗过快"、"原地打转"信号。
- 不做"陪护"诊断岗。
- 不自动把牵头岗对 `question`/`escalation` 的回复关联回 `orchestration reply`。
- 不提供调度员自身的健康检查/自动重启。
- 冻结后不自动重试、不自动解冻。
- **"无进展"信号的结构性盲区：** 它只看终端有没有新输出。一个卡在无限"thinking"转圈、或反复打印同一段内容的 agent 会一直刷新 `lastOutputAt`，永远不会触发"无进展"——这正是被排除在外的"原地打转"信号要管的情形。本阶段接受这个盲区；此类岗位只能靠"闸门连败"或人工发现。

## 11. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| `question`/`escalation` 转述后人工忘了 `reply` | worker 的 `ask` 一直挂起 | 不特殊处理；"无进展"信号会覆盖 |
| 转述是尽力而为：牵头岗忙或不在时转述丢失 | 牵头岗可能不知道有问题待答 | 原文永远在 Orca（`check --all`/界面）；不 ack 的代价（刷屏、毒消息堵塞）更大，见第 4 节 |
| `patrol_state`/`frozen_posts`/`task_done` 只在雁阵的 sqlite 里 | 绕开 `wl task` 直接用 Orca CLI 操作时冻结与连败统计不同步 | 和 2A 的信任边界一致 |
| 调度员终端还在、进程却已退出（比如未捕获的崩溃后终端停在 shell） | 协调者 handle 指向一个活终端，`wl up` 不会收回；巡查与转述停了 | 2A 调用不受影响（值匹配）；巡查停摆只能靠人发现后在那个终端里重跑 `wl dispatcher run`（进程锁会被接管）。本阶段不做健康检查 |
| 调度员挂掉（终端被关）后，团队失去巡查，且不在 `wl ps` 里体现 | 不知不觉失去巡查 | 同上；阶段 3 控制台再考虑纳入团队概览 |
| Orca 整个重启使所有在办任务的 assignee 失效（2A 第 14 节） | 巡查"无进展"会对这些岗位升级 | 这是期望行为：把需要人处理的任务暴露出来；处理方法见 2A 第 14 节 |
| `budgets.team.max_in_progress_per_post` 被 `create --post` 与连接派发绕过 | 岗位被喂超出预算 | 本阶段不修，见 2A 第 14 节 |
| Windows 上调度员启动命令未经真机验证；路径含空格时不支持自动启动 | Windows 用户可能需要手动起调度员 | 第 2 节已给出明确的报错与手动方法 |
| ack 随下一次 `check` 发出，进程在两次 `check` 之间崩溃会让同一批再来一次 | 重启后同一条转述可能重复一次 | 只影响通知、不影响任务状态；内存去重只防住"进程没崩"的重放 |
