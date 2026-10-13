# 雁阵 Wingline 阶段 2A：任务工作流设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）拆分出的子项目 A —— 任务状态机、`team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、`wl task` 命令族。
- 不含：调度员进程、巡查与熔断、基于 token 的预算（这些是阶段 2B，另开独立 spec 和 plan）。
- 承接：`docs/superpowers/specs/2026-10-10-wingline-design.md`（下称总纲）第 4、5.1 节划定的边界；依赖阶段 0+1 已实现的 `wl up/ps/send/down`、`Registry`、`loadTeamSpec`。

## 1. 目标与定位

总纲把阶段 2（团队工作流）定义为一揽子交付：调度员、`wl task` 系列、连接、质量闸门、先计划后动手、就绪队列与自领、预算、巡查与熔断。这个范围太大，不适合一份计划书。本文档只覆盖其中**不需要后台进程就能工作**的部分：

- 岗位（已经是带 shell 的 Orca 终端，见阶段 1）**自己**创建、认领、开始、完成任务 —— 不需要调度员替它们跑。
- 质量闸门、计划先行、预算、评审/交接的连接，都做成 `wl task` 命令执行时的同步逻辑。
- 调度员（阶段 2B）将来只是在这些命令之上加一层自动轮询和提醒，不改变本文档定义的状态机和接口。

### 1.1 成功标准

一个 `duo` 这样的两岗位团队，在不启动任何后台进程的情况下：human 用 `wl task create` 建一个任务指给 builder；builder 自己 `wl task plan` → `wl task start` → 干活 → `wl task done`，gate 通过后自动给 checker 建一个 review 任务；checker 自领或被指派、走完同样的流程；全程状态和事件可以用 `wl task list/show` 查到。

## 2. 全局约束补充

本节是对总纲第 2 节的补充，不推翻其中任何一条：

6. **gate 命令经由 shell 执行，这是继 Windows `.cmd` 包装之后第二个、且唯一的例外。** 原因：gate 命令是用户在 `team.yaml` 里写的任意 shell 字符串（可能含 `&&`、管道、环境变量展开），不像 Orca 调用那样是结构化的参数数组。范围严格限定在 `wl task done` 执行 gate 这一处；其余所有子进程调用（Orca、未来新增的任何别的调用）仍然 `shell: false`。

## 3. `team.yaml` 扩展

在阶段 1 的子集之上新增以下字段，替换原本"出现即报错"的占位校验：

```yaml
posts:
  - id: builder
    self_claim: true        # 可选，默认 false；为 true 时才允许 wl task claim
    tags: [backend]         # 可选，默认 []；配合 self_claim 做任务匹配
    plan_first: true        # 可选，默认 false；为 true 时 wl task start 前必须先有 wl task plan
links:                      # 可选；键是岗位 id
  builder:
    reviewed_by: [checker]  # done 时为每个目标自动建一个 review 任务，任务本身转 done
  checker:
    consults: [builder]     # 阶段 2A 仅作名册元数据，不触发任何任务动作
gates:                      # 可选；键是岗位 id，值是单条 shell 命令字符串
  builder: 'pnpm test'
budgets:                    # 可选
  team:
    max_in_progress_per_post: 3   # 默认 3；单岗位同时 in_progress 的任务数上限
  task:
    max_gate_failures: 3          # 默认 3；单任务 gate 失败次数上限，达到后转 blocked
```

校验规则：

- 同一岗位的 `links` 中 `reviewed_by` 与 `hands_to` 不可同时出现（`done` 时语义冲突）；二者各自是地址（`<post>`，同团队内）的列表。
- `tags` 是小写字母、数字、连字符组成的字符串数组；`gates` 的值是非空字符串；`budgets` 两个字段均为正整数，缺省时取上面写的默认值。
- `consults` 允许引用任意同团队岗位 id，不做更多校验（阶段 2A 不使用其值）。
- 这些字段参与 `specHash` 的计算，沿用阶段 1 的哈希规则（排序后序列化），无需新代码路径。
- 总纲 5.1 节列出的"阶段 N 保留字段"中，`links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first` 到本阶段全部开放；阶段 2B 如需新增团队级配置（例如巡查阈值），由其自己的 spec 决定字段名，本阶段不预留占位。

## 4. 注册表扩展

新增两张表，与阶段 1 的 `teams`/`posts`/`requests` 同库（`~/.wingline/state.db`），走同一套迁移机制（`user_version` 递增）。

