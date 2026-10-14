# 雁阵 Wingline 阶段 2A：任务工作流设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）拆分出的子项目 A —— 任务状态机、`team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、`wl task` 命令族、编排写调用的幂等账本。
- 不含：调度员进程、巡查与熔断、基于 token 的预算（这些是阶段 2B，另开独立 spec 和 plan）。
- 承接：`docs/superpowers/specs/2026-10-10-wingline-design.md`（下称总纲）第 4、5.1 节划定的边界；依赖阶段 0+1 已实现的 `wl up/ps/send/down`、`Registry`、`loadTeamSpec`。

> **2026-10-13 改版：** 第一版设计（雁阵自建 `tasks`/`events` 两张表、一套独立状态机）在写完后用 `spikes/task-dispatch-probe.ts` 实测核对，发现 `orca orchestration` 已经原生提供 `task-create/task-update/dispatch/gate-create` 这一整套任务与决策机制（`orca-ide orchestration --help`，Orca 1.4.222）。本版改为：**任务状态机直接借用 Orca 原生状态，雁阵只加很薄的扩展表**。探针结论见 `spikes/REPORT.md`"阶段 2 探针"一节。
>
> **2026-10-14 二次修订：** 用 Opus 复审后补了一轮探针（`spikes/REPORT.md`"补充探针二"），修正了第 2、5、6、7、9、10、13 节（`dispatch --inject`、`--retry-request` 自生成 UUID、`wl up` 无条件 `run-use`、`--as` 的 handle 解析、`wl task done` 的调用顺序与 `done_*_request_id` 列）。
>
> **2026-10-14 第三次修订（本版）：** Opus 第二次复审指出二次修订的几处"修复"不完整或自相矛盾，其中幂等重试和协调者归属两处实际上没有成形的设计。又补了四个探针（`spikes/REPORT.md`"补充探针三"，下称 R3），其中两条结论推翻了二次修订的设计：`gate-create` 会结束正在进行的 dispatch、`gate-resolve` 会把任务放回 `ready`（R3-B），所以二次修订把 `escalated` 改成"先 gate 后 worker_done"是错的。本版改动：第 2 节按 R3 重写；第 3 节新增约束 8，**明确作为总纲 §2.2 的有范围修订**（不再声称"不推翻任何一条"）；第 4 节新增"评审任务不再触发连接"和 `hands_to` 环检测；第 5 节重写协调者归属（单一规则，2B 引用同一张表）并定下 Run 复用；第 6 节换掉 `done_*_request_id` 三列，改为扩展 `requests` 表 + `task_done` 表 + `epoch`；第 7 节去掉 `WINGLINE_POST`（改用 `ORCA_TERMINAL_HANDLE` 反查标题），`--as` 规则贯穿所有命令；第 8 节状态机加入 `blocked` 与"终端关闭自动回 `ready`"；新增第 9 节"编排写调用的幂等账本"（原第 9 节起顺延）；第 10 节各命令按账本重写，`done` 改为"先上报、再做后续"并定义重跑；第 11 节补 `uncertain` 的落地方式；第 12 节要求假 `OrcaClient` 模拟实测的 Orca 语义并列出必须钉住重跑安全的测试；第 13 节补"不建模评审结论"；第 14 节风险表重写。总纲 §2.2 同步加了一句指向第 3 节约束 8 的说明。

## 1. 目标与定位

总纲把阶段 2（团队工作流）定义为一揽子交付：调度员、`wl task` 系列、连接、质量闸门、先计划后动手、就绪队列与自领、预算、巡查与熔断。这个范围太大，不适合一份计划书。本文档只覆盖其中**不需要调度员常驻就能工作**的部分：

- 岗位（已经是带 shell 的 Orca 终端，见阶段 1）**自己**创建、认领、开始、完成任务 —— 不需要调度员替它们跑。
- 质量闸门、计划先行、预算、评审/交接的连接，都做成 `wl task` 命令执行时的同步逻辑。
- 调度员（阶段 2B）复用同一个 Run，只是多一层"持有协调者身份、处理收件箱、自动巡查"的自动化，不改变本文档定义的状态机和接口；协调者身份在两者之间怎么交接，由第 5 节的一张表统一规定，2B 引用它，不另立规则。

### 1.1 成功标准

一个 `duo` 这样的两岗位团队，在不启动任何后台进程的情况下：human 用 `wl task create` 建一个任务指给 builder；builder 自己 `wl task plan` → `wl task start` → 干活 → `wl task done`，gate 通过后自动给 checker 建一个关联的评审任务并派过去；checker 走完同样的流程；全程状态可以用 `wl task list/show` 查到（直接读 Orca 的任务数据，不是雁阵自己的镜像）。任何一条 `wl task` 命令因超时/崩溃中断后，原样重跑同一条命令都不会产生重复的任务、派发、上报或决策请求（第 9 节）。

## 2. 关键事实：Orca 原生编排层（实测结论）

以下均在真实 Orca（1.4.222，Linux）上验证过，出处见 `spikes/REPORT.md`"阶段 2 探针""补充探针""补充探针二""补充探针三（R3）"：

