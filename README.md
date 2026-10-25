# Wingline 雁阵

[![npm](https://img.shields.io/npm/v/@weiping/wingline)](https://www.npmjs.com/package/@weiping/wingline)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Persistent, role-based agent teams on top of [Orca](https://github.com/stablyai/orca).

Wingline adds a team layer to Orca: a declarative team spec, long-lived posts (`builder@duo`), a task workflow with quality gates and automatic review chains, budgets, restart-safe commands, and a per-team dispatcher that relays questions and patrols for stuck work. It drives Orca only through `orca … --json` — no fork, no plugin back doors, no second process supervisor.

雁阵在 Orca 之上加一层“常驻团队”：用一份 `team.yaml` 描述团队，每个岗位是一个常驻的 Orca 终端；任务在岗位之间流转，完成时自动跑质量闸门、自动派出评审；调度员替你盯着团队，转述岗位的提问、发现卡住的任务并逐级提醒。

```bash
npm install -g @weiping/wingline
```

> 状态：阶段 0–1（团队与岗位）、阶段 2A（任务工作流）、阶段 2B（调度员与巡查）、阶段 3A（重启恢复与审计时间线）、阶段 3B（本地控制台）、阶段 3C（团队编辑器 / Orca 界面同步 / `wl tui`）已完成；阶段 3D 已实现登录后自动恢复（`wl restore --all` / `wl autostart`）、未读标记与远端环境（Lima 等）的会话恢复，读画面的巡查信号（上下文快满、用量上限）及后续阶段见[设计总纲](docs/superpowers/specs/2026-10-10-wingline-design.md)。

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
- Node ≥ 22.13。

### npm 安装（推荐）

```bash
npm install -g @weiping/wingline
wl --version        # 自动装上 wl 与 wingline 两个命令
```

全局安装后 `wl` / `wingline` 命令自动可用（由包的 `bin` 字段提供），无需再手动建符号链接。需要登录后自动恢复时再执行 `wl autostart install`（见[登录后自动恢复](#登录后自动恢复wl-restore---all-与-wl-autostart)）。

`@weiping/wingline-core` 与 `@weiping/wingline` 分别发布到 npm；`@weiping/wingline` 依赖 `@weiping/wingline-core`，安装时会一并拉取。

### 从源码安装（开发）

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

可选：把 `skills/wingline-post` 装进岗位所用 agent 的 skills 目录，岗位就知道地址格式和怎么用 `wl send` 联系同伴（具体命令见[岗位之间怎么说话](#岗位之间怎么说话)）。

### Orca 可执行文件

按顺序查找：`WINGLINE_ORCA` → `ORCA_CLI_COMMAND` → Linux 的 `orca-ide` / macOS 的 `orca` / Windows 的 `orca.exe`、`orca.cmd`。Orca 的 Windows 安装（1.4.224）只提供 `orca.cmd`，经 `cmd.exe` 调用：无法传递换行，整条命令行不能超过约 8000 字符。所以启动包会写入文件再发送一行指引，含换行或过长的 `wl send` 消息会被拒绝——请改成单行，或把内容写进文件后只发路径。

数据目录 `~/.wingline/`（可用 `WINGLINE_HOME` 改变）：`state.db` 注册表，`logs/` 调用日志与 gate 输出（保留 7 天）。

## 在 Orca 里怎么用

雁阵不是 Orca 的插件，它是一层壳：所有动作都经由 `orca … --json` 完成（`terminal create/send/wait/read/close`、`orchestration run-create/dispatch/task-*/gate-*/check/reply`、`worktree show/set`、`tab create`、`search`），不 fork Orca、不读写 Orca 的内部文件、不另起进程管理器。所以「在 Orca 里用雁阵」= 用一份 `team.yaml` 描述常驻团队，让 Orca 负责终端、agent 会话与任务编排，雁阵负责团队规格、质量闸门、巡查与重启恢复。

### 概念对照

| 雁阵 | 在 Orca 里对应什么 |
| --- | --- |
| 团队 `duo` | 一个 orchestration Run，objective 是 `wingline:duo` |
| 岗位 `builder@duo` | 一个常驻 Orca 终端，终端标题就是岗位地址 |
| 调度员 `dispatcher@duo` | 团队自己的一个 Orca 终端，跑 `wl dispatcher run <团队>` |
| 任务 | 一个 Orca 原生 orchestration task；雁阵只在本地多记「主人」和「第几轮」 |
| 闸门失败 / 转人工 | 一个 Orca gate，可以在 Orca 界面里直接 resolve |
| 岗位的工作状态 | 岗位所在 worktree 的看板状态 + 卡片注释 + 未读标记 |

### 五步跑起来

**1. 装命令。** 见[安装](#安装)；仓库已 clone 并装好依赖时：

```bash
cd <wingline 仓库目录>
pnpm build
ln -sf "$PWD/packages/cli/dist/main.js" ~/.local/bin/wl   # 确保 ~/.local/bin 在 PATH 里
wl --version
```

**2. 写团队规格。** 复制模板 `teams/duo/`，改 `repo` 和 `worktree`：

```yaml
name: duo
repo: path:/Users/checker/workspace/dev/your-repo
norms: NORMS.md
lead: builder
posts:
  - id: builder
    agent: claude
    model: opus
    worktree: current       # 或 Orca 的 worktree 选择器（name: / branch: / path:）
    brief: [briefs/builder.md]
  - id: checker
    agent: codex
    launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'
    worktree: current
    brief: [briefs/checker.md]
gates:
  builder: 'pnpm test'      # 在该岗位的 worktree 根目录执行
links:
  builder:
    reviewed_by: [checker]  # 完成后自动给 checker 建评审任务并派过去
```

`worktree: current` 表示「`wl up` 时所在目录的那个 Orca worktree」，首次 `wl up` 会把它固定成绝对路径；之后重跑 `wl up` 时，仍在运行的岗位保持原来的路径不变，新建的岗位按新的调用目录解析。

**3. 拉起团队。** 在 **Orca 之外的普通终端** 里执行（原因见下面的「在 Orca 终端里跑 `wl up`」）：

```bash
wl up teams/duo/team.yaml   # 建 builder@duo 与 checker@duo 两个 Orca 终端
wl ps                       # 看岗位是否 live
```

**4. 派任务。** 人在普通终端里建任务并派给岗位：

```bash
wl task create duo --title "实现登录" --post builder@duo
```

岗位在自己的 Orca 终端里（agent 自己执行）：

```bash
wl task plan <id> "先加接口，再补测试"   # 配了 plan_first 时，start 之前必须有计划
wl task start <id>
# …干活…
wl task done <id>                        # 先跑 gate；通过后自动给 checker 建评审任务并派过去
```

**5. 无人值守。** 调度员替你盯人：

```bash
wl dispatcher up duo      # 在新终端 dispatcher@duo 里常驻
wl attention duo          # 一屏列出需要你处理的事项，每条附一条可复制的命令
wl console --open         # 本地网页控制台，直接在 Orca 内置浏览器里打开
wl tui                    # 终端里的全屏视图（总览 / 收件箱 / 时间线）
```

### 岗位在 Orca 界面里能看见什么

调度员在跑时（`patrol.workspace_status` 默认开）：

- **看板状态**：岗位所在 worktree 显示 `todo` / `in-progress` / `in-review` / `completed`。
- **卡片注释**（`patrol.worktree_comment: true`）：每行一个岗位，形如 `builder：实现登录（进行中，第 2 轮） ⚠ 无进展`。
- **未读标记**（`patrol.unread_mark` 默认开）：牵头岗有新的待办就给它的 worktree 打红点。
- **控制台**：`wl console --open` 走 `orca tab create --url` 在 Orca 内置浏览器开控制台；服务没起时会在 Orca 里新开 `console@wingline` 终端跑起来。
- **终端标题**：岗位终端的标题就是 `builder@duo`、`checker@duo`，在 Orca 的终端列表里一眼认得出谁是谁。

这些状态由雁阵维护：你在 Orca 界面里手动改了，雁阵下一次算出新值时会覆盖。调度员没在运行时不同步。

### 岗位之间怎么说话

岗位 agent 需要知道两个约定：地址格式 `<岗位>@<团队>`，以及用 `wl send` 联系同伴。把 `skills/wingline-post` 装进该 agent 的 skills 目录即可（Claude Code 是 `~/.claude/skills/`，Codex 是 `~/.codex/skills/`）：

```bash
ln -sf "$PWD/skills/wingline-post" ~/.claude/skills/wingline-post
ln -sf "$PWD/skills/wingline-post" ~/.codex/skills/wingline-post
```

Orca 自带的 `orca skills install` 装不了它——那是 Orca 的内置清单，`wingline-post` 是本仓库的本地 skill。

装好后岗位就能：

```bash
wl send checker@duo "请审查 src/foo.ts：新增了 X，测试在 test/foo.test.ts"
```

消息超过 4000 字符要写进文件、只发路径；返回「已送达」才算送达，退出码 3 表示只是输入了、没有确认被处理，此时先 `wl ps` 看对方状态，别立刻重发。

### 在 Orca 终端里跑 `wl up`

Orca 会把调用者认成那个终端，报 `This terminal is attested as … and cannot act as …`，Run 建不出来。两种解法：

- 在 Orca 之外的普通终端（Terminal.app、iTerm）里跑 `wl up`——最省事，推荐这个；
- 或在 Orca 终端里先剥掉身份变量：

```bash
env -u ORCA_TERMINAL_HANDLE -u ORCA_AGENT_LAUNCH_TOKEN -u ORCA_AGENT_LAUNCH wl up teams/duo/team.yaml
```

岗位终端里的 agent 执行 `wl` 不受影响（那正是隐式身份解析要用的）。

### 与 Orca 自带的 `orca claude-teams` 的区别

Orca 1.4.239 的 `orca agent-context` 里已经列出了 `orca claude-teams`（「在当前 Orca 终端里启动 Claude Code Agent Teams」）：在 Orca 终端里跑它，Claude Code 的 Agent Teams 会以 Orca 原生分屏打开 teammates。它和雁阵不冲突，但解决的不是同一层问题：

| | `orca claude-teams` | 雁阵 |
| --- | --- | --- |
| agent | 只有 Claude Code | claude / codex / 任意 agent |
| 岗位常驻 | 否，一次会话内的 teammates | 是，终端常驻，跨天在岗 |
| 跨岗位流转 | 靠 Claude 原生 Team 机制 | Orca 编排层 + 声明式 `links` |
| 质量闸门 | 无 | `gates`，命令通过才算完成 |
| 评审链 | 无 | `reviewed_by` / `hands_to` 自动建单并派发 |
| 卡住看门狗 | 无 | 调度员巡查 → 提醒岗位 → 通知牵头岗 → 冻结 |
| 重启恢复 | 无 | `wl restore` / `wl autostart` |
| 界面同步 | 无 | 看板状态、卡片注释、未读标记、网页控制台 |

要在 Orca 里开几个 Claude 分屏用前者；要用「常驻团队 + 流程约束 + 跨 agent」用后者。

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

> `wl up` 要在 **Orca 之外的普通终端** 里跑（原因与变通办法见[在 Orca 终端里跑 `wl up`](#在-orca-终端里跑-wl-up)）。想看它与 Orca 的对应关系、界面里会看到什么，见[在 Orca 里怎么用](#在-orca-里怎么用)。

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

### 远端环境（Lima 等已配对环境）

agent 跑在 Orca 已配对的远端环境（`orca environment list` 能看到，如 Lima VM 里的 `lima-agent`）时，给岗位写 `environment`，`launch` 写成能在那个环境里启动 agent 的命令：

```yaml
posts:
  - id: builder
    agent: claude
    launch: 'claude-lima --dangerously-skip-permissions'
    environment: lima-agent
```

重启后 `wl restore` 对这样的岗位用 `orca search --environment lima-agent` 按标记找回 VM 里的会话，再执行 `claude-lima --dangerously-skip-permissions --resume <会话ID>`。几点要求：

- **包装脚本必须把参数原样传给 agent**，例如 `exec limactl shell agent claude "$@"`。**不透传时 `wl restore` 会发现**：它在接回提示里带一个标识，发出后到 VM 里按标识搜，看提示落进了哪个会话。落进了别的会话（`--resume <id>` 被丢掉，VM 里起的是全新会话），岗位报 `不确定`、退出码 3，原因里写出两个会话 ID；修好包装脚本后先关掉该岗位的终端再重跑。搜不到（索引还没跟上）或搜索失败时仍报接回成功，岗位行下面加一条 `注：未能确认…`。也可以自己在 VM 里 `ps -eo args | grep claude` 看进程参数里有没有 `--resume <id>`。
- 找回的条件和本机一样严格：会话要整串包含该岗位的标记，且 `cwd` 就是岗位的 worktree。已验证的是 Lima 默认的同路径挂载（宿主的 home 以同样的路径出现在 VM 里）。如果 VM 里 `cwd` 不是宿主路径，或者搜索结果没有证据（旧版 Orca），`wl restore` 会报 `uncertain` 并提示 `--session`，**不会**悄悄新起一个丢上下文的会话。
- 手工指定：`wl restore <团队> --session builder=<会话ID>`。会话 ID 可以在 VM 内 `claude --resume` 的列表里看，或者 `orca search --environment lima-agent "<关键词>"` 回执里的 `sessionId`。
- 环境暂时连不上（例如 ssh 隧道断了）时同样报 `uncertain`，连上后重跑 `wl restore` 即可；环境名拼错会直接报错。

### 登录后自动恢复：`wl restore --all` 与 `wl autostart`

`wl restore --all` 对注册表里所有运行中的团队依次执行 `wl restore`；某个团队出错（例如正好被另一个 `wl` 命令占着锁，报 `team_busy`）只记在该团队名下，不影响其余团队，退出码取最严重的一个（4 > 3 > 2 > 1 > 0）。加 `--wait-orca 15m` 会先等 Orca 可达，再等终端列表稳定（每 10 秒采样一次，连续 4 次相同），避免 Orca 还没接管完终端就把岗位判成 offline、重复拉起 agent；等不到就什么都不恢复。

```bash
wl restore --all --wait-orca 15m    # 手动恢复所有运行中的团队
wl autostart install                # 登录后自动执行上面这条（默认最多等 15 分钟）
wl autostart install --wait-orca 30m
wl autostart status                 # 是否已安装、将执行的命令、日志最后 20 行
wl autostart uninstall              # 只删雁阵自己的那一个文件，日志保留
```

| 平台 | 安装位置 | 方式 |
| --- | --- | --- |
| macOS | `~/Library/LaunchAgents/wingline.restore.plist` | launchd 用户代理，`RunAtLoad`。**安装即执行一次**，结果见日志 |
| Linux | `~/.config/systemd/user/wingline-restore.service` | systemd 用户服务（`oneshot`，`WantedBy=default.target`）。无界面或 SSH 场景需要 `loginctl enable-linger <用户>`；Orca 以系统服务运行时，用户服务无法声明在它之后启动，靠 `--wait-orca` 等待 |
| Windows | — | 暂不支持（`autostart_unsupported`），请登录后手动执行 `wl restore --all` |

- 日志在 `<WINGLINE_HOME>/logs/autostart.log`；安装时超过 1 MB 会先改名为 `autostart.log.1`。
- 命令里的 node、入口脚本、`--home`、`--orca` 全部写绝对路径，并显式带上 `PATH`（node 与 orca 所在目录）——登录时没有交互式 shell 的环境。node 或入口脚本如果来自带版本号的目录（nvm 的 `~/.nvm/versions/node/v24.18.0/bin/node`、pnpm 的 `…/.pnpm/@wingline+cli@x.y.z/…`），升级或清理后路径会失效，登录时会因找不到文件而失败；`wl autostart status` 会列出已不存在的路径，重新 `wl autostart install` 即可。
- 自启动执行时在时间线上的执行者是 `autostart`。卸载雁阵之前请先 `wl autostart uninstall`，否则登录时仍会尝试执行。

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

`wl console` 在 `127.0.0.1` 上起一个本地网页控制台（收件箱、总览、任务看板、任务详情、岗位详情、时间线、团队编辑器、关于与诊断），只监听本机，没有绑定其他地址的选项。

- 前台运行并打印一次性登录链接；链接 5 分钟内有效、只能用一次，拿到它就等于拿到控制台的访问权，不要贴到别处。
- 已有控制台在运行时，再执行 `wl console` 只打印新的登录链接，不会起第二个服务；`wl console --link` 只取新链接，没有服务时报 `console_not_running`。
- `wl console --open` 在 Orca 内置浏览器里打开控制台：有服务就直接打开，没有就在 Orca 里新开 `console@wingline` 终端运行它。`--worktree <选择器>` 指定这个终端的工作区；不给时取第一个运行中团队的牵头岗工作区，没有团队则报 `console_no_worktree`。Orca 不支持在内置浏览器打开标签页时，会打印链接，请在浏览器里打开。
- 页面里的写操作（回答提问、发消息、冻结、改派、转人工等）与命令行做的是同一件事，审计里记为执行者 `human`、命令名带 `console:` 前缀；结果不确定时只给出“按原样重试”，不会自动重试。
- 服务重启后会话失效，需要重新 `wl console --link` 取链接；`Ctrl-C` 停止服务。

### 编辑团队（草稿与 `wl up --draft`）

控制台的「编辑」页可以改岗位、`lead`、`links`、`gates`、`budgets.task` 与 `patrol`，有表单和 YAML 两个视图（YAML 是唯一的真实来源，表单的每次修改都由服务端写回 YAML，保留你的注释与字段顺序）。边改边校验，下方的「预演」会列出每个岗位的去向（新增 / 不变 / 启动参数变化 / 删除 / 简报变化）、字段差异，以及改完要执行的命令。新增或删除岗位、`patrol.notify` 请在 YAML 视图里改。

- **团队在运行时**，保存写到同目录的 `team.draft.yaml`（`team.yaml` → `team.draft.yaml`），不影响运行：团队照常工作，`wl attention` 与控制台总览会提示「有未应用的规格草稿」。
- **团队已停止时**，保存直接写 `team.yaml`。
- 应用草稿：`wl down <team>` 后执行 `wl up <team.yaml> --draft`。它先校验草稿，再把旧规格备份成 `team.yaml.bak`，把草稿改名为正式规格，然后照常 `up`。团队仍在运行且草稿改了规格内容时会拒绝（`team_spec_changed`），只改了注释则允许。没有草稿报 `draft_not_found`。
- 保存带冲突检测：加载之后文件被别处改过会得到 `spec_conflict`（HTTP 409），请重新加载。`yaml` 内容上限 48 KB。
- `team.yaml` 视为可信配置：`launch`、`gates`、`notify.command` 会在本机执行。
- 控制台的「关于」页（`/settings`）只读，列出 Orca 路径与版本、数据目录、注册表版本、日志占用与各团队状态，每项标注来源（环境变量 / 默认值 / 注册表 / 文件 / Orca）。

### Orca 界面上的状态

调度员在运行时，会在每次巡查（约 5 分钟一轮）结束时把状态同步到 Orca 自己的界面：

- **工作区状态**（`patrol.workspace_status`，默认 `true`）：岗位所在 worktree 显示 `in-progress`（有任务派给它）/ `in-review`（它提交的工作正在被审）/ `todo`（有排队的任务）/ `completed`。多个岗位共用一个 worktree 时取优先级最高的（`in-review` > `in-progress` > `todo` > `completed`）。
- **卡片注释**（`patrol.worktree_comment`，默认 `false`）：每个岗位一行，形如 `builder：实现登录（进行中，第 2 轮） ⚠ 无进展`；有巡查信号加 `⚠`，被冻结加 `❄ 已冻结`；通知不再整段覆盖注释。最长 500 字符。

只在值变化时才写；重启调度员后的第一轮只计算不写；某个 worktree 连续 3 次写失败会停手，并在 `wl attention` 的「告警」里列出，重启调度员后重试。这个状态由雁阵维护：你在 Orca 界面里手动改了，会在雁阵下一次算出新值时被覆盖。调度员没在运行时不同步。

> 工作区状态与注释的 Orca 参数已在真机验证（macOS，Orca 1.4.237，见 `spikes/REPORT.md`）：`--workspace-status` 取 `todo`/`in-progress`/`in-review`/`completed`，`--comment` 支持多行。注意 Orca 的 `--comment ""` 会被忽略，没法用空串清空卡片注释。

### 终端视图：`wl tui`

```bash
wl tui [team]        # 省略团队名：只有一个团队时直接进入，多个团队先选择
```

在终端里的全屏视图（备用屏幕，退出后终端恢复原状），需要交互式终端：输入输出被重定向会报 `tui_not_tty`。三个视图：**总览**（调度员状态、岗位表、最近 8 条事件）、**收件箱**（`wl attention` 的各节，告警只读）、**时间线**（新的在下，实时追加）。不依赖控制台服务，岗位与待办每 5 秒、时间线每 2 秒刷新。

| 按键 | 作用 |
| --- | --- |
| `1` `2` `3` / `Tab` | 切换视图 |
| `↑` `↓` / `j` `k` | 选中行 |
| `Enter` | 打开选中项的操作；没有写操作的条目会显示对应的 `wl` 命令 |
| `/` | 时间线里按 `source:` / `post:` / `task:` 过滤，留空清除 |
| `r` | 立即刷新 |
| `R` | 上一次写操作结果不确定时，按原样重试 |
| `?` | 帮助 |
| `q` / `Ctrl-C` | 退出 |

可做的操作：回答提问；处理 gate（可同时改派）；恢复派发失主的任务；冻结 / 解冻；静音 / 取消静音；给岗位发消息。需要输入的内容在底部单行输入框填写，提交前会再确认一次（`y` 执行，其他键取消）。写操作和命令行一样记审计，执行者 `human`、命令名带 `tui:` 前缀。显示窄于 40 列时只提示「窗口太窄」；Windows 需要支持 VT 序列的终端（Windows Terminal 等），否则会先打印一行警告。外部文本（提问正文、任务标题等）里的终端控制序列一律剥除，不会改终端标题或清屏。

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

### 画面信号：上下文快满与用量用完

`wl attention` 的"处理中的信号"里，除了任务相关的信号（`no_progress`、`owner_idle` 等），还有两种从**终端画面**读出来的信号，只对 Claude 岗位生效（每轮巡查读各岗位画面的最后 40 行）：

| 信号 | 画面上的提示 | 雁阵做什么 |
| --- | --- | --- |
| `context_low` | `Context low (N% remaining)` | 通知牵头岗一次（同一会话只通一次；清除后再出现，1 小时内不重复），摘要写"剩余 N%" |
| `usage_limit` | `You've hit your session limit · resets …`（还有 weekly / Opus 等限额） | 通知牵头岗一次，并**暂停**该岗位的 `no_progress`、`owner_idle`、`overdue` 升级，直到预计重置时间后 2 分钟；重置时间读不出来则按 1 小时后复查 |

- 画面信号**只通知、不冻结**，也不往终端打字，唯一的例外是下面的"继续"提示。
- **到点之后**：Claude 2.1.310 在限额重置后会自己继续（画面上有 `Usage limit reached · continuing automatically … · esc to cancel`），这时雁阵不打扰它，每 10 分钟再看一次（最多 3 次）。提示已取消（`Automatic continue cancelled`）或根本没有这行提示时，雁阵向岗位发一行 `[雁阵] 用量已重置，请继续手上的任务 <id>`，并从这一刻重新计 `no_progress`。画面停在选项 / 确认框上发不出去，最多再试 3 轮，之后记 `resume_skipped` 并通知人手动处理。
- 摘要显示在网页收件箱和岗位详情、`wl attention`、`wl tui` 的收件箱，以及 Orca 卡片注释里（"⚠ 用量用完（15:00 重置）"）；同一岗位同时有多个信号时，注释只标一个：等级高的优先，同级 `usage_limit` 先、`context_low` 最后。
- 调度员重启后的第一轮只观察：暂停截止时间从注册表读回，不会重复通知。
- **模式依据 claude 2.1.310 的程序本体字符串，还没有用真实画面核对**（`spikes/REPORT.md` 的 3D-2 块 c 小节）。换了 Claude 版本、或画面上明明出现了提示却没有信号，先看那一节，再用 `spikes/phase-3d2.ts sample <handle> <名字>` 取一份真实画面对照 `packages/core/src/screen/patterns.ts`。

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
| `worktree_comment` | `false` | 为 `true` 时把每个岗位的当前任务与告警标记同步成 worktree 的卡片注释（见「Orca 界面上的状态」） |
| `workspace_status` | `true` | 为 `true` 时同步岗位所在 worktree 的工作区状态（见「Orca 界面上的状态」） |
| `unread_mark` | `true` | 为 `true` 时，牵头岗有新的待办（`wl attention` 里新出现的条目）就给它所在的 worktree 打 Orca 未读标记；红点由 Orca 在你查看时清除，雁阵不清除。重启调度员后的第一轮只记录不标记 |
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

真机实测（claude 2.1.308、codex-cli 0.163.0，见 `spikes/REPORT.md`）的几条经验：

- **claude**：`--permission-mode acceptEdits --allowedTools "Bash(wl:*)"` 够用——岗位能直接执行 `wl task start/done/send`，不弹确认。
- **codex**：默认的 `workspace-write` 沙箱会挡住 `wl` 对 Orca 和注册表的访问（`runtime_access_denied` / `EPERM`），岗位里的 `wl` 命令跑不通；需要在 `launch` 里放开沙箱（例如 `--dangerously-bypass-approvals-and-sandbox`，只建议用在一次性工作区）。首次启动可能弹“Hooks need review”，岗位不会就绪、`wl up` 返回 `uncertain`；在终端里跳过它后再执行一次 `wl up`。
- 岗位在自己的终端里执行 `wl` 时用的是默认数据目录；如果你的 `WINGLINE_HOME` 不是默认值，要在 `launch` 里用 `env WINGLINE_HOME=… <agent>` 带上，否则岗位读写的不是同一个注册表。
- 多个团队共用一个 worktree 时，Orca 上只有一个状态和一条注释：雁阵会把这个 worktree 上其他在运行团队的最近值合并进来（状态取最高优先级，注释每行加 `[团队名]` 前缀）。团队停止后它那部分要等其他团队下一次值变化才更新。

## `team.yaml` 字段速查

| 字段 | 说明 |
| --- | --- |
| `name`、`repo`、`norms`、`lead` | 团队名、仓库、团队规范文件、牵头岗 |
| `posts[].id` / `agent` / `model` / `launch` | 岗位 id、agent、模型；`launch` 可整条覆盖启动命令 |
| `posts[].environment` | 可选。岗位的 agent 跑在 Orca 的已配对环境（如 Lima VM）里时填环境名，格式 `^[a-z0-9][a-z0-9._-]{0,63}$`；重启后 `wl restore` 在该环境里找回会话，见「远端环境」。不写即本机 |
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
pnpm install     # 需要先装 pnpm（corepack enable 即可）
pnpm test         # 单元 + 契约测试
pnpm typecheck
pnpm test:live    # 真机集成测试；需要运行中的 Orca，会创建并关闭终端
```

## 发布

包名：CLI 是 [`@weiping/wingline`](https://www.npmjs.com/package/@weiping/wingline)，引擎是 [`@weiping/wingline-core`](https://www.npmjs.com/package/@weiping/wingline-core)，后者是前者的依赖，安装时会一并拉取。

```bash
# 1. 改 packages/core/package.json 与 packages/cli/package.json 里的 version
# 2. 一条命令构建并发布（先 core 后 cli）：
pnpm publish
```

发布用的是 pnpm 的 workspace 协议替换：cli 里的 `workspace:^` 依赖在发布时自动替换成真实版本号，所以两个包的 version 要同步改。发布需要 npm 登录（`npm whoami` 确认），且账号对 `@weiping` scope 有写权限。

> 小坑：user scope 首次发布 scoped 包后，registry CDN 会缓存几分钟 404——`npm view` / `npm install` 可能短暂 404 但 tarball URL 已 200，等几分钟自愈。

- Design spec: [docs/superpowers/specs/2026-10-10-wingline-design.md](docs/superpowers/specs/2026-10-10-wingline-design.md)
- Implementation plans: [docs/superpowers/plans/](docs/superpowers/plans/)
- 阶段 2A 升级说明: [docs/superpowers/plans/2026-10-13-phase-2a-release-notes.md](docs/superpowers/plans/2026-10-13-phase-2a-release-notes.md)

## License

[MIT](LICENSE)
