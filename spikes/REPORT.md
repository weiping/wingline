# 阶段 0 探针报告

状态：**Linux（本机真实 Orca 1.4.222）、macOS 与 Windows（GitHub Actions `orca-live` 工作流，Orca 1.4.224）已运行。** `session-id` 在 Linux（1.4.222）与 macOS 真机（1.4.224，有界面）上跑过；`resume-after-restart` 在 macOS 真机完成重启验证（成立，见「重启验证」一节）。

Linux 测试环境：把 wingline 仓库本身登记进 Orca（`orca repo add`，Orca CLI 没有 repo rm，需要时在界面里移除），worktree 选择器 `path:/Users/liuweiping/workspace/dev/wingline`。

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
| adopt-terminal | **部分成立**：`worker-start` 同样被拒（需要协调者终端）；12,000 字符 `terminal send` 收下 | **部分成立**：12,000 字符 `terminal send` 完整收下（`bytesWritten` 12001）；`worker-start --terminal` 被拒，需要“已绑定 Run 的协调者终端”，从普通 shell 不行；协调者终端内能否接管未验证 | 未运行 | 阶段 2：dispatcher 本来就是专用终端，需在那里重测 |
| run-lifetime | **部分成立**：从普通 shell 同样报 `no_active_sender_terminal`；用 `--from <终端 handle>` 时 `run-create` 成功，两个 Run 并存（其中一个绑定了协调者终端，另一个 `coordinator_handle` 为 null）；重启后保留未测 | **不成立（从普通 shell）**：`run-create` 报 `no_active_sender_terminal`，需要 `--from <终端 handle>` 或在 Orca 终端内运行。多 Run 并存、重启后保留未测 | **部分成立**：同 macOS（`--from` 可行，两个 Run 并存，重启未测） | MVP：`wl up` 不创建 Run（`run_id` 留空，`ps` 不查 `worker-list`），即 spec 的退路 |
| session-id | **不成立（`terminal show`）/ 另有来源**：真机 1.4.224 实测，`terminal show` 只有 `agentIdentity`；但 `orca search` 能给出 `sessionId` 和 `resumeCommand`（本机 agent 完整给出；配对环境的远端 agent 只给 `sessionId`，resumeCommand 被扣留）。详见「macOS 真机探查」 | **不成立（`terminal show`）/ 另有来源**：回执只有 `agentIdentity: "claude"`；但 `orca search --agent claude --json`（Orca 1.4.222）每条命中含 `sessionId`、`source.filePath`、完整 `resumeCommand`，与 macOS 一致。命中里没有终端 handle，终端↔会话仍只能按 `cwd` + `updatedAt` 启发式对应 | 未运行 | 阶段 3：会话 ID 来源已找到（`orca search` / agent 会话文件），见「macOS 真机探查」 |
| resume-after-restart | **成立**（macOS 真机，Orca 1.4.224 完整重启后验证）：runtimeId 从 `707f62af…` 变为 `3154b9e7…` 确认是真重启；用 `orca search` 拿到的恢复命令（`claude --resume 7cd6dc01-…`，显式本机路径）开 `spike-resume-2`，屏幕完整显示原会话（checker 岗位说明 + 重启前被中断的那一轮的现场），空闲等待输入。回执在 `spikes/out/resume-after-restart/darwin/after.json` | 未运行 | 未运行 | 阶段 3：恢复命令来源 = `orca search`（本机）或拼 `claude --resume <id>`；`resume-after-restart.ts` 已改为 search + 会话文件兜底的自动探针（见下节） |
| retained-reuse | **不成立**：同因（需要协调者终端） | **不成立（从普通 shell）**：与 adopt-terminal 同因 | **不成立**：同因 | 阶段 2 |

verified-orca: >=1.4.214 <1.5.0   （实测 1.4.222 与 1.4.224 在范围内）

## macOS 真机探查（2026-10-13，Orca 1.4.224，有界面，按下面「如何在真机上跑」的第 0–2、4 步执行）

