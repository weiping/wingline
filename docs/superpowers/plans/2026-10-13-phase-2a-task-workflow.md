# 雁阵阶段 2A（任务工作流）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 在已有的阶段 0+1 代码之上，实现 `team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、一张很薄的本地扩展表，以及借用 Orca 原生 `orchestration task-*/dispatch/gate-*` 的 `wl task` 命令族。

**Architecture：** 任务状态机直接是 Orca 原生状态（`ready`/`dispatched`/`completed`/`failed`），雁阵只加 `task_ext`（tags/plan/claimed_by/gate_failures）和 `gates`（gate_id→team）两张小表；所有"协调者专属"调用（`task-create`/`task-update`/`dispatch`/`gate-create`/`gate-resolve`）统一用团队级缓存的 `coordinator_handle` 当 `--from`。

**Tech Stack：** TypeScript、vitest、`node:sqlite`（已用）、commander（已用）；不引入新运行时依赖。

**Spec：** `docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`（下称 spec）。实现者必须同时阅读 spec 全文，尤其第 2、5、7、9 节（均在 2026-10-14 修订中改过——`dispatch --inject`、`wl up` 无条件 `run-use`、`--as` 的身份解析规则、`wl task done` 的调用顺序和幂等 id）。本计划的接口/字段/错误码均取自该 spec；本文档只在 spec 对某个细节留了开放选择时才做出决定并在对应任务里注明。

> **2026-10-14 修订：** 本计划最初是对着 spec 的 2026-10-13 版写的；spec 经 Opus 复审和补充探针改过几处关键假设后，本计划同步修正了 Task 2/3/4/7/9/11，并修了 Task 2 测试里一处真实的外键违反（`recordGate` 测试没先建团队行）和 Task 7 `seedRunningTeam` 助手里悬空的 `specPath`。

## Global Constraints

- Node ≥ 22.13；运行时依赖只加 `commander`/`zod`/`yaml`（已有，本阶段不新增）。
- 子进程一律 `spawn(file, args, { shell: false })`，**唯一两个例外**：Windows `.cmd` 包装（阶段 1 已有）和本阶段新增的 gate 命令执行（`shell: true`，范围严格限定在 `runGate`，spec 第 3 节）。
- `wl task` 不新增 Orca 调用之外的子进程；gate 命令是本阶段唯一的本地 shell 执行。
- Orca `--json` 信封、退出码四分类（1 输入/2 Orca/3 不确定/4 内部）沿用总纲 7.8 节，阶段 2A 新增的都是输入错误（退出码 1），因为 `wl task` 不产生新的"不确定"类别（spec 第 9 节）。
- 规格哈希：新字段参与 `specHash`，沿用阶段 1 的规范化+SHA-256 规则，不新增哈希代码路径。
- CI 矩阵不变：`macos-latest`、`ubuntu-latest`、`windows-latest` × Node `22.13`、`24`——所有新测试必须跨平台安全（gate 测试一律用 `node -e "..."`，不用 shell 内置命令）。
- 凡是会在 Orca 侧产生新状态的编排写调用都带 `--retry-request`（实测确认 Orca 接受调用方自己生成的 UUID 当幂等键，见 spec 第 2 节事实 7）：单次调用命令（`run-create`/`run-use`/单纯的 `dispatch`/`workerDone`/`gateCreate`/`gateResolve`）每次尝试生成一个新 `crypto.randomUUID()`；`wl task done` 这种一条命令里有多步调用的，id 落在 `task_ext`（Task 2），重跑同一条命令天然复用。

## Review Focus

1. **两个岗位并发 `wl task claim` 争抢同一个 open 任务**：`withTeamLock` 必须序列化，后一个必须看到任务已被认领或状态已变而被拒绝，不能两边都认领成功 → Task 8 的并发测试。
2. **gate 命令含引号、`&&`、中文**：经 `shell: true` 执行后原样生效，输出截断但不被破坏 → Task 6。
3. **`task-create`/`dispatch` 的 `--spec`/`--task-title` 含引号、换行、中文**：雁阵对 Orca 的调用本身仍是 `spawn(..., { shell: false })`，argv 数组天然原样传递，但要用测试钉住，防止以后被改成字符串拼接 → Task 3。
4. **预算边界**：WIP 数恰好等于 `max_in_progress_per_post` 必须拒绝（不是"大于才拒绝"）；gate 失败次数恰好等于 `max_gate_failures` 必须转 `escalated`（不是"超过才转"）→ Task 8（WIP）、Task 9（gate 失败）。
5. **`wl task list --tags` 的过滤语义和 `wl task claim` 不同**：`claim` 的"任务 tags 为空 = 任何人都能领"是认领资格规则；`list --tags` 是纯交集过滤——没有 tags 的任务在带 `--tags` 参数查询时不会被列出。这条 spec 没明说，容易被错误地套用 claim 的语义 → Task 7。

---

## 文件结构

```text
packages/core/src/
  spec/schema.ts                 # 改：新增 links/gates/budgets/self_claim/tags/plan_first 的 zod 定义；删除 RESERVED_*
  spec/load.ts                   # 改：解析新字段到 PostSpec/TeamSpec；新增 links 交叉校验
  spec/hash.ts                   # 改：新字段纳入 specHash
  registry/migrations.ts         # 改：新迁移（teams.coordinator_handle、task_ext、gates 表）
  registry/registry.ts           # 改：TeamRow 新字段；TaskExtRow 及其读写方法；gates 表方法
  orca/types.ts                  # 改：OrchestrationTask 类型；OrcaClient 新增 8 个编排方法签名（含 runUse）
  orca/client.ts                 # 改：实现上面 8 个方法
  orca/cmd-escape.ts             # 改：新增 withPostEnv()
  commands/deps.ts               # 改：CommandDeps 新增 env 字段
  commands/up.ts                 # 改：WINGLINE_POST 注入 + run-create 建立协调者
  commands/task/identity.ts      # 新：resolveActor / resolveOwnHandle
  commands/task/gate-exec.ts     # 新：runGate（唯一的 shell:true 子进程）
  commands/task/query.ts         # 新：TaskRow 类型、fetchTasks、findTask、findTaskAnywhere、mustTeamReady、listTasks、showTask
  commands/task/create.ts        # 新：createTask
  commands/task/plan.ts          # 新：planTask
  commands/task/claim.ts         # 新：claimTask
  commands/task/start.ts         # 新：startTask
  commands/task/done.ts          # 新：doneTask（含 reviewed_by/hands_to 联动）
  commands/task/escalate.ts      # 新：escalateTask、resolveGate
  index.ts                       # 改：补 commands/task/* 的导出
packages/cli/src/
  cli.ts                         # 改：wl task 子命令
  output.ts                      # 改：task 相关渲染
packages/core/test/
  spec/load.test.ts              # 改：删掉"保留字段被拒绝"的用例，换成新字段的解析/校验用例
  spec/hash.test.ts              # 改：新字段纳入哈希的用例
  registry/registry.test.ts      # 改：TeamRow 新字段 + task_ext/gates 表的读写用例
  commands/down.test.ts, send.test.ts, ps.test.ts   # 改：TeamRow 字面量补 coordinatorHandle
  commands/fake-client.ts        # 改：FakeOrca 实现新增的 7 个编排方法
  orca/client.test.ts            # 改：新增 7 个编排方法的 argv/映射用例
  commands/up.test.ts            # 改：WINGLINE_POST 注入 + run-create 的用例
  commands/task/identity.test.ts # 新
  commands/task/gate-exec.test.ts # 新
  commands/task/query.test.ts    # 新
  commands/task/create.test.ts   # 新
  commands/task/claim-start.test.ts # 新
  commands/task/done.test.ts     # 新
  commands/task/escalate.test.ts # 新
  commands/task/flow.test.ts     # 新：端到端
packages/cli/test/
  main.test.ts                   # 改：wl task CLI 的退出码/输出用例
```

> **结构说明：** 任务相关的命令逻辑放进新的 `commands/task/` 子目录，而不是像阶段 1 那样平铺在 `commands/` 下——这一阶段新增的文件有 8 个，平铺会让 `commands/` 目录过度拥挤；任务命令之间也确实共享 `findTask`/`mustTeamReady`/`resolveActor` 这类专属逻辑，归为一组更合理。测试目录镜像同样的结构。

---

### Task 1：`team.yaml` 扩展——links/gates/budgets/self_claim/tags/plan_first

**Files:**
- Modify：`packages/core/src/spec/schema.ts`、`packages/core/src/spec/load.ts`、`packages/core/src/spec/hash.ts`
- Modify：`packages/core/test/spec/load.test.ts`、`packages/core/test/spec/hash.test.ts`

**Interfaces:**
- Produces（供后续所有任务使用）：
  ```ts
  // load.ts
  export interface PostSpec {
    id: string; agent: string; model?: string; launch: string; worktree: string; briefPaths: string[]
    selfClaim: boolean; tags: string[]; planFirst: boolean
    gate: string | null            // gates[post.id]，没有则 null
    reviewedBy: string[]           // links[post.id].reviewed_by，没有则 []
    handsTo: string[]              // links[post.id].hands_to，没有则 []
  }
  export interface TeamSpec {
    // 原有字段不变，新增：
    budgets: { maxInProgressPerPost: number; maxGateFailures: number }
  }
  ```

