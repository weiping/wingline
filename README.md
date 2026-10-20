# Wingline 雁阵

Persistent, role-based agent teams on top of [Orca](https://github.com/stablyai/orca).

Wingline adds a team layer to Orca: a declarative team spec, long-lived posts (`builder@duo`), a task workflow with quality gates and automatic review chains, budgets, restart-safe commands, and a per-team dispatcher that relays questions and patrols for stuck work. It drives Orca only through `orca … --json` — no fork, no plugin back doors, no second process supervisor.

雁阵在 Orca 之上加一层“常驻团队”：用一份 `team.yaml` 描述团队，每个岗位是一个常驻的 Orca 终端；任务在岗位之间流转，完成时自动跑质量闸门、自动派出评审；调度员替你盯着团队，转述岗位的提问、发现卡住的任务并逐级提醒。

> 状态：阶段 0–1（团队与岗位）、阶段 2A（任务工作流）、阶段 2B（调度员与巡查）、阶段 3A（重启恢复与审计时间线）、阶段 3B（本地控制台）已完成；3C（团队编辑器 / Orca 界面同步 / `wl tui`）及后续阶段见[设计总纲](docs/superpowers/specs/2026-10-10-wingline-design.md)。

## 功能

- **声明式团队**：`team.yaml` 写明岗位、使用的 agent 与模型、worktree、岗位简报和团队规范。`wl up` 幂等，重复执行不会产生重复终端；岗位地址形如 `builder@duo`。
- **可靠的消息投递**：`wl send` 在往终端打字前先看画面，停在确认框上的终端不会被打字；返回“已送达”才算送达，结果不确定时明确告诉你，从不自动重发。
- **任务工作流**：`wl task` 系列命令覆盖建任务、派发、认领、计划、开始、完成、转人工、恢复。任务状态直接用 Orca 原生的编排层，雁阵只在本地多记“主人”和“第几轮”。
- **质量闸门**：`wl task done` 先在岗位的 worktree 里跑 `gates` 里配置的命令，通过才算完成；连续失败到预算上限自动转人工决策。
- **评审与交接链**：`links.reviewed_by` / `hands_to` 让任务完成时自动给下一个岗位建关联任务并派过去，对方正忙就排队。
- **重跑安全**：超时或中断后原样重跑同一条命令，不会重复建任务、重复派发或重复上报；卡住的情形由 `wl task list --stale` 列出并附处理命令。
- **调度员**：每个团队一个常驻进程，持有 Orca 协调者身份，转述岗位的提问（`wl dispatcher reply` 回答），代为收尾中断的 `done`。
- **巡查**：发现无进展、停在确认框、主人迟迟不开始、连续 gate 失败、绕过 `wl` 直接上报等情形，按“观察 → 提醒岗位 → 通知牵头岗 → 冻结”逐级升级；可接 webhook 或本地命令作外部通知。
- **一屏总览**：`wl attention` 列出所有需要人处理的事项，每条附一条可直接复制的命令。

## 安装

前提：

- [Orca](https://github.com/stablyai/orca) 1.4.222 或更高版本，已运行（`orca open`）；
- Node ≥ 22.13；
- pnpm（`corepack enable` 即可）。

npm 包尚未发布，目前从源码安装：

```bash
git clone https://github.com/weiping/wingline.git
cd wingline
pnpm install
pnpm build
chmod +x packages/cli/dist/main.js
ln -sf "$PWD/packages/cli/dist/main.js" ~/.local/bin/wl   # 确保 ~/.local/bin 在 PATH 里
wl --version
```

命令行为 `wingline`，简写 `wl`；上面只链接了 `wl`，需要全名再链一个 `wingline` 即可。Windows 上可以直接用 `node <仓库>\packages\cli\dist\main.js`。

可选：把 `skills/wingline-post` 装进岗位所用 agent 的 skills 目录，岗位就知道地址格式和怎么用 `wl send` 联系同伴。

### Orca 可执行文件

按顺序查找：`WINGLINE_ORCA` → `ORCA_CLI_COMMAND` → Linux 的 `orca-ide` / macOS 的 `orca` / Windows 的 `orca.exe`、`orca.cmd`。Orca 的 Windows 安装（1.4.224）只提供 `orca.cmd`，经 `cmd.exe` 调用：无法传递换行，整条命令行不能超过约 8000 字符。所以启动包会写入文件再发送一行指引，含换行或过长的 `wl send` 消息会被拒绝——请改成单行，或把内容写进文件后只发路径。

数据目录 `~/.wingline/`（可用 `WINGLINE_HOME` 改变）：`state.db` 注册表，`logs/` 调用日志与 gate 输出（保留 7 天）。

## 快速开始

仓库自带一个两岗位模板 `teams/duo`：builder（Claude，牵头岗）负责实现，checker（Codex）负责审查。先把 `teams/duo/team.yaml` 里的 `repo`、`worktree` 改成你自己的，然后：

```bash
wl up teams/duo/team.yaml          # 拉起 builder@duo 与 checker@duo
wl ps                              # 查看岗位状态
wl send checker@duo "你好"          # 给岗位发消息
wl down duo --close                # 停止团队并关闭终端
```

`wl send` 返回退出码 3（`send_unconfirmed`）表示消息已输入但没观察到对方开始处理，常见于岗位正忙。先看对方终端；要确认是否送达而不重复发送，用错误提示里的命令：`wl send <地址> <同一条消息> --retry-request <Orca 请求 ID>`。

所有命令支持 `--json`。退出码：0 成功；1 输入有误；2 Orca 明确报错；3 结果不确定（不会自动重发或关闭）；4 内部错误。

## 用例

### 用例一：实现 → 闸门 → 自动评审

在 `team.yaml` 里给 builder 配一个闸门，并让 checker 评审它的工作：

```yaml
gates:
  builder: 'pnpm test'          # 在 builder 的 worktree 根目录执行
links:
  builder:
    reviewed_by: [checker]
budgets:
  task:
    max_gate_failures: 3        # 连续 3 次闸门失败转人工决策
```

改完 `team.yaml` 要先 `wl down duo` 再 `wl up teams/duo/team.yaml`（不加 `--close`，终端保持在线）。然后由你建任务、直接派给 builder：

```bash
wl task create duo --title "实现登录" --post builder@duo
```

builder 的终端会收到一行 `[雁阵]` 通知。岗位在自己的终端里：

```bash
wl task plan <id> "先加接口，再补测试"     # 岗位配置了 plan_first 时，start 之前必须有计划
wl task start <id>
# …干活…
wl task done <id>                          # 先跑 pnpm test；通过后自动给 checker 建评审任务并派过去
```

闸门失败时 `done` 返回退出码 1 并给出输出文件路径，修好再 `wl task done` 即可。checker 收到评审任务后走同样的 `start` / `done` 流程；评审任务完成不会再触发连接，互评不会无限循环。

全程用这些命令查看：

```bash
wl task list duo                  # 团队的全部任务
wl task show <id> --history       # 单个任务的详情与历史
wl task list duo --stale          # 卡住的任务，每条附处理命令
```

### 用例二：转人工决策

连续闸门失败到上限，或岗位主动 `wl task escalate <id> --reason "需求不清"` 时，任务转为 blocked，牵头岗会收到通知。你来拍板：

```bash
wl task resolve <gate_id> --resolution "按方案 B 做"                       # 任务回到 ready，原主人 wl task start 即重试
wl task resolve <gate_id> --resolution "换人做" --reassign checker@duo     # 同时改派
```

也可以直接在 Orca 界面里 resolve。

### 用例三：自领任务

给岗位开启 `self_claim` 并打上标签，岗位就能从就绪队列里自己领匹配的任务：

```yaml
posts:
  - id: checker
    self_claim: true
    tags: [frontend]
```

```bash
wl task create duo --title "调整按钮样式" --tags frontend   # 不指定 --post，进入就绪队列
wl task list duo --status ready                              # 岗位查看可领的任务
wl task claim <id>                                           # 标签有交集才能领
wl task start <id>
```

不想做了用 `wl task release <id>` 放回队列；`wl task reassign <id> --to builder@duo` 改派。

### 用例四：无人值守

让调度员接手日常盯人的工作：

```bash
wl dispatcher up duo          # 在新终端 dispatcher@duo 里启动
wl attention duo              # 回来时看一眼：需要你处理的事项，每条附命令
```

岗位有提问时，调度员把问题转给牵头岗，附上回答命令：

```bash
wl dispatcher reply duo <message_id> --body "用方案 a"
```

岗位长时间没有进展时，调度员先提醒岗位，再通知牵头岗，最后冻结该岗位（不再向它派发）。处理完后解冻：

```bash
wl dispatcher unfreeze checker@duo    # 同时列出冻结期间被跳过的派发
```

### 重启之后：`wl restore`

Orca 或本机重启后，岗位终端可能还在，但 agent 会话上下文会丢。雁阵在每次 `wl up` 时给岗位写入会话标记（`WLS-…`），`wl restore` 会按 `team.yaml` 顺序尝试把各岗位接回 Orca 里仍存在的会话，或在新终端里重新拉起并发送启动包。

```bash
wl restore duo                    # 接回 builder@duo、checker@duo，并恢复 Run / 调度员 / 卡住的任务
wl restore duo --dry-run          # 只打印会做什么，不改终端、不写审计
wl restore duo --no-tasks         # 只恢复岗位与 Run，不自动 wl task recover
wl restore duo --session builder=<会话ID>   # 搜索到多个候选时，指定接哪一个
```

结果按「岗位 → Run → 调度员 → 任务」分节输出。`resumed` 表示接回了原会话；`fresh` 表示找不到可接回的会话，已新起终端——**上下文已丢失**，需要靠任务状态与 `wl log` 补上下文。`ambiguous` 时会列出候选会话与重试命令，退出码为 3。没有写入过标记的旧岗位只能走 `fresh`。

开机自动恢复（无人值守）留到后续阶段；目前请在 Orca 起来后手动执行 `wl restore <团队>`。

### 时间线：`wl log`

`wl log` 把任务历史、调度员巡查与命令审计按时间合并成一条时间线，方便在重启或排障后回顾「刚才发生了什么」。

```bash
wl log duo                        # 默认最近 30 天内的记录
wl log duo --since 2h             # 相对时长（也支持 ISO 时间）
wl log duo --task task-1          # 只看某个任务
wl log duo --post builder         # 与某岗位相关（actor 或 target）
wl log duo --source command       # task | patrol | command
wl log duo --limit 50
wl log duo --follow               # 持续输出新事件（Ctrl+C 结束）
```

人类可读行形如 `10:00:01  命令  human  send  builder@duo  ok`；跨天会插入 `—— 2026-10-16 ——` 分隔行。审计明细超过 30 天会在读取时自动清理（失败只警告）。

### 控制台：`wl console`

`wl console` 在 `127.0.0.1` 上起一个本地网页控制台（收件箱、总览、任务看板、任务详情、岗位详情、时间线），只监听本机，没有绑定其他地址的选项。

- 前台运行并打印一次性登录链接；链接 5 分钟内有效、只能用一次，拿到它就等于拿到控制台的访问权，不要贴到别处。
- 已有控制台在运行时，再执行 `wl console` 只打印新的登录链接，不会起第二个服务；`wl console --link` 只取新链接，没有服务时报 `console_not_running`。
- `wl console --open` 在 Orca 内置浏览器里打开控制台：有服务就直接打开，没有就在 Orca 里新开 `console@wingline` 终端运行它。`--worktree <选择器>` 指定这个终端的工作区；不给时取第一个运行中团队的牵头岗工作区，没有团队则报 `console_no_worktree`。Orca 不支持在内置浏览器打开标签页时，会打印链接，请在浏览器里打开。
- 页面里的写操作（回答提问、发消息、冻结、改派、转人工等）与命令行做的是同一件事，审计里记为执行者 `human`、命令名带 `console:` 前缀；结果不确定时只给出“按原样重试”，不会自动重试。
- 服务重启后会话失效，需要重新 `wl console --link` 取链接；`Ctrl-C` 停止服务。

## 调度员与 `wl attention`

```bash
wl dispatcher up duo                          # 在终端 dispatcher@duo 里启动（未确认到心跳退出码 3）
wl dispatcher status duo                      # 运行状态、上次检查/巡查、冻结与静音数
wl dispatcher down duo [--close]              # --close 才会关闭调度员终端
wl dispatcher run duo [--home <路径>] [--orca <路径>]   # 前台长期运行；up 用它启动，也可在 Orca 终端里手动运行
wl dispatcher freeze builder@duo --reason "..."         # 冻结岗位，不再向它派发
wl dispatcher unfreeze builder@duo                      # 解冻，并列出冻结期间被跳过的命令
wl dispatcher hush checker@duo --for 15m                # 暂停往该终端自动打字（默认 30 分钟，支持 90s/15m/2h）
wl dispatcher unhush checker@duo
wl dispatcher reply duo <message_id> --body "..." [--again]   # 以协调者身份回答岗位的提问
wl attention duo                              # 只读汇总：需要人处理的事项，每条带可复制的命令
```

`wl ps` 在团队有调度员时额外显示一行：运行中（附心跳时间）、已停止或失联。

### 巡查与通知：`patrol:` 配置

在 `team.yaml` 里加一段可选的 `patrol:` 调整巡查阈值和通知方式；不写就全部用默认值，已有团队的行为与规格哈希都不变。完整示例见 `teams/duo/team.yaml` 末尾的注释。

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `no_progress_minutes` | 20 | 有进行中的任务但终端这么久没有新输出，算"无进展" |
| `prompt_minutes` | 5 | 停在确认/选择提示上这么久，通知人去处理 |
| `owner_idle_minutes` | 30 | 任务已就绪、主人这么久没开始，提醒主人 |
| `post_failure_streak` | 3 | 同一岗位连续这么多个任务以 gate 失败收场，升级处理 |
| `freeze_lead` | `false` | 为 `true` 时牵头岗也可能被自动冻结 |
| `auto_recover` | `false` | 为 `true` 时对"派发失主"的任务自动执行 `wl task recover` |
| `worktree_comment` | `false` | 为 `true` 时通知的同时给岗位的 worktree 写一条注释 |
| `notify.webhook` / `notify.command` | 无 | 外部通知，二选一：webhook 会收到一条 JSON `POST`；command 是参数数组（不经 shell），消息作为最后一个参数追加 |

```yaml
patrol:
  no_progress_minutes: 30
  notify:
    webhook: https://example.com/hook
```

改完 `team.yaml` 后要重新运行 `wl up`，调度员才会采用新规格；改动前后规格哈希不同，`wl task` 等命令在重新 `wl up` 之前会提示规格已变更。牵头岗上的卡住事项不会通知它自己，只会走外部通知和 `wl attention`。

### 无人值守时的权限模式

调度员只能往终端里打字，替不了人点确认框。无人值守的团队建议让岗位使用不弹交互确认的权限模式（在 `team.yaml` 的 `launch` 里指定，具体参数见各 agent 的文档），从源头减少岗位停在确认框上的情形；仍然停住时，`wl attention` 会列出相应信号。

## `team.yaml` 字段速查

| 字段 | 说明 |
| --- | --- |
| `name`、`repo`、`norms`、`lead` | 团队名、仓库、团队规范文件、牵头岗 |
| `posts[].id` / `agent` / `model` / `launch` | 岗位 id、agent、模型；`launch` 可整条覆盖启动命令 |
| `posts[].worktree` | `current`（默认，`wl up` 时固定成绝对路径）或 Orca 的 worktree 选择器 |
| `posts[].brief` | 岗位简报文件列表，随启动包发给岗位 |
| `posts[].self_claim` / `tags` / `plan_first` | 允许自领、匹配标签、开始前必须先写计划 |
| `links.<岗位>.reviewed_by` / `hands_to` | 完成后自动建评审 / 交接任务（二者不可同时出现，`hands_to` 不能成环） |
| `links.<岗位>.consults` | 名册元数据，不触发任务动作 |
| `gates.<岗位>` | 闸门命令（单条 shell 命令） |
| `budgets.task` | `max_gate_failures`（默认 3）、`gate_timeout_seconds`（默认 600）、`max_minutes`（逾期判断） |
| `patrol` | 巡查阈值与外部通知，见上文 |

完整定义见 [阶段 2A 设计](docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md) 与 [阶段 2B 设计](docs/superpowers/specs/2026-10-13-phase-2b-dispatcher-patrol-design.md)。

## 开发

```bash
pnpm test         # 单元 + 契约测试
pnpm typecheck
pnpm test:live    # 真机集成测试；需要运行中的 Orca，会创建并关闭终端
```

- Design spec: [docs/superpowers/specs/2026-10-10-wingline-design.md](docs/superpowers/specs/2026-10-10-wingline-design.md)
- Implementation plans: [docs/superpowers/plans/](docs/superpowers/plans/)
- 阶段 2A 升级说明: [docs/superpowers/plans/2026-10-13-phase-2a-release-notes.md](docs/superpowers/plans/2026-10-13-phase-2a-release-notes.md)

## License

[MIT](LICENSE)
