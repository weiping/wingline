# 阶段 0 探针报告

状态：**阶段 0 收尾。** Linux（本机真实 Orca 1.4.222）五个探针全部跑过；macOS 真机（1.4.224，有界面）五个探针全部跑过；Windows 只通过 GitHub Actions `orca-live` 工作流验证过 MVP 验收（1–5）与 `run-lifetime`、`retained-reuse` 两个探针，`adopt-terminal`、`session-id`、`resume-after-restart` 在 Windows 上保持“未运行”——这三个探针的结论本就不阻塞阶段 0+1 MVP（见 spec 6.1 的“是否阻塞 MVP”列），决定到此为止不再补。`session-id` 在 Linux（1.4.222）与 macOS 真机（1.4.224，有界面）上跑过；`resume-after-restart` 在 Linux 与 macOS 真机都完成了重启验证（均成立，见「重启验证」与「Linux headless 真机 resume-after-restart 补充验证」两节）。`orca-live` 工作流已完成它的验证使命，从仓库删除，不再保留。

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
| run-lifetime | **成立（需协调者终端）**：普通 shell 报 `no_active_sender_terminal`；用 `--from <终端 handle>` 或在 Orca 终端内 `run-create` 成功；Run 及其 `coordinator_handle` 绑定字符串在 Orca 完整重启后**保留**（实测 Orca 1.4.224 重启前 `ready`，重启后 Run 与绑定依然在，worker 自动置为 `abandoned`/`terminal_missing`，旧终端失效需重新认领）。详见待验证项 C | **不成立（从普通 shell）**：`run-create` 报 `no_active_sender_terminal`，需要 `--from <终端 handle>` 或在 Orca 终端内运行。多 Run 并存、重启后保留未测 | **部分成立**：同 macOS（`--from` 可行，两个 Run 并存，重启未测） | MVP：`wl up` 不创建 Run（`run_id` 留空，`ps` 不查 `worker-list`），即 spec 的退路 |
| session-id | **不成立（`terminal show`）/ 另有来源**：真机 1.4.224 实测，`terminal show` 只有 `agentIdentity`；但 `orca search` 能给出 `sessionId` 和 `resumeCommand`（本机 agent 完整给出；配对环境的远端 agent 只给 `sessionId`，resumeCommand 被扣留）。详见「macOS 真机探查」 | **不成立（`terminal show`）/ 另有来源**：回执只有 `agentIdentity: "claude"`；但 `orca search --agent claude --json`（Orca 1.4.222）每条命中含 `sessionId`、`source.filePath`、完整 `resumeCommand`，与 macOS 一致。命中里没有终端 handle，终端↔会话仍只能按 `cwd` + `updatedAt` 启发式对应 | 未运行 | 阶段 3：会话 ID 来源已找到（`orca search` / agent 会话文件），见「macOS 真机探查」 |
| resume-after-restart | **成立**（macOS 真机，Orca 1.4.224 完整重启后验证）：runtimeId 从 `707f62af…` 变为 `3154b9e7…` 确认是真重启；用 `orca search` 拿到的恢复命令（`claude --resume 7cd6dc01-…`，显式本机路径）开 `spike-resume-2`，屏幕完整显示原会话（checker 岗位说明 + 重启前被中断的那一轮的现场），空闲等待输入。回执在 `spikes/out/resume-after-restart/darwin/after.json` | **成立**（本机 Orca 1.4.222，headless systemd 部署，由 Claude 代为执行，详见「Linux headless 真机 resume-after-restart 补充验证」一节）：只 `systemctl restart orca-serve.service` 不足以构成真重启——PTY 由独立的 `orca-daemon-<nonce>.scope`（user scope）持有，未随之重启，旧终端原样存活；额外停掉该 daemon scope 再重启后，runtimeId、daemon nonce、app pid 均变化，旧 handle 变 `terminal_handle_stale`，这才是等价的真重启。用 `orca search` 拿到的恢复命令（`claude --resume 21365ceb-…`）开 `spike-resume-2`，屏幕完整显示原会话（标记提示 + 回复），空闲等待输入。回执在 `spikes/out/resume-after-restart/linux/after.json` | 未运行 | 阶段 3：恢复命令来源 = `orca search`（本机）或拼 `claude --resume <id>`；`resume-after-restart.ts` 已改为 search + 会话文件兜底的自动探针（见下节）；Linux headless 部署下“重启”这个词本身有歧义，见补充验证一节 |
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

## Linux headless 真机 resume-after-restart 补充验证（2026-10-13，Orca 1.4.222，由 Claude 代为执行）

这台机器的 Orca 是 headless 部署：`orca-serve.service`（systemd 系统服务，`AppRun serve --port … --pairing-address 127.0.0.1`，配 Xvfb 虚拟屏）+ 一个独立的 `orca-daemon-<launch-nonce>.scope`（systemd **用户** scope，跑 `daemon-entry.js`）。这台机器上用户有免密 sudo，Claude 本身跑在 sshd 起的会话里，不在 Orca 的进程树下，可以安全地自己触发重启。

步骤与发现：

1. 开 `spike-resume` 终端（`--command claude`），等 `tui-idle`，发送标记消息“Reply with exactly: SPIKE_RESUME_MARKER”并等它答完。
2. 用 `orca search '"SPIKE_RESUME_MARKER"' --agent claude --path <repo> --fresh --sort newest --limit 10 --json` 取恢复命令。**注意**：带引号的精确搜索仍然命中了 2 条——因为执行这次探针的 Claude Code 会话本身（这次对话）在它自己调用 `terminal send` 的 shell 命令里原样包含了这段标记文字，所以它自己的会话文件也被搜中，且因为消息更多、分数更高排在前面。靠 `messageCount`（新建的 spike 会话只有 2 条）才分清哪个是真正的探针会话。这是「待验证项 A」里“终端 ↔ 会话映射是启发式的”又一具体表现：连带引号的精确搜索也可能被“顺手发测试消息的那个会话”自己污染，排序不能照单全收，还需要按会话新鲜度/消息数等维度交叉核对。
3. **第一次 `sudo systemctl restart orca-serve.service` 不足以构成「重启」**：重启后 app 的 pid 和 `runtimeId` 都变了（进程确实换了），但 `terminal list` 里原来的 handle 依然存在、`connected:true`、`incarnationId` 不变，`terminal read` 完整显示着重启前的屏幕内容（标记提示 + 回复）；底层 `claude` 进程其实已经换了新 pid，说明 Orca 把这个 headless 终端整个重新纳管（tab/pty 元数据）并重新拉起了同一条启动命令，但这并不等价于“杀掉 orcad、会话丢失、要用 `--resume` 找回”的场景。
4. 追查发现：持有 PTY 的是独立的 `orca-daemon-<nonce>.scope`（systemd 用户 scope），它的生命周期与 `orca-serve.service` 这个系统服务不是一回事——第一次重启 `orca-serve.service` 时这个 daemon scope 根本没有被动到（同一个 launch-nonce、同一个 pid 一直在跑）。
5. 额外执行 `systemctl --user stop orca-daemon-<nonce>.scope`（把 daemon 也杀掉）、确认其下的 `claude` 进程随之消失，再 `sudo systemctl restart orca-serve.service` 一次：这次 runtimeId、daemon nonce、app pid 全部换新，旧终端 handle 变成 `terminal_handle_stale`——这才是和 macOS“完全退出重开”对等的真重启。
6. 在这之后用恢复命令 `claude --resume '21365ceb-…'` 开 `spike-resume-2`：**成立**，屏幕完整显示原会话（标记提示 + 回复），空闲等待输入，和 macOS 结论一致。收尾 `terminal close`，`terminal list` 无残留。
7. 回执：`spikes/out/resume-after-restart/linux/{search,before,revive-create,after}.json`；`stray-respawned-terminal.json` 记录的是第 3 步里“只重启服务、daemon 未死”时那个被原样保留的终端内容，留作佐证。

**对本项目的影响**：这是部署方式特有的细节，不改变 spec/plan 的结论——`wl` 从不自己重启 Orca，这段只是在给“怎样才算一次真重启”这件事留下一个可复现的反例，供以后在类似 headless/systemd 部署上验证阶段 3 的恢复设计时参考，避免拿“只重启前台进程”当作“Orca 整个重启”的充分验证。

## 待验证项的操作步骤（macOS / Linux，不含 Windows；均在测试 worktree 内，不用重启的先做）

