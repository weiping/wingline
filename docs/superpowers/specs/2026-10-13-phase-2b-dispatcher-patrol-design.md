# 雁阵 Wingline 阶段 2B：调度员与巡查熔断设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）子项目 B —— 调度员进程、巡查信号、三级升级（提示/通知/冻结）。
- 依赖：阶段 2A（`docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`）已实现的 `teams.run_id`/`coordinator_handle`、`wl task` 命令族、Orca 原生任务状态机。
- 不含：巡查信号里的"消耗过快"（需要 token 统计，全项目目前都排除）、"原地打转"（没有可靠数据源）、"陪护"诊断岗（留作以后用 2A 的 `task-create`+`dispatch` 自然实现，本阶段不做）、冻结后的任何自动恢复/重试（`gate-resolve` 选了"retry"不会自动重新派工，见 2A spec 第 12 节）。
- 承接：总纲 5.2、5.3 节的边界说明；细节按本文档和实测结论（`spikes/REPORT.md`"补充探针：run-use 接管 + check/ack"、"补充探针二"两节）修正。

> **2026-10-14 修订：** 用 Opus 复审本 spec 时发现主循环的超时处理、巡查节拍、换行传递三处和实测结论不符，本版按 `spikes/REPORT.md`"补充探针二"的结论修正了第 3、4、5、6、8 节。

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
lastScanAt = 0（进程内变量，每次 wl dispatcher run 重新从 0 开始，不持久化）
循环：
  尝试：
    batch = check --terminal $ORCA_TERMINAL_HANDLE --run <run_id> --wait --timeout-ms 300000 --json
    若 batch.messages 非空：
      对每条消息按 type 分发（见第 4 节），处理完后
      check --terminal $ORCA_TERMINAL_HANDLE --run <run_id> --ack <batch.deliveryId> --json
    若 now - lastScanAt >= PATROL_INTERVAL_MS（常量，300000，即 5 分钟；不开放给 `team.yaml` 配置，和 `--timeout-ms` 用的是同一个值，没有独立配置的必要）：
      执行一次巡查扫描（见第 5 节）；lastScanAt = now
  捕获：除"run-use 判定 Run 不存在"外的任何异常/Orca 错误都只记日志（见第 8 节），不退出循环
  重复
