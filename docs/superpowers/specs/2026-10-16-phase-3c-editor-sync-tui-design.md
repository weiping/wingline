# 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计

- 日期：2026-10-16
- 状态：设计中（未实现）
- 范围：阶段 3（控制台与恢复）子项目 C：控制台的团队编辑器（保存 + 预演）与“关于与诊断”页、`wl up --draft`、由调度员把状态同步到 Orca 原生界面（工作区状态、卡片注释）、`wl tui`（总览 / 收件箱 / 时间线，可处理待办）。
- 依赖：阶段 3B（`docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`，下称 3B：服务、登录与安全、写接口约定、按团队的只读快照）、阶段 3A（`auditedCommands`、`TimelineEvent`、`wl log` 的游标）、阶段 2B（巡查循环与 `PATROL_INTERVAL_MS`、重启后首轮只观察、`patrol:` 字段与 `patrolDelta` 规格哈希规则、`worktree_comment`）、阶段 1（`loadTeamSpec` 的校验、`wl up`）。
- 不含：页面上的 `up`/`down`/应用草稿、全局配置文件、修改终端标题、未读红点、TUI 中的任务看板与任务详情、编辑 NORMS / brief 文件内容。
- 承接：总纲第 4 节阶段 3、第 5.4 节控制台（团队编辑器、设置、状态同步到 Orca 原生界面）与 `wl tui`。

## 1. 目标与成功标准

- 在控制台里改团队编排时，能边改边看到校验结果与“改完会发生什么”，保存不会打断正在运行的团队。
- 不打开控制台，只看 Orca 自己的界面，就能知道每个 worktree 上的岗位在做什么。
- 在终端里（比如牵头岗旁边）有一个实时的团队视图，并能就地处理待办。

成功标准：

- 运行中的 `duo` 团队，在编辑器里给 builder 加一个 gate 并保存：团队不受影响（`wl task` 命令照常工作），同目录出现 `team.draft.yaml`；预演页给出差异与命令 `wl down duo` → `wl up teams/duo/team.yaml --draft`；执行后新规格生效，旧规格备份为 `team.yaml.bak`。
- 调度员在跑时，builder 开始一个任务后，Orca 界面上该 worktree 的工作区状态在一个巡查周期内变为 in-progress；开启 `worktree_comment` 时卡片注释显示 builder 的当前任务。
- `wl tui duo` 实时显示岗位与待办，在收件箱里选中一个提问、按 `Enter` 回答后，时间线出现对应事件；退出后终端恢复原状。

## 2. 全局约束补充

1. 不新增运行时依赖：编辑器的 YAML 读写用 core 已有的 `yaml` 库；TUI 自写 ANSI 渲染，只用 `node:readline`、`node:tty`。
2. 写操作一律经 3A 的 `auditedCommands`，执行者为 `human`；审计命令名前缀：控制台 `console:`（3B）、TUI `tui:`。
3. 终端标题是岗位身份（按标题查找岗位），任何功能都不得修改它。
4. 同步到 Orca 只是展示：它的失败不影响任务、巡查与任何命令的结果。
5. 函数 ≤ 50 行。

## 3. 先补探针（plan 的 Task 0）

新增 `spikes/worktree-status.ts`，在 macOS 或 Linux 真机上跑，结论写回 `spikes/REPORT.md`：

1. `orca worktree set --help` 列出的工作区状态参数（总纲写作 `--workspace-status`），可取值是否为 `todo`/`in-progress`/`in-review`/`completed`，设置后 `orca worktree show --json` 能否读回、Orca 界面上是否可见。
2. `--comment` 参数的实际形态（2B 时标为未验证）：能否写入多行、长度上限、能否清空。

判读：每一项单独决定——成立则按实测形态实现；不成立则该项不同步，对应开关保留但不起作用，调度员在 `wl attention` 的告警里提示一次“Orca 不支持 <项>”。

## 4. 团队编辑器（控制台）

### 4.1 页面 `/t/:team/edit`

