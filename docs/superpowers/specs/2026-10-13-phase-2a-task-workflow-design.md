# 雁阵 Wingline 阶段 2A：任务工作流设计

- 日期：2026-10-13（第五次修订 2026-10-15）
- 状态：设计中（未实现）
- 范围：阶段 2（团队工作流）拆分出的子项目 A —— 任务状态机、`team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、`wl task` 命令族、编排写调用的幂等账本、派发通知与"打字前画面检查"、任务本地变迁记录。
- 不含：调度员进程、巡查与熔断、基于 token 的预算（这些是阶段 2B，另开独立 spec 和 plan）。
- 承接：`docs/superpowers/specs/2026-10-10-wingline-design.md`（下称总纲）第 4、5.1 节划定的边界；依赖阶段 0+1 已实现的 `wl up/ps/send/down`、`Registry`、`loadTeamSpec`、`locatePost`。

> **修订历史（摘要）：**
> - 2026-10-13 改版：任务状态机直接借用 Orca 原生 `orchestration` 任务状态，雁阵只加薄扩展表（`spikes/task-dispatch-probe.ts`）。
> - 2026-10-14 第二、三、四次修订：按三轮 Opus 复审与补充探针二/三/四修正幂等重试、协调者归属、`wl task done` 的调用顺序与重跑路径。
> - **2026-10-15 第五次修订（本版）：** 第四次复审（`docs/superpowers/reviews/2026-10-15-phase-2-review.md`，下称复审四）与补充探针五、六（`spikes/REPORT.md`，下称 R5、R6）。要点：
>   1. **账本的失败处理改由 Orca 自己的 `request-show` 定案**（第 9 节）。R5 证实四个传输层错误码可能已落地、被拒的 `worker_done` 会进 Orca 账本，第四次修订的"新行/旧行 + 错误码白名单"推断规则不再成立，整段删除。
>   2. **派发一律不带 `--inject`**（第 7.3 节）。R6 实测 `--inject` 注入的是 Orca 的完整 worker 前言，要求 agent 自己 `orca orchestration send --type worker_done`，会绕过 `wl task done` 的 gate 与连接。改由雁阵发一行自己的通知。
>   3. **一个岗位终端同时最多一个进行中的派发**（R6：Orca 强制，错误码是泛化的 `runtime_error`）。删除 `budgets.team.max_in_progress_per_post`，派发前本地检查，目标忙时任务进入"排队"。
>   4. **往岗位终端打字之前先做画面检查**（第 7.4 节，2B 复用同一个函数）。
>   5. 复审四的 2A 项：gate 的执行目录与超时、本地 setter 改为插入或更新、Run 丢失的恢复、`wl task` 校验规格哈希、派给死终端的任务的发现与 `wl task recover`、`ORCA_TERMINAL_HANDLE` 的平台范围、契约测试。
>   6. 吸收项：`wl task list --stale`、`wl task release`/`reassign`、任务变迁记录 `task_log` 与 `show --history`、结束方式、escalate 附证据并通知牵头岗、记录进入 ready 与派发的时间（供 2B 用）、账本行的保留约定。

## 1. 目标与定位

总纲把阶段 2（团队工作流）定义为一揽子交付：调度员、`wl task` 系列、连接、质量闸门、先计划后动手、就绪队列与自领、预算、巡查与熔断。本文档只覆盖其中**不需要调度员常驻就能工作**的部分：

- 岗位（已经是带 shell 的 Orca 终端，见阶段 1）**自己**创建、认领、开始、完成任务 —— 不需要调度员替它们跑。
- 质量闸门、计划先行、预算、评审/交接的连接，都做成 `wl task` 命令执行时的同步逻辑。
- 调度员（阶段 2B）复用同一个 Run，只是多一层"持有协调者身份、处理收件箱、自动巡查"的自动化，不改变本文档定义的状态机和接口；协调者身份在两者之间怎么交接，由第 5 节的一张表统一规定，2B 引用它，不另立规则。

### 1.1 成功标准

一个 `duo` 这样的两岗位团队，在不启动任何后台进程的情况下：human 用 `wl task create` 建一个任务指给 builder；builder 收到雁阵的一行通知，`wl task plan` → `wl task start` → 干活 → `wl task done`，gate 通过后自动给 checker 建一个关联的评审任务并派过去（checker 正忙则排队）；checker 走完同样的流程；全程状态可以用 `wl task list/show` 查到（直接读 Orca 的任务数据，不是雁阵自己的镜像）。

重跑安全：P1 类命令（`start`、`done`、`resolve`、`recover`、`wl up` 的建 Run）因超时/崩溃中断后，**原样重跑同一条命令**不会产生重复的任务、派发、上报或决策请求；P2 类命令（`create`、`escalate`）带上错误提示里给出的 `--retry-request <id>` 重跑同样不重复（第 9 节）。卡住的情形（上报后中途退出、派给已关闭终端、绕过 `wl task done` 直接上报）都能被 `wl task list --stale` 列出来并给出处理命令。

## 2. 关键事实：Orca 原生编排层（实测结论）

以下均在真实 Orca 上验证过（Linux 1.4.222；R6 为 macOS 1.4.224），出处见 `spikes/REPORT.md`"阶段 2 探针"与补充探针二至六：

1. **协调者专属调用（`task-create`/`dispatch`/`gate-create`/`gate-resolve`/`check`/`reply`）只做值匹配：`--from` 等于 `run.coordinator_handle` 即放行，不校验调用方是否跑在那个终端里，连那个终端是否还活着都不看**（R3-C2、R6-4）。不匹配 → `consumer_fenced`。Orca 整个重启后旧 handle 字符串是否仍被接受**未验证**。
2. **`send --type worker_done` 由被派发的岗位自己上报**，不受协调者限制，直接把任务改成 `completed`/`failed` 并进协调者收件箱；`--subject` 必填；`--from` 必须精确等于该 dispatch 的 assignee handle，否则 `worker_identity_changed`（R3-A8）。从**另一个** Orca 终端里用 `--from <assignee handle>` 代发也被接受（R3-D2，assignee 是占位进程；assignee 是真实 agent pane 时**未验证**）。
3. **任务状态是 `ready`/`dispatched`/`blocked`/`completed`/`failed` 五种**（R3-B6）。已 `dispatched` 的任务不能再次 `dispatch`。对 `dispatched`/`ready`/`failed` 的任务 `gate-create` 都会让它变 `blocked`，正在进行的 dispatch 被结束、之后的 `worker_done` 一律 `inactive_dispatch`（R3-B1）。**`gate-resolve`（不论决议文本）把 `blocked` 放回 `ready`**（R3-B2）。**assignee 终端被关闭，Orca 自动把该 dispatched 任务放回 `ready`**（R3-C3）；之后再派给已关闭的 handle（不带 `--inject`）会 `ok:true`，任务停在派给死终端的 `dispatched`（R5-4）。Orca 整个重启后是否自动回退**未验证**。对 `completed` 任务 `gate-create` 的行为**未验证**。
4. `gate-create`/`gate-resolve`/`gate-list` 不接受 `--run`（从 `--task` 反查）。
5. **Orca 在自己管理的终端里设置 `ORCA_TERMINAL_HANDLE`，值等于该终端自己的 handle**（Linux R3-D1、macOS R6-5 实测；Windows **未验证**）。
6. **`dispatch --inject` 注入的是 Orca 的完整 worker 前言**：要求 agent 完成后自己执行 `orca orchestration send --type worker_done`、定期 heartbeat、有问题 `orchestration ask`，最后才是任务 spec（R6-6）。目标不是 Orca 识别的 agent 时被拒（`inject_rejected`，不进账本）。**雁阵因此不使用 `--inject`**（第 7.3 节）。
7. **编排写调用的 `--retry-request` 接受调用方自生成的 UUID，重放是"先查账本"**：同 id + 同参数 → `replayed:true`，不论任务此后已经前进到什么状态；回放返回第一次调用时的回执快照；同 id + 不同参数 → `request_mismatch`。协调者换手后，用原 `--from` 重放落地过的调用仍是回放；未落地的调用用原 `--from` 重放被 `consumer_fenced`（R3-A1–A4）。账本不按"从哪个终端调用"分区（R5-3）。
8. **`run-use` 回执与 `run-create` 同形**（`run.coordinator_handle`，R3-A5）；`run-use` 对不存在的 Run 报 `run_not_found`（R3-A7）；`run-show --id` 只读返回当前 `coordinator_handle`。
9. **已终态的任务在 `task-list` 里没有 `assignee_handle`/`dispatch_id`**，只有 `result`（JSON 字符串，含 `provenance`/`outcome`/`reportedBy`）；`completed_at` 是 ISO 8601（R3-B4、B5）。
10. **调用是否落地，以 `orchestration request-show --request <id>` 为准**（R5-5）：`completed`（附原回执，可能是成功回执，也可能是被记下的拒绝）/ `pending`（原调用还在跑，或 Orca 在记下结果前重启了）/ `absent`（从未到达、在记录前就失败了，或回执已被清理——Orca 原话"absent 不能证明什么都没发生"）。
    - 四个传输层错误码 `runtime_unavailable`、`remote_runtime_unavailable`、`runtime_timeout`（CLI 默认 socket 超时 60 s，`check --wait`/`terminal wait` 例外，R6-3）、`invalid_runtime_response` 都可能已经落地，Orca 自己把它们标为 `outcome_unknown`（R5-1）。
    - 被拒的 `worker_done`（`inactive_dispatch`、`worker_identity_changed`、`unknown_dispatch`）**会**进账本，同 id 重放永远拿回同一个拒绝（R5-2）；`inject_rejected` 不进账本（R5-4）；以 `consumer_fenced` 结束的调用不进账本（R4-1）。
11. **一个终端同一时刻只能有一个进行中的派发**：已有 `dispatched` 任务的终端再收派发 → `ok:false`，错误码为泛化的 `runtime_error`（"already has an active dispatch"），任务保持 `ready`（R6-1）。
12. 岗位 `orchestration ask` 留下的问题以 `type: question` 进协调者收件箱，`from_handle` 是 `dispatch:<dispatch_id>`，`payload` 带 `taskId`/`dispatchId`/`question`/`options`；`reply` 只认当前协调者（R6-4，2B 使用）。

## 3. 全局约束补充

6. **gate 命令经由 shell 执行，这是继 Windows `.cmd` 包装之后第二个、且唯一的例外。** 原因：gate 命令是用户在 `team.yaml` 里写的任意 shell 字符串（可能含 `&&`、管道、环境变量展开）。范围严格限定在 `wl task done` 执行 gate 这一处；其余所有子进程调用仍然 `shell: false`。总纲 §2.4 同步写明这第二个例外。
7. **"协调者身份"的调用全部走 `orca … --json`**，只是把总纲约束 1 用到了 `orchestration` 命令族上。`CallLog` 会记录完整 argv（含 `--from <coordinator_handle>`），和阶段 1 已接受的日志暴露面一致。
8. **对总纲 §2.2 的有范围修订（不是补充）。** 总纲 §2.2 写的是"Orca 的 `--retry-request` 只接受 Orca 自己分配的 UUID"——这对 `terminal` 命令族成立（阶段 1 实测），**对 `orchestration` 命令族不成立**（第 2 节事实 7）。因此：
   - `terminal` 命令族：完全沿用总纲 §2.2 的现有做法，不变。
   - `orchestration` 命令族：沿用 §2.2 的核心要求"调用前先在注册表记下进行中、调用后记结果"，**用的是同一张 `requests` 表**，只是这一行同时存下调用方生成的 `--retry-request` id 和完整调用参数，失败时用 `request-show` 定案（第 9 节）。
   - 阶段 1 代码里 `deps.ts` 那句"Orca 的 --retry-request 只认它自己分配的 UUID"注释相应限定为 `terminal` 命令族（计划里列为改动项）。
9. **雁阵不用 `--inject`，也不让岗位直接用 `orca orchestration send` 上报。** 通知与任务 spec 都明确写"完成后运行 `wl task done <id>`"；直接上报（绕过 gate 与连接）作为一种需要人看见的异常，由 `wl task list --stale` 与 2B 调度员发现（第 10 节）。
10. **往岗位终端打字之前必须先做画面检查**（第 7.4 节）。适用于本阶段的派发通知、escalate 通知，以及 2B 的全部提示与转述。

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
  task:
    max_gate_failures: 3          # 默认 3；单任务本地 gate 失败计数上限，达到后终止并发起人工决策
    gate_timeout_seconds: 600     # 默认 600；单次 gate 运行上限，超时计为一次失败
    max_minutes: 240              # 可选，无默认；单次派发的期望时长，只记录，2B 据此判断逾期
```

