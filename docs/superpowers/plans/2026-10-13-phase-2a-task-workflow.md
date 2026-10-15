# 雁阵阶段 2A（任务工作流）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 在已有的阶段 0+1 代码之上，实现 `team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、编排写调用的幂等账本（失败由 Orca 的 `request-show` 定案）、派发后的一行通知与"打字前画面检查"，以及借用 Orca 原生 `orchestration task-*/dispatch/gate-*` 的 `wl task` 命令族（含 `release`/`reassign`/`recover`/`list --stale`/`show --history`）。

**Architecture：** 任务状态机直接是 Orca 原生状态（`ready`/`dispatched`/`blocked`/`completed`/`failed`）。雁阵本地只加：`task_ext`（主人、标签、计划、轮次、失败计数、进入 ready 与派发的时间）、`task_done`（每轮 `done` 的终局判定）、`gates`（gate→团队/任务）、`task_log`（只追加的变迁记录）四张小表，以及给阶段 1 已有的 `requests` 表加两列，让编排写调用"先记 id 与完整参数、再调用、失败时问 Orca 落地了没有"。所有协调者专属调用用团队级缓存的 `coordinator_handle` 当 `--from`，被 fence 时 `run-show` 刷新。派发一律不带 `--inject`，派发后由雁阵自己经画面检查发一行通知。

**Tech Stack：** TypeScript、vitest、`node:sqlite`（已用）、commander（已用）；不引入新运行时依赖。

**Spec：** `docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`（第五次修订，下称 spec）。实现者必须先读 spec 全文，尤其第 2 节（Orca 实测语义）、第 5 节（Run 与协调者）、第 7 节（通知与画面检查）、第 9 节（账本）、第 10 节 `done`。本计划的接口/字段/错误码均取自 spec；spec 留了开放选择时本计划在对应任务里注明决定。

> **修订历史（摘要）：** 2026-10-14 第二至四次修订按三轮复审与补充探针二至四同步 spec。
>
> **2026-10-15 第五次修订（本版）：** 按 spec 第五次修订（复审四 + 补充探针五、六）整体重写。要点：①账本（Task 4）删掉"新行/旧行 + 错误码白名单"，一切失败经 `request-show` 定案；`FakeOrca`（Task 3）把被拒的 `worker_done` 记进账本、能在"已落地之后"抛出四个传输码、模拟 `request-show` 与"一个终端一个进行中的派发"。②派发不带 `--inject`，删除 `INJECT_IDLE_WAIT_MS` 与 `delivery: 'injected'`；新增 Task 7 `screenGuard`/`notifyPost`。③删除 WIP 预算与 `wip_budget_exceeded`，改为 `post_busy`/`queued`。④`wl up` 增加 run-list 找回、`--adopt-run`/`--new-run`、`run_lost`、派给死终端的任务报告（Task 5）。⑤gate 在岗位 worktree 根目录执行、有超时、输出全量存文件（Task 8）。⑥新增 `release`/`reassign`/`recover`/`list --stale`/`show --history`、`task_log`、`bypassed` 判定与结束方式、通用前置（`status` + 规格哈希）。⑦新增契约测试任务（Task 15），回执 fixture 入库。

## Global Constraints

- Node ≥ 22.13；不新增运行时依赖。
- 子进程一律 `spawn(file, args, { shell: false })`，**唯一两个例外**：Windows `.cmd` 包装（阶段 1 已有）和 gate 命令执行（`shell: true`，严格限定在 `runGate`，spec 第 3 节约束 6；总纲 §2.4 已写明）。
- **任何派发都不带 `--inject`**（spec 第 3 节约束 9）。`OrcaClient.dispatch` 的签名里没有 `inject` 字段，`FakeOrca` 也不接受它。
- **往岗位终端里打字只能经 `notifyPost`**（Task 7），它先做 `screenGuard`。全仓库除阶段 1 的 `wl send`/启动包与 `notifyPost` 外，不允许新的 `terminalSend` 调用点（2B 也复用 `notifyPost`）。
- 退出码四分类沿用总纲 7.8：新增的输入类错误为 1；Orca 明确报错（经 `request-show` 定案为未落地或被记下的拒绝）为 2；结果不确定为 3（`uncertain`）。P1 提示"原样重跑同一条命令"，P2 提示带 `--retry-request <id>`（spec 第 9、11 节）。
- 规格哈希：新字段参与 `specHash`，沿用阶段 1 规则。
- CI 矩阵不变：`macos-latest`、`ubuntu-latest`、`windows-latest` × Node `22.13`、`24`。gate 测试一律 `node -e "..."`，通过环境变量传路径，不在命令字符串里嵌 Windows 路径。
- **编排写调用的幂等（spec 第 9 节）——每个调用点用哪种模式是固定的，测试断言必须与之一致：**

  | 调用 | 账本键 | 模式 | `retryRequest` |
  | --- | --- | --- | --- |
  | `runCreate`（`wl up`） | `<team>:run-create` | P1 | 总是带，来自账本 |
  | `runUse`/`runList`/`runShow`/`requestShow` | — | 不带 id | **不带**（签名里没有这个字段） |
  | `taskCreate`（`wl task create`） | `oneshot:<id>` | P2 | 总是带：`--retry-request` 参数或新 UUID |
  | `dispatch` | `dispatch:<task>:<epoch>` | P1 | 总是带 |
  | `workerDone` | `done:<task>:<epoch>:report` | P1 | 总是带 |
  | `taskCreate`（连接子任务） | `done:<task>:<epoch>:link:<目标>` | P1 | 总是带 |
  | `gateCreate`（`done` escalate） | `done:<task>:<epoch>:gate` | P1 | 总是带 |
  | `gateCreate`（`wl task escalate`） | `oneshot:<id>` | P2 | 总是带 |
  | `gateCreate`/`gateResolve`（`wl task recover`） | `recover:<task>:<epoch>:gate` / `…:resolve` | P1 | 总是带 |
  | `gateResolve`（`wl task resolve`） | `resolve:<gate>` | P1 | 总是带 |

  测试里对这些调用的精确断言要么写出 `retryRequest: expect.any(String)`，要么用 `toMatchObject` 只断言关心的字段；不允许出现"漏掉 `retryRequest` 的 `toEqual`"。
- 本计划同时改动若干**已提交的阶段 1 文件**，各任务的 Files 列表里逐个列出，包括会因此改断言的已有测试。
- 函数 ≤ 50 行；超过时按任务里给出的拆分点拆。

## Review Focus

1. **账本定案**：失败一律 `request-show`；`completed` 时同 id 重放一次取回 Orca 记下的结果（成功 → done；拒绝 → 删行、退出码 2）；`absent` 删行（明确报错 2、传输/超时 3）；`pending` 或查询失败保留、3；`consumer_fenced` 换 id 刷新协调者只重试一次；派发行 `--to` 已死时先定案再决定换目标 → Task 4。
2. **`wl task done` 重跑安全**：spec 第 12 节列出的每一条重跑测试都是 Task 12 里可执行的用例，尤其"已落地但返回 `runtime_timeout`"的四条与"被拒的上报记进账本"一条 → Task 12。
3. **不往提示里打字**：`screenGuard` 对 R6 两个真实画面的判定；`at_prompt`/`unknown` 时不调用 `terminalSend` → Task 7。
4. **一个终端一个派发**：派发前查忙，`start` → `post_busy`，`create --post`/连接 → `queued`；检查与派发之间对方接了别的任务时 Orca 的 `runtime_error` 被 `request-show` 定案为 `absent` 后同样转为忙 → Task 10、Task 12。
5. **协调者归属**：`wl up` 不把协调者从存活终端上拿走；写回只更新那一列 → Task 2、Task 5。
6. **连接触发规则与结束方式**：评审任务完成不再触发连接；`hands_to` 有环、指向自己被拒；`closure` 按判定与连接写入 → Task 1、Task 12。
7. **`bypassed`**：岗位绕过 `wl` 直接上报后 `wl task done` 能补跑 gate 与连接，gate 失败不重开 → Task 12。

---

## 文件结构

```text
packages/core/src/
  spec/schema.ts                 # 改：新字段 zod 定义；删除 RESERVED_*；field_removed
  spec/load.ts                   # 改：解析新字段；crossCheck 增加 links/gates 校验、links_self、hands_to 环检测
  spec/hash.ts                   # 改：新字段纳入 specHash
  registry/migrations.ts         # 改：第二个迁移（teams.coordinator_handle、requests 两列、task_ext、task_done、gates、task_log）
  registry/registry.ts           # 改：TeamRow.coordinatorHandle；RequestRow 扩展 + 账本方法；task_ext（插入或更新）/task_done/gates/task_log 方法
  orca/types.ts                  # 改：OrchestrationTask 等类型；OrcaClient 新增 13 个方法
  orca/client.ts                 # 改：实现上面 13 个方法
  commands/deps.ts               # 改：CommandDeps.env；requestId 注释限定为 terminal 命令族
  commands/up.ts                 # 改：posts 循环后建立/找回/保持 Run；派给死终端的任务报告
  commands/task/ledger.ts        # 新：ledgered / oneShot / refreshCoordinator / settle
  commands/task/identity.ts      # 新：resolveActor / requireActor / resolveHandle / isOwnTerminal
  commands/task/notify.ts        # 新：screenGuard / PROMPT_PATTERNS / notifyPost（2B 复用）
  commands/task/gate-exec.ts     # 新：runGate（唯一的 shell:true 子进程）、gateCwd
  commands/task/preflight.ts     # 新：taskPreflight（status + 规格哈希）
  commands/task/query.ts         # 新：TaskRow、mustTeamReady、fetchTasks、findTask、findTaskAnywhere、listTasks、showTask、staleReasons
  commands/task/log.ts           # 新：logTask（写 task_log 的唯一入口）
  commands/task/dispatch.ts      # 新：dispatchTo（P1 派发、epoch、忙检查）、deliver（派发 + 通知）
  commands/task/create.ts        # 新：createTask
  commands/task/plan.ts          # 新：planTask
  commands/task/claim.ts         # 新：claimTask / releaseTask / reassignTask
  commands/task/start.ts         # 新：startTask
  commands/task/done.ts          # 新：doneTask
  commands/task/escalate.ts      # 新：escalateTask、resolveGate、recoverTask
  index.ts                       # 改：导出 commands/task/*
packages/cli/src/
  cli.ts                         # 改：wl task 子命令；wl up --adopt-run/--new-run；defaultMakeDeps 填 env；exitCodeOfUp 考虑 run 步骤
  output.ts                      # 改：task 渲染；renderUp 输出 run 步骤与死终端任务报告
packages/core/test/
  spec/load.test.ts, spec/hash.test.ts          # 改
  registry/registry.test.ts                     # 改：TeamRow 常量补 coordinatorHandle；getRequest 断言补两列；新表用例
  commands/down.test.ts, send.test.ts, ps.test.ts   # 改：TeamRow 字面量补 coordinatorHandle: null
  commands/up.test.ts                           # 改：已有用例 'fresh up does create → wait → brief per post' 的两处断言；新增 run 步骤用例
  commands/fake-client.ts                       # 改：FakeOrca 编排模型、seedRunningTeam、mkDeps 默认 env
  commands/fake-client.test.ts                  # 新：钉住 FakeOrca 的实测语义
  orca/client.test.ts                           # 改：13 个方法的 argv/映射用例
  orca/contract.test.ts                         # 新：真实回执解析（Task 15）
  commands/task/*.test.ts                       # 新：ledger、identity、notify、gate-exec、query、dispatch、create、claim-start、done、escalate、flow
test/fixtures/receipts/                         # 改：补齐 orchestration 回执（Task 15）
packages/cli/test/
  main.test.ts                                  # 改：up 的 Run 步骤退出码用例（Task 5）；wl task CLI 用例（Task 14）
```

> 任务命令放在 `commands/task/` 子目录：文件多、彼此共享 `mustTeamReady`/`resolveActor`/`dispatchTo`/账本/`notifyPost` 这类专属逻辑。测试目录镜像同样结构。

---

### Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first

**Files:**
- Modify：`packages/core/src/spec/schema.ts`、`packages/core/src/spec/load.ts`、`packages/core/src/spec/hash.ts`
- Modify：`packages/core/test/spec/load.test.ts`、`packages/core/test/spec/hash.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export interface PostSpec {
    id: string; agent: string; model?: string; launch: string; worktree: string; briefPaths: string[]
    selfClaim: boolean; tags: string[]; planFirst: boolean
    gate: string | null      // gates[post.id] ?? null
    reviewedBy: string[]     // links[post.id].reviewed_by ?? []
    handsTo: string[]        // links[post.id].hands_to ?? []
  }
  export interface TaskBudgets { maxGateFailures: number; gateTimeoutSeconds: number; maxMinutes: number | null }
  export interface TeamSpec { /* 原有字段 */ budgets: { task: TaskBudgets } }
  ```
  2B 计划 Task 6 在 `TeamSpec` 上再加 `patrol`，不改这里的字段。

- [ ] **Step 1：写失败测试**

```ts
// load.test.ts：删除"保留字段被拒绝"的 test.each 与 'reserved post field is rejected with its phase' 两个用例，替换为：
test('post defaults: self_claim/tags/plan_first/gate/links', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).posts[0]).toMatchObject({ selfClaim: false, tags: [], planFirst: false, gate: null, reviewedBy: [], handsTo: [] })
})
test('parses self_claim/tags/plan_first/gates/links', () => {
  const y = DUO_YAML.replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    self_claim: true\n    tags: [backend]\n    plan_first: true')
    + 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    consults: [builder]\ngates:\n  builder: pnpm test\n'
  expect(loadTeamSpec(mkTeam(y)).posts[0]).toMatchObject({ selfClaim: true, tags: ['backend'], planFirst: true, gate: 'pnpm test', reviewedBy: ['checker'] })
})
test('task budgets default to 3 / 600 / null; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).budgets).toEqual({ task: { maxGateFailures: 3, gateTimeoutSeconds: 600, maxMinutes: null } })
  const y = DUO_YAML + 'budgets:\n  task:\n    max_gate_failures: 2\n    gate_timeout_seconds: 30\n    max_minutes: 240\n'
  expect(loadTeamSpec(mkTeam(y)).budgets).toEqual({ task: { maxGateFailures: 2, gateTimeoutSeconds: 30, maxMinutes: 240 } })
})
test('the removed budgets.team.max_in_progress_per_post → field_removed with the reason', () => {
  const y = DUO_YAML + 'budgets:\n  team:\n    max_in_progress_per_post: 3\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'field_removed', message: expect.stringContaining('一个进行中的派发') }))
})
test('reviewed_by + hands_to on the same post → links_conflict', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [checker]\n    hands_to: [checker]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_conflict' }))
})
test('unknown post id in links or gates is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  builder:\n    reviewed_by: [ghost]\n'))).toThrow(expect.objectContaining({ code: 'links_unknown_post' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'links:\n  ghost:\n    reviewed_by: [checker]\n'))).toThrow(expect.objectContaining({ code: 'links_unknown_post' }))
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'gates:\n  ghost: pnpm test\n'))).toThrow(expect.objectContaining({ code: 'gates_unknown_post' }))
})
test.each(['reviewed_by', 'hands_to', 'consults'])('a post linking to itself via %s → links_self', (k) => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + `links:\n  builder:\n    ${k}: [builder]\n`))).toThrow(expect.objectContaining({ code: 'links_self' }))
})
test('mutual reviewed_by is allowed (review tasks do not trigger links)', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n'
  expect(() => loadTeamSpec(mkTeam(y))).not.toThrow()
})
test('a hands_to cycle is rejected and names the posts on it', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    hands_to: [checker]\n  checker:\n    hands_to: [builder]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_cycle', message: expect.stringMatching(/builder.*checker|checker.*builder/) }))
})
// hash.test.ts
test('hash changes when tags/gate/links/budgets change', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const withTag = specHash(loadTeamSpec(mkTeam(DUO_YAML.replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    tags: [backend]'))))
  const withGate = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'gates:\n  builder: pnpm test\n')))
  const withBudget = specHash(loadTeamSpec(mkTeam(DUO_YAML + 'budgets:\n  task:\n    gate_timeout_seconds: 30\n')))
  expect(new Set([base, withTag, withGate, withBudget]).size).toBe(4)
})
```

- [ ] **Step 2：运行确认失败** — `pnpm vitest run packages/core/test/spec` → FAIL。
- [ ] **Step 3：实现。**
  - `schema.ts`：`postSchema` 加 `self_claim: z.boolean().default(false)`、`tags: z.array(z.string().regex(ID)).default([])`、`plan_first: z.boolean().default(false)`；`teamSchema` 加 `links: z.record(z.string(), z.object({ reviewed_by: z.array(z.string()).optional(), hands_to: z.array(z.string()).optional(), consults: z.array(z.string()).optional() }).strict()).default({})`、`gates: z.record(z.string(), z.string().min(1)).default({})`、`budgets: z.object({ team: z.unknown().optional(), task: z.object({ max_gate_failures: pos.default(3), gate_timeout_seconds: pos.default(600), max_minutes: pos.optional() }).strict().default({}) }).strict().default({})`（`pos = z.number().int().positive()`）；删除 `RESERVED_TOP`、`RESERVED_POST`。
  - `load.ts`：删除 `rejectReserved`；`budgets.team` 存在（不论内容）→ `at.fail('field_removed', ['budgets', 'team'], 'budgets.team.max_in_progress_per_post 已取消：Orca 限定每个岗位终端同时只有一个进行中的派发')`。`crossCheck` 新增：`links` 的键与每个 `reviewed_by`/`hands_to`/`consults` 元素不在 posts id 集合 → `links_unknown_post`；元素等于键 → `links_self`；同一键同时有 `reviewed_by` 与 `hands_to` → `links_conflict`；`gates` 键不在集合 → `gates_unknown_post`；`findHandsToCycle(links): string[] | null`（DFS 白/灰/黑三色，回溯出环上的 id）有环 → `links_cycle`，信息 `hands_to 形成环：a → b → a`。`loadTeamSpec` 给每个 post 填新字段，顶层填 `budgets.task`（`maxMinutes` 缺省 `null`）。
  - `hash.ts`：`normalised.posts` 每项加 `selfClaim`/`tags`/`planFirst`/`gate`/`reviewedBy`/`handsTo`，顶层加 `budgets`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/spec` → PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): parse links/gates/budgets/self_claim/tags/plan_first"`

---

### Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`、`task_log`

**Files:**
- Modify：`packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`
- Modify：`packages/core/src/commands/up.ts`（仅 `registerTeam` 里 `upsertTeam` 补 `coordinatorHandle: existing?.coordinatorHandle ?? null`）
- Modify（已提交的阶段 1 测试，只补字段）：
  - `packages/core/test/registry/registry.test.ts`：①文件顶部 `const team: TeamRow` 补 `coordinatorHandle: null`；②用例 `'request lifecycle and 16KB truncation'` 里 `expect(r.getRequest('a')).toEqual({ state: 'pending', receipt: null })` 改为 `toEqual({ state: 'pending', receipt: null, retryRequest: null, args: null, updatedAt: expect.any(String) })`——`getRequest` 多返回三个字段，`toEqual` 不会忽略它们。这是全仓库唯一一处对 `getRequest` 整个返回值做 `toEqual` 的断言（其余用法只读 `.state`/`.receipt` 或判 `null`）。
  - `packages/core/test/commands/down.test.ts`、`send.test.ts`、`ps.test.ts`（各自 `upsertTeam({...})` 字面量补 `coordinatorHandle: null`）