- `session-id` 探针结果：`RESULT session-id 不成立 sessionId=无 resume=无`，回执在 `spikes/out/session-id/darwin/terminal-show.json`（只有 `agentIdentity: "claude"`，与 Linux 一致）。
- **会话 ID 来源找到了：`orca search <词> --agent claude --json`**。每条命中含 `sessionId`、`cwd`、`source.filePath`（`~/.claude/projects/<项目路径>/<会话ID>.jsonl`）和现成的 `resumeCommand`（形如 `cd '<cwd>' && claude --resume '<会话ID>'`）。注意：--text 不会提交，必须 `--text ... --enter` 才会真正发给 agent（第一次只发 `--text` 时字节写入了但 TUI 输入框是空的，未产生任何会话记录）。
- **远端/配对环境扣留 resumeCommand**：本机 wingline worktree 的 claude 实际跑在 Lima VM 里（`limactl shell agent … claude-lima`），宿主机的 `orca search` 索引不到 VM 内的会话；加 `--environment lima-agent` 能搜到 VM 侧会话并给出 `sessionId`，但按 `search --help` 的说明，配对服务器会扣留 `resumeCommand` 和 `source.filePath`（返回 null/缺席）。恢复命令可按固定模式自行拼：`cd '<cwd>' && claude --resume '<sessionId>'`，且要在对应执行环境里跑（本例即 VM 内）。
- **终端 → 会话的映射是启发式的**：search 命中里没有 Orca 终端 handle，只能按 `cwd` + `updatedAt` 最新来对应，多个同目录会话并存时不可靠。
- 对本项目 MVP 的额外警示：此机器上对 Lima 内 claude 的 `terminal send --enter` 回执 `prompt.stages` 只有 `input_accepted`，`provider`/`observation` 为 `unsupported`（Orca 无法观测 VM 内 TUI 的投递），即 `wl send` 在这类环境会永远是 `send_unconfirmed`（退出码 3）——与岗位忙无关。
- `resumeCommand` 已具备（模式可拼），`resume-after-restart` 在 macOS 真机上可以跑了，但 `resume-after-restart.ts` 目前只从 `terminal show` 读恢复命令，直接跑会输出「不成立」；需要先改成读 `orca search`（或接受环境变量传入恢复命令）。按约定在此停下，等人确认是否重启 Orca。
- 收尾已完成：`spike-probe` 终端已关，`terminal list` 无 spike- 残留。

### 重启验证（第二轮，同日完成）

`resume-after-restart.ts` 已改成自动探针：启动 agent → 发标记消息让会话落盘 → `orca search` 取恢复命令（拿不到则退到读 `~/.claude/projects/<path>/` 最新 jsonl 自拼）→ 提示人重启 Orca → 重启后开 `spike-resume-2` 录屏幕到 `after.json`。

- 不重启干跑（拒绝重启分支）成功拿到恢复命令 `cd '…/wingline' && claude --resume '7cd6dc01-…'`，无终端残留。
- 真重启后验证**成立**：`after.json` 里屏幕完整恢复原会话（checker 岗位说明全文 + 重启前被中断的那一轮现场），终端空闲等待输入，agent 没有自动乱动。恢复后的会话没有接着干活，只是展示历史——这符合预期，`claude --resume` 是交互式恢复，等人输入。
- 探针两次开关终端均无残留（每次结束都验证了 `terminal list` 无 `spike-`）。

## 如何在真机上跑 session-id 和 resume-after-restart

`session-id` 在 Linux 上已是“不成立”（`terminal show` 只有 `agentIdentity`，没有会话 ID 或恢复命令），`resume-after-restart` 依赖它，所以在其他平台直接重跑多半得到同样结论。建议先做第 2 步探查，找到会话 ID 的来源，再决定要不要跑第 3 步。

### 0. 前提