以下命令按 zsh 写：用函数 `wl`，不要把命令存进变量再 `$WL` 展开（zsh 不拆分）。`dist` 是平台无关的 tsc 产物，共享目录时不需要在每台机器上重新 `pnpm install`。

### A. 终端 ↔ 会话映射是否可靠（对应阶段 3 的恢复）

问题：duo 的两个岗位在同一 worktree，`orca search` 命中里没有终端 handle。能否“给终端发唯一标记，再搜标记”精确对应？

```bash
cd <仓库根目录>
wl() { node "$PWD/packages/cli/dist/main.js" "$@"; }
export WL_SB=$(mktemp -d /tmp/wl-map-XXXXXX); export WINGLINE_HOME=$WL_SB/home
cp -R teams/duo $WL_SB/duo
CLAUDE_BIN=$(command -v claude)      # 要的是本机二进制，不是 claude-lima 之类
cat > $WL_SB/duo/team.yaml <<EOT
version: 1
name: duo
repo: path:$PWD
norms: NORMS.md
lead: builder
posts:
  - id: builder
    agent: claude
    launch: '$CLAUDE_BIN --dangerously-skip-permissions'
    worktree: path:$PWD
    brief: [briefs/builder.md]
  - id: checker
    agent: claude
    launch: '$CLAUDE_BIN --dangerously-skip-permissions'
    worktree: path:$PWD
    brief: [briefs/checker.md]
EOT
wl up $WL_SB/duo/team.yaml --json
get() { wl ps duo --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.find(r=>r.address===process.argv[1]).handle))' "$1"; }
HB=$(get builder@duo); HC=$(get checker@duo); echo "builder=$HB checker=$HC"   # 任一为空就停
orca terminal wait --terminal "$HB" --for tui-idle --timeout-ms 180000 --json | grep satisfied
orca terminal wait --terminal "$HC" --for tui-idle --timeout-ms 180000 --json | grep satisfied
N=$(date +%s)
wl send builder@duo "只回复收到。标记 WLMAP-B-$N" --json; echo "exit=$?"
wl send checker@duo "只回复收到。标记 WLMAP-C-$N" --json; echo "exit=$?"
orca terminal wait --terminal "$HB" --for tui-idle --timeout-ms 120000 --json | grep satisfied
orca terminal wait --terminal "$HC" --for tui-idle --timeout-ms 120000 --json | grep satisfied
for K in B C; do
  echo "--- WLMAP-$K-$N"
  orca search "WLMAP-$K-$N" --agent claude --fresh --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s).result.hits||[];console.log("hits="+h.length);h.forEach(x=>console.log(x.sessionId,x.cwd,x.updatedAt))})'
done
wl down duo --close --json
orca terminal list --json | grep -n 'duo'      # 应无输出
```

判读：B、C 各恰好 1 个命中且 `sessionId` 不同 → 成立（阶段 3 用“发标记再搜”绑定终端与会话）；命中为 0、多于 1 或两个 ID 相同 → 不成立，保留输出。`send` 返回 `send_unconfirmed` 不影响，标记仍会落盘。

### B. 协调者终端内的 `worker-start --terminal`（阶段 2 dispatcher）

问题：从普通 shell 已知被拒；在已绑定 Run 的协调者终端里能否接管已有终端？**必须在 Orca 自己的终端里敲命令。**

1. 在 Orca 界面对测试 worktree 新开一个普通 shell 标签，作为协调者。
2. 在该终端里：

```bash
orca orchestration run-create --objective "spike coordinator" --json     # 记下 run_id → RUN
orca terminal create --worktree path:<测试仓库路径> --title spike-adopt --command "$(command -v claude)" --json   # 记下 handle → T
orca terminal wait --terminal <T> --for tui-idle --timeout-ms 120000 --json | grep satisfied
orca orchestration worker-start --spec "只回复 OK" --terminal <T> --worktree current --run <RUN> --json
orca orchestration worker-list --run <RUN> --json
```

3. 收尾：`orca terminal close --terminal <T>`，再关掉协调者标签。Orca CLI 没有删除 Run 的命令，`spike coordinator` 这个 Run 需要在界面里清理。

判读：`worker-start` 返回 `ok:true` 且 `worker-list` 出现该 worker → 成立；否则记下错误码和 message。

### C. Run 重启后是否保留（需要重启 Orca，在 B 之后做）

1. 保存工作后，普通终端执行 `orca orchestration worker-list --run <RUN> --json > /tmp/before.json`。
2. 完全退出 Orca 再重开（重启会中断所有终端）。
3. 重启后执行同一条 `worker-list --run <RUN> --json`，与 `/tmp/before.json` 对比：Run 是否仍在、协调者绑定是否保留。

### 执行结果（2026-10-13，macOS 真机，Orca 1.4.224，由 Claude 代为执行）

**A. 终端 ↔ 会话映射：成立。** 两个岗位（builder@duo、checker@duo）各发唯一标记 `WLMAP-B-1791903316` / `WLMAP-C-1791903316`，带引号精确搜索 `orca search '"<标记>"' --agent claude --fresh --json`，各恰好 1 个命中，sessionId 不同：

| 标记 | sessionId | 岗位 |
| --- | --- | --- |
| WLMAP-B-1791903316 | `05386dbe-0475-4262-aafc-c173de47a608` | builder@duo |
| WLMAP-C-1791903316 | `7d9292c9-7da9-4df1-a417-aa7b7c724e38` | checker@duo |

- 不加引号的裸搜索会分词，各返回 2 条命中，排序第一的仍是正确会话，但不可靠，阶段 3 必须用引号精确搜索。
- 两次 `wl send` 均为 `delivered`（岗位已空闲）。`down --close` 后两个终端均 `closed`，`terminal list` 无 duo 残留。
- 临时目录 `/tmp/wl-map-Z6UMYK` 未删除，可自行清理。

**B. 协调者终端内 `worker-start --terminal`：成立。** 步骤与计划有出入，如实记录：

- 协调者终端没有在 Orca 界面手动开，而是用 `orca terminal create --title spike-coord` 建的。但 Run 的 `coordinator_handle` 与 `spike-coord` 的 handle 一致（经 `--from` 绑定），所以判读仍有效。
- 第一次不带 `--from` 执行 `run-create` 时，`coordinator_handle` 被绑定为 `term_4f9f35e6-…`（即运行本次命令的 `π - wingline` 终端）。说明从 Orca 内终端调用时，调用方会自动绑定为协调者。
- 接管流程：`spike-adopt`（`term_e40f50eb-…`，`claude --dangerously-skip-permissions` 本机二进制）`tui-idle` 满足后，`worker-start --from <spike-coord> --terminal <spike-adopt> --worktree path:<仓库> --run run_0716f392c455` 返回 `ok:true`、`state:ready`、`effects` 中 terminal 为 `reused`、`dispatch_input` 为 `accepted`，`turnStart: unsupported`。
- `worker-list --run run_0716f392c455` 出现该 worker（`workerState: ready`，`agentTerminalHandle` 为接管的终端，`terminalState: retained`）。
- 关闭两个终端后，worker 变为 `failed`（`detail: process_exited`），与预期一致。
- 残留 Run：`run_b49d6127bc88`（`test from outside`，协调者为 `term_4f9f35e6-…`）和 `run_0716f392c455`（`spike coordinator`）。CLI 没有删除 Run 的命令，需在界面里清理。

**C. Run 重启后是否保留：成立（Run 元数据及绑定字符串保留；底层终端生命周期中断）。**

实测数据（2026-10-13，macOS 真机，Orca 1.4.224 重启验证，runtimeId 从 `3154b9e7…` 变为 `b3cda7f9…` 确认是真重启）：

- **Run 与协调者绑定字符串持久化保留**：重启后 `orca orchestration run-show --id run_6dde7d294994 --json` 与 `run-list` 均完整返回该 Run，其 `coordinator_handle` 保持为重启前的 `term_0ebdf12c-19d6-4893-acb1-3cda925780ff`，未被清除。
- **关联 Worker 状态转移**：重启前状态为 `ready`（`stage: input_accepted`, `activity: working`）；重启后 `orca orchestration worker-list --run run_6dde7d294994 --json` 显示 worker 状态自动判定并标记为 `abandoned`，`dispatchStatus: failed`，`stage.detail: terminal_missing`，`liveness.verdict: unverifiable (missing_status)`，`attention.requiresAction: true`。
- **终端实例处理**：重启后旧终端句柄（`term_0ebdf12c-…` 和 `term_e316c622-…`）均已随进程销毁；虽有按 session 布局重新打开的空白 shell 标签页，但分配的是新 handle，旧 handle 彻底失效。
- **结论与影响**：Run 及其元数据具备跨重启持久化能力，但其记录的终端 handle 会悬空；阶段 2 若基于 Run 进行协调者绑定，在系统重启后必须执行协调者重新认领（`run-use`）或新建 Run，不能假设旧终端仍然可交互。
- 伴随产生的测试终端（如恢复后的 `spike-coord2`）已全部调用 `orca terminal close` 关闭清理，无残留。

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