1. **协调者专属调用（`task-create`/`dispatch`/`gate-create`/`gate-resolve`/`check`）只做值匹配：`--from` 等于 `run.coordinator_handle` 即放行，不校验调用方是否跑在那个终端里，连那个终端是否还活着都不看**（R3-C2：协调者终端关闭后用它的 handle `task-create` 仍成功）。不匹配 → `consumer_fenced`。Orca 整个重启后旧 handle 字符串是否仍被接受**未验证**。
2. **`send --type worker_done` 由被派发的岗位自己上报**，不受协调者限制，直接把任务改成 `completed`/`failed` 并进协调者收件箱；`--subject` 必填；`--from` 必须精确等于该 dispatch 的 assignee handle，否则 `worker_identity_changed`（R3-A8）。从**另一个** Orca 终端里用 `--from <assignee handle>` 代发也被接受（R3-D2，assignee 是占位进程；assignee 是真实 agent pane 时**未验证**）。
3. **任务状态是 `ready`/`dispatched`/`blocked`/`completed`/`failed` 五种**（R3-B6）。已 `dispatched` 的任务不能再次 `dispatch`。**对 `dispatched` 的任务 `gate-create` 会立即结束该 dispatch：任务变 `blocked`，之后的 `worker_done` 一律 `inactive_dispatch`**（R3-B1）；对 `ready`/`failed` 的任务 `gate-create` 同样变 `blocked`。**`gate-resolve`（不论决议文本）把 `blocked` 放回 `ready`，之后可以重新 `dispatch`**（R3-B2）——所以 `failed` 只在没挂 gate 时是终态，"`worker_done(failed)` → `gate-create` → `gate-resolve`"是一条完整的重开路径。**assignee 终端被关闭，Orca 自动把该 dispatched 任务放回 `ready`**（R3-C3）；Orca 整个重启后是否同样**未验证**。
4. `gate-create`/`gate-resolve`/`gate-list` 不接受 `--run`（从 `--task` 反查）。
5. **Orca 在自己管理的终端里设置 `ORCA_TERMINAL_HANDLE`，值等于该终端自己的 handle**（R3-D1 实测）。
6. **`dispatch` 要带 `--inject` 才会把任务写进目标 agent 的输入框；目标不是 Orca 识别的 agent 时被拒（`inject_rejected`），被拒后任务仍是 `ready`，没有半成品状态**（补充探针二 #2、R3-C1）。目标 agent 正忙时 `--inject` 的行为**未验证**。
7. **编排写调用的 `--retry-request` 接受调用方自生成的 UUID，重放是"先查账本"**：同 id + 同参数 → `replayed:true`，**不论任务此后已经前进到什么状态**（对已 `dispatched` 的任务重放 `dispatch`、对已 `completed`/`failed` 的任务重放 `worker_done` 都是回放，不报状态错误）；回放返回的是**第一次调用时的回执快照**（任务早已 `dispatched` 时重放 `task-create`，回执里仍是 `ready`）；同 id + 不同参数 → `request_mismatch`。**协调者换手后，用原 `--from` 重放落地过的调用仍是回放，新 id 配旧 `--from` 则 `consumer_fenced`——即"持久化的 id + 原参数重放时被 fence"，证明原调用从未落地**（R3-A1–A4）。
8. **`run-use` 回执与 `run-create` 同形**（`run.coordinator_handle`，R3-A5）；`run-use` 对不存在的 Run 报 `run_not_found`（R3-A7）；`run-show --id` 只读返回当前 `coordinator_handle`。
9. **已终态的任务在 `task-list` 里没有 `assignee_handle`/`dispatch_id`**，只有 `result`（JSON 字符串，含 `outcome`/`reportedBy`）；`completed_at` 是 ISO 8601（如 `2026-10-14T02:57:02.357Z`）（R3-B4、B5）。

## 3. 全局约束补充

6. **gate 命令经由 shell 执行，这是继 Windows `.cmd` 包装之后第二个、且唯一的例外。** 原因：gate 命令是用户在 `team.yaml` 里写的任意 shell 字符串（可能含 `&&`、管道、环境变量展开）。范围严格限定在 `wl task done` 执行 gate 这一处；其余所有子进程调用仍然 `shell: false`。
7. **"协调者身份"的调用全部走 `orca … --json`**，只是把总纲约束 1 用到了 `orchestration` 命令族上。`CallLog` 会记录完整 argv（含 `--from <coordinator_handle>`），和阶段 1 已接受的日志暴露面一致。
8. **对总纲 §2.2 的有范围修订（不是补充）。** 总纲 §2.2 写的是"Orca 的 `--retry-request` 只接受 Orca 自己分配的 UUID"——这对 `terminal` 命令族成立（阶段 1 实测），**对 `orchestration` 命令族不成立**（第 2 节事实 7）。因此：
   - `terminal` 命令族：完全沿用总纲 §2.2 的现有做法，不变。
   - `orchestration` 命令族：沿用 §2.2 的核心要求"调用前先在注册表记下进行中、调用后记结果"，**用的是同一张 `requests` 表**，只是这一行同时存下调用方生成的 `--retry-request` id 和完整调用参数，重试时原样重放（第 6、9 节）。对确实没有稳定本地实体可以挂靠的一次性人工操作（只有 `wl task create`、`wl task escalate` 两处），每次生成新 id、不落盘，但超时类失败必须把这次用的 id 打印出来，人工带 `--retry-request <id>` 重试（第 9 节 P2）。
   - 总纲 §2.2 正文已加一句指向本条的说明；阶段 1 代码里 `deps.ts` 那句"Orca 的 --retry-request 只认它自己分配的 UUID"注释也要相应限定为 `terminal` 命令族（计划里列为改动项）。

## 4. `team.yaml` 扩展

在阶段 1 的子集之上新增以下字段，替换原本"出现即报错"的占位校验：

```yaml
posts:
  - id: builder
    self_claim: true        # 可选，默认 false；为 true 时才允许 wl task claim
    tags: [backend]         # 可选，默认 []；配合 self_claim 做任务匹配
    plan_first: true        # 可选，默认 false；为 true 时 wl task start 前必须先有 wl task plan
links:                      # 可选；键是岗位 id
  builder:
    reviewed_by: [checker]  # done 时为每个目标建一个 --parent 关联的评审任务并派过去
  checker:
    reviewed_by: [builder]  # 互评是正常配置：评审任务本身完成时不再触发连接，见下
    consults: [builder]     # 阶段 2A 仅作名册元数据，不触发任何任务动作
gates:                      # 可选；键是岗位 id，值是单条 shell 命令字符串
  builder: 'pnpm test'
budgets:                    # 可选
  team:
    max_in_progress_per_post: 3   # 默认 3；单岗位同时 dispatched 的任务数上限
  task:
    max_gate_failures: 3          # 默认 3；单任务本地 gate 失败计数上限，达到后终止并发起人工决策
```

校验规则：