- 真机上已安装并运行 Orca，`claude` 已登录（探针会真实启动它并等待空闲，不发提示，基本不消耗 token）。
- 仓库在本机，`pnpm install` 已完成。
- 一个测试仓库的专用 worktree，并已登记进 Orca：

  ```bash
  orca repo add --path /path/to/test-repo
  orca worktree list --json        # 记下选择器，形如 path:/path/to/test-repo
  ```

  Linux 上命令名是 `orca-ide`；Windows 上用 `orca.cmd`。

- 设置环境变量（POSIX）：

  ```bash
  export WINGLINE_SPIKE_WORKTREE='path:/path/to/test-repo'
  export WINGLINE_SPIKE_AGENT=claude        # 可选，默认 claude
  ```

  PowerShell：

  ```powershell
  $env:WINGLINE_SPIKE_WORKTREE = 'path:D:\work\test-repo'
  # orca 不在 PATH 时：
  $env:WINGLINE_ORCA = 'C:\Users\<你>\AppData\Local\Programs\orca\resources\bin\orca.cmd'
  ```

### 1. 跑 session-id

```bash
pnpm tsx spikes/session-id.ts
```

它开一个 `spike-session` 终端、启动 agent、等空闲、读 `terminal show`，然后关掉终端。输出一行 `RESULT session-id …`，回执在 `spikes/out/session-id/<平台>/terminal-show.json`。

### 2. 探查会话 ID 到底在哪

`terminal show` 没有的话，会话信息可能在别处。手动开一个 agent 终端后逐个看：

```bash
orca terminal create --worktree "$WINGLINE_SPIKE_WORKTREE" --title probe --command claude --json   # 记下 handle
orca terminal show --terminal <handle> --json      # 已知：只有 agentIdentity
orca search --help                                 # Orca 说它能搜 agent 会话全文，看是否带会话 ID
orca orchestration worker-show --help              # 受监督 worker 的回执里可能有
orca terminal close --terminal <handle>            # 探查完关掉
```

退路是读 agent 自己的会话文件：Claude Code 在 `~/.claude/projects/<项目路径>/*.jsonl`，文件名就是会话 ID，恢复命令是 `claude --resume <会话ID>`。找到来源后，把 `session-id.ts` 改成读那里，并把结论写回 spec 6.1 的“退路”。

### 3. 跑 resume-after-restart

只在第 1 或第 2 步拿到恢复命令后才有意义。**这一步会要求你自己重启 Orca，其中所有终端都会中断，包括正在用的会话，先保存工作。**

```bash
pnpm tsx spikes/resume-after-restart.ts
```

1. 脚本开 `spike-resume` 终端并读恢复命令；找不到就直接输出“不成立”并结束。
2. 提示时输入 `yes`，然后完全退出 Orca 再重新打开（不是只关窗口）。
3. Orca 就绪后再输入 `yes`，脚本用恢复命令开 `spike-resume-2`，等空闲，把屏幕输出存到 `spikes/out/resume-after-restart/<平台>/after.json`，再关掉终端。
4. 它只会输出“部分成立”，需要人来看 `after.json`，判断是不是接回了原来的对话。

### 4. 收尾

- 把 `RESULT` 行和你的判断填进上面的结论表。
- 清理残留终端：`orca terminal list --json`，再逐个 `orca terminal close --terminal <handle>`。探针开的终端标题都以 `spike-` 开头。

### 5. 交给 Claude Code 执行

第 0 到 2 步和第 4 步适合交给 Claude Code 在真机上做；第 3 步要重启 Orca，注意：

- 如果 Claude Code 就跑在 Orca 的终端里，重启 Orca 会把它自己杀掉。请在 Orca 之外的普通终端里运行它，由人来完成“退出并重开 Orca”，它只在提示处等待。
- `resume-after-restart` 只会输出“部分成立”，是否接回了原对话由人看 `after.json` 判断，不要让它自行下结论。
- 它会往 Orca 里登记仓库、创建和关闭终端，务必限定在测试仓库的专用 worktree 里。
- 先在那台机器上 `git pull`，确保拿到包含本节的最新 `main`。
- 如果它找到了会话 ID 的来源，`session-id.ts` 需要相应修改：让它把 diff 给你看，或带回来再改。