```sql
tasks(
  id TEXT PRIMARY KEY,          -- "<team>-<n>"，n 为该团队内递增序号，从 1 开始
  team TEXT NOT NULL REFERENCES teams(name),
  title TEXT NOT NULL,
  status TEXT NOT NULL,         -- open | claimed | in_progress | blocked | done
  post TEXT,                    -- 岗位地址 <post>@<team>；open 时为 NULL
  tags TEXT NOT NULL,           -- JSON 字符串数组，默认 '[]'
  plan TEXT,                    -- 调用 wl task plan 前为 NULL
  gate_failures INTEGER NOT NULL DEFAULT 0,
  origin_task TEXT REFERENCES tasks(id),   -- 自动创建的 review 任务指向原任务；其余为 NULL
  created_by TEXT NOT NULL,     -- 岗位地址，或 'human'（--as 未给出且无 WINGLINE_POST 时）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,           -- created | claimed | assigned | started | plan_set
                                 -- | gate_failed | done | blocked | unblocked
                                 -- | handed_to | review_created
  actor TEXT,                   -- 岗位地址；人工或系统自动动作为 NULL
  detail TEXT,                  -- JSON，截断规则同阶段 1 调用日志（正文截断 200 字符，整体 16 KB）
  at TEXT NOT NULL
)
```

`id` 的生成：在 `withTeamLock` 内部，取该团队现有任务 id 的最大序号 +1，与插入同在一次事务里，不会产生竞争。

## 5. 组件

| 单元 | 职责 | 对外接口 | 依赖 |
| --- | --- | --- | --- |
| `registry/`（扩展） | `tasks`、`events` 的读写，事务内完成状态转移 + 事件写入 | `Registry` 新增方法（见下） | `node:sqlite`（已引入） |
| `commands/task/` | 任务命令的业务逻辑，返回结构化结果，不打印 | `createTask`、`listTasks`、`showTask`、`claimTask`、`assignTask`、`planTask`、`startTask`、`doneTask`、`blockTask`、`unblockTask` | `Registry`、`CommandDeps` |
| `commands/up.ts`（修改） | 启动命令前拼接 `WINGLINE_POST` 环境变量赋值 | 同阶段 1 签名，行为增强 | 无新依赖 |
| `cli`（扩展） | `wl task <subcommand>` 的参数解析、`--as`、`--json`/人读输出、退出码 | 新增 `wl task` 子命令面 | commander、core |

`Registry` 新增方法草案：

- `nextTaskId(team): string`
- `insertTask(row: TaskRow): void` / `getTask(id): TaskRow | null` / `listTasks(filter): TaskRow[]`
- `updateTaskStatus(id, patch: Partial<TaskRow>): void`
- `appendEvent(e: { taskId; type; actor; detail }): void`
- `listEvents(taskId): EventRow[]`
- `countInProgress(post): number`（供预算检查）

## 6. 岗位自我身份识别

`wl up` 构造 `terminal create --command <launch>` 时，把 `<launch>` 替换为带环境变量前缀的版本：

- POSIX（含 macOS/Linux 的 `spawn(file, args, { shell:false })` 路径）：`terminal create` 的 `--command` 参数本身由 Orca 在目标终端的 shell 里执行，所以这里直接在该字符串前拼 `WINGLINE_POST=<addr> <launch>`，由那个 shell 完成变量导出，雁阵自身调用 Orca 时仍然不经过 shell。
- Windows `.cmd` 包装路径：同样是替换传给 Orca 的 `--command` 字符串内容，前缀改为 `set WINGLINE_POST=<addr>&& <launch>`（按 7.3 节既有转义规则处理）。

`wl task` 系列命令解析调用方地址的顺序：显式 `--as <addr>` > 环境变量 `WINGLINE_POST` > 都没有时按 `created_by: 'human'`/报错（见各命令说明）。

## 7. 任务状态机

```text
        wl task create --post X          wl task create（无 --post）
                  │                                │
                  ▼                                ▼
              claimed                             open
                  │                                │ wl task claim / wl task assign
                  │ wl task start                   ▼
                  │  （需先 plan，若 plan_first）  claimed ──┐
                  ▼                                          │（与左边汇合）
             in_progress ────────────────────────────────────┘
                  │
                  │ wl task done
         ┌────────┼─────────────────┐
         ▼        ▼                 ▼
       done   gate_failed        blocked
    （可能     （留在              （gate_failures
     触发       in_progress，       达到上限；
     review/    可重新 done）       wl task unblock
     hands_to）                     回到 claimed）
```

