# Wingline 雁阵

Persistent, role-based agent teams on top of [Orca](https://github.com/stablyai/orca).

Wingline adds a team layer to Orca: a declarative team spec, long-lived posts (`builder@duo`), automatic review chains, quality gates, budgets and circuit breakers, restart recovery, and a local console opened inside Orca's built-in browser. It drives Orca only through `orca … --json` — no fork, no plugin back doors, no second process supervisor.

雁阵在 Orca 之上加一层“常驻团队”：团队规格、固定岗位、自动审查链、质量闸门、预算与熔断、重启恢复，以及在 Orca 内置浏览器里打开的控制台。

> Status: phase 1 (MVP) — `wl up / ps / send / down` and the `duo` template. Later phases (task workflow, console, recovery) are specified in the design doc.

## 安装

前提：已安装并运行 [Orca](https://github.com/stablyai/orca)；Node ≥ 22.13。

```bash
npm i -g wingline
```

命令行为 `wingline`，简写 `wl`。从源码构建：`pnpm install && pnpm build`，入口 `packages/cli/dist/main.js`。

## 快速开始

先把 `teams/duo/team.yaml` 里的 `repo`、`worktree` 改成你自己的，然后：

```bash
wl up teams/duo/team.yaml          # 拉起 builder@duo 与 checker@duo，重复执行不会产生重复终端
wl ps                              # 查看岗位状态
wl send checker@duo "你好"          # 给岗位发消息，返回“已送达”才算送达
wl down duo --close                # 停止团队并关闭终端
```

`wl send` 返回退出码 3（`send_unconfirmed`）表示消息已输入但没观察到对方开始处理，常见于岗位正忙。先看对方终端；要确认是否送达而不重复发送，用错误提示里的命令：`wl send <地址> <同一条消息> --retry-request <Orca 请求 ID>`。

所有命令支持 `--json`。退出码：0 成功；1 输入有误；2 Orca 明确报错；3 结果不确定（不会自动重发或关闭）；4 内部错误。

### Orca 可执行文件

按顺序查找：`WINGLINE_ORCA` → `ORCA_CLI_COMMAND` → Linux 的 `orca-ide` / macOS 的 `orca` / Windows 的 `orca.exe`、`orca.cmd`。Orca 的 Windows 安装（1.4.224）只提供 `orca.cmd`，经 `cmd.exe` 调用：无法传递换行，整条命令行不能超过约 8000 字符。所以启动包会写入文件再发送一行指引，含换行或过长的 `wl send` 消息会被拒绝——请改成单行，或把内容写进文件后只发路径。

数据目录 `~/.wingline/`（可用 `WINGLINE_HOME` 改变）：`state.db` 注册表，`logs/` 调用日志（保留 7 天）。

## 调度员与 `wl attention`

调度员是每个团队一个的常驻进程：转发岗位的提问与上报、定期巡查卡住的任务并按梯度提醒。

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

## 开发

```bash
pnpm test         # 单元 + 契约测试
pnpm typecheck
pnpm test:live    # 真机集成测试；需要运行中的 Orca，会创建并关闭终端
```

- Design spec: [docs/superpowers/specs/2026-10-10-wingline-design.md](docs/superpowers/specs/2026-10-10-wingline-design.md)
- Implementation plans: [docs/superpowers/plans/](docs/superpowers/plans/)

## License

[MIT](LICENSE)