- **两个视图**：表单与 YAML，切换时双向同步，YAML 是唯一的真实来源。
  - 表单的修改通过 `yaml` 库的 Document API 写回 YAML 文档，保留原有注释与字段顺序；YAML 视图的修改重新解析后刷新表单（解析失败时表单只读，并提示 YAML 有语法错误）。
  - 表单覆盖：岗位（`id`、`agent`、`model`、`launch`、`worktree`、`brief`、`self_claim`、`tags`、`plan_first`）、`lead`、`links`、`gates`、`budgets.task`、`patrol`（含第 6 节新增的 `workspace_status`）。`norms` 与 `brief` 只编辑路径，不编辑文件内容。
- **实时校验**：修改停顿 400 毫秒后调用校验接口；错误标在字段旁或 YAML 对应行上，错误码与提示与 `wl up` 的校验相同。
- **预演**：显示 `planSpecChange` 的结果（第 4.2 节），以及要执行的命令（团队运行中：`wl down <team>` → `wl up <spec> --draft`；团队已停止：`wl up <spec>`）。
- **保存**：团队运行中写草稿，已停止写正式规格（第 4.3 节）。已有草稿时编辑器默认打开草稿，显示“丢弃草稿”按钮。
- 页面底部注明：`team.yaml` 视为可信配置，`launch`、`gates`、`notify.command` 会在本机执行。

### 4.2 预演：`planSpecChange(current, next, posts)`

纯函数，输入为现行规格、新规格与注册表中的岗位记录，输出：

- **岗位去向**：
  - `added`：新增岗位，`wl up` 会新开终端并发送启动包。
  - `kept`：配置没变。
  - `launch_changed`：`agent`/`model`/`launch`/`worktree` 有变化。说明：岗位终端还在时 `wl up` 会保持原终端，新的启动参数要等终端重建后才生效；需要立即生效请用 `wl down <team> --close`。
  - `removed`：岗位被删除。说明：`wl up` 不会关闭它的终端，该终端将不再归雁阵管理，请先关闭或 `wl down <team> --close`。
  - `brief_changed`：简报路径变化，只影响之后新开的会话。
- **字段差异**：`lead`、`links`、`gates`、`budgets`、`patrol` 等按字段列出旧值与新值。
- **命令**：见第 4.1 节；`--close` 只在有 `launch_changed`/`removed` 时作为可选项列出。
- **校验结果**：新规格未通过校验时只返回错误，不给命令。

### 4.3 保存与草稿

- 草稿文件：正式规格同目录、同名加 `.draft`（`team.yaml` → `team.draft.yaml`）。
- 团队运行中（`teams.status = up`）→ 写草稿；已停止或未登记 → 写正式规格。
- 写入前再次校验（未通过 → `spec_invalid`，返回逐项错误，不写文件）；写入采用“先写临时文件再改名”，避免半截文件。
- 保存请求带加载时的文件内容哈希 `baseHash`；目标文件当前哈希与之不符 → 409 `spec_conflict`，页面提示重新加载。
- 丢弃草稿：删除草稿文件；草稿不存在 → 成功（无操作）。
- 提醒：存在草稿时，`wl attention` 的告警一节与控制台总览页显示一条“有未应用的规格草稿：<路径>”，附命令 `wl down <team>` → `wl up <spec> --draft`。

### 4.4 接口（3B 的约定与安全校验，写接口进审计）

| 方法与路径 | 内容 |
| --- | --- |
| `GET /api/teams/:team/spec` | `{ specPath, yaml, hash, draft: { yaml, hash } \| null, running }` |
| `POST /api/teams/:team/spec/validate` `{ yaml }` | `{ errors: Array<{ path, code, message }>, preview }`，不写文件 |
| `POST /api/teams/:team/spec` `{ yaml, baseHash }` | 保存，返回 `{ wrote: 'draft' \| 'spec', path, hash }` |
| `POST /api/teams/:team/spec/discard-draft` `{}` | 丢弃草稿 |

`yaml` 字段上限 64 KB（3B 的请求体上限）。审计摘要只记 `wrote`、`path` 与哈希，不记 YAML 内容。

### 4.5 `wl up <spec> --draft`

1. 找同目录的草稿；不存在 → `draft_not_found`（退出码 1）。
2. 团队仍在运行且草稿与现行规格哈希不同 → `team_spec_changed`（沿用现有错误，提示先 `wl down <team>`），不改动任何文件。
3. 按 `loadTeamSpec` 校验草稿；失败 → 与 `wl up` 相同的校验错误，不改动任何文件。
4. 把正式规格复制为 `team.yaml.bak`（已存在则覆盖），再把草稿改名为正式规格；改名失败 → 删除刚写的备份，报错退出。
5. 照常执行 `wl up <spec>`。