- [ ] **Step 1：写失败测试**

```ts
// load.test.ts：先删除这 4 个现有用例（字段已不再保留）：
//   test.each([['links',...],['gates',...],['budgets',...]])('reserved top-level field...')
//   test('reserved post field is rejected with its phase', ...)
// 替换为：
test('post defaults: self_claim/tags/plan_first', () => {
  const s = loadTeamSpec(mkTeam(DUO_YAML))
  expect(s.posts[0]).toMatchObject({ selfClaim: false, tags: [], planFirst: false, gate: null, reviewedBy: [], handsTo: [] })
})
test('parses self_claim/tags/plan_first/gates/links', () => {
  const y = DUO_YAML
    .replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    self_claim: true\n    tags: [backend]\n    plan_first: true')
    + 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    consults: [builder]\n' + 'gates:\n  builder: pnpm test\n'
  const s = loadTeamSpec(mkTeam(y))
  expect(s.posts[0]).toMatchObject({ selfClaim: true, tags: ['backend'], planFirst: true, gate: 'pnpm test', reviewedBy: ['checker'] })
})
test('budgets defaults to 3/3; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).budgets).toEqual({ maxInProgressPerPost: 3, maxGateFailures: 3 })
  const y = DUO_YAML + 'budgets:\n  team:\n    max_in_progress_per_post: 5\n  task:\n    max_gate_failures: 2\n'
  expect(loadTeamSpec(mkTeam(y)).budgets).toEqual({ maxInProgressPerPost: 5, maxGateFailures: 2 })
})
test('a post with both reviewed_by and hands_to is rejected', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [checker]\n    hands_to: [checker]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_conflict' }))
})
test('links referencing an unknown post id is rejected', () => {
  const y = DUO_YAML + 'links:\n  builder:\n    reviewed_by: [ghost]\n'
  expect(() => loadTeamSpec(mkTeam(y))).toThrow(expect.objectContaining({ code: 'links_unknown_post' }))
})
test('gates keyed by an unknown post id is rejected', () => {
  expect(() => loadTeamSpec(mkTeam(DUO_YAML + 'gates:\n  ghost: pnpm test\n'))).toThrow(expect.objectContaining({ code: 'gates_unknown_post' }))
})
// hash.test.ts
test('hash changes when tags/gate/links/budgets change', () => {
  const base = specHash(loadTeamSpec(mkTeam(DUO_YAML)))
  const withTag = specHash(loadTeamSpec(mkTeam(DUO_YAML.replace('    brief: [briefs/builder.md]', '    brief: [briefs/builder.md]\n    tags: [backend]'))))
  expect(withTag).not.toBe(base)
})
```

- [ ] **Step 2：运行确认失败** — `pnpm vitest run packages/core/test/spec` → FAIL。
- [ ] **Step 3：实现。** `schema.ts`：`postSchema` 加 `self_claim: z.boolean().default(false)`、`tags: z.array(z.string().regex(ID)).default([])`、`plan_first: z.boolean().default(false)`；`teamSchema` 加 `links: z.record(z.string().regex(ID), z.object({ reviewed_by: z.array(z.string().regex(ID)).optional(), hands_to: z.array(z.string().regex(ID)).optional(), consults: z.array(z.string().regex(ID)).optional() }).strict()).default({})`、`gates: z.record(z.string().regex(ID), z.string().min(1)).default({})`、`budgets: z.object({ team: z.object({ max_in_progress_per_post: z.number().int().positive().default(3) }).strict().default({}), task: z.object({ max_gate_failures: z.number().int().positive().default(3) }).strict().default({}) }).strict().default({})`；删除 `RESERVED_TOP`、`RESERVED_POST` 导出。`load.ts`：删除 `rejectReserved` 函数及其调用；在 `crossCheck` 里新增：遍历 `team.links` 的键和每个 `reviewed_by`/`hands_to`/`consults` 元素，不在 `posts` id 集合里 → `at.fail('links_unknown_post', ...)`；同一键同时有 `reviewed_by` 和 `hands_to` → `at.fail('links_conflict', ...)`；遍历 `team.gates` 的键，不在 posts id 集合里 → `at.fail('gates_unknown_post', ...)`；`loadTeamSpec` 返回值里给每个 post 填 `selfClaim`/`tags`/`planFirst`/`gate`（`team.gates[p.id] ?? null`）/`reviewedBy`（`team.links[p.id]?.reviewed_by ?? []`）/`handsTo`（同理），顶层填 `budgets`（字段名转驼峰）。`hash.ts`：`normalised.posts` 的每项加 `selfClaim`/`tags`/`planFirst`/`gate`/`reviewedBy`/`handsTo`，顶层加 `budgets`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/spec` → PASS；`pnpm typecheck` 无错误。
- [ ] **Step 5：提交** — `git commit -m "feat(core): parse links/gates/budgets/self_claim/tags/plan_first"`

---

### Task 2：注册表扩展——`teams.coordinator_handle`、`task_ext`、`gates` 表

**Files:**
- Modify：`packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`
- Modify：`packages/core/src/commands/up.ts`（仅一行：`upsertTeam` 调用补 `coordinatorHandle`，不涉及 run-create 逻辑，那是 Task 4 的事）
- Modify：`packages/core/test/registry/registry.test.ts`、`packages/core/test/commands/down.test.ts`、`packages/core/test/commands/send.test.ts`、`packages/core/test/commands/ps.test.ts`（给已有的 `TeamRow`/`upsertTeam` 字面量补 `coordinatorHandle: null`）

**Interfaces:**
- Produces：
  ```ts
  export interface TeamRow {
    name: string; specPath: string; specHash: string; runId: string | null
    coordinatorHandle: string | null   // 新增，必填字段（值可以是 null）
    status: 'up' | 'stopped'
  }
  export interface TaskExtRow {
    taskId: string; team: string; tags: string[]; plan: string | null; claimedBy: string | null; gateFailures: number
    doneLinkRequestId: string | null; doneDispatchRequestId: string | null; doneReportRequestId: string | null
  }
  // Registry 新增方法：
  getTaskExt(taskId: string): TaskExtRow | null
  insertTaskExt(row: { taskId: string; team: string; tags: string[] }): void
  setTaskClaimedBy(taskId: string, claimedBy: string | null): void
  setTaskPlan(taskId: string, plan: string): void
  incrementGateFailures(taskId: string): number   // 返回自增后的计数
  /** 只在对应列为空时写入（COALESCE 语义）：第一次尝试 wl task done 时落盘，裸重跑会读到同一批 id。见 spec 第 6 节。 */
  setDoneRequestIds(taskId: string, ids: { link?: string; dispatch?: string; report?: string }): void
  recordGate(gateId: string, team: string): void
  getGateTeam(gateId: string): string | null
  ```

- [ ] **Step 1：写失败测试**

```ts
test('teams round-trips coordinatorHandle', () => {
  const r = Registry.open(tmpFile())
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'term-9', status: 'up' })
  expect(r.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'term-9' })
})
test('task_ext round trip and defaults', () => {
  const r = Registry.open(tmpFile())
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'c', status: 'up' })
  r.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: ['backend'] })
  expect(r.getTaskExt('task-1')).toEqual({
    taskId: 'task-1', team: 'duo', tags: ['backend'], plan: null, claimedBy: null, gateFailures: 0,
    doneLinkRequestId: null, doneDispatchRequestId: null, doneReportRequestId: null,
  })
  r.setTaskClaimedBy('task-1', 'builder@duo')
  r.setTaskPlan('task-1', '先读代码')
  expect(r.incrementGateFailures('task-1')).toBe(1)
  expect(r.incrementGateFailures('task-1')).toBe(2)
  expect(r.getTaskExt('task-1')).toMatchObject({ claimedBy: 'builder@duo', plan: '先读代码', gateFailures: 2 })
})
test('setDoneRequestIds only writes columns that are still empty (COALESCE semantics)', () => {
  const r = Registry.open(tmpFile())
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'c', status: 'up' })
  r.insertTaskExt({ taskId: 'task-1', team: 'duo', tags: [] })
  r.setDoneRequestIds('task-1', { link: 'rid-link-1', report: 'rid-report-1' })
  r.setDoneRequestIds('task-1', { link: 'rid-link-2', dispatch: 'rid-dispatch-1', report: 'rid-report-2' })
  expect(r.getTaskExt('task-1')).toMatchObject({
    doneLinkRequestId: 'rid-link-1', doneDispatchRequestId: 'rid-dispatch-1', doneReportRequestId: 'rid-report-1',
  })
})
test('gates table maps gate id to team', () => {
  const r = Registry.open(tmpFile())
  r.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'c', status: 'up' })
  r.recordGate('gate-1', 'duo')
  expect(r.getGateTeam('gate-1')).toBe('duo')
  expect(r.getGateTeam('unknown')).toBeNull()
})
```

> **修正一处真实的外键违反：** 上面 `gates table maps gate id to team` 这条用例在最初版本里直接 `r.recordGate('gate-1', 'duo')`，没有先 `upsertTeam` 建 `duo` 这一行——`gates.team` 和 `task_ext.team` 都是 `REFERENCES teams(name)`，总纲 7.5 节"数据库启用 WAL 和外键"意味着这个写入会被 SQLite 拒绝。本计划里涉及 `task_ext`/`gates` 的每一条测试都必须先 `upsertTeam`，上面已经按这个要求写好；Task 7 起复用的 `seedRunningTeam` 助手本身就会建团队行，不需要额外注意。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `migrations.ts` 追加数组第二项：`ALTER TABLE teams ADD COLUMN coordinator_handle TEXT; CREATE TABLE task_ext (task_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), tags TEXT NOT NULL, plan TEXT, claimed_by TEXT, gate_failures INTEGER NOT NULL DEFAULT 0, done_link_request_id TEXT, done_dispatch_request_id TEXT, done_report_request_id TEXT, created_at TEXT NOT NULL); CREATE TABLE gates (gate_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name));`。`registry.ts`：`teamRow()` 加 `coordinatorHandle: r.coordinator_handle as string | null`；`upsertTeam` 的 INSERT/UPDATE 语句加 `coordinator_handle` 列（值 `t.coordinatorHandle`）；新方法按 Interfaces 实现，`tags` 用 `JSON.stringify`/`JSON.parse` 存取，`incrementGateFailures` 用 UPDATE 后紧跟一次 SELECT 读回新值；`setDoneRequestIds` 用 `UPDATE task_ext SET done_link_request_id = COALESCE(done_link_request_id, ?), done_dispatch_request_id = COALESCE(done_dispatch_request_id, ?), done_report_request_id = COALESCE(done_report_request_id, ?) WHERE task_id = ?`，入参里没给的那个位置传 `null`（`COALESCE(col, NULL)` 等于保留原值，不会误清空）。`up.ts` 的 `registerTeam()` 里 `upsertTeam({...})` 调用加 `coordinatorHandle: existing?.coordinatorHandle ?? null`（和 `runId` 的既有写法完全对称）。测试文件里补 `coordinatorHandle: null`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test` → PASS；`pnpm typecheck` 无错误。
- [ ] **Step 5：提交** — `git commit -m "feat(core): registry support for coordinator handle, task_ext and gates"`

