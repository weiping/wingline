# 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计

- 日期：2026-10-16（2026-10-23 按两轮复审重写第 3–8、10–13 节，见末尾“复审修订”）
- 状态：**3D-1（块 a + b）已实现**，真机验证见 `spikes/REPORT.md` “3D-1 真机验证”（launchd 最小环境、`restore --all --actor autostart`、未读红点已通过；由登录触发的恢复与 Linux 真机尚未验证）；**3D-2（块 c + d）未开始**，等探针 2、4 —— 实现计划拆成两份，索引见 `docs/superpowers/plans/2026-10-16-phase-3d-screen-signals-remote-autostart.md`：3D-1（块 a + b）`docs/superpowers/plans/2026-10-23-phase-3d1-restore-all-autostart-unread.md`，3D-2（块 c + d，探针后写）
- 范围：阶段 3 的收尾子项目 D，集中前面各份 spec 推迟到阶段 3 的事项：
  1. 读画面的巡查信号：“上下文快满”（`context_low`）与“用量上限”（`usage_limit`）；
  2. 远端 / 配对环境（如 Lima VM）里岗位的会话恢复：字段与 `--session` 手工恢复先做，自动搜索待探针；
  3. 有新待办时给牵头岗所在的 workspace（worktree）打未读标记（`orca worktree set --unread`；Orca 标记的是 workspace，不是终端）；
  4. 登录后自动恢复：`wl restore --all` 与 `wl autostart`。
- 依赖：阶段 3A（`docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md`，下称 3A：`wl restore`、会话标记、`auditedCommands`）、阶段 3C（`docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md`，下称 3C：Orca 卡片注释的信号标记、`orca-sync.ts`、`worktreeSet`）、阶段 2B（巡查循环、`patrol_state`/`patrol_events`、分级处理、“不通知自己”、退避、重启后首轮只观察、`patrolDelta` 规格哈希规则、`wl attention`）、阶段 2A（`screenGuard` 与其模式表、`typeTo`）。
- 不含：往终端里打 `/compact` 等命令、自动探测岗位所在环境、替用户启动 Orca、用户自定义画面模式、token 用量统计与“消耗过快”信号、“原地打转”信号与“陪护”诊断岗。
- 承接：2B 第 11 节“上下文快满、用量上限需要解析画面，阶段 3”；3A 第 11 节“配对 / 远端环境的会话搜索”“开机自动执行 restore”；3C 第 12 节“未读红点”。

## 0. 实施分块与前置条件

四块可以独立落地，顺序与依赖如下（每块的任务与验收点见对应 plan：块 (a)(b) 在 3D-1，块 (c)(d) 在 3D-2）：

| 块 | 内容 | 前置 | 先后 |
| --- | --- | --- | --- |
| (a) | `wl restore --all` + `wl autostart`（macOS / Linux） | 无探针依赖；3A §5.2 例外（“接回未定案不报 kept”）已落地 | 最先 |
| (b) | 未读标记（`worktreeSet({ unread })`） | 无探针依赖；Orca 红点由 Orca 在用户查看时清除（探针 3 已核实） | 次之 |
| (c) | 画面信号（`context_low` / `usage_limit`） | 探针 1、2 定案之后才能做（`terminal show` 只有约 300 字符，读不到 40 行） | 再次 |
| (d) | 远端环境 | 字段校验 + 规格哈希 + `--session` 手工恢复不依赖探针（可提前）；自动搜索等探针 4 | 最后 |

Windows 自启动（`schtasks`）单列，等探针 5。

plan 按此拆成两份：**3D-1**（块 a + b；探针只有 3 和 6，可立即开工）与 **3D-2**（块 c + d；探针 1、2、4 出结论后再写）。3D-1 里的 Windows 只落到 `autostart_unsupported`。

## 1. 目标与成功标准

- 岗位因为上下文快满或用量用完而停下时，人能及时知道；用量用完期间不会被误判为“无进展”而一路升级，重置时间过后（加宽限）岗位被提醒继续。
- agent 跑在 Lima VM 等远端环境里的岗位，重启后能用 `wl restore <team> --session <post>=<id>` 在该环境里接回原会话；能否自动搜索会话取决于探针 4。
- 有新的待办时，Orca 侧栏里牵头岗所在的 workspace 出现未读标记。
- 机器重启、重新登录后，不需要人手动操作，团队在 Orca 就绪（且终端列表稳定）后自动恢复。

成功标准：

- 一个 Claude 岗位画面上出现用量上限提示：牵头岗与外部通知各收到一次通知；到重置时间之前该岗位不出现“无进展”的提醒、通知与冻结；重置时间 + 2 分钟宽限之后岗位收到一行“继续”提示（不等待“提示消失”），信号清除，且 `no_progress` 的计时从该时刻重新开始。
- 岗位写了 `environment: lima-agent`：`wl restore duo --session builder=<id>` 用 `claude-lima --resume <id>` 接回；没给 `--session` 时报 `uncertain` 而不是新开一个丢上下文的会话。
- `wl attention` 新出现一条待办：牵头岗所在的 worktree 被标为未读；同一批待办不重复标记。
- `wl autostart install` 后重新登录：Orca 就绪后所有运行中的团队被恢复，`autostart.log` 记录结果，时间线上每个团队一行、执行者为 `autostart`。

## 2. 全局约束补充

1. 画面信号只用于通知与暂停升级：不往终端里打任何命令（继续提示除外，且必须经 `screenGuard` 判定为 `clear`），从不冻结。它们的状态行不参与 `advancePatrol` 的推进与清除（第 4.6 节）。
2. 新增 `team.yaml` 字段取默认值时不进规格哈希：`patrol.unread_mark` 走 2B 的 `patrolDelta`；`posts[].environment` 未写时不出现在哈希输入里（`spec/hash.ts` 的 `posts` 映射里条件展开，与 `patrolDelta` 同一风格）。
3. `wl autostart` 只创建、修改、删除属于雁阵自己的那一个文件或计划任务；系统命令以绝对路径、参数数组启动，不经 shell。
4. 函数 ≤ 50 行。

## 3. 待探针事项（plan 的 Task 0，由人在真机上执行）

先量取、再决定；没有探针结论的事项在正文里写成“待探针 N”，依赖它的任务在 plan 里标“探针后执行”。结论写回 `spikes/REPORT.md`。

