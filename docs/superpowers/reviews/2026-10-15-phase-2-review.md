# 阶段 2（2A 任务工作流 / 2B 调度员与巡查）第四次复审汇总

- 日期：2026-10-15
- 方式：superpowers `requesting-code-review`，两位独立评审分别复审 2A、2B 的 spec 与计划，并以 OpenRig（`/tmp/openrig`，提交 0c27e69）的同类实现作为功能参照；汇总人对关键证据做了复核。
- 原则：只吸收功能与教训，不沿用 OpenRig 的术语，不复制其代码。
- 结论：**2A、2B 均为"修改后可以进入实现"。** 阻塞项是 R5（`spikes/REPORT.md` 补充探针五）尚未并入 2A，以及 2B 的"往交互提示里打回车"风险。

## 1. 必须先改（阻塞实现）

| # | 所属 | 问题 | 改法 |
| --- | --- | --- | --- |
| A-C1 | 2A spec §2 事实 10、§9.1、§11、§12；计划 Global Constraints、Task 3/4 | R5 证实 `runtime_unavailable`、`remote_runtime_unavailable`、`runtime_timeout`（CLI socket 默认 60 s，短于雁阵 120 s）、`invalid_runtime_response` 都可能已落地，Orca 自己标 `outcome_unknown`；spec 仍按"新行 + 任意 orca 错误 → 删行"。后果：首次 `run-create` 慢于 60 s 会建出第二个删不掉的 Run；连接子任务重复；`done` 卡在 `task_not_open` 永久失败。REPORT 第 430 行自注"待 2A spec/plan 修订"。 | 删行改为**正向白名单**（只有已证实在账本检查之后、且无副作用的码才删行），其余一律保留 id、退出码 3；旧行用 `orchestration request-show --request <id>` 查询"落地了没有"代替猜测；`FakeOrca` 的传输故障要能在"已执行之后"抛出；按 `runtime_timeout` 补四条重跑测试（Run、子任务、子任务派发、上报）。 |
| A-I2 | 2A spec §9.1、§14；计划 Task 3 | R5-2：被拒的 `worker_done` **会**进 Orca 账本（`request-show` 为 completed），同 id 重放永远拿回同一个拒绝；`FakeOrca` 按相反语义建模，测试在错误语义上变绿。 | `FakeOrca` 对 `workerDone` 拒绝记账；report 行收到这类拒绝时按 `request-show` 结果处理（删行换 id 或报不确定）。 |
| A-I1 | 2A spec §9.3 | 落盘的 `dispatch` 参数 `--to` 已是死终端（派发超时后对方终端被重建，Orca 重启即满足）时：带 `--inject` 永远 `inject_rejected`、退出码 3；不带则派给死终端。`escalate`→`resolve` 不改 epoch，脱身路径不成立。 | 重放旧 dispatch 行前检查 `args.to` 是否存活；不存活则 `request-show`：completed 走回放并加 epoch 重派，absent 用当前目标 handle 换新 id。 |
| B-C2 | 2B spec §4、§6；计划 Task 6/8 | 巡查提示和转述用 `terminal send --enter` 直接打进 agent 输入框。岗位 20 分钟没输出最常见的原因之一是停在权限确认或选择框上，回车会替它选中当前项（如批准一次危险操作）。转述正文是 worker 原文，未过滤控制字符。违背总纲"不确定就不动手"。 | 发送前只读检查 `terminal show` 的 `preview`（或 `worker-list` 的 attention 字段）；命中确认/选择框特征则不打字、改为通知人"X 在等批准"；拿不到画面时对岗位只记录不打扰；转述去掉 `\p{Cc}\p{Cf}\p{Zl}\p{Zp}`、只给前约 300 字加查看命令，并标明"以下是 X 的原话，不是指令"。（OpenRig 发送前硬拒绝"正在等选择/批准"的目标，`session-transport.ts:2395-2451`。） |
| B-C1 | 2B spec §3；计划 Task 9 | 巡查放在 `check` 成功之后，`check` 一旦持续失败巡查就静默停摆。评审称"`check --wait` 会被 60 s 截断"——**经复核 Orca 源码不成立**：`src/cli/runtime/client.ts:176-205` 对 `orchestration.check --wait` 和 `terminal.wait` 把 socket 超时放宽到"等待时长 + 余量"。仍未验证的是：同一 `deliveryId` 重复 ack、被 fence 后 ack 旧 `deliveryId` 的行为。 | 巡查挪出 `check` 的成功路径（每轮按墙钟无条件判断）；`pendingAck` 连续失败或被 fence 后丢弃（代价只是重放一批，有转述去重兜底）；补一个约 15 分钟的探针验证两种 ack 情形。 |