可以直接贴给它的提示词（把 `<平台>`、`<路径>` 换成实际值）：

```text
读 spikes/REPORT.md 里的“如何在真机上跑 session-id 和 resume-after-restart”，在本机（<平台>）按步骤做：
1. 用测试仓库 <路径> 的专用 worktree，不要碰其他仓库和 worktree。
2. 先跑 session-id 探针，再按第 2 步探查会话 ID 的来源，把发现的命令和输出摘要给我。
3. 到 resume-after-restart 之前停下来问我；它需要我手动重启 Orca，我确认后你再继续，之后把 after.json 的关键内容摘给我，由我判断。
4. 全程只创建、关闭标题以 spike- 开头的终端，结束时列出残留的并关掉。
5. 把结果填进 REPORT 的结论表，只改 spikes/REPORT.md，不要改其他文件，不要提交也不要推送。
```

## 实测发现（计划和 spec 里是错的，代码已按实测修正）

1. `terminal list` 的 `title` 是 shell 自己的窗口标题；`terminal create --title` 设的自定义标题只在 `--include-visual-layouts` 的 `visualLayouts[].root…tabs[].title` 里，用 `tabId` 与终端对应。按 `list` 的 title 找岗位永远找不到，`wl up` 会重复建终端。
2. `terminal send` 的回执是 `result.send.{accepted,prompt.stages}` 加 `result.mutation.requestId`，不是 `result.accepted`。
3. `--retry-request` 只接受 Orca 自己分配的 UUID（回执里的 `mutation.requestId`），不能自己编；`terminal create` 根本没有这个参数。需要确认时，对同一条命令带上 Orca 报告的 ID，Orca 回放回执而不重发。
4. `terminal wait` 超时是 `ok:false`、code `timeout`，不是 `satisfied:false`。
5. 对 Claude 岗位发 `terminal send`：空闲时 `stages` 含 `turn_started`（已验证 `delivered`）；岗位正在干活时只有 `input_accepted`，Orca 提示“Enter 可能被吞”，`wl send` 报 `send_unconfirmed`（退出码 3）。
8. **macOS 无界面（CI）下，终端的 tabId 形如 `pty:10`，不在 `visualLayouts` 里，其 `list` 里的 `title` 本身就是 `--title` 设的自定义标题**（有界面的 Linux 则相反）。所以 `terminalList` 先看布局，没有再退回终端自己的 title。
9. **Windows：Orca 1.4.224 的安装只提供 `resources/bin/orca.cmd`（和主程序 `Orca.exe`），没有可直接运行的 CLI exe。** 因此 Windows 上一律走 `cmd.exe /d /s /c`：多行文本不可传，整条命令行不能超过约 8191 个字符。spec 里“设置 WINGLINE_ORCA 指向 orca.exe”的退路在该版本上不存在。
10. Orca 未运行时：`status --json` 返回 `ok:true`、`runtime.reachable:false`（退出码 0）；其他命令返回 `ok:false`、code `runtime_unavailable`（"Start the Orca app first"）。与实现的处理一致。
11. macOS 没有 GNU `timeout`；`orca open` 要放到后台，再轮询 `status`。
7. `terminal send --retry-request <Orca 报告的 ID>` 用同一消息重发时返回同一个 requestId，屏幕上标记文本只出现一次，即回放而非重发（已验证；“未确认→确认”的转变没能制造出来，Claude 忙时会把输入排队并报 `turn_started`）。
6. 岗位收到启动包后会立刻开始工作（实测 Claude 读仓库、跑命令），`tui-idle` 要等它做完。

