# 阶段 0 探针报告

状态：**Linux 已在真实 Orca 1.4.222 上运行；macOS、Windows 未运行。** `resume-after-restart` 需要你自己重启 Orca，未运行。

测试环境：把 wingline 仓库本身登记进 Orca（`orca repo add`，Orca CLI 没有 repo rm，需要时在界面里移除），worktree 选择器 `path:/Users/liuweiping/workspace/dev/wingline`。

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
| adopt-terminal | 未运行 | **部分成立**：12,000 字符 `terminal send` 完整收下（`bytesWritten` 12001）；`worker-start --terminal` 被拒，需要“已绑定 Run 的协调者终端”，从普通 shell 不行；协调者终端内能否接管未验证 | 未运行 | 阶段 2：dispatcher 本来就是专用终端，需在那里重测 |
| run-lifetime | 未运行 | **不成立（从普通 shell）**：`run-create` 报 `no_active_sender_terminal`，需要 `--from <终端 handle>` 或在 Orca 终端内运行。多 Run 并存、重启后保留未测 | 未运行 | MVP：`wl up` 不创建 Run（`run_id` 留空，`ps` 不查 `worker-list`），即 spec 的退路 |
| session-id | 未运行 | **不成立（仅看 `terminal show`）**：回执有 `agentIdentity: "claude"`，没有会话 ID 或 resumeCommand；其他命令是否提供未查 | 未运行 | 阶段 3 |
| resume-after-restart | 未运行 | 未运行（需要人重启 Orca，且依赖 session-id） | 未运行 | 阶段 3 |
| retained-reuse | 未运行 | **不成立（从普通 shell）**：与 adopt-terminal 同因 | 未运行 | 阶段 2 |

verified-orca: >=1.4.214 <1.5.0   （Linux 实测 1.4.222 在范围内）

## 实测发现（计划和 spec 里是错的，代码已按实测修正）

1. `terminal list` 的 `title` 是 shell 自己的窗口标题；`terminal create --title` 设的自定义标题只在 `--include-visual-layouts` 的 `visualLayouts[].root…tabs[].title` 里，用 `tabId` 与终端对应。按 `list` 的 title 找岗位永远找不到，`wl up` 会重复建终端。
2. `terminal send` 的回执是 `result.send.{accepted,prompt.stages}` 加 `result.mutation.requestId`，不是 `result.accepted`。
3. `--retry-request` 只接受 Orca 自己分配的 UUID（回执里的 `mutation.requestId`），不能自己编；`terminal create` 根本没有这个参数。需要确认时，对同一条命令带上 Orca 报告的 ID，Orca 回放回执而不重发。
4. `terminal wait` 超时是 `ok:false`、code `timeout`，不是 `satisfied:false`。
5. 对 Claude 岗位发 `terminal send`：空闲时 `stages` 含 `turn_started`（已验证 `delivered`）；岗位正在干活时只有 `input_accepted`，Orca 提示“Enter 可能被吞”，`wl send` 报 `send_unconfirmed`（退出码 3）。
6. 岗位收到启动包后会立刻开始工作（实测 Claude 读仓库、跑命令），`tui-idle` 要等它做完。

## 只读核对（Linux，Orca 1.4.222，`orca-ide <命令> --help` 与 `status`/`terminal list`/`--version`）

不创建任何资源，核对了 `OrcaClient` 用到的命令面：

- `--version` 输出纯文本 `1.4.222`；`status --json` 的 `result.runtime.reachable` 存在；`terminal list --json` 的 `result.terminals` 存在。
- **`terminal create` 没有 `--retry-request`，且 Orca 对未知参数返回 `invalid_argument`。** 计划与 spec 7.7 在 `terminal create` 上带了该参数，已在实现中去掉；创建的幂等改靠“按标题查找 + 注册表请求记录”。
- `terminal send` / `wait` / `close`、`orchestration run-create` / `worker-list` 的参数与 `OrcaClient` 一致。`terminal send --retry-request` 的 id 绑定到消息内容和终端进程实例（所以相同消息再次发送必须换新 id，实现里用 `-N` 后缀）。
- `orchestration run-create` 会把调用方“绑定”为该 Run 的协调者；从非 Orca 终端调用时的行为未验证，属于 `run-lifetime` 要回答的问题。
- 已在后续实测中核对，见上节。`status` 在 Orca 未运行时的 CLI 输出形态仍未核对（Orca 正在使用中，不能停）。

## MVP 验收

`pnpm test:live`（Linux；checker 用 Claude 代替本机没有的 codex，`WINGLINE_LIVE_CHECKER_LAUNCH=claude`）通过：验收 1–5 成立（up 拉起、再次 up 不产生新终端、ps 为 live、send、down --close 后终端消失）。send 一步：岗位忙时按设计为 `send_unconfirmed`，空闲时为 `delivered`。macOS、Windows 未运行。