注：`duo.live.test.ts` 的 send 一步在岗位空闲时断言 `delivered`、忙时断言 `send_unconfirmed`，两条分支都算通过，所以下面 macOS 真机那次到底走了哪条分支没有记录。

**macOS 真机 `wl send` 补测（2026-10-13，Orca 1.4.224，本机 claude × 2，显式 `launch`）**：`up` 后立刻对 checker 发送 → `send_unconfirmed`、退出码 3（岗位正在处理启动包，设计预期）；`terminal wait --for tui-idle` 满足后再发 → `outcome: delivered`、退出码 0。即本机 claude 上 `delivered` 路径成立，忙时不误报、不重发。收尾 `down --close` 两个岗位均 `closed`。

macOS 真机（Orca 1.4.224）以**本机 claude × 2**（builder 与 checker 都用显式 `launch` 指向本机 claude 二进制，见实测发现 12–13）跑同一验收，1–5 全部通过。

## 阶段 2 探针：orchestration task/dispatch/gate（2026-10-13，Linux 本机真实 Orca 1.4.222）

背景：阶段 2A 原计划雁阵自建一套任务状态机（见已提交 spec 的第一版）。写 spec 过程中发现 `orca orchestration` 已有原生的 `task-create/task-list/task-update/dispatch/worker-start/gate-create/gate-resolve/send(worker_done)` 一整套编排命令（`orca-ide orchestration --help` 核对，1.4.222），遂在落子前跑了一轮探针（脚本 `spikes/task-dispatch-probe.ts`，原始回执见 `spikes/out/task-dispatch-probe/linux/`），验证能不能把雁阵阶段 2A 直接建在这套原生命令之上。

**用法：** `WINGLINE_SPIKE_WORKTREE="path:/Users/liuweiping/workspace/dev/wingline" pnpm tsx spikes/task-dispatch-probe.ts`（脚本因未覆盖 gate-create 失败分支会在跑完关键步骤后抛错退出，已知；后续若要保留需修掉）。补充的手动命令记录在下方结论里。

### 结论

1. **`task-create` / `task-update` / `dispatch` 是"协调者专属"操作，但认证只看 `--from` 的值是否等于 `run.coordinator_handle`，不校验调用方进程是否真的跑在那个终端的 pty 里。** 证据：`run-create --from <T1>` 后，`task-create --run <id> --from <T2>`（T2 不是协调者）被拒，错误码 `consumer_fenced`，消息"This coordinator terminal is no longer bound to Run"；换成 `--from <T1>`（协调者）在同一个外部脚本进程（不在 T1 的 pty 里）里立刻成功。`task-update` 同理（`--from <T2>` 同样 `consumer_fenced`）。
   **影响：** 雁阔只要在团队级别记住一个 `coordinator_handle`（阶段 2A 的 `wl up` 首次运行时建一个专用占位终端或复用 lead 终端来 `run-create`），之后任何岗位调用 `wl task create/claim/start` 时，雁阵内部都用这个记下来的 `coordinator_handle` 当 `--from` 去调 Orca——不要求真的在那个终端里敲命令，也不要求调用 `wl` 的就是 lead 本人。阶段 2B 的"调度员"不是必须先跑起来 task 系统才能用；调度员只是在同一个 Run 上再做 `run-use` 接管协调者身份、处理 `worker_done`/`escalation` 收件箱的那一层。
2. **worker 对自己的 dispatch 自述完成/失败不受协调者限制：** 在被 dispatch 的终端（T2）上执行 `orchestration send --type worker_done --outcome succeeded|failed --task-id <id> --dispatch-id <id> --from <T2 自己的 handle>`，**直接把该任务状态改成 `completed`/`failed`**（`result` 字段自动写入 `provenance:"worker_report"`、`reportedBy`、`completedAt` 等），同时这条消息会进协调者的 `check` 收件箱（`type: worker_done`）。`--subject` 是必填项（`--help` 没写清楚，试了才知道）。
   **影响：** `wl task done` 不需要通过协调者，post 自己的 `wl` 进程直接用自己的真实 handle 发 `worker_done` 就能完成/标记失败自己的任务——这正是"自服务"模型需要的原语。
3. **`failed` 是终态，不是"可以再试"的状态：** 一旦发了 `outcome: failed`，任务进 `failed`、`completed_at` 被写入；要重开必须 `worker-start --retry-of <dispatch_id>`（没有测试这条，属于更重的机制）。**也不能对一个已经 `dispatched` 的任务再次 `dispatch`**（报错"Task ... is dispatched; only ready tasks can be dispatched"）。
   **影响：** gate 失败的重试预算（`budgets.task.max_gate_failures`）不能指望"失败一次就在 Orca 里打个标记再重试"——雁阵必须把重试计数留在本地（`gate_failures` 只存在雁阵自己的扩展表里），只有重试预算耗尽时才真正对 Orca 发一次 `worker_done --outcome failed`（终态）。同理 `hands_to`（转交同一个任务给另一个岗位）不能靠"重新 dispatch 同一个 task"实现，只能是"原任务 `completed`，同时建一个 `--parent <原 id>` 的新任务 dispatch 给目标岗位"——和 `reviewed_by` 其实是同一套机制，只是新任务的标题/tags 不同。
4. **`gate-create`/`gate-resolve`/`gate-list` 不接受 `--run`**（`task` 隐含了 run），其余符合预期：创建一个待决策问题挂在某任务上，`--options` 是 JSON 字符串数组；`gate-resolve --resolution <text>` 把状态改成 `resolved`；两步都只需要 `--from`（同样是"值匹配"authorization，这里用协调者 handle 一样成功）。**没有验证谁 resolve（是否限定协调者或人工）——下次如果要靠这个做"gate 失败预算耗尽后转人工决策"，这条还需要在 2B 设计前再核对一次。**
5. **意外收获：Orca 在自己管理的终端里会设置 `ORCA_TERMINAL_HANDLE` 环境变量**（从一处 `no_active_sender_terminal` 的错误提示里看到：".. or run the command inside a live Orca terminal with ORCA_TERMINAL_HANDLE set"）。**这比雁阵自己注入 `WINGLINE_POST` 更进一步：岗位终端内的 `wl` 进程可以直接读 `ORCA_TERMINAL_HANDLE` 拿到自己当前真实、永远最新的 Orca handle，不需要雁阵自己再查一遍 `locatePost`。** `WINGLINE_POST`（雁阵自己要注入的那个，见 2A spec）仍然需要——它给的是逻辑地址 `<post>@<team>`，`ORCA_TERMINAL_HANDLE` 给的是 Orca 的终端 handle，两者互补，用途不同。
6. 遗留：探针建的 Run（`run_9f6ad99c6230`）**没有被清理**——和阶段 0 一样，Orca CLI 没有删除 Run 的命令，已关闭占位终端，Run 本身需要在 Orca 界面里手动清理。

### 补充探针：`run-use` 接管 + `check`/`ack`（2026-10-13，紧接上面那轮，同一个 Run）

为阶段 2B（调度员）追加验证了"调度员重启后怎么恢复"和"收件箱怎么用"：

1. **`run-use --id <run> --from <新终端 handle>` 能在原协调者终端（T1）已经被关闭之后，把协调者身份转给一个全新建的终端（T3），且同样是值匹配、不要求 T3 真的在物理上执行过这条命令。** `run-show` 确认 `coordinator_handle` 变成 T3，`consumer_generation` 从 1 累加到 2。——这就是调度员重启恢复的完整机制：`wl dispatcher run <team>` 每次启动都无条件 `run-use --id <team.run_id> --from $ORCA_TERMINAL_HANDLE`，不用区分"第一次启动"还是"重启"，然后把新 handle 写回 `teams.coordinator_handle`。
2. **`check` 的收件箱是 Run 级别持久的，不随协调者更换清空**：T3 接管后第一次 `check` 就收到了两条更早、T1 当协调者时产生的 `worker_done` 消息（之前一直没 `--ack`）。
3. **不 `--ack` 就重复返回同一批**（`replayed: true`），`--ack <deliveryId>` 后收件箱清空，下一次 `check` 返回 `count: 0`。
4. **`check --wait --timeout-ms <n>` 在没有新消息时干净地返回 `timedOut: true`，不报错**，即使 `--terminal` 指向的终端已经关闭——调度员主循环可以放心地用"要么拿到消息，要么超时"这两种结果驱动巡查节拍，不需要额外处理"终端已死"这类错误。