**Interfaces:**
- Produces：
  ```ts
  export interface TeamRow { name: string; specPath: string; specHash: string; runId: string | null; coordinatorHandle: string | null; status: 'up' | 'stopped' }
  updateCoordinatorHandle(team: string, handle: string | null): void   // 只 UPDATE 这一列（spec 第 5.2 节）
  setRunId(team: string, runId: string | null): void                   // 只 UPDATE 这一列

  export interface RequestRow { state: RequestState; receipt: string | null; retryRequest: string | null; args: string | null; updatedAt: string }
  getRequest(id: string): RequestRow | null
  openIntent(id: string, retryRequest: string, args: unknown): void    // INSERT … ON CONFLICT(id) DO NOTHING，state='pending'
  reissueIntent(id: string, retryRequest: string, args: unknown): void // UPDATE：换 id 与参数，state='pending'，receipt=NULL
  dropRequest(id: string): void
  listOpenRequests(prefix: string): Array<{ id: string; state: RequestState; updatedAt: string }>   // state IN ('pending','uncertain') AND id LIKE prefix||'%'

  export type TaskKind = 'work' | 'review'
  export interface TaskExtRow {
    taskId: string; team: string; tags: string[]; kind: TaskKind; plan: string | null; claimedBy: string | null
    epoch: number; gateFailures: number; readySince: string | null; dispatchedAt: string | null
  }
  insertTaskExt(row: { taskId: string; team: string; tags: string[]; kind: TaskKind; claimedBy?: string | null; readySince?: string | null }): void  // ON CONFLICT DO NOTHING
  getTaskExt(taskId: string): TaskExtRow | null
  /** 以下 setter 在行不存在时按默认值插入（INSERT … ON CONFLICT(task_id) DO UPDATE），team 由调用方给（spec 第 6 节）。 */
  setClaimedBy(team: string, taskId: string, claimedBy: string | null): void
  setPlan(team: string, taskId: string, plan: string): void
  incrementGateFailures(team: string, taskId: string): number
  setReadySince(team: string, taskId: string, at: string): void
  setDispatchedAt(team: string, taskId: string, at: string): void
  /** 比较后更新：UPDATE … SET epoch = epoch + 1[, gate_failures = 0] WHERE task_id = ? AND epoch = fromEpoch；返回此刻的 epoch（别人已加过时就是别人加后的值）。 */
  bumpEpoch(team: string, taskId: string, fromEpoch: number, resetGateFailures: boolean): number

  export type Verdict = 'passed' | 'escalate' | 'bypassed'
  export interface DoneVerdictRow {
    taskId: string; epoch: number; post: string; verdict: Verdict; gateFailures: number
    dispatchId: string; reportFrom: string; body: string | null; result: string | null; finishedAt: string | null; createdAt: string
  }
  /** 一个事务：已有行 → 直接返回它（先落盘者胜）；否则 verdict='escalate' 时同时 task_ext.gate_failures = row.gateFailures，再 INSERT。 */
  recordVerdict(row: Omit<DoneVerdictRow, 'result' | 'finishedAt' | 'createdAt'>): DoneVerdictRow
  getVerdict(taskId: string, epoch: number): DoneVerdictRow | null
  finishVerdict(taskId: string, epoch: number, result: unknown): void
  listUnfinishedVerdicts(team: string): DoneVerdictRow[]                 // finished_at IS NULL，staleReasons 用
  listVerdictsOf(taskId: string): DoneVerdictRow[]                       // staleReasons 的 bypassed 判定用

  recordGate(gateId: string, team: string, taskId: string): void        // ON CONFLICT DO NOTHING
  getGate(gateId: string): { team: string; taskId: string } | null
  listGates(team: string): Array<{ gateId: string; taskId: string }>

  export type ActorSource = 'explicit' | 'implicit' | 'human'
  export type TaskAction = 'create' | 'claim' | 'release' | 'reassign' | 'plan' | 'start' | 'queued' | 'notify' | 'gate_failed' | 'done' | 'escalate' | 'resolve' | 'recover' | 'epoch_bump' | 'bypass_detected'
  export interface TaskLogRow { id: number; team: string; taskId: string; epoch: number; at: string; actor: string; actorSource: ActorSource; action: TaskAction; detail: string | null }
  appendTaskLog(row: Omit<TaskLogRow, 'id' | 'at'> & { detail?: unknown }): void   // detail 为对象时 JSON.stringify
  listTaskLog(taskId: string): TaskLogRow[]                                         // 按 id 升序
  ```

- [ ] **Step 1：写失败测试**（`registry.test.ts`，沿用文件里已有的 `tmpDb()` 与 `team` 常量；涉及新表的用例先 `upsertTeam`——`team` 列有外键）

```ts
const running: TeamRow = { ...team, runId: 'run-1', coordinatorHandle: 'coord-1' }

test('teams round-trips coordinatorHandle; updateCoordinatorHandle touches only that column', () => {
  const r = Registry.open(tmpDb())
  r.upsertTeam(running)
  r.upsertTeam({ ...running, status: 'stopped' })              // 另一个进程刚 wl down
  r.updateCoordinatorHandle('duo', 'coord-2')
  expect(r.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'coord-2', status: 'stopped' })
  r.setRunId('duo', null)
  expect(r.getTeam('duo')).toMatchObject({ runId: null, coordinatorHandle: 'coord-2', status: 'stopped' })
})
test('intent ledger: open is insert-if-absent, reissue replaces id+args, drop deletes, listOpenRequests filters by prefix', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('dispatch:t1:0', 'id-1', { a: 1 })
  r.openIntent('dispatch:t1:0', 'id-2', { a: 2 })   // 已存在：不覆盖
  expect(r.getRequest('dispatch:t1:0')).toMatchObject({ state: 'pending', receipt: null, retryRequest: 'id-1', args: JSON.stringify({ a: 1 }) })
  r.finishRequest('dispatch:t1:0', 'uncertain', { error: 'timeout' })
  r.openIntent('done:t2:0:report', 'id-9', {})
  expect(r.listOpenRequests('dispatch:t1:').map((x) => x.id)).toEqual(['dispatch:t1:0'])
  r.reissueIntent('dispatch:t1:0', 'id-3', { a: 3 })
  expect(r.getRequest('dispatch:t1:0')).toMatchObject({ state: 'pending', retryRequest: 'id-3', args: JSON.stringify({ a: 3 }), receipt: null })
  r.dropRequest('dispatch:t1:0')
  expect(r.getRequest('dispatch:t1:0')).toBeNull()
})
test('insertTaskExt is idempotent (a replayed Orca result lands on an existing row)', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo', readySince: '2026-10-15T00:00:00.000Z' })
  expect(() => r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'review' })).not.toThrow()
  expect(r.getTaskExt('t1')).toEqual({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', epoch: 0, gateFailures: 0, readySince: '2026-10-15T00:00:00.000Z', dispatchedAt: null })
})
// 复审四 A-I6：Orca 界面里直接建的任务没有 task_ext 行，setter 不能静默影响 0 行
test('every task_ext setter inserts a default row when none exists', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.setClaimedBy('duo', 'ui-1', 'builder@duo')
  r.setPlan('duo', 'ui-2', 'p')
  expect(r.incrementGateFailures('duo', 'ui-3')).toBe(1)
  r.setReadySince('duo', 'ui-4', 'T'); r.setDispatchedAt('duo', 'ui-5', 'T')
  expect(r.bumpEpoch('duo', 'ui-6', 0, false)).toBe(1)
  expect(r.getTaskExt('ui-1')).toMatchObject({ team: 'duo', kind: 'work', tags: [], claimedBy: 'builder@duo', epoch: 0 })
  expect(r.getTaskExt('ui-2')!.plan).toBe('p')
  expect(r.getTaskExt('ui-6')!.epoch).toBe(1)
})
test('bumpEpoch is compare-and-set: a second bump from the same epoch does nothing and reports the current epoch', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  r.incrementGateFailures('duo', 't1'); r.incrementGateFailures('duo', 't1')
  expect(r.bumpEpoch('duo', 't1', 0, true)).toBe(1)
  expect(r.bumpEpoch('duo', 't1', 0, true)).toBe(1)              // 另一个进程已经加过
  expect(r.getTaskExt('t1')).toMatchObject({ epoch: 1, gateFailures: 0 })
})
test('recordVerdict: first writer wins; escalate also pins gate_failures in the same transaction', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  const base = { taskId: 't1', epoch: 0, post: 'builder@duo', dispatchId: 'ctx-1', reportFrom: 'term-b', body: 'out' }
  const first = r.recordVerdict({ ...base, verdict: 'escalate', gateFailures: 3 })
  expect(r.recordVerdict({ ...base, verdict: 'passed', gateFailures: 0 })).toEqual(first)
  expect(first).toMatchObject({ verdict: 'escalate', gateFailures: 3, result: null, finishedAt: null, createdAt: expect.any(String) })
  expect(r.getTaskExt('t1')!.gateFailures).toBe(3)
  expect(r.listUnfinishedVerdicts('duo').map((v) => v.taskId)).toEqual(['t1'])
  r.finishVerdict('t1', 0, { outcome: 'escalated' })
  expect(r.getVerdict('t1', 0)).toMatchObject({ result: JSON.stringify({ outcome: 'escalated' }), finishedAt: expect.any(String) })
  expect(r.listUnfinishedVerdicts('duo')).toEqual([])
})
test('a bypassed verdict stores empty dispatch id and report-from', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  const v = r.recordVerdict({ taskId: 't1', epoch: 0, post: 'builder@duo', verdict: 'bypassed', gateFailures: 0, dispatchId: '', reportFrom: '', body: null })
  expect(v).toMatchObject({ verdict: 'bypassed', dispatchId: '', reportFrom: '' })
  expect(r.listVerdictsOf('t1')).toHaveLength(1)
})
test('gates map gate id to team and task; recordGate is idempotent', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.recordGate('gate-1', 'duo', 't1')
  expect(() => r.recordGate('gate-1', 'duo', 't1')).not.toThrow()
  expect(r.getGate('gate-1')).toEqual({ team: 'duo', taskId: 't1' })
  expect(r.listGates('duo')).toEqual([{ gateId: 'gate-1', taskId: 't1' }])
  expect(r.getGate('ghost')).toBeNull()
})
test('task_log is append-only and ordered; object detail is stored as JSON', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'human', actorSource: 'human', action: 'create' })
  r.appendTaskLog({ team: 'duo', taskId: 't1', epoch: 0, actor: 'builder@duo', actorSource: 'implicit', action: 'start', detail: { delivery: 'self' } })
  expect(r.listTaskLog('t1').map((x) => [x.action, x.actorSource, x.detail])).toEqual([['create', 'human', null], ['start', 'implicit', '{"delivery":"self"}']])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `migrations.ts` 追加第二项：
  ```sql
  ALTER TABLE teams ADD COLUMN coordinator_handle TEXT;
  ALTER TABLE requests ADD COLUMN retry_request TEXT;
  ALTER TABLE requests ADD COLUMN args TEXT;
  CREATE TABLE task_ext (task_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), tags TEXT NOT NULL DEFAULT '[]',
    kind TEXT NOT NULL DEFAULT 'work', plan TEXT, claimed_by TEXT, epoch INTEGER NOT NULL DEFAULT 0,
    gate_failures INTEGER NOT NULL DEFAULT 0, ready_since TEXT, dispatched_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE task_done (task_id TEXT NOT NULL, epoch INTEGER NOT NULL, post TEXT NOT NULL, verdict TEXT NOT NULL,
    gate_failures INTEGER NOT NULL, dispatch_id TEXT NOT NULL, report_from TEXT NOT NULL, body TEXT, result TEXT,
    finished_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (task_id, epoch));
  CREATE TABLE gates (gate_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), task_id TEXT NOT NULL);
  CREATE TABLE task_log (id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, task_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    at TEXT NOT NULL, actor TEXT NOT NULL, actor_source TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
  CREATE INDEX task_log_task ON task_log(task_id, id);
  ```
  `registry.ts`：`teamRow`/`upsertTeam` 加 `coordinator_handle`；`getRequest` 多读三列；账本方法按签名，`args` 用 `JSON.stringify`；`insertTaskExt`/`recordGate` 用 `INSERT … ON CONFLICT DO NOTHING`；五个 setter 共用一个私有 `upsertExt(team, taskId, column, value)`（`INSERT INTO task_ext(task_id, team, created_at, <col>) VALUES (…) ON CONFLICT(task_id) DO UPDATE SET <col> = excluded.<col>`；列名来自白名单常量，不拼接外部输入）；`incrementGateFailures` 先 `upsertExt` 再 `UPDATE … SET gate_failures = gate_failures + 1` 后读回；`bumpEpoch` 先确保行存在（`INSERT … ON CONFLICT DO NOTHING`），再按签名的 CAS `UPDATE`，最后读回 `epoch`；`recordVerdict` 在 `BEGIN IMMEDIATE … COMMIT` 里先查后写；`finishVerdict` 写 `result = JSON.stringify(result)`、`finished_at = now()`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test` → PASS（含阶段 1 全部测试）；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): registry support for coordinator, intent ledger, task_ext, task_done, gates, task_log"`

---

### Task 3：`OrcaClient` 新方法 + 模拟实测语义的 `FakeOrca`

**Files:**
- Modify：`packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`
- Modify：`packages/core/src/commands/deps.ts`（`CommandDeps` 加 `env: NodeJS.ProcessEnv` 与 `now: () => Date`；`requestId` 上那句注释限定为"`terminal` 命令族的 --retry-request 只认 Orca 分配的 UUID；编排命令族见 commands/task/ledger.ts"）
- Modify：`packages/cli/src/cli.ts`（`defaultMakeDeps` 填 `env: process.env`、`now: () => new Date()`）
- Modify：`packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.ts`
- Create：`packages/core/test/commands/fake-client.test.ts`

**Interfaces:**
- Produces（本计划是这些方法的**唯一**声明处，2B 计划只消费并另加 `check`/`reply`/`workerList`/`worktreeSet`）：
  ```ts
  export type OrchestrationTaskStatus = 'ready' | 'dispatched' | 'blocked' | 'completed' | 'failed'
  export interface OrchestrationTask {
    id: string; status: OrchestrationTaskStatus; title: string; spec: string; parentId: string | null
    assigneeHandle: string | null; dispatchId: string | null   // 终态/blocked 任务的 task-list 不带这两个键 → null
    result: string | null                                       // Orca 的 JSON 字符串原样保留
  }
  export interface RunSummary { id: string; objective: string; coordinatorHandle: string | null; createdAt: string }
  export type RequestShowState = 'completed' | 'pending' | 'absent'
  export interface TerminalView { handle: string; title: string | null; connected: boolean; preview: string }
  runCreate(a: { objective: string; from: string; retryRequest?: string }): Promise<{ id: string; coordinatorHandle: string; replayed: boolean }>
  runUse(a: { id: string; from: string }): Promise<{ coordinatorHandle: string }>
  runShow(a: { id: string }): Promise<{ coordinatorHandle: string }>
  runList(): Promise<RunSummary[]>
  requestShow(a: { request: string }): Promise<{ state: RequestShowState; receipt: unknown }>   // receipt 原样（completed 时是原回执），只有 oneShot 的"本地无记录"分支读它
  taskCreate(a: { spec: string; taskTitle: string; run: string; from: string; parent?: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  taskList(a: { run: string }): Promise<OrchestrationTask[]>
  dispatch(a: { task: string; to: string; from: string; retryRequest?: string }): Promise<{ dispatchId: string; replayed: boolean }>
  workerDone(a: { taskId: string; dispatchId: string; outcome: 'succeeded' | 'failed'; subject: string; body?: string; run: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  gateCreate(a: { task: string; question: string; from: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  gateResolve(a: { id: string; resolution: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  terminalShow(a: { handle: string }): Promise<TerminalView>
  worktreeShow(a: { worktree: string }): Promise<{ path: string }>
  ```
  共 13 个方法。`replayed` 一律取 `r.mutation?.replayed ?? false`。argv（`runner.json` 自动追加 `--json`）；`--retry-request` 只在给出时追加在末尾：
  - `runCreate` → `orchestration run-create --objective <o> --from <f>`，读 `r.run.id`、`r.run.coordinator_handle`
  - `runUse` → `orchestration run-use --id <id> --from <f>`，读 `r.run.coordinator_handle`
  - `runShow` → `orchestration run-show --id <id>`，读 `r.run.coordinator_handle`
  - `runList` → `orchestration run-list`，读 `r.runs[]` 的 `id`/`objective`/`coordinator_handle`/`created_at`（字段名以 Task 15 入库的真实回执为准；本任务按这些名字写，Task 15 若发现不同再改映射并在提交说明里写明）
  - `requestShow` → `orchestration request-show --request <id>`，读 `r.state`（R5-5：`completed`/`pending`/`absent`）与 `r.receipt`（原样，缺省 `null`）
  - `taskCreate` → `orchestration task-create --spec <s> --task-title <t> --run <r> --from <f> [--parent <p>]`，读 `r.task.id`
  - `taskList` → `orchestration task-list --run <r>`，映射 `task_title→title`、`parent_id→parentId`、`assignee_handle→assigneeHandle`（缺省 null）、`dispatch_id→dispatchId`（缺省 null），`result` 原样
  - `dispatch` → `orchestration dispatch --task <t> --to <h> --from <f>`，读 `r.dispatch.id`（**永不追加 `--inject`**）
  - `workerDone` → `orchestration send --type worker_done --outcome <o> --task-id <t> --dispatch-id <d> --subject <s> [--body <b>] --run <r> --from <f>`
  - `gateCreate` → `orchestration gate-create --task <t> --question <q> --from <f>`，读 `r.gate.id`
  - `gateResolve` → `orchestration gate-resolve --id <id> --resolution <r> --from <f>`
  - `terminalShow` → `terminal show --terminal <h>`，读 `r.terminal.title`/`connected`/`preview`（`preview` 缺省 `''`；R6 fixture）
  - `worktreeShow` → `worktree show --worktree <sel>`，读 `r.worktree.path`（字段名同样以 Task 15 为准）

- [ ] **Step 1：写失败测试（`client.test.ts`，沿用已有 `clientWith`——它返回 `{ client, calls, opts }`）**

