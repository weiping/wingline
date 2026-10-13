# 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）子项目 B —— 调度员进程、巡查信号、三级升级（提示/通知/冻结）。
- 依赖：阶段 2A（`docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`）已实现的 `teams.run_id`/`coordinator_handle`、`wl task` 命令族、Orca 原生任务状态机。
- 不含：巡查信号里的"消耗过快"（需要 token 统计，全项目目前都排除）、"原地打转"（没有可靠数据源）、"陪护"诊断岗（留作以后用 2A 的 `task-create`+`dispatch` 自然实现，本阶段不做）、冻结后的任何自动恢复/重试（`gate-resolve` 选了"retry"不会自动重新派工，见 2A spec 第 12 节）。
- 承接：总纲 5.2、5.3 节的边界说明；细节按本文档和实测结论（`spikes/REPORT.md`"补充探针：run-use 接管 + check/ack"一节）修正。

## 1. 目标

阶段 2A 让团队在没有任何后台进程的情况下也能跑任务工作流。阶段 2B 加一层自动化：

1. **调度员**：每个团队可选地起一个专用 Orca 终端 `dispatcher@<team>`，长期运行，持有 Run 的协调者身份，替团队"看着"——而不是替岗位干活。
2. **巡查**：定期检查每个有在办任务的岗位，发现"卡住了"的信号，三级升级处理，绝不杀进程。

### 1.1 与阶段 2A 的分工（重要）

阶段 2A 的 `wl task done` 已经把"跑 gate、按 `reviewed_by`/`hands_to` 建后续任务"做成了岗位自己触发的同步逻辑——**调度员看到 `worker_done` 消息时，这些事早就做完了**，不需要再做一遍。所以调度员处理 `worker_done` 的工作比总纲 5.2 节原先设想的要轻：只需要 `--ack` 掉收件箱、按需要给牵头岗递一句摘要。调度员真正新增的价值是**巡查**（2A 没有任何主动检查机制）和**作为协调者身份的长期持有者**（让 2A 的 `coordinator_handle` 在 Orca 重启后还能恢复，见第 3 节）。

## 2. `wl dispatcher` 命令

调度员**不**随 `wl up` 自动创建——团队不开它也能用 2A 的全部能力。单独开关：

- **`wl dispatcher up <team>`**：按标题查找/创建一个终端 `dispatcher@<team>`（与岗位终端同一套"按标题幂等"逻辑，复用阶段 1 的 `locatePost`），`--command` 为 `<wl 可执行文件路径> dispatcher run <team>`（不是 LLM agent，不等 `tui-idle`；创建后只确认 Orca 返回了 handle，不做进一步的就绪探测）。
- **`wl dispatcher down <team> [--close]`**：不带 `--close` 什么也不做（循环进程留给人去看，是否还活着用 `wl ps`/`terminal list` 自己判断）；带 `--close` 则 `terminal close` 这一个终端（不影响其他岗位终端，也不影响 Run）。
- **`wl dispatcher run <team>`**（由上面的终端内部运行，人也可以手动在任意终端里跑，调试用）：见第 3 节的循环体。
- **`wl dispatcher freeze <post@team> --reason <text>`** / **`wl dispatcher unfreeze <post@team>`**：人工手动触发/解除冻结，和巡查自动触发走同一套底层逻辑（见第 5 节）。

## 3. 调度员主循环

```
run-use --id <teams.run_id> --from $ORCA_TERMINAL_HANDLE --json
  → 把返回的 coordinator_handle 写回 teams.coordinator_handle
循环：
  batch = check --terminal $ORCA_TERMINAL_HANDLE --run <run_id> --wait --timeout-ms 300000 --json
  若 batch.messages 非空：
    对每条消息按 type 分发（见第 4 节），处理完后
    check --terminal $ORCA_TERMINAL_HANDLE --run <run_id> --ack <batch.deliveryId> --json
  （不管是拿到消息还是 timedOut）执行一次巡查扫描（见第 5 节）
  重复
```

- **启动即 `run-use`，不区分首次启动和重启恢复**：`run-use` 对一个当前协调者终端已经不存在（比如上次调度员终端被关闭、Orca 整个重启过）的 Run 同样成立，纯粹是值覆盖（见 `spikes/REPORT.md` 的实测）。调度员每次启动都执行这一步，简单、无状态判断。
- **`--timeout-ms 300000`（5 分钟）**：`check --wait` 超时后 `timedOut: true`，无需特殊处理，直接往下走巡查扫描——这就是总纲 5.2 节"每 5 分钟扫一次"的实现方式，不需要额外的定时器，巡查节拍就是 `check --wait` 的超时节拍。
- 进程异常退出（未捕获异常、终端被关）：下次 `wl dispatcher up` 重新拉起终端、重新 `run-use` 即可恢复，不需要专门的状态持久化（收件箱本身是 Run 级持久的，见第 4 节）。