原始回执见 `spikes/out/task-dispatch-probe/linux/`（手动命令，未写成脚本，回执直接贴在上面）。

### 补充探针二：幂等重试 / `dispatch --inject` / `gate-create` 对已终态任务 / `WINGLINE_POST` 兼容性 / `lastOutputAt`（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 复审阶段 2 文档后列出的未验证假设）

背景：Opus 复审阶段 2A/2B 的 spec 与 plan 时，指出几处关键假设从未用真机验证过。本轮逐条补测，均在 wingline 仓库自己的 worktree（`path:/Users/liuweiping/workspace/dev/wingline`）里创建/关闭终端和一个 Run（`run_4ee13dec8229`，CLI 无法删除，已如实残留，需人工在界面清理），未影响其他团队状态。

1. **所有编排写操作的 `--retry-request` 是真正的服务端幂等重放，不是仅对 `terminal send` 生效。** `orca-ide orchestration <子命令> --help` 核对：`task-create`/`task-update`/`run-create`/`dispatch`/`gate-create`/`send`/`run-use`/`worker-start` 全部带 `--retry-request <id>`（此前只在 `terminal send` 上验证过）。实测：`task-create` 首次成功后拿到 `mutation.requestId`，用同一个 id 重放同样的 `task-create`（哪怕参数完全照抄）→ 返回同一个 `task.id`、`mutation.replayed:true`，`task-list` 确认只有 1 条，没有建出重复任务。
   **补测（关键）：`--retry-request` 接受调用方自己生成的 UUID，不要求是 Orca 此前返回过的 id。** 新开一个 Run，生成一个本机 `crypto.randomUUID()`，在**从未调用过**的 `task-create` 上直接带 `--retry-request <自己生成的 UUID>`：成功，且回执 `mutation.requestId` 就是这个自定义 UUID。再用同一个 id、**不同的参数**重放：被拒绝，`code: request_mismatch`（"Mutation request … was already used with different input"）。用同一个 id、相同参数重放则是前面验证过的 `replayed:true`。
   **影响：** 2B 的"无重试账本"问题（复审发现 #4）可以完全闭环，不只是"调用成功后补记 id"：雁阵在**发起调用之前**就本地生成一个 UUID、连同完整参数持久化一条"待确认"记录，调用时从第一次起就带上这个 `--retry-request`；无论是进程超时被我们自己杀掉、还是真的网络/崩溃失联，只要本地那条"待确认"记录还在，重试时重放同一个 UUID + 同一套参数即可安全重试——Orca 会要么回放原结果，要么（如果上次其实没真正发出去）正常处理一次，两种情况都不会产生重复的任务/派发。不存在"连 id 都没有"的缺口。
2. **`dispatch --inject` 之前的探针从未传过，默认 `--inject` 是 false，`injected:false` 只是因为没开这个参数，不代表"post 永远不会被通知"。** 补测：对占位进程（非 agent）终端 `--inject` 直接被拒（`code: inject_rejected`，`reason: no_agent_detected`，消息列出了 Orca 能识别的全部 agent CLI 名单，`claude` 在内）；对一个真实跑起来的本机 `claude` 终端（`tui-idle` 已满足）执行 `dispatch --task <id> --to <T> --from <协调者> --inject`，回执 `injected:true`，`prompt.stages:["input_accepted"]`，紧接着 `terminal show` 的 `preview` 显示 claude 已经在处理该任务（标题变成 `◐ Orchestration worker <任务标题>`，屏幕显示"✻ Frolicking…(thinking)"）。
   **影响：** 复审发现 #5（"post 是否知道自己有活干从未验证"）解决——2A 的 `dispatch`/`hands_to`/`reviewed_by` 自动派任务，只要带上 `--inject`，Orca 会把任务内容直接写进目标 agent 的输入框并提交，不需要雁阵自己再做通知或要求 post 轮询。2A 计划里凡是建任务后派给一个 post 终端的地方，都应该把 `dispatch` 换成 `dispatch --inject`。仍要注意：`--inject` 要求目标终端已经是一个被 Orca 识别出的 agent（见上面的名单），对还在启动中或非 agent 终端会被拒——这与 `wl up` 需要先等 `tui-idle` 再派任务的既有设计一致。
3. **`gate-create` 接受一个已经 `failed` 的任务，不报错。** 补测：先用 `orchestration send --type worker_done --outcome failed --task-id <id> --dispatch-id <id> --from <worker handle>` 把任务标记失败（任务进入终态），再对同一个 `--task <id>` 调 `gate-create`，返回 `ok:true`，新建的 gate 状态为 `pending`。
   **影响：** 复审发现 #4 提到的"escalated 路径（预算耗尽后转人工决策，对已 failed 的任务 gate-create）此前未探测"——现已证实成立，2B 的 escalated 分支设计不需要改。
4. **`WINGLINE_POST=<addr> <launch>` 前缀不会干扰 Orca 对 agent 终端的识别（POSIX/bash，Linux 实测）。** 补测：并排起两个终端，一个 `--command "<claude 完整路径> --dangerously-skip-permissions"`，另一个 `--command "WINGLINE_POST=builder@duo <claude 完整路径> --dangerously-skip-permissions"`；两者 `terminal wait --for tui-idle` 都正常满足，`terminal show` 的 `agentIdentity` 都是 `"claude"`，标题都是 `"✳ Claude Code"`，行为无差异。
   **影响：** 复审发现 #7 的"WINGLINE_POST 注入会不会让 Orca 认不出 agent"这一条，在 POSIX shell 下**不成立**（前缀不影响识别）。未验证的仍是 Windows `.cmd` 路径的 `set WINGLINE_POST=<addr>&& <launch>` 写法——本机没有 Windows 真机，这部分假设继续待验证，2B/2A 文档需要把"已在 POSIX 验证、Windows 待验证"写清楚，不能再笼统写"未验证"。
5. **`terminal show` 确实有 `lastOutputAt` 字段，是 Unix 毫秒时间戳（数字），不是字符串。** 实测 `lastOutputAt: 1791941667225`。Worktree 级别另有一个同名字段 `lastActivityAt`，同样是毫秒数字，但那是 worktree 粒度（多个 post 共享一个 worktree 时不够用），patrol 要用的必须是 `terminal show` 里这个按终端/post 的 `lastOutputAt`。
   **影响：** 复审发现 #12（"lastOutputAt 格式与时区风险未验证"）解决：2B 的 `TerminalSummary.lastOutputAt` 类型应为 `number`（epoch ms），判断"多久没输出"直接用 `Date.now() - lastOutputAt`，不需要也不应该用 `Date.parse`，完全没有时区解析风险。另确认 `terminal list --include-visual-layouts --json` 的 `result.terminals[]` 每条也带 `lastOutputAt`（和单个 `terminal show` 同形），巡查可以一次 `terminal list` 拿到全团队所有岗位的值，不需要对每个岗位单独 `terminal show`。

收尾：5 个新建终端已全部 `terminal close`（`ptyKilled:true`），`terminal list` 确认无 `spike` 残留；本轮新建的 Run `run_4ee13dec8229` 和之前历次探针一样无法用 CLI 删除，残留待人工在 Orca 界面清理。

**补充核对（2026-10-14，紧接上面）：** 上面第 1 条列出的 `--help` 核对名单漏了 `gate-resolve`/`gate-list`/`reply`。补查 `orca-ide orchestration gate-resolve/gate-list/reply --help`：`gate-resolve` 和 `reply` 都带 `--retry-request`；`gate-list` 是只读查询，没有（符合预期，查询不需要幂等键）。即 2A/2B 涉及的编排写操作（`run-create`/`run-use`/`task-create`/`task-update`/`dispatch`/`send`/`gate-create`/`gate-resolve`/`reply`）全部支持 `--retry-request`，没有遗漏。
### 补充探针三：重放语义 / 协调者换手 / gate 对任务状态的影响 / pane 身份（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 第二次复审阶段 2 文档）