| 编号 | 问题 | 现状 | 决定什么 | 不成立时的退路 |
| --- | --- | --- | --- | --- |
| 1 | `terminal show` 的 `preview` 真实窗口；`orca terminal read --terminal <h> --screen --limit N` 能否稳定拿到状态栏与限额行 | 实测 `preview` 只有末尾约 300 字符、首行被截断（`spikes/out/session-id/{darwin,linux}/terminal-show.json`、`spikes/out/explore/linux/show.json` 长度均为 300；REPORT.md:448、491）。`--screen` 已在 `test/live/duo.live.test.ts:79` 使用，`--limit` 未验证。默认流式输出会被 TUI 重绘搅乱，必须带 `--screen`。**2026-10-23 已在真机核实**（普通命令行输出，macOS）：`--screen --limit 8/40/80` 恰好返回最后 N 行，上限为渲染出的屏幕行数（实测 80），文本在回执的 `terminal.tail`（行数组），`source` 为 `screen`；`preview` 只有 53 字符 / 6 行。全屏 TUI 的状态栏是否出现在 `tail` 里待探针 2，见 `spikes/REPORT.md` “3D-2 探针 1” | 第 4.2 节读取方式；块 (c) 能否开工 | `terminal read` 也读不到所需行数 → 块 (c) 整体搁置，不拿 300 字符窗口硬凑 |
| 2 | Claude Code / Codex“上下文将满”“用量上限”的真实措辞；限额重置后提示是否仍留在屏幕上；**用量上限是普通文字，还是带编号选项的阻塞菜单**（此时 `screenGuard` 会判成什么） | 仅有推测措辞，没有样本 | 模式表内容；第 4.3 节第 3 步的分支（限额以菜单呈现时“继续”发不出去，走该步的放弃分支） | 抓不到的 agent / 信号不写模式行；用文档原文做样本时在文件头注明“文档来源，未截屏”，对应测试名标 `(provisional)` |
| 3 | `worktree set --unread` / `--read` 的行为；Orca 红点何时自动清除；写 `--comment` / `--workspace-status` 是否改变未读状态 | 引自复审对 `orca worktree set --help` 的转述（`--unread\|--read`，“Mark the workspace unread in the sidebar”）；仓库内无记录 | 第 6 节的写入顺序与“已标记过”的含义 | 不起作用 → `ORCA_WORKTREE_SUPPORT.unread = false`，`wl attention` 告警提示一次“Orca 不支持未读标记” |
| 4 | `orca search --environment <env>` 的命中是否带 `snippet` / `cwd`，`cwd` 是 VM 内路径还是空 | `--environment` 命中扣留 evidence（`snippet` 为 null，REPORT.md:468）；`cwd` 形态未知。**2026-10-24 已在真机重新核实（Orca 1.4.237，已配对环境 `lima-agent`）：结论与 3A 相反**——15/15 条命中带 `snippet`（含 `[[…]]` 高亮）、无 `resumeCommand`，`cwd` 是宿主机路径（Lima 默认把 home 以同样路径挂进 VM）；没有同路径挂载的 VM 里 `cwd` 形态仍未验证。见 `spikes/REPORT.md` “3D-2 探针 4” | 第 5.3 节自动搜索是否可做 | 无 `snippet` → 不做自动搜索，只支持 `--session`（第 5.2 节即最终形态） |
| 5 | Windows：`schtasks /TR` 的长度上限（Windows 文档称 261 字符，未验证）；`/SC ONLOGON` 是否需要管理员 | 未验证 | 第 7.2 节 Windows 一行 | Windows 返回 `autostart_unsupported`，README 给手工做法 |
| 6（补充） | Orca 启动后终端列表需要多久才稳定（重启后 Orca 会重新纳管并重新拉起终端，REPORT.md:152） | **2026-10-23 已量**（macOS，Orca 1.4.237，一次运行，5 个终端）：重启后约 11 秒不可达，可达后 28 秒终端数才从 2 → 1 → 2 → 3 稳定（平台期最长约 15 秒），重启前 5 个、重启后只剩 3 个。见 `spikes/REPORT.md` “3D-1 探针 6” | 第 7.1 节 `--wait-orca` 的稳定判据常量 | 间隔 10 秒、连续 4 次相同（要求稳定 30 秒，约为实测平台期的两倍）；README 说明可手动重跑 |

## 4. 读画面的巡查信号（块 c，探针 1、2 之后）

### 4.1 模式表

新建 `packages/core/src/screen/patterns.ts`：

- 把 2A `screenGuard` 现有的判定（`at_prompt`、`shell`）连同其模式迁入本模块，`classifyPreview` / `screenGuard` 改为调用它；行为不变，原有测试照跑。`ScreenState`（`'clear' | 'at_prompt' | 'shell' | 'unknown'`，`unknown` 表示空画面）定义在本模块，`notify.ts` 重新导出。
- 新增两种信号，按 agent 分行：

| 信号 | 含义 | 提取 | 模式 |
| --- | --- | --- | --- |
| `context_low` | 上下文快满 | 剩余百分比（`percent: number \| null`） | 以探针 2 的样本为准。Claude Code 状态栏的 `Context left until auto-compact: N%`（N ≤ 10 成立）是已知形态，仍须样本确认；只有明确的“快满”文字而无数字时也成立，`percent = null` |
| `usage_limit` | 用量用完 | 重置时间（`resetsAt: Date \| null`） | **待探针 2**：真实措辞与重置后提示是否留屏都未知。模式表不预先写入推测措辞（原稿里的 “usage limit reached … resets” 是推测，不要照写）；没有样本的 agent 不写这一行 |

- 每个命中同时带 `notice`（命中的那一行原文），用于去重指纹：`noticeHash = sha256(notice).slice(0, 12)`。
- 同一 `kind` 在窗口内多处命中时**只取最靠近画面底部的一处**（最新的提示）；它的 `noticeHash` 若等于已处理行的 `noticeHash` 则视为同一条，不再触发（第 4.3 节第 5 步）。
- 窗口是屏幕尾部而不是状态行，agent 复述或用户粘贴的限额文字也会落在其中，所以模式必须锚定到 agent 状态行 / 提示框的格式（行首标记、固定前缀），不能只匹配关键词；负例见第 11 节。
- 重置时间解析支持：`3pm`、`3:30pm`、`15:00`、带括号时区（如 `(Asia/Shanghai)`）、`in 2h`/`in 45m`；只有时刻没有日期时取“今天或明天中最早的未来时刻”；无时区时按本机时区。解析不出 → `resetsAt = null`。**只在首次识别的瞬间解析一次并存下（`detail.resetsAt`），之后不再从画面重新提取**：“3pm”在下午 3 点之后会被解析成明天 3 点，把暂停无限推后。
- 接口（spec 与 plan 统一口径）：`detectScreen(agent: string, text: string, now: Date): { guard: ScreenState; signals: ScreenSignal[] }`，`ScreenSignal = { kind: 'context_low'; percent: number | null; notice: string } | { kind: 'usage_limit'; resetsAt: Date | null; notice: string }`。按 `/\r?\n/` 切行；`guard` 仍只看最后 8 行；信号看最后 `SIGNAL_TAIL_LINES` 行（由探针 1 的读取窗口决定，默认 40）。未知 agent 只返回 `guard`。
- Codex 的行由探针 2 决定；没有样本的信号不写。

### 4.2 数据来源