状态只有五种：`open`、`claimed`、`in_progress`、`blocked`、`done`。`gate_failed`/`handed_to`/`review_created` 不是状态，是命令返回结果里的 `outcome`，用于驱动下一步输出，不单独落在 `tasks.status` 上（`gate_failed` 时 `status` 仍是 `in_progress`）。

## 8. 命令详述

所有写操作都在 `registry.withTeamLock(team, fn)` 内执行，与阶段 1 的 `up`/`down` 一致。已知取舍：gate 命令执行期间占住整个团队的锁，阶段 2A 规模下可接受，阶段 2B 若需要更细粒度的锁再改。

**`wl task create <team> --title <t> [--post <addr>] [--tags a,b] [--gate <cmd>] [--as <addr>]`**

任何岗位或人工都可调用（用于初始 backlog，也用于"顺手记下新发现"——不中断当前任务，另开一条）。`--post` 给出时状态为 `claimed`，否则为 `open`。`--gate` 覆盖该任务的 gate 命令，不给则用 `gates[post]`（`--post` 未给时不校验 gate，等被认领/指派后才确定执行哪条）。写 `created` 事件，`created_by` 取自调用方地址或 `'human'`。

**`wl task list [team] [--mine] [--status s] [--tags a,b] [--json]`**

只读，`--mine` 需要能解析出调用方地址（`--as` 或 `WINGLINE_POST`），过滤 `post = <addr>`。

**`wl task show <id> [--json]`**

任务详情 + `events` 全部历史，按时间排序。

**`wl task claim <id> [--as <addr>]`**

前置：task 存在且 `status = 'open'`；调用方地址可解析；该岗位 `self_claim = true`；任务 `tags` 为空，或与该岗位 `tags` 有交集。任一不满足即报用户输入错误（分别为 `task_not_open`、`self_claim_disabled`、`tags_mismatch`）。成功：`post = <addr>`，`status = 'claimed'`，写 `claimed` 事件。

**`wl task assign <id> <addr>`**

仅供人工（无 `--as`/`WINGLINE_POST` 时才允许；岗位调用这条视为输入错误 `assign_is_human_only`），绕开 `self_claim`/`tags` 校验，用于人工指派一个 `open` 任务。要求 `status = 'open'`（否则 `task_not_open`）——`blocked` 任务的指派一律走 `wl task unblock --post`，不用这条，避免"指派是否顺带清空 `gate_failures`"产生歧义。写 `assigned` 事件。

**`wl task plan <id> "<text>" [--as <addr>]`**

调用方须是任务 owner（`post = <addr>`，否则 `not_task_owner`）。任务未 `done` 均可调用。写入 `tasks.plan`，事件 `plan_set`。

**`wl task start <id> [--as <addr>]`**

调用方须是 owner，`status = 'claimed'`。该岗位 `plan_first = true` 且 `tasks.plan IS NULL` → 报错 `plan_required`。`countInProgress(addr) >= budgets.team.max_in_progress_per_post` → 报错 `wip_budget_exceeded`。成功 → `status = 'in_progress'`，事件 `started`。

**`wl task done <id> [--as <addr>]`**

调用方须是 owner，`status = 'in_progress'`。取该任务的 gate 命令（创建时 `--gate` 覆盖值，否则 `gates[post]`；两者都没有则视为 gate 通过，跳过执行）。在调用方当前工作目录下，以 `shell: true` 执行该命令（见第 2 节的例外）。

返回结构化结果 `{ outcome, detail? }`（不抛异常，与阶段 1 `UpResult`/`UpOutcome` 同一模式），CLI 据此决定退出码：

| 退出码 0（success 字段 true） | 条件 | 后续动作 |
| --- | --- | --- |
| `outcome: 'done'` | gate 命令退出码 0，且该岗位 `links` 无 `reviewed_by`/`hands_to` | `status → 'done'`，事件 `done` |
| `outcome: 'done'`，另附 `reviewCreated: string[]` | gate 通过，岗位有 `reviewed_by: [X, ...]` | `status → 'done'`；为每个 X `create` 一个任务（`title` 自动生成，`tags: ['review']`，`post: X`，`origin_task` 为本任务 id），各写 `review_created` 事件 |
| `outcome: 'handed_to'`，附 `handedTo: string` | gate 通过，岗位有 `hands_to: [Y]` | **不**转 `done`；`post → Y`，`status → 'claimed'`，`gate_failures` 清零，事件 `handed_to` |

