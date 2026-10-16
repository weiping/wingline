# 雁阵 Wingline 阶段 3A：重启恢复与审计时间线设计

- 日期：2026-10-16
- 状态：设计中（未实现）
- 范围：阶段 3（控制台与恢复）子项目 A：`wl restore`（重启后接回岗位会话、重新认领协调者、拉起调度员、重新派发在办任务）、会话标记、审计事件表与 `wl log` 时间线。
- 依赖：阶段 1（`wl up` 的岗位拉起与 Run 逻辑，总纲第 7 节）、阶段 2A（`docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`，下称 2A：第 7.1 节调用方解析、第 7.4 节 `screenGuard`、第 9 节账本、第 10 节 `staleReasons` 与 `wl task recover`）、阶段 2B（`docs/superpowers/specs/2026-10-13-phase-2b-dispatcher-patrol-design.md`，下称 2B：`dispatcherUp`、`dispatcherHealth`、`patrol_events`）。
- 不含：本地 HTTP API、SSE、控制台网页、`wl tui`、向 Orca 原生界面同步状态（均为 3B）。
- 承接：总纲第 4 节阶段 3 的“审计时间线、`wl restore`”；实测依据为 `spikes/REPORT.md` 的 `session-id`、`resume-after-restart`、待验证项 A、C（下称“探针报告”）。

## 1. 目标与成功标准

Orca 完整重启（或机器重启）后，所有岗位终端随进程销毁，Run 与协调者绑定字符串保留但指向失效的 handle，在办任务的 worker 被 Orca 标为 `abandoned`（探针报告待验证项 C）。今天的 `wl up` 会为每个失效岗位新开终端、重发启动包——团队能动，但每个岗位都换成了一个没有上下文的新会话。

3A 的目标：一条 `wl restore <team>` 让团队接着干活。

成功标准：

- 一个 `duo` 团队（Claude 岗位 + Codex 岗位）在 Orca 完整重启后执行 `wl restore duo`：两个岗位都在原名终端里接回重启前的会话（屏幕上是原对话），协调者被重新认领；重启前在跑的调度员被重新拉起；每个“派发失主”的任务被派回原主人的新终端。
- `wl restore duo --dry-run` 在不产生任何 Orca 写调用的前提下，报告每个岗位会被保持、接回、新开还是需要人选择。
- 任何一步中断后原样重跑 `wl restore`，不会产生重复终端、重复派发或重复的接回提示。
- `wl log duo` 按时间列出任务变迁、巡查动作和每条写命令的执行记录；`--json` 的事件结构可直接作为 3B 时间线页与 SSE 的数据格式。

## 2. 关键事实（实测）

1. **会话 ID 的来源是 `orca search`。** `terminal show` 只给 `agentIdentity`；`orca search '"<词>"' --agent claude --fresh --json` 的每条命中含 `sessionId`、`cwd`、`updatedAt`、`source.filePath`，本机环境还给出现成的 `resumeCommand`（macOS 1.4.224、Linux 1.4.222 实测）。
2. **必须加引号精确搜索。** 裸搜索会分词，两个岗位各命中 2 条；加引号后各恰好 1 条且 `sessionId` 不同（待验证项 A，macOS 实测）。即便加引号，运行探针的会话自己也可能因为命令行里含有标记而被搜中（Linux 补充验证），所以命中结果还要按 `cwd` 过滤。
3. **`claude --resume <id>` 在 Orca 终端里能接回原会话。** 恢复后屏幕显示原对话、空闲等待输入，不会自行继续干活（macOS、Linux 真机重启验证）。
4. **Run 跨重启保留，终端不保留。** 重启后 Run 与 `coordinator_handle` 仍在，旧终端 handle 变成 `terminal_handle_stale`；需要重新认领协调者（`wl up` 已实现 `reclaimed` 分支）。
5. **配对 / 远端环境会扣留 `resumeCommand`。** 例如 agent 跑在 Lima VM 里时，宿主机的 `orca search` 搜不到 VM 内会话；`--environment` 能搜到但只给 `sessionId`。3A 不处理这种情形（第 11 节）。
6. **Codex 的会话查找与恢复未实测。** 由第 3 节的探针决定。

## 3. 先补探针（plan 的 Task 0）

新增 `spikes/codex-resume.ts`，在 macOS 或 Linux 真机上跑，结论写回 `spikes/REPORT.md`：