---

### Task 3：`OrcaClient` 编排方法

**Files:**
- Modify：`packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`
- Modify：`packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.ts`（`FakeOrca` 必须实现新方法，否则其他所有命令测试文件编译失败）

**Interfaces:**
- Consumes：`OrcaRunner`（已有）
- Produces：
  ```ts
  export type OrchestrationTaskStatus = 'ready' | 'dispatched' | 'completed' | 'failed'
  export interface OrchestrationTask {
    id: string; status: OrchestrationTaskStatus; title: string; spec: string
    parentId: string | null; assigneeHandle: string | null; dispatchId: string | null; result: string | null
  }
  // OrcaClient 新增：
  runCreate(a: { objective: string; from: string; retryRequest?: string }): Promise<{ id: string; coordinatorHandle: string }>
  runUse(a: { id: string; from: string; retryRequest?: string }): Promise<{ coordinatorHandle: string }>
  taskCreate(a: { spec: string; taskTitle: string; run: string; from: string; parent?: string; retryRequest?: string }): Promise<{ id: string }>
  taskList(a: { run: string }): Promise<OrchestrationTask[]>
  dispatch(a: { task: string; to: string; from: string; inject?: boolean; retryRequest?: string }): Promise<{ dispatchId: string; injected: boolean }>
  workerDone(a: { taskId: string; dispatchId: string; outcome: 'succeeded' | 'failed'; subject: string; body?: string; run: string; from: string; retryRequest?: string }): Promise<void>
  gateCreate(a: { task: string; question: string; options?: string[]; from: string; retryRequest?: string }): Promise<{ id: string }>
  gateResolve(a: { id: string; resolution: string; from: string; retryRequest?: string }): Promise<void>
  ```
  **`retryRequest`、`dispatch`的`inject` 在每个 argv 列表末尾按条件追加，不改变前面参数的顺序**（`...(a.retryRequest ? ['--retry-request', a.retryRequest] : [])`；`dispatch` 额外 `...(a.inject ? ['--inject'] : [])`，在 `--retry-request` 之前——两者独立，顺序本身不影响 Orca 解析，这里固定一个顺序只是为了测试断言好写）。argv（均由 `runner.json` 自动追加 `--json`）：
  - `runCreate` → `['orchestration','run-create','--objective',a.objective,'--from',a.from]`，读 `r.run.id`/`r.run.coordinator_handle`
  - `runUse` → `['orchestration','run-use','--id',a.id,'--from',a.from]`，读 `r.run.coordinator_handle`（复用 `run-create` 的回执形状，字段名相同，见 `spikes/REPORT.md`"补充探针"）
  - `taskCreate` → `['orchestration','task-create','--spec',a.spec,'--task-title',a.taskTitle,'--run',a.run,'--from',a.from, ...(a.parent?['--parent',a.parent]:[])]`，读 `r.task.id`
  - `taskList` → `['orchestration','task-list','--run',a.run]`，把 `r.tasks[]` 的 `task_title→title`、`parent_id→parentId`、`assignee_handle→assigneeHandle`（缺省 null）、`dispatch_id→dispatchId`（缺省 null）映射过来，其余字段原名
  - `dispatch` → `['orchestration','dispatch','--task',a.task,'--to',a.to,'--from',a.from, ...(a.inject?['--inject']:[])]`，读 `r.dispatch.id` 为 `dispatchId`、`r.injected` 为 `injected`
  - `workerDone` → `['orchestration','send','--type','worker_done','--outcome',a.outcome,'--task-id',a.taskId,'--dispatch-id',a.dispatchId,'--subject',a.subject, ...(a.body?['--body',a.body]:[]), '--run',a.run,'--from',a.from]`，不读返回值
  - `gateCreate` → `['orchestration','gate-create','--task',a.task,'--question',a.question, ...(a.options?['--options',JSON.stringify(a.options)]:[]), '--from',a.from]`，读 `r.gate.id`
  - `gateResolve` → `['orchestration','gate-resolve','--id',a.id,'--resolution',a.resolution,'--from',a.from]`，不读返回值

- [ ] **Step 1：写失败测试**

```ts
test('runCreate reads run.id and run.coordinator_handle', async () => {
  const { client, calls } = clientWith({ 'orchestration run-create': { run: { id: 'run-1', coordinator_handle: 'term-9' } } })
  expect(await client.runCreate({ objective: 'wingline:duo', from: 'term-9' })).toEqual({ id: 'run-1', coordinatorHandle: 'term-9' })
  expect(calls[0]).toEqual(['orchestration', 'run-create', '--objective', 'wingline:duo', '--from', 'term-9'])
})
test('taskCreate builds argv incl. --parent only when given, and passes quotes/newline/中文 verbatim', async () => {
  const { client, calls } = clientWith({ 'orchestration task-create': { task: { id: 'task-1' } } })
  await client.taskCreate({ spec: 'builder@duo: 修"bug" 换行\n中文', taskTitle: 't', run: 'run-1', from: 'term-9' })
  expect(calls[0]).toEqual(['orchestration', 'task-create', '--spec', 'builder@duo: 修"bug" 换行\n中文', '--task-title', 't', '--run', 'run-1', '--from', 'term-9'])
  await client.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-9', parent: 'task-0' })
  expect(calls[1]).toContain('--parent')
})
test('taskList maps snake_case fields, defaulting assigneeHandle/dispatchId to null', async () => {
  const { client } = clientWith({ 'orchestration task-list': { tasks: [
    { id: 't1', status: 'ready', task_title: 'x', spec: 's', parent_id: null, result: null },
    { id: 't2', status: 'dispatched', task_title: 'y', spec: 's', parent_id: 't1', assignee_handle: 'h2', dispatch_id: 'ctx-1', result: null },
  ] } })
  expect(await client.taskList({ run: 'run-1' })).toEqual([
    { id: 't1', status: 'ready', title: 'x', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null },
    { id: 't2', status: 'dispatched', title: 'y', spec: 's', parentId: 't1', assigneeHandle: 'h2', dispatchId: 'ctx-1', result: null },
  ])
})
test('dispatch reads dispatch.id', async () => {
  const { client, calls } = clientWith({ 'orchestration dispatch': { dispatch: { id: 'ctx-1' } } })
  expect(await client.dispatch({ task: 't1', to: 'h2', from: 'c' })).toEqual({ dispatchId: 'ctx-1' })
  expect(calls[0]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c'])
})
test('workerDone appends --body only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration send': { message: {}, lifecycle: {} } })
  await client.workerDone({ taskId: 't1', dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', run: 'run-1', from: 'h2' })
  expect(calls[0]).toEqual(['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', 't1', '--dispatch-id', 'ctx-1', '--subject', 'gate passed', '--run', 'run-1', '--from', 'h2'])
})
test('gateCreate serialises options as JSON and reads gate.id', async () => {
  const { client, calls } = clientWith({ 'orchestration gate-create': { gate: { id: 'gate-1' } } })
  expect(await client.gateCreate({ task: 't1', question: 'q', options: ['retry', 'abandon'], from: 'c' })).toEqual({ id: 'gate-1' })
  expect(calls[0]).toContain(JSON.stringify(['retry', 'abandon']))
})
test('gateResolve builds argv', async () => {
  const { client, calls } = clientWith({ 'orchestration gate-resolve': {} })
  await client.gateResolve({ id: 'gate-1', resolution: 'retry', from: 'c' })
  expect(calls[0]).toEqual(['orchestration', 'gate-resolve', '--id', 'gate-1', '--resolution', 'retry', '--from', 'c'])
})
test('runUse reads coordinator_handle', async () => {
  const { client, calls } = clientWith({ 'orchestration run-use': { run: { coordinator_handle: 'term-9' } } })
  expect(await client.runUse({ id: 'run-1', from: 'term-9' })).toEqual({ coordinatorHandle: 'term-9' })
  expect(calls[0]).toEqual(['orchestration', 'run-use', '--id', 'run-1', '--from', 'term-9'])
})
test('dispatch --inject is appended only when given, and reads injected from the receipt', async () => {
  const { client, calls } = clientWith({ 'orchestration dispatch': { dispatch: { id: 'ctx-1' }, injected: true } })
  expect(await client.dispatch({ task: 't1', to: 'h2', from: 'c', inject: true })).toEqual({ dispatchId: 'ctx-1', injected: true })
  expect(calls[0]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c', '--inject'])
  await client.dispatch({ task: 't1', to: 'h2', from: 'c' })
  expect(calls[1]).not.toContain('--inject')
})
test('--retry-request is appended to every mutating call only when given', async () => {
  const { client, calls } = clientWith({ 'orchestration task-create': { task: { id: 't1' } } })
  await client.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'c', retryRequest: 'rid-1' })
  expect(calls[0]).toContain('rid-1')
  expect(calls[0]!.at(-2)).toBe('--retry-request')
})
```