```ts
const m = (requestId: string, replayed = false) => ({ mutation: { requestId, replayed } })
test('runCreate / runUse / runShow read run.coordinator_handle; runUse has no --retry-request', async () => {
  const { client, calls } = clientWith({
    'orchestration run-create': { run: { id: 'run-1', coordinator_handle: 'h1' }, ...m('r1') },
    'orchestration run-use': { run: { id: 'run-1', coordinator_handle: 'h2' }, ...m('r2') },
    'orchestration run-show': { run: { id: 'run-1', coordinator_handle: 'h2' } },
  })
  expect(await client.runCreate({ objective: 'wingline:duo', from: 'h1', retryRequest: 'rid' })).toEqual({ id: 'run-1', coordinatorHandle: 'h1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'run-create', '--objective', 'wingline:duo', '--from', 'h1', '--retry-request', 'rid'])
  expect(await client.runUse({ id: 'run-1', from: 'h2' })).toEqual({ coordinatorHandle: 'h2' })
  expect(calls[1]).toEqual(['orchestration', 'run-use', '--id', 'run-1', '--from', 'h2'])
  expect(await client.runShow({ id: 'run-1' })).toEqual({ coordinatorHandle: 'h2' })
  expect(calls[2]).toEqual(['orchestration', 'run-show', '--id', 'run-1'])
})
test('runList maps runs; requestShow reads state', async () => {
  const { client, calls } = clientWith({
    'orchestration run-list': { runs: [{ id: 'run-1', objective: 'wingline:duo', coordinator_handle: 'h1', created_at: '2026-10-15 01:00:00' }] },
    'orchestration request-show': { state: 'completed', receipt: {} },
  })
  expect(await client.runList()).toEqual([{ id: 'run-1', objective: 'wingline:duo', coordinatorHandle: 'h1', createdAt: '2026-10-15 01:00:00' }])
  expect(await client.requestShow({ request: 'rid' })).toEqual({ state: 'completed', receipt: {} })
  expect(calls[1]).toEqual(['orchestration', 'request-show', '--request', 'rid'])
})
test('taskCreate passes quotes/newline/中文 verbatim and appends --parent / --retry-request only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration task-create': { task: { id: 't1' }, ...m('x', true) } })
  expect(await client.taskCreate({ spec: 'a: 修"bug"\n中文', taskTitle: 't', run: 'run-1', from: 'c' })).toEqual({ id: 't1', replayed: true })
  expect(calls[0]).toEqual(['orchestration', 'task-create', '--spec', 'a: 修"bug"\n中文', '--task-title', 't', '--run', 'run-1', '--from', 'c'])
  await client.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'c', parent: 't0', retryRequest: 'rid' })
  expect(calls[1]!.slice(-4)).toEqual(['--parent', 't0', '--retry-request', 'rid'])
})
test('taskList maps fields; blocked/terminal tasks without assignee keys map to null', async () => {
  const { client } = clientWith({ 'orchestration task-list': { tasks: [
    { id: 't1', status: 'blocked', task_title: 'x', spec: 's', parent_id: null, result: null },
    { id: 't2', status: 'dispatched', task_title: 'y', spec: 's', parent_id: 't1', assignee_handle: 'h2', dispatch_id: 'ctx-1', result: null },
  ] } })
  expect(await client.taskList({ run: 'run-1' })).toEqual([
    { id: 't1', status: 'blocked', title: 'x', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null },
    { id: 't2', status: 'dispatched', title: 'y', spec: 's', parentId: 't1', assigneeHandle: 'h2', dispatchId: 'ctx-1', result: null },
  ])
})
test('dispatch never sends --inject; reads dispatch.id and replayed', async () => {
  const { client, calls } = clientWith({ 'orchestration dispatch': { dispatch: { id: 'ctx-1' }, injected: false, ...m('rid') } })
  expect(await client.dispatch({ task: 't1', to: 'h2', from: 'c', retryRequest: 'rid' })).toEqual({ dispatchId: 'ctx-1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c', '--retry-request', 'rid'])
})
test('workerDone argv, --body only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration send': { message: {}, ...m('rid') } })
  expect(await client.workerDone({ taskId: 't1', dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', run: 'run-1', from: 'h2', retryRequest: 'rid' })).toEqual({ replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', 't1', '--dispatch-id', 'ctx-1', '--subject', 'gate passed', '--run', 'run-1', '--from', 'h2', '--retry-request', 'rid'])
})
test('gateCreate / gateResolve argv', async () => {
  const { client, calls } = clientWith({ 'orchestration gate-create': { gate: { id: 'gate-1' }, ...m('a') }, 'orchestration gate-resolve': { gate: {}, ...m('b') } })
  expect(await client.gateCreate({ task: 't1', question: 'q', from: 'c', retryRequest: 'a' })).toEqual({ id: 'gate-1', replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'gate-create', '--task', 't1', '--question', 'q', '--from', 'c', '--retry-request', 'a'])
  await client.gateResolve({ id: 'gate-1', resolution: 'retry', from: 'c', retryRequest: 'b' })
  expect(calls[1]).toEqual(['orchestration', 'gate-resolve', '--id', 'gate-1', '--resolution', 'retry', '--from', 'c', '--retry-request', 'b'])
})
test('terminalShow reads preview (empty when missing); worktreeShow reads the path', async () => {
  const { client, calls } = clientWith({
    'terminal show': { terminal: { handle: 'h1', title: 'builder@duo', connected: true, preview: 'line1\n❯ ' } },
    'worktree show': { worktree: { path: '/repo/wt' } },
  })
  expect(await client.terminalShow({ handle: 'h1' })).toEqual({ handle: 'h1', title: 'builder@duo', connected: true, preview: 'line1\n❯ ' })
  expect(calls[0]).toEqual(['terminal', 'show', '--terminal', 'h1'])
  expect(await client.worktreeShow({ worktree: 'id:w1' })).toEqual({ path: '/repo/wt' })
  expect(calls[1]).toEqual(['worktree', 'show', '--worktree', 'id:w1'])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现 `types.ts`/`client.ts`。**
- [ ] **Step 4：`FakeOrca` 编排模型（`fake-client.ts`）。** 2A 的重跑安全只有在假客户端忠实模拟 spec 第 2 节的实测语义时才测得出来，所以这是一个小模型：
  - **状态：** `coordinator: string | null`；`runs: RunSummary[]`；`tasks: OrchestrationTask[]`（内部保留 assignee/dispatch，`taskList()` 对 `blocked`/`completed`/`failed` 输出 null）；`gates: Map<string, { taskId: string; status: 'pending' | 'resolved' }>`；`ledger: Map<string, { input: string; outcome: { ok: true; value: unknown } | { ok: false; error: WinglineError } }>`；`pendingIds: Set<string>`（`requestShow` 对它们报 `pending`）；`previews: Map<string, string>`（`terminalShow` 的 `preview`，缺省 `'❯ '`）；`worktreePaths: Map<string, string>`（缺省返回 `os.tmpdir()`）；`faults: Array<{ method: string; when: 'transport' | 'before' | 'after'; error: Error; match?: (a: Record<string, unknown>) => boolean }>`（按方法名、`when` 与可选的 `match(入参)` 取第一条匹配的并移除）；`orch: Array<{ m: string; a: Record<string, unknown> }>`（除只读的 `taskList`/`terminalShow`/`worktreeShow` 外每次编排调用的入参）；`callsOf(m)` 返回该方法的入参数组；每个方法同时往阶段 1 已有的 `calls` 字符串数组推方法名；`onMutate?: () => void`（在第②步之前调用，用来观察"调用发生时账本行的状态"）。
  - **写调用统一经 `mutate(m, a, { coordinatorOnly, recordRejections }, exec)`：** ⓪入参记入 `orch`/`calls`；`onMutate?.()`；取 `transport` 故障抛出（模拟请求没到运行时，在账本检查之前）。①有 `retryRequest` 且账本里有 → 入参（去掉 `retryRequest` 后 `JSON.stringify`）不同则抛 `orca`/`request_mismatch`；相同则：记下的是成功 → 返回**快照** + `replayed: true`；记下的是拒绝 → 原样抛出那个错误（R5-2）。②取 `before` 故障。③`coordinatorOnly` 且 `a.from !== coordinator` → `orca`/`consumer_fenced`（不进账本，R4-1）。④`exec()`；它抛出的 `orca` 错误：`recordRejections` 为真（只有 `workerDone`）且有 `retryRequest` → 记进账本后再抛（R5-2），否则不记直接抛。⑤成功且有 `retryRequest` → 存账本（`structuredClone` 快照）。⑥取 `after` 故障抛出（模拟"已落地但调用方看到传输错误/超时"——四个传输码与 `orca_timeout` 都用这个位置）。返回结果 + `replayed: false`。
  - `requestShow({ request })`：`pendingIds.has` → `pending`；账本里有 → `completed`，`receipt` 是成功快照（拒绝时是 `{ rejected: <code> }`）；否则 `absent`、`receipt: null`。先取 `before` 故障（供"查询本身失败"的测试）。
  - `runCreate`（不 coordinatorOnly）：`coordinator = from`，推一条 `runs`（`id: run-N`、`objective`、`coordinatorHandle: from`、`createdAt`），返回该 id。`runUse`：Run 不存在 → `orca`/`run_not_found`；否则 `coordinator = from`（不经账本，但先取 `before` 故障）。`runShow`：返回 `coordinator`。`runList`：返回 `runs` 副本。
  - `taskCreate`（coordinatorOnly）：推一条 `ready` 任务，id `task-N`。
  - `dispatch`（coordinatorOnly）：任务不是 `ready` → `orca`/`task_not_startable`；**`to` 已是另一个 `dispatched` 任务的 assignee → `orca`/`runtime_error`，message 含 "already has an active dispatch"（R6-1，不改状态）**；否则 `dispatched`、`assigneeHandle = to`、`dispatchId = ctx-N`。`to` 不在 `terminals` 里也照样成功（R5-4）。
  - `workerDone`（非 coordinatorOnly，`recordRejections: true`）：任务不是 `dispatched` 或 dispatchId 不符 → `inactive_dispatch`；`from !== assigneeHandle` → `worker_identity_changed`；否则按 `outcome` 转 `completed`/`failed`，`result = JSON.stringify({ provenance: 'worker_report', outcome, reportedBy: from })`。
  - `gateCreate`（coordinatorOnly）：`gate-N` pending，任务 → `blocked`（R3-B1）。`gateResolve`（coordinatorOnly）：gate 不存在 → `gate_not_found`；→ resolved，任务 → `ready`（R3-B2）。
  - `terminalShow`：handle 不在 `terminals` → `orca`/`terminal_not_found`；否则 `{ handle, title, connected, preview: previews.get(handle) ?? '❯ ' }`。
  - `terminalClose` 追加：把 assignee 为该 handle 的 `dispatched` 任务放回 `ready`（R3-C3）。
  - 新 helper `bypassReport(o, taskId)`：模拟岗位直接用 Orca CLI 上报——以任务当前 assignee 为 `from` 调 `workerDone`（不带 `retryRequest`）。
  - `mkDeps` 默认 `env: {}`、`now: () => new Date()`（可被 `over` 覆盖）。
  - `seedRunningTeam(o, over?: Partial<CommandDeps> & { yaml?: string })`：`mkDeps` → `const specPath = mkTeam(over?.yaml ?? DUO_YAML)`；`registry.upsertTeam({ name: 'duo', specPath, specHash: specHash(loadTeamSpec(specPath)), runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up' })`（**真实哈希**：Task 9 的通用前置会比对它）；`o.coordinator = 'coord-1'`；`o.runs.push({ id: 'run-1', objective: 'wingline:duo', coordinatorHandle: 'coord-1', createdAt: '…' })`；登记两个岗位 `builder@duo`（handle `term-b`，lead）与 `checker@duo`（handle `term-c`），两者的 worktree 都是 `path:<os.tmpdir()>`，并往 `o.terminals` 推两条对应终端（title 即地址）与协调者终端 `coord-1`（title `zsh`）。
- [ ] **Step 5：钉住 `FakeOrca` 自身的语义**（`fake-client.test.ts`，每条三五行，是 spec 第 2 节事实的逐条翻译，全部写出）：
  1. 同 id 同参数回放返回旧快照（任务此后已 `completed`，回放的 `dispatch` 仍返回原 `dispatchId`）；同 id 不同参数 `request_mismatch`。
  2. 换协调者后，旧 `from` 重放已落地的 id 仍是回放；新 id 用旧 `from` 被 fence。
  3. 被 fence 的调用不进账本：条件变化后同 id 重放是重新执行。
  4. 被拒的 `workerDone`（`worker_identity_changed`）进账本：同 id 重放永远抛同一个错误，`requestShow` 为 `completed`；被拒的 `dispatch`（`task_not_startable`）不进账本，`requestShow` 为 `absent`。
  5. `after` 故障：调用已落地（任务已建、`requestShow` 为 `completed`），调用方看到错误。`transport` 故障在账本检查之前：已落地的 id 也照样抛。
  6. 一个终端一个派发：第二个 `dispatch` 到同一 `to` 抛 `runtime_error`，任务保持 `ready`；前一个完成后可以派。
  7. `gateCreate` 让 `dispatched` 变 `blocked` 且之后 `workerDone` 抛 `inactive_dispatch`；`gateResolve` 回 `ready`；`terminalClose` 让任务回 `ready`；之后派给已关闭的 handle 仍成功。
- [ ] **Step 6：运行确认通过** — `pnpm vitest run packages/core/test` → PASS；`pnpm typecheck`。
- [ ] **Step 7：提交** — `git commit -m "feat(core): orchestration methods on OrcaClient and a FakeOrca that models Orca's ledger/fence/gate/busy semantics"`

---

### Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`

**Files:**
- Create：`packages/core/src/commands/task/ledger.ts`、`packages/core/test/commands/task/ledger.test.ts`

**Interfaces:**
- Consumes：`Registry` 账本方法（Task 2）、`OrcaClient.runShow`/`requestShow`（Task 3）
- Produces：
  ```ts
  /** spec 第 2 节事实 10：可能已落地、Orca 自己标为 outcome_unknown 的四个传输码。 */
  export const TRANSPORT_CODES: ReadonlySet<string>   // runtime_unavailable / remote_runtime_unavailable / runtime_timeout / invalid_runtime_response
  export function fenced(err: unknown): boolean        // kind==='orca' && code==='consumer_fenced'；2B 复用
  export function indeterminate(err: unknown): boolean // kind==='uncertain'，或 kind==='orca' 且 TRANSPORT_CODES.has(code)
  export interface LedgerCall<A extends object, R> {
    key: string
    team: string                                   // 团队名：fence 时刷新它的 coordinator_handle
    build: (team: TeamRow) => A | Promise<A>       // 完整参数（不含 retryRequest）；只在首次、fence 重发、派发换目标时调用
    call: (a: A & { retryRequest: string }) => Promise<R>
    id?: string                                    // 首次用的幂等 id，缺省 randomUUID()（oneShot 传入）
    hint?: (a: A, id: string) => string            // 结果不确定时的提示；缺省"原样重跑同一条命令即可（幂等 id <id> 已记录）"
    /** 只给派发行用：重放一个 pending/uncertain 行之前调用；返回 'settle' 时先 request-show 定案（spec 第 9.1 节第 1 步例外）。 */
    beforeReplay?: (stored: A) => Promise<'replay' | 'settle'>
  }
  /** spec 第 9.1 节 P1。done 行直接返回存下的结果（不调用 Orca）。 */
  export async function ledgered<A extends object, R>(deps: CommandDeps, c: LedgerCall<A, R>): Promise<R>
  /** spec 第 9.2 节 P2：id = retryRequest ?? id ?? randomUUID()，键 oneshot:<id>。 */
  export async function oneShot<A extends { from: string }, R>(deps: CommandDeps, c: {
    team: string; retryRequest?: string; id?: string
    build: LedgerCall<A, R>['build']; call: LedgerCall<A, R>['call']
    fromReceipt: (receipt: unknown) => R | null     // 本地无记录、request-show 为 completed 时从原回执取结果；取不出 → null
    retryHint: (id: string) => string
  }): Promise<R>
  export async function refreshCoordinator(deps: CommandDeps, team: string): Promise<TeamRow>   // runShow → updateCoordinatorHandle → getTeam
  ```

**实现层决定：** spec 第 9.1 节第 3 步区分"`completed` 且是成功回执 / 是被记下的拒绝"。本计划不解析 `request-show` 的 `receipt`（各方法的回执形状不同，拒绝的形状只在 `worker_done` 上见过），而是：原错误是**传输/不确定类**时，用同一个 id 和同一组参数再调用一次——Orca 对 `completed` 的请求重放返回记下的结果（事实 7、10），成功即成功、抛出明确错误即"被记下的拒绝"；原错误本身就是**明确的 Orca 错误**时，`completed` 说明它就是那个被记下的拒绝，不再重放。只有 `oneShot` 的"本地无记录"分支没有原参数可重放，才读 `receipt`（`fromReceipt`）。

- [ ] **Step 1：写失败测试**

```ts
const rt = () => new WinglineError('orca', 'runtime_timeout', 'Timed out waiting for the Orca runtime')
const ru = () => new WinglineError('orca', 'runtime_unavailable', 'Start the Orca app first')
const timeout = () => new WinglineError('uncertain', 'orca_timeout', 'Orca 调用超过 120000 ms，结果不确定')
const createCall = (deps: CommandDeps, o: FakeOrca, key = 'k') => ledgered(deps, {
  key, team: 'duo',
  build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }),
  call: (a) => o.taskCreate(a),
})

test('writes pending with id+args before the call, done after; a second call never reaches Orca', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  let during: unknown
  o.onMutate = () => { during ??= registry.getRequest('k') }
  const r1 = await createCall(deps, o)
  expect(during).toMatchObject({ state: 'pending', retryRequest: expect.any(String), args: expect.stringContaining('coord-1') })
  expect(registry.getRequest('k')!.state).toBe('done')
  const before = o.orch.length
  expect(await createCall(deps, o)).toEqual(r1)
  expect(o.orch.length).toBe(before)
})
// 复审四 A-C1：首次调用已落地、却返回传输码。旧逻辑把新行删掉，重跑建出第二个对象。
test.each(['runtime_timeout', 'runtime_unavailable', 'remote_runtime_unavailable', 'invalid_runtime_response'])(
  'landed but returned %s → request-show completed → same-id replay settles it in the same command, one object', async (code) => {
    const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
    o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('orca', code, 'x') })
    const r = await createCall(deps, o)
    expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
    const ids = o.callsOf('taskCreate').map((a) => a.retryRequest)
    expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
    expect(o.callsOf('requestShow')).toHaveLength(1)
    expect(registry.getRequest('k')!.state).toBe('done')
  })
test('landed + orca_timeout, and request-show itself fails → uncertain, row kept; the rerun replays the same id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('原样重跑') })
  const id = registry.getRequest('k')!.retryRequest
  expect(registry.getRequest('k')!.state).toBe('uncertain')
  await createCall(deps, o)
  expect(o.callsOf('taskCreate').map((a) => a.retryRequest)).toEqual([id, id])
  expect(o.tasks).toHaveLength(1)
})
test('never arrived (transport fault before the ledger) → request-show absent → row dropped, exit-3 kind; the rerun uses a new id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'transport', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', code: 'runtime_unavailable', hint: expect.stringContaining('原样重跑') })
  expect(registry.getRequest('k')).toBeNull()
  await createCall(deps, o)
  const ids = o.callsOf('taskCreate').map((a) => a.retryRequest)
  expect(ids[1]).not.toBe(ids[0]); expect(o.tasks).toHaveLength(1)
})
test('request-show pending → uncertain, row kept', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() })
  o.onMutate = () => { const r = registry.getRequest('k'); if (r?.retryRequest) o.pendingIds.add(r.retryRequest) }
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('稍后') })
  expect(registry.getRequest('k')!.state).toBe('uncertain')
})
// 复审四 A-I2：被拒的 worker_done 记进 Orca 账本，同 id 永远拿回同一个拒绝
test('a recorded rejection (worker_identity_changed) → row dropped, exit-2 kind; after the cause is fixed the rerun uses a new id and succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const { dispatchId } = await o.dispatch({ task: t, to: 'term-b', from: 'coord-1' })
  let from = 'term-x'
  const report = () => ledgered(deps, { key: 'r', team: 'duo', build: () => ({ taskId: t, dispatchId, outcome: 'succeeded' as const, subject: 's', run: 'run-1', from }), call: (a) => o.workerDone(a) })
  await expect(report()).rejects.toMatchObject({ kind: 'orca', code: 'worker_identity_changed' })
  expect(registry.getRequest('r')).toBeNull()
  from = 'term-b'
  await report()
  const ids = o.callsOf('workerDone').map((a) => a.retryRequest)
  expect(ids[1]).not.toBe(ids[0])
  expect(o.tasks.find((x) => x.id === t)!.status).toBe('completed')
})
test('a definite error that Orca did not record (task_not_startable) → request-show absent → row dropped, exit-2 kind', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'task_not_startable', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'orca', code: 'task_not_startable' })
  expect(registry.getRequest('k')).toBeNull()
})
test('consumer_fenced: refresh coordinator (only that column), new id, retry once', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  await createCall(deps, o)
  const calls = o.callsOf('taskCreate')
  expect(calls.map((a) => a.from)).toEqual(['coord-1', 'coord-2'])
  expect(calls[1]!.retryRequest).not.toBe(calls[0]!.retryRequest)
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
  expect(o.tasks).toHaveLength(1)
})
test('fenced again after the reissue → settled (absent) → row dropped, consumer_fenced surfaces', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'consumer_fenced', 'x') },
                { method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'consumer_fenced', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'orca', code: 'consumer_fenced' })
  expect(registry.getRequest('k')).toBeNull()
})
test('a landed call replays with its ORIGINAL --from even after the coordinator changed', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  await createCall(deps, o)
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-1' })
  expect(o.tasks).toHaveLength(1)
  expect(registry.getRequest('k')!.state).toBe('done')
})
// 复审四 A-I1：派发行存下的 --to 已是死终端
test('beforeReplay → settle: absent → reissued with freshly built args (the new target), new id', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  let to = 'term-c'
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to, from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a),
    beforeReplay: async (s) => (o.terminals.some((x) => x.handle === s.to) ? 'replay' : 'settle') })
  o.faults.push({ method: 'dispatch', when: 'transport', error: ru() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' }); to = 'term-c2'
  await d()
  expect(o.callsOf('dispatch').map((a) => a.to)).toEqual(['term-c', 'term-c2'])
  expect(o.tasks.find((x) => x.id === t)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
  expect(registry.getRequest('d')!.state).toBe('done')
})
test('beforeReplay → settle: completed → replays the landed call (the caller then sees replayed: true)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const { id: t } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  const d = () => ledgered(deps, { key: 'd', team: 'duo', build: (tm) => ({ task: t, to: 'term-c', from: tm.coordinatorHandle! }), call: (a) => o.dispatch(a),
    beforeReplay: async (s) => (o.terminals.some((x) => x.handle === s.to) ? 'replay' : 'settle') })
  o.faults.push({ method: 'dispatch', when: 'after', error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(d()).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' })
  expect(await d()).toMatchObject({ dispatchId: 'ctx-1', replayed: true })
})

// —— oneShot（P2）——
const fromReceipt = (r: unknown) => ((r as { task?: { id?: string } })?.task?.id ? { id: (r as { task: { id: string } }).task.id, replayed: true } : null)
const oneShotCreate = (deps: CommandDeps, o: FakeOrca, retryRequest?: string, title = 't') => oneShot(deps, {
  team: 'duo', retryRequest, fromReceipt, retryHint: (id) => `wl task create duo --title ${title} --retry-request ${id}`,
  build: (t) => ({ spec: 's', taskTitle: title, run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a),
})
const handOver = async (o: FakeOrca, registry: Registry) => { await o.runUse({ id: 'run-1', from: 'coord-2' }); registry.updateCoordinatorHandle('duo', 'coord-2') }
const stuck = (o: FakeOrca, when: 'after' | 'before') => o.faults.push({ method: 'taskCreate', when, error: timeout() }, { method: 'requestShow', when: 'before', error: ru() })

test('oneShot: an uncertain failure prints the id; the row lives under oneshot:<id>', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after')
  const err = await oneShotCreate(deps, o).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
  expect(registry.getRequest(`oneshot:${id}`)).toMatchObject({ state: 'uncertain', retryRequest: id })
  await oneShotCreate(deps, o, id)
  expect(o.tasks).toHaveLength(1)
})
test('oneShot retry after a coordinator handover, original landed: replays the ORIGINAL --from, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await handOver(o, registry)
  const r = await oneShotCreate(deps, o, id)
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ retryRequest: id, from: 'coord-1' })
  expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
})
test('oneShot retry after a coordinator handover, original never landed: original --from is fenced → reissued with the current coordinator, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'before'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await handOver(o, registry)
  await oneShotCreate(deps, o, id)
  expect(o.callsOf('taskCreate').map((a) => a.from)).toEqual(['coord-1', 'coord-1', 'coord-2'])
  expect(o.tasks).toHaveLength(1)
})
test('oneShot: the same --retry-request with different arguments → retry_request_args_changed before any Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  await expect(oneShotCreate(deps, o, id, '另一个标题')).rejects.toMatchObject({ kind: 'input', code: 'retry_request_args_changed' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('oneShot with no local row (other WINGLINE_HOME): completed → adopts the original receipt, no Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  stuck(o, 'after'); await oneShotCreate(deps, o).catch(() => {})
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  registry.dropRequest(`oneshot:${id}`); await handOver(o, registry)
  const r = await oneShotCreate(deps, o, id)
  expect(r.id).toBe(o.tasks[0]!.id)
  expect(o.callsOf('taskCreate')).toHaveLength(1)
  expect(registry.getRequest(`oneshot:${id}`)!.state).toBe('done')
})
test('oneShot with no local row: absent → a normal call with that id; pending → exit-3 kind', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await oneShotCreate(deps, o, 'fresh-id')
  expect(o.callsOf('taskCreate')[0]!.retryRequest).toBe('fresh-id')
  o.pendingIds.add('busy-id')
  await expect(oneShotCreate(deps, o, 'busy-id')).rejects.toMatchObject({ kind: 'uncertain' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `ledgered`：读行；`done` → `JSON.parse(receipt)`；无行 → `openIntent(key, c.id ?? randomUUID(), await build(team))` 后重读；有行且 `c.beforeReplay` 返回 `'settle'` → `preSettle(row)`：`request-show` 为 `completed` → 照常重放；`absent` → `reissueIntent(key, randomUUID(), await build(当前团队行))`；`pending`/查询失败 → 记 `uncertain`、抛 `uncertain`。然后 `attempt(row)`：调用 `call({ ...JSON.parse(args), retryRequest })`，成功 → `finishRequest(key, 'done', value)` 并返回。
  - 失败分支：`fenced(err)` 且本次尚未重发 → `refreshCoordinator` → `reissueIntent(key, randomUUID(), await build(t))` → 再 `attempt` 一次；非 `WinglineError` 或 `kind` 为 `input`/`internal` → 原样上抛（行保持 `pending`）；其余 → `settleFailure(err, row)`。
  - `settleFailure`（spec 第 9.1 节第 3 步）：`state = await requestShow(id)`（抛出视为 `unknown`）：
    - `completed` 且 `indeterminate(err)` → 同 id 同参数再调用一次：成功 → done 并返回；抛明确的 `orca` 错误 → `dropRequest`，上抛它；再抛不确定类 → 记 `uncertain`，抛 `uncertain`。
    - `completed` 且原错误是明确的 `orca` 错误 → 它就是被记下的拒绝：`dropRequest`，原样上抛。
    - `absent` → `dropRequest`；原错误明确 → 原样上抛（退出码 2）；不确定类 → 上抛 `new WinglineError('uncertain', err.code, …, { hint: '原样重跑同一条命令即可', cause: err })`。
    - `pending` → 记 `uncertain`，上抛 `uncertain`，hint"原调用还在进行，稍后原样重跑同一条命令"。
    - `unknown` → 记 `uncertain`，上抛 `uncertain`，hint 用 `c.hint` 或缺省。
  - `oneShot`：`id = c.retryRequest ?? c.id ?? randomUUID()`，`key = \`oneshot:${id}\``；本地有行 → `fresh = await c.build(当前团队行)`，与落盘的 `args` 去掉 `from` 后比较（`JSON.stringify`），不同 → `input`/`retry_request_args_changed`；本地无行且 `c.retryRequest` 给了 → `requestShow(id)`：`completed` → `c.fromReceipt(receipt)` 非空 → `openIntent` + `finishRequest(key, 'done', 结果)` 后返回；为空 → 抛 `uncertain`/`retry_request_unreadable`，hint"这个 id 已在 Orca 落地但读不出结果：先用 wl task list 确认，再去掉 --retry-request 重跑"；`pending` → 抛 `uncertain`；`absent` 或查询失败 → 往下正常调用（查询失败时 Orca 的账本仍会兜住重复）。最后 `ledgered(deps, { key, team, id, build, call, hint: (a) => \`${c.retryHint(id)}（本次协调者 --from ${a.from}）\` })`。
  - `refreshCoordinator`：`runShow({ id: team.runId! })` → `updateCoordinatorHandle` → `getTeam`。
  - 拆分：`attempt`、`preSettle`、`settleFailure`、`adoptReceipt` 各自 ≤50 行。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): orchestration intent ledger settled by request-show"`

---

### Task 5：`wl up`——建立/找回 Run、按规则保持协调者、报告派给死终端的任务

**Files:**
- Modify：`packages/core/src/commands/up.ts`
- Modify：`packages/cli/src/cli.ts`（`wl up` 加 `--adopt-run <id>`、`--new-run`，二者互斥；`exitCodeOfUp` 的参数类型扩成 `{ posts: Array<{ outcome: string }>; run?: { outcome: string } }`：`ambiguous` → 1，`failed`/`lost` → 2，`uncertain` → 3，与岗位结果取最严重者）、`packages/cli/src/output.ts`（`renderUp`：`r.run` 存在时多一行 Run 步骤；`r.deadAssignees` 非空时逐条列出；两者都不存在时与阶段 1 输出一字不差）
- Modify（**已提交的阶段 1 测试，有断言要改**）：`packages/core/test/commands/up.test.ts`
  - 用例 `'fresh up does create → wait → brief per post'`：`o.calls` 的精确序列末尾追加 `'runList'`、`'runCreate'`、`'taskList'`、`'terminalList'`；`getTeam('duo')` 的期望从 `{ status: 'up', runId: null }` 改为 `{ status: 'up', runId: 'run-1', coordinatorHandle: 'term-1' }`。这是预期内的行为变化（阶段 2A 起 `wl up` 建 Run 并做一次只读核对），不是回归。
  - 其余已有用例没有对 `calls` 做精确断言或检查 `runId`；实现后跑一遍整个文件确认。
- Modify：`packages/cli/test/main.test.ts`：新增两条用例（Step 1 末尾）。已有的三处 `UpResult` 字面量都不带 `run`/`deadAssignees`，不用改（二者在类型上都是可选的）。

**Interfaces:**
- Consumes：`ledgered`（Task 4）、`runCreate`/`runUse`/`runList`/`taskList`/`terminalList`（Task 3）
- Produces：
  ```ts
  export interface UpArgs { specPath: string; adoptRun?: string; newRun?: boolean }
  export type RunOutcome = 'created' | 'adopted' | 'kept' | 'reclaimed' | 'deferred' | 'failed' | 'uncertain' | 'ambiguous' | 'lost'
  export interface UpResult {
    team: string
    posts: Array<{ address: string; outcome: UpOutcome; reason?: string; retry?: string }>
    run?: { outcome: RunOutcome; runId: string | null; reason?: string; retry?: string; candidates?: Array<{ id: string; createdAt: string }> }
    deadAssignees?: Array<{ taskId: string; title: string; owner: string | null; command: string }>
  }
  ```
  `run` 可选是有意的：不让新字段破坏阶段 1 已提交的类型字面量。`up()` 每次都填 `run`（没轮到建 Run 时是 `deferred`）；消费方一律写 `r.run?.…`。

- [ ] **Step 1：写失败测试（`up.test.ts` 新增）**

```ts
test('first up: run-list finds nothing → run-create from the lead handle through the ledger', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(o.callsOf('runCreate')).toEqual([{ objective: 'wingline:duo', from: 'term-1', retryRequest: expect.any(String) }])
  expect(registry.getRequest('duo:run-create')!.state).toBe('done')
})
test('run-create landed but returned runtime_timeout → settled in the same up, no second Run', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('orca', 'runtime_timeout', 't') })
  expect((await up(deps, { specPath: duo() })).run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(o.runs).toHaveLength(1)
})
test('run-create uncertain (request-show unreachable) → uncertain with the retry command; rerunning replays the same id', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') },
                { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'uncertain', retry: `wl up ${p}` })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'created', runId: 'run-1' })
  const ids = o.callsOf('runCreate').map((a) => a.retryRequest)
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
  expect(o.runs).toHaveLength(1)
})
test('registry lost: run-list finds exactly one wingline:duo Run → adopted and run-use to the lead, no run-create', async () => {
  const o = new FakeOrca(); o.runs.push({ id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'gone', createdAt: 'T' })
  const { deps, registry } = mkDeps(o)
  expect((await up(deps, { specPath: duo() })).run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(o.callsOf('runCreate')).toEqual([])
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-9', from: 'term-1' }])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-9', coordinatorHandle: 'term-1' })
})
test('two candidate Runs → ambiguous (exit 1 kind) listing both; --adopt-run picks one', async () => {
  const o = new FakeOrca()
  o.runs.push({ id: 'run-8', objective: 'wingline:duo', coordinatorHandle: 'x', createdAt: 'T1' }, { id: 'run-9', objective: 'wingline:duo', coordinatorHandle: 'y', createdAt: 'T2' })
  const { deps, registry } = mkDeps(o); const p = duo()
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'ambiguous', candidates: [{ id: 'run-8', createdAt: 'T1' }, { id: 'run-9', createdAt: 'T2' }], retry: `wl up ${p} --adopt-run <id>` })
  expect((await up(deps, { specPath: p, adoptRun: 'run-9' })).run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(registry.getTeam('duo')!.runId).toBe('run-9')
})
test('the Run was deleted in Orca → lost with the --new-run hint; --new-run creates a fresh Run and skips run-list', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.runs.length = 0; await o.terminalClose({ handle: 'term-1' })      // 协调者终端没了 → 下一轮要 run-use
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'lost', runId: 'run-1', retry: `wl up ${p} --new-run` })
  o.calls.length = 0
  expect((await up(deps, { specPath: p, newRun: true })).run).toEqual({ outcome: 'created', runId: 'run-2' })
  expect(o.calls).not.toContain('runList')
  expect(registry.getRequest('duo:run-create')!.state).toBe('done')
})
test('second up keeps the coordinator while its terminal is alive (e.g. a running dispatcher)', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  registry.updateCoordinatorHandle('duo', 'term-dsp'); o.coordinator = 'term-dsp'
  expect((await up(deps, { specPath: p })).run).toEqual({ outcome: 'kept', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
test('second up reclaims for the lead when the coordinator terminal is gone', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-1' })
  expect((await up(deps, { specPath: p })).run).toEqual({ outcome: 'reclaimed', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-1', from: 'term-3' }])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-3')
})
test('lead not live this round → run step deferred, no orchestration call', async () => {
  const o = new FakeOrca(); o.waitSatisfied = false
  const r = await up(mkDeps(o).deps, { specPath: duo() })
  expect(r.run).toEqual({ outcome: 'deferred', runId: null })
  expect(o.orch).toEqual([])
})
test('the Run is reused after wl down and a spec change', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  registry.upsertTeam({ ...registry.getTeam('duo')!, status: 'stopped' })
  const r = await up(deps, { specPath: mkTeam(DUO_YAML.replace('model: opus', 'model: sonnet')) })
  expect(r.run?.runId).toBe('run-1')
  expect(o.callsOf('runCreate')).toHaveLength(1)
})
test('dispatched tasks whose assignee terminal is gone are reported with a recover command, grouped by owner; nothing is changed', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'term-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-old', from: 'term-1' })        // 派给了一个已经不存在的 handle（R5-4）
  o.orch.length = 0
  const r = await up(deps, { specPath: p })
  expect(r.deadAssignees).toEqual([{ taskId: id, title: '实现登录', owner: 'checker@duo', command: `wl task recover ${id}` }])
  expect(o.orch.filter((c) => c.m !== 'runUse')).toEqual([])
})
```

```ts
// packages/cli/test/main.test.ts（沿用文件里已有的 cmds / exec）
test('up exits 3 when the Run step is uncertain even though every post launched', async () => {
  const c = cmds({ up: async () => ({ team: 'duo', posts: [{ address: 'builder@duo', outcome: 'launched' }], run: { outcome: 'uncertain', runId: null, reason: 't', retry: 'wl up x' } }) })
  const r = await exec(['up', 'x'], c)
  expect(r.code).toBe(3); expect(r.out).toContain('wl up x')
})
test('up passes --adopt-run / --new-run through; ambiguous exits 1, lost exits 2', async () => {
  const seen: unknown[] = []
  const mk = (outcome: string) => cmds({ up: async (_d, a) => { seen.push(a); return { team: 'duo', posts: [], run: { outcome, runId: null } } } })
  expect((await exec(['up', 'x', '--adopt-run', 'run-9'], mk('ambiguous'))).code).toBe(1)
  expect((await exec(['up', 'x', '--new-run'], mk('lost'))).code).toBe(2)
  expect(seen).toEqual([expect.objectContaining({ adoptRun: 'run-9' }), expect.objectContaining({ newRun: true })])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `up()` 在 posts 循环后调用新函数 `ensureRun(l, posts, args)`，再调用 `reportDeadAssignees(l)`（只在 `run.runId` 非空时；一次 `taskList` + 一次 `terminalList`，只读）。`ensureRun`：
  - lead 结果不是 `launched`/`already_live` → `deferred`。`leadHandle = registry.getPost(leadAddress)!.handle!`。
  - `args.newRun` → `setRunId(name, null)`、`updateCoordinatorHandle(name, null)`、`dropRequest(\`${name}:run-create\`)`，跳过 run-list，走 create。
  - `args.adoptRun` → `runUse({ id: adoptRun, from: leadHandle })`，`setRunId`、`updateCoordinatorHandle`，`adopted`。
  - 无 `runId` 且无账本行 `<team>:run-create` → `runList()` 过滤 `objective === \`wingline:${name}\``：1 个 → 同 `adoptRun`；>1 个 → `ambiguous`（`candidates`，`retry: \`wl up ${specPath} --adopt-run <id>\``）；0 个 → create。
  - create：`ledgered(deps, { key: \`${name}:run-create\`, team: name, build: () => ({ objective: \`wingline:${name}\`, from: leadHandle }), call: (a) => orca.runCreate(a) })`，写回两列，`created`。
  - 有 `runId` → `terminalList()` 里有 `coordinatorHandle` → `kept`；否则 `runUse({ id, from: leadHandle })` 写回，`reclaimed`；`runUse` 抛 `run_not_found` → `lost`（`retry: \`wl up ${specPath} --new-run\``，`reason` 写"原 Run 已不存在，旧任务无法恢复"）。
  - 捕获 `WinglineError`：`orca` → `failed`；`uncertain` → `uncertain`（`retry: \`wl up ${specPath}\``）；其余上抛。整个 `ensureRun` 保持在 `up()` 已有的 `withTeamLock` 内。
  - 拆分：`ensureRun` 只做分派，`createRun`/`adoptRun`/`keepOrReclaim` 各自一个函数。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/commands/up.test.ts packages/cli` → PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl up establishes, adopts or keeps the orchestration Run and reports dead assignees"`

---

### Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`

**Files:**
- Create：`packages/core/src/commands/task/identity.ts`、`packages/core/test/commands/task/identity.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export interface Actor { address: string; explicit: boolean; handle?: string }   // handle 只在隐式解析时已知
  export async function resolveActor(deps: CommandDeps, as?: string): Promise<Actor | null>
  export async function requireActor(deps: CommandDeps, as?: string): Promise<Actor>      // actor_required
  export async function resolveHandle(deps: CommandDeps, actor: Actor): Promise<string>   // 显式 → locatePost；隐式 → actor.handle；post_offline
  export function isOwnTerminal(deps: CommandDeps, handle: string): boolean               // === env.ORCA_TERMINAL_HANDLE
  export function actorOf(actor: Actor | null): { actor: string; actorSource: ActorSource } // task_log 用：null → human
  ```

- [ ] **Step 1：写失败测试**

```ts
test('explicit --as wins and needs no Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  o.calls.length = 0
  expect(await resolveActor(deps, 'builder@duo')).toEqual({ address: 'builder@duo', explicit: true })
  expect(o.calls).toEqual([])
})
test('implicit: ORCA_TERMINAL_HANDLE is looked up by terminal title', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await resolveActor(deps)).toEqual({ address: 'checker@duo', explicit: false, handle: 'term-c' })
})
test('a terminal whose title is not a registered post resolves to nobody → actor_required whose hint mentions --as and Windows', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-x' } })
  o.terminals.push({ handle: 'term-x', title: 'zsh', connected: true, worktreeId: 'w' })
  expect(await resolveActor(deps)).toBeNull()
  await expect(requireActor(deps)).rejects.toMatchObject({ code: 'actor_required', hint: expect.stringMatching(/--as[\s\S]*Windows/) })
})
test('resolveHandle with explicit --as uses locatePost, never the caller\'s own ORCA_TERMINAL_HANDLE', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await resolveHandle(deps, { address: 'builder@duo', explicit: true })).toBe('term-b')
})
test('resolveHandle implicit returns the env handle without an Orca call', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.calls.length = 0
  expect(await resolveHandle(deps, { address: 'checker@duo', explicit: false, handle: 'term-c' })).toBe('term-c')
  expect(o.calls).toEqual([])
})
test('explicit address with no terminal → post_offline', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  await expect(resolveHandle(deps, { address: 'builder@duo', explicit: true })).rejects.toMatchObject({ code: 'post_offline' })
})
test('actorOf maps to task_log fields', () => {
  expect(actorOf(null)).toEqual({ actor: 'human', actorSource: 'human' })
  expect(actorOf({ address: 'b@duo', explicit: true })).toEqual({ actor: 'b@duo', actorSource: 'explicit' })
  expect(actorOf({ address: 'b@duo', explicit: false, handle: 'h' })).toEqual({ actor: 'b@duo', actorSource: 'implicit' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现**（按签名；隐式分支调用 `deps.orca.terminalList()`，按 `handle` 找终端，`deps.registry.getPost(title)` 存在才算）。`actor_required` 的 hint：`在岗位终端里运行，或加 --as <岗位地址>；Windows 上未验证 Orca 是否设置 ORCA_TERMINAL_HANDLE`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): actor and handle resolution for task commands"`

---

### Task 7：打字前的画面检查与一行通知——`screenGuard` / `notifyPost`

**Files:**
- Create：`packages/core/src/commands/task/notify.ts`、`packages/core/test/commands/task/notify.test.ts`

**Interfaces:**
- Consumes：`OrcaClient.terminalShow`/`terminalSend`（Task 3）、阶段 1 `locatePost`
- Produces（2B 计划 Task 5、Task 8 直接复用，不另写一份）：
  ```ts
  export type ScreenState = 'clear' | 'at_prompt' | 'unknown'
  export const PROMPT_PATTERNS: readonly RegExp[]
  export const SCREEN_TAIL_LINES = 8
  /** 纯函数：取 preview 最后 8 行，任一行命中 PROMPT_PATTERNS → at_prompt；空 → unknown；否则 clear。 */
  export function classifyPreview(preview: string): ScreenState
  /** terminal show：终端不存在 → 'offline'；调用失败 → 'unknown'；否则 classifyPreview。 */
  export async function screenGuard(deps: CommandDeps, handle: string): Promise<ScreenState | 'offline'>
  export type NotifyOutcome = 'notified' | 'notified_unconfirmed' | 'not_notified'
  export interface NotifyResult { outcome: NotifyOutcome; reason?: 'at_prompt' | 'screen_unknown' | 'post_offline' | 'send_failed' }
  /** 永不抛出。text 必须是单行、≤ 600 字符（调用方构造的固定模板）。 */
  export async function notifyPost(deps: CommandDeps, address: string, text: string): Promise<NotifyResult>
  ```

- [ ] **Step 1：写失败测试**

```ts
const r6 = JSON.parse(fs.readFileSync(path.join(repoRoot, 'test/fixtures/receipts/orchestration-r6.json'), 'utf8'))
test('R6 real screens: the (Y/n) wrapper prompt is at_prompt, the idle claude screen is clear', () => {
  expect(classifyPreview(r6['terminal-show-at-yn-prompt'].terminal.preview)).toBe('at_prompt')
  expect(classifyPreview(r6['terminal-show-idle-claude'].terminal.preview)).toBe('clear')
})
test.each([
  'Do you want to proceed?', '❯ 1. Yes', '  › 2) No, and tell Claude what to do', 'Allow this command to run', '[y/N]', '(yes/no)',
  'Press Enter to continue', 'Esc to cancel', 'Do you trust the files in this folder', 'Continue?', 'Overwrite existing file? ',
])('prompt pattern: %s → at_prompt', (line) => {
  expect(classifyPreview(`some output\n${line}`)).toBe('at_prompt')
})
test('only the last 8 lines count; empty preview is unknown', () => {
  expect(classifyPreview(['Do you want to proceed?', ...Array(8).fill('working…')].join('\n'))).toBe('clear')
  expect(classifyPreview('')).toBe('unknown')
  expect(classifyPreview('\n\n')).toBe('unknown')
})
test('notifyPost types only when the screen is clear; turn_started → notified, input only → notified_unconfirmed', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(await notifyPost(deps, 'checker@duo', '[雁阵] 你有新任务 t1')).toEqual({ outcome: 'notified' })
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: '[雁阵] 你有新任务 t1' })
  o.sendStages = ['input_accepted']
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'notified_unconfirmed' })
})
test('notifyPost does not type at a prompt, on an unreadable screen, or to an offline post — and never throws', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.previews.set('term-c', 'Do you want to run this command?\n❯ 1. Yes\n  2. No')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'at_prompt' })
  o.previews.set('term-c', '')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'screen_unknown' })
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'post_offline' })
  expect(o.sent).toEqual([])
})
test('a send failure is reported, not thrown', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.failSendOnce = new WinglineError('uncertain', 'orca_timeout', 't')
  expect(await notifyPost(deps, 'checker@duo', 'x')).toEqual({ outcome: 'not_notified', reason: 'send_failed' })
})
```

`repoRoot` 用 `path.resolve(fileURLToPath(import.meta.url), '../../../../../..')`，与已有契约测试读 fixture 的方式一致（Task 15 统一成一个 `fixture(name)` helper）。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `PROMPT_PATTERNS`（大小写不敏感，逐条对应 spec 第 7.4 节）：`/\(y\/n\)/i`、`/\[y\/n\]/i`、`/\(yes\/no\)/i`、`/^\s*[❯>›]\s*\d+[.)]/`、`/do you want to/i`、`/would you like to/i`、`/\ballow /i`、`/\bapprove/i`、`/press enter/i`、`/esc to cancel/i`、`/trust (this|the) (folder|files|directory)/i`、`/continue\?/i`、`/\?\s*$/`。`notifyPost`：`locatePost(deps.orca, address)` 为空 → `post_offline`；`screenGuard`：`offline` → `post_offline`、`at_prompt` → `at_prompt`、`unknown` → `screen_unknown`；`clear` → `terminalSend({ handle, text, enter: true, waitSubmitSec: 10 })`（与阶段 1 `wl send` 同一常量），`stages` 含 `turn_started` → `notified`，否则 `notified_unconfirmed`；任何抛出 → `send_failed` 并 `deps.warn`。不写 `requests` 行（通知不重试，spec 第 7.3 节）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): screen guard and one-line notifications that never type into a prompt"`

---

### Task 8：gate 命令执行——`runGate` / `gateCwd` / 输出文件

**Files:**
- Create：`packages/core/src/commands/task/gate-exec.ts`、`packages/core/test/commands/task/gate-exec.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export interface GateExecResult { passed: boolean; output: string; timedOut: boolean }   // output 是完整输出（不截断）
  export function runGate(command: string | null, opts: { cwd: string; timeoutMs: number }): Promise<GateExecResult>
  /** 岗位 worktree 根目录：posts.worktree 是 path:<abs> → abs；否则 worktreeShow；读不出 → gate_cwd_unknown（不退回 process.cwd()）。 */
  export async function gateCwd(deps: CommandDeps, address: string): Promise<string>
  export const GATE_BODY_LIMIT = 4000
  /** 写 ~/.wingline/logs/<team>/gate-<task>-<epoch>-<n>.txt，写之前删除同目录 7 天前的 gate-*.txt；返回路径。 */
  export function writeGateOutput(home: string, team: string, taskId: string, epoch: number, n: number, output: string): string
  /** --body：空输出 → null；multilineSafe 或无换行 → 末尾 GATE_BODY_LIMIT 字符；否则一行"gate 输出见 <路径>"。 */
  export function gateBody(output: string, file: string, multilineSafe: boolean): string | null
  ```

- [ ] **Step 1：写失败测试**

```ts
const opts = (over: Partial<{ cwd: string; timeoutMs: number }> = {}) => ({ cwd: process.cwd(), timeoutMs: 30_000, ...over })
test('null command passes without spawning', async () => {
  expect(await runGate(null, opts())).toEqual({ passed: true, output: '', timedOut: false })
})
test('exit code decides pass/fail; stdout and stderr are captured in full', async () => {
  expect((await runGate('node -e "process.exit(0)"', opts())).passed).toBe(true)
  const r = await runGate('node -e "console.log(\'hi\'); console.error(\'err\'); process.stdout.write(\'x\'.repeat(6000)); process.exit(1)"', opts())
  expect(r).toMatchObject({ passed: false, timedOut: false })
  expect(r.output).toContain('hi'); expect(r.output).toContain('err'); expect(r.output.length).toBeGreaterThan(6000)
})
test('quotes, &&, and 中文 survive the shell round trip', async () => {
  const r = await runGate('node -e "console.log(\'a \\"b\\" 中文\')" && node -e "process.exit(0)"', opts())
  expect(r).toMatchObject({ passed: true, output: expect.stringContaining('a "b" 中文') })
})
test('runs in the given cwd', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-'))
  expect((await runGate('node -e "process.stdout.write(process.cwd())"', opts({ cwd: dir }))).output).toContain(fs.realpathSync(dir))
})
test('timeout kills the whole process tree, counts as a failure and says so', async () => {
  const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-')), 'pid')
  process.env.WL_PID_FILE = pidFile
  const cmd = 'node -e "const c=require(\'child_process\').spawn(process.execPath,[\'-e\',\'require(\\"fs\\").writeFileSync(process.env.WL_PID_FILE,String(process.pid));setTimeout(()=>{},60000)\'],{stdio:\'ignore\'});setTimeout(()=>{},60000)"'
  const r = await runGate(cmd, opts({ timeoutMs: 1500 }))
  expect(r).toMatchObject({ passed: false, timedOut: true, output: expect.stringContaining('（gate 超时，已终止）') })
  const grandchild = Number(fs.readFileSync(pidFile, 'utf8'))
  await new Promise((res) => setTimeout(res, 300))
  expect(() => process.kill(grandchild, 0)).toThrow()
})
test('gateCwd: path: selector directly; other selectors via worktree show; unreadable → gate_cwd_unknown', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  expect(await gateCwd(deps, 'builder@duo')).toBe(os.tmpdir())                // seedRunningTeam 给 builder 的是 path:<tmpdir>
  registry.upsertPost({ ...registry.getPost('checker@duo')!, worktree: 'id:w1' })
  o.worktreePaths.set('id:w1', '/repo/wt')
  expect(await gateCwd(deps, 'checker@duo')).toBe('/repo/wt')
  o.faults.push({ method: 'worktreeShow', when: 'before', error: new WinglineError('orca', 'selector_not_found', 'x') })
  await expect(gateCwd(deps, 'checker@duo')).rejects.toMatchObject({ code: 'gate_cwd_unknown' })
})
test('writeGateOutput / gateBody: full output in the file, the tail in --body, one line when multiline is unsafe', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-home-'))
  const out = 'head\n' + 'y'.repeat(5000) + '\nTAIL'
  const file = writeGateOutput(home, 'duo', 't1', 0, 1, out)
  expect(file).toBe(path.join(home, 'logs', 'duo', 'gate-t1-0-1.txt'))
  expect(fs.readFileSync(file, 'utf8')).toBe(out)
  const body = gateBody(out, file, true)!
  expect(body.length).toBe(GATE_BODY_LIMIT); expect(body.endsWith('TAIL')).toBe(true)
  expect(gateBody(out, file, false)).toBe(`gate 输出见 ${file}`)
  expect(gateBody('', file, true)).toBeNull()
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `runGate`：`spawn(command, { shell: true, cwd, detached: process.platform !== 'win32', windowsHide: true })`（全项目唯一 `shell: true`，注释写明 spec 第 3 节约束 6 与总纲 §2.4）；合并 stdout+stderr；超时：POSIX `process.kill(-child.pid, 'SIGKILL')`（进程组），Windows `spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { shell: false })`；输出末尾追加 `\n（gate 超时，已终止）`。环境变量继承 `process.env`。`gateCwd` 读 `registry.getPost(address)!.worktree`。拆分：`spawnGate`、`killTree`、`gateCwd` 各自一个函数。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): gate execution in the post worktree with timeout, tree kill and full output files"`