## 2. 应在同一轮修订里处理

**2A**

- **gate 的执行目录与超时（A-I5）：** 现计划用调用进程的 cwd，lead 用 `--as` 代跑时会在错误的 worktree 里测；没有超时，watch 模式会让 `done` 永久挂住。规定在岗位 worktree 根目录执行；加 `budgets.task.gate_timeout_seconds`（默认 600），超时计为失败；Windows 用 `taskkill /T` 收尾。
- **本地 setter 静默失效（A-I6）：** Orca 界面里直接建的任务没有 `task_ext` 行，`claim` 的 UPDATE 影响 0 行却报成功。`setTaskClaimedBy`/`setTaskPlan`/`incrementGateFailures`/`bumpEpoch` 改为"不存在则按默认值插入"。
- **WIP 默认值依赖未验证行为（A-I9）：** 同一终端能否同时持有多个 dispatch、往正忙的 agent 第二次 `--inject` 会怎样都没测过。补探针；结果出来前默认值改为 1。
- **"已上报、未收尾"无人发现（A-I3）+ 有主人的 ready 任务无人管（A-I4）：** 加只读的 `wl task list --stale`，列出 `task_done` 未完成、账本行 uncertain、交付不是 injected 且子任务仍 ready 的任务；2A 记录"进入 ready 的时间"，供 2B 新增"有主人的 ready 任务超过 N 分钟"信号。
- **派给死终端的任务（A-I8）：** `wl up` 在岗位循环后只读报告 `dispatched` 且 assignee 不在存活终端里的任务，按主人汇总并给出可复制的修复命令；可选 `wl task recover <id>` 打包 escalate→resolve→start。
- **Run 丢失（A-I7）：** `wl up` 遇 `run_not_found` 报专门错误码，提供 `wl up --new-run`；注册表丢失时先 `run-list` 按 objective `wingline:<team>` 找回已有 Run，避免再堆一个删不掉的 Run。
- **在线改编队（A-I10）：** `wl task` 加载规格时比对 `specHash` 与 `teams.spec_hash`，不一致报 `team_spec_changed`。
- **`ORCA_TERMINAL_HANDLE` 只在 Linux 验证（A-I11）：** spec 改为"仅 Linux 已验证"，Windows 取不到时 `actor_required` 提示 `--as` 用法。
- **审计记录（A-I12）：** 总纲承诺阶段 2 向后提供事件表，2A 决定不设，阶段 3 的时间线将无数据可取。加只追加的 `task_log`（claim、plan、start、判定、escalate、resolve、改派、epoch+1，含显式/隐式身份），`wl task show --history`；或对总纲做显式修订。
- **契约测试层缺任务（A-I13）：** 把探针回执脱敏后放进 `test/fixtures/receipts/`（`spikes/out/` 被 git 忽略），计划补一个契约测试任务；`parent_id` 字段目前没有任何证据。

**2B**

