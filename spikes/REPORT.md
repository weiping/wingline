# 阶段 0 探针报告

状态：**探针脚本已写好，尚未在真实 Orca 上运行。** 探针会在 Orca 里创建/关闭终端和 Run（`resume-after-restart` 还要求重启 Orca），需要在测试仓库的专用 worktree 里、由人确认后执行。

运行方式（每个平台各一次）：

```bash
export WINGLINE_SPIKE_WORKTREE=<测试仓库专用 worktree 的选择器>
pnpm tsx spikes/adopt-terminal.ts
pnpm tsx spikes/run-lifetime.ts          # 然后完全重启 Orca，再运行：
pnpm tsx spikes/run-lifetime.ts --verify
pnpm tsx spikes/session-id.ts
pnpm tsx spikes/resume-after-restart.ts  # 会提示你自己重启 Orca
pnpm tsx spikes/retained-reuse.ts
```

原始回执落在 `spikes/out/<探针>/<平台>/`（已 gitignore，脱敏后再复制到 `test/fixtures/receipts/`）。

## 结论

| 探针 | macOS | Linux | Windows | 影响 |
| --- | --- | --- | --- | --- |
| adopt-terminal | 未运行 | 未运行 | 未运行 | 阶段 2 |
| run-lifetime | 未运行 | 未运行 | 未运行 | 决定 `wl up` 是否创建 Run（现默认创建，见 `packages/cli/src/verified.json` 的 `createRun`） |
| session-id | 未运行 | 未运行 | 未运行 | 阶段 3 |
| resume-after-restart | 未运行 | 未运行 | 未运行 | 阶段 3 |
| retained-reuse | 未运行 | 未运行 | 未运行 | 阶段 2 |

verified-orca: >=1.4.214 <1.5.0   （暂定；Linux 主机实测版本 1.4.222 在范围内，其余版本待探针确认）

## 只读核对（Linux，Orca 1.4.222，`orca-ide <命令> --help` 与 `status`/`terminal list`/`--version`）

不创建任何资源，核对了 `OrcaClient` 用到的命令面：

- `--version` 输出纯文本 `1.4.222`；`status --json` 的 `result.runtime.reachable` 存在；`terminal list --json` 的 `result.terminals` 存在。
- **`terminal create` 没有 `--retry-request`，且 Orca 对未知参数返回 `invalid_argument`。** 计划与 spec 7.7 在 `terminal create` 上带了该参数，已在实现中去掉；创建的幂等改靠“按标题查找 + 注册表请求记录”。
- `terminal send` / `wait` / `close`、`orchestration run-create` / `worker-list` 的参数与 `OrcaClient` 一致。`terminal send --retry-request` 的 id 绑定到消息内容和终端进程实例（所以相同消息再次发送必须换新 id，实现里用 `-N` 后缀）。
- `orchestration run-create` 会把调用方“绑定”为该 Run 的协调者；从非 Orca 终端调用时的行为未验证，属于 `run-lifetime` 要回答的问题。
- 未核对：真实回执里 `run-create` 的 Run ID 字段名（现读 `result.run.id`）、`terminal send` 的 `prompt.stages`、`terminal close` 的 `close.ptyKilled`、Orca 未运行时 CLI 的输出形态。`test/fixtures/receipts/` 目前仍是按 Orca 源码手写的样本，需要用真实回执替换。

## MVP 验收

未运行。`pnpm test:live` 在三平台各跑一次后把结果填在这里。