校验规则：

- 同一岗位的 `links` 中 `reviewed_by` 与 `hands_to` 不可同时出现（`links_conflict`）；二者各自是同团队岗位 id 的列表，引用不存在的 id → `links_unknown_post`；**指向自己 → `links_self`**；`gates` 的键不是岗位 id → `gates_unknown_post`。
- **连接触发规则（避免互评无限循环）：** `reviewed_by` 建出的子任务标记为 `kind = review`，`hands_to` 建出的子任务为 `kind = work`（人工/岗位直接 `create` 的任务也是 `work`）。**只有 `kind = work` 的任务在 `done` 时触发其岗位的 `links`**——评审任务做完就是做完。
- **`hands_to` 环检测：** `crossCheck` 对 `hands_to` 边做有向图环检测，有环 → `links_cycle`（报错信息列出环上的岗位）。`reviewed_by` 边不参与环检测。
- `tags` 是小写字母、数字、连字符组成的字符串数组；`gates` 的值是非空字符串；`budgets.task` 各字段均为正整数，缺省取上面的默认值。
- 出现已删除的字段 `budgets.team.max_in_progress_per_post` → `field_removed`，提示"Orca 限定每个岗位终端同时只有一个进行中的派发，此字段已取消"。
- `consults` 允许引用任意同团队岗位 id（同样做 `links_unknown_post`/`links_self` 校验），阶段 2A 不使用其值。
- 这些字段参与 `specHash`，沿用阶段 1 的哈希规则。

## 5. Run 与协调者身份

### 5.1 建立 Run

`wl up` 在 posts 循环之后新增一步，前提是团队的 `lead` 岗位这一轮已经在岗（`outcome` 为 `launched` 或 `already_live`）；否则跳过，下次 `wl up` 再试：

- `teams.run_id` 为空：
  1. 账本里没有 `<team>:run-create` 这一行时，先 `orchestration run-list` 按 objective 等于 `wingline:<team>` 查找已有的 Run（注册表丢失或换了 `WINGLINE_HOME` 的情形）：恰好一个 → 采用它（写入 `teams.run_id`，再按 5.2 的表 `run-use` 到 lead）；多于一个 → `run_ambiguous`（退出码 1），列出各 Run 的 id 与创建时间，提示 `wl up <team.yaml> --adopt-run <id>`；没有 → 下一步。
  2. `orca orchestration run-create --objective "wingline:<team>" --from <lead 的 handle>`，经第 9 节账本（键 `<team>:run-create`，P1）调用，把 `run.id` 写入 `teams.run_id`、`run.coordinator_handle` 写入 `teams.coordinator_handle`。账本保证：调用超时后重跑 `wl up` 不会建出第二个 Run（CLI 无法删除 Run，这一点尤其重要）。
- `teams.run_id` 已存在：按 5.2 节的规则决定是否 `run-use`。`run-use` 报 `run_not_found`（Run 被人在 Orca 界面里删掉了）→ `run_lost`（退出码 2），提示"原 Run 已不存在，旧任务无法恢复；确认后用 `wl up <team.yaml> --new-run` 新建"。
- `--new-run`：清空 `teams.run_id`、`teams.coordinator_handle`，删除账本行 `<team>:run-create`，然后按"`teams.run_id` 为空"处理但**跳过 run-list 查找**；输出里写明旧任务从此不在 `wl task list` 里。`--adopt-run <id>`：`run-use --id <id>` 成功后写入 `teams.run_id`。

**Run 复用：** `run_id` 一旦建立终生不变，**包括 `wl down` 后换规格重新 `wl up`**（任务属于 Run；CLI 删不掉 Run；规格变化不改变"这个团队的任务历史"）。只有 `--new-run`/`--adopt-run` 两个显式动作能换 Run。