- **闸门连败自己清不掉（B-I1）：** 基于历史的条件，岗位在新任务上正常干活 10 分钟后也会被冻结，解冻后再冻结。改为新事件触发：记录已处理到第几条 `task_done`，只有新的 escalate 判定凑满 N 条才触发；跳过第 1 级；`unfreeze` 时推进游标。
- **提示让信号消失（B-I2）：** agent 回一句"收到"就刷新 `lastOutputAt`，每 20 多分钟循环一次第 1 级，永远升不到牵头岗。我们自己的提示引起的输出不算恢复（宽限期内要求任务状态变化或新 `task_done`）；第 1 级做退避（`patrol_state` 加 `last_nudged_at`/`nudge_count`/`next_due_at`）。
- **重启加速升级（B-I3）：** 按扫描次数而不是经过时间推进，调度员重启两次几秒内就冻结。升级前检查 `now - since >= PATROL_INTERVAL_MS`；`lastScanAt` 初始化为启动时刻；启动后第一轮只记录不升级。
- **派发失主信号（B-I4）：** 风险表称"Orca 重启后无进展信号会暴露孤儿任务"在常见情形下不成立（新终端有输出）。新增"任务 dispatched 但 assignee 不在存活终端、也不等于主人当前 handle"信号，直接通知并附 2A §14 的脱身命令。
- **没有面向人的出口（B-I5）：** 单岗位团队或牵头岗自己卡住时，会提示自己、通知自己、冻结自己。升级终点不能是被卡住的本人；默认不自动冻结牵头岗；`patrol.notify` 支持 webhook（Node 自带 `fetch`）或用户命令数组（`shell:false`）；加 `worktree set --comment`。
- **问题转述三处缺口（B-I6）：** `reply` 命令没带 `--from`、Linux 命令名写死 `orca`、等回答的岗位会因等待被提示乃至冻结。给出带 `--from <coordinator_handle>`、按解析出的可执行文件写的完整命令（先验证 `reply` 权限）；本地记下"已转述未过期的提问"，这些岗位的无进展改为"等待回答"并通知。
- **调度员是否在跑不可见（B-I7）：** 锁行加心跳，存活判断要求 pid 存活且心跳在 2 个周期内（防 pid 复用和重启残留）；`dispatcher up` 见终端在但心跳过期报 `dispatcher_stale`；`wl ps` 显示调度员状态。
- **启动命令（B-I8）：** Orca 终端不继承 `WINGLINE_HOME`/`WINGLINE_ORCA`，改为显式参数；Windows 默认 `C:\Program Files\nodejs\node.exe` 带空格，按现设计几乎总是不支持，改用 PATH 上的 `node` 加双引号参数；启动后确认心跳出现。
- **长期运行资源（B-I9）：** CallLog 只在启动时清理，按日期变化清理；只读轮询只记摘要；每轮按 `specHash` 重新加载规格，失败沿用旧规格并告警（现在会直接退出，与"只有 `run_not_found` 致命"矛盾）。
- **睡眠唤醒（B-I10）：** 循环间墙钟间隔超过 2 倍预期视为刚唤醒，"无进展"按 `max(lastOutputAt, 唤醒时刻)` 计算并跳过一轮升级。

## 3. 次要项（实现时顺手处理）

- 2A：总纲 §2.4 回写"gate 经 shell"这第二个例外；`refreshCoordinator`、`connectDispatcher` 只 UPDATE 协调者一列，不整行 upsert；fence 换 id 重建时从落盘 args 取回 `inject`/`self`；`bumpEpoch` 改 compare-and-set；写明两个并发 `done` 会各跑一次 gate；gate 输出文件存全量、`--body` 取末尾；补 `show` 对 `hands_to` 的"已转交给"；`links` 拒绝自引用；`escalate` 对已 completed 任务给警告；`wl task` 先查一次 `status`；§1.1 的"原样重跑不重复"对 `create`/`escalate` 改措辞；风险表记 Orca 账本会被清理；写明 `requests` 账本行是语义状态，只能清理"任务已终态且收尾"的行。
- 2B：真实 `check` 回执放进 fixtures 并映射 `cancelled`/`connectionLost`；总纲 §5.2/§5.3 未做的项补进"不做的事"；提示文本用实际分钟数并说明 escalate 会收回派发；`dispatcher up` 用注册表里 lead 的 worktree 选择器；退避改指数并设上限；`resolve --reassign` 到冻结岗位要拦截，`unfreeze` 列出被跳过派发的子任务；验证重放时 `deliveryId` 是否不变；写明巡查实际节拍是 5–10 分钟、从命中到冻结最长 20 分钟。