> `clientWith`（既有测试 helper）按 `args.slice(0,2).join(' ')` 当键，`orchestration task-create` 这类两段式命令正好命中；多留意 `--options` 的值在 argv 里是整个 JSON 字符串这一个元素，不是被 shell 分词。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现 `types.ts`/`client.ts`。** `FakeOrca`（`fake-client.ts`）补齐 8 个方法：各自维护一个 `XCalls` 数组记录入参（原样记录 `inject`/`retryRequest` 字段，供 argv 风格的断言之外也能直接按字段断言）、一个内部自增 id 计数器；`tasks: OrchestrationTask[]` 作为可从测试里直接读写的背板数据；`taskCreate` 推入一条 `status: 'ready'` 的任务；`dispatch` 找到对应任务改 `status/assigneeHandle/dispatchId`，返回 `injected: a.inject ?? false`（Fake 不模拟"未就位终端拒绝注入"这类真机行为，只回显调用方传了什么）；`workerDone` 改 `status` 为 `completed`/`failed`（按 `outcome`）、`result` 存 `body ?? null`；`gateCreate`/`gateResolve`/`runUse` 只记录调用、返回/不返回对应值（`runUse` 固定返回 `{ coordinatorHandle: a.from }`，和真实 `run-use` 的"值覆盖"语义一致）。**Fake 不实现 Orca 真实的幂等重放/`request_mismatch` 校验**——这是真机行为，留给契约测试的 fixture 或以后的真机集成测试验证，单元测试只需要确认 argv 里带上了 `--retry-request`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test` → PASS（含其他命令测试文件仍能编译）；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): orchestration methods on OrcaClient"`

---

### Task 4：`wl up`——`WINGLINE_POST` 注入 + 建立/刷新协调者

**Files:**
- Modify：`packages/core/src/orca/cmd-escape.ts`、`packages/core/src/commands/up.ts`
- Modify：`packages/core/test/orca/cmd-escape.test.ts`、`packages/core/test/commands/up.test.ts`、`packages/core/test/commands/fake-client.ts`（`FakeOrca` 加一个可选的 `leadHandleOverride` 字段：设了的话，`terminalList()` 对 lead 这个岗位的标题返回这个 handle 而不是 `terminalCreate` 时分配的那个，模拟"第二轮 `wl up` 把 lead 识别成 `already_live`，但它的 handle 和第一轮不一样"——不需要真的关闭重开终端）

**Interfaces:**
- Consumes：`OrcaClient.runCreate`/`runUse`（Task 3）、`TeamRow.coordinatorHandle`（Task 2）
- Produces：
  ```ts
  // cmd-escape.ts
  /** multilineSafe 为 false 即 Orca 经 Windows .cmd 包装，需要 cmd 的 env 赋值语法。 */
  export function withPostEnv(launch: string, address: string, multilineSafe: boolean): string
  ```

- [ ] **Step 1：写失败测试**