背景：第二次复审指出，2A 的 `wl task done` 裸重跑安全性只在 `task-create` 上验证过重放（补充探针二 #1），`dispatch`/`worker_done` 在任务状态已经前进之后再重放、协调者换手之后再重放都从未验证；2A 的 `wl up` 与 2B 的调度员争夺协调者身份时会出现什么错误也只是推测；`run-use` 的直接回执、`completed_at` 的格式在计划里被写成"已实测"但 REPORT 里没有证据。本轮写了四个只用占位终端（不跑 agent、基本不消耗 token）的探针脚本逐条验证：`spikes/replay-probe.ts`、`spikes/gate-block-probe.ts`（含 `--part2`）、`spikes/orphan-probe.ts`、`spikes/pane-identity-probe.ts`，原始回执在 `spikes/out/<探针>/linux/`。用法同前：`WINGLINE_SPIKE_WORKTREE="path:/Users/liuweiping/workspace/dev/wingline" pnpm tsx spikes/<探针>.ts`。

**A. 幂等重放是"先查账本"，与任务当前状态、调用方是否仍是协调者都无关（`replay-probe`）**

1. 同一个调用方自生成的 `--retry-request` + 完全相同的参数重放，`task-create`、`dispatch`、`gate-create`、`run-create`、`send --type worker_done`（`succeeded` 和 `failed` 两种）全部返回 `mutation.replayed:true`，**包括任务已经前进到 `dispatched`/`completed`/`failed` 之后**：对已 `dispatched` 的任务重放 `dispatch`、对已 `completed`/`failed` 的任务重放 `worker_done`，都没有报"only ready tasks can be dispatched"或"already settled"一类状态错误，而是原样回放。
2. **回放返回的是第一次调用当时的回执快照，不是当前状态**：任务已经 `dispatched` 之后重放 `task-create`，回执里的 `task.status` 仍是 `"ready"`。凡是要依据"当前状态"做决定的地方，不能信回放回执，必须另外 `task-list`。
3. **协调者换手之后**（`run-use` 把协调者从 T1 换成 T3）：用同一个 id、**原来的** `--from T1` 重放第一次在 T1 名下成功过的 `task-create` → `replayed:true`（账本检查在协调者校验之前）；同一个 id 换成 `--from T3` → `request_mismatch`；一个**新** id 配 `--from T1` → `consumer_fenced`（"This coordinator terminal is no longer bound to Run"）。推论：**只要本地同时持久化了 id 和完整参数，用原参数重放时得到 `consumer_fenced`，就证明原调用从未落地**（落地过的话会先命中账本回放），此时换一个新 id、用当前协调者 handle 重发是安全的。
4. 同一个 id、只改 `dispatch --to` → `request_mismatch`。即多个评审目标必须各用各的 id。
5. `run-use` 的直接回执是 `{ run: { id, objective, coordinator_handle, consumer_generation, … }, mutation }`，与 `run-create` 同形（此前只在 `run-show` 上看到过这个字段，现在直接确认）。
6. `check` 只认当前协调者：协调者换手后，`check --terminal <旧协调者>` 和 `check --terminal <worker>` 都报 `consumer_fenced`；`check --terminal <新协调者>` 正常。即任何人对同一个 Run 执行 `run-use`，正在跑的调度员的下一次 `check` 就会被 fence。
7. `run-use --id <不存在的 run>` → `code: run_not_found`（"was not found or is inspect-only"），可以和其他错误明确区分。
8. `worker_done` 的 `--from` 不是该 dispatch 的 assignee → `worker_identity_changed`（"… is not the exact process that owns Dispatch …"）。被拒的 `worker_done` 仍会作为一条 `type: worker_done` 的消息进协调者收件箱，`payload` 里带 `_orcaLifecycleRejection`。
9. `check` 回执的真实字段：顶层 `runId`、`deliveryId`、`messages[]`、`count`、`replayed`、`acknowledged`、`timedOut`、`cancelled`、`connectionLost`、`mutation`；每条消息 `id`、`type`、**`from_handle`**（不是 `from`）、`to_handle`、`subject`、`body`、`payload`（JSON **字符串**）、`priority`、`thread_id`、`created_at`、`delivered_at`。

**B. `gate-create` 会结束 dispatch，`gate-resolve` 会把任务放回 `ready`（`gate-block-probe`）**

1. **对 `dispatched` 的任务 `gate-create`：任务立即变成 `blocked`，`task-list` 里的 `assignee_handle`/`dispatch_id` 消失；之后再发 `worker_done`（哪怕带原来的 dispatch id）→ `inactive_dispatch`（"it or task … is already settled"）。** 即 gate 不是"挂在任务上的一个附加问题"，而是会把正在进行的 dispatch 结束掉。对 `ready` 的任务、对已 `failed` 的任务 `gate-create`，任务同样变成 `blocked`（`failed` 任务的 `completed_at` 保留）。
2. **`gate-resolve`（不论 `--resolution` 写什么）都把 `blocked` 的任务放回 `ready`**，三种来路（原本 `dispatched`、原本 `ready`、原本 `failed`）都一样；放回 `ready` 后可以正常再次 `dispatch`（新的 dispatch id；`completed_at` 仍是上一轮的旧值，不会被清空）。所以"`failed` 是终态"只在没有挂 gate 时成立：`worker_done(failed)` → `gate-create` → `gate-resolve` 是一条完整的"重开"路径，不需要 `worker-start --retry-of`。
3. 先 `worker_done(failed)` 再 `gate-create` 两步都成功（任务 `failed` → `blocked`）。**反过来先 `gate-create` 再 `worker_done(failed)`，第二步必然 `inactive_dispatch`。**
4. **已终态的任务在 `task-list` 里没有 `assignee_handle`/`dispatch_id`**（`completed` 的任务就没有这两个键），谁做完的只能从 `result` 字段（JSON **字符串**，含 `outcome`、`reportedBy`、`completedBy`、`completedAt`）里解析。
5. **`completed_at` 是 ISO 8601（带毫秒、`Z`），如 `"2026-10-14T02:57:02.357Z"`**，和 `created_at` 的 `"2026-10-14 02:57:02"` 不是同一种格式。此前计划里"`completed_at` 实测是 `YYYY-MM-DD HH:MM:SS`"的说法是错的。
6. 任务状态枚举里有 `blocked`，此前的 spec/plan 都只写了 `ready/dispatched/completed/failed`。

**C. 失败不留痕、协调者终端死了照样认、assignee 终端关闭任务自动回 `ready`（`orphan-probe`）**

1. `dispatch --inject` 被拒（`inject_rejected`，占位终端 `no recognized agent detected`）之后，任务仍是 `ready`、无 assignee——明确的 Orca 错误（`ok:false`，非 fence、非 mismatch）没有留下任何半成品状态。
2. **协调者终端已经关闭之后，用它的 handle 当 `--from` 调 `task-create` 仍然成功**：值匹配连终端是否存活都不看。即 `teams.coordinator_handle` 指向一个已关闭的终端，2A 的协调者专属调用照样可用；协调者身份不需要"跟着活着的终端走"才能工作。（Orca **整个重启**之后旧 handle 字符串是否仍被接受未验证——共用机器上不能重启 Orca。）
3. **把一个 `dispatched` 任务的 assignee 终端关掉，Orca 会自动把该任务放回 `ready`、清掉 assignee**（不需要 gate）。之后对它 `gate-create` → `blocked`，`gate-resolve` → `ready`，再 `dispatch` 给另一个终端也都成功。Orca 整个重启后在办任务是否同样自动回 `ready` 未验证（"待验证项" C 只看到 worker 变成 `abandoned`）。

**D. pane 身份（`pane-identity-probe`）**

1. **Orca 管理的 shell 终端里 `ORCA_TERMINAL_HANDLE` 确实存在，且等于该终端自己的 handle**（此前只是从一条报错提示里推断出来的）。
2. **从另一个 Orca 终端（有自己的 pane 身份）里代 assignee 发 `worker_done --from <assignee handle>` 被接受**，任务转 `completed`，`result.reportedBy` 记的是 assignee 的 handle。注意本例的 assignee 是占位进程；`send --help` 写的是"只能从被派发的 pane 完成；拿不到稳定 pane 身份时 sender handle 必须与 assignee 精确一致"，assignee 是真实 agent pane 时是否同样放行未验证。
3. **协调者不能发 `send --type escalation`**：`--to <普通终端 handle>` 和 `--to run:<id>` 都被拒，`code: sender_not_assignee`（"No active Dispatch belongs to this message sender"）。`escalation` 是 worker → 协调者方向的消息，2B 设计里"调度员用 `orchestration send --type escalation` 给牵头岗留痕"不成立。

