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

所有命令支持 `--json`。退出码：0 成功；1 输入有误；2 Orca 明确报错；3 结果不确定（不会自动重发或关闭）；4 内部错误。

### Orca 可执行文件

按顺序查找：`WINGLINE_ORCA` → `ORCA_CLI_COMMAND` → Linux 的 `orca-ide` / macOS 的 `orca` / Windows 的 `orca.exe`、`orca.cmd`。Windows 上经 `.cmd` 包装时无法安全传递换行：启动包会写入文件再发送一行指引，含换行的 `wl send` 消息会被拒绝——设置 `WINGLINE_ORCA` 指向 `orca.exe` 可避免。

数据目录 `~/.wingline/`（可用 `WINGLINE_HOME` 改变）：`state.db` 注册表，`logs/` 调用日志（保留 7 天）。

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