---

### Task 9：通用前置、查询、变迁记录、`staleReasons`

**Files:**
- Create：`packages/core/src/commands/task/preflight.ts`、`query.ts`、`log.ts`、`frozen.ts`
- Create：`packages/core/test/commands/task/query.test.ts`

**Interfaces:**
- Consumes：Task 1–3、6
- Produces：
  ```ts
  // preflight.ts —— spec 第 10 节"通用前置"
  /** orca status 不可达 → orca/runtime_unavailable（hint: orca open，不写任何账本行）；团队未知 → team_unknown；Run 未建 → run_not_ready；
   *  spec 文件不存在 → spec_not_found；specHash ≠ teams.spec_hash → team_spec_changed。list/show 用 { orca: false } 跳过 status 检查。 */
  export async function taskPreflight(deps: CommandDeps, team: string, o?: { orca?: boolean }): Promise<{ team: TeamRow; spec: TeamSpec }>
  // log.ts —— task_log 的唯一写入口
  export function logTask(deps: CommandDeps, e: { team: string; taskId: string; actor: Actor | null; action: TaskAction; detail?: unknown; epoch?: number }): void
  // frozen.ts —— 2A 里恒为 false；2B 计划 Task 3 改成读 frozen_posts（2A 的调用点因此不用再改）
  export function isPostFrozen(deps: CommandDeps, address: string): boolean
  // query.ts
  export interface TaskRow {
    id: string; status: OrchestrationTaskStatus; title: string; parentId: string | null; tags: string[]; kind: TaskKind
    plan: string | null; claimedBy: string | null; assigneeHandle: string | null; dispatchId: string | null
    epoch: number; gateFailures: number; readySince: string | null; dispatchedAt: string | null; result: string | null
  }
  export function mustTeamReady(deps: CommandDeps, name: string): TeamRow                 // team_unknown / run_not_ready
  export async function fetchTasks(deps: CommandDeps, team: string): Promise<TaskRow[]>   // taskList ⋈ task_ext（无 ext 行时 tags [], kind 'work', 其余 null/0）
  export async function findTask(deps: CommandDeps, team: string, id: string): Promise<TaskRow>                       // task_not_found
  export async function findTaskAnywhere(deps: CommandDeps, id: string): Promise<{ team: TeamRow; task: TaskRow }>  // task_ext.team 优先，否则遍历有 Run 的团队
  export async function listTasks(deps: CommandDeps, a: { team?: string; mine?: boolean; status?: string; tags?: string[]; as?: string }): Promise<TaskRow[]>
  export interface ShownTask extends TaskRow { outcome: string | null; reportedBy: string | null; closure: DoneClosure | null; history?: TaskLogRow[] }
  export async function showTask(deps: CommandDeps, a: { id: string; team?: string; history?: boolean }): Promise<ShownTask>
  // —— 卡住的任务（spec 第 10 节 --stale；2B 的巡查与 wl attention 复用）——
  export type StaleReason = 'done_unfinished' | 'call_uncertain' | 'dead_assignee' | 'owner_idle' | 'bypassed' | 'blocked_waiting'
  export interface StaleItem { taskId: string; title: string; reason: StaleReason; owner: string | null; since: string | null; command: string; gateId?: string }
  export interface StaleInput {
    team: string; tasks: TaskRow[]; alive: ReadonlySet<string>
    unfinished: DoneVerdictRow[]; verdicts: ReadonlyMap<string, DoneVerdictRow[]>      // 按 task_id
    open: Array<{ id: string; state: RequestState; updatedAt: string }>; gates: Array<{ gateId: string; taskId: string }>
  }
  export interface StaleThresholds { ownerIdleMinutes: number; uncertainMinutes: number }
  export const DEFAULT_STALE: StaleThresholds   // { ownerIdleMinutes: 30, uncertainMinutes: 1 }
  export function staleReasons(input: StaleInput, now: Date, th?: StaleThresholds): StaleItem[]      // 纯函数
  export async function gatherStaleInput(deps: CommandDeps, team: string): Promise<StaleInput>      // 一次 taskList + 一次 terminalList + 本地表
  export async function listStale(deps: CommandDeps, team: string): Promise<StaleItem[]>
  ```
  `DoneClosure` 在 Task 12 定义（`{ kind: 'completed' | 'handed_to' | 'sent_for_review' | 'escalated'; targets?: string[] }`），本任务先在 `query.ts` 里声明并由 Task 12 导入，避免循环依赖。