**对设计的影响（2A/2B spec 与 plan 已按此修订，见各文档 2026-10-14 第三次修订说明）：** `wl task done` 的 `escalated` 分支必须先 `worker_done(failed)` 再 `gate-create`（第二次修订把顺序颠倒过来是错的，见 B3）；`wl task escalate` 会把在办任务从岗位手里收回（B1）；`wl task resolve` 实际效果是"任务回到 `ready`"（B2）；在办任务的孤儿问题在终端被关闭的场景下由 Orca 自己兜底（C3）；重跑安全可以用"持久化 id + 完整参数、fence 即未落地"这一条规则闭环（A1–A3）；`wl up` 不需要每次 `run-use` 才能让 2A 工作（C2）；2B 的岗位级"闸门连败"不能靠 `task-list` 的 assignee 统计（B4）；2B 第 2 级升级不能用 `send --type escalation`（D3）；`check` 消息字段按 A9 映射。

收尾：四个探针（含 `gate-block-probe --part2` 那一次）创建的 13 个占位/shell 终端全部 `terminal close`，`terminal list` 确认无 `spike` 残留；新建的 Run（`run_3d5ed139d275`、`run_f71a6e4eef35`、`run_9c7120774f16`、`run_1f026d2532be`、`run_fd1dea1933fc`）CLI 无法删除，残留待人工在 Orca 界面清理。

### 补充探针四：失败的调用进不进账本 / 已落地的调用在环境变化后重放（2026-10-14，Linux 本机真实 Orca 1.4.222，针对 Opus 第三次复审阶段 2 文档，下称 R4）

背景：第三次复审指出 2A spec 第 9.1 节 P1 "其他明确的 Orca 错误 → 删掉账本行" 的依据（"Orca 先查账本，所以明确报错就证明原调用没落地"）只对**在账本检查之后**才产生的错误成立；`runner.json` 把一切 `ok:false` 都变成 `kind:'orca'`，其中 `runtime_unavailable`（"其他命令返回 ok:false、code runtime_unavailable"，见上面实测发现 10）是 CLI 根本连不上运行时、请求从未到达账本时返回的。还有两个前提此前没测过：失败的调用会不会被记进账本（若会，保留账本行重放就会永远回放同一个失败）；已落地的调用在 `--to`/`--from` 指向的终端被关闭之后重放，是回放还是报终端类错误（若是后者，这类错误也不能当作"没落地"的证明）。脚本 `spikes/ledger-failure-probe.ts`，只用占位终端，原始回执在 `spikes/out/ledger-failure-probe/linux/`。用法同前。

1. **以 `ok:false` 结束的调用不进账本：之后同 id 同参数重放是重新执行，不是回放那次失败。** 证据两条：
   - 任务 A 已派给 w1 时，用新 id `X` 把 A 派给 w2 → `task_not_startable`；关掉 w1（A 自动回 `ready`）后用同一个 `X`、同样参数重放 → `ok:true`、`mutation.replayed:false`、A 真的派给了 w2（新的 dispatch id）。
   - 用非协调者 w2 的 `--from` 加 id `F` 调 `task-create` → `consumer_fenced`；`run-use` 把协调者换成 w2 后同一个 `F`、同样参数重放 → `ok:true`、`replayed:false`、建出任务；再重放一次才是 `replayed:true`。
   - 对照：`worker_done --from <非 assignee>` 带 id 被拒（`worker_identity_changed`），同 id 重放还是同样的错误（条件没变，重新执行又被拒一次）。
2. **"只有 `ready` 的任务能派发"的真实错误码是 `task_not_startable`**（`detail.status` 给出任务当时状态，`detail.nextSteps` 提示 `dispatch-show`）。此前 2A 计划的假 `OrcaClient` 用的 `invalid_state` 是编的。
3. **已落地的 `dispatch` 在目标终端被关闭（任务因此回 `ready`）之后重放 → `replayed:true`，回执是原来的 dispatch 快照，任务仍是 `ready`、无 assignee。** 即账本检查在 `--to` 的有效性检查之前；同时再次印证回放回执是旧快照（R3-A2），不能据此认为任务"此刻"已派发。
4. **已落地的 `worker_done` 在 assignee（`--from`）终端被关闭之后重放 → `replayed:true`。**
5. 附带观察：`task_not_startable`、`consumer_fenced` 的错误回执 `detail` 里带 `orchestrationRequestId`（即这次用的 `--retry-request`），`worker_identity_changed` 的回执没有 `detail`。不据此推断错误产生在哪一层，只如实记录。

**能确定"在账本检查之后才产生"的错误码（同一个 id 若曾落地，Orca 会先回放而不会返回这些错误）：** `consumer_fenced`（R3-A3）、`task_not_startable`（R3-A1：对已 `dispatched` 的任务重放落地过的 `dispatch` 是回放；本轮第 1 条）、`inactive_dispatch`（R3-A1：对已终态任务重放落地过的 `worker_done` 是回放，而新 id 在这种状态下得到的正是 `inactive_dispatch`，R3-B1）。**不能确定的：** `runtime_unavailable`（按定义产生在请求到达运行时之前，对"之前那次是否落地"不提供任何信息）、`inject_rejected`、`worker_identity_changed`，以及任何没在探针里出现过的错误码。

**对设计的影响（2A spec 第 2、9.1、9.3、10 节与 2A 计划 Task 3/4/8/10/11 已按此修订，见各文档 2026-10-14 第四次修订说明）：** 账本行一旦可能已经发出过（进入本次调用时它就在、且不是 `done`），只有上面三个"确定在账本之后"的错误码才允许据此删行或换 id；其余一律保留 id 与参数、报"结果不确定"（退出码 3）。这样做的代价只有"重跑时重复执行一次必然失败的调用"，不会产生重复对象——因为第 1 条：失败不进账本，保留的 id 重放时要么回放真正落地过的那次，要么重新执行。

收尾：本轮创建的 6 个占位终端全部 `terminal close`，`terminal list` 确认 0 个终端、无 `spike` 残留；新建的 Run `run_3d9c053676fa` CLI 无法删除，残留待人工在 Orca 界面清理。

### 补充探针五：账本按谁分区 / 传输层错误的含义 / 被拒的 `worker_done` 进不进账本（2026-10-14，Linux 本机真实 Orca 1.4.222，针对阶段 2 第四次复审，下称 R5）

背景：R4 的结论"以 `ok:false` 结束的调用不进账本"和"`runtime_unavailable` 产生在请求到达运行时之前"是 2A spec 第 9.1 节新行/旧行规则的前提。本轮做了两件事：读 Orca CLI 自带的 JS 源码（`resources/app.asar.unpacked/out/cli/`，只读）核对传输层错误码的产生位置；用 Orca 自带的只读命令 `orchestration request-show --request <id>`（"Ask whether one orchestration mutation request already took effect"，此前各轮都没用过）回查 R3/R4 留下的请求 id；另写 `spikes/caller-scope-probe.ts` 验证账本是否按调用方分区。复用 R4 的 Run `run_3d9c053676fa`（协调者 handle 已关闭，按事实 1 仍被接受），不新建 Run；原始回执在 `spikes/out/caller-scope-probe/linux/`。