```ts
// cmd-escape.test.ts
test('withPostEnv: posix prefix', () => {
  expect(withPostEnv('claude --model opus', 'builder@duo', true)).toBe('WINGLINE_POST=builder@duo claude --model opus')
})
test('withPostEnv: windows cmd prefix', () => {
  expect(withPostEnv('claude --model opus', 'builder@duo', false)).toBe('set WINGLINE_POST=builder@duo&& claude --model opus')
})
// up.test.ts
test('terminalCreate command carries WINGLINE_POST', async () => {
  const o = new FakeOrca()
  await up(mkDeps(o).deps, { specPath: duo() })
  expect(o.created[0]!.command).toBe('WINGLINE_POST=builder@duo claude --model opus')
})
test('when multilineSafe is false, WINGLINE_POST uses the cmd-style prefix', async () => {
  const o = new FakeOrca()
  await up(mkDeps(o, { multilineSafe: false }).deps, { specPath: duo() })
  expect(o.created[0]!.command).toBe('set WINGLINE_POST=builder@duo&& claude --model opus')
})
test('after both posts are up and the lead is live, wl up establishes the Run via the lead handle', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  expect(o.runCreateCalls).toEqual([{ objective: 'wingline:duo', from: 'term-1' }])  // term-1 = builder（lead）的 handle
  expect(o.runUseCalls).toEqual([])   // 首次建立用 run-create，不是 run-use
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'term-1' })
})
test('a second wl up calls run-use (not run-create) and refreshes coordinatorHandle to the current lead handle', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: duo() })
  o.runCreateCalls.length = 0
  o.leadHandleOverride = 'term-1-new'   // 模拟 lead 终端被重建、handle 变了（比如上一轮 down --close 之后）
  await up(deps, { specPath: duo() })
  expect(o.runCreateCalls).toEqual([])
  expect(o.runUseCalls).toEqual([{ id: 'run-1', from: 'term-1-new' }])
  expect(registry.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'term-1-new' })
})
test('if the lead post is not live this round, neither run-create nor run-use is called', async () => {
  const o = new FakeOrca()
  o.waitSatisfied = false
  const { deps } = mkDeps(o)
  await up(deps, { specPath: duo() })
  expect(o.runCreateCalls).toEqual([])
  expect(o.runUseCalls).toEqual([])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `withPostEnv` 按签名实现。`up.ts`：`startPost` 里 `orca.terminalCreate({ ..., command: post.launch })` 改成 `command: withPostEnv(post.launch, address, l.deps.multilineSafe)`。`up()` 函数里，posts 循环结束后，新增：找出 `posts` 结果里地址等于 `postAddress(spec.lead, spec.name)` 的那条；若其 `outcome` 不是 `'launched'`/`'already_live'`，跳过（下次 `wl up` 再试，和原设计一致）；否则取 `registry.getPost(leadAddress)!.handle!` 为 `leadHandle`——若 `registry.getTeam(spec.name)!.runId` 为空，调用 `deps.orca.runCreate({ objective: \`wingline:${spec.name}\`, from: leadHandle })`；否则（`runId` 已存在，**不管这轮是不是刚重复跑一次**）无条件调用 `deps.orca.runUse({ id: team.runId!, from: leadHandle })`。两个分支都把结果的 `coordinatorHandle` 写回 `registry.upsertTeam({ ...team, runId: team.runId ?? run.id, coordinatorHandle: result.coordinatorHandle })`（这是 spec 第 5 节"无条件 run-use"修订后的行为——解决协调者 handle 在 `wl down --close` + `wl up` 或 Orca 重启后悬空的问题）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): inject WINGLINE_POST and establish the orchestration Run on wl up"`

---

### Task 5：身份解析——`resolveActor` / `resolveOwnHandle`

**Files:**
- Modify：`packages/core/src/commands/deps.ts`（`CommandDeps` 加 `env`）
- Modify：`packages/cli/src/cli.ts`（`defaultMakeDeps` 填 `env`）
- Modify：`packages/core/test/commands/fake-client.ts`（`mkDeps` 默认 `env: {}`，可被 `over` 覆盖）
- Create：`packages/core/src/commands/task/identity.ts`
- Create：`packages/core/test/commands/task/identity.test.ts`

**Interfaces:**
- Consumes：`CommandDeps`（本任务扩展）、`locatePost`（阶段 1 已有）
- Produces：
  ```ts
  export function resolveActor(deps: CommandDeps, as?: string): string   // 抛 WinglineError('input','actor_required',...)
  export async function resolveOwnHandle(deps: CommandDeps, address: string): Promise<string>
  ```

- [ ] **Step 1：写失败测试**

```ts
test('resolveActor: --as wins over WINGLINE_POST', () => {
  const { deps } = mkDeps(new FakeOrca(), { env: { WINGLINE_POST: 'checker@duo' } })
  expect(resolveActor(deps, 'builder@duo')).toBe('builder@duo')
})
test('resolveActor: falls back to WINGLINE_POST', () => {
  const { deps } = mkDeps(new FakeOrca(), { env: { WINGLINE_POST: 'checker@duo' } })
  expect(resolveActor(deps)).toBe('checker@duo')
})
test('resolveActor: neither given throws actor_required', () => {
  const { deps } = mkDeps(new FakeOrca())
  expect(() => resolveActor(deps)).toThrow(expect.objectContaining({ code: 'actor_required' }))
})
test('resolveOwnHandle: ORCA_TERMINAL_HANDLE short-circuits, no orca call', async () => {
  const o = new FakeOrca()
  const { deps } = mkDeps(o, { env: { ORCA_TERMINAL_HANDLE: 'term-live' } })
  expect(await resolveOwnHandle(deps, 'builder@duo')).toBe('term-live')
  expect(o.calls).toEqual([])
})
test('resolveOwnHandle: falls back to locatePost by title', async () => {
  const o = new FakeOrca()
  o.terminals = [{ handle: 'term-3', title: 'builder@duo', connected: true, worktreeId: 'w' }]
  const { deps } = mkDeps(o)
  expect(await resolveOwnHandle(deps, 'builder@duo')).toBe('term-3')
})
test('resolveOwnHandle: no terminal found throws post_offline', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(resolveOwnHandle(deps, 'builder@duo')).rejects.toMatchObject({ code: 'post_offline' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `deps.ts`：`CommandDeps` 加 `env: NodeJS.ProcessEnv`。`cli.ts`：`defaultMakeDeps` 返回对象加 `env`。`fake-client.ts`：`mkDeps` 的 `deps` 默认加 `env: {}`（仍可被 `over` 覆盖）。`identity.ts` 按签名实现。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): actor and own-handle resolution for task commands"`

---

### Task 6：gate 命令执行——`runGate`

**Files:**
- Create：`packages/core/src/commands/task/gate-exec.ts`
- Create：`packages/core/test/commands/task/gate-exec.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export interface GateExecResult { passed: boolean; output: string }
  export function runGate(command: string | null, cwd: string): Promise<GateExecResult>
  ```

- [ ] **Step 1：写失败测试**

```ts
test('null command passes without spawning anything', async () => {
  expect(await runGate(null, process.cwd())).toEqual({ passed: true, output: '' })
})
test('exit code 0 passes', async () => {
  expect((await runGate('node -e "process.exit(0)"', process.cwd())).passed).toBe(true)
})
test('nonzero exit fails and captures stdout', async () => {
  const r = await runGate('node -e "console.log(\'hi\'); process.exit(1)"', process.cwd())
  expect(r).toMatchObject({ passed: false })
  expect(r.output).toContain('hi')
})
test('quotes, &&, and 中文 survive the shell round trip', async () => {
  const r = await runGate('node -e "console.log(\'a \\"b\\" 中文\')" && node -e "process.exit(0)"', process.cwd())
  expect(r.output).toContain('a "b" 中文')
  expect(r.passed).toBe(true)
})
test('output longer than the limit is truncated', async () => {
  const r = await runGate('node -e "process.stdout.write(\'x\'.repeat(6000))"', process.cwd())
  expect(r.output.length).toBeLessThanOrEqual(4000)
})
test('runs in the given cwd', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-'))
  const r = await runGate('node -e "process.stdout.write(process.cwd())"', dir)
  expect(r.output).toContain(dir)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `spawn(command, { shell: true, cwd })`（这是全项目唯一一处 `shell: true`，范围严格限定在这个函数内）；合并 stdout+stderr，按常量 `GATE_OUTPUT_LIMIT = 4000` 截断（和阶段 1 `wl send` 的消息上限同一个数值，理由写进注释：都是"一条消息/一段输出能装多少"的同类限制）；`exitCode === 0` 为 `passed`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): run gate commands via shell (the one documented exception)"`

---

### Task 7：`wl task create` / `list` / `show` / `plan`

**Files:**
- Create：`packages/core/src/commands/task/query.ts`、`packages/core/src/commands/task/create.ts`、`packages/core/src/commands/task/plan.ts`
- Create：`packages/core/test/commands/task/query.test.ts`、`packages/core/test/commands/task/create.test.ts`

**Interfaces:**
- Consumes：`OrcaClient`（Task 3）、`Registry`（Task 2）、`resolveActor`（Task 5）、`loadTeamSpec`/`postAddress`（已有+Task 1）
- Produces：
  ```ts
  // query.ts
  export interface TaskRow {
    id: string; status: OrchestrationTaskStatus; title: string; tags: string[]
    plan: string | null; claimedBy: string | null; assigneeHandle: string | null
    gateFailures: number; result: string | null
  }
  export function mustTeamReady(deps: CommandDeps, name: string): TeamRow   // team_unknown / run_not_ready
  export async function fetchTasks(deps: CommandDeps, team: string): Promise<TaskRow[]>   // 合并 taskList + task_ext
  export async function findTask(deps: CommandDeps, team: string, id: string): Promise<TaskRow>   // task_not_found
  export async function findTaskAnywhere(deps: CommandDeps, id: string): Promise<{ team: TeamRow; task: TaskRow }>  // 遍历已建 Run 的团队；task_not_found
  export async function listTasks(deps: CommandDeps, args: { team?: string; mine?: boolean; status?: string; tags?: string[]; as?: string }): Promise<TaskRow[]>
  export async function showTask(deps: CommandDeps, args: { id: string; team?: string }): Promise<TaskRow>
  // create.ts
  export async function createTask(deps: CommandDeps, args: { team: string; title: string; post?: string; tags?: string[]; parent?: string; as?: string; retryRequest?: string }): Promise<{ id: string }>
  // retryRequest 不给时内部 crypto.randomUUID()，用在 task-create 这一步；--post 触发的 dispatch 是单独一次调用，
  // 总是另生成一个随机 id（不暴露给调用方控制）——两次调用内容不同，不能共用同一个幂等 id（spec 第 2 节事实 7：
  // 同 id 配不同参数会被 Orca 拒绝 request_mismatch）。
  // plan.ts
  export async function planTask(deps: CommandDeps, args: { id: string; text: string }): Promise<void>   // task_terminal；无需身份（spec 第 9 节原文如此）
  ```

- [ ] **Step 1：写失败测试**

```ts
// query.test.ts
test('mustTeamReady: team_unknown / run_not_ready', () => {
  const { deps } = mkDeps(new FakeOrca())
  expect(() => mustTeamReady(deps, 'ghost')).toThrow(expect.objectContaining({ code: 'team_unknown' }))
  deps.registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: null, coordinatorHandle: null, status: 'up' })
  expect(() => mustTeamReady(deps, 'duo')).toThrow(expect.objectContaining({ code: 'run_not_ready' }))
})
test('fetchTasks merges Orca fields with task_ext', async () => {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)   // helper：注册 duo 并写 runId/coordinatorHandle，见 Step 3 说明
  o.tasks.push({ id: 't1', status: 'ready', title: 'x', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'] })
  expect(await fetchTasks(deps, 'duo')).toEqual([{ id: 't1', status: 'ready', title: 'x', tags: ['backend'], plan: null, claimedBy: null, assigneeHandle: null, gateFailures: 0, result: null }])
})
test('listTasks --tags is a strict intersection filter; a tag-less task is excluded', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  expect((await listTasks(deps, { team: 'duo', tags: ['backend'] }))).toEqual([])
})
test('findTaskAnywhere searches every team with a Run', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push({ id: 't9', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't9', team: 'duo', tags: [] })
  expect((await findTaskAnywhere(deps, 't9')).team.name).toBe('duo')
  await expect(findTaskAnywhere(deps, 'ghost')).rejects.toMatchObject({ code: 'task_not_found' })
})
// create.test.ts
test('createTask without --post leaves the task ready, no dispatch', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: '顺手记下', tags: ['bug'] })
  expect(o.taskCreateCalls[0]).toMatchObject({ taskTitle: '顺手记下', run: 'run-1', from: 'coord-1' })
  expect(o.dispatchCalls).toEqual([])
  expect(deps.registry.getTaskExt(r.id)).toMatchObject({ tags: ['bug'] })
})
test('createTask --spec text is prefixed with the actor address, or "human" when none', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await createTask(deps, { team: 'duo', title: 't', as: 'builder@duo' })
  expect(o.taskCreateCalls[0]!.spec).toMatch(/^builder@duo: /)
  await createTask(deps, { team: 'duo', title: 't' })
  expect(o.taskCreateCalls[1]!.spec).toMatch(/^human: /)
})
test('createTask --post dispatches to that post\'s handle with --inject', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'term-2', status: 'live', isLead: false })
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(o.dispatchCalls[0]).toMatchObject({ task: r.id, to: 'term-2', from: 'coord-1', inject: true })
})
test('createTask --post on an offline post fails before dispatch', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: null, status: 'offline', isLead: false })
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_offline' })
})
test('run_not_ready before team has established a Run', async () => {
  const { deps, registry } = mkDeps(new FakeOrca())
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: null, coordinatorHandle: null, status: 'up' })
  await expect(createTask(deps, { team: 'duo', title: 't' })).rejects.toMatchObject({ code: 'run_not_ready' })
})
// plan.ts 的测试并入 query.test.ts 或单独 plan.test.ts：
test('planTask writes task_ext.plan', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  await planTask(deps, { id: 't1', text: '先读代码' })
  expect(deps.registry.getTaskExt('t1')!.plan).toBe('先读代码')
})
test('planTask on a completed/failed task is rejected', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push({ id: 't1', status: 'completed', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  await expect(planTask(deps, { id: 't1', text: 'x' })).rejects.toMatchObject({ code: 'task_terminal' })
})
```

> 新增测试 helper `seedRunningTeam(orca, over?)`：在 `fake-client.ts` 里加一个便捷函数，内部调用既有 `mkDeps`，再 `registry.upsertTeam({ name:'duo', specPath: mkTeam(DUO_YAML), specHash:'h'.repeat(64), runId:'run-1', coordinatorHandle:'coord-1', status:'up' })`，返回 `{ deps, registry }`——**`specPath` 必须是 `mkTeam(DUO_YAML)` 返回的真实临时文件路径，不能随手写个占位字符串**：`claimTask`/`startTask`（Task 8）要用它 `loadTeamSpec(...)` 读出 `self_claim`/`tags`/`plan_first`/`gate`/`links`，占位路径会在那两个任务的测试里读文件失败。后续 Task 8–10 的测试都要用到这个 helper，在本任务里一次性加好。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `query.ts`：`mustTeamReady` 读 `registry.getTeam`，缺失/`runId`或`coordinatorHandle`为空分别报 `team_unknown`/`run_not_ready`；`fetchTasks` 调 `deps.orca.taskList({ run: team.runId! })`，按 `id` 左连接 `deps.registry.getTaskExt(t.id)`（没有则 `tags:[], plan:null, claimedBy:null, gateFailures:0`）；`findTask` 从 `fetchTasks` 结果里找，找不到报 `task_not_found`；`findTaskAnywhere` 遍历 `registry.listTeams().filter(t=>t.runId)`，对每个调 `fetchTasks` 找 id，找到即返回，否则遍历完报 `task_not_found`；`listTasks`：`team` 给出则只查该队，否则遍历所有已建 Run 的队，合并后按 `status`/`tags`（交集）/`mine`（需要 `resolveActor`+`resolveOwnHandle`，按 `assigneeHandle===handle || claimedBy===actor` 过滤）过滤；`showTask`：`team` 给出调 `findTask`，否则调 `findTaskAnywhere` 取 `.task`。`create.ts`：按 Interfaces 实现，`spec` 文本为 `` `${args.as ?? deps.env.WINGLINE_POST ?? 'human'}: ${args.title}` ``，`taskCreate` 调用带 `retryRequest: args.retryRequest ?? crypto.randomUUID()`；给了 `post` 时解析其 `registry.getPost(args.post)?.handle`（无则 `post_offline`）再 `orca.dispatch({ task: created.id, to: handle, from: coordinatorHandle, inject: true, retryRequest: crypto.randomUUID() })`（`inject: true` 是因为这是派给另一个岗位，对方不会自己来问；和 Task 8 `startTask` 的自派发不同，那里故意不传 `inject`）。`plan.ts`：`findTaskAnywhere` 取任务，`completed`/`failed` 报 `task_terminal`，否则 `registry.setTaskPlan`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task create/list/show/plan"`

---

### Task 8：`wl task claim` / `start`

**Files:**
- Create：`packages/core/src/commands/task/claim.ts`、`packages/core/src/commands/task/start.ts`
- Create：`packages/core/test/commands/task/claim-start.test.ts`

**Interfaces:**
- Consumes：`mustTeamReady`/`fetchTasks`/`findTask`（Task 7）、`resolveActor`/`resolveOwnHandle`（Task 5）、`loadTeamSpec`（Task 1）
- Produces：
  ```ts
  export async function claimTask(deps: CommandDeps, args: { id: string; as?: string }): Promise<void>
  export async function startTask(deps: CommandDeps, args: { id: string; as?: string }): Promise<void>
  ```
  两者都从 `resolveActor` 得到的地址里取 `@` 后半段当团队名（`actor.split('@')[1]`），不接受显式 `team` 参数——这是对 spec 终端命令签名（`wl task claim <id>`，无 `--team`）的忠实实现。

- [ ] **Step 1：写失败测试**

```ts
test('claim: self_claim disabled is rejected', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)   // duo 的 builder/checker 默认 self_claim:false，见 DUO_YAML
  o.tasks.push({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  await expect(claimTask(deps, { id: 't1', as: 'builder@duo' })).rejects.toMatchObject({ code: 'self_claim_disabled' })
})
test('claim: tags mismatch is rejected; empty task tags matches anyone with self_claim', async () => {
  // 用一个 self_claim:true、tags:[backend] 的 team.yaml 变体（helpers.ts 里加一个 SELF_CLAIM_YAML 或在用例里就地 replace）
  // 任务 tags ['frontend'] → tags_mismatch；任务 tags [] → 成立
})
test('claim: already-claimed or non-ready task is rejected', async () => { /* task_not_open */ })
test('claim: two concurrent claims on the same task — the second sees it already claimed', async () => {
  // 复用 up.test.ts 里 team_busy 测试的手法：onCreate 挂起模拟并发不适用（claim 不调用 orca），
  // 改为：直接验证 withTeamLock 包住了 claim（断言 claimTask 内部确实调用了 registry.withTeamLock，
  // 或者功能性地：先 claim 一次成功，再以相同调用 claim 同一个 id，断言第二次因 task_not_open 被拒）
})
test('start: not claimed by you is rejected', async () => { /* not_claimed_by_you */ })
test('start: plan_first without a plan is rejected', async () => { /* plan_required */ })
test('start: wip budget — exactly at the limit is rejected, one below is allowed', async () => {
  // 预置该岗位已有 budgets.maxInProgressPerPost 个 status:'dispatched' 的任务（assigneeHandle = 自己 handle）
  // 再 start 一个新任务 → wip_budget_exceeded；减少一个到 N-1 → 成立
})
test('start: dispatches to the caller\'s own resolved handle', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  // claim 然后 start，断言 o.dispatchCalls[0] === { task: id, to: <自己 handle>, from: 'coord-1' }
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `claim.ts`：`const actor = resolveActor(deps, args.as); const team = actor.split('@')[1]!; const spec = loadTeamSpec(mustTeamReady(deps, team).specPath); const post = spec.posts.find(p => postAddress(p.id, team) === actor)`（找不到报 `post_unknown`）；`!post.selfClaim` → `self_claim_disabled`；`registry.withTeamLock(team, async () => { const task = await findTask(deps, team, args.id); task.status !== 'ready' → task_not_open; task.claimedBy → task_not_open（已被认领视同不再 open）; task.tags.length && !task.tags.some(t => post.tags.includes(t)) → tags_mismatch; registry.setTaskClaimedBy(args.id, actor) })`。`start.ts`：解析 actor/team/post 同上；`const ext = deps.registry.getTaskExt(args.id); ext?.claimedBy !== actor → not_claimed_by_you`；`post.planFirst && !ext.plan → plan_required`；`const handle = await resolveOwnHandle(deps, actor)`；`const rows = await fetchTasks(deps, team)`；统计 `rows.filter(r => r.assigneeHandle === handle && r.status === 'dispatched').length >= spec.budgets.maxInProgressPerPost → wip_budget_exceeded`；否则 `await deps.orca.dispatch({ task: args.id, to: handle, from: (await mustTeamReady(deps, team)).coordinatorHandle! })`——**不传 `inject`（自派发，调用方当下就在这个任务里敲命令）也不传 `retryRequest`**：这是唯一一处 `dispatch` 不接幂等 id 的地方，因为自派发裸重跑天然安全——若上一次其实已经成功，重跑只会撞上 Orca 自己的"已 dispatched 的任务不能再 dispatch"（spec 第 2 节事实 3），这是一个清晰可辨认的错误，不是静默重复，不需要额外的幂等机制兜底。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task claim and start"`

---

### Task 9：`wl task done`

**Files:**
- Create：`packages/core/src/commands/task/done.ts`
- Create：`packages/core/test/commands/task/done.test.ts`
- Modify：`packages/core/test/commands/fake-client.ts`（`FakeOrca` 加一个贯穿所有方法的 `callOrder: string[]`，每个编排方法调用时各推入一个标签字符串——`'taskCreate'`/`'dispatch'`/`'workerDone'`/`'gateCreate'` 等。本任务要断言"哪个调用先发生"，现有各方法各自一个 `XCalls` 数组看不出跨方法的相对顺序）

**Interfaces:**
- Consumes：`runGate`（Task 6）、`mustTeamReady`/`findTask`（Task 7）、`resolveActor`/`resolveOwnHandle`（Task 5）、`Registry.setDoneRequestIds`/`getTaskExt`（Task 2）
- Produces：
  ```ts
  export type DoneOutcome = 'done' | 'gate_failed' | 'escalated'
  export interface DoneResult { outcome: DoneOutcome; linkedTasks?: string[] }
  export async function doneTask(deps: CommandDeps, args: { id: string; cwd?: string; as?: string }): Promise<DoneResult>
  ```
  > spec 第 9 节写的是单数 `linkedTask: string`；`reviewed_by`/`hands_to` 本身是列表，这里改成 `linkedTasks: string[]`（可能为空数组，没有 link 时字段省略）以忠实支持多个目标——做出这个选择是因为单数字段无法表达配置了多个评审人的情况，细节记在这里供以后对照 spec 时核对。

  **调用顺序和幂等 id（spec 2026-10-14 修订后的核心变化）：** 会建立新状态的调用（建关联任务/gate）必须排在把原任务转终态的 `workerDone` 之前，命令中途失败时裸重跑才安全。进入函数后先调一次 `registry.setDoneRequestIds(args.id, { link: crypto.randomUUID(), dispatch: crypto.randomUUID(), report: crypto.randomUUID() })`（只在对应列还是空的时候才真正写入新生成的值，见 Task 2 的 COALESCE 语义），再 `const ext = registry.getTaskExt(args.id)!` 读回**实际生效**的三个 id——裸重跑时读到的是上一次尝试落盘的那一批，不是刚生成的。三个分支都从这里取用：有链接的 `done` 用 `ext.doneLinkRequestId` 给 `taskCreate`、`ext.doneDispatchRequestId` 给链接任务的 `dispatch`、`ext.doneReportRequestId` 给 `workerDone`；`escalated` 用 `ext.doneLinkRequestId` 给 `gateCreate`（和"有链接"分支互斥，不会同时发生在一次调用里，共用一列没有冲突）、`ext.doneReportRequestId` 给 `workerDone`；无链接的 `done` 只用 `ext.doneReportRequestId` 给 `workerDone`。

  **Windows 换行兜底（spec 同一修订）：** gate 的 stdout/stderr 几乎总带换行，而 Orca 调用在 Windows 上经 `.cmd` 包装会拒绝含换行的参数。`deps.multilineSafe` 为假且要塞进 `--body` 的内容含 `\n`/`\r` 时，改成把完整内容写进 `path.join(deps.home, 'logs', team, \`gate-${args.id}-${Date.now()}.txt\`)`，`--body` 只放一行"gate 输出见 <路径>"；`multilineSafe` 为真或内容本来就没有换行，直接截断嵌入（沿用已有的 4000 字符量级）。

- [ ] **Step 1：写失败测试**

```ts
test('not_dispatched_to_you when the task is not assigned to the caller\'s handle', async () => { /* ... */ })
test('task_not_dispatched when status is not dispatched', async () => { /* ... */ })
test('no gate configured: passes trivially', async () => {
  // post.gate === null（team.yaml 没写 gates[post]）→ runGate 不被调用，直接 outcome: 'done'
})
test('gate passes, no links: outcome done, worker_done(succeeded) sent once', async () => {
  const o = new FakeOrca(); /* ... seed a dispatched task assigned to builder's handle ... */
  const r = await doneTask(deps, { id: 't1', as: 'builder@duo' })
  expect(r).toEqual({ outcome: 'done' })
  expect(o.workerDoneCalls).toEqual([{ taskId: 't1', dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', run: 'run-1', from: '<builder 的 handle>' }])
})
test('gate passes, reviewed_by: creates the child task and dispatches it with --inject, in that order, before worker_done', async () => {
  // team.yaml 变体：builder.links.reviewed_by = [checker]
  const r = await doneTask(deps, { id: 't1', as: 'builder@duo' })
  expect(o.taskCreateCalls[0]).toMatchObject({ parent: 't1', spec: expect.stringContaining('评审：') })
  expect(o.dispatchCalls[0]).toMatchObject({ to: '<checker 的 handle>', inject: true })
  expect(o.callOrder.indexOf('taskCreate')).toBeLessThan(o.callOrder.indexOf('dispatch'))
  expect(o.callOrder.indexOf('dispatch')).toBeLessThan(o.callOrder.lastIndexOf('workerDone'))
  expect(r.linkedTasks).toHaveLength(1)
})
test('gate passes, hands_to: same shape with "交接：" prefix', async () => { /* ... */ })
test('gate fails, under budget: outcome gate_failed, no orca call beyond the gate itself', async () => {
  const r = await doneTask(deps, { id: 't1', as: 'builder@duo' })  // gate 命令返回非 0
  expect(r).toEqual({ outcome: 'gate_failed' })
  expect(o.workerDoneCalls).toEqual([])
  expect(deps.registry.getTaskExt('t1')!.gateFailures).toBe(1)
})
test('gate fails, exactly at the budget: outcome escalated, gate-create happens before worker_done(failed)', async () => {
  // 预置 gateFailures = budgets.maxGateFailures - 1，再失败一次
  const r = await doneTask(deps, { id: 't1', as: 'builder@duo' })
  expect(r).toEqual({ outcome: 'escalated' })
  expect(o.callOrder.indexOf('gateCreate')).toBeLessThan(o.callOrder.indexOf('workerDone'))
  expect(o.workerDoneCalls[0]).toMatchObject({ outcome: 'failed' })
  expect(o.gateCreateCalls[0]).toMatchObject({ task: 't1', options: ['retry', 'abandon', 'reassign'] })
  // FakeOrca 按 Task 3 的约定用内部自增计数器分配 id（如 'gate-1'），本测试里这是第一次 gateCreate 调用
  expect(deps.registry.getGateTeam('gate-1')).toBe('duo')
})
test('a bare rerun of wl task done after an interrupted escalated attempt reuses the same retry-request ids and does not duplicate the gate', async () => {
  // 第一次调用前手动 registry.setDoneRequestIds('t1', { link: 'rid-link', report: 'rid-report' }) 模拟"上次已经落盘但没跑完"
  // 断言这次 doneTask 的 gateCreate/workerDone 调用里的 retryRequest 等于 'rid-link'/'rid-report'，不是新生成的随机值
})
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** 解析 `actor`/`team`（同 Task 8 的 `actor.split('@')[1]`）、`post`、`handle = await resolveOwnHandle(...)`；`const task = await findTask(deps, team, args.id)`；`task.assigneeHandle !== handle → not_dispatched_to_you`；`task.status !== 'dispatched' → task_not_dispatched`；`const gate = await runGate(post.gate, args.cwd ?? process.cwd())`；`registry.setDoneRequestIds(args.id, { link: crypto.randomUUID(), dispatch: crypto.randomUUID(), report: crypto.randomUUID() })` 然后 `const ext = registry.getTaskExt(args.id)!` 取回实际生效的三个 id（见上面 Interfaces 的说明）；`const body = toBody(gate.output, deps)`（见下方 `toBody` 说明，Windows 换行兜底）。

  **gate 通过分支，按顺序：** 若 `post.reviewedBy.length` 或 `post.handsTo.length`（互斥，Task 1 已校验不会同时出现），对每个目标地址依次：①`orca.taskCreate({ spec: \`${prefix}${args.id}\`, taskTitle: \`${prefix}${task.title}\`, run, from: coordinatorHandle, parent: args.id, retryRequest: ext.doneLinkRequestId })` → `registry.insertTaskExt({ taskId: created.id, team, tags: [] })`；②`orca.dispatch({ task: created.id, to: <目标 handle>, from: coordinatorHandle, inject: true, retryRequest: ext.doneDispatchRequestId })`，收集进 `linkedTasks`；都做完之后才③`orca.workerDone({ taskId, dispatchId: task.dispatchId!, outcome:'succeeded', subject:'gate passed', body, run: teamRow.runId!, from: handle, retryRequest: ext.doneReportRequestId })`。没有链接时直接做③，跳过①②。

  **gate 不通过分支：** `const n = registry.incrementGateFailures(args.id)`；`n < spec.budgets.maxGateFailures` → 不调用任何 Orca 方法，返回 `{ outcome:'gate_failed' }`；否则按顺序：①`const { id: gateId } = await orca.gateCreate({ task: args.id, question: \`连续 ${n} 次 gate 失败，需要人工决定下一步\`, options: ['retry','abandon','reassign'], from: coordinatorHandle, retryRequest: ext.doneLinkRequestId })`，`registry.recordGate(gateId, team)`；然后②`orca.workerDone({ taskId, dispatchId: task.dispatchId!, outcome:'failed', subject:'gate failed', body, run: teamRow.runId!, from: handle, retryRequest: ext.doneReportRequestId })`；返回 `{ outcome: 'escalated' }`。**①②次序不能颠倒**——这正是本次修订要修的问题：若先调②把原任务转成终态，再调①建 gate 时失败，人工永远看不到这个决策请求。

  `toBody(output: string, deps: CommandDeps): string | undefined`（本任务内部小函数，不需要单独导出）：`output` 为空返回 `undefined`；`deps.multilineSafe` 为真或 `output` 不含 `\n`/`\r`，直接截断到既有的 4000 字符量级；否则把完整 `output` 写入 `path.join(deps.home, 'logs', team, \`gate-${args.id}-${Date.now()}.txt\`)`（`fs.mkdirSync(..., {recursive:true})` 兜底目录不存在），返回 `\`gate 输出见 ${那个路径}\``（单行，不含换行，安全经过 Windows `.cmd` 包装）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task done with gate execution and reviewed_by/hands_to linking"`

---

### Task 10：`wl task escalate` / `resolve`

**Files:**
- Create：`packages/core/src/commands/task/escalate.ts`
- Create：`packages/core/test/commands/task/escalate.test.ts`

**Interfaces:**
- Consumes：`findTaskAnywhere`（Task 7）、`Registry.recordGate`/`getGateTeam`（Task 2）
- Produces：
  ```ts
  export async function escalateTask(deps: CommandDeps, args: { id: string; reason: string }): Promise<{ gateId: string }>
  export async function resolveGate(deps: CommandDeps, args: { gateId: string; resolution: string }): Promise<void>
  ```
  两者均不需要身份参数——spec 原文"人工或当前 owner 均可调用"未对调用方做任何区分校验，和 `plan` 一样不接 `--as`。

- [ ] **Step 1：写失败测试**

```ts
test('escalate creates a gate attributed to the coordinator and records its team', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.tasks.push({ id: 't1', status: 'dispatched', title: 'a', spec: 's', parentId: null, assigneeHandle: 'h', dispatchId: 'ctx-1', result: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  const { gateId } = await escalateTask(deps, { id: 't1', reason: '卡住了' })
  expect(o.gateCreateCalls[0]).toEqual({ task: 't1', question: '卡住了', from: 'coord-1' })
  expect(deps.registry.getGateTeam(gateId)).toBe('duo')
})
test('escalate on an unknown task id fails', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(escalateTask(deps, { id: 'ghost', reason: 'x' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('resolve looks up the owning team\'s coordinator handle from the recorded gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  deps.registry.recordGate('gate-9', 'duo')
  await resolveGate(deps, { gateId: 'gate-9', resolution: 'retry' })
  expect(o.gateResolveCalls[0]).toEqual({ id: 'gate-9', resolution: 'retry', from: 'coord-1' })
})
test('resolve on an unrecorded gate id fails', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(resolveGate(deps, { gateId: 'ghost', resolution: 'x' })).rejects.toMatchObject({ code: 'gate_unknown' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `escalateTask`：`const { team } = await findTaskAnywhere(deps, args.id)`；`const { id } = await deps.orca.gateCreate({ task: args.id, question: args.reason, from: team.coordinatorHandle! })`；`deps.registry.recordGate(id, team.name)`；返回 `{ gateId: id }`。`resolveGate`：`const team = deps.registry.getGateTeam(args.gateId)`，缺失报 `gate_unknown`；`const row = deps.registry.getTeam(team)!`；`await deps.orca.gateResolve({ id: args.gateId, resolution: args.resolution, from: row.coordinatorHandle! })`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task escalate and resolve"`

---

### Task 11：CLI 接入——`wl task <sub>`

**Files:**
- Modify：`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`
- Modify：`packages/core/src/index.ts`（补导出 `commands/task/*`）
- Modify：`packages/cli/test/main.test.ts`

**Interfaces:**
- Consumes：Task 7–10 的全部命令函数
- Produces：可执行的 `wl task create/list/show/claim/start/plan/done/escalate/resolve`

命令面（对照 spec 第 9 节；`claim/start/plan/done/escalate/resolve` 不带显式 `--team`，身份/任务查找自己解析团队，见 Task 7–10）：

```
wl task create <team> --title <t> [--post <addr>] [--tags <a,b>] [--parent <id>] [--as <addr>] [--retry-request <id>] [--json]
wl task list [team] [--mine] [--status <s>] [--tags <a,b>] [--as <addr>] [--json]
wl task show <id> [--team <team>] [--json]
wl task claim <id> [--as <addr>] [--json]
wl task start <id> [--as <addr>] [--json]
wl task plan <id> <text> [--json]
wl task done <id> [--as <addr>] [--json]
wl task escalate <id> --reason <text> [--json]
wl task resolve <gateId> --resolution <text> [--json]
```

`done` 的退出码：`outcome==='done'`（含 `linkedTasks`）→ 0；`gate_failed`/`escalated` → 1。其余命令遵循既有模式（成功 0，`WinglineError` 按 `exitCodeOf`）。

- [ ] **Step 1：写失败测试**

```ts
test('wl task create --json prints the created id', async () => { /* 注入假 commands.taskCreate，断言 stdout JSON 含 result.id */ })
test('wl task done exit codes follow outcome', async () => {
  // 注入假 commands.doneTask 分别返回 {outcome:'done'}/{outcome:'gate_failed'}/{outcome:'escalated'}，断言退出码 0/1/1
})
test('wl task list --tags a,b parses into an array', async () => { /* 断言传给 commands.listTasks 的 args.tags 是 ['a','b'] */ })
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `cli.ts`：`Commands` 接口补 9 个字段，`realCommands` 补对应导入；仿照现有 `up`/`send` 的写法逐个 `program.command('task ...')` 注册，`--tags`/`--options` 等逗号分隔参数用 `.split(',')`（空字符串转 `[]`）；`done` 单独一个 `exitCodeOfDone`（同 `exitCodeOfUp` 的写法）。`output.ts` 补对应的人读渲染函数（`renderTaskCreate`/`renderTaskList`/`renderTaskShow`/`renderTaskDone` 等，格式仿照现有 `renderUp`/`renderPs`）。`index.ts` 补 `export * from './commands/task/...'` 共 7 个文件。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(cli): wl task command surface"`

---

### Task 12：端到端流程测试

**Files:**
- Create：`packages/core/test/commands/task/flow.test.ts`

**Interfaces:**
- Consumes：Task 1–10 的全部产物（不新增接口）

- [ ] **Step 1：写失败测试**

```ts
test('full flow: up establishes the Run, then create → claim → start → done triggers a reviewed_by follow-up that itself completes', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  // team.yaml：builder self_claim+tags:[backend]+gates:'node -e "process.exit(0)"'；links.builder.reviewed_by:[checker]
  const specPath = mkTeam(DUO_YAML_WITH_TASK_FIELDS)
  await up(deps, { specPath })
  const created = await createTask(deps, { team: 'duo', title: '实现登录', tags: ['backend'] })
  await claimTask(deps, { id: created.id, as: 'builder@duo' })
  await startTask(deps, { id: created.id, as: 'builder@duo' })
  const r1 = await doneTask(deps, { id: created.id, as: 'builder@duo' })
  expect(r1.outcome).toBe('done')
  expect(r1.linkedTasks).toHaveLength(1)
  const reviewId = r1.linkedTasks![0]!
  expect((await listTasks(deps, { team: 'duo', mine: true, as: 'checker@duo' })).map((t) => t.id)).toContain(reviewId)
  const r2 = await doneTask(deps, { id: reviewId, as: 'checker@duo' })
  expect(r2.outcome).toBe('done')
  expect((await fetchTasks(deps, 'duo')).every((t) => t.status === 'completed')).toBe(true)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：** 本任务不写新的生产代码，只写测试，验证 Task 1–11 的组合行为；若失败，回到对应任务修正（不在本任务里改动除测试外的文件）。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS。
- [ ] **Step 5：提交** — `git commit -m "test: end-to-end phase 2A task workflow"`

---

## 自检记录

- **spec 覆盖：** spec 第 2 节（实测结论）→ Task 3/4 的 argv/字段映射；第 3 节（shell 例外）→ Task 6；第 4 节（team.yaml）→ Task 1；第 5 节（Run/协调者）→ Task 2/4；第 6 节（注册表）→ Task 2；第 7 节（身份解析）→ Task 5；第 8 节（状态机）→ Task 7–9；第 9 节（命令）→ Task 7–10；第 10 节（错误处理）→ 各任务内联；第 11 节（测试分层）→ Task 3（契约）、Task 7–10（单元）、Task 12（集成）。
- **类型一致性：** `TaskRow`/`OrchestrationTask`/`CommandDeps`/`mustTeamReady`/`findTask`/`resolveActor`/`resolveOwnHandle` 在定义任务与使用任务中签名一致（已核对 Task 7→8/9/10 的消费点）。
- **Review Focus：** 5 条均已在对应任务里有专门测试（见上文 Review Focus 小节的任务标注）。
- **与 spec 的已知偏离（均为实现判断，已在对应任务里注明理由）：** `wl task done` 的 `linkedTask: string` 改为 `linkedTasks: string[]`（Task 9）；`wl task plan`/`escalate`/`resolve` 不接 `--as`（Task 7/10，因为 spec 正文从未对这三个命令的调用方做身份校验，保留这个参数只会是死代码）；`wl task create --post` 的 `dispatch` 和 `wl task done` 链接派发的 `dispatch` 不接受用户传入的 `retryRequest`（始终内部生成），只有 `task-create` 本身暴露 `--retry-request`——两次调用内容不同不能共用一个幂等 id，没有必要为第二次调用也开一个 CLI 参数。
- **2026-10-14 修订带来的新增产物：** `OrcaClient.runUse`（Task 3/4，解决 `wl up` 第二次及以后运行时协调者 handle 刷新）；`task_ext` 的三个 `done_*_request_id` 列和 `Registry.setDoneRequestIds`（Task 2/9，`wl task done` 的裸重跑安全性）；`FakeOrca.callOrder`（Task 9，断言跨方法调用顺序）；`dispatch` 新增 `inject`/`injected` 字段（Task 3，贯穿 Task 7/9 所有"派给别的岗位"的调用点，Task 8 的自派发故意不用）。均已在对应任务的 Interfaces/Step 3 里给出确切签名和理由，不存在"决定了但没写下来"的缺口。
