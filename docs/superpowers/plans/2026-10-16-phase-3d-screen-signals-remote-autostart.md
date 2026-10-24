# 阶段 3D 实现计划（索引）

> 2026-10-23 起，原单份 plan 按 spec 第 0 节拆成两份。原稿写于 3A/3B 落地之前，与 spec 第二、三轮复审的结论多处冲突（读画面方式、`PatrolSignal` 类型、未读标记 API、`restoreAll` 错误模型、`selfCommand` 签名等），已作废，不再沿用；旧内容在 git 历史里。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md`

| 份 | 内容 | 前置 | 状态 |
| --- | --- | --- | --- |
| **3D-1** | 块 (a) `wl restore --all` + `wl autostart`（macOS / Linux）；块 (b) 未读标记 | 探针 3、6（Task 1，真机） | **已实现**（2026-10-24，分支 `phase-3d1-restore-all-autostart-unread`）：`docs/superpowers/plans/2026-10-23-phase-3d1-restore-all-autostart-unread.md`；真机已验证 launchd 最小环境、`restore --all --actor autostart`、未读红点；重新登录触发与 Linux 真机待验证 |
| **3D-2 (d)** | 块 (d) 远端环境恢复 | 探针 4 已完成 | **已实现**（2026-10-24，分支 `phase-3d2d-remote-environment`）：`docs/superpowers/plans/2026-10-24-phase-3d2d-remote-environment.md`；真机已验证 Lima 同路径挂载下的找回与接回 |
| **3D-2 (c)** | 块 (c) 画面信号 `context_low` / `usage_limit` | 探针 1 已完成，探针 2 缺“上下文快满 / 用量上限”的真实画面 | **可以开始写 plan，模式表标 provisional**：2026-10-24 已从 claude 2.1.310 程序本体取出提示原文（`Context low (N% remaining)`、`You've hit your …`、自动继续的提示，见 `spikes/REPORT.md`），这改变了第 4.3 节“到点发继续”的前提；真实画面样本（探针 2）仍缺，下面是任务骨架 |

Windows 自启动单列，等探针 5。

## 3D-2 (c) 任务骨架（探针 2 之后再写成可执行步骤；块 (d) 见上表中的独立 plan）

写 3D-2 时必须遵守 spec 的这些结论，不得回到原稿：

- 读画面用 `orca terminal read --terminal <h> --screen --limit N`（探针 1），`terminal show` 只有约 300 字符；`ScanSnapshot.previews` 为可选字段；FakeOrca 的 `terminalShow` 把 `preview` 截成末尾 300 字符。
- 画面信号用独立类型 `ScreenSignalKind`，**不并入 `PatrolSignal`**；`advancePatrol` 的清除循环（`advance.ts:194-196`）与 `resetPatrolForPost`（`registry.ts:691`）都要跳过它；新列 `patrol_state.detail`。
- `context_low` 键用会话标记的哈希；清除后再次出现复用同一行，1 小时内不重复通知（spec 第 4.4 节）。
- `usage_limit` 到点即发“继续”，不等提示消失；画面不是 `clear`（含限额菜单）时不打字，3 轮后 `resume_skipped` 并通知人一次；`noProgress` 基线取 `max(原起点, resumedAt)`。
- 模式锚定状态行格式，同一 `kind` 多处命中取最底部一处，必须有“正文引用不触发”的负例；样本放 `test/fixtures/screens/`，并加 `.gitattributes`（`eol=lf`）。
- 远端环境（块 d）已拆成独立 plan，不再在本骨架里。
- 不要把画面信号行算进未读键（spec 第 6 节）。

| 任务 | 内容 | 探针 |
| --- | --- | --- |
| A | 探针 1、2、4：`terminal read` 窗口、真实限额 / 上下文措辞与是否阻塞菜单、`--environment` 命中的 `snippet` / `cwd`；样本与回执入库。脚本 `spikes/phase-3d2.ts`（`read` / `sample` / `remote`）已写好；**探针 1 已跑完（成立，含真实 Claude Code 画面）、探针 4 已跑完（成立：远端命中带 snippet）**，探针 2 仍缺“上下文快满 / 用量上限”真实画面 | 真机 |
| B | `screen/patterns.ts`（迁入 2A 的 `at_prompt` / `shell` 判定）与 `screen/reset-time.ts`；`detectScreen(agent, text, now)` | A 之后 |
| C | `OrcaClient.terminalRead`、`READ_ONLY_CALLS`、FakeOrca；`scan()` 每轮读存活岗位画面进 `previews`，`quietScreens` 优先取它 | 探针 1 |
| D | 迁移 `patrol_state.detail`；`ScreenSignalKind`；`screen-signals.ts`（`advanceScreenSignals`、`isUsagePaused`）；`advance.ts` 暂停判定；`registry` 跳过画面信号；`signals.ts` 的 `noProgress` 基线；修 `server/api-read.ts:138`（岗位详情的信号恒为空） | B、C |
| E | 展示：`AttentionReport.signals` 带 `summary` / `detail`；3C 注释标记与同级取舍；控制台收件箱、岗位详情、TUI 收件箱 | D |