## 4. 收件箱消息处理

`check` 返回的消息 `type` 字段，按总纲 5.2/第 2 节探针实测覆盖以下几种：

| type | 处理 |
| --- | --- |
| `worker_done` | 只 `--ack`；可选地给牵头岗发一条汇总（比如每处理 10 条批量提醒一次，避免刷屏）。任务本身的状态、gate、后续任务在 2A 的 `wl task done` 里已经处理完。 |
| `question` | 把 `subject`/`body` 转述给牵头岗（`wl send <lead@team> "<post> 问：<body>（msg id: <id>，用 orca orchestration reply --id <id> --body "<回答>" 来回复）"`）。本阶段**不**自动把牵头岗的回复关联回去——人工照着提示手动跑 `reply` 命令。 |
| `escalation` | 同 `question`：转述给牵头岗，附上消息 id。 |
| 其他（`status`/`merge_ready`/`handoff`/`heartbeat`/`decision_gate`） | 只 `--ack`，阶段 2B 不处理；预留给以后阶段。 |

## 5. 巡查

每次主循环扫描时，对该团队**当前有 `dispatched` 任务**的每个岗位（`task-list --run <run_id> --json` 里 `status=='dispatched'` 的 `assignee_handle` 去重）评估两个信号：

### 5.1 无进展

`terminal list --include-visual-layouts --json` 里该岗位对应终端的 `lastOutputAt`；若 `now - lastOutputAt > team.yaml` 里 `patrol.no_progress_minutes`（默认 20 分钟）→ 判定"无进展"。

### 5.2 闸门连败（岗位级，区别于 2A 的任务级重试预算）

`task-list --run <run_id> --json` 按 `assignee_handle` 筛出该岗位最近 `patrol.post_failure_streak`（默认 3）次**有终态**（`completed`/`failed`）的 dispatch，按时间倒序；若其中最近连续几次全是 `failed` 且达到这个数量 → 判定"闸门连败"。

> 这和 2A 的 `budgets.task.max_gate_failures` 是两回事：2A 管的是"同一个任务内部重试几次"，这里管的是"这个岗位接连几个不同任务都以失败收场"——用同一个名字容易搞混，`team.yaml` 里特意用了不同的字段名（`patrol.*` vs `budgets.*`）。

### 5.3 `team.yaml` 新增字段

```yaml
patrol:
  no_progress_minutes: 20     # 可选，默认 20
  post_failure_streak: 3      # 可选，默认 3
```

## 6. 三级升级

本地新增一张状态表，按"信号持续了几个巡查周期"决定升级到哪一级，不需要额外的定时器：

```sql
patrol_state(
  post TEXT PRIMARY KEY,       -- <post>@<team>
  signal TEXT NOT NULL,        -- no_progress | post_failure_streak
  level INTEGER NOT NULL,      -- 0（无）| 1（已提示）| 2（已通知牵头岗）| 3（已冻结）
  since TEXT NOT NULL          -- 这个 level 从什么时候开始
)

frozen_posts(
  post TEXT PRIMARY KEY,       -- <post>@<team>
  team TEXT NOT NULL REFERENCES teams(name),
  reason TEXT NOT NULL,
  frozen_at TEXT NOT NULL
)
```

每次扫描对每个命中信号的岗位：若信号已消失（无进展信号消失 = 有新 `lastOutputAt`；闸门连败信号消失 = 最近一次 dispatch 变成 `completed`）→ 删掉对应的 `patrol_state` 行（level 归零），**但已经写入的 `frozen_posts` 不受影响**——冻结是单向的，即便信号后来自己好了也需要人工 `unfreeze`（见第 10 节）。信号仍在、`patrol_state` 没有该行 → 新建一行 `level=1` 并执行下表第一档动作。信号仍在、已有该行 → 按当前 `level` 决定动作并把 `level+1`：

| 当前 level → 升级到 | 动作 |
| --- | --- |
| 0 → 1（提示岗位） | `wl send <post@team> "<巡查提示：无进展已 N 分钟 / 最近 M 次任务都失败了，需要我帮你叫人吗？>"` |
| 1 → 2（通知牵头岗） | `wl send <lead@team> "<post> 触发巡查信号 <signal>，已提示但未恢复，请关注"` **并且** `orchestration send --type escalation --to <lead 的 handle> --from <coordinator_handle> --subject "patrol: <signal>" --body "..."`（同时留痕在 Orca 自己的收件箱/界面里） |
| 2 → 3（冻结） | 写 `frozen_posts` 一行；`wl send <lead@team> "<post> 已冻结，不会再分配新任务，需要 wl dispatcher unfreeze 解除"` |

