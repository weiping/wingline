# 雁阵 Wingline 阶段 2A：任务工作流设计

- 日期：2026-10-13
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）拆分出的子项目 A —— 任务状态机、`team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、`wl task` 命令族。
- 不含：调度员进程、巡查与熔断、基于 token 的预算（这些是阶段 2B，另开独立 spec 和 plan）。
- 承接：`docs/superpowers/specs/2026-10-10-wingline-design.md`（下称总纲）第 4、5.1 节划定的边界；依赖阶段 0+1 已实现的 `wl up/ps/send/down`、`Registry`、`loadTeamSpec`。

> **2026-10-13 改版：** 第一版设计（雁阵自建 `tasks`/`events` 两张表、一套独立状态机）在写完后用 `spikes/task-dispatch-probe.ts` 实测核对，发现 `orca orchestration` 已经原生提供 `task-create/task-update/dispatch/gate-create` 这一整套任务与决策机制（`orca-ide orchestration --help`，Orca 1.4.222）。本版改为：**任务状态机直接借用 Orca 原生状态，雁阵只加一张很薄的扩展表**。原因和实测依据见第 2、7 节；探针结论见 `spikes/REPORT.md`"阶段 2 探针"一节。
>
> **2026-10-14 二次修订：** 用 Opus 复审本 spec 与阶段 2B spec/plan 后，发现几处关键假设此前未经真机验证（`dispatch` 是否真的通知到岗位、重试是否会产生重复任务、`--as` 的身份解析顺序、Run 重启后协调者是否可恢复）。补了一轮探针（`spikes/REPORT.md`"补充探针二"一节）逐条验证，本版按结论修正了第 2、5、7、9、13 节。

## 1. 目标与定位

总纲把阶段 2（团队工作流）定义为一揽子交付：调度员、`wl task` 系列、连接、质量闸门、先计划后动手、就绪队列与自领、预算、巡查与熔断。这个范围太大，不适合一份计划书。本文档只覆盖其中**不需要调度员常驻就能工作**的部分：

- 岗位（已经是带 shell 的 Orca 终端，见阶段 1）**自己**创建、认领、开始、完成任务 —— 不需要调度员替它们跑。
- 质量闸门、计划先行、预算、评审/交接的连接，都做成 `wl task` 命令执行时的同步逻辑。
- 调度员（阶段 2B）将来复用同一个 Run，只是多一层"接管协调者身份、处理 `worker_done`/`escalation` 收件箱、自动巡查"的自动化，不改变本文档定义的状态机和接口。

### 1.1 成功标准

一个 `duo` 这样的两岗位团队，在不启动任何后台进程的情况下：human 用 `wl task create` 建一个任务指给 builder；builder 自己 `wl task plan` → `wl task start` → 干活 → `wl task done`，gate 通过后自动给 checker 建一个关联的 review 任务并 dispatch 过去；checker 自领或被指派、走完同样的流程；全程状态可以用 `wl task list/show` 查到（直接读 Orca 的任务数据，不是雁阵自己的镜像）。

## 2. 关键事实：Orca 原生编排层（实测结论）

写 spec 前用 `spikes/task-dispatch-probe.ts` 在真实 Orca（1.4.222，Linux）上验证了以下几点，決定了下面的架构：

1. **`task-create`/`task-update`/`dispatch` 要求 `--from` 等于该 Run 的 `coordinator_handle`，但这只是字符串比对，不校验调用方是不是真的跑在那个终端的 pty 里。** 非协调者 `--from` 会被拒绝，错误码 `consumer_fenced`。——雁阵只要在团队级别记住这个字符串，任何岗位调用 `wl task` 时内部都拿它当 `--from`，不要求调用者就是那个终端。
2. **一个被 dispatch 的终端可以自己上报完成/失败**：`orchestration send --type worker_done --outcome succeeded|failed --task-id <id> --dispatch-id <id> --from <自己真实的 handle>` 不受协调者限制，直接把对应任务改成 `completed`/`failed`，同时进协调者的收件箱。`--subject` 是必填项。
3. **`failed` 是终态**（重开要 `worker-start --retry-of`，更重的机制，本阶段不用），**已经 `dispatched` 的任务不能被再次 `dispatch`**。所以：gate 失败的重试预算必须留在本地计数，只有最终定论（成功，或预算耗尽的失败）才向 Orca 报一次；`hands_to`（转交）不能"重新 dispatch 同一个任务"，只能是"原任务 `completed`，同时建一个 `--parent` 关联的新任务 dispatch 给目标"——和 `reviewed_by` 是同一条代码路径，只是新任务的标题/tags 不同。
4. **`gate-create`/`gate-resolve`/`gate-list` 不接受 `--run`**（从 `--task` 反查），其余符合直觉：对某任务提一个待决策问题，之后可以 `resolve`。**未验证谁能 resolve（是否限定协调者）**，留作第 10 节的待验证假设。
5. **Orca 在自己管理的终端里设置环境变量 `ORCA_TERMINAL_HANDLE`**（从一条报错提示里发现的）。岗位终端内的 `wl task` 可以直接读它拿到自己当前真实、永远最新的 Orca handle，不需要雁阵自己再查一遍 `locatePost`。
6. **`dispatch` 要带 `--inject` 才会真正把任务内容写进目标终端的输入框并提交；不带时 `injected:false`，目标岗位不会收到任何通知。** 补测确认：对一个已经 `tui-idle` 的真实 agent 终端 `dispatch --inject` 后，`injected:true`，agent 立刻开始处理（屏幕显示进入思考状态）；对非 agent 终端或 agent 还没就位时会被拒绝（`code: inject_rejected`，`reason: no_agent_detected`）。**本阶段所有"建任务后派给某个岗位"的路径都必须带 `--inject`**，否则岗位永远不会主动知道有新任务（见第 9 节）。
7. **编排层所有写操作的 `--retry-request` 接受调用方自己生成的 UUID 作为幂等键，不要求是 Orca 此前返回过的 id**（`task-create`/`task-update`/`dispatch`/`gate-create`/`send`/`run-create`/`run-use` 的 `--help` 均列出该参数；实测：全新生成的 UUID 第一次就能用，同 id+同参数重放得到 `replayed:true`，同 id+不同参数被拒 `request_mismatch`）。**雁阵发起任何编排写调用前，先在本地生成并记下这个 UUID，再带着它调用；进程超时或失联后安全重试，不会产生重复的任务/派发/决议**（见第 9 节各命令如何使用）。
8. **`gate-create` 接受一个已经 `failed`（终态）的任务，不报错。** `wl task done` 的 `escalated` 分支（预算耗尽后发起人工决策）因此成立，不需要改设计。

## 3. 全局约束补充

本节是对总纲第 2 节的补充，不推翻其中任何一条：

6. **gate 命令经由 shell 执行，这是继 Windows `.cmd` 包装之后第二个、且唯一的例外。** 原因：gate 命令是用户在 `team.yaml` 里写的任意 shell 字符串（可能含 `&&`、管道、环境变量展开），不像 Orca 调用那样是结构化的参数数组。范围严格限定在 `wl task done` 执行 gate 这一处；其余所有子进程调用（Orca、未来新增的任何别的调用）仍然 `shell: false`。
7. **"协调者身份"的调用全部走 `orca … --json`，不是雁阵发明的新调用方式** —— 只是把总纲约束 1（只经由 Orca CLI 操作）用到了 `orchestration` 这个命令族上，和阶段 1 用 `terminal …` 没有本质区别。调用日志（`CallLog`，阶段 1 已有）会记录完整 argv，包括 `--from <coordinator_handle>`，这和阶段 1 已经接受的日志暴露面一致，不是新风险。

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
    reviewed_by: [checker]  # done 时为每个目标建一个 --parent 关联的新任务并 dispatch 过去
  checker:
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

- 同一岗位的 `links` 中 `reviewed_by` 与 `hands_to` 不可同时出现（二者在 `done` 时走同一条"建关联任务"路径，同时出现没有意义上的区别，禁止是为了逼用户想清楚这是"评审"还是"交接"）；二者各自是地址（`<post>`，同团队内）的列表。
- `tags` 是小写字母、数字、连字符组成的字符串数组；`gates` 的值是非空字符串；`budgets` 两个字段均为正整数，缺省时取上面写的默认值。
- `consults` 允许引用任意同团队岗位 id，不做更多校验（阶段 2A 不使用其值）。
- 这些字段参与 `specHash` 的计算，沿用阶段 1 的哈希规则，无需新代码路径。

## 5. Run 与协调者身份

`wl up` 新增一步，在团队的 `lead` 岗位这一轮已经成功在岗（`outcome` 为 `launched` 或 `already_live`）之后执行：

- 若 `teams.run_id` 为空（阶段 1 遗留字段，首次在本阶段用上）：`orca orchestration run-create --objective "wingline:<team>" --from <lead 的 handle> --json`，把返回的 `run.id` 存入 `teams.run_id`，`run.coordinator_handle` 存入新字段 `teams.coordinator_handle`。
- 若 `teams.run_id` 已经存在（**包括这次只是重复 `wl up`、以及 `lead` 终端是新建出来的这两种情况，不区分对待**）：无条件 `orca orchestration run-use --id <teams.run_id> --from <lead 这一轮的 handle> --json`，把返回的 `coordinator_handle` 写回 `teams.coordinator_handle`。

若 lead 这一轮未能就位（`failed`/`uncertain`），两步都跳过，下次 `wl up` 再试。`run_id` 一旦建立，终生不变（除非 `wl down` 后换规格重新拉起——此时是否复用同一个 Run 由第 10 节的风险记录留到实现时决定，倾向于不复用，重新建一个）。

**这一步解决了"协调者 handle 在正常使用中失效"的问题：** 实测 `run-use` 可以在原协调者终端已经关闭之后，把协调者身份转给任意一个新终端（不要求新终端真的执行过这条命令），`consumer_generation` 随之累加（见 `spikes/REPORT.md`"补充探针"一节）。`wl down --close` 后再 `wl up` 重开 lead 终端时，lead 的 handle 必然变了——无条件 `run-use` 保证 `coordinator_handle` 永远跟着最新的 lead 终端走，不需要额外判断"这是第一次启动还是恢复"。`run-use` 的调用成本是每次 `wl up` 多一次 Orca 往返，可接受。

之后所有"协调者专属" Orca 调用（`task-create`/`task-update`/`dispatch`/`gate-create`/`gate-resolve`）一律用 `teams.coordinator_handle` 当 `--from`，与发起 `wl task` 命令的是哪个岗位无关。

## 6. 注册表扩展

```sql
-- teams 表新增一列（阶段 1 已有 run_id，本阶段首次写入）
teams(
  ...,
  coordinator_handle TEXT      -- run-create 返回的协调者 handle；阶段 2A 起使用
)