- 同一岗位的 `links` 中 `reviewed_by` 与 `hands_to` 不可同时出现（`links_conflict`）；二者各自是同团队岗位 id 的列表，引用不存在的 id → `links_unknown_post`；`gates` 的键不是岗位 id → `gates_unknown_post`。
- **连接触发规则（避免互评无限循环）：** `reviewed_by` 建出的子任务标记为 `kind = review`，`hands_to` 建出的子任务为 `kind = work`（人工/岗位直接 `create` 的任务也是 `work`）。**只有 `kind = work` 的任务在 `done` 时触发其岗位的 `links`**——评审任务做完就是做完，不会再让被评审方回头评审评审者。这样 `builder.reviewed_by:[checker]` + `checker.reviewed_by:[builder]` 的互评配置是合法且有限的。
- **`hands_to` 环检测：** `hands_to` 产生的是 `work` 任务，会继续触发下一岗位的连接，所以 `hands_to` 图（岗位 → 岗位）里有环就会无限转交。`crossCheck` 对 `hands_to` 边做一次有向图环检测，有环 → `links_cycle`（报错信息列出环上的岗位）。`reviewed_by` 边不参与环检测（评审任务不再触发连接，构不成环）。
- `tags` 是小写字母、数字、连字符组成的字符串数组；`gates` 的值是非空字符串；`budgets` 两个字段均为正整数，缺省取上面的默认值。
- `consults` 允许引用任意同团队岗位 id（同样做 `links_unknown_post` 校验），阶段 2A 不使用其值。
- 这些字段参与 `specHash`，沿用阶段 1 的哈希规则。

## 5. Run 与协调者身份

### 5.1 建立 Run

`wl up` 在 posts 循环之后新增一步，前提是团队的 `lead` 岗位这一轮已经在岗（`outcome` 为 `launched` 或 `already_live`）；否则跳过，下次 `wl up` 再试：

- `teams.run_id` 为空：`orca orchestration run-create --objective "wingline:<team>" --from <lead 的 handle>`，经第 9 节账本（键 `<team>:run-create`，P1）调用，把 `run.id` 写入 `teams.run_id`、`run.coordinator_handle` 写入 `teams.coordinator_handle`。账本保证：调用超时后重跑 `wl up` 会回放同一个 Run，不会建出第二个（CLI 无法删除 Run，这一点尤其重要）。
- `teams.run_id` 已存在：按 5.2 节的规则决定是否 `run-use`。

**Run 复用（二次修订留下的开放项，本版定下）：** `run_id` 一旦建立终生不变，**包括 `wl down` 后换规格重新 `wl up`**。理由：任务属于 Run，新建 Run 会让旧任务从 `wl task list` 里消失；Orca CLI 没有删除 Run 的命令，每次换规格都新建只会不断堆积无法清理的 Run；规格变化（换模型、改 gate）不改变"这个团队的任务历史"。

### 5.2 协调者归属：唯一规则

协调者身份（`run.coordinator_handle`）只在下表三处改变，2A 和 2B 都以这张表为准，不各自另立规则：

| 谁 | 什么时候 | 动作 |
| --- | --- | --- |
| `wl up` | `teams.run_id` 为空 | `run-create --from <lead handle>`（5.1） |
| `wl up` | `teams.run_id` 已存在，且**当前 `teams.coordinator_handle` 不在 `terminal list` 的存活终端里** | `run-use --id <run_id> --from <lead handle>`，写回 `teams.coordinator_handle` |
| 调度员（2B） | 每次启动；以及循环里任何一次编排调用报 `consumer_fenced` | `run-use --id <run_id> --from <调度员自己的 handle>`，写回 `teams.coordinator_handle` |

- `wl up` **绝不把协调者身份从一个存活的终端上拿走**：调度员在跑时，协调者是调度员的终端，它是活的，`wl up` 不动它——这正是二次修订里"`wl up` 每次无条件 `run-use`"与 2B"调度员启动时 `run-use`"互相打架的根因，本规则把它消掉了。`wl up` 判断"是否存活"只多一次只读的 `terminal list`。
- `wl up` 的 `run-use` 不是正确性所必需的：第 2 节事实 1 实测协调者终端关闭后旧 handle 仍被接受，所以 lead 终端被关闭重建、调度员终端被关闭之后，2A 的调用照样可用。这一步是对"Orca 整个重启后旧 handle 字符串是否仍被接受"这个未验证情形的廉价保险，同时让协调者尽量落在一个活终端上。
- `run-use` 是值覆盖，重复执行没有副作用，所以**不带 `--retry-request`**（第 9 节）。
- **`wl task` 命令从不 `run-use`**（不抢身份）。它们一律用 `teams.coordinator_handle` 当 `--from`；如果收到 `consumer_fenced`（协调者被别人换过而注册表还没跟上，比如有人手动跑了 `orca orchestration run-use`），就 `run-show --id <run_id>` 读出当前协调者、写回 `teams.coordinator_handle`，然后按第 9 节的规则重试一次。

## 6. 注册表扩展

```sql
-- teams 新增一列（阶段 1 已有 run_id，本阶段首次写入）
teams(..., coordinator_handle TEXT)

-- requests（阶段 1 已有）新增两列：编排命令族的账本行用它们存调用方生成的 id 与完整参数（第 3 节约束 8）
requests(..., retry_request TEXT, args TEXT)

task_ext(
  task_id TEXT PRIMARY KEY,       -- Orca 任务 id（"task_xxxxx"）
  team TEXT NOT NULL REFERENCES teams(name),
  tags TEXT NOT NULL,             -- JSON 字符串数组
  kind TEXT NOT NULL,             -- work | review（第 4 节连接触发规则）
  plan TEXT,                      -- wl task plan 写入
  claimed_by TEXT,                -- 任务的"主人"岗位地址：claim、create --post、连接派发时写入；resolve --reassign 可改
  epoch INTEGER NOT NULL DEFAULT 0,  -- 第几轮派发；任务被重新派发时 +1（第 9.3 节）
  gate_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)

task_done(
  task_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  post TEXT NOT NULL,             -- 上报者地址
  verdict TEXT NOT NULL,          -- passed | escalate：只记"终局"判定；预算内的 gate 失败不落这里
  gate_failures INTEGER NOT NULL, -- 判定时的失败次数（escalate 的提问文本用它）
  dispatch_id TEXT NOT NULL,      -- 判定时 task-list 里的 dispatch_id（任务终态后 task-list 不再给，见第 2 节事实 9）
  report_from TEXT NOT NULL,      -- 上报用的 --from（判定时解析出的上报者 handle）
  body TEXT,                      -- 上报用的 --body（判定时就定下，重跑原样复用）
  result TEXT,                    -- 全部后续步骤完成后写入的 DoneResult JSON
  finished_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, epoch)
)

gates(
  gate_id TEXT PRIMARY KEY,
  team TEXT NOT NULL REFERENCES teams(name),
  task_id TEXT NOT NULL
)
```