1. 开一个 Codex 终端，发送带唯一标记的一句话，等它答完。
2. `orca search '"<标记>"' --agent codex --fresh --json`：判读是否恰好 1 条命中、命中里有没有 `sessionId` 与 `cwd`。
3. 关闭终端，用 `codex resume <sessionId>`（以及把原启动参数放在 `resume` 前、后两种形式）开新终端，读屏幕判读是否接回原对话。

判读结果决定第 5.3 节 Codex 一行的取值：

- 成立 → 按实测形式写入恢复命令模板。
- 任一步不成立 → Codex 归为“无接回能力”，一律走 `fresh`。spec 保留这条退路，plan 的其余任务不受影响。

## 4. 会话标记

### 4.1 生成与写入

每次**新开**一个岗位会话（`wl up` 新建终端，或 `wl restore` 走 `fresh`）都生成一个会话标记 `WLS-<8 位随机十六进制>`，并：

- 在发送启动包之前写入注册表 `posts.session_marker`，同时清空 `posts.session_id`，写 `posts.session_at = now`。
- 写进启动包：`renderBriefing` 的第一行之后加一行“会话标记：WLS-xxxxxxxx（雁阵用它在重启后找回本会话，无需理会）”。
- 经 `.cmd` 发送时（`multilineSafe` 为假），启动包写入文件、只发一行指引；这一行末尾同样附上“（会话标记 WLS-xxxxxxxx）”，保证标记出现在会话记录里，而不只在 agent 读过的文件里。

**同一次拉起重跑时复用标记：** 标记以 `wl up` 现有的“生命周期代数”（`lifetimeGen`）为界——同一代的 `create` 步骤已经落账时，重跑沿用 `posts.session_marker`，不生成新标记；新的一代才生成新标记。这样一次被中断、重跑后才送达的启动包，与注册表里的标记一致。

### 4.2 接回时

走 `resumed` 的岗位**不生成新标记**：会话没变，原标记仍在它的记录里。接回成功后把查到的会话 ID 写入 `posts.session_id`，供下一次 `restore` 直接使用（第 5.2 节第 2 步）。

### 4.3 标记不外泄

标记只要出现在任何一个 agent 的会话记录里，就会被引号精确搜索命中；duo 的两个岗位共用一个 worktree，`cwd` 过滤分不开它们（复审 I-2）。因此：

- 标记只写进启动包。`wl ps`、`wl attention`、`wl log`、`wl restore` 的人读输出与 `--json` 结果、审计事件的摘要、控制台与 TUI 都不包含标记；需要展示时只给会话 ID。
- 注册表里的 `session_marker` 只供 `restore` 内部使用。

### 4.4 阶段 3 之前启动的岗位

`posts.session_marker` 为空的岗位没有可搜索的标记，`restore` 时视同“找不到原会话”，结果为 `fresh`，原因写“该岗位在阶段 3 之前启动，没有会话标记”。用户也可以用 `--session` 手工指定（第 5.1 节）。

## 5. `wl restore`

### 5.1 命令

```
wl restore <team> [--dry-run] [--no-tasks] [--session <post>=<sessionId> ...] [--json]
```

- `<team>`：已登记过的团队名（`wl up` 过）。没有登记 → `team_unknown`（退出码 1，沿用已有错误码）；团队已被 `wl down`（`teams.status = stopped`）→ `team_stopped`（退出码 1，提示“团队已停止；要重新拉起请用 wl up <team.yaml>”）。规格文件路径取注册表里的 `teams.spec_path`。
- `--dry-run`：只做检查与搜索，不做任何 Orca 写调用、不写注册表（第 5.6 节）。
- `--no-tasks`：跳过第 5.2 节第 6 步。
- `--session <post>=<id>`：为某个岗位指定要接回的会话，跳过搜索；可重复。岗位不存在或 id 不符合该 agent 的格式 → `session_override_invalid`（退出码 1）。

### 5.2 执行步骤

整个命令在 `registry.withTeamLock(team, …)` 内执行（与 `wl up`、`wl down` 互斥，另一个进程持锁 → `team_busy`，退出码 1）。