task_ext(
  task_id TEXT PRIMARY KEY,     -- Orca 返回的任务 id（"task_xxxxx"）
  team TEXT NOT NULL REFERENCES teams(name),
  tags TEXT NOT NULL,           -- JSON 字符串数组，默认 '[]'
  plan TEXT,                    -- wl task plan 写入
  claimed_by TEXT,              -- wl task claim 写入；claim→start 之间的本地过渡标记
  gate_failures INTEGER NOT NULL DEFAULT 0,
  done_link_request_id TEXT,    -- wl task done 第一次尝试时生成；建关联任务（reviewed_by/hands_to）或 gate-create 用的幂等 id
  done_dispatch_request_id TEXT,-- 同上，派发关联任务（dispatch --inject）用的幂等 id；仅 reviewed_by/hands_to 需要
  done_report_request_id TEXT,  -- 同上，最后一步 send worker_done 用的幂等 id
  created_at TEXT NOT NULL
)
```

不设 `events` 表：Orca 自己的任务/dispatch 记录（`task-list`、`dispatch-show --preamble`）加上阶段 1 已有的调用日志（`CallLog`，记录每次 `orca …` 调用的 argv/结果），合起来就是审计轨迹；没有再建一张平行表的必要。

**`done_*_request_id` 三列的用途（对应第 9 节 `wl task done` 的重试安全设计）：** `wl task done <id>` 第一次执行时，对它要发起的每一个 Orca 写调用各生成一个 `crypto.randomUUID()`，先写入这三列（没有则补写，`COALESCE` 式"只在为空时写入"），再带着对应的 `--retry-request` 去调用。如果命令因为进程超时/网络失联而被打断，人工或脚本原样重跑同一条 `wl task done <id>`：由于这三个 id 已经落盘，重放的每一步 Orca 调用都用的是同一个幂等 id，不会产生重复的关联任务、重复派发或重复上报——这就是第 2 节事实 7 确认的"调用方自编 UUID 可以当幂等键"在本阶段的具体用法。不需要用户手动传 `--retry-request`，也不需要雁阵自己维护一张通用的"待确认调用"表。

## 7. 身份解析

两种"自己是谁"，用途不同：

- **`ORCA_TERMINAL_HANDLE`**：Orca 自己在其管理的终端里设置的环境变量，是这个 pty 当前真实、随时最新的 Orca handle。`wl task done` 自报完成/失败（`send --type worker_done`）必须用这个值当 `--from`——这是自述，必须是真身份。
- **`WINGLINE_POST`**：阶段 1 设计里雁阵在 `wl up` 构造启动命令时注入的环境变量（见总纲/阶段 1 spec 的 `wl up` 实现，本阶段新增这一步，做法同此前已批准的设计：POSIX 前缀 `WINGLINE_POST=<addr> <launch>`，Windows `.cmd` 路径前缀 `set WINGLINE_POST=<addr>&& <launch>`），给出逻辑地址 `<post>@<team>`，用于在 `team.yaml` 里查自己的 `tags`/`self_claim`/`plan_first`/`gates` 配置，以及 `wl task list --mine` 过滤。

解析"调用方逻辑地址"的顺序：显式 `--as <addr>` > `WINGLINE_POST` 环境变量 > 报错 `actor_required`（仅对需要身份的命令；`wl task create`/`list`/`show` 不强制要求）。

**"自己的真实 handle"（dispatch/worker_done 要用的那个）解析规则，按是否传了 `--as`分两种情况，不是简单的优先级链：**

- **没有传 `--as`（最常见：岗位自己的 `wl` 进程对自己操作）**：直接读 `ORCA_TERMINAL_HANDLE` 环境变量——此时调用方进程就跑在这个地址对应的终端里，这个环境变量天然是对的，不需要再查一遍。读不到（比如在非 Orca 终端里调试）才回退 `locatePost(WINGLINE_POST 给出的地址)`。
- **传了 `--as <addr>`（以另一个地址的身份操作，比如阶段 2B 的调度员代某个岗位确认、或人工代岗位操作）**：**必须用 `locatePost(addr)` 查出 `addr` 自己的 handle，绝不能用调用方自己进程的 `ORCA_TERMINAL_HANDLE`**——那是调用方（可能是完全不同的一个终端）的 handle，不是 `addr` 的。

这条规则是为了避免一个真实的坏场景：lead 在自己的终端里敲 `wl task start t1 --as builder@duo`，如果"真实 handle"优先读调用方自己的 `ORCA_TERMINAL_HANDLE`，`dispatch --to` 就会把任务派给 lead 自己的终端而不是 builder——而已经 `dispatched` 的任务不能重新派发（第 2 节事实 3），这个任务就卡死了。按上面的规则，`--as builder@duo` 会强制走 `locatePost('builder@duo')`，拿到 builder 真正的终端 handle，派发到正确的地方。

## 8. 任务状态机

状态直接是 Orca 原生的 `ready`/`dispatched`/`completed`/`failed`，外加一个纯本地、Orca 看不见的过渡态（"已认领未开始"）：

```
(不存在)
   │ wl task create [--post X]
   ▼