- **本地插入一律幂等**（`INSERT … ON CONFLICT DO NOTHING`，和 `upsertTeam` 的 `ON CONFLICT` 是同一种做法）：`task_ext`、`task_done`、`gates` 三张表。原因：账本回放会把同一个 Orca 结果（同一个子任务 id、同一个 gate id）再交给本地写一次，必须是无操作而不是主键冲突。`task_done` 插入后总是再读回一次，以先落盘的那一行为准（两个进程同时跑同一条 `done` 时也收敛到同一个判定）。
- 不设 `events` 表：Orca 的任务记录加上 `CallLog`、`requests` 账本就是审计轨迹。
- 二次修订里的 `task_ext.done_link_request_id`/`done_dispatch_request_id`/`done_report_request_id` 三列删除：它们只能表示"一个目标、一次判定"，表达不了多个评审目标，也绑不住 gate 判定（复审 M1）。

## 7. 身份解析

### 7.1 调用方是谁（逻辑地址）

`resolveActor` 的顺序：

1. 显式 `--as <addr>` → 地址就是它，标记为**显式**。
2. 否则读 `ORCA_TERMINAL_HANDLE`（第 2 节事实 5）：`terminal list --include-visual-layouts`，找到这个 handle 的终端，取它的标签页标题（阶段 1 `terminalList` 已有的标题解析）；标题是注册表里已登记的岗位地址 → 就是调用方地址，标记为**隐式**，且调用方自己的 handle 就是这个环境变量。
3. 都没有 → `actor_required`（只对需要身份的命令 `claim`/`start`/`done`/`list --mine`；`create` 解析不到时记为 `human`；`list`/`show`/`plan`/`escalate`/`resolve` 不需要身份）。

**二次修订里的 `WINGLINE_POST` 环境变量注入删除。** 原因：它要求 `wl up` 在启动命令前拼 `WINGLINE_POST=<addr> <launch>`，而 Orca 终端里解释这条命令的是终端自己的 shell（Windows 上可能是 PowerShell 也可能是 cmd，`set X=Y&& …` 在 PowerShell 里不是合法语法），雁阵无从得知，`multilineSafe` 描述的是 `wl` 自己怎么调 `orca.cmd`，不是那个 shell（复审 W5）。用 `ORCA_TERMINAL_HANDLE` 反查标题不需要改启动命令、三个平台一样、永远是最新的；代价是一次 `terminal list`，可接受。`wl up` 的启动命令因此保持阶段 1 的原样不变。

### 7.2 某个地址的真实 handle

`resolveHandle(actor)`：

- **隐式**（调用方就在自己的终端里）：就是 `ORCA_TERMINAL_HANDLE`。
- **显式 `--as <addr>`**：**一律 `locatePost(addr)`**，绝不用调用方进程的 `ORCA_TERMINAL_HANDLE`——那是调用方的终端，不一定是 `addr` 的。找不到 → `post_offline`。

这条规则对**所有**需要 handle 的地方一视同仁：`start` 的派发目标、`done` 上报用的 `--from`。第 10 节命令表里不再出现"`--from $ORCA_TERMINAL_HANDLE`"这种写法，统一写成"上报者 handle（按 7.2）"。实测从另一个终端用 `--from <assignee handle>` 代发 `worker_done` 被接受（第 2 节事实 2），所以 lead 在自己终端里跑 `wl task done t1 --as builder@duo` 是可行的（assignee 为真实 agent 时未验证，见第 14 节）。

### 7.3 "派给自己"与"派给别人"

派发时判断目标 handle 是否等于 `ORCA_TERMINAL_HANDLE`：

- **相等（派给自己）**：调用方此刻就在这个终端里执行 `wl`，命令输出本身就告诉了它任务内容，不注入。不注入的理由只是"不需要"；"往一个正在执行命令的 agent 自己的终端注入会被拒"这一点**从未验证**，不作为理由。
- **不等（派给别人，含 `--as` 指向另一个岗位、`create --post`、连接派发）**：先 `terminal wait --for tui-idle`（短等待，`INJECT_IDLE_WAIT_MS = 15000`，复用阶段 1 的 `terminalWait`，进程级超时余量同 `WAIT_PROCESS_SLACK_MS`）：满足 → `dispatch --inject`；不满足（目标正忙或还没就位）→ **不带 `--inject` 派发**，任务照样归它，结果里标记"未通知"，并提示调用方用 `wl send <addr> "你有新任务 <id>，见 wl task show <id>"` 补一句（`wl send` 对忙碌 agent 是排队输入，阶段 1 已验证）。不在 `wl task` 里死等对方空闲——评审方正忙是常态。

## 8. 任务状态机

状态就是 Orca 原生的五种；雁阵本地只多记"主人"（`claimed_by`）和"第几轮"（`epoch`）：

```
(不存在)
   │ wl task create [--post X]
   ▼
ready ──────────────────────────────────────────────┐
   │ wl task claim（本地写 claimed_by，不调 Orca）     │ create --post X / 连接派发
   ▼                                                  │（claimed_by=X，直接派发）
ready + claimed_by=X                                  │
   │ wl task start（plan_first、WIP 检查 → 派发）      │
   └──────────────────────┬───────────────────────────┘
                          ▼
                     dispatched ───────────── assignee 终端被关闭（Orca 自动）──→ ready（claimed_by 不变，主人 start 即重派）
                          │ wl task done：先跑 gate
          ┌───────────────┼──────────────────────────┐
          ▼               ▼                          ▼
     gate 通过       预算内失败                  预算耗尽
     ①worker_done   原样 dispatched              ①worker_done(failed) → failed
      (succeeded)   gate_failures+=1             ②gate-create → blocked
     ②连接子任务    可再 wl task done             │
          ▼                                       │ wl task resolve（或在 Orca 界面里 resolve）
      completed                                   ▼
                                                ready（claimed_by=原主人或 --reassign 的目标）
     wl task escalate（任意时刻）：dispatched/ready → blocked（正在进行的 dispatch 被结束）
```

