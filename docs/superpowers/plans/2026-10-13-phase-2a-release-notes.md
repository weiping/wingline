# 阶段 2A 发布说明

2A 分支合并时需要知道的升级步骤、已知偏差与遗留项。

## 升级与行为变化

- **Orca 版本下限提高到 1.4.222。** 2A 依赖的编排语义（调用方 id 账本、`request-show`、R5/R6 实测）都在 1.4.222 及以上验证过；低于它时 `wl` 会给出"不在已验证范围"的警告。
- **F-2 升级正在运行的阶段 1 团队：** 先 `wl down <team>`（不要加 `--close`，终端保持在线），再 `wl up <team.yaml>`。原因：`specHash` 现在包含 2A 新增的字段（`tags`、`gate`、连接、预算、`consults` 等），旧登记的哈希与新规格不一致，不先 `down` 会得到 `team_spec_changed`。
- **F-4 `wl ps` 的 WORKTREE 列偏离了总纲：** `wl up` 把非 `path:` 的选择器（缺省的 `current`）按当次调用目录解析一次，写成 `path:/绝对路径`，所以 `wl ps` 显示的是固定后的路径而不是 `current`。2A spec §13 写的是"不改变 `wl ps` 的输出"，这是一处有意的偏离（gate 目录必须固定在 `wl up` 时刻）。仍存活的岗位在重跑 `wl up` 时保持原来的固定值；新建、已消失或将重建的岗位才重新解析。

## 已知问题（合并后、2B 之前处理）

- **A-M1 并发 `wl task done`：** 同一任务两个进程同时 `done` 时，第二个进程会因 `request_already_done` 以退出码 4 失败，评审通知可能被打两次（状态不会损坏：同一个子任务、同一个 dispatch）。2A 里需要两个人或两个 agent 同时触发；2B 调度员的 `resumeEpoch` 与岗位自己的重跑会同时发生，所以**必须在 2B 之前修**。思路：`done.ts`（交付记录、通知记录）与 `escalate.ts` 里把 `beginRequest` 换成 `openIntent`（insert-or-ignore）+ `finishRequest`，再读回。
- **A-M5 被打断的 `oneshot:*` 行：** `wl task create` / `escalate` 在调用中途被杀（Ctrl-C、终端关闭）时不会打印 `--retry-request` 提示，`--stale` 也不列出这一行；任务可能已在 Orca 里建好，直接重跑同一条命令会再建一个。先 `wl task list` 核对。
- **B-M6 `terminal_not_found`：** 从未在真实 Orca 上观察到这个错误码。`screenGuard` 遇到其他任何失败都按 `unknown` 处理（不打字），是安全的回退；2B 之前应抓一次真实回执。

## Windows

以下没有在 Windows 上验证，都不会损坏状态：

- 错误提示里重跑命令的引号是 POSIX 风格（单引号），在 cmd.exe / PowerShell 里需要手工改写。
- 超时杀进程树用 `taskkill`，通过 PATH 查找。
- gate 的输出缓冲没有上限（输出同时写入文件）；只有 gate 打印数百 MB 时才会成问题。
- Ctrl-C 不会传到 gate 的进程组（gate 以独立进程组运行，超时才会被整组杀掉）。

## 遗留的 Orca 测试数据

契约抓取（`spikes/contract-capture.ts`）在真实 Orca 里留下两个测试 Run：`run_74ee7e4f4a41`、`run_caa90732d2c1`。CLI 不能删除 Run，需要在 Orca 界面里手工删除。