**派给死终端的任务报告：** `wl up` 在建 Run 之后做一次只读核对（一次 `task-list --run` + 已有的 `terminal list`）：列出 `dispatched` 且 `assignee_handle` 不在存活终端里的任务，按 `task_ext.claimed_by` 汇总打印，每条附一条可直接复制的 `wl task recover <id>`。不自动处理。

### 5.2 协调者归属：唯一规则

协调者身份（`run.coordinator_handle`）只在下表几处改变，2A 和 2B 都以这张表为准，不各自另立规则：

| 谁 | 什么时候 | 动作 |
| --- | --- | --- |
| `wl up` | `teams.run_id` 为空 | `run-create --from <lead handle>`（5.1），或采用 run-list 找到的唯一 Run 后按下一行处理 |
| `wl up` | `teams.run_id` 已存在，且**当前 `teams.coordinator_handle` 不在 `terminal list` 的存活终端里** | `run-use --id <run_id> --from <lead handle>`，写回 `teams.coordinator_handle` |
| 调度员（2B） | 每次启动；以及循环里任何一次编排调用报 `consumer_fenced` | `run-use --id <run_id> --from <调度员自己的 handle>`，写回 `teams.coordinator_handle` |

- `wl up` **绝不把协调者身份从一个存活的终端上拿走**（调度员在跑时它的终端是活的）。
- `wl up` 的 `run-use` 不是正确性所必需的（事实 1：值匹配不看终端死活），是对"Orca 整个重启后旧 handle 字符串是否仍被接受"这个未验证情形的廉价保险。
- `run-use` 是值覆盖，重复执行没有副作用，所以**不带 `--retry-request`**。
- **写回 `teams.coordinator_handle` 一律只更新这一列**（`UPDATE teams SET coordinator_handle = ? WHERE name = ?`），不用整行 upsert，避免把并发 `wl down` 写下的 `status` 覆盖回去。
- **`wl task` 命令从不 `run-use`**。它们一律用 `teams.coordinator_handle` 当 `--from`；收到 `consumer_fenced` 时 `run-show --id <run_id>` 读出当前协调者、写回，然后按第 9 节重试一次。

## 6. 注册表扩展

```sql
-- teams 新增一列（阶段 1 已有 run_id，本阶段首次写入）
teams(..., coordinator_handle TEXT)

-- requests（阶段 1 已有）新增两列：编排命令族的账本行存调用方生成的 id 与完整参数（第 3 节约束 8）
requests(..., retry_request TEXT, args TEXT)

task_ext(
  task_id TEXT PRIMARY KEY,       -- Orca 任务 id（"task_xxxxx"）
  team TEXT NOT NULL REFERENCES teams(name),
  tags TEXT NOT NULL DEFAULT '[]',-- JSON 字符串数组
  kind TEXT NOT NULL DEFAULT 'work', -- work | review（第 4 节连接触发规则）
  plan TEXT,                      -- wl task plan 写入
  claimed_by TEXT,                -- 任务的"主人"岗位地址：claim、create --post、连接派发、reassign 写入；release 清空
  epoch INTEGER NOT NULL DEFAULT 0,  -- 第几轮派发；任务被重新派发时 +1（第 9.3 节）
  gate_failures INTEGER NOT NULL DEFAULT 0,
  ready_since TEXT,               -- 最近一次观察到/造成任务进入 ready 的时间（create、resolve、release、epoch+1 时写；2B 用来判断"有主人却没人动"）
  dispatched_at TEXT,             -- 本轮派发成功的时间（2B 用来判断逾期）
  created_at TEXT NOT NULL
)

task_done(
  task_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  post TEXT NOT NULL,             -- 上报者地址
  verdict TEXT NOT NULL,          -- passed | escalate | bypassed（bypassed：岗位绕过 wl 直接上报后补跑的判定，第 10 节）
  gate_failures INTEGER NOT NULL, -- 判定时的失败次数
  dispatch_id TEXT NOT NULL,      -- 判定时 task-list 里的 dispatch_id（bypassed 时为空字符串）
  report_from TEXT NOT NULL,      -- 上报用的 --from（bypassed 时为空字符串）
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

task_log(                         -- 只追加的本地变迁记录（吸收项 B-5）；Orca 不记、事后补不回来的才记
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team TEXT NOT NULL,
  task_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  at TEXT NOT NULL,               -- ISO 8601
  actor TEXT NOT NULL,            -- 调用方地址或 human
  actor_source TEXT NOT NULL,     -- explicit（--as）| implicit（ORCA_TERMINAL_HANDLE 反查）| human
  action TEXT NOT NULL,           -- create | claim | release | reassign | plan | start | queued | notify | gate_failed | done | escalate | resolve | recover | epoch_bump | bypass_detected
  detail TEXT                     -- 短 JSON：目标地址、delivery、失败次数、gate 输出路径等
)
```

- **本地写一律"插入或更新"**：`task_ext` 的所有 setter（`setClaimedBy`、`setPlan`、`incrementGateFailures`、`bumpEpoch`、`setReadySince`、`setDispatchedAt`）在行不存在时按默认值插入（`INSERT … ON CONFLICT(task_id) DO UPDATE`），因为在 Orca 界面里直接建的任务没有 `task_ext` 行（复审四 A-I6）。`team` 取命令解析出的团队。
- **`bumpEpoch` 是比较后更新**：`UPDATE task_ext SET epoch = epoch + 1 … WHERE task_id = ? AND epoch = ?`，影响 0 行说明别的进程已经加过，重新读取即可，不会连加两次。
- **插入幂等**：`task_done`、`gates` 用 `INSERT … ON CONFLICT DO NOTHING` 后再读回（账本回放会把同一个 Orca 结果再交给本地写一次）。
- **账本行的保留约定（吸收项 B-9）：** `requests` 里的编排账本行是语义状态（例如 `dispatch:<t>:<e>` 的 `done` 决定"本轮是否已派"，`…:delivered:<目标>` 决定重跑行为），不是日志。只有"任务已终态、且对应 `task_done` 已收尾"的行才允许以后清理；本阶段不清理。`CallLog` 与 gate 输出文件按遥测处理，按天删除（7 天）。`task_log` 本阶段不清理。

## 7. 身份、通知与画面检查

### 7.1 调用方是谁（逻辑地址）

`resolveActor` 的顺序：

1. 显式 `--as <addr>` → 地址就是它，标记为**显式**。
2. 否则读 `ORCA_TERMINAL_HANDLE`（第 2 节事实 5）：`terminal list --include-visual-layouts`，找到这个 handle 的终端，取它的标签页标题；标题是注册表里已登记的岗位地址 → 就是调用方地址，标记为**隐式**，调用方自己的 handle 就是这个环境变量。
3. 都没有 → `actor_required`（只对需要身份的命令 `claim`/`start`/`done`/`release`/`list --mine`）；`create`/`reassign`/`escalate`/`resolve`/`recover` 解析不到时记为 `human`；`list`/`show`/`plan` 不需要身份。`actor_required` 的提示写明"在岗位终端里运行，或加 `--as <岗位地址>`；Windows 上未验证 Orca 是否设置 `ORCA_TERMINAL_HANDLE`"。

`wl up` 的启动命令保持阶段 1 的原样不变（不注入任何环境变量）。

### 7.2 某个地址的真实 handle

`resolveHandle(actor)`：**隐式** → `ORCA_TERMINAL_HANDLE`；**显式 `--as <addr>`** → 一律 `locatePost(addr)`，找不到 → `post_offline`。这条规则对所有需要 handle 的地方一视同仁（派发目标、`done` 上报用的 `--from`）。

### 7.3 派发与通知

所有派发一律**不带 `--inject`**（第 3 节约束 9）。派发成功后，按目标是谁决定怎么让对方知道：