- `epoch`：每当一个任务**在上一轮派发已经结束之后再次被派发**（`resolve` 之后、assignee 终端关闭自动回 `ready` 之后），`epoch + 1`。`done` 的判定和后续步骤按 `(task_id, epoch)` 归档，所以同一个任务的第二轮不会复用第一轮的判定或幂等 id。若上一轮的判定是 `escalate`，新一轮开始时 `gate_failures` 清零（人已经决定让它重来）。
- 没有"放弃"状态：不想继续的任务就不 `resolve`，让它停在 `blocked`。

## 9. 编排写调用的幂等账本

### 9.1 两种模式

**P1 持久化（有稳定本地键）** —— 用于一切"中途崩溃/超时后必须能安全重试"的调用：

1. 调用前查 `requests` 里这个键：
   - 没有 → 生成 `crypto.randomUUID()`，连同**完整调用参数**（含 `--from`、`--to`、`--body` 等）以 `pending` 写入（`ON CONFLICT DO NOTHING` 后再读回）。
   - 已 `done` → **不调用 Orca**，直接返回存下的结果。
   - `pending`/`uncertain` → 用存下的 id 和参数原样调用（Orca 要么回放，要么第一次真正执行）。
2. 调用结果：
   - 成功 → 记 `done`，存映射后的结果（如子任务 id、gate id，不存整份回执）。
   - `consumer_fenced` → 由第 2 节事实 7，原调用从未落地：`run-show` 刷新 `teams.coordinator_handle`，**换新 id**、按当前状态重建参数，更新这一行，再调用一次（只重试一次）。
   - 其他明确的 Orca 错误（`ok:false`，如 `inject_rejected`、`worker_identity_changed`）→ 由第 2 节事实 6，没有发生任何变更：**删掉这一行**（下次重跑从头生成新 id），错误照常上抛（退出码 2）。
   - 结果不确定（`orca_timeout` 等 `uncertain` 类）→ 记 `uncertain`，id 与参数保留，上抛退出码 3，提示"原样重跑同一条命令即可，已记录幂等 id，不会重复执行"。
3. 回放回执是旧快照（第 2 节事实 7），凡是要依据当前状态做决定的地方另查 `task-list`，不信回执里的状态字段。

**P2 一次性（没有稳定本地键）** —— 只有两处：`wl task create` 的 `task-create`（两次独立调用本来就应该建出两个任务，雁阵不能猜"这是不是上一次的重试"）、`wl task escalate` 的 `gate-create`（同理）。每次调用生成新 UUID，除非命令行给了 `--retry-request <id>`；不落盘；`consumer_fenced` 时刷新协调者并换新 id 重试一次；**超时类失败的错误提示必须带上这次用的 id**：`wl task create <同样的参数> --retry-request <id>`。这和 `wl send` 的现有用户体验一致。

### 9.2 各调用用哪种

| Orca 调用 | 发起者 | 账本键 | 模式 |
| --- | --- | --- | --- |
| `run-create` | `wl up` | `<team>:run-create` | P1 |
| `run-use` | `wl up`、调度员 | — | 不带 id（值覆盖，重复执行无副作用） |
| `task-create` | `wl task create` | — | P2（`--retry-request` 可传） |
| `dispatch` | `create --post`、`start`、连接派发 | `dispatch:<task>:<epoch>` | P1 |
| `send worker_done` | `wl task done` | `done:<task>:<epoch>:report` | P1 |
| `task-create`（子任务） | `wl task done` | `done:<task>:<epoch>:link:<目标地址>` | P1，每个目标一行（复审 M1b） |
| `gate-create` | `wl task done`（escalate） | `done:<task>:<epoch>:gate` | P1 |
| `gate-create` | `wl task escalate` | — | P2（`--retry-request` 可传） |
| `gate-resolve` | `wl task resolve` | `resolve:<gate_id>` | P1 |
| `check`/`check --ack` | 调度员（2B） | — | 不带 id（只读/确认批次，见 2B） |

### 9.3 派发与 `epoch`

所有派发走同一个内部步骤 `dispatchTo(task, 目标地址, 目标 handle)`：

1. 键 `dispatch:<task>:<epoch>` 已 `done`，且 `task-list` 显示任务此刻是 `ready` → 上一轮派发已经结束（`resolve` 或终端关闭自动回退）：`epoch + 1`（上一轮判定是 `escalate` 时同时 `gate_failures = 0`），换新键。
2. 任务此刻已 `dispatched` 且 assignee 就是目标 handle → 视为已派发，直接成功（重跑 `start` 是无操作）。
3. 否则按 7.3 决定是否 `--inject`（这个决定在账本行第一次写入前做出、随参数一起落盘，重试不会改变它），经 P1 调用 `dispatch`。
4. 若这次 `dispatch` 是回放（`mutation.replayed`），再查一次 `task-list` 确认任务确实 `dispatched` 给了目标；不是（回放的是早已结束的旧派发）→ 回到第 1 步，`epoch + 1` 后重派一次。

## 10. 命令

**锁：** 只有纯本地读改写的 `claim`、`plan` 在 `registry.withTeamLock(team, fn)` 内执行。`withTeamLock` 是**立即失败**的（另一个进程持锁时直接 `team_busy`、退出码 1，提示稍后重试），不排队等待。其余命令不持锁：Orca 自己的状态机（已 `dispatched` 的任务不能再派发）加上第 9 节账本（同一个键的两次并发调用用的是同一个 id，Orca 回放）保证并发安全——两个进程同时 `wl task done` 同一个任务，会收敛到同一个判定、同一组调用。`wl up` 本身持团队锁跑完整个过程，期间对同一团队的 `claim`/`plan` 会 `team_busy`。