## 5. 关于与诊断（控制台 `/settings`，只读）

`GET /api/about` 返回以下各项，每项附来源（`env`、`default`、`registry`、`file`）：

- 雁阵版本；Orca 可执行文件路径（及按哪条规则解析到的：`WINGLINE_ORCA`、`ORCA_CLI_COMMAND` 或平台默认）、Orca 版本、是否在已验证的版本范围内。
- 数据目录（`WINGLINE_HOME` 或默认）、注册表的迁移版本、`logs/` 占用空间。
- 每个团队：规格文件路径、状态、是否有草稿、调度员状态。
- 控制台服务：pid、端口、启动时间。

不引入新的配置文件，页面不提供任何写操作。

## 6. 同步到 Orca 原生界面（调度员）

### 6.1 开关

在 `team.yaml` 的 `patrol:` 下：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `workspace_status`（新增） | `true` | 同步岗位所在 worktree 的工作区状态 |
| `worktree_comment`（2B 已有） | `false` | 为 `true` 时同步卡片注释：从 2B 的“只写通知”改为写岗位当前状态，通知并入其中（第 6.3 节） |

两个字段取默认值时不进规格哈希（2B 的 `patrolDelta` 规则），已有团队升级后哈希不变。

### 6.2 岗位状态

纯函数 `postWorkspaceStatus(post, tasks, local)`，输入为本轮巡查已经取得的 `task-list`、`task_ext`、`task_done`，不额外调用 Orca：

| 岗位当前情况 | 状态 |
| --- | --- |
| 有派给它、仍处于 `dispatched` 的任务 | `in-progress` |
| 它的 `kind = work` 任务已经 `sent_for_review`，且对应的评审子任务尚未 `completed` | `in-review` |
| 只有排队任务（`ready` 且 `claimed_by` 是它） | `todo` |
| 手上没有未结束的任务 | `completed` |

按表格从上到下取第一个满足的。

### 6.3 worktree 汇总

- 一个 worktree 上有多个岗位（按注册表 `posts.worktree` 的绝对路径归组）时，状态取优先级最高的：`in-review` > `in-progress` > `todo` > `completed`。
- 注释：每个岗位一行，形如 `builder：实现登录（进行中，第 2 轮）`；该岗位有未清除的巡查信号时在行尾加 `⚠ <信号中文名>`；被冻结时加 `❄ 已冻结`。整段最长 500 字符（或探针测得的上限，取小者），超出截断并以 `…` 结尾。
- `worktree` 不是绝对路径（无法归组）的岗位跳过同步。

### 6.4 写入

- 调度员每次巡查扫描（2B 的 `PATROL_INTERVAL_MS`）末尾计算一次，与注册表 `orca_sync` 表中该 worktree 上次写入的值比较，不同才调用 Orca（`orca worktree set …`，参数形态按第 3 节探针）。
- 成功 → 更新 `orca_sync`（`status`、`comment`、`written_at`，`fail_count = 0`）。
- 失败 → `fail_count + 1`，记一条 `patrol_events`（`action = orca_sync`，`outcome = failed`），下一轮重试；连续 3 次失败后该 worktree 停止尝试，`wl attention` 的告警里提示一次，调度员重启后重新尝试。
- 重启后第一轮只观察（2B）同样适用：首轮只计算不写入。
- 调度员不在运行时不同步；README 写明“Orca 界面上的状态需要调度员在运行”。
- 2B 的 `worktree_comment` 原先在通知时写注释的路径改为调用本节的同一写入函数，不再单独写。

## 7. `wl tui`

### 7.1 命令与视图

```
wl tui [team]
```

- 省略团队名：只登记了一个团队时直接进入，否则先显示团队列表供选择；没有任何团队 → `team_unknown`。
- 标准输入或输出不是 TTY → `tui_not_tty`（退出码 1）。
- 三个视图：
  1. **总览**：调度员状态行；岗位表（地址、agent、状态、当前任务、冻结 / 静音 / 巡查信号标记）；底部最近 8 条时间线。
  2. **收件箱**：`wl attention` 的分节，每条一行。
  3. **时间线**：`TimelineEvent` 列表，新的在下，实时追加，可按来源过滤。