- [ ] **Step 1：写失败测试**

```ts
const task = (over: Partial<OrchestrationTask>): OrchestrationTask => ({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null, ...over })
test('taskPreflight: unreachable Orca, unknown team, no Run, missing spec, changed spec', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(taskPreflight(deps, 'ghost')).rejects.toMatchObject({ code: 'team_unknown' })
  o.reachable = false
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ kind: 'orca', hint: expect.stringContaining('orca open') })
  expect(await taskPreflight(deps, 'duo', { orca: false })).toMatchObject({ team: { name: 'duo' } })
  o.reachable = true
  const t = registry.getTeam('duo')!
  fs.writeFileSync(t.specPath, fs.readFileSync(t.specPath, 'utf8').replace('model: opus', 'model: sonnet'))   // 团队运行期间改了规格
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'team_spec_changed', hint: expect.stringContaining('wl down') })
  fs.rmSync(t.specPath)
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'spec_not_found' })
  registry.setRunId('duo', null)
  await expect(taskPreflight(deps, 'duo')).rejects.toMatchObject({ code: 'run_not_ready' })
})
test('fetchTasks merges Orca rows with task_ext', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({}))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo', readySince: 'T0' })
  expect(await fetchTasks(deps, 'duo')).toEqual([{ id: 't1', status: 'ready', title: 'a', parentId: null, tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: 'T0', dispatchedAt: null, result: null }])
})
test('list --mine filters by claimed_by, --tags is strict intersection, --status accepts blocked', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'a' }), task({ id: 'b', status: 'blocked' }), task({ id: 'c' }))
  registry.insertTaskExt({ taskId: 'a', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo' })
  registry.insertTaskExt({ taskId: 'b', team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  registry.insertTaskExt({ taskId: 'c', team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  expect((await listTasks(deps, { team: 'duo', mine: true, as: 'builder@duo' })).map((t) => t.id)).toEqual(['a', 'b'])
  expect((await listTasks(deps, { team: 'duo', tags: ['backend'] })).map((t) => t.id)).toEqual(['a'])
  expect((await listTasks(deps, { team: 'duo', status: 'blocked' })).map((t) => t.id)).toEqual(['b'])
})
test('findTaskAnywhere finds the owning team; unknown id → task_not_found', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 't9' })); registry.insertTaskExt({ taskId: 't9', team: 'duo', tags: [], kind: 'work' })
  expect((await findTaskAnywhere(deps, 't9')).team.name).toBe('duo')
  await expect(findTaskAnywhere(deps, 'ghost')).rejects.toMatchObject({ code: 'task_not_found' })
})
test('show --history lists task_log in order with explicit/implicit source', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({}))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  logTask(deps, { team: 'duo', taskId: 't1', actor: null, action: 'create' })
  logTask(deps, { team: 'duo', taskId: 't1', actor: { address: 'builder@duo', explicit: true }, action: 'claim' })
  const s = await showTask(deps, { id: 't1', history: true })
  expect(s.history!.map((h) => [h.action, h.actor, h.actorSource])).toEqual([['create', 'human', 'human'], ['claim', 'builder@duo', 'explicit']])
})

// —— staleReasons：纯函数，六类原因各一条 + 不该报的边界 ——
const NOW = new Date('2026-10-15T12:00:00.000Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const row = (over: Partial<TaskRow>): TaskRow => ({ id: 't', status: 'ready', title: 'T', parentId: null, tags: [], kind: 'work', plan: null, claimedBy: null, assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null, result: null, ...over })
const verdict = (over: Partial<DoneVerdictRow>): DoneVerdictRow => ({ taskId: 't', epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx', reportFrom: 'h', body: null, result: null, finishedAt: null, createdAt: ago(5), ...over })
const input = (over: Partial<StaleInput>): StaleInput => ({ team: 'duo', tasks: [], alive: new Set(['term-b', 'term-c']), unfinished: [], verdicts: new Map(), open: [], gates: [], ...over })
test('staleReasons: each reason with its copy-paste command', () => {
  const report = JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded' })
  const items = staleReasons(input({
    tasks: [
      row({ id: 'u', status: 'completed', claimedBy: 'builder@duo' }),
      row({ id: 'd', status: 'dispatched', claimedBy: 'checker@duo', assigneeHandle: 'term-old' }),
      row({ id: 'i', status: 'ready', claimedBy: 'checker@duo', readySince: ago(31) }),
      row({ id: 'b', status: 'completed', claimedBy: 'builder@duo', result: report }),
      row({ id: 'g', status: 'blocked', claimedBy: 'builder@duo' }),
      row({ id: 'c', status: 'ready', claimedBy: 'builder@duo', readySince: ago(1) }),
    ],
    unfinished: [verdict({ taskId: 'u' })],
    verdicts: new Map([['u', [verdict({ taskId: 'u' })]]]),
    open: [{ id: 'dispatch:c:0', state: 'uncertain', updatedAt: ago(2) }],
    gates: [{ gateId: 'gate-7', taskId: 'g' }],
  }), NOW)
  expect(items.map((x) => [x.taskId, x.reason, x.command])).toEqual([
    ['u', 'done_unfinished', 'wl task done u --as builder@duo'],
    ['c', 'call_uncertain', 'wl task start c --as builder@duo'],
    ['d', 'dead_assignee', 'wl task recover d'],
    ['i', 'owner_idle', 'wl task start i --as checker@duo'],
    ['b', 'bypassed', 'wl task done b --as builder@duo'],
    ['g', 'blocked_waiting', 'wl task resolve gate-7 --resolution <决定>'],
  ])
})
test('staleReasons boundaries: owner busy is queueing not idle; a done row means not bypassed; fresh uncertain rows are not stale; review tasks are never bypassed', () => {
  const report = JSON.stringify({ provenance: 'worker_report', outcome: 'succeeded' })
  expect(staleReasons(input({
    tasks: [
      row({ id: 'q', status: 'ready', claimedBy: 'checker@duo', readySince: ago(60) }),
      row({ id: 'w', status: 'dispatched', claimedBy: 'checker@duo', assigneeHandle: 'term-c' }),
      row({ id: 'k', status: 'completed', claimedBy: 'builder@duo', result: report }),
      row({ id: 'r', status: 'completed', kind: 'review', claimedBy: 'checker@duo', result: report }),
      row({ id: 'n', status: 'ready', claimedBy: 'builder@duo', readySince: ago(1) }),
    ],
    verdicts: new Map([['k', [verdict({ taskId: 'k', finishedAt: ago(1) })]]]),
    open: [{ id: 'dispatch:n:0', state: 'pending', updatedAt: ago(0.5) }],
  }), NOW)).toEqual([])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `taskPreflight`：`o.orca !== false` 时 `deps.orca.status()`，`reachable` 为假 → `new WinglineError('orca', 'runtime_unavailable', 'Orca 运行时不可达', { hint: '先执行 orca open（或打开 Orca 应用）' })`；`mustTeamReady`；`fs.existsSync(specPath)` 否 → `spec_not_found`；`specHash(loadTeamSpec(specPath))` 与 `teams.spec_hash` 比较。
  - `logTask`：`epoch` 缺省读 `getTaskExt(taskId)?.epoch ?? 0`；`actorOf(actor)` 填两列。
  - `isPostFrozen`：`return false`，文件头注释"阶段 2B 计划 Task 3 改为读 frozen_posts"。
  - `listTasks` 的 `mine` 用 `requireActor(deps, a.as)` 的地址比 `claimedBy`。
  - `showTask`：`result` 解析出 `outcome`/`reportedBy`；`closure` 取最近一次 `task_done.result` 里的 `closure`；`history` 时附 `listTaskLog`。
  - `staleReasons` 的判定按 spec 第 10 节表格，顺序固定为 `done_unfinished`、`call_uncertain`、`dead_assignee`、`owner_idle`、`bypassed`、`blocked_waiting`，同一任务可以出现多次。`call_uncertain` 从账本键解析任务：`dispatch:<t>:<e>` → `wl task start <t> --as <owner>`；`done:<t>:…` → `wl task done <t> --as <owner>`；`recover:<t>:…` → `wl task recover <t>`；`resolve:<gate>` → 经 `gates` 找任务，命令 `wl task resolve <gate> --resolution <原来的决定>`；`oneshot:*` 不归任何任务，跳过。`owner_idle` 要求主人没有任何 `dispatched` 任务（spec 第 10 节）。`bypassed` 要求 `kind = work`、`result.provenance = worker_report`、`verdicts` 里没有该任务当前 `epoch` 的行。`owner` 为空时命令里的 `--as` 写 `<主人>`。拆分：每类原因一个小函数，`staleReasons` 只做拼接与排序。
  - `gatherStaleInput`：`fetchTasks` + `terminalList`（`alive` = handle 集合）+ `listUnfinishedVerdicts` + 对终态任务逐个 `listVerdictsOf` + `listOpenRequests('')` + `listGates`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): task preflight, queries, task_log and stale-task detection"`

---

### Task 10：派发与通知、`create`、`plan`

**Files:**
- Create：`packages/core/src/commands/task/dispatch.ts`、`create.ts`、`plan.ts`
- Create：`packages/core/test/commands/task/dispatch.test.ts`、`create.test.ts`

**Interfaces:**
- Consumes：Task 2–7、9
- Produces：
  ```ts
  // dispatch.ts
  export type Delivery = 'notified' | 'notified_unconfirmed' | 'not_notified' | 'self' | 'queued'
  export type DispatchOutcome =
    | { status: 'dispatched'; dispatchId: string; self: boolean; replayed: boolean }
    | { status: 'queued'; busyWith: string }                                   // 目标终端已有进行中的派发（spec 第 7.3 节）
  export function isBusyError(err: unknown): boolean                            // orca/runtime_error 且 message 含 "already has an active dispatch"
  export async function dispatchTo(deps: CommandDeps, team: string, taskId: string, target: { address: string; handle: string }): Promise<DispatchOutcome>
  /** 派发之后告诉对方（spec 第 7.3 节）：self → 'self'；queued → 发排队通知，'queued'；dispatched → 发新任务通知并映射 NotifyResult。写 task_log。 */
  export async function announce(deps: CommandDeps, team: string, task: { id: string; title: string }, target: { address: string }, d: DispatchOutcome, actor: Actor | null):
    Promise<{ delivery: Delivery; reason?: NotifyResult['reason']; busyWith?: string }>
  export const SPEC_FOOTER: string   // "完成后运行 wl task done <本任务 id>（不要直接用 orca orchestration send 上报）"
  export function taskSpec(deps: CommandDeps, head: string): string   // multilineSafe 时 head + "\n\n" + footer，否则用"。"连成一行
  // create.ts
  export async function createTask(deps: CommandDeps, a: { team: string; title: string; post?: string; tags?: string[]; parent?: string; as?: string; retryRequest?: string }):
    Promise<{ id: string; delivery?: Delivery; reason?: string; busyWith?: string }>
  // plan.ts
  export async function planTask(deps: CommandDeps, a: { id: string; text: string }): Promise<void>
  ```
  通知文本（固定模板，单行）：新任务 `[雁阵] 你有新任务 <id>：<标题>。查看：wl task show <id>；完成后运行：wl task done <id>（不要直接用 orca orchestration send 上报）`；排队 `[雁阵] 你有排队任务 <id>：<标题>，手上的任务完成后运行 wl task start <id>`。标题先去掉换行与控制字符、截到 80 字符。

- [ ] **Step 1：写失败测试**