- **事实**：`terminal show` 的 `preview` 只有末尾约 300 字符，首行常被截断；用它读不到 40 行，也不能与 `screenGuard` 共用“40 行”的假设。
- **读取方式（探针 1 已核实可用；回执取 `terminal.tail.join('\n')`，实现须检查 `terminal.source === 'screen'`，为 `screen-unavailable` 时按读失败处理；屏幕上限随面板大小变化，按 `returnedLineCount` 而不是假定恰好 N 行）**：`orca terminal read --terminal <h> --screen --limit N`（返回渲染后的屏幕），新增 client 方法 `terminalRead(a: { handle: string; lines: number }): Promise<{ text: string }>`。理由：不新增就拿不到所需行数；`--screen` 必须带，否则流式输出被 TUI 重绘搅乱。同步 `orca/types.ts`、`orca/client.ts`、`FakeOrca`（fake 的 `terminalShow` 把 `preview` 截成末尾 300 字符，避免单测假绿；另给 `terminalRead` 一个 `screens` 模型）。`READ_ONLY_CALLS` 补 `['terminal', 'read']`（只记摘要）。
- **每轮读取**：调度员每次巡查扫描时对每个存活岗位（`posts.handle` 非空且在 `terminalList` 里）读一次画面，放进 `ScanSnapshot.previews`（可选字段：`ReadonlyMap<string, string>`，避免改动现有测试的大量字面量）。`screens`（给 `waiting_approval` 用）由同一份文本推导：`quietScreens`（`signals.ts`）原先为候选岗位调用 `screenGuard`，改为优先取 `previews`，没有才回退到原调用。`screenGuard(deps, handle)` 在“往终端打字之前”的即时检查中保持原样（单次 `terminal show`，行为不变）。
- **调用量评估**：原先只对“安静超过 `prompt_minutes` 的候选岗位”读画面；现在每轮读全部存活岗位，多出 O(岗位数) 次 `terminal read`（每 5 分钟一轮；调度员每轮本来就有 taskList / terminalList / workerList）。读失败或超时 → 该岗位本轮没有画面信号、`guard = unknown`，不影响其他信号。
- 重启后第一轮只观察（2B）：只记录、不通知、不暂停。

### 4.3 `usage_limit` 的处理

状态行放在 `patrol_state`（`signal = usage_limit`，`task_id = ''`，岗位级），用“观察”（level 0）与“通知”（level 1）两级；`next_due_at` 是暂停截止；`detail`（JSON，第 8 节新列）存 `{ resetsAt, noticeHash, extensions, resumedAt }`。

1. **识别到**（非首轮，且没有同 `noticeHash` 的已处理行）：直接建 level 1 行，`next_due_at = resetsAt + 2 分钟`（`resetsAt` 为空取 `now + 1 小时`）；通知一次：
   - 通知牵头岗（经 `typeTo`，画面检查为 `clear` 才打字）：“[雁阵] <岗位> 用量已用完，预计 <时间> 重置；期间不会提醒它”；
   - 外部通知（`patrol.notify`，若配置）；
   - 岗位就是牵头岗时只走外部通知与 `wl attention`（2B “不通知自己”）。
   首轮（重启后）只建 level 0 的观察行；下一轮仍在则升到 level 1 并通知。已有的 level 1 行及其 `next_due_at` 从注册表读回，重启不丢失、不重复通知。
2. **暂停升级**：在 `next_due_at` 之前，该岗位的 `no_progress`、`owner_idle`、`overdue` 三种信号只观察、不升级（level 保持不变，不发提示、不通知、不冻结）；判定放在 `advance.ts` 的 `step()` 里（`isUsagePaused`）。暂停结束后从当前 level 继续，不补发。
3. **到达 `next_due_at`**（首轮观察期间不做，下一轮再做）：
   - **`resetsAt` 已知**：重置时间已过并加了宽限，就视为已重置，**不等待“提示消失”**（限额提示是对话输出，不会自行消失；等它会永远等不到）。经 `typeTo` 发一行“[雁阵] 用量已重置，请继续手上的任务 <id>”（没有在办任务时“…请继续”）。发出（`ok` / `unconfirmed`）→ 清除行并记 `detail.resumedAt = now`；画面不是 `clear` 等原因没发出 → 保留行，下一轮再试，最多 3 轮，仍失败 → 清除行并记事件 `resume_skipped`，不再重试，并按第 1 步的规则通知人一次：“[雁阵] <岗位> 用量应已重置，但画面停在选项 / 确认框上，没有自动继续，请手动处理”（岗位是牵头岗时只走外部通知与 `wl attention`）。限额若以带编号选项的菜单呈现（待探针 2），“继续”不会被发出，正是走这条路径：雁阵不替人选菜单项。“提示是否仍在屏幕上”只写进事件 detail 作参考，不参与决定。
   - **`resetsAt` 未知**（暂停截止是猜的）：若画面上同 `noticeHash` 的提示仍在，延期 1 小时（`detail.extensions += 1`，最多 3 次，对应 2B 的最大退避 4 小时）；提示已消失或延期用尽 → 与上一条相同地发“继续”提示。
4. **与 `no_progress` 的顺序**：暂停刚结束时，“距上次输出超过 `no_progress_minutes`”往往同一轮就成立，会与“继续”提示一起 nudge。因此每轮先 `advanceScreenSignals`，再 `detectSignals` / `advancePatrol`；`noProgress`（`signals.ts`）的计时起点取 `max(原起点, usage_limit 行的 detail.resumedAt)`，把基线重置到继续提示的时刻。
5. **再次出现**：行清除后，同 `noticeHash` 的提示即使仍留在屏幕上也不再触发（去重靠保留的已清除行的 `detail.noticeHash`）；`noticeHash` 不同（新的限额、新的重置时间）视为新识别。
6. 用量上限从不导致冻结。

### 4.4 `context_low` 的处理

状态行 `signal = context_low`，`task_id = 'sk-' + sha256(session_marker + ':' + (session_id ?? '')).slice(0, 12)`（**会话标记的哈希，不是原文**：`AttentionReport.signals` 带出整行 `PatrolStateRow`，会进 `wl attention --json`、控制台与 TUI，原文标记违反 3A §4.3）；`detail = { percent, noticeHash, notifiedAt }`。

1. **识别到**（非首轮）：同一岗位、同一会话，提示持续显示期间只通知一次：通知牵头岗或外部通知（规则同 4.3 第 1 步），内容“[雁阵] <岗位> 上下文剩余 <N%>，可能即将自动压缩或需要换会话”（`percent` 为空写“不多”），并记 `detail.notifiedAt`。百分比后续变化只更新 `detail.percent`，不重复通知。
2. **清除**：画面不再显示该提示；或岗位的会话标记 / 会话 ID 变化（旧键的行因键不再匹配被清除，`wl attention` 里始终只有一条）。
3. **清除后再次出现**（同一会话，例如自动压缩后又逼近上限，或百分比在 10% 附近抖动）：视为新的识别，复用同一行（`cleared_at` 置空）；但距上次 `notifiedAt` 不足 `CONTEXT_RENOTIFY_MS`（1 小时，常量）时只恢复行、不再通知，避免抖动刷屏。
3. 不暂停其他信号，不打字，从不冻结。

### 4.5 展示

- `AttentionReport.signals` 的行多带两项：`detail`（解析后的对象，不含会话标记）与服务端算好的 `summary`（“剩余 5%”“预计 15:00 重置”）。`wl attention` 的“处理中的信号”一节、控制台收件箱、岗位详情、TUI 收件箱都直接显示 `summary`，不再各自解析。
- 3C 卡片注释的标记：`⚠ 上下文快满`、`⚠ 用量用完（15:00 重置）`（`SIGNAL_LABEL` 与 `postLine` 随之扩展）。**同一岗位有多个信号时**注释仍只展示一个，取舍规则：level 高者优先；同级时 `usage_limit` 优先（它解释了为什么没进展），其次按 `LADDERS` 的声明顺序，`context_low` 最后。`worktree_comment` 默认 `false`（`load.ts:49`），要看到注释标记必须显式打开。
- `patrol_events` 记录识别、通知、继续提示（`resume_hint`）、放弃（`resume_skipped`）与清除；`dispatcherStatus.attentionItems` 随 `signals` 自然包含这两种信号。
- 解冻说明：`resetPatrolForPost`（`registry.ts`）会把岗位所有 `patrol_state` 行置回 level 0 并标记已清除；本阶段让它**跳过两种画面信号**（否则解冻会清掉用量暂停，并在提示仍留屏时重新通知一次）。