1. **前置检查**：`orca status --json` 可达（否则 `runtime_unavailable`，退出码 2，提示 `orca open`）；`loadTeamSpec(teams.spec_path)` 并比对规格哈希（不一致 → `team_spec_changed`，文件不存在 → `spec_not_found`），与 2A 第 10 节的通用前置相同。
2. **逐个岗位判定**（按 `team.yaml` 中的顺序，牵头岗先）：
   - **终端还活着**（按标题找到、`connected`）→ `kept`，不做任何事。
   - **终端已失效** → 确定会话 ID：
     - 有 `--session` → 用它。
     - 否则 `posts.session_id` 非空 → 用它（上一次接回时记下的）。
     - 否则 `posts.session_marker` 非空 → `orca search '"<标记>"' --agent <agent> --fresh --json`，只保留 `cwd` 等于该岗位 worktree 绝对路径的命中（两边先解析真实路径，例如 macOS 的 `/tmp` 与 `/private/tmp`），再排除已被本团队其他岗位登记为 `session_id` 的会话：
       - 恰好 1 条 → 用它的 `sessionId`。
       - 0 条 → 结果 `fresh`，原因“未找到原会话”。
       - 多于 1 条 → 结果 `ambiguous`，列出候选（`sessionId`、`updatedAt`、消息数），提示用 `--session <post>=<id>` 指定后重跑。**不猜、不新开。**
     - 否则（无标记）→ 结果 `fresh`，原因见第 4.3 节。
     - 该岗位的 agent 没有恢复命令模板（第 5.3 节）→ 结果 `fresh`，原因“<agent> 不支持接回会话”。
     - `orca search` 调用本身失败或超时 → 结果 `uncertain`，不新开，给出重跑命令。
3. **拉起岗位**：
   - `resumed`：`terminal create --title <地址> --worktree <worktree> --command <恢复命令>`，等 `tui-idle`；经 `screenGuard`（2A 第 7.4 节）检查画面为 `clear` 后发一行“[雁阵] 重启后已接回本会话，你的地址仍是 <地址>。”；把 `sessionId` 写入 `posts.session_id`。等不到空闲 → `uncertain`，不重发、不关闭（沿用 `wl up` 的规则）；画面不是 `clear` → 不发提示，结果仍为 `resumed`，附“未发送接回提示（<画面状态>）”。
   - `fresh`：与 `wl up` 的新建路径完全相同（新标记、启动包），结果标 `fresh` 并醒目提示“上下文已丢失”。
   - 每一步按 `wl up` 的方式落账（`requests` 表，先记进行中再调用），请求键的命名空间为 `restore:<team>:<post>:<代数>:<步骤>`，与 `wl up` 的键不冲突；重跑时已完成的步骤直接取存下的结果。
   - **`restore` 的代数独立计数**（复审 I-1）：`wl up` 的生命周期代数只统计 `wl up` 自己的键，`restore` 建的终端不会让它前进。`restore` 的代数取“已完成的 `restore:<team>:<post>:<g>:create` 中最大的 `g` 加 1”；只有该岗位终端已失效、需要重新拉起时才开新的一代，同一次拉起被中断后重跑沿用原代数。否则 Orca 第二次重启后，`restore` 会回放上一次的 `create` 回执，拿到早已失效的 handle。
4. **重新认领协调者**：调用 `wl up` 现有的 Run 步骤（结果 `kept`/`reclaimed`/`lost`/`ambiguous` 等，原样输出）。牵头岗不是 `kept`/`resumed`/`fresh` 之一时，与 `wl up` 一样推迟（`deferred`）。
5. **调度员**：`dispatcherHealth(team)` 为“失联”（锁行存在、进程已死）时，说明重启前它在跑 → 调用 `dispatcherUp(team)`。“已停止”“从未启动”“运行中”都不动。调度员被拉起后首轮只观察（2B 既有设计），不需要额外恢复它的状态。
6. **在办任务**（`--no-tasks` 时跳过）：协调者处于 `kept`/`reclaimed` 后，用 `staleReasons` 取本团队原因为 `dead_assignee` 的任务，逐个调用 `recoverTask(id)`（2A 第 10 节，派回 `claimed_by`，主人忙则 `queued`）。主人岗位本次结果为 `ambiguous`/`uncertain`/失败时，跳过它名下的任务，记“主人未接回，稍后重跑 wl restore 或 wl task recover <id>”。协调者没能认领时整步跳过并说明原因。
7. **输出**（第 5.5 节）。

### 5.3 恢复命令

恢复命令由岗位的启动命令（`posts[].launch`，未写时为按 agent 与 model 生成的默认命令）加上 agent 专属的恢复参数构成，**保留原有的权限模式、模型等参数**：

| agent | 恢复命令 | 依据 |
| --- | --- | --- |
| `claude` | `<launch> --resume <sessionId>` | 实测（第 2 节第 3 条） |
| `codex` | 由第 3 节探针决定；预期形如 `codex resume <sessionId> <原参数>` | 探针 |
| 其他 | 无（一律 `fresh`） | — |