```

- **启动即 `run-use`，不区分首次启动和重启恢复**：`run-use` 对一个当前协调者终端已经不存在（比如上次调度员终端被关闭、Orca 整个重启过）的 Run 同样成立，纯粹是值覆盖（见 `spikes/REPORT.md` 的实测）。调度员每次启动都执行这一步，简单、无状态判断。
- **`check --wait` 的进程级超时必须比 `--timeout-ms` 本身留出余量，否则雁阵自己的 `OrcaRunner` 会先于 Orca 杀掉这次调用**：阶段 1 的 `terminalWait` 已经有这个模式（`WAIT_PROCESS_SLACK_MS = 15_000`，见 `orca/client.ts`），`OrcaClient.check()` 必须同样传 `{ timeoutMs: a.timeoutMs + WAIT_PROCESS_SLACK_MS }`，不能用 `OrcaRunner` 的默认值（120 秒，远小于这里的 300 秒）。
- **巡查节拍和"拿到消息还是超时"彻底解耦，靠 `lastScanAt` 的真实墙钟时间判断，不是靠循环跑了几次。** 这是修正总纲 5.2 节"每 5 分钟扫一次"的真正含义：如果收件箱消息很多（比如一批 `worker_done` 连续涌入），`check --wait` 会立刻返回而不是等满 300 秒，循环会跑得比 5 分钟快得多；如果每次循环跑完就无条件执行一次巡查扫描（旧版本的写法），三级升级会在几秒内被错误地推进好几级。现在的写法保证巡查扫描本身永远至少间隔 `patrol_interval_ms`，不管收件箱消息来得多频繁。
- 进程异常退出（未捕获异常、终端被关）：下次 `wl dispatcher up` 重新拉起终端、重新 `run-use` 即可恢复，不需要专门的状态持久化（收件箱本身是 Run 级持久的，`patrol_state`/`frozen_posts` 落在 sqlite，见第 4、6 节）；`lastScanAt` 清零只会让重启后的第一次扫描提前一点，不是正确性问题。

## 4. 收件箱消息处理

`check` 返回的消息 `type` 字段，按总纲 5.2/第 2 节探针实测覆盖以下几种：

| type | 处理 |
| --- | --- |
| `worker_done` | 只 `--ack`；可选地给牵头岗发一条汇总（比如每处理 10 条批量提醒一次，避免刷屏）。任务本身的状态、gate、后续任务在 2A 的 `wl task done` 里已经处理完。 |
| `question` | 把 `subject`/`body` 转述给牵头岗（`wl send <lead@team> "<post> 问：<body>（msg id: <id>，用 orca orchestration reply --id <id> --body "<回答>" 来回复）"`）。本阶段**不**自动把牵头岗的回复关联回去——人工照着提示手动跑 `reply` 命令。 |
| `escalation` | 同 `question`：转述给牵头岗，附上消息 id。 |
| 其他（`status`/`merge_ready`/`handoff`/`heartbeat`/`decision_gate`） | 只 `--ack`，阶段 2B 不处理；预留给以后阶段。 |

**转述内容带换行时的 Windows 处理：** `question`/`escalation` 的 `body` 是别的岗位（agent）写的，不受雁阵控制，可能是多行。转述用的是 `wl send`，而 `wl send` 在 Windows（`!multilineSafe`）上本来就会对含换行的消息报输入错误（总纲 7.7）——调度员这里不能像人工交互那样"改成单行再发"，必须自己兜底：转述前把 `body` 内的换行替换成空格拼成一行（信息会损失一些排版，但不会丢内容也不会炸）；原始带换行的完整内容始终还在 Orca 自己的收件箱/界面里，人工需要时可以直接看消息原文，调度员转述只是提醒，不是唯一的信息来源。

**`wl send` 返回 `send_unconfirmed`（牵头岗正忙）不算失败：** 照常 `--ack` 掉这条收件箱消息——转述没送达不代表没处理，重试转述没有意义（下一条新消息来的时候牵头岗大概率已经空了）；需要人工追查的话，`CallLog` 里有完整记录。

## 5. 巡查

每次主循环扫描时，对该团队**当前有 `dispatched` 任务**的每个岗位（`task-list --run <run_id> --json` 里 `status=='dispatched'` 的 `assignee_handle` 去重）评估两个信号：

### 5.1 无进展

`terminal list --include-visual-layouts --json` 里该岗位对应终端的 `lastOutputAt`——实测确认这是 Unix 毫秒时间戳（`number`，如 `1791941667225`），不是字符串，判断直接用 `Date.now() - lastOutputAt`，不经过 `Date.parse`，没有时区解析问题。`terminal list` 的返回里每个终端条目都带这个字段，一次调用能拿到全团队所有岗位的值，不需要对每个岗位单独 `terminal show`。若 `now - lastOutputAt > team.yaml` 里 `patrol.no_progress_minutes`（默认 20 分钟）折算的毫秒数 → 判定"无进展"。

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

这几个 `--body`/消息文本都是雁阵自己拼的固定模板（`<signal>`/`<post>` 之类的变量值本身不含换行），不会触发 Windows 的换行限制，不需要像第 4 节转述消息那样兜底；`wl send` 返回 `send_unconfirmed` 同样不阻塞 level 推进——通知没送达不代表信号消失，下一轮扫描该不该继续升级，只看信号本身是否还在。

## 7. 冻结的实际效果（回头补丁 2A 三个命令）

`frozen_posts` 里有记录的岗位，以下情形一律拒绝/跳过（新增输入错误 `post_frozen`）：

- `wl task create --post <冻结的地址>`
- `wl task claim`（调用方是冻结的岗位）
- `wl task start`（调用方是冻结的岗位）
- **2A `wl task done` 的 `reviewed_by`/`hands_to` 自动派发**（目标是冻结的岗位）：这条路径不是人工敲命令触发的，拒绝了也没有调用方可以报错给——改成"仍然建关联任务（`task-create`），但跳过 `dispatch --inject` 这一步，任务留在 `ready`"，日志里记一条提示（`CallLog` 能看到），等人工 `unfreeze` 后该岗位自己 `wl task claim`/被重新 `dispatch` 即可捡起来。这是本阶段唯一一处"冻结"没有做成硬拒绝的地方，原因是建任务这个动作（`wl task done` 的一部分）不应该因为评审对象被冻结而让原任务也失败。

`wl task done`/`plan`/`list`/`show` 不受影响——冻结岗位手头正在干的任务允许正常收尾，只是不会再有新任务分给它。`wl dispatcher unfreeze <post@team>` 删除 `frozen_posts` 对应行，同时把 `patrol_state` 该岗位的 level 清零（给它一个重新开始的机会，不然下一次扫描会立刻再冻结一次）。

**不处理的已知缺口：`budgets.team.max_in_progress_per_post`（WIP 预算）同样只在 `wl task start` 里检查，`create --post` 和 `done` 的链接派发都绕过它。** 和上面"冻结"的链接派发问题是同一类——人工直接指派、或评审/交接产生的新任务，本阶段都当作"已经有人（或 gate）明确同意了，不受自领队列的预算保护"，不在本阶段修。记在第 11 节风险表里，不在这里展开处理逻辑。

## 8. 错误处理

调度员循环本身不应该因为单条消息处理失败、甚至一次完全意外的异常而整体退出：`check`/`send`/`reply` 任何一次 Orca 调用失败，记日志（沿用阶段 1 的 `CallLog`）、跳过这条消息（不 `--ack`，下次循环会重新拿到同一批，天然重试）、继续巡查扫描。

**第 3 节循环体的"尝试/捕获"是整个循环唯一的异常边界，不是只包单条消息处理。** 这是针对一个具体教训写的：如果只在处理单条消息时 try/catch，`check --wait` 本身抛出的任何未预料错误（比如进程级超时——见第 3 节关于 `WAIT_PROCESS_SLACK_MS` 的修正——或 Orca 返回了一个没见过的错误码）都会从循环体里逃出去，整个调度员进程直接退出，而外面没有任何机制重新拉起它（阶段 2B 不做调度员自身的健康检查，见第 10 节），团队会在不知不觉中失去巡查能力，直到有人手动发现并 `wl dispatcher up`。所以循环体整体包一层：**只有`run-use` 判定 Run 本身不存在（`teams.run_id` 被动过手脚）这一种情况才真正退出进程并报错**；其余任何异常（包括 `check --wait` 自己的超时、JSON 解析失败、意料之外的 Orca 错误码）都只记日志，`sleep` 一小段时间（比如 5 秒，避免异常后立刻死循环空转）后继续下一次循环。

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
| `budgets.team.max_in_progress_per_post` 只在 `wl task start` 检查，`create --post`/`reviewed_by`/`hands_to` 的链接派发都绕过它（见第 7 节） | 一个岗位可能被人工或链接派发喂到远超预算的在办任务数 | 本阶段明确不修（这些路径都算"有人/有 gate 明确同意"，不受自领队列保护）；留给以后要做真正的"看板/限流"时再统一设计 |
| `links.builder.reviewed_by:[checker]` 与 `links.checker.reviewed_by:[builder]` 同时配置会形成环：builder 完成 → 建评审任务给 checker → checker 完成 → 又建评审任务给 builder → 无限循环 | `team.yaml` 配错时任务数无限增长，调度员和巡查都会被这些任务淹没 | 本阶段不做环检测（2A 的 `links` 校验只禁止同一岗位 `reviewed_by`/`hands_to` 同时出现，没有查全局环）；记录为已知配置风险，`team.yaml` 校验的环检测留给以后需要时再加（YAGNI，目前双人对等评审的环配置场景很少见） |
| `dispatcher@<team>` 这个终端不是"岗位"，不在 `wl ps` 的岗位列表里，也不受 `wl down --close` 管理；它死了（比如异常退出、被人手动关闭）不会在任何常规命令的输出里体现 | 调度员悄悄挂掉后，团队会在不知不觉中失去巡查能力，直到有人想起来专门去查 | 本阶段只能靠人工 `terminal list`/`wl dispatcher run` 的进程状态自行判断（见第 10 节"不提供健康检查"）；阶段 3 的控制台如果要做可视化，需要把调度员终端也纳入某种"团队概览"里，本阶段先不做 |
| 岗位终端被关闭重建后（比如异常退出被人工 `wl down --close` + `wl up` 重新拉起），它名下原来 `dispatched` 的任务的 `assignee_handle` 还指向旧终端——2A 的 `wl task done`/`start` 都按"调用方真实 handle 必须等于 `assignee_handle`"校验，新终端重新跑 `wl task done` 会报 `not_dispatched_to_you`，卡死 | 岗位重启后无法恢复自己手头正在办的任务 | 本阶段不做自动恢复（需要"把 dispatch 转移到新终端"这种更重的机制，`worker-start --retry-of` 或等价物，没有验证过）；巡查的"无进展"信号会先发现这种情况并升级给人工，人工目前只能用 `wl task escalate` + `gate-resolve` 手动决定放弃重来，还是留给阶段 3/以后再设计自动迁移 |