## 4. 从 OpenRig 吸收的功能（按建议阶段）

| 功能 | OpenRig 参照 | 雁阵里的做法 | 阶段 |
| --- | --- | --- | --- |
| 交付与收尾可见 | `queue-repository.ts:3610` 未投递查询、`:3785` 投递账；`outbox-handler.ts:16-28` 不确定不升不降 | `wl task list --stale`（见第 2 节） | 2A |
| 放弃认领与改派 | `queue-repository.ts:2343` unclaim、`:3843` 改换目的地并记来源 | `wl task release`、`wl task reassign --to`（dispatched 时代做 escalate→resolve） | 2A |
| 升级带证据、送到人 | `human-route-enforcer.ts:263-298`；无目标落到人（CHANGELOG 第 2192 行） | gate 提问附输出路径或末尾几行；escalated 后尽力通知牵头岗一次 | 2A |
| 任务变迁记录 | `queue-transition-log.ts:16-45`（含身份来源，#131 之后加） | `task_log` + `show --history` | 2A |
| 记下"以什么方式结束" | `hot-potato-enforcer.ts:88-177` | `task_done.result` 加结束方式（完成/转交/送审/升级） | 2A |
| 回收派给死终端的任务 | `queue-repository.ts:3937` 按代际批量释放 | `wl up` 只读报告 + 可选 `wl task recover` | 2A 报告，2B 自动 |
| 投递前检查交互提示 | `session-transport.ts:2395-2451` | 见 B-C2 | 2B |
| 提醒退避、同一情况只提醒一次 | `queue-wait-backoff.ts:120-148` | 见 B-I2 | 2B |
| 面向人的通知出口 | `mission-control/notification-dispatcher.ts`（ntfy/webhook，尽力而为、每条一次） | `patrol.notify`（webhook 或命令数组） | 2B |
| 巡查循环自身心跳 | `queue-stuck-sweep.ts:62-80` | 见 B-I7，`wl dispatcher status` | 2B |
| 巡查动作历史 | `watchdog-history-log.ts:4-17`（只记发送/跳过/终止） | `patrol_events` 只追加表 | 2B |
| "需要人处理"汇总 | `feed/attention-aggregator.ts`（每个来源的状态显式列出） | `wl attention <team>`：冻结、升级中、待决 gate、未答提问 | 2B 命令行，阶段 3 页面 |
| 定时器第一个间隔不立即触发 | `watchdog-due.ts:26-34`（CHANGELOG #860） | 见 B-I3 | 2B |
| 打进输入框的文字清洗、限长 | `queue-nudge-text.ts:1-35` | 见 B-C2 | 2B |
| 人工打字时暂停自动投递 | `seat-delivery-guard.ts:115-136` | `wl dispatcher hush <post> [--for 30m]`；画面识别放阶段 3 | 2B 开关，阶段 3 识别 |
| 区分卡住原因（终端不在、派发失主、等回答、用量上限、等批准） | `agent-state-taxonomy.md`；用量上限按"未知"不按空闲（#973） | 前三种 2B 用现有数据判；后两种靠 `preview` 解析 | 2B 部分，阶段 3 部分 |
| 停滞/从未开始作派生判定 | `queue-pickup.ts:31-90`；`workflow-deadline.ts` | 2A 存"进入 ready 时间"，2B 判定 | 2B |
| 截止时间与逾期 | `hot-potato-enforcer.ts:184-197`、`findOverdue` | `budgets.task.max_minutes`，`list --overdue` | 2B（2A 存时间戳） |
| 两种保留契约分开 | `queue-retention.ts:5-30` | 账本只清理已收尾行；CallLog、gate 文件按天删 | 2A 写进文档 |
| 上下文快满 | `health-policy.ts:18`、`claude-compaction-enforcer.ts` | 读 `preview` 余量提示 → 通知人；换班属 `wl shift` | 阶段 3–4 |
| 接收方拒收、依赖阻塞自动解除、转手次数上限 | `inbox-handler.ts`、`propagateBlockerCompletion`、`workflow-deadline.ts:216-238` | 价值较低，暂不做 | 阶段 4 以后 |