实现为一个纯函数 `resumeCommand(agent, launch, sessionId): string | null`，每行一个模板；`sessionId` 只接受 `[A-Za-z0-9-]+`，其余字符 → `session_override_invalid`（`--session` 传入时）或视为搜索结果无效（`uncertain`）。启动命令本身的引号与转义沿用 `wl up` 现有的处理，Windows 的 `.cmd` 路径同样适用。

### 5.4 结果类型

```ts
type RestorePostOutcome = 'kept' | 'resumed' | 'fresh' | 'ambiguous' | 'uncertain' | 'failed'
interface RestoreResult {
  team: string
  dryRun: boolean
  posts: Array<{
    address: string
    outcome: RestorePostOutcome
    sessionId?: string
    reason?: string
    candidates?: Array<{ sessionId: string; updatedAt: string; messageCount?: number }>
    retry?: string
  }>
  run?: UpResult['run']
  dispatcher: { action: 'restarted' | 'left' | 'skipped'; state: string; reason?: string }
  tasks: Array<{ taskId: string; owner: string; outcome: 'recovered' | 'queued' | 'skipped' | 'failed'; reason?: string; retry?: string }>
}
```

### 5.5 输出与退出码

人读输出按“岗位 → Run → 调度员 → 任务”分节，每条一行，需要人处理的附一条可复制的命令；`fresh` 行带“上下文已丢失”。

退出码沿用总纲 7.8：

- 全部岗位为 `kept`/`resumed`/`fresh` 且其余步骤成功 → 0。
- 有 `ambiguous` 或 `uncertain`（岗位、Run、调度员或任务任一）→ 3。
- 有 Orca 明确报错的失败而无不确定项 → 2。
- 输入错误（`team_unknown`、`team_stopped`、`session_override_invalid`、`team_spec_changed` 等）→ 1。

### 5.6 `--dry-run`

执行第 5.2 节第 1、2 步（`orca search` 是只读调用），第 4 步只读出 Run 现状，第 5 步只读出调度员状态，第 6 步只列出将被 recover 的任务；不调用任何 Orca 写命令、不写注册表与 `audit_events`。输出中的岗位结果用“将接回 / 将新开 / 需选择 / 保持”表述。

### 5.7 重跑安全

- 已接回或已新开的岗位，重跑时终端是活的 → `kept`。
- 终端按标题查找，不重复创建；落账的步骤重跑时回放。
- 接回提示经落账发送，重跑不会重复提示。
- `recoverTask` 本身是 P1 幂等（2A 第 10 节，`recover:<task>:open` 记录）。
- `dispatcherUp` 在调度员已运行时返回 `already_running`，不会起第二个。

## 6. 审计事件

### 6.1 表

```sql
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team TEXT NOT NULL,
  at TEXT NOT NULL,          -- ISO 时间
  actor TEXT NOT NULL,       -- 岗位地址或 human（2A 第 7.1 节的解析结果）
  command TEXT NOT NULL,     -- 例如 'task done'、'dispatcher freeze'、'restore'
  target TEXT,               -- 岗位地址、任务 id 或 gate id
  outcome TEXT NOT NULL,     -- 'ok' 或 'input'|'orca'|'uncertain'|'internal' 加错误码，例如 'input:post_frozen'
  detail TEXT                -- JSON：参数摘要
);
CREATE INDEX audit_events_team_at ON audit_events(team, at);
```

### 6.2 写入

- core 导出 `auditedCommands(deps): Commands`，把每个写命令包一层：执行命令 → 无论成功还是抛错，都写一行 `audit_events` → 返回原结果或重新抛出原错误。
- 覆盖的写命令：`up`、`down`、`restore`、`send`、`task create/claim/release/reassign/start/plan/done/escalate/resolve/recover`、`dispatcher up/down/freeze/unfreeze/hush/unhush/reply`。
- 不记的只读命令：`ps`、`task list/show`、`dispatcher status`、`attention`、`log`；`dispatcher run` 是长期循环，它的动作已经进 `patrol_events`，不另记。`restore --dry-run` 不记。
- 命令行的 `realCommands` 改为由 `auditedCommands` 生成；3B 的 HTTP API 也使用它。
- 写入失败（例如数据库被锁）只经 `deps.warn` 打一行警告，不改变命令的结果与退出码。
- 团队名取自命令参数（地址的 `@` 后部分、`<team>` 参数或任务所属团队）；解析不出团队的调用（例如输入错误发生在解析之前）记为 `team = '-'`。