### 7.2 按键

| 按键 | 作用 |
| --- | --- |
| `1` `2` `3` / `Tab` | 切换视图 |
| `↑` `↓` / `j` `k` | 选中行 |
| `Enter` | 打开选中项的操作菜单 |
| `/` | 时间线视图里按来源 / 岗位 / 任务过滤 |
| `r` | 立即刷新 |
| `R` | 结果不确定时按原样重试上一次写操作 |
| `?` | 帮助 |
| `q` / `Ctrl-C` | 退出 |

### 7.3 操作

- 收件箱：提问 → 回答；gate → resolve / 改派；派发失主 → recover；冻结 → 解冻；巡查信号 → 静音 / 发消息。
- 总览选中岗位：发消息、冻结 / 解冻、静音 / 取消静音。
- 没有写接口的条目显示对应的 `wl` 命令。
- 需要输入的内容在底部单行输入框填写（可打印字符、退格、左右移动、`Enter` 提交、`Esc` 取消），提交前再确认一次（`y` 确认，其他键取消）。
- 写操作经 `auditedCommands` 执行（前缀 `tui:`），结果显示在底部状态行；不确定时显示 CLI 的提示，`R` 以同一参数、同一 `retryRequest` 重试。

### 7.4 数据

- 在进程内直接调用 core，不依赖控制台服务。
- 与 3B 共用按团队缓存 5 秒的 Orca 只读快照模块（`packages/core/src/view/snapshot.ts`，见第 9 节）。
- 时间线按 3A `wl log --follow` 的游标每 2 秒读一次；岗位与待办每 5 秒刷新；写操作完成后立即刷新并作废快照。

### 7.5 渲染

- 进入时切换到备用屏幕缓冲区、隐藏光标、开启 raw 模式；只在内容变化时按行差分重绘。
- 终端尺寸变化（`stdout` 的 `resize` 事件）时重新布局并整屏重绘。
- 按显示宽度截断与对齐：自写 `cellWidth`（东亚宽字符与常见 emoji 计 2 列、组合字符计 0 列、控制字符剥除），单独测试。
- 退出时恢复终端（退出备用屏幕、显示光标、关闭 raw 模式）：在 `finally`、`process.on('exit')` 与 SIGINT/SIGTERM/SIGHUP 处理中都执行一次（幂等）；未捕获的异常先恢复终端再打印错误。
- Windows：要求支持 VT 序列的终端（Windows Terminal、新版控制台）；无法启用时 → `tui_unsupported_terminal`（退出码 1）。
- 提问正文、消息等外部文本在显示前剥除控制字符与 ANSI 序列。

## 8. 注册表迁移

追加一个迁移版本：

```sql
CREATE TABLE orca_sync (
  worktree TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  status TEXT,
  comment TEXT,
  written_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
```

带一个从 3A/3B 数据库升级的测试；规格哈希不变。

## 9. 代码结构

```text
packages/core/src/view/snapshot.ts     # 按团队 5 秒缓存的 Orca 只读快照（3B 与 TUI 共用）
packages/core/src/spec/plan-change.ts  # planSpecChange
packages/core/src/spec/draft.ts        # 草稿路径、保存（临时文件 + 改名）、baseHash、--draft 的替换流程
packages/core/src/commands/dispatcher/orca-sync.ts  # postWorkspaceStatus、worktree 汇总、注释拼接、写入
packages/core/src/commands/about.ts    # 关于与诊断
packages/core/src/server/routes.ts     # 增加 spec 与 about 接口
packages/web/src/pages/Edit.tsx、Settings.tsx
packages/cli/src/tui/                  # screen.ts（备用屏幕、差分、恢复）、width.ts（cellWidth）、keys.ts、views/*.ts、app.ts
```

3B 的 spec 已把快照模块定在 `core/src/view/`（而不是 `server/`），以便 TUI 复用。

## 10. 错误处理