三级都不杀进程、不关终端、不动任务状态——冻结只影响"以后还能不能给这个岗位分新活"。

## 7. 冻结的实际效果（回头补丁 2A 三个命令）

`frozen_posts` 里有记录的岗位，以下 2A 命令一律拒绝（新增输入错误 `post_frozen`）：

- `wl task create --post <冻结的地址>`
- `wl task claim`（调用方是冻结的岗位）
- `wl task start`（调用方是冻结的岗位）

`wl task done`/`plan`/`list`/`show` 不受影响——冻结岗位手头正在干的任务允许正常收尾，只是不会再有新任务分给它。`wl dispatcher unfreeze <post@team>` 删除 `frozen_posts` 对应行，同时把 `patrol_state` 该岗位的 level 清零（给它一个重新开始的机会，不然下一次扫描会立刻再冻结一次）。

## 8. 错误处理

调度员循环本身不应该因为单条消息处理失败而整体退出：`check`/`send`/`reply` 任何一次 Orca 调用失败，记日志（沿用阶段 1 的 `CallLog`）、跳过这条消息（不 `--ack`，下次循环会重新拿到同一批，天然重试）、继续巡查扫描。只有 `run-use` 本身失败（比如 `teams.run_id` 对应的 Run 已经不存在）才让调度员进程退出并报错，提示人工处理（这种情况下大概率是团队的 Run 被动过手脚，不是调度员能自己恢复的）。

## 9. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | 巡查信号判定（`lastOutputAt`/失败连续性的边界条件）、三级升级的状态转移、`frozen_posts` 对 2A 三个命令的拦截 | vitest，注入假 `Registry` 和假 `task-list`/`terminal list` 数据 |
| 契约 | `run-use`/`check`/`reply`/`send --type escalation` 的回执解析 | 扩展阶段 2A 的假 orca fixture，用 `spikes/out/task-dispatch-probe/` 和本阶段手动探针的回执（脱敏）做样本 |
| 集成 | 调度员跑起来后，一个岗位连续两次任务失败 → 观察到 `wl send` 提示 → 冻结 → `wl task create --post` 该岗位被拒 | 复用阶段 1/2A 的假 `OrcaClient`/`Registry` 模式；不要求真机（真机验证留给发版前，参照阶段 1 的 `test:live` 节奏） |

## 10. 不做的事（阶段 2B）

- 不做"消耗过快"（token）、"原地打转"信号。
- 不做"陪护"诊断岗——需要时直接用 2A 的 `wl task create` + `dispatch` 建一个诊断任务派给牵头岗，不需要调度员专门支持。
- 不自动把牵头岗对 `question`/`escalation` 的回复关联回 `orchestration reply`——人工照提示手动跑。
- 不提供调度员自身的健康检查/重启触发（调度员挂了，靠人发现并 `wl dispatcher up` 重新拉起；阶段 3 的控制台再考虑可视化）。
- 冻结后不自动重试、不自动解冻。

## 11. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| `question`/`escalation` 转述给牵头岗后，人工可能忘记真正去 `orchestration reply`，worker 的 `ask` 会一直挂起 | 岗位卡在等回复上，和"无进展"信号本身会撞在一起——不是 bug，是预期内的"巡查发现了问题" | 不特殊处理；巡查的"无进展"信号本来就会覆盖这种情况 |
| `patrol_state`/`frozen_posts` 只在雁阵自己的 sqlite 里，和 Orca 的任务状态是两套独立的真相 | 如果有人绕开 `wl task` 直接用 `orca orchestration` 原生命令操作，冻结状态不会同步 | 和 2A 的信任边界一致：`team.yaml`/直接用 Orca CLI 都被当作"用户知道自己在干什么"，不做强一致性保证 |
| 每次调度员启动都无条件 `run-use` 接管协调者，如果同时有两个 `wl dispatcher run` 进程（人手滑开了两个），后启动的会把先启动的"挤下去"（`coordinator_handle` 被覆盖，但两边都不知道） | 两个调度员互相看不到对方的收件箱消费进度，可能重复处理或漏处理 | `wl dispatcher up` 的终端查找复用阶段 1 的"按标题幂等"逻辑，正常操作下不会建出第二个 `dispatcher@<team>` 终端；人为手动再跑一个 `wl dispatcher run <team>` 加一句文档提醒"同一团队同时只应该有一个调度员在跑"，不做运行时互斥锁（YAGNI，真出问题再加） |