12. **`terminal create --command <agent名>` 走的是 Orca 的 agent 启动偏好，不是裸 shell 解析**（macOS 真机实测）：`--command claude` 实际执行的是用户在 Orca 里配置的启动命令——本机配的是 `claude-lima --dangerously-skip-permissions`，于是 claude 跑进了 Lima VM（证据：进程是 `limactl shell … claude-lima`，会话文件落在 VM 的 `~/.claude/projects/`，宿主 `type claude` 在 Orca 终端里解析的是本机原生二进制 `~/.local/bin/claude`）。**要跑本机 claude，team.yaml 里必须用显式 `launch`**：
    ```yaml
    launch: '/Users/liuweiping/.local/bin/claude --dangerously-skip-permissions'
    ```
    影响：`wl` 的 `agent: claude` 简写在不同机器上可能指向完全不同的执行环境（本机/VM/远端），spec 和文档需要写明这一点。
13. **本机 claude × 2 跑 duo 团队，MVP 验收 1–5 全过**（macOS 真机，Orca 1.4.224，`vitest run --config vitest.live.config.ts`，`WINGLINE_LIVE_BUILDER_LAUNCH`/`WINGLINE_LIVE_CHECKER_LAUNCH` 都指到本机 claude，66 秒）：up 拉起、重复 up 不产生新终端、ps 为 live、send、down --close 后终端消失。两个岗位的会话文件都在宿主 `~/.claude/projects/-Users-liuweiping-workspace-dev-wingline/`，`orca search`（不加 `--environment`）能搜到并给出完整 `resumeCommand`——本地跑时 session-id 的来源问题自然消失。测试已自动 `down --close`，无残留终端。

## 只读核对（Linux，Orca 1.4.222，`orca-ide <命令> --help` 与 `status`/`terminal list`/`--version`）

不创建任何资源，核对了 `OrcaClient` 用到的命令面：

- `--version` 输出纯文本 `1.4.222`；`status --json` 的 `result.runtime.reachable` 存在；`terminal list --json` 的 `result.terminals` 存在。
- **`terminal create` 没有 `--retry-request`，且 Orca 对未知参数返回 `invalid_argument`。** 计划与 spec 7.7 在 `terminal create` 上带了该参数，已在实现中去掉；创建的幂等改靠“按标题查找 + 注册表请求记录”。
- `terminal send` / `wait` / `close`、`orchestration run-create` / `worker-list` 的参数与 `OrcaClient` 一致。`terminal send --retry-request` 的 id 绑定到消息内容和终端进程实例（所以相同消息再次发送必须换新 id，实现里用 `-N` 后缀）。
- `orchestration run-create` 会把调用方“绑定”为该 Run 的协调者；从非 Orca 终端调用时的行为未验证，属于 `run-lifetime` 要回答的问题。
- 已在后续实测中核对，见上节。`status` 在 Orca 未运行时的 CLI 输出形态仍未核对（Orca 正在使用中，不能停）。

## MVP 验收

`orca-live` 工作流（手动触发，macOS 与 Windows，Orca 1.4.224，builder/checker 都用 `node -e "process.stdin.resume()"` 占位，`send` 预期 `send_unconfirmed`）：两个平台验收 1–5 全部通过。

`pnpm test:live`（Linux；checker 用 Claude 代替本机没有的 codex，`WINGLINE_LIVE_CHECKER_LAUNCH=claude`）通过：验收 1–5 成立（up 拉起、再次 up 不产生新终端、ps 为 live、send、down --close 后终端消失）。send 一步：岗位忙时按设计为 `send_unconfirmed`，空闲时为 `delivered`。

注：`duo.live.test.ts` 的 send 一步在岗位空闲时断言 `delivered`、忙时断言 `send_unconfirmed`，两条分支都算通过，所以下面 macOS 真机那次到底走了哪条分支没有记录；`delivered` 在 macOS 本机 claude 上的确认需要补跑并记下 `wl send` 的实际输出。

macOS 真机（Orca 1.4.224）以**本机 claude × 2**（builder 与 checker 都用显式 `launch` 指向本机 claude 二进制，见实测发现 12–13）跑同一验收，1–5 全部通过。