| 错误码 | 类别 | 退出码 / 状态码 | 场景 |
| --- | --- | --- | --- |
| `draft_not_found` | input | 退出码 1 | `wl up --draft` 找不到草稿 |
| `spec_conflict` | input | 409 | 保存时文件在这期间被改过 |
| `spec_invalid` | input | 400 | 保存的 YAML 未通过校验（返回逐项错误，不写文件） |
| `tui_not_tty` | input | 退出码 1 | `wl tui` 不在交互式终端里 |
| `tui_unsupported_terminal` | input | 退出码 1 | Windows 控制台不支持 VT 序列 |

- `wl up --draft` 的替换顺序为“校验 → 备份 → 改名 → up”；任一步失败都不会留下半新半旧的规格文件。
- Orca 同步失败只记事件与告警，不影响巡查与任务（第 6.4 节）。
- TUI 中单次写操作失败只显示在状态行，TUI 不退出；读取循环的异常显示为顶部“数据过期”提示，下一轮继续。

## 11. 测试

- **编辑器**：`planSpecChange` 的每种岗位去向、字段差异、团队运行 / 停止两种命令、校验失败；表单修改写回后保留注释与字段顺序；校验接口与 `wl up` 的错误一致；保存（运行中写草稿、停止写正式规格、`baseHash` 冲突 409、`spec_invalid` 不写文件、临时文件 + 改名）；丢弃草稿；前端表单与 YAML 的双向同步、校验错误标注、预演渲染。
- **`wl up --draft`**：没有草稿；团队仍在运行；草稿校验失败时不动任何文件；成功时的备份与替换；改名失败时清理备份。
- **关于与诊断**：每一项的值与来源标注（用不同的环境变量组合）。
- **Orca 同步**：`postWorkspaceStatus` 的四种状态与优先顺序；多岗位共用 worktree 的汇总；注释拼接、信号与冻结标记、截断；只在值变化时写入；首轮只观察；连续 3 次失败后停止并告警、调度员重启后恢复；两个开关的默认值不改变规格哈希；`worktree_comment` 的通知路径改走同一写入函数。
- **TUI**：`cellWidth`（中文、英文、emoji、组合字符、控制字符）；按行差分渲染（写入内存终端后比较屏幕快照）；按键状态机（视图切换、选择、操作菜单、输入框编辑、确认、`R` 重试）；尺寸变化；退出与异常时恢复终端；非 TTY 报错；写操作经 `auditedCommands`、前缀 `tui:`。
- **迁移**：从 3A/3B 数据库升级。
- **真机集成**（只在真机上跑，需人工确认）：调度员运行时，Orca 界面上的工作区状态随任务开始与完成而变化。

## 12. 不做的事（阶段 3C）

- 页面或 TUI 上的 `up`/`down`/应用草稿：保存后仍由人在命令行执行。
- 全局配置文件。
- 修改终端标题（标题是岗位身份）。
- 未读红点。
- TUI 中的任务看板与任务详情（由控制台提供）。
- 编辑 NORMS 与 brief 文件的内容。
- 没有调度员时的 Orca 同步。

## 13. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Orca 没有工作区状态参数，或 `--comment` 形态与预期不同 | 同步做不了 | 第 3 节探针；逐项退路，开关保留但不起作用并提示一次 |
| 多岗位共用一个 worktree 时，界面只有一个状态 | 看不出是哪个岗位在忙 | 优先级汇总 + 每岗位一行的注释（开启 `worktree_comment` 时） |
| 用户在 Orca 界面里手动改了工作区状态 | 调度员下一次变化时覆盖 | 只在雁阵计算的值变化时写入，不会每轮覆盖；文档说明该状态由雁阵维护 |
| 草稿与正式规格长期分叉 | 用户忘了应用草稿 | 总览页与 `wl attention` 显示“有未应用的草稿”；编辑器默认打开草稿 |
| 表单写回 YAML 时改变了用户的格式 | 版本对比出现无关改动 | 用 Document API 只改动涉及的节点；测试覆盖注释与顺序保留 |
| TUI 异常退出后终端停留在 raw 模式 / 备用屏幕 | 终端不可用 | 多处幂等恢复；未捕获异常先恢复再报错；测试覆盖 |
| 宽字符宽度计算与终端实际显示不一致 | 表格错位 | `cellWidth` 按 Unicode 东亚宽度表实现并测试；截断留 1 列余量 |