### 4.6 状态存储与类型

- 类型：`ScreenSignalKind = 'context_low' | 'usage_limit'`（定义在 `registry.ts`），**不并入 `PatrolSignal`**。因此 `signals.ts` 的 `LADDERS: Record<PatrolSignal, Ladder>` 与 `advance.ts` 的 `noticeBody` 穷举 switch 不需要新增成员。`PatrolStateRow.signal` 放宽为 `PatrolSignal | ScreenSignalKind`，随之需要改的类型使用点由 `pnpm typecheck` 枚举，已知的是 `orca-sync.ts` 的 `SIGNAL_LABEL` 与 `postLine`。
- `advancePatrol` 的清除循环（`advance.ts:194-196`）对“未清除且不在本轮 `hits` 里”的每一行调 `clearRow`，而 `detectSignals` 永不产生这两种信号 → 必须显式跳过 `ScreenSignalKind` 的行，否则每轮被清掉：`wl attention` 看不到、“通知一次”失效、每 5 分钟重发。
- 新列 `patrol_state.detail TEXT`（第 8 节）；`putPatrolState` / `patrolRow` / `PatrolStateRow.detail` 同步。

## 5. 远端环境的会话恢复（块 d）

### 5.1 字段

```yaml
posts:
  - id: builder
    agent: claude
    launch: 'claude-lima --dangerously-skip-permissions'
    environment: lima-agent      # 可选；Orca 里的环境名
```

- 值的格式：小写字母、数字、连字符、下划线、点，1–64 字符（`^[a-z0-9._-]{1,64}$`）；不符 → `environment_invalid`（`wl up` 的校验错误，退出码 1）。校验放在 `spec/load.ts`（与 `launch_required` 同样用 `at.fail`）：`schema.ts` 只声明 `z.string().min(1).optional()`，否则 zod 的格式错误会被统一映射成 `spec_invalid`。
- 未写即本机，行为不变，不进规格哈希；写了才进（`posts` 映射条件展开）。
- `PostRow`（`registry.ts` 的 `posts` 表）没有 `environment` 列，`findSession` 也读不到规格：由 `restorePost` 把 `PostSpec.environment` 作为参数传给 `findSession`，不加列、不加迁移（`restore` 本来就会 `loadTeamSpec`，规格是唯一来源）。

### 5.2 手工恢复（不依赖探针，本阶段确定交付）

- `wl restore <team> --session <post>=<id>` 对写了 `environment` 的岗位照常工作（3A 的 `override` 路径）；缓存的 `session_id` 同样优先。
- 写了 `environment`、又没有 `--session` 也没有缓存的 `session_id` 时，`findSession` 返回 `uncertain`（原因：“远端环境岗位暂不做自动搜索，用 wl restore <team> --session <post>=<id> 指定”），**不退回 3A 的 `none → fresh`**：本机的 `orca search` 搜不到 VM 里的会话，退回 fresh 会静默丢上下文并再拉起一个 agent。
- 恢复命令不变：岗位启动命令加恢复参数（3A 第 5.3 节），例如 `claude-lima --dangerously-skip-permissions --resume <id>`。README 写明：包装脚本必须把参数原样传给 agent（例如 `exec limactl shell agent claude "$@"`），以及怎样拿到会话 ID（VM 内 `claude --resume` 的列表，或 `orca search --environment <env>` 回执里的 `sessionId`）。
- `orca search` 的 `resumeCommand` 在远端环境被扣留不影响本设计：雁阵从不使用它，只用 `sessionId`。

### 5.3 自动搜索（待探针 4）

- **原稿（`cwd` 为空即保留、只凭标记判断）作废。** 3A 探针证明 `orca search` 加引号也会按部分 token 召回（REPORT.md:468），所以 `find-session.ts` 有第三道闸 `markerHighlighted(h.snippet, marker)`；而 `--environment` 命中扣留 `snippet`，`markerHighlighted(null)` 一律拒绝——按原稿写，远端命中恒被拒，“cwd null kept”的测试也通不过。
- **探针 4 已显示 `--environment` 命中带 `snippet`（2026-10-24）**：搜索加 `--environment <env>`（`OrcaClient.search` 已支持该参数），第三道闸原样适用；`cwd` 规则按探针记录的形态定（空 / VM 内路径是否放行），但始终不放松整串高亮这一道。
- 若无 `snippet`：不做自动搜索，第 5.2 节就是最终形态。
- `FakeOrca.search` 对带 `environment` 的查询默认 `snippet: null`（与真机一致），否则单测假绿。

## 6. 未读标记（块 b）

- 开关：`patrol.unread_mark`，默认 `true`，取默认值时不进规格哈希。
- **机制**：`orca worktree set --worktree <sel> --unread`（`--read` 为反向）。标记对象是 workspace（worktree），不是终端。`OrcaClient.worktreeSet` 扩展为 `{ worktree; comment?; status?; unread?: boolean }`（`true` → `--unread`，`false` → `--read`），“至少带 comment 或 status”的守卫放宽为“至少带一个字段”；`FakeOrca.worktreeSet` 与 `types.ts` 同步。不新增 `terminalMarkUnread`，`view/snapshot.ts` 的 `WRITE_METHODS` 已含 `worktreeSet`，无需补登记。
- **标记谁**：牵头岗的 worktree，用 `resolveWorktrees`（`orca-sync.ts`）解析成绝对路径，调用 `path:<abs>`，与 3C 同一套选择器解析。
- **与 `orca-sync.ts` 的协调**：未读是单调的一次性标记，不是“值”，不进入 `orca_sync` 的 status / comment 合并；规则：
  1. 标记独立成一次 `worktreeSet({ worktree, unread: true })` 调用，不与 comment / status 合并进同一次写入，失败互不牵连（不动 `orca_sync.fail_count`；失败计数在内存里，见下）；
  2. 多个团队共用一个 worktree：各团队只标记自己的新条目，Orca 侧是同一个标志，重复置位无副作用，不需要像状态 / 注释那样合并；
  3. 写 comment / status 不改变未读状态（探针 3 已核实），两次调用顺序无关。
- **条目键**：键为 分节 + 任务 id / 岗位 / 消息 id / gate id。不调用异步的 `attention()`（它内部有 `taskPreflight`、`gatherStaleInput`，每轮多出 taskList / terminalList），改为复用 `ScanSnapshot`（`stale`、`openQuestions`）加注册表（`listFrozen`、`listPatrolState`）：`attentionKeys(parts)` 是纯函数，与 `wl attention` 的条目一一对应（测试里与 `attention()` 的结果对照）。**画面信号（`context_low`、`usage_limit`，即 `ScreenSignalKind` 的 `patrol_state` 行）不产生键**：它们已经直接通知牵头岗或外部通知，再打红点是重复打扰，目标里的“新待办”也不包括它们；对照测试因此排除这两种信号。
- 与注册表 `unread_marks` 中已标记过的键比较：有新键 → 标记，成功后写入新键；没有新键 → 不调用。已从 `wl attention` 消失的键从 `unread_marks` 删除（再次出现视为新条目）。
- 红点由 Orca 在用户查看时自行清除，雁阵不负责清除。探针 3 实测：仅靠时间流逝不会清除（30 秒内一直保持），之后在用户查看该 workspace 时被 Orca 清除（后一点是推测，未单独验证）。
- 标记失败只记 `patrol_events`，下一轮重试；连续 3 次失败后本次调度员运行期间不再尝试，并在 `wl attention` 告警里提示一次。
- 首轮只观察（2B）同样适用：首轮只把现有键写入 `unread_marks`、不标记，避免调度员重启就打一次红点。