**`wl task create <team> --title <t> [--post <addr>] [--tags a,b] [--parent <id>] [--as <addr>] [--retry-request <id>]`**

前置：`teams.coordinator_handle` 已建立，否则 `run_not_ready`（提示先跑 `wl up`）。任何岗位或人工都可调用。`task-create --spec "<调用方地址或 human>: <title>" --task-title <title> --run <run_id> --from <coordinator_handle> [--parent <id>]`（P2；spec 前缀调用方地址，是因为 Orca 的 `created_by_terminal_handle` 恒等于协调者，看不出是谁建的）。本地插入 `task_ext`（`kind = work`，`tags`；给了 `--post` 时 `claimed_by = <post>`）。给了 `--post`：`dispatchTo(新任务, post)`（第 9.3 节；人工直接指派视为已同意跳过 `plan_first`，也不受 WIP 预算约束，见第 14 节）。

`--post` 的派发超时（复审 W4）：此时任务已建好、`task_ext` 已写，错误提示给出"`wl task create <同样的参数> --retry-request <本次 id>`"——重跑时 `task-create` 用同一个 id 回放出同一个任务，`task_ext` 插入是无操作，`dispatch:<task>:0` 这一行要么回放要么第一次执行，不会建出第二个任务，也不会撞上"只有 ready 的任务能派发"。

**`wl task list [team] [--mine] [--status s] [--tags a,b] [--as <addr>] [--json]`**

`task-list --run <run_id>`，与 `task_ext` 按 id 合并（`tags`/`kind`/`plan`/`claimed_by`/`gate_failures`），再过滤。`--status` 接受五种状态。`--mine` 按 `claimed_by = <调用方地址>` 过滤（地址按 7.1 解析，`--as` 给出即用它）——不再按 assignee handle 过滤：终态任务没有 assignee（第 2 节事实 9），终端重建后 handle 也会变，`claimed_by` 是唯一跨这些情况都稳定的"这是谁的任务"。`--tags` 是纯交集过滤（无 tags 的任务在带 `--tags` 时不列出）。

**`wl task show <id> [--team <team>] [--json]`**

`task-list` 定位该任务，与 `task_ext` 合并；`result` 是 Orca 的 JSON 字符串，解析出 `outcome`/`reportedBy` 展示。

**`wl task claim <id> [--as <addr>]`**

前置：任务 `ready` 且 `claimed_by` 为空；调用方可解析；该岗位 `self_claim = true`（否则 `self_claim_disabled`）；任务 `tags` 为空或与岗位 `tags` 有交集（否则 `tags_mismatch`）。`withTeamLock` 内写 `claimed_by`，不调用 Orca。

**`wl task start <id> [--as <addr>]`**

前置：`claimed_by = <调用方地址>`（否则 `not_claimed_by_you`）；`plan_first = true` 且无 plan → `plan_required`；任务已是 `blocked`/`completed`/`failed` → `task_not_open`。预算：本团队 `claimed_by = <调用方>` 且 `dispatched` 的任务数 ≥ `max_in_progress_per_post` → `wip_budget_exceeded`（任务已经派给自己的情况不计入、也不检查，见 9.3 第 2 步）。通过：`dispatchTo(任务, 调用方地址, resolveHandle(调用方))`。

因此 lead 在自己终端里跑 `wl task start t1 --as builder@duo`：handle 按 7.2 是 builder 的，派发到 builder 的终端；目标不是调用方自己的终端，按 7.3 等空闲后 `--inject`，builder 会被通知（复审 M3）。

**`wl task plan <id> "<text>"`**

纯本地：`withTeamLock` 内写 `task_ext.plan`；任务 `completed`/`failed` → `task_terminal`。不校验身份（谁都可以替任务写计划），所以不接 `--as`。

**`wl task done <id> [--as <addr>]`**

返回 `DoneResult`：

```ts
{ outcome: 'done' | 'gate_failed' | 'escalated'
  linkedTasks?: Array<{ target: string; taskId: string
    delivery: 'injected' | 'not_notified' | 'self' | 'skipped_frozen' | 'skipped_offline' }>
  gateId?: string        // escalated 时
  replayed?: boolean }   // 这一轮早已全部完成，本次只是报告存下的结果
```

执行步骤：

1. 解析调用方地址（7.1）；`task_ext.claimed_by` 必须等于它（否则 `not_your_task`）。
2. 查 `task_done(task_id, epoch)`：
   - 有且 `finished_at` 非空 → 直接返回存下的 `result`，`replayed: true`，退出码与第一次相同（复审 M1d：已经成功的命令再跑一遍报成功，不报错）。
   - 有但未完成 → 跳到第 4 步，**不重跑 gate**（复审 M1c：判定、失败次数、`--body`、上报 `--from` 都以第一次落盘的为准，重试参数不会变）。
   - 没有 → 第 3 步。
3. 判定：`task-list` 里任务必须是 `dispatched`（否则 `task_not_dispatched`；若它是 `ready`，提示"上一轮派发已结束（终端被关闭或已 resolve），先 `wl task start <id>`"），assignee 必须等于上报者 handle（7.2，否则 `not_dispatched_to_you`）。执行 gate（没有配置视为通过）：
   - 通过 → 写 `task_done`：`verdict = passed`、`dispatch_id`、`report_from`、`body`。
   - 失败且 `gate_failures + 1 < max_gate_failures` → `gate_failures += 1`，返回 `gate_failed`，**不调用 Orca、不写 `task_done`**——下次 `done` 会重新跑 gate，这正是"修好了再试"的语义。
   - 失败且 `gate_failures + 1 >= max_gate_failures` → **同一个事务里** `gate_failures = n` 并写 `task_done`：`verdict = escalate`、`gate_failures = n`。
   然后读回 `task_done`（并发时以先落盘者为准）。