- **派给自己**（目标 handle 等于 `ORCA_TERMINAL_HANDLE`）：命令输出本身就告诉了它任务内容，`delivery = 'self'`。
- **派给别人**：经第 7.4 节画面检查后，用阶段 1 `wl send` 的同一条底层路径（`terminal send --text … --enter --wait-submit 10`）发一行通知：

  ```
  [雁阵] 你有新任务 <task_id>：<标题>。查看：wl task show <task_id>；完成后运行：wl task done <task_id>（不要直接用 orca orchestration send 上报）
  ```

  - 画面检查通过且回执有 `turn_started` → `delivery = 'notified'`；只有 `input_accepted` → `'notified_unconfirmed'`（不重发）；画面检查不通过或拿不到画面 → 不打字，`'not_notified'`，结果里带原因（`at_prompt`/`screen_unknown`），命令输出提示调用方在对方空闲后用 `wl send` 补一句。
  - 通知失败从不让派发失败：派发已经落地，通知只是提醒。
- Orca 任务的 `--spec` 末尾固定追加同一句"完成后运行 `wl task done <id>`（不要直接用 orca orchestration send 上报）"，这样即使通知没送到，岗位从任何地方看到这个任务都知道该怎么收尾。
- **派发前的"岗位忙"检查**（第 2 节事实 11）：派发前用本轮已经要做的那次 `task-list` 看目标 handle 是否已是某个 `dispatched` 任务的 assignee。是 → 不调用 `dispatch`。`start` 报 `post_busy`（退出码 1，提示"岗位手上已有进行中的任务 <id>，先 `wl task done` 或 `wl task release`"）；`create --post` 与连接派发记 `delivery = 'queued'`（任务已归属目标、仍是 `ready`），并经画面检查发一行"[雁阵] 你有排队任务 <id>：<标题>，手上的任务完成后运行 wl task start <id>"。万一检查与派发之间对方刚好接了别的任务，Orca 回 `runtime_error`（"already has an active dispatch"）——按第 9 节由 `request-show` 定案（`absent`，删行），本命令同样转为 `post_busy`/`queued`。

### 7.4 往岗位终端打字之前的画面检查

`screenGuard(handle) → 'clear' | 'at_prompt' | 'shell' | 'unknown'`（终端不存在时另报 `offline`），2A 与 2B 共用同一个函数：

1. `terminal show --terminal <handle>`，取 `preview` 的最后 8 行。终端不存在 → 调用方按 `post_offline` 处理；`preview` 为空或调用失败 → `unknown`。
2. 任何一行命中下列任一模式 → `at_prompt`（大小写不敏感）：`\(y/n\)`、`\[y/n\]`、`\(yes/no\)`；以 `❯`/`>`/`›` 加数字加 `.`/`)` 开头的编号选项行；`Do you want to`、`Would you like to`、`Allow `、`Approve`、`Press Enter`、`Esc to cancel`、`trust (this|the) (folder|files|directory)`、`Continue\?`、`\?\s*$`（以问号结尾的行）。
3. 没有命中上面的任何模式，且**最后一个非空行像 shell 提示符**（以 `$`、`%`、`#` 结尾，或形如 `PS …>`，或 cmd.exe 的 `C:\…>`）→ `shell`：agent 已经退出、终端回到了 shell，这时打字加回车等于执行命令（复审五 I-1）。`❯`/`>` 结尾（不带盘符）不算，它们是 agent TUI 的输入行，仍判 `clear`。
4. 否则 → `clear`。

**插进通知里的外来文本一律中和 shell 元字符**：任务标题、2B 转述的 worker 原话，在清洗控制字符之外，把 `` ` ``、`$`、`;`、`|`、`&`、`<`、`>`、`\` 换成全角对应字符（`neutralize()`，与 `screenGuard` 放在同一个模块）。画面检查漏判时，打进去的也只是一行无害的文字。

只有 `clear` 才打字：`notifyPost` 遇到 `at_prompt`、`shell`、`unknown`、`offline` 一律不打。这是宁可漏发也不误答的启发式：漏判（画面是提示但没命中模式）会把文字打进提示，所以模式表偏宽；误判只是少发一条通知。R6 的实例（启动命令被 shell 别名展开、停在 `(Y/n)`）命中第一条；R6 那个画面的第一行就是 shell 提示符，若 agent 已退出只剩这一行，第 3 条把它判为 `shell`。模式表放在一个常量里，附带单元测试覆盖 R6 记录的两种画面（`test/fixtures/receipts/orchestration-r6.json` 的 `terminal-show-at-yn-prompt` 应为 `at_prompt`，`terminal-show-idle-claude` 应为 `clear`）。

## 8. 任务状态机

状态就是 Orca 原生的五种；雁阵本地只多记"主人"（`claimed_by`）和"第几轮"（`epoch`）：

```
(不存在)
   │ wl task create [--post X]
   ▼
ready ──────────────────────────────────────────────┐
   │ wl task claim（本地写 claimed_by，不调 Orca）     │ create --post X / 连接派发
   │ wl task release（清空）/ reassign（改主人）        │（claimed_by=X；X 忙则排队，仍是 ready）
   ▼                                                  │
ready + claimed_by=X                                  │
   │ wl task start（plan_first、岗位忙检查 → 派发）    │
   └──────────────────────┬───────────────────────────┘
                          ▼
                     dispatched ───────────── assignee 终端被关闭（Orca 自动）──→ ready（claimed_by 不变）
                          │                    assignee 已死但任务仍 dispatched ──→ wl task recover
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
     wl task escalate（任意未终态时刻）：dispatched/ready → blocked（正在进行的 dispatch 被结束）