## 7. 登录后自动恢复（块 a）

### 7.1 `wl restore --all`

```
wl restore [<team>] --all [--wait-orca <时长>] [--dry-run] [--no-tasks] [--json]
```

CLI 现在 `restore <team>` 的 `<team>` 是必填位置参数（`cli.ts:258`），改为 `[team]`；`--all` 与 `<team>`、`--session` 互斥，同时给出 → 输入错误。

- 对注册表中 `teams.status = up` 的每个团队依次（串行）执行 3A 的 `restore`（规则不变），按团队分节输出。
- **错误模型**：`restoreAll` 返回 `RestoreAllResult = { teams: Array<{ team: string; result?: RestoreResult; error?: { kind: ErrorKind; code: string; message: string; hint?: string } }> }`。某个团队抛出的 `team_busy` / `team_spec_changed` / `team_stopped`（input 类）、`runtime_unavailable`（orca 类）乃至内部错误都被捕获为该团队的 `error`，**不中断其余团队**。
- **聚合退出码**：每个团队先换算——有 `result` 取 `restoreExitCode`（0 / 2 / 3），有 `error` 取 `exitCodeOf`（input 1、orca 2、uncertain 3、internal 4）——整体取最严重者，顺序 4 > 3 > 2 > 1 > 0。
- **并发语义**：`restore` 持团队锁，拿不到锁立即抛 `team_busy`（`registry.ts:509-513`，退出码 1），**不排队、不“串行后看到 kept”**。所以登录自启动恢复与人手动 `wl restore` 撞车时，后到的一方对该团队得到 `team_busy`；`--all` 里记为该团队的 `error`，退出码 1，输出提示稍后重跑。
- **`--wait-orca <时长>`**（`parseDuration`），整个等待共用一个期限：
  1. 每 10 秒 `orca status`，直到可达；超时 → `runtime_unavailable`（退出码 2）。
  2. 可达后再等**终端列表稳定**：每 10 秒 `terminalList`，连续 4 次采样（handle + connected 的集合）相同才继续。理由：`orca status` 可达不等于 Orca 已重新接管完终端（Orca 重启后会重新纳管并重新拉起终端，REPORT.md:152），此前 `restore` 判定 offline 会再拉起一个重复的 `claude --dangerously-skip-permissions`。间隔与次数为常量（`ORCA_POLL_MS = 10_000`、`SETTLE_SAMPLES = 4`），依据探针 6 的一次实测选定：状态可达比终端稳定早约 28 秒，中间出现过约 15 秒的 2 终端平台期，3 次（20 秒）余量太薄。稳定只保证列表不再变化，不保证岗位终端都回来了（实测重启后终端数从 5 变成 3），缺失的由 `restore` 判 offline 后接回。稳定前超时 → `orca_not_settled`（uncertain 类，退出码 3），不做任何恢复。
  3. 不替用户启动 Orca。
- **审计与执行者**：
  - `RestoreArgs` 新增 `as?: string`：审计读 `a.as ?? o.actor`（`audit.ts:63`），`restore` 本体忽略它；`as = 'autostart'` 时 `resolveActor` 直接返回该值，不触发 `terminalList` 查询。
  - `restoreAll(deps, a, o: { restoreOne })` 通过注入的 `restoreOne` 逐团队调用**已审计**的 `commands.restore`（CLI 层传入；带了 `--actor autostart` 才附 `as: 'autostart'`，手动执行时不带，仍按 2A 第 7.1 节解析执行者），所以时间线上每个团队一行、自启动时执行者为 `autostart`；`--dry-run` 沿用 `AUDIT.restore.skip`。`restoreAll` 由 CLI 直接调用核心函数，不放进 `Commands`，因此不进 `AUDIT` / `WRITE_COMMANDS`，`cli/test/main.test.ts` 里“每个写命令都在审计表”的断言无需改动（autostart 的命令同理）。没有任何 `up` 团队时人读输出一行“没有处于运行状态的团队，无需恢复”，`--json` 为 `{ teams: [] }`，退出码 0。
  - CLI 隐藏选项 `--actor <name>`，只接受 `autostart`，映射成 `as`；手动执行时仍按 2A 第 7.1 节解析执行者。
  - 自启动命令行带 `--home` / `--orca`，而目前只有 `dispatcher run` 与 `console` 声明了这两个选项并通过 `execute(..., overrides)` 生效：`restore` 命令同样要加这两个选项并传 `overrides`。

### 7.2 `wl autostart`

```
wl autostart install [--wait-orca <时长>] [--json]   # 默认 15m
wl autostart uninstall [--json]
wl autostart status [--json]
```

**命令构造**：不能用 `selfCommand(deps, args, o?)`（实际签名是 `selfCommand(a: SelfSpec, o?)`，且已自动追加 `--home/--orca`，再手传会重复），也不能照搬它的 win32 分支（返回裸 `node` 并要求 `nodeOnPath`，与“登录时没有交互式 shell 的 PATH，全部写绝对路径”冲突）。新增 `absoluteSelfCommand(a)`（`commands/self.ts`）：node、入口脚本、`--home`、`--orca` 全部是绝对路径（脚本路径 `path.resolve`；其余不是绝对路径 → `autostart_path_invalid`），win32 仍做 `WINDOWS_UNSAFE` 字符校验，不依赖 PATH。命令为 `<node 绝对路径> <入口脚本绝对路径> restore --all --wait-orca <时长> --actor autostart --home <WINGLINE_HOME> --orca <Orca 可执行文件绝对路径>`。平台相关的路径一律用目标平台的 `path.posix` / `path.win32` 拼，不用宿主的 `path`。

| 平台 | 安装位置 | 方式 |
| --- | --- | --- |
| macOS | `~/Library/LaunchAgents/wingline.restore.plist` | launchd 用户代理，`RunAtLoad = true`，`StandardOutPath`/`StandardErrorPath` 指向日志；安装后 `launchctl bootstrap gui/<uid> <plist>`（已加载则先 `bootout`）。plist 内容做 XML 转义（`& < > " '`） |
| Linux | `~/.config/systemd/user/wingline-restore.service` | systemd 用户服务，`Type=oneshot`，`WantedBy=default.target`；安装后 `systemctl --user daemon-reload` 与 `systemctl --user enable wingline-restore.service`。`ExecStart` 里含空格或引号的参数用双引号包裹并转义 `\` 与 `"`，`%` 写 `%%`，`$` 写 `$$` |
| Windows | 任务计划 `\Wingline\Restore` | **待探针 5 再做**：`schtasks.exe /Create /F /SC ONLOGON /TN \Wingline\Restore /TR <命令行>`；`/TR` 有 261 字符上限（来自 Windows 文档，未验证）、`/SC ONLOGON` 可能需要管理员。探针前返回 `autostart_unsupported` |