```ts
// dispatch.test.ts
const readyTask = async (o: FakeOrca, deps: CommandDeps, owner = 'checker@duo') => {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: owner }); return id
}
const C = { address: 'checker@duo', handle: 'term-c' }
test('dispatch never injects; to another post the result is dispatched, not self; dispatched_at is written', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await readyTask(o, deps)
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  expect(o.callsOf('dispatch')).toEqual([{ task: id, to: 'term-c', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getTaskExt(id)!.dispatchedAt).toEqual(expect.any(String))
})
test('to the caller\'s own terminal: self', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  expect(await dispatchTo(deps, 'duo', await readyTask(o, deps), C)).toMatchObject({ status: 'dispatched', self: true })
})
test('target already holds a dispatched task → queued without calling dispatch and without a ledger row', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const busy = await readyTask(o, deps); await dispatchTo(deps, 'duo', busy, C)
  const id = await readyTask(o, deps)
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'queued', busyWith: busy })
  expect(o.callsOf('dispatch')).toHaveLength(1)
  expect(registry.getRequest(`dispatch:${id}:0`)).toBeNull()
})
// spec 第 7.3 节：检查与派发之间对方刚好接了别的任务
test('the target became busy between the check and the call: Orca runtime_error → request-show absent → row dropped → queued', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const other = await readyTask(o, deps); const id = await readyTask(o, deps)
  o.onMutate = () => { if (!o.tasks.some((t) => t.status === 'dispatched')) { const t = o.tasks.find((x) => x.id === other)!; t.status = 'dispatched'; t.assigneeHandle = 'term-c'; t.dispatchId = 'ctx-9' } }
  expect(await dispatchTo(deps, 'duo', id, C)).toEqual({ status: 'queued', busyWith: other })
  expect(registry.getRequest(`dispatch:${id}:0`)).toBeNull()
})
test('already dispatched to the same target: no second dispatch', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C); await dispatchTo(deps, 'duo', id, C)
  expect(o.callsOf('dispatch')).toHaveLength(1)
})
test('task returned to ready after its terminal closed: next dispatch bumps epoch (CAS) and uses a new ledger key', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, C)
  await o.terminalClose({ handle: 'term-c' })
  o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(registry.getRequest(`dispatch:${id}:1`)!.state).toBe('done')
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('epoch_bump')
})
test('this round\'s dispatch row is done and the task has since completed: stored result, no Orca write, epoch unchanged', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  const first = await dispatchTo(deps, 'duo', id, C)
  await o.workerDone({ taskId: id, dispatchId: (first as { dispatchId: string }).dispatchId, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-c' })
  o.orch.length = 0
  expect(await dispatchTo(deps, 'duo', id, C)).toMatchObject({ status: 'dispatched', dispatchId: 'ctx-1' })
  expect(o.orch).toEqual([])
  expect(registry.getTaskExt(id)!.epoch).toBe(0)
})
test('dispatch landed but returned runtime_timeout: settled as dispatched in the same call (no task_not_open)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  o.faults.push({ method: 'dispatch', when: 'after', error: new WinglineError('orca', 'runtime_timeout', 't') })
  expect(await dispatchTo(deps, 'duo', id, C)).toMatchObject({ status: 'dispatched', dispatchId: 'ctx-1', replayed: true })
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
})
test('a replayed dispatch whose task went back to ready (terminal closed) bumps epoch and dispatches once more', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  o.faults.push({ method: 'dispatch', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await expect(dispatchTo(deps, 'duo', id, C)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect(await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })).toMatchObject({ status: 'dispatched' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
})
test('no ledger row and the task is not ready → task_not_open', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await o.gateCreate({ task: id, question: 'q', from: 'coord-1' })
  await expect(dispatchTo(deps, 'duo', id, C)).rejects.toMatchObject({ code: 'task_not_open' })
})
test('announce: dispatched → new-task line through notifyPost; queued → queued line; self → nothing typed; the screen guard is respected', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const t = { id: 'task-1', title: '实现\n登录' }
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false }, null)).toEqual({ delivery: 'notified' })
  expect(o.sent.at(-1)!.text).toBe('[雁阵] 你有新任务 task-1：实现 登录。查看：wl task show task-1；完成后运行：wl task done task-1（不要直接用 orca orchestration send 上报）')
  expect(await announce(deps, 'duo', t, C, { status: 'queued', busyWith: 'task-0' }, null)).toEqual({ delivery: 'queued', busyWith: 'task-0' })
  expect(o.sent.at(-1)!.text).toContain('你有排队任务 task-1')
  const n = o.sent.length
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: true, replayed: false }, null)).toEqual({ delivery: 'self' })
  o.previews.set('term-c', 'Allow this edit? (y/n)')
  expect(await announce(deps, 'duo', t, C, { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false }, null)).toEqual({ delivery: 'not_notified', reason: 'at_prompt' })
  expect(o.sent.length).toBe(n)
})

// create.test.ts
test('create without --post: task-create via P2, ready, task_ext kind work with ready_since, spec carries the footer, task_log create', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: '顺手记下', tags: ['bug'] })
  expect(o.callsOf('taskCreate')[0]).toEqual({ spec: `human: 顺手记下\n\n${SPEC_FOOTER}`, taskTitle: '顺手记下', run: 'run-1', from: 'coord-1', retryRequest: expect.any(String) })
  expect(o.callsOf('dispatch')).toEqual([])
  expect(registry.getTaskExt(r.id)).toMatchObject({ tags: ['bug'], kind: 'work', claimedBy: null, readySince: expect.any(String) })
  expect(registry.listTaskLog(r.id).map((l) => l.action)).toEqual(['create'])
})
test('on Windows (.cmd, multiline unsafe) the spec is one line', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { multilineSafe: false })
  await createTask(deps, { team: 'duo', title: 't', as: 'builder@duo' })
  expect(o.callsOf('taskCreate')[0]!.spec).toBe(`builder@duo: t。${SPEC_FOOTER}`)
})
test('create --post: claimed_by = post, dispatched (no inject) and notified', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(registry.getTaskExt(r.id)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')[0]).toEqual({ task: r.id, to: 'term-c', from: 'coord-1', retryRequest: expect.any(String) })
  expect(r.delivery).toBe('notified')
})
test('create --post on a busy post: task created and owned, queued, queued line sent', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const first = await createTask(deps, { team: 'duo', title: 'a', post: 'checker@duo' })
  const r = await createTask(deps, { team: 'duo', title: 'b', post: 'checker@duo' })
  expect(r).toMatchObject({ delivery: 'queued', busyWith: first.id })
  expect(o.tasks.find((t) => t.id === r.id)!.status).toBe('ready')
})
test('create --post: dispatch uncertain → hint carries --retry-request; rerun with it does not create a second task', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo', retryRequest: id })
  expect(o.tasks).toHaveLength(1)
  expect(o.tasks[0]).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(o.callsOf('taskCreate')).toHaveLength(1)
})
test('create timed out, then the coordinator changed: --retry-request replays with the original --from, one task', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  const err = await createTask(deps, { team: 'duo', title: 't' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err.hint).toContain('--from coord-1')
  await o.runUse({ id: 'run-1', from: 'term-dsp' }); registry.updateCoordinatorHandle('duo', 'term-dsp')
  const r = await createTask(deps, { team: 'duo', title: 't', retryRequest: id })
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ retryRequest: id, from: 'coord-1' })
  expect(o.tasks).toHaveLength(1); expect(r.id).toBe(o.tasks[0]!.id)
})
test('create --post on an offline post fails before task-create', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_offline' })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('planTask writes the plan under the team lock and logs it; terminal tasks are rejected', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push({ id: 'p1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null },
               { id: 'p2', status: 'completed', title: 'b', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  registry.insertTaskExt({ taskId: 'p1', team: 'duo', tags: [], kind: 'work' }); registry.insertTaskExt({ taskId: 'p2', team: 'duo', tags: [], kind: 'work' })
  await planTask(deps, { id: 'p1', text: '先读代码' })
  expect(registry.getTaskExt('p1')!.plan).toBe('先读代码')
  expect(registry.listTaskLog('p1').map((l) => l.action)).toEqual(['plan'])
  await expect(planTask(deps, { id: 'p2', text: 'x' })).rejects.toMatchObject({ code: 'task_terminal' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `dispatchTo`（spec 第 9.4 节）：①读 `task_ext`（无行按 epoch 0）、一次 `taskList`；②按键 `dispatch:<id>:<epoch>` 分支：`done` 且任务 `ready` → `bumpEpoch(team, id, epoch, getVerdict(id, epoch)?.verdict === 'escalate')`，写 `task_log`（`epoch_bump`），换键走③；`done` 且其他状态 → 返回存下的结果；无行且任务不是 `ready` → `task_not_open`；`pending`/`uncertain` → 走④；③忙检查：`tasks` 里有别的任务 `dispatched` 且 `assigneeHandle === target.handle` → `queued`；④`ledgered(deps, { key, team, build: (t) => ({ task: id, to: target.handle, from: t.coordinatorHandle!, self: isOwnTerminal(deps, target.handle) }), call: async ({ self, ...a }) => { const r = await deps.orca.dispatch(a); return { status: 'dispatched', dispatchId: r.dispatchId, self, replayed: r.replayed } }, beforeReplay: async (s) => (alive(s.to) ? 'replay' : 'settle') })`；捕获 `isBusyError` → 再 `taskList` 找出占用者，返回 `queued`；成功写 `setDispatchedAt`；⑤结果 `replayed` 时再 `taskList`：`dispatched` 给了目标 → 返回；`ready` → `bumpEpoch` 后回到③（只此一次）；其他 → 返回。`self` 随参数落盘但不传给 Orca。拆分：`currentRound`、`busyWith`、`ledgerDispatch`、`confirmReplay`。
  - `announce`：`self` → `{ delivery: 'self' }`；`queued` → `notifyPost(排队文本)` 后 `{ delivery: 'queued', busyWith }`（排队通知失败不改变 `queued`）；`dispatched` → `notifyPost(新任务文本)` 映射为 `notified`/`notified_unconfirmed`/`not_notified`（带 `reason`）。写 `task_log`：`start` 或 `queued`，再一条 `notify`（`detail` 带结果）。
  - `create.ts`：`taskPreflight`；给了 `post` 先 `locatePost`（无 → `post_offline`，在任何 Orca 写调用之前）；`actor = await resolveActor(deps, a.as)`；`id = a.retryRequest ?? randomUUID()`；`oneShot(deps, { team, retryRequest: a.retryRequest, id, fromReceipt: (r) => r.task?.id ? { id: r.task.id, replayed: true } : null, retryHint: (rid) => \`${重建出的同一条 wl task create 命令} --retry-request ${rid}\`, build: (t) => ({ spec: taskSpec(deps, \`${actor?.address ?? 'human'}: ${a.title}\`), taskTitle: a.title, run: t.runId!, from: t.coordinatorHandle!, ...(a.parent ? { parent: a.parent } : {}) }), call: (x) => deps.orca.taskCreate(x) })`；`insertTaskExt({ taskId, team, tags, kind: 'work', claimedBy: a.post ?? null, readySince: now })`；`logTask(create)`；给了 `post` → `dispatchTo` + `announce`，`dispatchTo` 抛出的 `uncertain` 在这里改写 hint 为同一条 `wl task create … --retry-request <id>（本次协调者 --from <handle>）`。重跑时若 `dispatch` 行已 `done`，`announce` 会再发一次通知——这是可接受的冗余（一行提醒，经画面检查）。
  - `plan.ts`：`findTaskAnywhere` → `taskPreflight` → `withTeamLock` 内检查状态（`completed`/`failed` → `task_terminal`）并 `setPlan`、`logTask(plan)`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): dispatchTo with busy detection, announce, wl task create and plan"`

---

### Task 11：`wl task claim` / `release` / `reassign` / `start`

**Files:**
- Create：`packages/core/src/commands/task/claim.ts`、`start.ts`、`packages/core/test/commands/task/claim-start.test.ts`
- Modify：`packages/core/test/spec/helpers.ts`（加 `SELF_CLAIM_YAML`：builder `self_claim: true`、`tags: [backend]`、`plan_first: true`）

**Interfaces:**
- Produces：
  ```ts
  export async function claimTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<void>
  export async function releaseTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<void>
  export async function reassignTask(deps: CommandDeps, a: { id: string; to: string; as?: string }): Promise<{ notify: NotifyResult }>
  export async function startTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<{ delivery: Delivery; reason?: string; already?: true }>
  ```
  团队取自调用方地址（`reassign` 取自任务所在团队）的 `@` 后半段。

- [ ] **Step 1：写失败测试**

```ts
const seed = (over: Parameters<typeof seedRunningTeam>[1] = {}) => {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: SELF_CLAIM_YAML, ...over })
  const add = async (tags: string[] = [], claimedBy: string | null = null) => {
    const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
    s.registry.insertTaskExt({ taskId: id, team: 'duo', tags, kind: 'work', claimedBy }); return id
  }
  return { o, ...s, add }
}
test('claim: self_claim disabled → self_claim_disabled', async () => {
  const { deps, add } = seed({ yaml: DUO_YAML })
  await expect(claimTask(deps, { id: await add(), as: 'builder@duo' })).rejects.toMatchObject({ code: 'self_claim_disabled' })
})
test('claim: tags must intersect; empty task tags match anyone with self_claim; task_log claim', async () => {
  const { deps, registry, add } = seed()
  await expect(claimTask(deps, { id: await add(['frontend']), as: 'builder@duo' })).rejects.toMatchObject({ code: 'tags_mismatch' })
  const id = await add([])
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actorSource])).toEqual([['claim', 'explicit']])
})
test('claim works on a task created in the Orca UI (no task_ext row yet)', async () => {
  const { o, deps, registry } = seed()
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 'ui', run: 'run-1', from: 'coord-1' })
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)).toMatchObject({ team: 'duo', claimedBy: 'builder@duo' })
})
test('claim: an already-claimed or non-ready task → task_not_open', async () => {
  const { o, deps, add } = seed()
  await expect(claimTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
  const id = await add(); await o.gateCreate({ task: id, question: 'q', from: 'coord-1' })
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('claim while another holder has the team lock → team_busy immediately', async () => {
  const { deps, registry, add } = seed(); const id = await add()
  let release!: () => void
  const held = registry.withTeamLock('duo', () => new Promise<void>((res) => { release = res }))
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'team_busy' })
  release(); await held
  await claimTask(deps, { id, as: 'builder@duo' })
})
test('release: only the owner; dispatched → task_dispatched; clears the owner and refreshes ready_since', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo')
  await expect(releaseTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  await releaseTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)).toMatchObject({ claimedBy: null, readySince: expect.any(String) })
  const d = await add([], 'builder@duo'); await o.dispatch({ task: d, to: 'term-b', from: 'coord-1' })
  await expect(releaseTask(deps, { id: d, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_dispatched', hint: expect.stringContaining('wl task escalate') })
})
test('reassign: anyone; unknown target → post_unknown; ready → new owner notified; dispatched → task_dispatched; terminal → task_terminal', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo')
  await expect(reassignTask(deps, { id, to: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  expect(await reassignTask(deps, { id, to: 'checker@duo' })).toEqual({ notify: { outcome: 'notified' } })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: expect.stringContaining(`任务 ${id} 转给了你`) })
  const d = await add([], 'builder@duo'); await o.dispatch({ task: d, to: 'term-b', from: 'coord-1' })
  await expect(reassignTask(deps, { id: d, to: 'checker@duo' })).rejects.toMatchObject({ code: 'task_dispatched' })
  const done = await add([], 'builder@duo'); o.tasks.find((t) => t.id === done)!.status = 'completed'
  await expect(reassignTask(deps, { id: done, to: 'checker@duo' })).rejects.toMatchObject({ code: 'task_terminal' })
})
test('start: not claimed by you / plan required', async () => {
  const { deps, add } = seed()
  await expect(startTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  await expect(startTask(deps, { id: await add([], 'builder@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'plan_required' })
})
test('start while the post already holds a dispatched task → post_busy naming that task', async () => {
  const { deps, registry, add } = seed()
  const a = await add([], 'builder@duo'); const b = await add([], 'builder@duo')
  registry.setPlan('duo', a, 'p'); registry.setPlan('duo', b, 'p')
  await startTask(deps, { id: a, as: 'builder@duo' })
  await expect(startTask(deps, { id: b, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_busy', hint: expect.stringContaining(a) })
})
test('start by the post itself (implicit): dispatched to its own terminal, nothing typed', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  expect(await startTask(deps, { id })).toEqual({ delivery: 'self' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b' })
  expect(o.sent).toEqual([])
})
test('start --as builder from checker\'s terminal: dispatched to builder and builder is notified', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  expect(await startTask(deps, { id, as: 'builder@duo' })).toEqual({ delivery: 'notified' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b' })
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b' })
})
test('start on a task already dispatched to another handle → task_not_open', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  await expect(startTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('start rerun after success is a no-op', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo'); registry.setPlan('duo', id, 'p')
  await startTask(deps, { id, as: 'builder@duo' })
  expect(await startTask(deps, { id, as: 'builder@duo' })).toMatchObject({ already: true })
  expect(o.callsOf('dispatch')).toHaveLength(1)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `claim.ts`：`claimTask`：`requireActor` → 团队 → `taskPreflight` → 找岗位（无 → `post_unknown`）→ `!selfClaim` → `self_claim_disabled` → `withTeamLock(team, async () => { findTask；status !== 'ready' || claimedBy → task_not_open；tags 不相交 → tags_mismatch；setClaimedBy；logTask(claim) })`。`releaseTask`：同样的锁；`ext.claimedBy !== actor` → `not_claimed_by_you`；`dispatched` → `task_dispatched`（hint"先 `wl task escalate <id>` 收回派发，或完成后 `wl task done`"）；`completed`/`failed` → `task_terminal`；`setClaimedBy(null)`、`setReadySince(now)`、`logTask(release)`。`reassignTask`：`findTaskAnywhere` → `taskPreflight` → 目标不在规格岗位里 → `post_unknown` → `isPostFrozen(target)` → `post_frozen`（2A 恒不触发）→ 锁内按状态改主人、`ready` 时写 `ready_since`、`logTask(reassign)`；锁外 `notifyPost`。
  - `start.ts`：`requireActor`；`taskPreflight`；`ext.claimedBy !== actor.address` → `not_claimed_by_you`；`planFirst && !ext.plan` → `plan_required`；`handle = await resolveHandle(deps, actor)`；`findTask`：`dispatched` 且 assignee 是 `handle` → `{ delivery: isOwnTerminal ? 'self' : 'not_notified', already: true }`；`dispatched` 给另一个 handle、`blocked`/终态 → `task_not_open`；`isPostFrozen` → `post_frozen`；`d = await dispatchTo(...)`；`queued` → `post_busy`（hint"岗位手上已有进行中的任务 <busyWith>，先 `wl task done` 或 `wl task release`"）；否则 `announce`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task claim, release, reassign and start"`

---

### Task 12：`wl task done`

**Files:**
- Create：`packages/core/src/commands/task/done.ts`、`packages/core/test/commands/task/done.test.ts`

**Interfaces:**
- Consumes：Task 2/4/6–10
- Produces：
  ```ts
  export type DoneOutcome = 'done' | 'gate_failed' | 'escalated' | 'gate_failed_after_bypass'
  export type LinkDelivery = Delivery | 'skipped_frozen' | 'skipped_offline'
  export interface DoneClosure { kind: 'completed' | 'handed_to' | 'sent_for_review' | 'escalated'; targets?: string[] }
  export interface DoneResult {
    outcome: DoneOutcome
    closure?: DoneClosure
    linkedTasks?: Array<{ target: string; taskId: string; delivery: LinkDelivery }>
    gateId?: string
    gateOutputPath?: string
    replayed?: boolean
  }
  export async function doneTask(deps: CommandDeps, a: { id: string; as?: string }): Promise<DoneResult>
  ```
  `skipped_frozen` 在 2A 里不会产生（`isPostFrozen` 恒为 false），2B 计划 Task 3 只改 `frozen.ts`，不改这里。

- [ ] **Step 1：写失败测试**

```ts
// gate 命令通过环境变量拿计数文件和退出码，避免在命令字符串里嵌 Windows 路径；每跑一次往文件追加一个字符
const GATE = 'node -e "require(\'fs\').appendFileSync(process.env.WL_GATE_LOG,\'x\');console.log(process.cwd());process.exit(+process.env.WL_GATE_EXIT)"'
const gates = (post = 'builder') => `gates:\n  ${post}: '${GATE.replace(/'/g, "''")}'\n`
const yaml = (links = '') => DUO_YAML + gates() + links
let gateLog: string
const gateRuns = () => (fs.existsSync(gateLog) ? fs.readFileSync(gateLog, 'utf8').length : 0)
beforeEach(() => {
  gateLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gl-')), 'log')
  process.env.WL_GATE_LOG = gateLog; process.env.WL_GATE_EXIT = '0'
})
/** builder 名下一个已派发的任务（term-b），返回 { o, deps, registry, id }。 */
async function dispatched(links = '', env: NodeJS.ProcessEnv = { ORCA_TERMINAL_HANDLE: 'term-b' }, y = yaml(links)) {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: y, env })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  o.orch.length = 0; o.calls.length = 0
  return { o, ...s, id }
}
const rt = () => new WinglineError('orca', 'runtime_timeout', 't')
const unreachable = (o: FakeOrca) => o.faults.push({ method: 'requestShow', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'
const AUDITOR = DUO_YAML + '  - id: auditor\n    agent: claude\n    worktree: current\n' + gates() + 'links:\n  builder:\n    reviewed_by: [checker, auditor]\n'
const addAuditor = (o: FakeOrca, registry: Registry) => {
  registry.upsertPost({ address: 'auditor@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-a', status: 'live', isLead: false })
  o.terminals.push({ handle: 'term-a', title: 'auditor@duo', connected: true, worktreeId: 'w' })
}

test('not your task → not_your_task', async () => {
  const { deps, id } = await dispatched()
  await expect(doneTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'not_your_task' })
})
test('gate passes, no links: one worker_done(succeeded) from the post\'s own handle; closure completed; gate ran in the post worktree', async () => {
  const { o, deps, registry, id } = await dispatched()
  const r = await doneTask(deps, { id })
  expect(r).toEqual({ outcome: 'done', closure: { kind: 'completed' }, linkedTasks: [] })
  expect(o.callsOf('workerDone')).toEqual([{ taskId: id, dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', body: expect.stringContaining(fs.realpathSync(os.tmpdir())), run: 'run-1', from: 'term-b', retryRequest: expect.any(String) }])
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('done')
})
test('--as builder from checker\'s terminal reports with builder\'s handle (locatePost), not the caller\'s', async () => {
  const { o, deps, id } = await dispatched('', { ORCA_TERMINAL_HANDLE: 'term-c' })
  await doneTask(deps, { id, as: 'builder@duo' })
  expect(o.callsOf('workerDone')[0]).toMatchObject({ from: 'term-b' })
})
test('reviewed_by with two targets: report first, then one child per target, each dispatched and notified; closure sent_for_review', async () => {
  const { o, deps, registry, id } = await dispatched('', undefined, AUDITOR); addAuditor(o, registry)
  const r = await doneTask(deps, { id })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('taskCreate'))
  const creates = o.callsOf('taskCreate')
  expect(creates).toHaveLength(2); expect(creates[0]!.retryRequest).not.toBe(creates[1]!.retryRequest)
  expect(creates[0]!.spec).toContain(SPEC_FOOTER)
  expect(o.callsOf('dispatch').map((d) => d.to)).toEqual(['term-c', 'term-a'])
  expect(r.linkedTasks!.map((l) => [l.target, l.delivery])).toEqual([['checker@duo', 'notified'], ['auditor@duo', 'notified']])
  expect(r.closure).toEqual({ kind: 'sent_for_review', targets: ['checker@duo', 'auditor@duo'] })
  for (const l of r.linkedTasks!) expect(registry.getTaskExt(l.taskId)).toMatchObject({ kind: 'review', claimedBy: l.target, readySince: expect.any(String) })
})
test('hands_to: closure handed_to; the child is kind work', async () => {
  const { deps, registry, id } = await dispatched('links:\n  builder:\n    hands_to: [checker]\n')
  const r = await doneTask(deps, { id })
  expect(r.closure).toEqual({ kind: 'handed_to', targets: ['checker@duo'] })
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.kind).toBe('work')
})
test('a review task\'s done does not trigger links (mutual review stays finite)', async () => {
  const links = 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n'
  const { o, deps, registry } = await dispatched(links)
  const { id: rev } = await o.taskCreate({ spec: 's', taskTitle: '评审：x', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: rev, team: 'duo', tags: [], kind: 'review', claimedBy: 'checker@duo' })
  await o.dispatch({ task: rev, to: 'term-c', from: 'coord-1' }); o.orch.length = 0
  expect(await doneTask(deps, { id: rev, as: 'checker@duo' })).toEqual({ outcome: 'done', closure: { kind: 'completed' }, linkedTasks: [] })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('link target offline: child created and owned by the target, not dispatched (skipped_offline), done still succeeds', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'skipped_offline' }])
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')).toEqual([])
})
test('link target busy: child queued (still ready, owned by the target), queued line sent', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  const { id: other } = await o.taskCreate({ spec: 's', taskTitle: 'x', run: 'run-1', from: 'coord-1' })
  await o.dispatch({ task: other, to: 'term-c', from: 'coord-1' })
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'queued' }])
  expect(o.tasks.find((t) => t.id === r.linkedTasks![0]!.taskId)!.status).toBe('ready')
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-c', text: expect.stringContaining('排队任务') })
})
test('gate fails under budget: gate_failed with the output file, no Orca call, count +1, task_log gate_failed', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  const r = await doneTask(deps, { id })
  expect(r).toEqual({ outcome: 'gate_failed', gateOutputPath: path.join(deps.home, 'logs', 'duo', `gate-${id}-0-1.txt`) })
  expect(o.orch).toEqual([])
  expect(registry.getTaskExt(id)!.gateFailures).toBe(1)
  expect(registry.listTaskLog(id).at(-1)!.action).toBe('gate_failed')
})
test('gate fails exactly at the budget: worker_done(failed) BEFORE gate-create; question cites the output file; blocked; gate recorded; closure escalated', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  const r = await doneTask(deps, { id })
  expect(r).toMatchObject({ outcome: 'escalated', gateId: 'gate-1', closure: { kind: 'escalated' } })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('gateCreate'))
  expect(o.callsOf('workerDone')[0]).toMatchObject({ outcome: 'failed', subject: 'gate failed' })
  expect(o.callsOf('gateCreate')[0]).toMatchObject({ task: id, question: expect.stringMatching(/连续 3 次[\s\S]*gate-.*-0-3\.txt/) })
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('blocked')
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
})
test('escalated: the lead is notified once when the lead is someone else', async () => {
  process.env.WL_GATE_EXIT = '1'
  const y = DUO_YAML + gates('checker')
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: y, env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'coord-1' })
  s.registry.incrementGateFailures('duo', id); s.registry.incrementGateFailures('duo', id)
  await doneTask(s.deps, { id })
  expect(o.sent.filter((m) => m.handle === 'term-b').map((m) => m.text)).toEqual([expect.stringContaining('wl task resolve gate-1')])
})