```

- 每个岗位终端同时最多一个 `dispatched` 任务（事实 11）；`claimed_by` 可以有多个 `ready` 任务排队。
- `epoch`：每当一个任务**在上一轮派发已经结束之后再次被派发**（`resolve` 之后、终端关闭自动回 `ready` 之后、`recover` 之后），`epoch + 1`。`done` 的判定和后续步骤按 `(task_id, epoch)` 归档。若上一轮的判定是 `escalate`，新一轮开始时 `gate_failures` 清零。
- 没有"放弃"状态：不想继续的任务就不 `resolve`，让它停在 `blocked`。

## 9. 编排写调用的幂等账本

### 9.1 P1：有稳定本地键

用于一切"中途崩溃/超时后必须能安全重试"的调用。

1. 调用前查 `requests` 里这个键：
   - 没有 → 生成 `crypto.randomUUID()`，连同**完整调用参数**以 `pending` 写入（`ON CONFLICT DO NOTHING` 后再读回）。
   - 已 `done` → **不调用 Orca**，直接返回存下的结果。
   - `pending`/`uncertain` → 用存下的 id 和参数原样调用（Orca 要么回放，要么第一次真正执行）。**派发行例外：** 存下的 `--to` 已不在存活终端里时，先走第 3 步的 `request-show` 定案，`absent` 时按当前目标 handle 重建参数、换新 id（复审四 A-I1；否则不带 `--inject` 的重放会把任务派给死终端，事实 3）。
2. 调用结果：
   - 成功 → 记 `done`，存映射后的结果（子任务 id、gate id、`dispatchId` 等，不存整份回执）。
   - `consumer_fenced` → 原调用从未落地（事实 7、10）：`run-show` 刷新 `teams.coordinator_handle`，**换新 id**、按当前状态重建参数，更新这一行，再调用一次（只重试一次）。
   - **其余一切失败**（Orca 明确报错、四个传输层错误码、`orca_timeout` 等不确定类、回执无法解析）→ 第 3 步。
3. **用 `request-show --request <id>` 定案**（事实 10）：
   - `completed` 且回执是成功回执 → 按成功处理（记 `done`，结果取自回执）。这一分支覆盖"上次超时、其实已经落地"的全部情形，不再依赖错误码猜测。
   - `completed` 且回执是被记下的拒绝（如被拒的 `worker_done`）→ 这个 id 已经用掉、只会永远拿回同一个拒绝：**删除这一行**，原错误上抛（退出码 2）。下次重跑换新 id、按当时状态重建参数。
   - `absent` → 视为没有落地：**删除这一行**；原错误若是 Orca 明确报错 → 退出码 2；若是传输/不确定类 → 退出码 3，提示"原样重跑同一条命令即可"。下次重跑换新 id。
   - `pending` → 原调用还没结束：记 `uncertain`，id 与参数保留，退出码 3，提示"稍后原样重跑同一条命令"。
   - `request-show` 本身失败（运行时不可达等）→ 记 `uncertain`，保留，退出码 3。
4. 回放回执是旧快照（事实 7），凡是要依据当前状态做决定的地方另查 `task-list`，不信回执里的状态字段。

`absent` 有一个已知盲区：Orca 会清理旧回执，"很久以前落地、回执已被清理"也报 `absent`。账本行只在命令执行期间与随后的人工重跑中被重放，间隔通常是分钟级；清理周期未知，列入第 14 节风险。

### 9.2 P2：以 id 为键（没有稳定本地实体）

只有两处：`wl task create` 的 `task-create`、`wl task escalate` 的 `gate-create`（两次独立调用本来就应该建出两个对象）。每条命令使用命令行给的 `--retry-request <id>`，没给就生成新 UUID；账本键是 `oneshot:<id>`，之后完全按 P1 处理。人工重试时：

- 本地有 `oneshot:<id>` 这一行 → 原样重放首次落盘的参数，**含首次的 `--from`**（协调者在两次尝试之间被换过时，原参数重放会回放已落地的调用，或被 `consumer_fenced` 证明没落地 → 换新 id 用当前协调者重发）。命令行这次给出的其余参数（标题、tags、`--parent`、理由文本）若与落盘的不同（不比较 `--from`）→ `retry_request_args_changed`（退出码 1），提示"这个 id 上一次用于另一组参数；要新建就去掉 `--retry-request`"。
- 本地没有这一行（换了机器、注册表丢失）→ **先 `request-show --request <id>`**：`completed` 且成功 → 直接采用回执（写本地行为 `done`，补写 `task_ext` 等本地记录）；`completed` 且是拒绝、或 `absent` → 按当前状态推导参数正常调用；`pending` → 退出码 3。这样不再需要第四次修订里的 `retry_request_mismatch` 分支。
- 超时类失败的错误提示带上这次用的 id：`wl task create <同样的参数> --retry-request <id>`。

### 9.3 各调用用哪种

| Orca 调用 | 发起者 | 账本键 | 模式 |
| --- | --- | --- | --- |
| `run-create` | `wl up` | `<team>:run-create` | P1 |
| `run-use`/`run-list`/`run-show` | `wl up`、调度员、`wl task` | — | 不带 id（值覆盖或只读） |
| `task-create` | `wl task create` | `oneshot:<id>` | P2 |
| `dispatch` | `create --post`、`start`、连接派发、`recover` | `dispatch:<task>:<epoch>` | P1 |
| `send worker_done` | `wl task done` | `done:<task>:<epoch>:report` | P1 |
| `task-create`（子任务） | `wl task done` | `done:<task>:<epoch>:link:<目标地址>` | P1，每个目标一行 |
| `gate-create` | `wl task done`（escalate） | `done:<task>:<epoch>:gate` | P1 |
| `gate-create` | `wl task escalate` | `oneshot:<id>` | P2 |
| `gate-create` / `gate-resolve` | `wl task recover` | `recover:<task>:<dispatch_id>:gate` / `…:resolve`（另有本地记录 `recover:<task>:open`） | P1 |
| `gate-resolve` | `wl task resolve` | `resolve:<gate_id>` | P1 |
| `request-show` | 账本定案 | — | 只读 |
| `check`/`check --ack`/`reply` | 调度员（2B） | — | 见 2B |

### 9.4 派发与 `epoch`

所有派发走同一个内部步骤 `dispatchTo(task, 目标地址)`。账本行 `dispatch:<task>:<epoch>` 存的结果是 `{ dispatchId, dispatchedAt }`；通知结果（`delivery`）不存在这一行里，见下。**本轮派发是否已经完成，以这一行为准，不按任务此刻的状态再推一遍。**

1. 读 `task_ext.epoch` 得到键；`task-list --run` 取任务此刻的状态与全部 `dispatched` 任务的 assignee（同一次调用，供"岗位忙"检查用）。
2. 按这个键的状态分支：
   - 已 `done`，任务此刻是 `ready` → 本轮派发已经结束（`resolve`、终端关闭自动回退、`recover`）：`bumpEpoch`（上一轮判定是 `escalate` 时同时 `gate_failures = 0`），写 `task_log`（`epoch_bump`），换新键，到第 3 步。**上一轮若留有未收尾的 `task_done`（例如上报被记下的拒绝、删行后人工 resolve 重开），同时把它收尾为 `result = { outcome: 'abandoned' }`**（复审五 C-2：否则它永远挂在 `--stale` 里，2B 的代为收尾还会把它和新一轮混在一起）。
   - 已 `done`，任务此刻是其他状态 → 本轮派发已经完成：直接返回存下的结果，不调用 Orca。
   - 没有行：任务此刻不是 `ready` → `task_not_open`；是 `ready` → 第 3 步。
   - `pending`/`uncertain` → 第 4 步（按第 9.1 节重放，含"`--to` 已死"的例外）。
3. 解析目标 handle（`locatePost`，找不到 → 调用方按 `skipped_offline`/`post_offline` 处理）；岗位忙检查（第 7.3 节）命中 → 返回 `queued`，不写账本行。
4. 经 P1 调用 `dispatch --task <id> --to <handle> --from <coordinator>`（**不带 `--inject`**）。成功后写 `task_ext.dispatched_at`、`task_log`（`start` 或 `queued` 之外的派发记 `start`）。
5. 若这次 `dispatch` 是回放（`mutation.replayed`，或由 `request-show` 定案为已落地），再查一次 `task-list`：任务 `dispatched` 给了目标 → 成功；任务是 `ready` → 回放的那次派发落地过、但已经结束了：`bumpEpoch` 后回到第 3 步重派一次（只此一次）；其他状态 → 返回回放的结果，不加 `epoch`。
6. 通知（第 7.3 节）在 `dispatchTo` 返回之后由调用方执行；连接派发的通知结果存进 `…:delivered:<目标>` 记录（第 10 节），`start`/`create --post` 的通知结果只出现在命令输出与 `task_log` 里。

`start` 自己在调用 `dispatchTo` 之前拦掉"任务已 `dispatched` 给另一个 handle"的情形（第 10 节）。

## 10. 命令

**通用前置：** 所有 `wl task` 命令（`list`/`show` 除外）先做一次 `orca status --json`（`runtime.reachable` 为假 → Orca 明确报错，提示 `orca open`，不写任何账本行）；然后 `loadTeamSpec(teams.spec_path)` 并比对 `specHash` 与 `teams.spec_hash`，不一致 → `team_spec_changed`（退出码 1，提示"`team.yaml` 在团队运行期间被改过；`wl down` 后重新 `wl up`"），文件不存在 → `spec_not_found`。

**锁：** 只有纯本地读改写的 `claim`、`plan`、`release`、`reassign` 在 `registry.withTeamLock(team, fn)` 内执行（立即失败，另一个进程持锁时 `team_busy`、退出码 1）。其余命令不持锁：Orca 自己的状态机加上第 9 节账本保证并发安全——两个进程同时 `wl task done` 同一个任务会收敛到同一个判定、同一组调用；但两个进程都会各自跑一次 gate，失败时计数可能多加一次（可接受，`task_log` 里看得到两条 `gate_failed`）。

**`wl task create <team> --title <t> [--post <addr>] [--tags a,b] [--parent <id>] [--as <addr>] [--retry-request <id>]`**

前置：`teams.coordinator_handle` 已建立，否则 `run_not_ready`。`task-create --spec "<调用方地址或 human>: <title>\n\n完成后运行 wl task done <id>（不要直接用 orca orchestration send 上报）" --task-title <title> --run <run_id> --from <coordinator_handle> [--parent <id>]`（P2；spec 里的"完成后运行"一句在任务 id 未知前用占位写法"`wl task done <本任务 id>`"）。本地插入 `task_ext`（`kind = work`，`tags`，`ready_since = now`；给了 `--post` 时 `claimed_by = <post>`），`task_log`（`create`）。给了 `--post`：`dispatchTo(新任务, post)`（人工直接指派视为已同意跳过 `plan_first`），按第 7.3 节通知；目标忙 → `queued`。

`--post` 的派发超时：任务已建好、`task_ext` 已写，错误提示给出"`wl task create <同样的参数> --retry-request <本次 id>`"——重跑时 `oneshot:<id>` 已 `done`，直接拿回同一个任务，`dispatch:<task>:0` 要么回放要么第一次执行。

**`wl task list [team] [--mine] [--status s] [--tags a,b] [--stale] [--as <addr>] [--json]`**

`task-list --run <run_id>`，与 `task_ext` 按 id 合并，再过滤。`--mine` 按 `claimed_by = <调用方地址>` 过滤。`--tags` 是纯交集过滤。

`--stale`（吸收项 B-1、B-2、B-7）列出需要人或主人处理的任务，每条带原因和一条可直接复制的处理命令：

| 原因 | 判定 | 处理命令 |
| --- | --- | --- |
| `done_unfinished` | **当前 `epoch`** 的 `task_done` 有行但 `finished_at` 为空 | 原样重跑 `wl task done <id> --as <post>` |
| `call_uncertain` | 该任务相关的账本行为 `pending`/`uncertain` 且超过 1 分钟 | 重跑写在行里的那条命令（`wl task start`/`done`/`resolve`/`recover`） |
| `dead_assignee` | `dispatched` 且 `assignee_handle` 不在存活终端里 | `wl task recover <id>` |
| `owner_idle` | `ready`、有 `claimed_by`、主人手上没有 `dispatched` 任务、`ready_since` 超过 `patrol.owner_idle_minutes`（2B 字段，缺省 30）分钟 | `wl task start <id> --as <owner>`，或 `release`/`reassign` |
| `bypassed` | `completed`/`failed`、`kind = work`、`result.provenance = worker_report`，且本地没有该 `(task, 当前 epoch)` 的 `task_done` 行 | `wl task done <id> --as <owner>`（补跑 gate 与连接，见下） |
| `blocked_waiting` | `blocked` 且本地 `gates` 有对应行 | `wl task resolve <gate_id> --resolution …` |

这些判定写成一个纯函数 `staleReasons(tasks, terminals, local, now, thresholds)`（输入是一次 `task-list`、一次 `terminal list` 与本地表），2B 的巡查扫描与 `wl attention` 复用同一个函数。

**`wl task show <id> [--team <team>] [--history] [--json]`**

`task-list` 定位该任务，与 `task_ext` 合并；`result` 解析出 `outcome`/`reportedBy`。最近一次 `task_done.result` 里的"结束方式"（见 `done`）一并展示，例如"已转交给 <addr>""已送审给 <a>、<b>"。`--history` 列出 `task_log` 中该任务的全部记录（时间、谁、显式/隐式、动作、细节）。

**`wl task claim <id> [--as <addr>]`**

前置：任务 `ready` 且 `claimed_by` 为空；调用方可解析；该岗位 `self_claim = true`（否则 `self_claim_disabled`）；任务 `tags` 为空或与岗位 `tags` 有交集（否则 `tags_mismatch`）。`withTeamLock` 内写 `claimed_by`、`task_log`，不调用 Orca。

**`wl task release <id> [--as <addr>]`**（吸收项 B-3）

前置：`claimed_by = <调用方地址>`（否则 `not_claimed_by_you`）；任务 `ready` 或 `blocked`（`dispatched` → `task_dispatched`，提示"先 `wl task escalate <id>` 收回派发，或完成后 `wl task done`"）。清空 `claimed_by`，写 `ready_since = now`、`task_log`。不调用 Orca。

**`wl task reassign <id> --to <addr> [--as <addr>]`**（吸收项 B-3）

任何人可调用（调用方解析不到记为 `human`）。目标必须是本团队岗位（`post_unknown`）。任务 `ready`/`blocked` → 改 `claimed_by`、写 `ready_since`（仅 `ready`）、`task_log`，经画面检查给新主人发一行"[雁阵] 任务 <id> 转给了你：<标题>，运行 wl task start <id>"；`dispatched` → `task_dispatched`，提示同上；终态 → `task_terminal`。不调用 Orca 的写命令。

**`wl task start <id> [--as <addr>]`**

前置：`claimed_by = <调用方地址>`（否则 `not_claimed_by_you`）；`plan_first = true` 且无 plan → `plan_required`；任务已是 `blocked`/`completed`/`failed`，或已 `dispatched` 给**另一个** handle → `task_not_open`。任务已派给调用方自己的终端 → 直接返回成功（重跑 `start` 是无操作）。通过：`dispatchTo(任务, 调用方地址)`；岗位忙 → `post_busy`。`--as` 指向别的岗位时按第 7.3 节通知该岗位。

**`wl task plan <id> "<text>"`**

纯本地：`withTeamLock` 内写 `task_ext.plan`、`task_log`；任务 `completed`/`failed` → `task_terminal`。不校验身份。

**`wl task done <id> [--as <addr>]`**

返回 `DoneResult`：

```ts
{ outcome: 'done' | 'gate_failed' | 'escalated' | 'gate_failed_after_bypass'
  closure?: { kind: 'completed' | 'handed_to' | 'sent_for_review' | 'escalated'; targets?: string[] }  // 结束方式（吸收项 B-6）
  linkedTasks?: Array<{ target: string; taskId: string
    delivery: 'notified' | 'notified_unconfirmed' | 'not_notified' | 'self' | 'queued' | 'skipped_frozen' | 'skipped_offline' }>
  gateId?: string
  gateOutputPath?: string
  replayed?: boolean }   // 这一轮早已全部完成，本次只是报告存下的结果