- **macOS 的即时执行**：`install` 会立即 `launchctl bootstrap`，`RunAtLoad = true` 使它马上跑一次 `restore --all --wait-orca 15m`（`restore` 幂等：已在线的岗位报 `kept`；Orca 没开则等到期限）。这是确定的行为：install 的输出与 README 写明“安装即执行一次”，结果见 `autostart.log`。
- **日志**：`<home>/logs/autostart.log`。`install` 先 `mkdir -p <home>/logs`（launchd 的 `StandardOutPath` 不创建父目录）。**不承诺“保留 7 天”**：`pruneCallLogs`（`call-log.ts:31-37`）只匹配 `YYYY-MM-DD.jsonl`，而 launchd / systemd 写固定文件名，按天清理碰不到它。改为：每次登录只追加一次运行的输出（体积很小）；`install` 时若超过 1 MB，先把旧文件改名为 `autostart.log.1`（覆盖已有的 `.1`）；`status` 显示最后 20 行。
- **环境变量**：launchd 与 systemd 用户服务的 PATH 极简（launchd 约为 `/usr/bin:/bin:/usr/sbin:/sbin`），而 `orca` 可能是 `#!/usr/bin/env node` 之类的脚本，会在登录时找不到 node。因此 plist 的 `EnvironmentVariables` 与 unit 的 `Environment=` 显式写 `PATH=<node 所在目录>:<orca 所在目录>:` 加系统默认目录（用目标平台的 `path.posix` 拼，去重，XML / unit 转义同上）。该行为由 plan 的快照测试固定，能否在最小 PATH 下真正启动见第 11 节真机项。
- `install` 幂等：重复执行覆盖自己的文件 / 任务；先写临时文件再改名，注册失败则删除刚写的文件，不留半成品。
- `uninstall`：删除自己的文件 / 任务并从服务管理器注销；没安装过 → 成功（无操作）。
- `status`：是否已安装、文件 / 任务位置、将执行的命令（并检查其中的 node 与入口脚本是否仍存在；不存在时提示“Node 路径已变化，请重新 wl autostart install”）、`autostart.log` 最后 20 行；Linux 上额外检查 `loginctl show-user <user> -p Linger`，未开启时提示“无界面或 SSH 场景需要 loginctl enable-linger <user>”。
- Linux 上 Orca 以系统服务运行时（例如 `orca-serve.service`），用户服务无法声明在其之后启动，依靠 `--wait-orca` 等待。
- 平台没有对应机制（例如 Linux 上没有 systemd 用户会话）→ `autostart_unsupported`。

## 8. 注册表迁移

追加两个迁移版本，分属两块，各自带升级测试：

- 块 (b)：
  ```sql
  CREATE TABLE unread_marks (
    team TEXT NOT NULL,
    item_key TEXT NOT NULL,
    marked_at TEXT NOT NULL,
    PRIMARY KEY (team, item_key)
  );
  ```
- 块 (c)：`ALTER TABLE patrol_state ADD COLUMN detail TEXT;`（JSON：百分比、重置时间、`noticeHash`、`extensions`、`resumedAt`）。
- `usage_limit` 的暂停截止时间仍存放在 `patrol_state.next_due_at`；百分比与重置时间等展示数据存 `detail`（原稿的“不新增列”与展示需求自相矛盾）。
- 测试：从 3C 数据库升级各一个；规格哈希不变。`packages/core/test/registry/migrate-3c.test.ts:22` 写死 `expect(MIGRATIONS.length).toBe(5)`，新迁移一加就失败 → 改成相对值（`toBeGreaterThanOrEqual(5)`）或删掉；`migrate-3a.test.ts`、`registry.test.ts` 用的是 `MIGRATIONS.length` 本身，不受影响；`patrol.review.test.ts:149` 取 `slice(0, MIGRATIONS.length - 1)` 自 3A 起已名不副实（它测的是 2A 库升级），不会因此失败，顺手改成固定的 `slice(0, 2)` 与 `user_version = 2`。

## 9. 代码结构

```text
packages/core/src/screen/patterns.ts        # 模式表与 detectScreen（含迁入的 at_prompt / shell）
packages/core/src/screen/reset-time.ts      # 重置时间解析
packages/core/src/orca/{types,client}.ts    # terminalRead（探针 1 后）；worktreeSet 增加 unread
packages/core/src/commands/dispatcher/screen-signals.ts   # context_low / usage_limit 的状态推进、isUsagePaused
packages/core/src/commands/dispatcher/unread.ts           # 未读标记（attentionKeys、markUnread）
packages/core/src/commands/dispatcher/{signals,advance,loop,orca-sync,attention}.ts  # previews、清除循环豁免、暂停判定、调用顺序、标签、summary
packages/core/src/commands/restore/        # index.ts 增加 restoreAll / waitForOrca / as；find-session.ts 增加 environment 参数；posts.ts 传参
packages/core/src/commands/self.ts          # absoluteSelfCommand
packages/core/src/commands/autostart/       # plan.ts（生成文件内容与命令，纯函数）、apply.ts（经注入的执行器执行）、status.ts
packages/core/src/spec/{schema,load,hash}.ts   # posts[].environment、patrol.unread_mark
packages/core/src/registry/{migrations,registry}.ts   # unread_marks、patrol_state.detail、ScreenSignalKind、resetPatrolForPost 豁免
packages/core/src/server/api-read.ts        # 岗位详情的 signals 取数修正（见第 4.5 节注）
packages/cli/src/{cli,output,audit-table}.ts + tui/items.ts   # restore --all、autostart、展示
packages/web/src/pages/{Inbox,PostDetail}.tsx + components/SpecForm.tsx
test/fixtures/screens/ + .gitattributes     # 画面样本（eol=lf）
```

## 10. 错误处理