// —— 绕过 wl 直接上报（spec 第 10 节 done 第 3 步）——
test('bypassed + gate passes: no second report, links still created, verdict bypassed', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  await bypassReport(o, id); o.orch.length = 0
  const r = await doneTask(deps, { id })
  expect(r).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review', targets: ['checker@duo'] } })
  expect(o.callsOf('workerDone')).toEqual([])
  expect(o.callsOf('taskCreate')).toHaveLength(1)
  expect(registry.getVerdict(id, 0)).toMatchObject({ verdict: 'bypassed', finishedAt: expect.any(String) })
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('bypass_detected')
})
test('bypassed + gate fails: gate_failed_after_bypass, no gate created, no task_done row, the lead is told how to reopen', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched(REVIEW, { ORCA_TERMINAL_HANDLE: 'term-c' }, DUO_YAML + gates('checker') + 'links:\n  checker:\n    reviewed_by: [builder]\n')
  registry.setClaimedBy('duo', id, 'checker@duo'); o.tasks.find((t) => t.id === id)!.assigneeHandle = 'term-c'
  await bypassReport(o, id); o.orch.length = 0
  expect(await doneTask(deps, { id })).toMatchObject({ outcome: 'gate_failed_after_bypass' })
  expect(o.orch).toEqual([])
  expect(registry.getVerdict(id, 0)).toBeNull()
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: expect.stringContaining(`wl task escalate ${id} --reopen`) })
})