模板与文档层面另有一条：OpenRig 把默认权限模式改成不弹窗，以消除"自治 agent 卡在权限弹窗上没人点"（CHANGELOG 第 2039-2047 行）。雁阵可在 `duo` 模板和文档里建议岗位 `launch` 使用不弹交互确认的模式，从源头减少 B-C2 的场景。

## 5. 建议的下一步

1. 补两个真机探针（约半小时）：
   - `check` 的 ack：同一 `deliveryId` 确认两次；被 fence 后确认旧 `deliveryId`；重放时 `deliveryId` 是否不变。
   - 同一终端同时持有多个 dispatch；往正忙的 agent 第二次 `--inject`。
2. 按第 1、2 节修订 2A、2B spec（2A 以 R5 为主线），再同步两份计划，`FakeOrca` 语义与测试一并改。
3. 第 4 节中标为 2A/2B 的吸收项，挑选后并入同一轮修订；其余写进总纲的阶段规划。
4. 修订后做一次针对改动的复审，再进入 2A 实现。

## 6. 修订后的针对性复审（复审五，2026-10-15）

对 f9d3744..b7b95bc 的修订做了一次独立复审，结论"修改后可以实现"。提出的问题与处理：

| # | 问题 | 处理 |
| --- | --- | --- |
| C-1 | "无进展"复活后被旧输出清除，在清除/复活之间来回切换 | 2B spec §6.1：输出证据改为 `lastOutputAt > max(level_at, last_nudged_at + 宽限)`，清除与复活时置空 `last_nudged_at`；计划 Task 7/8 同步并加测试 |
| C-2 | 旧轮次未收尾的判定永远挂着，代为收尾可能对新一轮跑 gate 并上报 | 2A：加 epoch 时把上一轮未收尾判定收尾为 `abandoned`；`done_unfinished` 只看当前 epoch；`done` 增加只续跑模式 `resumeEpoch`（`verdict_missing`）；2B 代为收尾只用这个模式 |
| C-3 | 唤醒检测只看墙钟间隔，慢循环与测试都会被误判 | 改为比较墙钟与单调时钟的经过时长（阈值 60 秒）；`CommandDeps.monotonic`，假时钟分 `advance`/`sleepJump` |
| I-1 | 回到 shell 提示符的终端被判为可打字 | 2A §7.4：最后一行像 shell 提示符 → `unknown`；外来文本 `neutralize()` 中和 shell 元字符；`wl up` 启动包也先做画面检查 |
| I-2 | FakeOrca 的 `request-show` 回执形状与 `fromReceipt` 不符 | FakeOrca 账本另存原始回执形状 |
| I-3 | 通知事件重复记录，与测试断言矛盾 | 给牵头岗打字记 `notify_lead`，`notify` 每次通知恰好一条 |
| I-4 | `runDispatcherLoop` 测试会挂住 | 用 deferred 控制第一个调度员停在 `check` 里 |
| I-5 | 慢扫描/重试期间可能被第二个调度员接管 | 心跳在每一步之间写；接管阈值 600 秒（显示失联仍是 180 秒）；`heartbeat()` 返回是否仍持有，否则 `dispatcher_superseded` 退出 |
| I-6 | 代为收尾的计数规则不清 | 进入第 1 级即第 1 次，之后每周期一次，第 3 次失败立即升级 |
| I-7 | `recover` 中断在加 epoch 之后无法续跑 | 本地记录 `recover:<task>:open` 存下 dispatch_id 与 epoch，键改用 dispatch_id，记录存在时跳过前置检查 |
| 次要 | 取画面范围、FakeOrca 故障注入范围、自动 recover 的主人存活条件、`--overdue`、`duo` 模板建议、`overdue` 文本里的 `#epoch`、`escalate` 权限 | 均已在 spec/计划中写明或补上 |