| 错误码 | 类别 | 退出码 | 场景 |
| --- | --- | --- | --- |
| `environment_invalid` | input | 1 | `posts[].environment` 格式不符 |
| `autostart_unsupported` | input | 1 | 平台没有对应的自启动机制（含探针 5 之前的 Windows） |
| `autostart_path_invalid` | input | 1 | 自启动命令里的 node / 脚本 / home / orca 不是绝对路径，或 Windows 路径含 `" % $` ` 等 |
| `autostart_failed` | internal | 4 | `launchctl`/`systemctl`/`schtasks` 执行失败；附原始输出 |
| `runtime_unavailable` | orca | 2 | `--wait-orca` 等不到 `orca status` 可达（已有错误码） |
| `orca_not_settled` | uncertain | 3 | `--wait-orca` 期间终端列表一直没稳定；未做任何恢复 |
| `team_busy` 等 | input | 1 | `restore --all` 中单个团队的错误，记在该团队的 `error` 里，不中断其余团队 |

- 画面识别出错（模式异常、读不到画面）时，该岗位本轮只是没有这两种信号，不影响其他信号。
- 重置时间解析不出 → 按 1 小时后复查（第 4.3 节）。
- 未读标记、继续提示的失败只记事件，不影响巡查。

## 11. 测试

- **模式表**：每个模式对应真实或文档样本（待探针 2，临时样本的测试名标 `(provisional)`）——命中、不命中、百分比提取、各种重置时间写法与时区、跨日；**负例**：agent 复述或用户粘贴在正文里的限额 / “快满”文字，即使落在最后 40 行内也不触发；窗口内同一 `kind` 多处命中只取最底部一处；限额以选项菜单呈现时 `guard` 为 `at_prompt`（样本待探针 2）；迁入的 `at_prompt`/`shell` 判定行为不变（原有测试照跑）；只看最后若干行；**样本 `.txt` 在 Windows 检出会变 CRLF（仓库没有 `.gitattributes`）**：`detectScreen` 按 `/\r?\n/` 切行，并给样本目录加 `eol=lf` 的 `.gitattributes`（plan 里单列一步），测试里同时喂 LF 与 CRLF 两份。
- **FakeOrca**：`terminalShow` 的 `preview` 截成末尾 300 字符（测试断言“40 行里靠前的行读不到”）；`terminalRead` 的 fake；带 `environment` 的 `search` 默认 `snippet: null`。
- **巡查**（断言写成真实行为，不是空函数体）：`usage_limit` 的完整流程（通知一次 → 暂停三种升级 → 到点发“继续”并清除、`no_progress` 基线重置、提示仍在屏幕上也照发（已知 `resetsAt`）、`resetsAt` 未知时延期 ≤ 3 次、画面非 `clear` 时不打字且最多重试 3 轮）；**两轮扫描后行仍未清除、只通知一次**（`advancePatrol` 不清画面信号行）；牵头岗用完时不通知自己；`context_low` 同一会话只通知一次、换会话后清除且 attention 里只有一条、清除后 1 小时内再次出现只恢复行不通知、超过 1 小时再次出现重新通知；限额菜单挡住“继续”时 3 轮后 `resume_skipped` 并通知人一次；两种信号都不会冻结；重启后首轮只观察、暂停截止时间从注册表读回；`resetPatrolForPost` 不清画面信号行；`patrol_state` 行与 `wl attention --json` 里不出现会话标记原文；3C 注释标记（测试必须显式打开 `worktree_comment`）与同级信号取舍规则。
- **远端环境**：`environment` 校验（`environment_invalid`）；三种情形——`--session` 覆盖、缓存的 `session_id`、两者皆无 → `uncertain`（不 fresh）；未写 `environment` 时规格哈希不变、写了时变化。自动搜索的用例等探针 4。
- **未读标记**：新键才标记；同一批不重复；键消失后再次出现视为新条目；首轮只记录；开关关闭不调用；连续失败后停止并提示；不调用 `attention()`（FakeOrca 的 `taskList` 调用次数不增加）；`attentionKeys` 与 `attention()` 条目一致（排除画面信号）；画面信号行不产生键、不触发标记；`worktreeSet({ unread })` 的 argv。
- **`restore --all`**：多团队、只处理 `up` 的团队、与 `<team>`/`--session` 互斥、单个团队 `team_busy` 不中断其余团队且聚合退出码为 1、退出码取最严重、`--wait-orca` 的 status 轮询与超时（2）、终端列表稳定判据（采样序列 A,B,B,B,B 才放行，A,B,B,B,C 不放行；一直变化 → `orca_not_settled`）、`as: 'autostart'` 写入审计且每个团队一行；没有任何 `up` 团队 → 输出为空、退出码 0。
- **autostart**：三个平台生成的文件内容与命令（快照测试，**期望值用 `path.posix` / `path.win32` 显式构造**，不用宿主 `path`，否则 Windows CI 上产出反斜杠）、plist 的 XML 转义（路径含 `&`、`<`）、plist / unit 带显式 PATH（含 node 与 orca 所在目录，去重）、systemd `ExecStart` 的空格 / `%` / `$` 转义、Windows `/TR` 引号（含空格路径、引号字符；探针 5 后）、重复安装、未安装时卸载、`status` 输出与 linger 检查、失败时清理、日志目录被创建、`>1 MB` 轮转；系统命令一律经注入的执行器调用，测试不改动系统。
- **迁移**：从 3C 数据库升级（两个迁移各一个）；`migrate-3c.test.ts` 的断言改相对值。
- **真机**（只在真机上跑，需人工确认）：重新登录后，Orca 就绪时团队被自动恢复；macOS `install` 后立即执行一次；launchd / systemd 的最小环境下（不继承交互式 shell 的 PATH）`node` 与 `orca` 都能启动，`autostart.log` 里没有 “command not found”。

## 12. 不做的事（阶段 3D）

- 往终端里打 `/compact` 等命令。
- 自动探测岗位所在的环境（必须显式写 `environment`）。
- 替用户启动 Orca。
- 用户自定义画面模式。
- token 用量统计与“消耗过快”信号——需要用量数据，不属于阶段 3。
- “原地打转”信号与“陪护”诊断岗——没有可靠的数据源，不属于阶段 3。

## 13. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| `terminal show` 只有约 300 字符 | 读不到状态栏之上的行，信号漏报或误判 | 探针 1；用 `terminal read --screen`；读不到则块 (c) 搁置 |
| agent 升级后提示文字变化 | 信号漏报 | 契约样本测试；`detectScreen` 只做通知类动作，漏报的后果是退回 2B 的现有行为 |
| 误把正文里引用的提示文字当成信号 | 误报通知或误暂停升级 | 只看画面最后若干行；模式锚定到 agent 状态行的格式；暂停只影响升级、不影响任务 |
| 重置时间解析错（时区、跨日） | 过早或过晚发“继续” | 只在识别瞬间解析一次；已知重置时间则到点（+2 分钟）即发，发早了的后果只是多一行提示；解析不出时 1 小时后复查并最多延期 3 次 |
| 限额提示不会自行消失 | 若等待“提示消失”则永远等不到，且暂停结束后会重复提示 | 第 4.3 节：到点即视为重置；已处理过的 `noticeHash` 不再触发 |
| 远端自动搜索被 3A 的整串高亮闸拒绝 | 远端岗位无法自动接回 | 先交付 `--session` 手工恢复；缺 `--session` 报 `uncertain` 而不是 fresh；探针 4 后再定 |
| 包装脚本不透传参数 | 远端岗位接回失败 | README 示例；等不到空闲 → `uncertain`，不重发（3A） |
| Orca 不提供 / 不按预期处理 `--unread` | 无红点或红点不消失 | 探针 3；`ORCA_WORKTREE_SUPPORT.unread`；`wl attention` 与外部通知照常 |
| 登录时 Orca “可达”但终端尚未纳管完 | `restore` 判 offline，拉起重复的 agent | `--wait-orca` 的终端列表稳定判据；稳定前超时不做恢复 |
| 登录时 Orca 启动很慢 | 自动恢复超时 | `--wait-orca` 可配置；超时记日志，用户可手动 `wl restore --all` |
| 自启动与手动 `wl restore` 撞车 | 后到者得到 `team_busy` | 单团队错误不中断其余团队，退出码 1，日志提示重跑 |
| 自启动配置残留 | 卸载雁阵后仍在登录时执行 | `wl autostart uninstall`；README 列出三个平台的文件 / 任务位置 |
| Windows `/TR` 长度、权限 | Windows 自启动装不上 | 探针 5；探针前 `autostart_unsupported` |
| 限额以阻塞菜单呈现 | “继续”发不出去，岗位一直停在菜单上 | 探针 2 确认；3 轮后放弃并通知人一次，不替人选菜单项（第 4.3 节） |
| 登录时的 PATH 极简 | `orca` / `node` 找不到，自动恢复整体失败 | plist / unit 写显式 PATH；真机项验证；日志可查 |
| 正文里引用的提示文字落进 40 行窗口 | 误报信号 | 模式锚定状态行格式；负例测试（第 4.1、11 节） |

## 复审修订（2026-10-21，第一轮）

阶段 3A/3B 落地后对本 spec 的核对结果。七条的意图保留，与第二轮冲突处以第二轮为准；状态如下。

1. **远端环境的会话判定被 3A 探针推翻** —— 已落实（第 5 节重写）：先交付字段 + `--session`；自动搜索待探针 4。
2. **`context_low` 的去重键不能含会话标记** —— 已落实（第 4.4 节：键用会话标记的哈希；第 4.6 节：展示数据放新列 `detail`）。
3. **autostart 命令构造** —— 已落实（第 7.2 节：`absoluteSelfCommand`）。
4. **`--actor autostart` 没有可接之处** —— 已落实（第 7.1 节：`RestoreArgs.as` + 注入已审计的 `restore`）。
5. **团队锁“拿不到立即失败”** —— 已落实（第 7.1 节：错误模型与并发语义）。
6. **画面信号增加 Orca 调用量** —— 已落实（第 4.2 节：调用量评估，`previews` 与 `screens` 共用）。
7. **依赖拆分** —— 已落实（第 0 节分块；3A §5.2 例外已落地）。

## 复审修订（2026-10-23，第二轮）

状态：**已落实** = 正文已改；**待探针 N** = 正文写了前置条件，依赖它的 plan 任务标“探针后执行”。

| 条目 | 结论 | 状态 |
| --- | --- | --- |
| C1 `terminal show` preview 只有约 300 字符 | 第 3 节探针 1；第 4.2 节改为“若 `terminal read --screen` 可用则新增 `terminalRead`”；FakeOrca 截断 preview | 已落实 / **待探针 1** |
| C2 画面信号行被 `advancePatrol` 清掉 | 第 4.6 节：独立类型 `ScreenSignalKind`，清除循环显式跳过；两轮只通知一次的测试 | 已落实 |
| C3 远端环境仍是 3A 之前的写法 | 第 5 节重写：字段校验 + 哈希 + `--session`；`environment` 由 `restorePost` 传入；自动搜索降级为探针 4 | 已落实 / **待探针 4** |
| I1 未读标记 API 形态 | 第 6 节：`worktreeSet({ unread })`，目标是牵头岗 worktree；去掉 `terminalMarkUnread`；键复用 `ScanSnapshot` | 已落实 / **待探针 3**（自动清除时机） |
| I2 去重键泄露标记、无处放百分比 | 第 4.4、8 节：标记哈希 + 新列 `detail` | 已落实 |
| I3 类型检查与文件清单 | 第 4.5、4.6、9 节；`worktree_comment` 默认关；同级取舍规则 | 已落实 |
| I4 “提示消失才发继续”等不到 | 第 4.3 节：到点即发；`no_progress` 基线重置；措辞待探针 2 | 已落实 / **待探针 2** |
| I5 autostart 命令构造与真实签名不符 | 第 7.1、7.2 节：`as`、审计登记、`[team]`、`absoluteSelfCommand` | 已落实 |
| I6 `restore --all` 错误模型与并发语义 | 第 7.1 节：`RestoreAllResult`、聚合退出码、`team_busy`、终端列表稳定判据 | 已落实 / 常量**待探针 6** |
| I7 autostart 平台细节 | 第 7.2 节：macOS 立即执行、`mkdir logs`、日志轮转、plist / systemd 转义；Windows 待探针 5；样本 `eol=lf` | 已落实 / **待探针 5** |
| I8 现有测试会因新迁移失败 | 第 8 节：`migrate-3c.test.ts:22` 改相对值 | 已落实 |
| Minor：接口漂移 | `detectScreen(agent, text, now)`，`guard` 含 `unknown`，spec 与 plan 统一 | 已落实 |
| Minor：重复读取 | `ScanSnapshot.previews`（可选），`screens` 由它推导 | 已落实 |
| Minor：空函数体测试骨架 | plan 各任务的关键行为写成真实断言骨架 | 第三轮核对时 plan 仍是空函数体 → 随 3D-1 / 3D-2 重写落实 |
| Minor：`resetPatrolForPost` | 第 4.5 节：跳过画面信号行，而不是“解冻后重新通知一次” | 已落实（择更干净的做法） |
| Minor：`SpecForm.tsx` 白名单 | plan 文件表补 `environment` / `unread_mark` | 第三轮核对时 plan 未补 → `unread_mark` 在 3D-1，`environment` 在 3D-2 |

**核对代码时与复审描述不一致、以代码为准的地方**：

- 复审写 `packages/core/src/commands/attention.ts`，实际是 `commands/dispatcher/attention.ts`（行号与内容吻合）。
- 原稿画面样本目录 `packages/core/test/contract/screens/` 不存在（契约回执在仓库根的 `test/fixtures/receipts/`，契约测试在 `packages/core/test/orca/contract.test.ts`）；样本改放 `test/fixtures/screens/`。
- `OrcaClient.search` 已经接受 `environment` 参数（3A 落地），plan 不必再改 client 的 search。
- 审计表在 `packages/cli/src/audit-table.ts`（不在 core）；`cli/test/main.test.ts:65-66` 断言 `AUDIT` 与 `WRITE_COMMANDS` 一一对应，所以 `restoreAll` 不能直接塞进 `Commands` 而不处理这条断言。
- `--home` / `--orca` 目前只有 `dispatcher run` 与 `console` 声明；`restore` 没有，自启动命令行带它们就必须补。
- 复审未提到的既有缺陷：`server/api-read.ts:138` 的 `registry.listPatrolState(address)` 把岗位地址当团队名传，岗位详情的“巡查信号”恒为空；第 4.5 节“岗位详情展示”要生效必须先修。
- `orca worktree set --help` 里的 `--unread|--read` 只来自复审转述，仓库内无记录；**2026-10-23 已在真机核实**（macOS，Orca 1.4.237），见 `spikes/REPORT.md` “3D-1 探针 3”；Task 0 的第一步就是核实。

## 复审修订（2026-10-23，第三轮）

对 spec 与 plan 一起复审的结果。plan 在第二轮之后没有同步，已拆成 3D-1 / 3D-2 并重写（见顶部状态行）。spec 本轮的改动：

| 条目 | 结论 | 位置 |
| --- | --- | --- |
| 修订表误标“已落实（plan）” | 改为“随 plan 重写落实” | 第二轮表 |
| `context_low` “通知一次”与“消失即清除”冲突 | 清除后再次出现复用同一行；1 小时内不重复通知（`CONTEXT_RENOTIFY_MS`），`detail` 增 `notifiedAt` | 第 4.4 节 |
| 限额可能是阻塞菜单，“继续”发不出 | 探针 2 增观察项；放弃分支通知人一次，不替人选菜单 | 第 3、4.3、13 节 |
| launchd / systemd 的 PATH 极简 | plist / unit 写显式 PATH；真机项验证 | 第 7.2、11、13 节 |
| 40 行窗口的误报与多处命中 | 模式锚定状态行；同一 `kind` 取最底部一处；加负例测试 | 第 4.1、11 节 |
| 未读键是否含画面信号 | 不含（已直接通知，避免重复打扰） | 第 6、11 节 |
| plan 拆分 | 3D-1 = 块 a + b（可立即开工），3D-2 = 块 c + d（探针后） | 第 0 节 |

未做：把第一、二轮修订表压缩成状态一览（正文已含全部结论，压缩收益小，留待 3D 收尾时合并）。