4. 按判定执行后续步骤，**每一步都是第 9 节 P1**，已完成的步骤直接取存下的结果：
   - `passed`：①上报 `send --type worker_done --outcome succeeded --task-id <id> --dispatch-id <task_done.dispatch_id> --subject "gate passed" [--body <task_done.body>] --run <run_id> --from <task_done.report_from>`（键 `…:report`）；②若该任务 `kind = work` 且岗位有 `reviewed_by`/`hands_to`，对**每个目标各自**：`task-create --spec "<评审|交接>（<目标>）：<原 id>" --task-title "<评审：|交接：><原标题>" --parent <id> --run <run_id> --from <coordinator_handle>`（键 `…:link:<目标>`）→ 本地插入子任务 `task_ext`（`kind` 按连接类型，`claimed_by = <目标>`）→ 目标被冻结（2B）则不派发、记 `skipped_frozen`；目标终端找不到（`locatePost` 为空）则不派发、记 `skipped_offline`（上报已经落地，不能因为评审方暂时不在就让 `done` 失败；子任务的 `claimed_by` 已是目标，它上线后 `wl task start` 即可）；否则 `dispatchTo(子任务, 目标)`，记 `injected`/`not_notified`/`self`。
   - `escalate`：①上报 `worker_done --outcome failed`（`--subject "gate failed"`，其余同上，键 `…:report`）——任务转 `failed`；②`gate-create --task <id> --question "连续 <n> 次 gate 失败。resolve 后任务回到 ready：原岗位 wl task start 即重试；改派用 wl task resolve <gate> --reassign <地址>；不想继续就不要 resolve" --from <coordinator_handle>`（键 `…:gate`）——任务转 `blocked`；本地 `gates` 插入一行。**顺序只能是先上报后建 gate**：反过来，gate 会先把 dispatch 结束掉，上报必然 `inactive_dispatch`（第 2 节事实 3；二次修订的顺序是错的）。
5. 写 `task_done.result`/`finished_at`，返回。

**为什么一律"先上报、再做后续"：** 二次修订把连接子任务排在上报之前，理由是"上报后任务变终态，`done` 的前置检查会让重跑失败"。现在重跑由 `task_done` 记录驱动（第 2 步），不再依赖任务还是 `dispatched`，这个理由不成立了；而先上报有两个好处：一是上报是唯一绑定"那个 dispatch、那个终端"的调用，越早落地越不容易因为终端被关而永远失败（`inactive_dispatch`）；二是若上报失败，还没有任何子任务被建出来，任务停在 `dispatched`，下一轮（`epoch + 1`）重来也不会多出孤立的评审任务。

CLI 退出码：`done`（含连接、含 `replayed`）→ 0；`gate_failed`/`escalated` → 1；`uncertain` → 3。

**`--body` 的 Windows 换行处理：** gate 输出几乎总带换行，而 Windows 上所有 Orca 调用经 `.cmd` 包装，`escapeCmdArg` 拒绝含换行的参数（总纲 7.7）。`deps.multilineSafe` 为真直接截断到 4000 字符嵌入；为假且含换行时，完整输出写入 `~/.wingline/logs/<team>/gate-<task_id>-<epoch>.txt`，`--body` 只放一行"gate 输出见 <路径>"。这些文件和 `CallLog` 一样保留 7 天：写新文件时顺手删除同目录下 7 天前的 `gate-*.txt`。`body` 在判定时（第 3 步）就定下并落盘，重跑不会因为换了文件名而让参数变化。

**`wl task escalate <id> --reason <text> [--retry-request <id>]`**

人工或任务主人可调用（不校验身份）。`gate-create --task <id> --question <reason> --from <coordinator_handle>`（P2），本地 `gates` 插入一行。**效果是把任务收回来等人决定**：任务若是 `dispatched`，正在进行的 dispatch 被 Orca 结束，岗位之后的 `wl task done` 会失败（第 2 节事实 3）。用途：提前叫人；以及终端/Orca 重启后任务卡在一个已失效的 assignee 上时的手动解法（第 14 节）。输出里写明这一点。

**`wl task resolve <gate_id> --resolution <text> [--reassign <addr>]`**

`gate-resolve --id <gate_id> --resolution <text> --from <coordinator_handle>`（P1，键 `resolve:<gate_id>`，裸重跑安全，不需要 `--retry-request`）。Orca 把任务放回 `ready`（第 2 节事实 3）。`--reassign <addr>` 时本地把 `claimed_by` 改成 `addr`（不调 Orca）；否则 `claimed_by` 不变，原主人 `wl task start` 即重试。不自动派发——派发由主人 `start`（或 lead `start --as <主人>`）完成。直接在 Orca 界面里 resolve 也一样有效（`epoch`/`gate_failures` 在下次派发时按 9.3 处理），只是没有 `--reassign`。

## 11. 错误处理

沿用总纲 7.8 的四类退出码。

- 新增输入错误（退出码 1）：`run_not_ready`、`task_not_found`、`self_claim_disabled`、`tags_mismatch`、`task_not_open`、`not_claimed_by_you`、`not_your_task`、`plan_required`、`wip_budget_exceeded`、`task_not_dispatched`、`not_dispatched_to_you`、`task_terminal`、`actor_required`、`gate_unknown`、`links_conflict`、`links_unknown_post`、`links_cycle`、`gates_unknown_post`；以及 `done` 的 `gate_failed`/`escalated` 结果。
- Orca 明确报错（退出码 2）：原样附上 Orca 的错误码，如 `inject_rejected`（提示目标岗位的 agent 还没就位）、`worker_identity_changed`/`inactive_dispatch`（提示"这一轮派发已经不属于这个终端了：先 `wl task show <id>`；若任务已回到 `ready`，`wl task start <id>`"）。按第 9 节，明确报错的那一步账本行被删除，重跑从头开始。
- **`consumer_fenced`** 不直接报给用户：按第 5.2 节刷新协调者后重试一次；重试仍被 fence（极少见：有人在两次调用之间又换了协调者）才报 Orca 错误，提示重跑同一条命令。
- **结果不确定（退出码 3）**：任何一次编排调用超时/失联。P1 的提示是"原样重跑同一条命令"（id 已落盘，不需要用户传）；P2 的提示带上这次用的 id：`… --retry-request <id>`。`wl up` 的 Run 建立步骤不确定时，`wl up` 的结果里该步记为 `uncertain`、退出码 3，提示原样重跑 `wl up`。