1. **`runtime_unavailable` 不只产生在"连不上运行时"时，`runtime_timeout` 是 Orca CLI 自己的 `ok:false`。** `out/cli/runtime/transport.js`：连接失败 → `runtime_unavailable`；**请求已经写进 socket 之后**对端关闭连接 → `runtime_unavailable`（"closed the connection before responding"）；收到的响应来自另一个 runtime 实例 → `runtime_unavailable`（"runtime changed while the request was in flight"）；CLI 自己的 socket 超时（默认 60 000 ms，`runtime/client.js`，比雁阵的 120 000 ms 进程超时短）→ `runtime_timeout`；响应帧坏 → `invalid_runtime_response`。四者都以 `ok:false` 信封输出，`runner.json` 把它们变成 `kind:'orca'`。`out/cli/orchestration-mutation-recovery.js` 对 `runtime_unavailable`/`remote_runtime_unavailable`/`runtime_timeout`/`invalid_runtime_response` 一律标 `disposition: 'outcome_unknown'`，提示"The orchestration mutation may already have taken effect; do not assume it failed"。**即这四个码对任何一行（新行旧行都一样）都不是"没落地"的证据。** R4 与 2A spec 第 2 节事实 10 里"`runtime_unavailable` 产生在请求到达运行时之前"的说法不成立。
2. **被拒的 `worker_done` 会进账本。** `request-show` 回查 R3/R4 里只失败过的三个 `worker_done` id（`inactive_dispatch`、`worker_identity_changed`、`unknown_dispatch`）都是 `state: completed`，`receipt` 是一条 "Rejected worker_done: …" 消息（R3-A8 说的进了收件箱的那条），interpretation 为"already took effect … Replaying it returns the recorded outcome"。所以 R4-1 的对照项（`worker_identity_changed` 同 id 重放仍报同样错误）是**回放记下的拒绝**，不是"重新执行又被拒一次"。`dispatch` 的 `task_not_startable`、`task-create` 的 `consumer_fenced` 不进账本（R4-1 两条主证据成立：那两个 id 后来以新执行落地）；`dispatch --inject` 对已关闭终端的 `inject_rejected` 也不进账本（`request-show` 为 `absent`）。**修正：** "失败不进账本"只对 `dispatch`/`task-create` 这类在执行前被拒的调用成立；`send --type worker_done` 的生命周期拒绝会被记成一次已完成的请求，同 id 重放永远得到同一个拒绝。
3. **账本不按"从哪个终端调用"分区（至少对同一个 `--from`）。** 在 Orca 之外落地的 `task-create`，从一个 Orca shell 终端里（`ORCA_TERMINAL_HANDLE` 已设置）`request-show` 为 `completed`、原样重放为 `replayed:true`、任务数不变；反过来在 shell 终端里落地、从 Orca 之外重放同样是回放。`request-show --help` 里的 "under your caller identity" 至少不是终端身份。
4. **`dispatch` 不带 `--inject` 派给一个已关闭的终端 handle → `ok:true`**，任务变成 `dispatched` 给死终端（Orca 只在"关闭"那一刻把任务放回 `ready`，之后派给死 handle 不会自动回退）；带 `--inject` → `inject_rejected`（不进账本）。
5. **`request-show` 是现成的只读"落地了没有"查询**：`completed`（附原回执）/`pending`（原调用还在跑，或 Orca 在记下结果前重启了）/`absent`（"never arrived, failed before recording anything, or the receipt was pruned. Absent is not proof that nothing happened"）。注意它提到账本条目会被清理（pruned），保留多久未知。

**对设计的影响（待 2A spec/plan 修订）：** 第 9.1 节"新行 + 任意 `kind:'orca'` → 删行"对第 1 条的四个码不安全（首次 `run-create` 慢于 60 秒就会删行、重跑建出第二个删不掉的 Run），这四个码应与 `orca_timeout` 同样按"结果不确定"处理；事实 10 与 `FakeOrca`"失败一律不进账本"需按第 2 条区分方法；保留的 `dispatch` 行若存的 `--to` 已是死终端，重放会永远 `inject_rejected` 或派给死终端（第 4 条），而 `escalate`→`resolve` 不改变 `epoch`，脱不了身；`request-show` 可以替代"按错误码猜先后"。

收尾：本轮只开了 1 个 shell 终端，已 `terminal close`，`terminal list` 确认 0 个终端；在旧 Run `run_3d9c053676fa` 里多出 2 个占位任务（`scopeA` 已派给一个已关闭的 handle，`scopeB` 为 `ready`），没有新建 Run。

### 补充探针六：一个终端能挂几个派发 / check 的 ack 语义 / reply 的身份 / macOS 终端环境变量 / 真实 agent 上的 `--inject`（2026-10-15，macOS 真机 Orca 1.4.224，针对阶段 2 第四次复审，下称 R6）

背景：第四次复审（`docs/superpowers/reviews/2026-10-15-phase-2-review.md`）留下几项只能实测的问题。探针脚本 `spikes/r6-probe.ts`，在 macOS 真机（有界面，Orca 1.4.224）上分三次跑完，由 Claude 经桌面连接代为执行；测试仓库是 `path:~/workspace/dev/wingline`。脱敏后的关键回执存在 `test/fixtures/receipts/orchestration-r6.json`。

1. **一个终端同一时刻只能有一个进行中的派发（S1）。** 任务 A 已派给 w1，再把 B 派给 w1 → `ok:false`，错误码是泛化的 `runtime_error`，信息为 "Terminal … already has an active dispatch (ctx_… for task …)"；B 仍是 `ready`。A 上报 `worker_done` 后再派 B 给 w1 → 成功。**2A 的 `budgets.team.max_in_progress_per_post`（默认 3）没有意义：每个岗位终端同时最多一个 `dispatched` 任务，由 Orca 强制。** 错误码是 `runtime_error` 而不是专门的码，雁阵不能靠错误码识别这种情况，只能在派发前自己查（`task-list` 里该终端有没有 `dispatched` 任务）。
2. **check 的 ack 语义（S2）。**
   - 不 ack 再 check：同一批原样重放，`deliveryId` 不变，回执带 `replayed: true`。
   - 同一个 `deliveryId` ack 两次：两次都 `ok:true`，`acknowledged` 都是它，没有副作用。
   - **协调者换手后（`run-use`），旧协调者 ack → `consumer_fenced`；新协调者 ack 上一代的 `deliveryId` 也是 `consumer_fenced`（"This mailbox Delivery belongs to a fenced consumer generation"）；新协调者不带 ack 再 check，同一条消息以新的 `deliveryId` 重新投递。** 即：被 fence 后手里的 `pendingAck` 必须丢弃，否则之后每次带它的 check 都失败。转述去重不能靠 `deliveryId`（换手后会变），要靠消息 id。
3. **超过 60 s 的 `check --wait`（S3）。** `--timeout-ms 75000` 空等，75.1 s 后 `ok:true`、`timedOut: true`。与 Orca CLI 源码 `src/cli/runtime/client.ts` 的 `resolveMethodTimeoutMs` 一致：`orchestration.check --wait` 与 `terminal.wait` 的 socket 超时按"等待时长 + 余量"放宽，不受 60 s 默认值限制。
4. **ask / reply 的身份（S4）。** 岗位 `ask --timeout-ms 3000` 超时后问题保持待答（回执 `timedOut: true`、带 `messageId`）。协调者 check 拿到的 `question` 消息，**`from_handle` 是 `dispatch:<dispatch_id>` 而不是终端 handle**，`payload` 里有 `taskId`/`dispatchId`/`question`/`options`。`reply` 只认当前协调者：从提问者以外的岗位终端、从旧协调者 `--from` → 都是 `consumer_fenced`；不带 `--from` 且不在 Orca 终端里 → `no_active_sender_terminal`；`--from <当前协调者>` → 成功，问题变 `answered`。**`reply` 和 `task-create` 一样只做值匹配，所以牵头岗在自己终端里用 `--from <coordinator_handle>` 回复是可行的。**
5. **macOS 上的 `ORCA_TERMINAL_HANDLE`（S5）。** Orca 终端里该变量存在且等于该终端自己的 handle（与 R3-D1 的 Linux 结论一致）；同时还有 `ORCA_PANE_KEY`、`ORCA_WORKTREE_ID`、`ORCA_TAB_ID` 等。Windows 仍未验证。
6. **真实 agent 上的 `dispatch --inject`（S6）。** 对空闲的 Claude Code（`terminal wait --for tui-idle` 满足）`dispatch --inject` 成功，回执 `injected: true`。**注入的不只是任务文本，而是 Orca 的完整 worker 前言：要求 agent 完成后自己执行 `orca orchestration send --from <它的 handle> --type worker_done … --outcome succeeded`，每 5 分钟发 heartbeat，有问题用 `orca orchestration ask`，并在完成前 `check` 跟进消息；最后才是 `=== TASK ===` 加任务 spec。** 这意味着被 `--inject` 派发的岗位很可能绕过 `wl task done` 直接上报——gate 不跑、`reviewed_by`/`hands_to` 不触发；它的 `ask` 也只有协调者（调度员）能看到。
   - 同一终端再派第二个任务不可能（第 1 条），所以"往正忙的 agent 第二次 `--inject`"这个复审问题不存在。
   - `worker-list` 对每个 dispatch 给出 `projection`：`stage.activity`（实测 `done`/`unknown`）、`liveness.verdict`（真实 agent 为 `live`，来源 `agent_status`；占位进程为 `unverifiable`/`missing_status`）、`attention.categories`（实测出现过 `input`——有待答问题时、`unverifiable`、`root_completion`）与 `requiresAction`。`terminal show` 的 `preview` 是屏幕最后几行原文。`terminal send` 的回执里有 `baselinePermissionSequence`，说明 Orca 对 Claude 跟踪权限确认的次数。
   - **没能复现"停在权限确认上"的画面：** 这台机器上的 Claude Code 以 auto 模式运行（不弹权限确认），且经一个模型代理转发，探针期间两次请求都返回 `API Error: 400`。这一项留待以后在默认权限模式下复测。
   - **意外复现了复审汇总 B-C2 描述的风险：** 第二次运行时启动命令写的是 `claude`，被用户 shell 的别名展开成一个包装脚本，停在 `? Do you want to start the instance now? (Y/n)`；探针随后按设计用 `terminal send … --enter` 打进一行文字。这次因为文字不是合法回答而被拒绝（"is not a valid answer"），没有产生任何副作用；但如果打进去的是空行或以 `y` 开头的文字，就会替用户回答这个问题。这正是"往岗位终端打字之前必须先看它停在什么画面上"的实例。

