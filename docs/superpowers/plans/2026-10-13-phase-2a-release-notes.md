# 阶段 2A 发布说明

2A 分支合并时需要知道的升级步骤、已知偏差与遗留项。

## 升级与行为变化

- **Orca 版本下限提高到 1.4.222。** 2A 依赖的编排语义（调用方 id 账本、`request-show`、R5/R6 实测）都在 1.4.222 及以上验证过；低于它时 `wl` 会给出"不在已验证范围"的警告。
- **F-2 升级正在运行的阶段 1 团队：** 先 `wl down <team>`（不要加 `--close`，终端保持在线），再 `wl up <team.yaml>`。原因：`specHash` 现在包含 2A 新增的字段（`tags`、`gate`、连接、预算、`consults` 等），旧登记的哈希与新规格不一致，不先 `down` 会得到 `team_spec_changed`。
- **F-4 `wl ps` 的 WORKTREE 列偏离了总纲：** `wl up` 把非 `path:` 的选择器（缺省的 `current`）按当次调用目录解析一次，写成 `path:/绝对路径`，所以 `wl ps` 显示的是固定后的路径而不是 `current`。2A spec §13 写的是"不改变 `wl ps` 的输出"，这是一处有意的偏离（gate 目录必须固定在 `wl up` 时刻）。仍存活的岗位在重跑 `wl up` 时保持原来的固定值；新建、已消失或将重建的岗位才重新解析。

## 已知问题（合并后）

- **gate 输出缓冲没有上限：** `wl task done` 把 gate 的完整输出先读进内存，再整体写入 `~/.wingline/logs/<team>/gate-*.txt`。只有 gate 打印数百 MB 时才会成问题。后续改为边读边写入文件（只在内存里保留末尾 4000 字符给 `--body`）。
- **Windows 未在真机验证：** `taskkill` 已改为绝对路径（`%SystemRoot%\System32\taskkill.exe`）、重跑提示按平台加引号、Ctrl-C/SIGTERM 会杀掉 gate 的进程组，但这三处都只在单元测试里验证过。

## 遗留的 Orca 测试数据

契约抓取（`spikes/contract-capture.ts`）在真实 Orca 里留下两个测试 Run：`run_74ee7e4f4a41`、`run_caa90732d2c1`。CLI 不能删除 Run，需要在 Orca 界面里手工删除。