| 退出码 1（需要调用方处理） | 条件 | 后续动作 |
| --- | --- | --- |
| `outcome: 'gate_failed'` | gate 命令退出码非 0，`gate_failures + 1 < budgets.task.max_gate_failures` | `status` 维持 `in_progress`，`gate_failures += 1`，事件 `gate_failed`（detail 含命令输出，截断）；可直接再次 `wl task done` 重试 |
| `outcome: 'blocked'` | 同上，但 `gate_failures + 1 >= budgets.task.max_gate_failures` | `status → 'blocked'`，事件先 `gate_failed` 后 `blocked` |

**`wl task block <id> --reason <text> [--as <addr>]`**

人工或 owner 均可调用，手动把任务标记 `blocked`（不要求先有 gate 失败），写事件 `blocked`（detail 含 reason）。

**`wl task unblock <id> [--post <addr>] [--as <addr>]`**

仅人工（同 `assign` 的限定）。要求 `status = 'blocked'`。`gate_failures` 清零；给了 `--post` 则重新指派并置 `status = 'claimed'`，否则保留原 `post`、同样回到 `claimed`（owner 需要重新 `start`）。写事件 `unblocked`。

## 9. 错误处理

沿用总纲 7.8 的四类退出码（1 输入错误 / 2 Orca 报错 / 3 不确定 / 4 内部错误），`wl task` 系列不产生新的 Orca 调用，因此不会触发退出码 2、3：

- 输入错误（退出码 1）：上文各命令列出的前置条件不满足（`task_not_open`、`self_claim_disabled`、`tags_mismatch`、`not_task_owner`、`plan_required`、`wip_budget_exceeded`、`assign_is_human_only`、任务不存在 `task_unknown`、`links` 校验失败等），以及 `wl task done` 的 `gate_failed`/`blocked` 两种结果（同样按"需要调用方处理"归入 1）。
- 内部错误（退出码 4）：gate 命令本身无法启动（如可执行文件不存在）、注册表写入失败。

## 10. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | `spec/` 新字段校验、`registry/` 的 `tasks`/`events` 读写与事务、`commands/task/` 各命令的分支逻辑（含预算、自领匹配、plan_first、gate 结果三分支、reviewed_by/hands_to） | vitest，注入假 `Registry` 或内存 SQLite；gate 执行注入假的 spawn |
| 集成 | `up`（验证 `WINGLINE_POST` 确实出现在发给 Orca 的 `--command` 里）、一次完整的 create → claim → plan → start → done（含 reviewed_by 自动建任务）跑通 | 复用阶段 1 的假 `OrcaClient` 模式，断言 argv 中的 `--command` 字符串 |

不新增真机集成测试（`test:live`）项目：本阶段不涉及新的 Orca 调用面，阶段 1 的集成测试覆盖面已经验证了 `terminal create --command` 的传参路径。

## 11. 不做的事（阶段 2A）

- 不做调度员、不做后台轮询或自动提醒（阶段 2B）。
- 不做巡查信号（无进展、原地打转、消耗过快、闸门连败的"升级通知"）——阶段 2A 的 `blocked` 只是达到 `max_gate_failures` 后的被动结果，没有主动巡查。
- 不统计 token，预算只按次数计。
- `consults` 字段只做记录，不触发任何命令行为。
- 不改变 `wl ps` 的输出（任务状态通过 `wl task list/show` 查看，不混入 `ps`）。
- 一个任务只能有一个 owner；不支持多岗位协作同一个任务（`hands_to` 是转交，不是共享）。

## 12. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| gate 命令经 shell 执行，是新引入的攻击面（`team.yaml` 若来自不可信来源，等于任意命令执行） | 本地代码执行 | 和 `launch` 字段一样，`team.yaml` 被视为可信配置（用户自己写的），不做沙箱；风险在总纲和本文档中明确记录，不在阶段 2A 解决 |
| `withTeamLock` 粒度为整个团队，`done` 执行 gate 期间会阻塞同团队其他任务命令 | 团队规模变大后出现排队 | 阶段 2A 接受；阶段 2B 若调度员也要写任务表，再评估是否需要按任务级锁 |
| `hands_to` 转交后新 owner 可能没有被告知（阶段 2A 没有自动通知机制） | 任务转交后停滞，直到有人手动 `wl task list --mine` 发现 | 阶段 2B 的巡查信号之一（无进展）天然覆盖这种情况；阶段 2A 期望 NORMS/brief 里约定定期自查 |
| `budgets.task.max_gate_failures` 达到后任务进 `blocked`，若没人工关注会一直卡住 | 任务堆积 | 同上，阶段 2B 巡查负责发现并升级；阶段 2A 只负责正确记录状态 |