### 6.3 参数摘要

- 只记结构信息：命令的位置参数与开关。
- `wl send` 的消息正文、`--body`、`--reason`、`--resolution`、`task plan` 的文本截成前 60 个字符，超出部分以“…（共 N 字）”表示。
- 不记 webhook 地址与 `notify.command`（它们不出现在命令参数里，规格文件也不进摘要）。

### 6.4 清理

`audit_events` 保留 30 天，与 `patrol_events` 在同一处按天清理（调度员循环与 `wl log` 执行时各触发一次，均为尽力而为）。

## 7. `wl log`

```
wl log <team> [--task <id>] [--post <addr>] [--since <时长|ISO 时间>] [--limit <n>] [--follow] [--json]
```

### 7.1 统一事件结构

```ts
interface TimelineEvent {
  at: string                                   // ISO 时间
  source: 'task' | 'patrol' | 'command'
  actor: string                                // 岗位地址、human 或 dispatcher@<team>
  action: string                               // task_log.action / patrol_events.action / audit_events.command
  target: string | null                        // 任务 id、岗位地址或 gate id
  outcome: string | null
  detail: unknown                              // 各来源的 detail 原样解析为 JSON（解析失败则为字符串）
}
```

- `task_log` → `source: 'task'`，`actor` 取其 `actor`，`target` 为 `task_id`（带 `#epoch` 后缀），`outcome` 为空。
- `patrol_events` → `source: 'patrol'`，`actor` 固定为 `dispatcher@<team>`，`target` 优先取 `task_id`、否则取 `post`，`action` 前面附上 `signal`（有的话，形如 `no_progress/notify_lead`）。
- `audit_events` → `source: 'command'`。

这个结构是 3B 控制台时间线页与 SSE 推送的数据格式，3B 不另定义。

### 7.2 行为

- 三个来源各自按 `at` 取最近的若干条，合并后按时间升序输出；`--limit` 默认 200，作用于合并后的结果（取最新的 n 条）。
- `--task <id>`：只保留 `target` 为该任务（任意 epoch）的事件。
- `--post <addr>`：只保留 `actor` 或 `target` 为该岗位的事件。
- `--since`：时长复用 2B 的 `parseDuration`（`90s`/`15m`/`2h`），或 ISO 时间；无法解析 → `duration_invalid`（退出码 1）。
- 人读输出每条一行：`HH:MM:SS  来源  执行者  动作  目标  摘要`；跨天时在日期变化处插一行日期。摘要为 `outcome` 与 `detail` 的单行压缩，最长 120 字符。
- `--follow`：先输出一次，然后每 2 秒读一次三张表中 `id` 大于上次游标的行，打印新事件，直到 SIGINT/SIGTERM，退出码 0。不需要常驻进程，不持团队锁。`--follow` 与 `--json` 同时使用时每行一个 JSON 对象（NDJSON）。
- 团队未登记 → `team_unknown`（退出码 1）。

## 8. 注册表迁移

追加一个迁移版本：

```sql
ALTER TABLE posts ADD COLUMN session_marker TEXT;
ALTER TABLE posts ADD COLUMN session_id TEXT;
ALTER TABLE posts ADD COLUMN session_at TEXT;
CREATE TABLE audit_events (...);   -- 第 6.1 节
CREATE INDEX audit_events_team_at ON audit_events(team, at);
```

- 从 2B 数据库升级的测试：旧数据原样保留，旧岗位的三列为空。
- 规格哈希不变（3A 不新增 `team.yaml` 字段），升级后运行中的团队不会报 `team_spec_changed`。

## 9. 错误处理

| 错误码 | 类别 | 退出码 | 场景 |
| --- | --- | --- | --- |
| `team_stopped` | input | 1 | `wl restore` 的团队已被 `wl down` |
| `session_override_invalid` | input | 1 | `--session` 的岗位不存在，或会话 ID 含非法字符 |
| `team_unknown` | input | 1 | `wl restore`/`wl log` 的团队未登记（已有） |
| `duration_invalid` | input | 1 | `--since` 无法解析（2B 已有） |
| `team_busy` | input | 1 | 另一个 `wl up`/`down`/`restore` 持有团队锁（已有） |
| （岗位层面）`ambiguous` | — | 3 | 搜到多个候选会话；不新开，等人指定 |
| （岗位层面）`uncertain` | — | 3 | `orca search` 失败、终端等不到空闲、落账步骤不确定 |