## 12. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | `spec/` 新字段校验（含 `links_cycle`）、注册表新表与 `ON CONFLICT` 行为、账本（P1 四种结果分支、P2 提示）、`commands/task/` 各命令分支 | vitest，注入假 `OrcaClient`；gate 用 `node -e` |
| 契约 | `orchestration run-create/run-use/run-show/task-create/task-list/dispatch/send(worker_done)/gate-create/gate-resolve` 的回执解析 | 按 `spikes/out/{task-dispatch-probe,replay-probe,gate-block-probe,orphan-probe}/` 的真实回执（脱敏）做 fixture |
| 集成 | `wl up` 建 Run → create/claim/start/done（含互评、两个评审目标）→ escalate/resolve 重开 | 假 `OrcaClient` |

**假 `OrcaClient` 必须模拟第 2 节实测到的 Orca 语义，否则重跑安全无从测试**（复审 M1f）：调用方 id 账本（同 id 同参数回放、回放返回旧快照、同 id 不同参数 `request_mismatch`，**账本检查在协调者校验之前**）、协调者值匹配（`consumer_fenced`）、`worker_done` 的 assignee 校验、`gate-create` 结束 dispatch / `gate-resolve` 回 `ready`、关闭 assignee 终端自动回 `ready`、终态任务不带 assignee、可注入"调用前失败"和"已落地但返回超时"两种故障。重跑安全至少由这些可执行的测试钉住：上报已落地但超时 → 重跑不重复上报、补完连接；两个评审目标各建一个子任务；第一次子任务已建、派发超时 → 重跑不多建；escalate 中途中断后重跑不重跑 gate、提问文本不变；全部完成后重跑报成功；协调者在两次尝试之间被换走 → 重跑成功。

不新增真机集成测试项目；发版前用 `spikes/` 下的探针脚本在真机复核第 2 节的事实。

## 13. 不做的事（阶段 2A）

- 不做调度员、后台轮询、自动提醒（阶段 2B）。
- 不做巡查信号；`escalated` 只是达到 `max_gate_failures` 后的被动结果。
- 不统计 token，预算只按条数计。
- `consults` 只做记录。
- 不改变 `wl ps` 的输出。
- `resolve` 之后不自动派发；没有"放弃"状态（不 resolve 即停在 `blocked`）。
- 评审结论（通过/打回）不在本阶段建模：评审任务 `done` 就是评审做完了。

## 14. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| **每次 Orca 整个重启都会让所有终端 handle 失效**（"待验证项" C），即**所有**在办任务的 assignee 都指向死终端——不是罕见边角，是每次重启都会发生 | 岗位重启后无法对手头任务 `done`（`not_dispatched_to_you`/`worker_identity_changed`） | 终端被关闭的情形 Orca 会自动把任务放回 `ready`（第 2 节事实 3，实测），主人 `wl task start <id>` 即重派到新终端（`epoch + 1`）。Orca 整个重启后是否同样自动回退**未验证**；若没有回退，手动解法是 `wl task escalate <id> --reason "重启后重派"` → `wl task resolve <gate>` → 主人 `wl task start <id>`——`gate-create` 结束 dispatch、`gate-resolve` 回 `ready` 都已实测（含 assignee 终端已关闭的情形）。这是三条命令的手动流程，本阶段不自动化；2B 的"无进展"巡查会把这类任务暴露出来 |
| Orca 整个重启后，旧的 `coordinator_handle` 字符串是否仍被值匹配接受未验证（共用机器上不能重启 Orca） | 若不接受，2A 的协调者专属调用全部失败 | 重启后旧协调者终端必然不在存活列表里，下一次 `wl up` 按 5.2 节会 `run-use` 到 lead 的新 handle；调度员启动时也会 `run-use`。即"重启后跑一次 `wl up`"就能恢复，和阶段 1 重启后的操作习惯一致 |
| `wl task done --as <post>` 从另一个终端代发 `worker_done` 只在 assignee 是占位进程时验证过；`send --help` 说有稳定 pane 身份时只认被派发的 pane | assignee 是真实 agent 时代发可能被拒（`worker_identity_changed`） | 被拒属明确错误，账本行删除，不留半成品；岗位自己在终端里 `wl task done` 是主路径，不受影响。实现阶段第一次用真实 agent 跑 `--as` 时核对，结论写回 REPORT |
| 目标 agent 正忙时 `dispatch --inject` 的行为未验证 | — | 设计不依赖它：先短等 `tui-idle`，不空闲就不注入、标记 `not_notified` 并提示补发 `wl send`（7.3） |
| `withTeamLock` 立即失败而不排队 | `wl up` 跑着时对同一团队的 `claim`/`plan` 直接 `team_busy` | 有意为之（阶段 1 既有语义），错误提示"稍后重试"；只有纯本地读改写的两个命令持锁，持锁时间是毫秒级 |
| gate 命令经 shell 执行（`team.yaml` 来自不可信来源时等于任意命令执行） | 本地代码执行 | 和 `launch` 一样，`team.yaml` 视为可信配置 |
| `coordinator_handle` 等同于该 Run 的"万能钥匙" | 注册表文件被其他用户读取时可伪造协调者调用 | 与 `state.db` 的文件权限同一信任边界，不新增风险模型 |
| `hands_to` 合并进"原任务 `completed` + 新任务"后，原任务显示为 `completed` | 看板如果把 `completed` 理解为"真正做完"会有歧义 | `wl task show` 对有 `hands_to` 子任务的任务标注"已转交给 <addr>"；阶段 3 控制台注意 |
| WIP 预算只在 `start` 检查，`create --post` 与连接派发绕过它 | 一个岗位可能被人工或连接派发喂到超出预算 | 有意：这些路径都算"有人/有 gate 明确同意"；留给以后统一的限流设计 |
| 账本行长期累积（`requests` 表只增不删，除明确失败外） | 注册表变大 | 每行很小（id + 一次调用的参数）；与阶段 1 的 `requests` 同样不清理，真成问题时再加按天清理 |