ready ───────────────────────────────────────────┐
   │ wl task claim（本地写 task_ext.claimed_by，  │ wl task create --post X
   │   不调用 Orca）                               │ （直接 dispatch，跳过认领）
   ▼                                               │
ready + claimed_by=X（本地过渡态）                  │
   │ wl task start                                 │
   │ （plan_first 检查 → dispatch --to 自己）        │
   └───────────────────────┬───────────────────────┘
                           ▼
                      dispatched
                           │ wl task done：先跑 gate
             ┌─────────────┼──────────────────┐
             ▼              ▼                 ▼
     outcome=succeeded  本地重试预算未满     本地重试预算已满
     send worker_done   原样留在 dispatched  send worker_done(failed)
     (succeeded)        （不调用 Orca，       + gate-create（发起人工决策）
             │           gate_failures+=1，
             │           可再次 wl task done）
             ▼                                    ▼
         completed                             failed
```

## 9. 命令

所有涉及本地状态写入的命令（`claim`、`plan`）都在 `registry.withTeamLock(team, fn)` 内执行，防止两个岗位同时认领同一个任务；涉及 Orca 调用的命令（`create`/`start`/`done`/`escalate`/`resolve`）不需要本地锁——Orca 自己的状态机保证了 `dispatch`/`task-update` 式的并发安全（已 `dispatched` 的任务不能被二次 `dispatch`，见第 2 节）。

**`wl task create <team> --title <t> [--post <addr>] [--tags a,b] [--parent <id>] [--as <addr>] [--retry-request <id>]`**

前置：`teams.coordinator_handle` 已建立，否则报 `run_not_ready`（提示先跑一次 `wl up`）。任何岗位或人工都可调用（用于初始 backlog，也用于"顺手记下新发现"）。`--retry-request` 不给时随机生成一个 UUID（和 `wl send` 已有的 `--retry-request` 是同一套用户体验：这是"建一个新任务"，不是像 `wl task done` 那样可以按任务 id 自动记住 id 的场景——两次独立调用 `wl task create` 本来就应该建出两个任务，不能靠雁阵自己猜"这是不是上一次的重试"）。调用 `orca orchestration task-create --spec "<调用方地址>: <title>" --task-title <title> --run <team.run_id> --from <coordinator_handle> [--parent <id>] --retry-request <上面那个 id>`——spec 文本前缀调用方地址，是因为 Orca 自己的 `created_by_terminal_handle` 字段此时恒等于 `coordinator_handle`，对追溯"谁建的"没有意义，只能靠这里补。本地插入 `task_ext` 行（`tags`）。`--post` 给出时紧接着 `orca orchestration dispatch --task <id> --to <目标岗位 handle> --from <coordinator_handle> --inject --retry-request <新生成的 UUID>`（跳过认领，直接进 `dispatched`；人工直接指派视为已同意跳过 `plan_first`；带 `--inject` 是因为目标岗位不会自己去轮询，不注入就永远不知道有这个任务，见第 2 节事实 6）。

**`wl task list [team] [--mine] [--status s] [--tags a,b] [--json]`**

`orca orchestration task-list --run <team.run_id> --json`，与本地 `task_ext` 按 `id` 合并（取 `tags`/`plan`/`gate_failures`/`claimed_by`），再按参数过滤。`--mine` 需要能解析出"自己的真实 handle"（见第 7 节），过滤 `assignee_handle = <handle>`；未 dispatch 的任务用本地 `claimed_by` 过滤。

**`wl task show <id> [--json]`**

`task-list` 定位该任务（Orca 没有单任务查询命令，列表里找），与 `task_ext` 合并展示；若已 dispatch，附 `dispatch-show --task <id> --preamble` 的结果方便人工核对投递内容。

**`wl task claim <id> [--as <addr>]`**

前置：task 存在且 Orca 状态为 `ready`、本地 `task_ext.claimed_by` 为空；调用方地址可解析；该岗位 `self_claim = true`；任务 `tags` 为空，或与该岗位 `tags` 有交集。成功：`withTeamLock` 内把 `task_ext.claimed_by` 置为 `<addr>`——不调用 Orca。

**`wl task start <id> [--as <addr>]`**

前置：`task_ext.claimed_by = <addr>`（否则 `not_claimed_by_you`）。该岗位 `plan_first = true` 且 `task_ext.plan IS NULL` → `plan_required`。预算检查：`task-list` 里数 `assignee_handle = 自己真实 handle` 且 `status == 'dispatched'` 的条数 ≥ `budgets.team.max_in_progress_per_post` → `wip_budget_exceeded`。通过：`orca orchestration dispatch --task <id> --to <自己真实 handle> --from <coordinator_handle>`（**不带 `--inject`**：这是自己派给自己，调用方这一刻就在这个任务里敲命令，天然已经知道任务内容；带 `--inject` 反而多余，而且这一刻终端正在处理这条 `wl` 命令本身，不是 `tui-idle`，`--inject` 可能被拒）。

**`wl task plan <id> "<text>" [--as <addr>]`**

纯本地：写 `task_ext.plan`，不要求任务处于特定 Orca 状态（`completed`/`failed` 之外均可调用）。

**`wl task done <id> [--as <addr>]`**

前置：该任务 `assignee_handle` 等于调用方真实 handle（否则 `not_dispatched_to_you`），Orca 状态为 `dispatched`。取该岗位的 gate 命令（`gates[post]`，没有则视为通过，跳过执行），在调用方当前工作目录下以 `shell: true` 执行。

**调用顺序原则（重试安全）：凡是"会建立新状态"的 Orca 调用（建关联任务、建 gate）都排在"把原任务转成终态"的调用之前。** 这样如果命令中途因为进程超时/失联被打断，原任务在 Orca 里仍然是 `dispatched`，人工原样重跑同一条 `wl task done <id>` 就是安全的——不需要任何"从第二步继续"的特殊逻辑。每一步用的 `--retry-request` 都是第一次尝试时生成并存进 `task_ext.done_*_request_id`（见第 6 节），重跑时复用同一批 id，即使某一步其实已经在 Orca 侧生效过，也只会被幂等回放，不会产生重复的任务/派发/决议。

返回结构化结果 `{ outcome, detail? }`：

| outcome | 条件 | 动作（按执行顺序） |
| --- | --- | --- |
| `done` | gate 退出码 0，该岗位无 `reviewed_by`/`hands_to` | `send --type worker_done --outcome succeeded --task-id <id> --dispatch-id <task-list 里的 dispatch_id> --subject "gate passed" --body <(可选)输出片段> --run <run_id> --from $ORCA_TERMINAL_HANDLE --retry-request <done_report_request_id>` |
| `done`，附 `linkedTask: string` | gate 退出码 0，该岗位有 `reviewed_by: [X]` 或 `hands_to: [Y]` | ①`task-create --spec "..." --parent <id> --run <run_id> --from <coordinator_handle> --retry-request <done_link_request_id>` 建新任务（`reviewed_by` 标题前缀"评审："，`hands_to` 前缀"交接："；本地写入新任务的 `task_ext` 行）；②`dispatch --task <新id> --to <X/Y 的 handle> --from <coordinator_handle> --inject --retry-request <done_dispatch_request_id>`；③最后才 `send worker_done succeeded`（同上一行，`--retry-request <done_report_request_id>`）——①②先做是因为一旦③先做，原任务就变成 Orca 终态，`done` 的前置条件（状态必须是 `dispatched`）会让重跑整条命令失败，卡在"评审/交接任务建不出来"的半成品状态 |
| `gate_failed` | gate 退出码非 0，`task_ext.gate_failures + 1 < budgets.task.max_gate_failures` | 本地 `gate_failures += 1`；**不调用 Orca**，任务原样留在 `dispatched`，可直接再次 `wl task done` 重试 |
| `escalated` | gate 退出码非 0，`task_ext.gate_failures + 1 >= budgets.task.max_gate_failures` | ①`gate-create --task <id> --question "连续 N 次 gate 失败，需要人工决定下一步" --options '["retry","abandon","reassign"]' --from <coordinator_handle> --retry-request <done_link_request_id>`；②才 `send --type worker_done --outcome failed --task-id <id> --dispatch-id <id> --subject "gate failed" --body <命令输出，截断> --run <run_id> --from $ORCA_TERMINAL_HANDLE --retry-request <done_report_request_id>`（任务转 `failed`，终态）——理由同上一行：gate 先建好，人工才不会因为②失败而永远看不到这个决策请求 |

CLI 退出码：`done`（含附带 `linkedTask` 的情形）→ 0；`gate_failed`/`escalated` → 1（需要调用方或人工处理）。

**`wl task escalate <id> --reason <text> [--as <addr>]`**

人工或当前 owner 均可调用，`gate-create --task <id> --question <reason> --from <coordinator_handle>`，不改变任务的 Orca 状态（用于"还没到 gate 失败预算，但想提前叫人"的场景）。

**`wl task resolve <gate_id> --resolution <text> [--as <addr>]`**

`gate-resolve --id <gate_id> --resolution <text> --from <coordinator_handle>`。本阶段只记录决议文本，不自动执行"retry"等后续动作（自动重开需要 `worker-start --retry-of`，留给阶段 2B 的调度员）。

## 10. 错误处理

沿用总纲 7.8 的四类退出码，`wl task` 新增的输入错误类别：`run_not_ready`、`task_not_found`、`self_claim_disabled`、`tags_mismatch`、`not_claimed_by_you`、`plan_required`、`wip_budget_exceeded`、`not_dispatched_to_you`、`actor_required`，以及 `wl task done` 的 `gate_failed`/`escalated` 两种结果（同样按"需要调用方处理"归入退出码 1）。`consumer_fenced`（协调者身份不匹配）理论上不应该在正常使用中出现——只有 `teams.coordinator_handle` 记录本身坏掉（比如数据库被手动改过）才会触发，此时按内部错误（退出码 4）处理，提示重新 `wl down` + `wl up` 重建。

**`uncertain`（退出码 3）**：任何一次 Orca 编排调用因为进程级超时/失联而结果不明时触发，和总纲 7.8 的"结果不确定"是同一类。提示里带上这次调用实际用的 `--retry-request` id：对 `wl task create` 这类单步命令，提示直接重跑同一条命令并附上 `--retry-request <id>`；对 `wl task done` 这类多步命令，提示直接重跑 `wl task done <id>`（不需要用户自己传 id，第 6 节的 `done_*_request_id` 已经落盘，会自动复用）。

## 11. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | `spec/` 新字段校验、`task_ext` 的读写、`commands/task/` 各命令的分支逻辑（预算、自领匹配、plan_first、gate 结果三分支、reviewed_by/hands_to 合并路径） | vitest，注入假 `Registry`；gate 执行注入假的 spawn |
| 契约 | `orchestration run-create/task-create/task-list/dispatch/send(worker_done)/gate-create/gate-resolve` 的回执解析 | 扩展阶段 1 的假 `orca` 可执行文件，按 `spikes/out/task-dispatch-probe/` 里录到的真实回执（脱敏后）做 fixture |
| 集成 | `wl up` 建 Run → `wl task create/claim/start/done`（含 `reviewed_by` 触发的关联任务）跑通一遍 | 复用阶段 1 的假 `OrcaClient` 模式扩展出 orchestration 方法，断言调用序列和 `--from` 取值 |

不新增真机集成测试项目：本阶段的 orchestration 调用面已经用探针验证过关键假设，阶段 1 的 `test:live` 继续覆盖 `terminal …` 调用链路。

## 12. 不做的事（阶段 2A）

- 不做调度员、不做后台轮询或自动提醒（阶段 2B）。
- 不做巡查信号（无进展、原地打转、消耗过快、闸门连败的"升级通知"）——阶段 2A 的 `escalated` 只是达到 `max_gate_failures` 后的被动结果，没有主动巡查。
- 不统计 token，预算只按次数/条数计。
- `consults` 字段只做记录，不触发任何命令行为。
- 不改变 `wl ps` 的输出（任务状态通过 `wl task list/show` 查看，不混入 `ps`）。
- 不自动执行 `gate-resolve` 之后的动作（比如选了 "retry" 并不会自动重新 dispatch）——阶段 2A 只负责把决议记下来。

## 13. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| `gate-resolve` 的调用权限未实测（是否限定协调者） | 若限定协调者，`wl task resolve` 的 `--from <coordinator_handle>` 已经满足；若还有别的隐藏校验（比如必须是 gate-create 的创建者），本阶段设计可能需要微调 | 实现阶段第一次真跑 `wl task resolve` 时核对，和阶段 0 的"实测纠正假设"同一套做法 |
| ~~`teams.coordinator_handle` 在 Orca 重启后是否仍被接受~~ | —— | **已解决**：第 5 节改为无条件 `run-use`，每次 `wl up` 都把 `coordinator_handle` 刷新到 lead 当前的真实 handle，不区分"首次启动"还是"Orca 重启/`wl down --close` 后重开"；实测 `run-use` 在原协调者终端已关闭后依然能把身份转给新终端（`spikes/REPORT.md`"补充探针"一节） |
| gate 命令经 shell 执行，新引入的攻击面（`team.yaml` 若来自不可信来源，等于任意命令执行） | 本地代码执行 | 和 `launch` 字段一样，`team.yaml` 被视为可信配置，风险在此明确记录，不在阶段 2A 解决 |
| `coordinator_handle` 对雁阵来说等同于该团队在这个 Run 下的"万能钥匙"（任何知道这个字符串的调用都会被 Orca 当协调者） | 若注册表文件被其他用户读取，可伪造协调者调用 | 和 `~/.wingline/state.db` 本身的文件权限是同一个信任边界，阶段 1 已经假设本地数据库不被其他用户读取，不新增风险模型 |
| `hands_to` 和 `reviewed_by` 合并成同一条路径后，原任务变成 `completed`（而不是直觉上的"还没完成，只是换人"） | 团队看板/统计如果以后按"completed = 真正做完"理解会有歧义 | `wl task show` 对经由 `hands_to` 完成的任务，在 `result` 文本里标注"已转交给 <addr>"，供人工辨识；阶段 3 的控制台设计时需注意这一点 |
| `WINGLINE_POST=<addr> <launch>` 前缀只在 POSIX（bash，Linux 实测）验证过不影响 Orca 的 agent 识别；Windows `.cmd` 路径的 `set WINGLINE_POST=<addr>&& <launch>` 写法未验证 | 若 Windows 下这个前缀让 Orca 认不出 agent，会导致 Windows 岗位启动后 `tui-idle`/`dispatch --inject` 全部失效 | 本阶段先按"POSIX 已验证、Windows 待验证"记录，不假装已覆盖；实现阶段若要支持 Windows，必须补一次真机验证再合入，和总纲 Windows 支持的既有保留态度一致 |
| `dispatch --inject` 要求目标终端已被 Orca 识别为已就位的 agent（`tui-idle` 满足），对还在启动中的终端会被拒（`inject_rejected`） | 如果"派任务给某岗位"发生在该岗位刚拉起、还没就位时，`--inject` 会失败 | `create --post`/`done` 的链接派发前，复用阶段 1 已有的 `terminalWait --for tui-idle` 确认目标就位；若等待超时，按 `uncertain` 处理，提示人工稍后重试同一条命令（命中第 6 节的幂等 id，安全重试） |