“不确定就不动手”（总纲第 2 节第 3 条）：任何一步结果不确定时，只报告与给出重跑命令，不关闭、不重建、不重发。

## 10. 测试

单元与端到端测试用 FakeOrca（新增 `search` 回执的模拟，按引号内的词与 `cwd` 返回命中）：

- `restore` 的岗位结果分支：`kept`、`resumed`（经搜索 / 经缓存的 `session_id` / 经 `--session`）、`fresh`（0 命中 / 无标记 / agent 不支持）、`ambiguous`、`uncertain`（搜索失败、等不到空闲）。
- `cwd` 过滤：同一标记在别的目录里的命中被排除。
- `--dry-run` 不产生任何 Orca 写调用、不写注册表（断言 FakeOrca 的写调用列表为空、注册表快照不变）。
- 重跑安全：在每个落账步骤之后注入中断，重跑后终端、接回提示、recover 均不重复。
- 顺序：协调者认领之后才 recover；主人未接回时跳过它的任务；调度员只在“失联”时被拉起。
- 会话标记：新开时写入启动包（多行与 `.cmd` 单行两种形式）；同一代重跑沿用标记；接回不换标记。
- `resumeCommand`：Claude 模板、带权限参数的 `launch`、非法 `sessionId`、不支持的 agent。
- 审计：表驱动测试遍历 `Commands` 的全部写字段，断言每个都经过包装（新增写命令忘了登记时测试失败）；成功与抛错都写一行；摘要截断；写入失败只警告。
- `wl log`：三源合并与排序、`--task`/`--post`/`--since`/`--limit`、`--follow` 增量输出与 SIGINT 退出、NDJSON。
- 迁移：从 2B 数据库升级。
- 契约测试：补 `orca search --json` 的真实回执样本（Claude；Codex 视探针结论）。
- 真机集成（`pnpm test:live`，需手动重启 Orca，只在真机上跑）：Claude 岗位 `wl up` → 重启 Orca → `wl restore` → 屏幕里出现重启前的对话。

## 11. 不做的事（阶段 3A）

- 不在开机或 Orca 启动时自动执行 `restore`；README 说明如何自行挂到登录项。
- 不恢复调度员的内存状态（2B 的设计是重启后首轮只观察）。
- 不处理配对 / 远端环境（如 Lima VM 内的 agent）的会话搜索；这类岗位落到“未找到原会话”，可用 `--session` 手工指定。
- 不让 `wl up` 自动接回会话：`wl up` 的行为不变，接回只经由 `wl restore`。
- 不做 HTTP API、SSE、控制台、`wl tui`、Orca 原生界面的状态同步（3B）。
- 不对审计事件做签名或防篡改；它和其他表一样在本地 sqlite 里。

## 12. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| `orca search` 的索引滞后，刚写入的会话搜不到 | 误判为“未找到原会话”而新开 | 一律带 `--fresh`；`--dry-run` 可先检查；`fresh` 结果醒目提示上下文丢失，用户可 `wl down` 后用 `--session` 重来 |
| 标记被别的会话引用（例如有人把启动包贴进了另一个会话） | 多条命中 | 按 `cwd` 过滤；仍多于 1 条则 `ambiguous`，不猜 |
| `claude --resume` 的参数形态随版本变化 | 恢复命令失败，终端退回 shell | 等不到空闲 → `uncertain`，不重发；`screenGuard` 识别 `shell` 画面；契约测试 |
| Codex 探针不成立 | Codex 岗位无法接回 | 退路：Codex 走 `fresh`（第 3 节） |
| 接回的会话停在重启前那一轮的半途 | agent 不知道自己被中断 | 接回提示告诉它已重启；在办任务经 recover 重新派发，岗位会收到新一轮的派发通知 |
| 审计写入拖慢命令 | 每条写命令多一次 sqlite 写 | 单行插入，与 `task_log` 同量级；失败不阻塞 |
| 重启后同时有大量任务需要 recover | 一次输出很长 | 这是期望行为：一屏列出全部结果；`--no-tasks` 可先只接回岗位 |
| `restore` 与刚拉起的调度员同时 recover 同一任务 | 重复的 gate 调用 | 第 6 步在调度员确认心跳之后、重新读取协调者 handle 再执行；2B 的 `auto_recover` 需要连续两轮命中且调度员首轮只观察，`restore` 已先于它完成 |