// —— 重跑安全（spec 第 12 节逐条） ——
test('report landed but returned runtime_timeout: settled in the same command; gate ran once; child created once', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'workerDone', when: 'after', error: rt() })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(gateRuns()).toBe(1)
  const reports = o.callsOf('workerDone')
  expect(reports).toHaveLength(2); expect(reports[1]!.retryRequest).toBe(reports[0]!.retryRequest)
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('report landed + timeout and request-show unreachable: exit-3 kind, no child yet; the rerun replays the report, skips the gate, then links', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'workerDone', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(o.callsOf('taskCreate')).toEqual([])
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(gateRuns()).toBe(1)
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('child task-create landed but returned runtime_timeout: no second child', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'taskCreate', when: 'after', error: rt() })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('child dispatch landed but returned runtime_timeout: done finishes, not task_not_open', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'dispatch', when: 'after', error: rt() })
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(o.tasks.find((t) => t.parentId === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
})
// R5-2：被拒的上报记进 Orca 账本，同 id 重放永远拿回同一个拒绝
test('report rejected (worker_identity_changed, recorded by Orca): row dropped, exit-2 kind; the rerun tries a NEW id instead of replaying the rejection', async () => {
  const { o, deps, registry, id } = await dispatched()
  registry.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'passed', gateFailures: 0, dispatchId: 'ctx-1', reportFrom: 'term-x', body: null })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'orca', code: 'worker_identity_changed', hint: expect.stringContaining('wl task recover') })
  expect(registry.getRequest(`done:${id}:0:report`)).toBeNull()
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ code: 'worker_identity_changed' })
  const ids = o.callsOf('workerDone').map((a) => a.retryRequest)
  expect(new Set(ids).size).toBe(2)
})
test('child dispatch row uncertain and the target terminal was rebuilt: the rerun dispatches to the new handle', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'dispatch', when: 'transport', error: new WinglineError('orca', 'runtime_unavailable', 'x') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  await o.terminalClose({ handle: 'term-c' }); o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.tasks.find((t) => t.parentId === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
})
test('two reviewers: one target\'s child dispatch uncertain, the other finished its review before the rerun → rerun finishes, the finished target is not touched', async () => {
  const { o, deps, registry, id } = await dispatched('', undefined, AUDITOR); addAuditor(o, registry)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't'), match: (a) => a.to === 'term-a' }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  const checkerChild = o.tasks.find((t) => t.parentId === id && t.assigneeHandle === 'term-c')!
  await o.workerDone({ taskId: checkerChild.id, dispatchId: checkerChild.dispatchId!, outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-c' })
  o.orch.length = 0
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(r.linkedTasks!.map((l) => [l.target, l.delivery])).toEqual([['checker@duo', 'notified'], ['auditor@duo', 'notified']])
  expect(o.callsOf('dispatch').map((d) => d.to)).toEqual(['term-a'])
  expect(o.callsOf('taskCreate')).toEqual([])
  expect(registry.getTaskExt(checkerChild.id)!.epoch).toBe(0)
  expect(gateRuns()).toBe(1)
  expect(registry.getVerdict(id, 0)!.finishedAt).not.toBeNull()
})
test('escalate interrupted before gate-create: rerun keeps the verdict, the count and the question text', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures('duo', id); registry.incrementGateFailures('duo', id)
  o.faults.push({ method: 'gateCreate', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  process.env.WL_GATE_EXIT = '0'
  expect(await doneTask(deps, { id })).toMatchObject({ outcome: 'escalated', gateId: 'gate-1' })
  expect(gateRuns()).toBe(1)
  expect(registry.getTaskExt(id)!.gateFailures).toBe(3)
  expect(new Set(o.callsOf('gateCreate').map((g) => g.question)).size).toBe(1)
})
test('rerun after everything finished reports the stored result (replayed) and makes no Orca call', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  const first = await doneTask(deps, { id })
  o.orch.length = 0
  expect(await doneTask(deps, { id })).toEqual({ ...first, replayed: true })
  expect(o.orch).toEqual([])
})
test('coordinator changed between attempts: the child\'s task-create is reissued with the new coordinator', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }); unreachable(o)
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-2' })
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
})
test('when multilineSafe is false, a multi-line gate output stays in the file and --body is one line', async () => {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { multilineSafe: false, env: { ORCA_TERMINAL_HANDLE: 'term-b' }, yaml: DUO_YAML + 'gates:\n  builder: \'node -e "console.log(1);console.log(2)"\'\n' })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  await doneTask(s.deps, { id })
  const body = o.callsOf('workerDone')[0]!.body as string
  expect(body).not.toMatch(/[\r\n]/)
  const file = body.replace(/^gate 输出见 /, '')
  expect(file).toBe(path.join(s.deps.home, 'logs', 'duo', `gate-${id}-0-1.txt`))
  expect(fs.readFileSync(file, 'utf8')).toMatch(/1\r?\n2/)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现**（spec 第 10 节 `done` 的 5 步；`done.ts` 拆成 `decide`、`decideDispatched`、`decideBypassed`、`report`、`linkAll`、`linkOne`、`escalateGate`、`closureOf`，各自 ≤50 行）。
  - 入口：`requireActor` → 团队 → `taskPreflight` → `ext = getTaskExt(id)`；`ext?.claimedBy !== actor.address` → `not_your_task` → `v = getVerdict(id, ext.epoch)`：`v?.finishedAt` → `{ ...JSON.parse(v.result!), replayed: true }`；`!v` → `decide()`（可能直接返回 `gate_failed`/`gate_failed_after_bypass`）。
  - `decideDispatched`：`handle = await resolveHandle(actor)`；`task.assigneeHandle !== handle` → `not_dispatched_to_you`；`n = ext.gateFailures + 1`；`g = await runGate(post.gate, { cwd: await gateCwd(deps, actor.address), timeoutMs: spec.budgets.task.gateTimeoutSeconds * 1000 })`；`file = writeGateOutput(home, team, id, epoch, n, g.output)`（没有 gate 时不写文件）；通过 → `recordVerdict({ verdict: 'passed', gateFailures: ext.gateFailures, dispatchId: task.dispatchId!, reportFrom: handle, body: gateBody(...) })`；失败且 `n < max` → `incrementGateFailures`、`logTask(gate_failed, { file })`，返回 `{ outcome: 'gate_failed', gateOutputPath: file }`；失败且 `n >= max` → `recordVerdict({ verdict: 'escalate', gateFailures: n, … })`。
  - `decideBypassed`（任务 `completed`/`failed`、`result.provenance === 'worker_report'`、本轮无 `task_done`）：`logTask(bypass_detected)`；跑 gate（同上）；通过 → `recordVerdict({ verdict: 'bypassed', dispatchId: '', reportFrom: '', body: null, gateFailures: ext.gateFailures })`；失败 → 牵头岗不是调用方时 `notifyPost(lead, \`[雁阵] ${actor} 的任务 ${id} 绕过 wl 直接上报，补跑 gate 失败，见 ${file}；要重开用 wl task escalate ${id} --reopen --reason <原因>\`)`，返回 `{ outcome: 'gate_failed_after_bypass', gateOutputPath: file }`。
  - 其余状态 → `task_not_dispatched`（`ready` 时 hint"上一轮派发已结束（终端被关闭或已 resolve），先 `wl task start <id>`"）。
  - `report(v)`：`ledgered(key \`done:${id}:${epoch}:report\`, build: () => ({ taskId: id, dispatchId: v.dispatchId, outcome: v.verdict === 'passed' ? 'succeeded' : 'failed', subject: v.verdict === 'passed' ? 'gate passed' : 'gate failed', ...(v.body ? { body: v.body } : {}), run: team.runId!, from: v.reportFrom }), call: workerDone)`。被定案为 Orca 明确报错时，错误的 hint 写 spec 第 11 节那句（含 `wl task recover`）。
  - `passed` → `report` → `ext.kind === 'work'` 时 `linkAll`；`bypassed` → 只 `linkAll`；`escalate` → `report` → `escalateGate`。
  - `linkOne(target)`：①`getRequest(\`done:${id}:${epoch}:delivered:${target}\`)` 为 `done` → 直接返回记录；②否则 `ledgered(key \`done:${id}:${epoch}:link:${target}\`, build: (t) => ({ spec: taskSpec(deps, \`${label}（${target}）：${id}\`), taskTitle: \`${label}：${task.title}\`, run: t.runId!, from: t.coordinatorHandle!, parent: id }), call: taskCreate)` → `insertTaskExt({ taskId: child, team, tags: [], kind, claimedBy: target, readySince: now })` → `isPostFrozen(target)` → `skipped_frozen`；`locatePost(target)` 为空 → `skipped_offline`；否则 `announce(deps, team, child, target, await dispatchTo(...), actor)` 的 `delivery`；③立刻 `beginRequest(key)` + `finishRequest(key, 'done', entry)` 落交付记录（`skipped_*` 也记）。任务标题在重跑时从 `findTask` 再取。
  - `escalateGate`：`ledgered(key \`done:${id}:${epoch}:gate\`, build: (t) => ({ task: id, question: \`连续 ${v.gateFailures} 次 gate 失败（输出见 ${最后一次的 gate 输出文件}）。resolve 后任务回到 ready：原岗位 wl task start 即重试；改派用 wl task resolve <gate> --reassign <地址>；不想继续就不要 resolve\`, from: t.coordinatorHandle! }), call: gateCreate)` → `recordGate` → 牵头岗不是调用方时 `notifyPost(lead, \`[雁阵] ${actor} 的任务 ${id} 连续 ${n} 次 gate 失败，已转人工决策：wl task resolve ${gateId} --resolution <决定>\`)`（失败只 `deps.warn`）。gate 输出文件路径在判定时就写进 `task_done.body` 以外的地方不方便取，所以 `escalateGate` 按 `gate-<id>-<epoch>-<gateFailures>.txt` 的命名规则重建路径。
  - `closureOf(v, links)`：`escalate` → `escalated`；有 `handsTo` 连接 → `handed_to` + 目标；有 `reviewedBy` 连接 → `sent_for_review` + 目标；否则 `completed`。
  - 最后 `finishVerdict(id, epoch, result)`、`logTask(done | escalate)` 并返回 `result`。
  - **实现层决定：** 牵头岗就是调用方时不通知（不往自己的终端里打"请处理你自己"；命令输出已经说明了）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task done with persisted verdicts, bypass detection and rerun-safe follow-ups"`

---

### Task 13：`wl task escalate` / `resolve` / `recover`

**Files:**
- Create：`packages/core/src/commands/task/escalate.ts`、`packages/core/test/commands/task/escalate.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export async function escalateTask(deps: CommandDeps, a: { id: string; reason: string; reopen?: boolean; as?: string; retryRequest?: string }):
    Promise<{ gateId: string; status: OrchestrationTaskStatus; tookBackDispatch: boolean }>
  export async function resolveGate(deps: CommandDeps, a: { gateId: string; resolution: string; reassign?: string; as?: string }):
    Promise<{ taskId: string; status: OrchestrationTaskStatus; claimedBy: string | null }>
  export async function recoverTask(deps: CommandDeps, a: { id: string; as?: string }):
    Promise<{ status: 'dispatched' | 'queued' | 'ready'; delivery?: Delivery; epoch: number; reason?: string }>
  ```

- [ ] **Step 1：写失败测试**

```ts
async function dispatchedTask(o: FakeOrca, deps: CommandDeps, to = 'term-b') {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to, from: 'coord-1' }); o.orch.length = 0
  return id
}
const ru = () => new WinglineError('orca', 'runtime_unavailable', 'x')
test('escalate takes a dispatched task back (blocked), records the gate, logs it and tells the lead', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await dispatchedTask(o, deps)
  expect(await escalateTask(deps, { id, reason: '卡住了' })).toEqual({ gateId: 'gate-1', status: 'blocked', tookBackDispatch: true })
  expect(o.callsOf('gateCreate')).toEqual([{ task: id, question: '卡住了', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
  expect(registry.listTaskLog(id).map((l) => [l.action, l.actor])).toEqual([['escalate', 'checker@duo']])
  expect(o.sent.at(-1)).toMatchObject({ handle: 'term-b', text: expect.stringContaining('gate-1') })
})
test('escalate on a completed task needs --reopen', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  await o.workerDone({ taskId: id, dispatchId: 'ctx-1', outcome: 'succeeded', subject: 's', run: 'run-1', from: 'term-b' })
  await expect(escalateTask(deps, { id, reason: 'x' })).rejects.toMatchObject({ code: 'reopen_required' })
  expect(await escalateTask(deps, { id, reason: 'x', reopen: true })).toMatchObject({ gateId: 'gate-1' })
})
test('escalate uncertain: hint carries --retry-request; rerunning with it creates no second gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'gateCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  const err = await escalateTask(deps, { id, reason: 'x' }).catch((e) => e)
  const rid = o.callsOf('gateCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${rid}`) })
  await escalateTask(deps, { id, reason: 'x', retryRequest: rid })
  expect(o.gates.size).toBe(1)
})
test('escalate uncertain, then the coordinator changed: --retry-request replays the original --from, one gate', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'gateCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  const err = await escalateTask(deps, { id, reason: 'x' }).catch((e) => e)
  const rid = o.callsOf('gateCreate')[0]!.retryRequest as string
  expect(err.hint).toContain('--from coord-1')
  await o.runUse({ id: 'run-1', from: 'coord-2' }); registry.updateCoordinatorHandle('duo', 'coord-2')
  expect(await escalateTask(deps, { id, reason: 'x', retryRequest: rid })).toMatchObject({ gateId: 'gate-1', status: 'blocked' })
  expect(o.callsOf('gateCreate').at(-1)).toMatchObject({ retryRequest: rid, from: 'coord-1' })
  expect(o.gates.size).toBe(1)
})
test('escalate on an unknown task → task_not_found', async () => {
  await expect(escalateTask(seedRunningTeam(new FakeOrca()).deps, { id: 'ghost', reason: 'x' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('resolve: Orca puts the task back to ready; owner unchanged; ready_since refreshed; a bare rerun does not call Orca again', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  expect(await resolveGate(deps, { gateId, resolution: 'retry' })).toEqual({ taskId: id, status: 'ready', claimedBy: 'builder@duo' })
  expect(o.callsOf('gateResolve')).toEqual([{ id: gateId, resolution: 'retry', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getTaskExt(id)!.readySince).toEqual(expect.any(String))
  await resolveGate(deps, { gateId, resolution: 'retry' })
  expect(o.callsOf('gateResolve')).toHaveLength(1)
})
test('resolve --reassign changes the owner locally; an unknown target is rejected before Orca', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  await expect(resolveGate(deps, { gateId, resolution: 'r', reassign: 'ghost@duo' })).rejects.toMatchObject({ code: 'post_unknown' })
  expect(o.callsOf('gateResolve')).toEqual([])
  await resolveGate(deps, { gateId, resolution: 'reassign', reassign: 'checker@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
})
test('resolve on an unrecorded gate → gate_unknown', async () => {
  await expect(resolveGate(seedRunningTeam(new FakeOrca()).deps, { gateId: 'ghost', resolution: 'x' })).rejects.toMatchObject({ code: 'gate_unknown' })
})
test('recover: assignee alive → assignee_alive', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ code: 'assignee_alive' })
})
test('recover: dispatched to a dead handle → gate-create → gate-resolve → re-dispatched to the owner with epoch + 1', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  deps.registry.openIntent(`dispatch:${id}:0`, 'x', {}); deps.registry.finishRequest(`dispatch:${id}:0`, 'done', { status: 'dispatched', dispatchId: 'ctx-1', self: false, replayed: false })
  const r = await recoverTask(deps, { id })
  expect(r).toMatchObject({ status: 'dispatched', epoch: 1, delivery: 'notified' })
  expect(o.calls.filter((c) => ['gateCreate', 'gateResolve', 'dispatch'].includes(c))).toEqual(['gateCreate', 'gateResolve', 'dispatch'])
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-b' })
  expect(registry.listTaskLog(id).map((l) => l.action)).toContain('recover')
})
test('recover interrupted after gate-create: the rerun continues from gate-resolve, one gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  o.faults.push({ method: 'gateResolve', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') }, { method: 'requestShow', when: 'before', error: ru() })
  await expect(recoverTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'dispatched' })
  expect(o.gates.size).toBe(1)
})
test('recover with the owner offline: back to ready, not dispatched', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps, 'term-old')
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  expect(await recoverTask(deps, { id })).toMatchObject({ status: 'ready', reason: 'post_offline' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `escalateTask`：`findTaskAnywhere` → `taskPreflight` → `actor = await resolveActor(deps, a.as)`；`completed`/`failed` 且 `!reopen` → `reopen_required`；`oneShot(deps, { team, retryRequest: a.retryRequest, fromReceipt: (r) => r.gate?.id ? { id: r.gate.id, replayed: true } : null, build: (t) => ({ task: id, question: a.reason, from: t.coordinatorHandle! }), call: gateCreate, retryHint: (rid) => \`wl task escalate ${id} --reason <同一个理由> --retry-request ${rid}\` })` → `recordGate` → `logTask(escalate)` → `taskList` 读回当前状态 → 牵头岗不是调用方时 `notifyPost(lead, \`[雁阵] 任务 ${id} 已转人工决策（${理由摘要}）：wl task resolve ${gateId} --resolution <决定>\`)`。`tookBackDispatch` = 调用前任务是 `dispatched`。
  - `resolveGate`：`getGate`（无 → `gate_unknown`）→ `taskPreflight` → `reassign` 不在规格岗位里 → `post_unknown`；`isPostFrozen(reassign)` → `post_frozen` → `ledgered(key \`resolve:${gateId}\`, build: (t) => ({ id: gateId, resolution, from: t.coordinatorHandle! }), call: gateResolve)` → `reassign` 时 `setClaimedBy` → `setReadySince(now)` → `logTask(resolve)` → `taskList` 读回状态返回。不碰 `epoch`/`gate_failures`（下次派发时 `dispatchTo` 处理）。
  - `recoverTask`：`findTaskAnywhere` → `taskPreflight`；**已有 `recover:<id>:<epoch>:gate` 行（中途中断后的续跑，任务此刻可能已是 `blocked`/`ready`）时跳过下面的前置检查**；否则任务不是 `dispatched` 或 assignee 存活 → `assignee_alive`（不是 `dispatched` 时 hint 改为"任务不在派发中，不需要 recover"）；`epoch = ext.epoch`；`ledgered(\`recover:${id}:${epoch}:gate\`, gateCreate question "雁阵 recover：原派发对象已不存在")` → `recordGate` → `ledgered(\`recover:${id}:${epoch}:resolve\`, gateResolve resolution "recover")` → 主人为空 → `{ status: 'ready' }`；`isPostFrozen(owner)` → `{ status: 'ready', reason: 'skipped_frozen' }`；`locatePost(owner)` 为空 → `{ status: 'ready', reason: 'post_offline' }`；否则 `dispatchTo` + `announce`（`dispatchTo` 看到本轮派发行已 `done` 且任务 `ready`，按 9.4 加 epoch——`dispatch:<id>:0` 行不存在时任务此刻是 `ready`，同样走第 3 步，`bumpEpoch` 只在行存在时发生，所以这里在调用 `dispatchTo` 之前若该行不存在就先 `bumpEpoch` 一次，保证"recover 之后 epoch + 1"）→ `logTask(recover)`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task escalate, resolve and recover"`

---

### Task 14：CLI 接入——`wl task <sub>`

**Files:**
- Modify：`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`、`packages/core/src/index.ts`、`packages/cli/test/main.test.ts`

命令面（spec 第 10 节）：

```
wl task create <team> --title <t> [--post <addr>] [--tags <a,b>] [--parent <id>] [--as <addr>] [--retry-request <id>] [--json]
wl task list [team] [--mine] [--status <s>] [--tags <a,b>] [--stale] [--as <addr>] [--json]
wl task show <id> [--team <team>] [--history] [--json]
wl task claim <id> [--as <addr>] [--json]
wl task release <id> [--as <addr>] [--json]
wl task reassign <id> --to <addr> [--as <addr>] [--json]
wl task start <id> [--as <addr>] [--json]
wl task plan <id> <text> [--json]
wl task done <id> [--as <addr>] [--json]
wl task escalate <id> --reason <text> [--reopen] [--as <addr>] [--retry-request <id>] [--json]
wl task resolve <gateId> --resolution <text> [--reassign <addr>] [--as <addr>] [--json]
wl task recover <id> [--as <addr>] [--json]
```

退出码：`done` → 0（含 `replayed`），`gate_failed`/`escalated`/`gate_failed_after_bypass` → 1；`WinglineError` 按 `exitCodeOf`。人读输出：

- `delivery: 'not_notified'` → "<地址> 此刻在提示/无法读取画面上，没有打字通知；任务已派发。等对方空闲后可以 `wl send <地址> \"你有新任务 <id>，见 wl task show <id>\"`"；`queued` → "<地址> 手上有任务 <busyWith>，新任务已排队"；`done` 的 `linkedTasks` 逐项说明（含 `skipped_offline`/`skipped_frozen`）；`closure` 一行（"已转交给 …"/"已送审给 …"）。
- `escalate` 注明"任务已从岗位手里收回，resolve 后回到 ready"（`tookBackDispatch` 时）。
- `list --stale` 按原因分组，每条一行 `<id> <标题> <原因> → <命令>`。
- `show --history` 每条一行 `<时间> <谁>（显式/隐式/人）<动作> <细节>`。

- [ ] **Step 1：写失败测试**

```ts
test('wl task create --json prints the created id', async () => {
  const c = cmds({ createTask: async () => ({ id: 'task-1' }) })
  const r = await exec(['task', 'create', 'duo', '--title', 't', '--json'], c)
  expect(JSON.parse(r.out).result.id).toBe('task-1')
})
test('wl task create / escalate pass --retry-request and --reopen through', async () => {
  const seen: unknown[] = []
  const c = cmds({ createTask: async (_d, a) => { seen.push(a); return { id: 't' } }, escalateTask: async (_d, a) => { seen.push(a); return { gateId: 'g', status: 'blocked', tookBackDispatch: false } } })
  await exec(['task', 'create', 'duo', '--title', 't', '--retry-request', 'rid-1'], c)
  await exec(['task', 'escalate', 't1', '--reason', 'x', '--reopen', '--retry-request', 'rid-2'], c)
  expect(seen).toEqual([expect.objectContaining({ retryRequest: 'rid-1' }), expect.objectContaining({ retryRequest: 'rid-2', reopen: true })])
})
test('wl task done exit codes follow outcome; an uncertain error exits 3 and prints the hint', async () => {
  for (const [outcome, code] of [['done', 0], ['gate_failed', 1], ['escalated', 1], ['gate_failed_after_bypass', 1]] as const) {
    expect((await exec(['task', 'done', 't1'], cmds({ doneTask: async () => ({ outcome }) }))).code).toBe(code)
  }
  const r = await exec(['task', 'done', 't1'], cmds({ doneTask: async () => { throw new WinglineError('uncertain', 'orca_timeout', 't', { hint: '原样重跑同一条命令即可' }) } }))
  expect(r).toMatchObject({ code: 3, err: expect.stringContaining('原样重跑') })
})
test('wl task list --tags a,b parses into an array; --stale routes to listStale and prints the commands', async () => {
  let args: unknown
  await exec(['task', 'list', 'duo', '--tags', 'a,b'], cmds({ listTasks: async (_d, a) => { args = a; return [] } }))
  expect(args).toMatchObject({ tags: ['a', 'b'] })
  const r = await exec(['task', 'list', 'duo', '--stale'], cmds({ listStale: async () => [{ taskId: 't1', title: 'T', reason: 'dead_assignee', owner: 'b@duo', since: null, command: 'wl task recover t1' }] }))
  expect(r.out).toContain('wl task recover t1')
})
test('wl task reassign / release / recover are wired', async () => {
  const seen: string[] = []
  const c = cmds({
    reassignTask: async () => { seen.push('reassign'); return { notify: { outcome: 'notified' } } },
    releaseTask: async () => { seen.push('release') },
    recoverTask: async () => { seen.push('recover'); return { status: 'dispatched', epoch: 1, delivery: 'notified' } },
  })
  await exec(['task', 'reassign', 't1', '--to', 'checker@duo'], c); await exec(['task', 'release', 't1'], c); await exec(['task', 'recover', 't1'], c)
  expect(seen).toEqual(['reassign', 'release', 'recover'])
})
```

> 直接用 `main.test.ts` 里**已有**的两个 helper：`cmds(over?: Partial<Commands>)` 与 `exec(argv, c = cmds())`。本任务给 `Commands` 加 13 个字段（`createTask`、`listTasks`、`listStale`、`showTask`、`claimTask`、`releaseTask`、`reassignTask`、`startTask`、`planTask`、`doneTask`、`escalateTask`、`resolveGate`、`recoverTask`），`cmds` 的默认对象必须为每个新字段补一个默认实现，否则 `pnpm typecheck` 失败；新加的默认实现一律 `async () => { throw new Error('未注入：<字段名>') }`，阶段 1 的四个保持原样。2B 计划 Task 11 用同样的方式补它的字段。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `Commands` 接口补 13 个字段，`realCommands` 补导入；逐个注册 `task` 子命令；逗号参数 `.split(',').filter(Boolean)`；`exitCodeOfDone`。`index.ts` 补 `commands/task/` 下各文件的导出（`ledger`、`identity`、`notify`、`gate-exec`、`preflight`、`query`、`log`、`frozen`、`dispatch`、`create`、`plan`、`claim`、`start`、`done`、`escalate`）。
- [ ] **Step 4：运行确认通过** — `pnpm test`；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(cli): wl task command surface"`

---

### Task 15：契约测试——真实回执入库并钉住解析

**Files:**
- Create：`spikes/contract-capture.ts`（真机上运行一次，产出脱敏回执）
- Create：`test/fixtures/receipts/orchestration-2a.json`（由上面的脚本产出后人工核对再提交）
- Create：`packages/core/test/orca/contract.test.ts`、`packages/core/test/fixture.ts`（`fixture(name)` 读 `test/fixtures/receipts/<name>.json`）
- Modify：`packages/core/test/commands/task/notify.test.ts`（改用 `fixture()`）

`spikes/out/` 被 git 忽略，所以 spec 第 12 节要求的回执必须另外入库（复审四 A-I13）。

- [ ] **Step 1：写抓取脚本。** 复用 `spikes/lib.ts` 的 `setup()`/`record`/`IDLE_COMMAND`，在一个新 Run 里依次执行并记录**原始 JSON**：`run-create`、`run-list`、`run-show`、`task-create`（两个，一个带 `--parent`）、`dispatch`、`task-list`（含一个 `dispatched`、一个 `completed`、一个 `blocked` 任务）、`send --type worker_done`、`gate-create`、`gate-resolve`、`request-show`（对一个已落地的 id、一个随机 id，以及在 `worker_done` 被拒后对那个 id）、`worktree show --worktree <WINGLINE_SPIKE_WORKTREE>`、`terminal show`。脱敏规则与 `orchestration-r6.json` 相同（用户名、绝对路径前缀替换为 `USER`/`/Users/USER`），只保留雁阵读取的字段与少量上下文；写入 `test/fixtures/receipts/orchestration-2a.json`，键名与上面的命令一一对应（`run-list`、`request-show-completed`、`request-show-absent`、`request-show-rejected-worker-done`、`task-list-mixed`、`worktree-show` 等）。脚本结束时关闭它建的终端；会留下一个 Run（CLI 无法删除），在 `spikes/REPORT.md` 记一笔。
- [ ] **Step 2：在装有 Orca 的机器上运行一次**（`WINGLINE_SPIKE_WORKTREE=path:<仓库路径> pnpm tsx spikes/contract-capture.ts`），核对输出后提交 fixture。若 `run-list`/`worktree show`/`request-show` 的字段名与 Task 3 的假设不同，同一提交里改 `client.ts` 的映射与 `client.test.ts`，并在提交说明里写明。
- [ ] **Step 3：写契约测试。** 用一个返回 fixture 的假 `OrcaRunner` 构造真实的 `OrcaClient`，逐个方法断言映射结果：`runList` 能找到 `wingline:` 开头的 objective；`requestShow` 三种状态；`taskList` 对 `completed` 任务给出 `result`（含 `provenance`）且 `assigneeHandle`/`dispatchId` 为 null，对 `dispatched` 任务两者非空，`parentId` 与 fixture 一致（`parent_id` 的字段名此前没有任何证据，这一条就是证据）；`terminalShow` 对 R6 两个画面给出 `preview`；`worktreeShow` 给出绝对路径。另加一条：`check`/`reply`/`worker-list` 的 R6 回执在 2B 计划 Task 1 里钉，这里不重复。
- [ ] **Step 4：运行确认通过** — `pnpm test`。
- [ ] **Step 5：提交** — `git commit -m "test: contract tests against sanitized real orchestration receipts"`

---

### Task 16：端到端流程测试

**Files:**
- Create：`packages/core/test/commands/task/flow.test.ts`

- [ ] **Step 1：写失败测试**

```ts
const FLOW_YAML = SELF_CLAIM_YAML + `gates:\n  builder: 'node -e "process.exit(0)"'\nlinks:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n`
const NOPLAN = SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false')

test('up → create → claim → plan → start → done → review child → checker done; mutual review terminates', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML) })                       // builder=term-1（lead，协调者），checker=term-2
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  const { id } = await createTask(deps, { team: 'duo', title: '实现登录', tags: ['backend'] })
  await claimTask(asB, { id }); await planTask(asB, { id, text: '先读代码' })
  expect(await startTask(asB, { id })).toEqual({ delivery: 'self' })
  const r1 = await doneTask(asB, { id })
  expect(r1).toMatchObject({ outcome: 'done', linkedTasks: [{ target: 'checker@duo', delivery: 'notified' }], closure: { kind: 'sent_for_review' } })
  const reviewId = r1.linkedTasks![0]!.taskId
  expect((await listTasks(asC, { team: 'duo', mine: true })).map((t) => t.id)).toEqual([reviewId])
  expect(await doneTask(asC, { id: reviewId })).toMatchObject({ outcome: 'done', linkedTasks: [] })
  expect((await fetchTasks(deps, 'duo')).map((t) => t.status)).toEqual(['completed', 'completed'])
  expect(await listStale(deps, 'duo')).toEqual([])
})
test('reviewer busy: the review child is queued; after the reviewer finishes its current task, start succeeds', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }; const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  const { id: busy } = await createTask(deps, { team: 'duo', title: '手上的活', post: 'checker@duo' })
  const { id } = await createTask(deps, { team: 'duo', title: '实现登录', post: 'builder@duo' })
  const r = await doneTask(asB, { id })
  expect(r.linkedTasks![0]!.delivery).toBe('queued')
  await doneTask(asC, { id: busy })
  expect(await startTask(asC, { id: r.linkedTasks![0]!.taskId })).toEqual({ delivery: 'self' })
})
test('escalate → resolve → owner restarts: new epoch, fresh gate budget, done succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: mkTeam(NOPLAN) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  const { gateId } = await escalateTask(deps, { id, reason: '先停一下' })
  await resolveGate(deps, { gateId, resolution: 'retry' })
  await startTask(asB, { id })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
test('the post\'s terminal is closed mid-task: Orca reverts it to ready, the owner\'s next start re-dispatches to the new terminal', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const specPath = mkTeam(NOPLAN)
  await up(deps, { specPath })
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  await o.terminalClose({ handle: 'term-1' })
  await up(deps, { specPath })                                           // 重建 builder → term-3；协调者 reclaimed 到 term-3
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-3' } }
  await startTask(asB, { id })
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
test('dispatched to a dead handle (Orca restarted): wl up reports it, list --stale shows it, recover re-dispatches, done succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const specPath = mkTeam(NOPLAN)
  await up(deps, { specPath })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-1' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-gone', from: 'term-1' })
  expect((await up(deps, { specPath })).deadAssignees).toEqual([expect.objectContaining({ taskId: id, command: `wl task recover ${id}` })])
  expect((await listStale(deps, 'duo')).map((s) => s.reason)).toEqual(['dead_assignee'])
  await recoverTask(deps, { id })
  expect((await doneTask({ ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }, { id })).outcome).toBe('done')
})
test('a post bypasses wl and reports directly: list --stale shows bypassed; wl task done fills in the gate and the links', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML.replace('plan_first: true', 'plan_first: false')) })
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  await bypassReport(o, id)
  expect((await listStale(deps, 'duo')).map((s) => [s.taskId, s.reason])).toEqual([[id, 'bypassed']])
  const r = await doneTask({ ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }, { id })
  expect(r).toMatchObject({ outcome: 'done', closure: { kind: 'sent_for_review' } })
  expect((await listStale(deps, 'duo')).filter((s) => s.taskId === id)).toEqual([])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：** 本任务不写生产代码；失败则回到对应任务修正。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS。
- [ ] **Step 5：提交** — `git commit -m "test: end-to-end phase 2A task workflow"`

---

## 自检记录

- **spec 覆盖：** 第 2 节（实测语义）→ Task 3 的 argv 与 `FakeOrca` 模型、Task 15 契约；第 3 节约束 6 → Task 8，约束 8 → Task 2/4 与 `deps.ts` 注释，约束 9（不注入）→ Task 3/10 与 Global Constraints，约束 10（画面检查）→ Task 7；第 4 节（字段、`links_self`、`field_removed`、环检测）→ Task 1；第 5 节（Run、找回、`--adopt-run`/`--new-run`/`run_lost`、协调者归属、死终端报告）→ Task 5，`wl task` 被 fence 时刷新 → Task 4；第 6 节（表、插入或更新、`bumpEpoch` 比较后更新、保留约定）→ Task 2；第 7 节（身份 → Task 6；派发与通知、`queued`/`post_busy` → Task 10/11；画面检查 → Task 7）；第 8 节（状态机、`epoch`）→ Task 10/12/13；第 9 节（账本、`request-show` 定案、派发行死目标例外、P2 无本地行）→ Task 4/10；第 10 节（通用前置 → Task 9；各命令 → Task 10–13；`--stale` → Task 9；gate 目录/超时/输出 → Task 8/12）；第 11 节（错误码）→ 各任务与 Task 14；第 12 节（测试与重跑测试逐条）→ Task 3/4/10/12/13/15/16。
- **spec 第 12 节重跑测试的落点：** 首次 `run-create` 落地返回 `runtime_timeout` → Task 5；连接子任务 `task-create` 落地超时 → Task 12；子任务 `dispatch` 落地超时 → Task 12；上报落地超时 → Task 12（同命令内定案与 `request-show` 不可达两条）；上报被 `worker_identity_changed` 拒绝且记账 → Task 4、Task 12；派发行不确定而目标终端重建 → Task 4、Task 12；两个评审目标 → Task 12；`create`/`escalate` 超时后协调者被换 → Task 10、Task 13；换了 `WINGLINE_HOME` 后带 `--retry-request` → Task 4；评审目标忙 → Task 12、Task 16。
- **占位扫描：** 无 TBD；Task 15 的 fixture 需要真机生成，是计划里唯一依赖外部环境的步骤，脚本与键名已写明。
- **类型一致性：** `TeamRow.coordinatorHandle`、`RequestRow`（含 `updatedAt`）、`TaskExtRow`（含 `readySince`/`dispatchedAt`）、`DoneVerdictRow`（`verdict` 含 `bypassed`）、`TaskLogRow`、`OrchestrationTask`、`DispatchOutcome`、`Delivery`/`LinkDelivery`、`NotifyResult`、`StaleItem`、`Actor` 在定义任务与消费任务之间一致（Task 2→4/9/10/12/13，Task 3→全部，Task 6→9–13，Task 7→10–13，Task 9→12/13/16，Task 10→11–13）。`dispatch` 的签名没有 `inject`；`runUse`/`runList`/`runShow`/`requestShow` 没有 `retryRequest`。2B 计划消费的接口：`notifyPost`/`screenGuard`/`classifyPreview`（Task 7）、`staleReasons`/`gatherStaleInput`（Task 9）、`isPostFrozen`（Task 9，2B 改实现）、`doneTask`/`recoverTask`（Task 12/13）、`fenced`/`refreshCoordinator`（Task 4）。
- **与 spec 的实现层决定：** `request-show` 为 `completed` 时用同 id 重放取回 Orca 记下的结果，而不解析 `receipt`（Task 4；只有 P2 本地无记录时读 `receipt`）；`create --post` 的 P2 id 预先生成以便派发不确定时给出同一个 id（Task 10）；`start` 对"已派给自己"提前返回（Task 11）；`recover` 在没有本轮派发行时先加 epoch（Task 13）；牵头岗就是调用方时不通知（Task 12、13）；`create` 重跑时可能重发一次通知（Task 10）。