**对设计的影响（2A spec 第五次修订、2B spec 第四次修订）：** 2A 改为派发一律不带 `--inject`，改由雁阵自己发一行通知（含"完成后运行 `wl task done <id>`"），并在派发前本地检查"该岗位终端是否已有 `dispatched` 任务"；删去 `max_in_progress_per_post`。2B 被 fence 后丢弃 `pendingAck`、按消息 id 去重转述、`question` 的发送方从 `payload.taskId` 反查岗位、转述给出带 `--from <coordinator_handle>` 的 `reply` 命令；所有往终端打字的动作先经"画面检查"；调度员遇到"没有 `task_done` 记录的 `worker_done`"按"绕过闸门的上报"处理。

收尾：三次运行共创建 Run `run_bb8fef4b8e07`、`run_d8d13fffb1b1`、`run_599a6de01532`（CLI 无法删除，残留待人工在 Orca 界面清理）；所有 `spike-r6-*` 终端均已关闭，`terminal list` 确认无残留；用户的 lima 实例状态未变。

## 2A 契约抓取（Task 15，2026-10-15）

`spikes/contract-capture.ts` 在真实 Orca 1.4.226（Linux）上跑了两次，产出 `test/fixtures/receipts/orchestration-2a.json`。每次会留下一个 Run（CLI 无法删除）：`run_74ee7e4f4a41`、`run_caa90732d2c1`（objective `wingline:contract-capture`）。终端在脚本结束时已关闭。

实测结论：`task-list` 带 `parent_id`；终态/blocked 任务没有 `assignee_handle`/`dispatch_id`；`request-show` 的 `completed`/`absent` 如预期；对已完成派发重发 `worker_done` 会被**接受**；`worker_done` 引用不存在的派发时 Orca 报 `unknown_dispatch`，同一请求的 `request-show` 返回 `completed`，回执是主题为 "Rejected worker_done: …" 的消息。

## 3A 探针：orca search 召回语义与 Codex 会话恢复（2026-10-17，macOS Orca 1.4.227）

探针 `spikes/codex-resume.ts` 带 `WINGLINE_SPIKE_SKIP_SEND=1` 跑了 codex 与 claude 两次，随后做了两次对照搜索。回执原件在 `spikes/out/codex-resume/darwin/`（`search.json`、`search-claude.json`），脱敏件入 `test/fixtures/receipts/`。

**实测结论：**

1. **引号不保证整串精确匹配。** 查询 `"WLS-f4ce035e"`（SKIP_SEND 之下该标记从未写进任何会话）命中了 1 条会话，证据 snippet 只高亮了 `[[wls]]`：Orca 把 `WLS-xxxx` 拆成 token，整串不在索引里时按部分 token 召回任何含 `wls` 的会话。由于雁阵每个岗位会话的启动包都含 `会话标记：WLS-…`，`wls` token 无处不在，**只靠引号 + cwd 过滤不足以判定"这条会话包含本岗位标记"**。规避同一 worktree 旧一代会话被误接回（cwd 相同、未被占用、唯一命中 → 直接 `found`）的场景，`findSession` 增加第三道闸：命中必须 `evidence.snippet` 的高亮区间（`[[…]]`）覆盖标记整串（`markerHighlighted`，小写化去非字母数字后比较，相邻区间可拼接；evidence 被扣留的 `--environment` 命中一律不认）。`SearchHit` 相应增加 `snippet` 字段。
2. **对照实验自我污染（方法论错误，已记录）。** 对照组用的 `QZX-9f31aa` / `WLS-7c0ffee1` 两条查询整串高亮命中了助手自己的消息——因为告诉用户对照标记的那条回复本身已进入本会话 transcript，而 Orca 对 transcript 是增量索引的（命中证据的时间戳即助手消息发出的时刻）。所以"整串在索引里 → 整串高亮命中"这半边只是佐证，未得到干净对照；干净对照需由 shell 现场随机生成标记（`m="WLS-$(openssl rand -hex 4)"`）再查，标记不落 transcript。
3. **Codex 会话恢复未成立，也无反证。** codex 侧 `orca search` 回执为空 `hits: []`——但探针以 `agent_prompt_blocked` 拦下了 prompt，标记从未进入 codex 会话，空结果是**构造出来的**，不构成"Orca 不索引 codex 会话"的证据。`search-codex.json` 保留该真实回执仅作空命中形态样本；`codex resume` 的恢复命令形式仍未验证，3A 的 codex 岗位接回走 `fresh` 路径或 `--session` 手工指定。

**3A 探针收尾（2026-10-17 下午手工再跑）**：去掉 `WINGLINE_SPIKE_SKIP_SEND=1` 后从 Claude Code 沙箱外再跑 codex 探针，**两次都撞 `agent_prompt_blocked`**——第一次 `orchestrationRequestId=53fb42ad-...` 拦下首次 `terminalSend`；原样带 ID 重试，**同一 ID 又被拦**（Orca 1.4.227 在 codex 这一侧"被叫醒但还没到能接 prompt"是稳定状态，不是偶发）。`spikes/out/codex-resume/darwin/search.json` 是该次 `search` 的真回执（`hits: []`，`durationMs=132`），`after-1---resume.json` 是更早一轮遗留（`agentIdentity: "claude"`，与本次 codex 路径不符，已交用户手工清出）。

**最终判读**：codex 接回在本任务范围不可验证——不是 3A 该解决的问题。3A 的接回逻辑只对 claude 验证通过；codex 侧要么走 `fresh`（上下文丢失，3B 接管）要么走 `--session` 手工指定（保留 3A spec §5.3 的逃生口），Phase 3A 不依赖 codex 路径成立。`codex resume` 形式与 `Orca 是否索引 codex 会话` 留作 3D 阶段用 e2e 实测或在 sandbox 外直跑 codex CLI 验证。

判据的代价：Orca 每条命中只给一条最佳证据 snippet。若某会话确实包含标记整串，但最佳证据落在别处的部分匹配上，该命中会被误丢 → 结果 `fresh`（上下文丢失，但绝不会接错会话；可用 `--session` 手工接回）。方向上宁可少接、不可错接。

## 3A 真机验证：`wl restore` 接回 claude 会话（2026-10-18，Linux VM，Orca 1.4.226）

- **重启 `orca-serve` 杀不掉岗位终端**：pty 由独立的 `orca-daemon-*.scope` 持有，重启后 `restore` 两个岗位都判 `kept`，没有走到 search/resume。`test/live/duo.live.test.ts` 的 `WL_LIVE_RESTART` 用例因此无效（且 `terminal show` 的 preview 只是屏幕末几行，不能拿来断言标记）。
- **改为关闭 builder 终端模拟终端丢失**：`wl up` → 给 builder 发 `只回复收到。WLS-LIVE-<随机>` → `orca terminal close` → `wl restore duo`。dry-run 与真跑都给出 builder `resumed`（`sessionId` 与 `orca search` 命中的会话一致）、checker `kept`、Run `reclaimed`。
- 新终端执行 `claude --model opus --resume <sessionId>`，`terminal read` 显示原对话（包括标记那一轮）仍在，并收到 `[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo`，agent 回答“上下文都还在”。
- `orca search` 在 Linux 上对 claude 会话可用，整串标记被 `[[…]]` 高亮，`findSession` 的整串判据成立。
- **未覆盖**：macOS 的 `/private` cwd 前缀（Linux 触发不了）；codex 接回（本机无 codex，仍留 3D）；真正整机/Orca 桌面端重启。
- **live 用例已改**：`WL_LIVE_RESTART=1` 先关掉 builder 终端，再断言 `restore` 里 builder 为 `resumed` 且 `sessionId` 为 UUID、终端 handle 已更换；真机运行通过。