```

执行步骤：

1. 解析调用方地址（7.1）；`task_ext.claimed_by` 必须等于它（否则 `not_your_task`）。
2. 查 `task_done(task_id, epoch)`：
   - 有且 `finished_at` 非空 → 直接返回存下的 `result`，`replayed: true`，退出码与第一次相同。
   - 有但未完成 → 跳到第 4 步，**不重跑 gate**。
   - 没有 → 第 3 步。
3. 判定。`task-list` 里任务：
   - `dispatched`：assignee 必须等于上报者 handle（7.2，否则 `not_dispatched_to_you`）。执行 gate（没有配置视为通过）。
   - `completed`/`failed` 且 `result.provenance = worker_report`、本地没有本轮 `task_done`（**岗位绕过 `wl` 直接上报**）：写 `task_log`（`bypass_detected`），照常执行 gate，判定记为 `bypassed`；gate 通过 → 第 4 步只做连接（不上报，任务已终态）；gate 失败 → 不建 gate、不重开，返回 `gate_failed_after_bypass`（退出码 1），输出 gate 结果，经画面检查通知牵头岗"<post> 的任务 <id> 绕过 wl 直接上报，补跑 gate 失败，见 <路径>；要重开用 wl task escalate <id> --reopen"。
   - `ready`：`task_not_dispatched`，提示"上一轮派发已结束（终端被关闭或已 resolve），先 `wl task start <id>`"。
   - 其他：`task_not_dispatched`。
   gate 结果：
   - 通过 → 写 `task_done`：`verdict = passed`（或 `bypassed`）、`dispatch_id`、`report_from`、`body`。
   - 失败且 `gate_failures + 1 < max_gate_failures` → `gate_failures += 1`，`task_log`（`gate_failed`），返回 `gate_failed`，**不调用 Orca、不写 `task_done`**。
   - 失败且 `gate_failures + 1 >= max_gate_failures` → **同一个事务里** `gate_failures = n` 并写 `task_done`：`verdict = escalate`。
   然后读回 `task_done`（并发时以先落盘者为准）。
4. 按判定执行后续步骤，**每一步都是第 9 节 P1**，已完成的步骤直接取存下的结果：
   - `passed`：①上报 `send --type worker_done --outcome succeeded --task-id <id> --dispatch-id <task_done.dispatch_id> --subject "gate passed" [--body <task_done.body>] --run <run_id> --from <task_done.report_from>`（键 `…:report`）；②若该任务 `kind = work` 且岗位有 `reviewed_by`/`hands_to`，对**每个目标各自**：`task-create --spec "<评审|交接>（<目标>）：<原 id>\n\n完成后运行 wl task done …" --task-title "<评审：|交接：><原标题>" --parent <id> --run <run_id> --from <coordinator_handle>`（键 `…:link:<目标>`）→ 本地插入子任务 `task_ext`（`kind` 按连接类型，`claimed_by = <目标>`，`ready_since = now`）→ 目标被冻结（2B）则不派发、记 `skipped_frozen`；目标终端找不到则记 `skipped_offline`；否则 `dispatchTo(子任务, 目标)`，岗位忙记 `queued`，成功则按第 7.3 节通知并记通知结果。**每个目标的这一项（子任务 id + `delivery`）一确定就落一条本地记录**（`requests` 表，键 `done:<task>:<epoch>:delivered:<目标>`）；重跑时这个目标有记录就直接用记录里的结果，不再看子任务此刻的状态、不再查冻结或在线、不再调 `dispatchTo`。
   - `bypassed`（gate 通过）：只做上一条的②。
   - `escalate`：①上报 `worker_done --outcome failed`（`--subject "gate failed"`，键 `…:report`）——任务转 `failed`；②`gate-create --task <id> --question "连续 <n> 次 gate 失败（输出见 <gate 输出文件路径>）。resolve 后任务回到 ready：原岗位 wl task start 即重试；改派用 wl task resolve <gate> --reassign <地址>；不想继续就不要 resolve" --from <coordinator_handle>`（键 `…:gate`）——任务转 `blocked`；本地 `gates` 插入一行；③经画面检查尽力通知牵头岗一次"[雁阵] <post> 的任务 <id> 连续 <n> 次 gate 失败，已转人工决策：wl task resolve <gate_id> …"（失败只记 `deps.warn`，吸收项 B-4）。**顺序只能是先上报后建 gate**（gate 会先把 dispatch 结束掉，事实 3）。
5. 写 `task_done.result`（含 `closure`：`passed` 且无连接 → `completed`；有 `hands_to` → `handed_to` + 目标；有 `reviewed_by` → `sent_for_review` + 目标；`escalate` → `escalated`）与 `finished_at`，`task_log`（`done` 或 `escalate`），返回。

**只续跑模式（2B 用）：** `done` 的内部函数接受 `resumeEpoch`：只在 `task_done(task_id, resumeEpoch)` 存在且未收尾时从第 4 步继续；该轮没有判定、或 `resumeEpoch` 不等于当前 `epoch` → `verdict_missing`（退出码 1），**绝不进入第 3 步跑 gate**。2B 调度员代为收尾只用这个模式（复审五 C-2）。

**为什么一律"先上报、再做后续"：** 上报是唯一绑定"那个 dispatch、那个终端"的调用，越早落地越不容易因为终端被关而永远失败；若上报失败，还没有任何子任务被建出来。上报落地后中途退出留下的"已上报、未收尾"由 `task_done.finished_at` 为空标识，`wl task list --stale` 会列出（`done_unfinished`），2B 调度员会代为重跑（2B spec）。

**gate 的执行：**

- **目录：** 岗位 worktree 的根目录。`posts[].worktree` 是 `path:<绝对路径>` 时直接用；是其他选择器时用 `orca worktree show --worktree <sel> --json` 读出路径；读不出 → `gate_cwd_unknown`（退出码 1），**不退回调用进程的当前目录**（lead 用 `--as` 代跑时，当前目录是 lead 的 worktree）。
- **超时：** `budgets.task.gate_timeout_seconds`（默认 600）。超时杀掉整个进程树（POSIX 用进程组，Windows 用 `taskkill /T /F /PID`），计为一次失败，输出末尾追加"（gate 超时，已终止）"。
- **输出：** 完整输出写入 `~/.wingline/logs/<team>/gate-<task_id>-<epoch>-<n>.txt`（7 天后清理）。`--body` 取输出**末尾** 4000 字符；`deps.multilineSafe` 为假且含换行时，`--body` 只放一行"gate 输出见 <路径>"。`body` 在判定时就定下并落盘，重跑不变。CLI 退出码：`done` → 0；`gate_failed`/`escalated`/`gate_failed_after_bypass` → 1；`uncertain` → 3。

**`wl task escalate <id> --reason <text> [--reopen] [--retry-request <id>]`**

人工（调用方解析不到岗位）、任务主人或牵头岗可调用，其他岗位 → `not_your_task`。任务 `completed`/`failed` → 需要 `--reopen`（否则 `reopen_required`，提示"已终态的任务 escalate 后 resolve 会回到 ready，会在新的一轮重新走 gate 与连接"；对 `completed` 任务 `gate-create` 的行为未验证，见第 14 节）。`gate-create --task <id> --question <reason> --from <coordinator_handle>`（P2），本地 `gates` 插入一行、`task_log`（`escalate`），经画面检查尽力通知牵头岗。任务若是 `dispatched`，正在进行的 dispatch 被 Orca 结束，岗位之后的 `wl task done` 会失败——输出里写明这一点。

**`wl task resolve <gate_id> --resolution <text> [--reassign <addr>]`**

`gate-resolve --id <gate_id> --resolution <text> --from <coordinator_handle>`（P1，键 `resolve:<gate_id>`）。Orca 把任务放回 `ready`。`--reassign <addr>` 时本地把 `claimed_by` 改成 `addr`；目标岗位被冻结（2B）→ `post_frozen`，在调用 Orca 之前拒绝。写 `ready_since`、`task_log`。不自动派发。直接在 Orca 界面里 resolve 也一样有效（`epoch`/`gate_failures` 在下次派发时按 9.4 处理）。

**`wl task recover <id> [--as <addr>]`**（吸收项 B-2）

用于 `dispatched` 且 assignee 终端已不在存活列表里的任务（Orca 整个重启后、或派发落在一个随后被重建的终端上）。前置：任务 `dispatched` 且 assignee 不存活（否则 `assignee_alive`，退出码 1）。开始时先落一条本地记录 `recover:<task>:open`，存下**这次 recover 针对的 `dispatch_id` 与 `epoch`**；之后各步的键都用这两个值：`gate-create --task <id> --question "雁阵 recover：原派发对象已不存在"`（键 `recover:<task>:<dispatch_id>:gate`）→ `gate-resolve --id <gate> --resolution "recover"`（键 `…:resolve`）→ 任务回到 `ready` → `dispatchTo(任务, claimed_by)`（`epoch + 1`，主人忙则 `queued`）→ 删除 `recover:<task>:open`。**`recover:<task>:open` 存在时跳过前置检查、直接用记录里的值续跑**（复审五 I-7：中断可能发生在 `dispatchTo` 加了 epoch 之后，此时任务已是 `ready`/`dispatched`，按当前 epoch 找不到原来的键）。写 `task_log`（`recover`）。

## 11. 错误处理

沿用总纲 7.8 的四类退出码。

- 输入错误（退出码 1）：`verdict_missing`、`run_not_ready`、`run_ambiguous`、`task_not_found`、`self_claim_disabled`、`tags_mismatch`、`task_not_open`、`not_claimed_by_you`、`not_your_task`、`plan_required`、`post_busy`、`task_dispatched`、`task_not_dispatched`、`not_dispatched_to_you`、`task_terminal`、`reopen_required`、`assignee_alive`、`actor_required`、`post_unknown`、`gate_unknown`、`gate_cwd_unknown`、`links_conflict`、`links_unknown_post`、`links_self`、`links_cycle`、`gates_unknown_post`、`field_removed`、`team_spec_changed`、`spec_not_found`、`retry_request_args_changed`；以及 `done` 的 `gate_failed`/`escalated`/`gate_failed_after_bypass` 结果。
- Orca 明确报错（退出码 2）：经第 9.1 节第 3 步由 `request-show` 定案为"未落地"或"被记下的拒绝"后，原样附上 Orca 错误码，如 `inactive_dispatch`/`worker_identity_changed`（提示"这一轮派发已经不属于这个终端：先 `wl task show <id>`；若任务已回到 `ready`，`wl task start <id>`；若派给了已不存在的终端，`wl task recover <id>`"）、`run_lost`。
- **`consumer_fenced`** 不直接报给用户：按第 5.2 节刷新协调者后重试一次；重试仍被 fence 才报 Orca 错误。
- **结果不确定（退出码 3）**：`request-show` 为 `pending` 或本身失败，或原错误为传输/不确定类而 `request-show` 为 `absent`。P1 的提示是"原样重跑同一条命令"；P2 的提示带上这次用的 id。`wl up` 的 Run 建立步骤不确定时记为 `uncertain`、退出码 3。

## 12. 测试

| 层 | 范围 | 方法 |
| --- | --- | --- |
| 单元 | `spec/` 新字段校验（`links_self`、`links_cycle`、`field_removed`）；注册表新表、插入或更新、`bumpEpoch` 比较后更新；账本第 9.1 节第 3 步的五个分支与派发行"`--to` 已死"例外；P2 本地有行/无行两种重试；`screenGuard` 模式表；`commands/task/` 各命令分支（含 `release`/`reassign`/`recover`/`list --stale` 六类原因/`done` 的 bypassed 分支） | vitest，注入假 `OrcaClient`；gate 用 `node -e` |
| 契约 | `orchestration run-create/run-use/run-show/run-list/task-create/task-list/dispatch/send(worker_done)/gate-create/gate-resolve/request-show` 与 `terminal show` 的回执解析 | `test/fixtures/receipts/` 下的真实回执：`orchestration-r6.json`（R6，已入库）；另从 R3–R5 的探针输出补齐 `task-list`（含终态任务的 `result`）、`gate-create`/`gate-resolve`、`request-show` 三种状态、`run-list`，脱敏后入库（`spikes/out/` 被 git 忽略） |
| 集成 | `wl up` 建 Run → create/claim/start/done（含互评、两个评审目标、目标忙排队）→ escalate/resolve 重开 → recover → bypassed 补跑 | 假 `OrcaClient` |

**假 `OrcaClient` 必须模拟第 2 节实测到的 Orca 语义：** 调用方 id 账本（同 id 同参数回放、回放返回旧快照、同 id 不同参数 `request_mismatch`，账本检查在协调者校验与一切状态校验之前）；**`request-show` 返回 `completed`/`pending`/`absent`**；**被拒的 `worker_done` 记进账本，`consumer_fenced` 与 `inject_rejected` 不记**；协调者值匹配；`worker_done` 的 assignee 校验；`gate-create` 结束 dispatch / `gate-resolve` 回 `ready`；关闭 assignee 终端自动回 `ready`、之后派给死 handle 仍 `ok:true`；**一个终端一个进行中的派发（第二个回 `runtime_error`）**；终态任务不带 assignee；可注入故障："到不了运行时"（账本检查之前）、"调用前失败"（账本检查之后、执行之前）、**"已落地但返回传输错误"（四个传输码任选，执行之后）**、"已落地但返回超时"。

重跑安全至少由这些可执行的测试钉住：首次 `run-create` 已落地但返回 `runtime_timeout` → 重跑 `wl up` 不建第二个 Run；连接子任务 `task-create` 已落地但返回 `runtime_timeout` → 重跑不重复建；子任务 `dispatch` 已落地但返回 `runtime_timeout` → 重跑收尾成功、不报 `task_not_open`；上报已落地但返回 `runtime_timeout` → 重跑不重复上报、补完连接；上报被 `worker_identity_changed` 拒绝（记进账本）→ 行被删、退出码 2，问题修好后重跑换新 id 成功；派发行 `uncertain` 而目标终端被重建 → 重跑按新 handle 派发、不派给死终端；两个评审目标，一个目标的子任务派发超时、重跑前另一个目标已完成评审 → 重跑成功收尾；`create`/`escalate` 超时后协调者被换走，带 `--retry-request` 重试 → 只有一个对象；换了 `WINGLINE_HOME` 后带 `--retry-request` 重试 → `request-show` 取回已落地的对象；评审目标忙 → `queued`，目标完成手上任务后 `start` 成功。

不新增真机集成测试项目；发版前用 `spikes/` 下的探针脚本在真机复核第 2 节的事实。

## 13. 不做的事（阶段 2A）

- 不做调度员、后台轮询、自动提醒（阶段 2B）；"已上报未收尾""绕过直接上报"在 2A 只做发现与手动处理。
- 不做巡查信号；`escalated` 只是达到 `max_gate_failures` 后的被动结果。
- 不统计 token；`max_minutes` 只记录，不在 2A 判定。
- `consults` 只做记录。
- 不改变 `wl ps` 的输出。
- `resolve` 之后不自动派发；没有"放弃"状态（不 resolve 即停在 `blocked`）。
- 评审结论（通过/打回）不在本阶段建模：评审任务 `done` 就是评审做完了。接收方拒收、依赖阻塞自动解除、转手次数上限推迟到阶段 4。
- 不清理账本行与 `task_log`（第 6 节保留约定）。

## 14. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| **岗位不经 `wl task done`，直接用 Orca CLI 上报**（Orca 的 skill、agent 的习惯，或旧版本残留的 `--inject` 前言） | gate 不跑、连接不触发 | 2A 不再注入 Orca 前言；任务 spec 与通知都写明用 `wl task done`；`list --stale` 列出 `bypassed`，`wl task done` 可补跑 gate 与连接；2B 调度员看到"没有 `task_done` 的 `worker_done`"会通知人（2B spec） |
| **画面检查是启发式**：漏判会把通知打进对方的确认或选择提示，或打进已经回到 shell 的终端 | 替对方回答提示；在 shell 里执行一行文字 | 模式表偏宽、只有 `clear` 才打字、拿不到画面或像 shell 提示符就不打；插入的外来文本中和 shell 元字符；模式表有单元测试，R6 的真实画面入库为样本 |
| 阶段 1 的 `wl up` 启动包与 `wl send` 不经画面检查 | 首次启动时的"是否信任此文件夹"一类确认框可能被启动包的回车选中 | `wl up` 发启动包前改为先 `screenGuard`（重跑时 wait 步骤已完成也照样检查）：`at_prompt` → 该岗位结果 `uncertain`（原因"岗位停在确认提示上，处理后重跑 wl up"），不发；`shell` → 同样 `uncertain`（原因"岗位已退回 shell，处理后重跑 wl up"），不发（启动包含用户的 NORMS 与 brief 原文，在 shell 里会被逐行执行）；`unknown`（画面为空或读不出）照常发（刚启动的终端常常读不出画面）。`wl send` 是人显式要求的发送，保持不变 |
| **每次 Orca 整个重启都会让所有终端 handle 失效** | 岗位重启后无法对手头任务 `done` | 终端被关闭时 Orca 自动回退（事实 3）；重启后是否回退未验证，`wl up` 会列出 `dead_assignee` 任务并给出 `wl task recover <id>` |
| Orca 整个重启后旧 `coordinator_handle` 是否仍被接受未验证 | 2A 协调者调用失败 | 重启后下一次 `wl up` 按 5.2 节 `run-use` 到 lead 的新 handle |
| Orca 清理旧回执，`request-show` 对"很久以前落地"的调用也报 `absent` | 隔很久之后重跑一个曾经超时的命令，可能重复执行 | 账本行通常在分钟级内被重放；清理周期未知，若实测较短再加"行龄超过 N 小时的不确定行不自动重放、只提示人工核对" |
| `wl task done --as <post>` 从另一个终端代发 `worker_done` 只在 assignee 是占位进程时验证过 | 真实 agent 时可能 `worker_identity_changed` | 被拒会记进 Orca 账本（R5-2），`request-show` 定案后删行、退出码 2；岗位自己在终端里 `wl task done` 是主路径；脱身方法 `wl task recover` 或 `escalate` → `resolve` → `start` |
| `ORCA_TERMINAL_HANDLE` 在 Windows 上未验证 | Windows 上隐式身份不可用 | 提示里写明用 `--as`；实现阶段第一次在 Windows 跑时核对，结论写回 REPORT |
| 对 `completed` 任务 `gate-create` 的行为未验证 | `escalate --reopen` 可能失败 | 失败按 Orca 明确报错处理；实现前顺带补测 |
| gate 命令经 shell 执行（`team.yaml` 来自不可信来源时等于任意命令执行） | 本地代码执行 | 和 `launch` 一样，`team.yaml` 视为可信配置 |
| `coordinator_handle` 等同于该 Run 的"万能钥匙" | 注册表文件被其他用户读取时可伪造协调者调用 | 与 `state.db` 的文件权限同一信任边界 |
| `hands_to` 之后原任务显示为 `completed` | 看板可能误解为"真正做完" | `done` 记录结束方式，`show`/`list` 展示"已转交给 <addr>" |
| 账本行、`task_log` 长期累积 | 注册表变大 | 每行很小；按第 6 节保留约定，以后只清理已收尾任务的行 |
