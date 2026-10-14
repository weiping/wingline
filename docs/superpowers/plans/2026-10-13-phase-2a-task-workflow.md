# 雁阵阶段 2A（任务工作流）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 在已有的阶段 0+1 代码之上，实现 `team.yaml` 的 `links`/`gates`/`budgets`/`posts[].self_claim|tags|plan_first`、编排写调用的幂等账本，以及借用 Orca 原生 `orchestration task-*/dispatch/gate-*` 的 `wl task` 命令族。

**Architecture：** 任务状态机直接是 Orca 原生状态（`ready`/`dispatched`/`blocked`/`completed`/`failed`）。雁阵本地只加：`task_ext`（主人、标签、计划、轮次、失败计数）、`task_done`（每轮 `done` 的终局判定）、`gates`（gate→团队/任务）三张小表，以及给阶段 1 已有的 `requests` 表加两列，让编排写调用"先记 id 与完整参数、再调用、按记录重放"。所有协调者专属调用用团队级缓存的 `coordinator_handle` 当 `--from`，被 fence 时 `run-show` 刷新。

**Tech Stack：** TypeScript、vitest、`node:sqlite`（已用）、commander（已用）；不引入新运行时依赖。

**Spec：** `docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md`（下称 spec）。实现者必须先读 spec 全文，尤其第 2 节（Orca 实测语义）、第 5.2 节（协调者归属）、第 9 节（账本）、第 10 节 `done`。本计划的接口/字段/错误码均取自 spec；spec 留了开放选择时本计划在对应任务里注明决定。

> **2026-10-14 修订：** 按 spec 二次修订同步修正 Task 2/3/4/7/9/11。
>
> **2026-10-14 第三次修订（本版）：** spec 按 Opus 第二次复审与"补充探针三"重新设计后，本计划整体重写：新增 Task 4（账本 `ledgered`/`oneShot`）与 `dispatchTo`（Task 8）；Task 2 改为 `requests` 两列 + `task_done` + `epoch`/`kind`，所有本地插入 `ON CONFLICT DO NOTHING`；Task 3 的 `FakeOrca` 改为模拟 Orca 实测语义（账本先于 fence、gate 结束 dispatch、关闭终端回 `ready` 等），重跑安全由 Task 10 的可执行测试钉住（不再是注释）；Task 5（`wl up`）去掉 `WINGLINE_POST`，只在协调者终端不存活时 `run-use`，并列出它改动的已提交阶段 1 测试；Task 6 身份解析区分显式/隐式；`start --as` 会注入；`escalate`/`resolve` 的幂等方式明确；CLI 暴露 `--retry-request`。

## Global Constraints

- Node ≥ 22.13；不新增运行时依赖。
- 子进程一律 `spawn(file, args, { shell: false })`，**唯一两个例外**：Windows `.cmd` 包装（阶段 1 已有）和 gate 命令执行（`shell: true`，严格限定在 `runGate`，spec 第 3 节约束 6）。
- 退出码四分类沿用总纲 7.8：新增的输入类错误为 1；Orca 明确报错为 2；**编排调用超时/失联为 3（`uncertain`），P1 提示"原样重跑同一条命令"，P2 提示带 `--retry-request <id>`**（spec 第 9、11 节）。
- 规格哈希：新字段参与 `specHash`，沿用阶段 1 规则。
- CI 矩阵不变：`macos-latest`、`ubuntu-latest`、`windows-latest` × Node `22.13`、`24`。gate 测试一律 `node -e "..."`，通过环境变量传路径，不在命令字符串里嵌 Windows 路径。
- **编排写调用的幂等（spec 第 9 节）——每个调用点用哪种模式是固定的，测试断言必须与之一致：**

  | 调用 | 账本键 | 模式 | `retryRequest` |
  | --- | --- | --- | --- |
  | `runCreate`（`wl up`） | `<team>:run-create` | P1 | 总是带，来自账本 |
  | `runUse` | — | — | **不带**（`runUse` 签名里没有这个字段） |
  | `runShow` | — | 只读 | 无 |
  | `taskCreate`（`wl task create`） | — | P2 | 总是带：`--retry-request` 参数或新 UUID |
  | `dispatch` | `dispatch:<task>:<epoch>` | P1 | 总是带 |
  | `workerDone` | `done:<task>:<epoch>:report` | P1 | 总是带 |
  | `taskCreate`（连接子任务） | `done:<task>:<epoch>:link:<目标>` | P1 | 总是带 |
  | `gateCreate`（`done` escalate） | `done:<task>:<epoch>:gate` | P1 | 总是带 |
  | `gateCreate`（`wl task escalate`） | — | P2 | 总是带 |
  | `gateResolve` | `resolve:<gate>` | P1 | 总是带 |

  所以测试里对这些调用的精确断言要么写出 `retryRequest: expect.any(String)`，要么用 `toMatchObject` 只断言关心的字段；**不允许出现"漏掉 `retryRequest` 的 `toEqual`"**（复审 M5 指出的旧断言就是这么坏掉的）。
- 本计划同时改动若干**已提交的阶段 1 文件**，各任务的 Files 列表里逐个列出，包括会因此改断言的已有测试。

## Review Focus

1. **`wl task done` 重跑安全**：上报已落地但超时、子任务已建但派发超时、escalate 中途中断、全部完成后再跑、两次尝试之间协调者被换走——每种都必须"原样重跑同一条命令"即收敛，且 gate 不被重跑、Orca 侧不出现重复对象 → Task 10。
2. **账本四种结果分支**：成功记 done 且再次调用不碰 Orca；`consumer_fenced` 换新 id 刷新协调者重试；明确错误删行；不确定保留 id → Task 4。
3. **`--as` 的 handle 解析**：显式 `--as` 一律 `locatePost`，即使调用方自己设置了 `ORCA_TERMINAL_HANDLE`；`start --as <别人>` 要等空闲并 `--inject` → Task 6、Task 9。
4. **协调者归属**：`wl up` 不把协调者从存活终端上拿走；只在不存活时 `run-use` → Task 5。
5. **预算边界**：WIP 恰好等于上限拒绝；gate 失败次数恰好等于上限转 `escalated` → Task 9、Task 10。
6. **连接触发规则**：评审任务完成不再触发连接（互评有限）；`hands_to` 有环被拒 → Task 1、Task 10、Task 13。

---

## 文件结构

```text
packages/core/src/
  spec/schema.ts                 # 改：新字段 zod 定义；删除 RESERVED_*
  spec/load.ts                   # 改：解析新字段；crossCheck 增加 links/gates 校验与 hands_to 环检测
  spec/hash.ts                   # 改：新字段纳入 specHash
  registry/migrations.ts         # 改：第二个迁移（teams.coordinator_handle、requests 两列、task_ext、task_done、gates）
  registry/registry.ts           # 改：TeamRow.coordinatorHandle；RequestRow 扩展 + 账本方法；task_ext/task_done/gates 方法
  orca/types.ts                  # 改：OrchestrationTask 等类型；OrcaClient 新增 9 个编排方法
  orca/client.ts                 # 改：实现上面 9 个方法
  commands/deps.ts               # 改：CommandDeps.env；requestId 注释限定为 terminal 命令族
  commands/up.ts                 # 改：posts 循环后建立/保持协调者（UpResult.run）
  commands/task/ledger.ts        # 新：ledgered / oneShot / refreshCoordinator
  commands/task/identity.ts      # 新：resolveActor / requireActor / resolveHandle / isOwnTerminal
  commands/task/gate-exec.ts     # 新：runGate（唯一的 shell:true 子进程）
  commands/task/query.ts         # 新：TaskRow、mustTeamReady、fetchTasks、findTask、findTaskAnywhere、listTasks、showTask
  commands/task/dispatch.ts      # 新：dispatchTo（P1 派发、epoch、inject 判断）
  commands/task/create.ts        # 新：createTask
  commands/task/plan.ts          # 新：planTask
  commands/task/claim.ts         # 新：claimTask
  commands/task/start.ts         # 新：startTask
  commands/task/done.ts          # 新：doneTask
  commands/task/escalate.ts      # 新：escalateTask、resolveGate
  index.ts                       # 改：导出 commands/task/*
packages/cli/src/
  cli.ts                         # 改：wl task 子命令；defaultMakeDeps 填 env；exitCodeOfUp 考虑 run 步骤
  output.ts                      # 改：task 渲染；renderUp 输出 run 步骤
packages/core/test/
  spec/load.test.ts, spec/hash.test.ts          # 改
  registry/registry.test.ts                     # 改：TeamRow 常量补 coordinatorHandle；新表用例
  commands/down.test.ts, send.test.ts, ps.test.ts   # 改：TeamRow 字面量补 coordinatorHandle: null
  commands/up.test.ts                           # 改：已有用例 'fresh up does create → wait → brief per post' 的两处断言；新增 run 步骤用例
  commands/fake-client.ts                       # 改：FakeOrca 编排模型、seedRunningTeam、mkDeps 默认 env
  orca/client.test.ts                           # 改：9 个编排方法的 argv/映射用例
  commands/task/*.test.ts                       # 新：ledger、identity、gate-exec、query、dispatch、create、claim-start、done、escalate、flow
packages/cli/test/
  main.test.ts                                  # 改：wl task CLI 用例
```

> 任务命令放在 `commands/task/` 子目录：文件多、彼此共享 `mustTeamReady`/`resolveActor`/`dispatchTo`/账本这类专属逻辑。测试目录镜像同样结构。

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
  export interface TeamSpec { /* 原有字段 */ budgets: { maxInProgressPerPost: number; maxGateFailures: number } }
  ```

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
test('budgets default to 3/3; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).budgets).toEqual({ maxInProgressPerPost: 3, maxGateFailures: 3 })
  const y = DUO_YAML + 'budgets:\n  team:\n    max_in_progress_per_post: 5\n  task:\n    max_gate_failures: 2\n'
  expect(loadTeamSpec(mkTeam(y)).budgets).toEqual({ maxInProgressPerPost: 5, maxGateFailures: 2 })
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
  expect(new Set([base, withTag, withGate]).size).toBe(3)
})
```

- [ ] **Step 2：运行确认失败** — `pnpm vitest run packages/core/test/spec` → FAIL。
- [ ] **Step 3：实现。** `schema.ts`：`postSchema` 加 `self_claim: z.boolean().default(false)`、`tags: z.array(z.string().regex(ID)).default([])`、`plan_first: z.boolean().default(false)`；`teamSchema` 加 `links: z.record(z.string(), z.object({ reviewed_by: z.array(z.string()).optional(), hands_to: z.array(z.string()).optional(), consults: z.array(z.string()).optional() }).strict()).default({})`、`gates: z.record(z.string(), z.string().min(1)).default({})`、`budgets: z.object({ team: z.object({ max_in_progress_per_post: z.number().int().positive().default(3) }).strict().default({}), task: z.object({ max_gate_failures: z.number().int().positive().default(3) }).strict().default({}) }).strict().default({})`；删除 `RESERVED_TOP`、`RESERVED_POST`。`load.ts`：删除 `rejectReserved`；`crossCheck` 新增：`links` 的键与每个 `reviewed_by`/`hands_to`/`consults` 元素不在 posts id 集合 → `links_unknown_post`；同一键同时有 `reviewed_by` 与 `hands_to` → `links_conflict`；`gates` 键不在集合 → `gates_unknown_post`；对 `hands_to` 边做 DFS 环检测（白/灰/黑三色，发现灰色节点即有环，回溯出环上的 id 列表），有环 → `at.fail('links_cycle', ['links'], \`hands_to 形成环：${cycle.join(' → ')}\`)`。为保持函数 ≤50 行，环检测抽成独立函数 `findHandsToCycle(links): string[] | null`。`loadTeamSpec` 给每个 post 填新字段，顶层填 `budgets`。`hash.ts`：`normalised.posts` 每项加 `selfClaim`/`tags`/`planFirst`/`gate`/`reviewedBy`/`handsTo`，顶层加 `budgets`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/spec` → PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): parse links/gates/budgets/self_claim/tags/plan_first"`

---

### Task 2：注册表扩展——协调者、账本两列、`task_ext`、`task_done`、`gates`

**Files:**
- Modify：`packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`
- Modify：`packages/core/src/commands/up.ts`（仅 `registerTeam` 里 `upsertTeam` 补 `coordinatorHandle: existing?.coordinatorHandle ?? null`）
- Modify（已提交的阶段 1 测试，只补字段）：`packages/core/test/registry/registry.test.ts`（文件顶部 `const team: TeamRow` 补 `coordinatorHandle: null`）、`packages/core/test/commands/down.test.ts`、`send.test.ts`、`ps.test.ts`（各自 `upsertTeam({...})` 字面量补 `coordinatorHandle: null`）

**Interfaces:**
- Produces：
  ```ts
  export interface TeamRow { name: string; specPath: string; specHash: string; runId: string | null; coordinatorHandle: string | null; status: 'up' | 'stopped' }
  export interface RequestRow { state: RequestState; receipt: string | null; retryRequest: string | null; args: string | null }
  getRequest(id: string): RequestRow | null           // 扩展返回字段；阶段 1 调用点只读 state/receipt，不受影响
  openIntent(id: string, retryRequest: string, args: unknown): void    // INSERT … ON CONFLICT(id) DO NOTHING，state='pending'
  reissueIntent(id: string, retryRequest: string, args: unknown): void // UPDATE：换 id 与参数，state='pending'，receipt=NULL
  dropRequest(id: string): void

  export type TaskKind = 'work' | 'review'
  export interface TaskExtRow { taskId: string; team: string; tags: string[]; kind: TaskKind; plan: string | null; claimedBy: string | null; epoch: number; gateFailures: number }
  insertTaskExt(row: { taskId: string; team: string; tags: string[]; kind: TaskKind; claimedBy?: string | null }): void  // ON CONFLICT DO NOTHING
  getTaskExt(taskId: string): TaskExtRow | null
  setTaskClaimedBy(taskId: string, claimedBy: string | null): void
  setTaskPlan(taskId: string, plan: string): void
  incrementGateFailures(taskId: string): number
  bumpEpoch(taskId: string, resetGateFailures: boolean): number          // 返回新的 epoch

  export interface DoneVerdictRow {
    taskId: string; epoch: number; post: string; verdict: 'passed' | 'escalate'; gateFailures: number
    dispatchId: string; reportFrom: string; body: string | null; result: string | null; finishedAt: string | null
  }
  /** 一个事务：verdict='escalate' 时同时 task_ext.gate_failures = row.gateFailures；INSERT … ON CONFLICT DO NOTHING；返回读回的行（并发时是先落盘者）。 */
  recordVerdict(row: Omit<DoneVerdictRow, 'result' | 'finishedAt'>): DoneVerdictRow
  getVerdict(taskId: string, epoch: number): DoneVerdictRow | null
  finishVerdict(taskId: string, epoch: number, result: unknown): void
  listFinishedVerdicts(post: string, limit: number): DoneVerdictRow[]   // ORDER BY finished_at DESC, rowid DESC（同一毫秒内以插入顺序为准）；2B 的闸门连败用

  recordGate(gateId: string, team: string, taskId: string): void        // ON CONFLICT DO NOTHING
  getGate(gateId: string): { team: string; taskId: string } | null
  ```

- [ ] **Step 1：写失败测试**（`registry.test.ts`，沿用文件里已有的 `tmpDb()` 与 `team` 常量；所有涉及 `task_ext`/`task_done`/`gates` 的用例先 `upsertTeam`——这三张表的 `team` 列有外键）

```ts
const running: TeamRow = { ...team, runId: 'run-1', coordinatorHandle: 'coord-1' }

test('teams round-trips coordinatorHandle', () => {
  const r = Registry.open(tmpDb())
  r.upsertTeam(running)
  expect(r.getTeam('duo')).toMatchObject({ runId: 'run-1', coordinatorHandle: 'coord-1' })
})
test('intent ledger: open is insert-if-absent, reissue replaces id+args, drop deletes', () => {
  const r = Registry.open(tmpDb())
  r.openIntent('k', 'id-1', { a: 1 })
  r.openIntent('k', 'id-2', { a: 2 })   // 已存在：不覆盖
  expect(r.getRequest('k')).toEqual({ state: 'pending', receipt: null, retryRequest: 'id-1', args: JSON.stringify({ a: 1 }) })
  r.finishRequest('k', 'uncertain', { error: 'timeout' })
  r.reissueIntent('k', 'id-3', { a: 3 })
  expect(r.getRequest('k')).toMatchObject({ state: 'pending', retryRequest: 'id-3', args: JSON.stringify({ a: 3 }), receipt: null })
  r.dropRequest('k')
  expect(r.getRequest('k')).toBeNull()
})
test('insertTaskExt is idempotent (a replayed Orca result lands on an existing row)', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo' })
  expect(() => r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'review' })).not.toThrow()
  expect(r.getTaskExt('t1')).toEqual({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', epoch: 0, gateFailures: 0 })
})
test('task_ext setters, gate failure counter and epoch bump', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  r.setTaskClaimedBy('t1', 'builder@duo'); r.setTaskPlan('t1', '先读代码')
  expect(r.incrementGateFailures('t1')).toBe(1)
  expect(r.incrementGateFailures('t1')).toBe(2)
  expect(r.bumpEpoch('t1', false)).toBe(1)
  expect(r.getTaskExt('t1')).toMatchObject({ claimedBy: 'builder@duo', plan: '先读代码', gateFailures: 2, epoch: 1 })
  expect(r.bumpEpoch('t1', true)).toBe(2)
  expect(r.getTaskExt('t1')!.gateFailures).toBe(0)
})
test('recordVerdict: first writer wins; escalate also pins gate_failures in the same transaction', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.insertTaskExt({ taskId: 't1', team: 'duo', tags: [], kind: 'work' })
  const base = { taskId: 't1', epoch: 0, post: 'builder@duo', dispatchId: 'ctx-1', reportFrom: 'term-b', body: 'out' }
  const first = r.recordVerdict({ ...base, verdict: 'escalate', gateFailures: 3 })
  const second = r.recordVerdict({ ...base, verdict: 'passed', gateFailures: 0 })
  expect(second).toEqual(first)
  expect(first).toMatchObject({ verdict: 'escalate', gateFailures: 3, result: null, finishedAt: null })
  expect(r.getTaskExt('t1')!.gateFailures).toBe(3)
  r.finishVerdict('t1', 0, { outcome: 'escalated' })
  expect(r.getVerdict('t1', 0)).toMatchObject({ result: JSON.stringify({ outcome: 'escalated' }), finishedAt: expect.any(String) })
})
test('listFinishedVerdicts returns only finished rows for that post, newest first', async () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  for (const id of ['a', 'b', 'c']) {
    r.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work' })
    r.recordVerdict({ taskId: id, epoch: 0, post: 'builder@duo', verdict: 'escalate', gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null })
  }
  r.finishVerdict('a', 0, {}); await new Promise((res) => setTimeout(res, 5)); r.finishVerdict('b', 0, {})
  expect(r.listFinishedVerdicts('builder@duo', 5).map((v) => v.taskId)).toEqual(['b', 'a'])
})
test('gates map gate id to team and task; recordGate is idempotent', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.recordGate('gate-1', 'duo', 't1')
  expect(() => r.recordGate('gate-1', 'duo', 't1')).not.toThrow()
  expect(r.getGate('gate-1')).toEqual({ team: 'duo', taskId: 't1' })
  expect(r.getGate('ghost')).toBeNull()
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `migrations.ts` 追加第二项：
  ```sql
  ALTER TABLE teams ADD COLUMN coordinator_handle TEXT;
  ALTER TABLE requests ADD COLUMN retry_request TEXT;
  ALTER TABLE requests ADD COLUMN args TEXT;
  CREATE TABLE task_ext (task_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), tags TEXT NOT NULL,
    kind TEXT NOT NULL, plan TEXT, claimed_by TEXT, epoch INTEGER NOT NULL DEFAULT 0,
    gate_failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE task_done (task_id TEXT NOT NULL, epoch INTEGER NOT NULL, post TEXT NOT NULL, verdict TEXT NOT NULL,
    gate_failures INTEGER NOT NULL, dispatch_id TEXT NOT NULL, report_from TEXT NOT NULL, body TEXT, result TEXT,
    finished_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (task_id, epoch));
  CREATE TABLE gates (gate_id TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), task_id TEXT NOT NULL);
  ```
  `registry.ts`：`teamRow`/`upsertTeam` 加 `coordinator_handle`；`getRequest` 多读两列；账本方法按签名，`args` 用 `JSON.stringify`；`insertTaskExt`/`recordGate` 用 `INSERT … ON CONFLICT DO NOTHING`；`recordVerdict` 在一个 `BEGIN IMMEDIATE … COMMIT` 里：先 `SELECT` 这一 `(task_id, epoch)` 是否已有行，有则直接提交并返回它（先落盘者胜，`gate_failures` 不动）；没有则（仅 escalate 时）`UPDATE task_ext SET gate_failures = ?`，再 `INSERT`，提交后 `getVerdict` 读回；`bumpEpoch` 一条 `UPDATE … SET epoch = epoch + 1[, gate_failures = 0]` 后读回；`finishVerdict` 写 `result = JSON.stringify(result)`、`finished_at = now()`。`up.ts` 一行改动见 Files。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test` → PASS（含阶段 1 全部测试）；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): registry support for coordinator, intent ledger, task_ext, task_done, gates"`

---

### Task 3：`OrcaClient` 编排方法 + 模拟实测语义的 `FakeOrca`

**Files:**
- Modify：`packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`
- Modify：`packages/core/src/commands/deps.ts`（`CommandDeps` 加 `env: NodeJS.ProcessEnv`；`requestId` 上那句注释限定为"`terminal` 命令族的 --retry-request 只认 Orca 分配的 UUID；编排命令族见 commands/task/ledger.ts"）
- Modify：`packages/cli/src/cli.ts`（`defaultMakeDeps` 填 `env`）
- Modify：`packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.ts`

**Interfaces:**
- Produces（本计划是 `runUse`/`runShow` 的**唯一**声明处，2B 计划只消费）：
  ```ts
  export type OrchestrationTaskStatus = 'ready' | 'dispatched' | 'blocked' | 'completed' | 'failed'
  export interface OrchestrationTask {
    id: string; status: OrchestrationTaskStatus; title: string; spec: string; parentId: string | null
    assigneeHandle: string | null; dispatchId: string | null   // 终态/blocked 任务的 task-list 不带这两个键 → null
    result: string | null                                       // Orca 的 JSON 字符串原样保留
  }
  runCreate(a: { objective: string; from: string; retryRequest?: string }): Promise<{ id: string; coordinatorHandle: string; replayed: boolean }>
  runUse(a: { id: string; from: string }): Promise<{ coordinatorHandle: string }>
  runShow(a: { id: string }): Promise<{ coordinatorHandle: string }>
  taskCreate(a: { spec: string; taskTitle: string; run: string; from: string; parent?: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  taskList(a: { run: string }): Promise<OrchestrationTask[]>
  dispatch(a: { task: string; to: string; from: string; inject?: boolean; retryRequest?: string }): Promise<{ dispatchId: string; injected: boolean; replayed: boolean }>
  workerDone(a: { taskId: string; dispatchId: string; outcome: 'succeeded' | 'failed'; subject: string; body?: string; run: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  gateCreate(a: { task: string; question: string; from: string; retryRequest?: string }): Promise<{ id: string; replayed: boolean }>
  gateResolve(a: { id: string; resolution: string; from: string; retryRequest?: string }): Promise<{ replayed: boolean }>
  ```
  共 9 个方法。`replayed` 一律取 `r.mutation?.replayed ?? false`。argv（`runner.json` 自动追加 `--json`）；`--inject` 在 `--retry-request` 之前，两者都只在给出时追加在末尾：
  - `runCreate` → `orchestration run-create --objective <o> --from <f>`，读 `r.run.id`、`r.run.coordinator_handle`
  - `runUse` → `orchestration run-use --id <id> --from <f>`，读 `r.run.coordinator_handle`（R3-A5 已直接确认回执形状）
  - `runShow` → `orchestration run-show --id <id>`，读 `r.run.coordinator_handle`
  - `taskCreate` → `orchestration task-create --spec <s> --task-title <t> --run <r> --from <f> [--parent <p>]`，读 `r.task.id`
  - `taskList` → `orchestration task-list --run <r>`，映射 `task_title→title`、`parent_id→parentId`、`assignee_handle→assigneeHandle`（缺省 null）、`dispatch_id→dispatchId`（缺省 null），`result` 原样
  - `dispatch` → `orchestration dispatch --task <t> --to <h> --from <f>`，读 `r.dispatch.id`、`r.injected`
  - `workerDone` → `orchestration send --type worker_done --outcome <o> --task-id <t> --dispatch-id <d> --subject <s> [--body <b>] --run <r> --from <f>`
  - `gateCreate` → `orchestration gate-create --task <t> --question <q> --from <f>`，读 `r.gate.id`（不传 `--options`：spec 第 10 节的提问文本自带说明，`resolve` 的效果与选项无关）
  - `gateResolve` → `orchestration gate-resolve --id <id> --resolution <r> --from <f>`

- [ ] **Step 1：写失败测试（`client.test.ts`，沿用已有 `clientWith`——它已经返回 `{ client, calls, opts }`）**

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
test('dispatch: --inject before --retry-request; reads dispatch.id, injected, replayed', async () => {
  const { client, calls } = clientWith({ 'orchestration dispatch': { dispatch: { id: 'ctx-1' }, injected: true, ...m('rid') } })
  expect(await client.dispatch({ task: 't1', to: 'h2', from: 'c', inject: true, retryRequest: 'rid' })).toEqual({ dispatchId: 'ctx-1', injected: true, replayed: false })
  expect(calls[0]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c', '--inject', '--retry-request', 'rid'])
  await client.dispatch({ task: 't1', to: 'h2', from: 'c' })
  expect(calls[1]).toEqual(['orchestration', 'dispatch', '--task', 't1', '--to', 'h2', '--from', 'c'])
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
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现 `types.ts`/`client.ts`。**
- [ ] **Step 4：`FakeOrca` 编排模型（`fake-client.ts`）。** 2A 的重跑安全只有在假客户端忠实模拟 spec 第 2 节的实测语义时才测得出来（复审 M1f），所以本步不是"记录调用、回显参数"，而是一个小模型：
  - 状态：`coordinator: string | null`、`tasks: OrchestrationTask[]`（内部保留 assignee/dispatch，`taskList()` 对 `blocked`/`completed`/`failed` 输出 null）、`gates: Map<string, { taskId: string; status: 'pending' | 'resolved' }>`、`ledger: Map<string, { input: string; result: unknown }>`、`injectRejected: Set<string>`（这些 handle 上 `--inject` 被拒）、`faults: Array<{ method: string; when: 'before' | 'after'; error: Error }>`（按方法名取第一条匹配并移除）、`orch: Array<{ m: string; a: Record<string, unknown> }>`（除只读的 `taskList` 之外每次编排调用的入参——写调用、`runUse`/`runShow`，以及 2B 加的 `check`；`taskList` 只进 `calls`，这样"不该有 Orca 写调用"的断言可以直接写 `expect(o.orch).toEqual([])`），`callsOf(m)` 返回该方法的入参数组。每个编排方法同时往阶段 1 已有的 `calls` 字符串数组推方法名，测试可以用 `calls` 断言跨方法顺序（不再另设 `callOrder`）。
  - 写调用统一经 `mutate(m, a, { coordinatorOnly }, exec)`：①有 `retryRequest` 且账本里有 → 入参（去掉 `retryRequest` 后 `JSON.stringify`）不同则抛 `orca`/`request_mismatch`，相同则返回存下的**快照** + `replayed: true`（**账本检查在协调者校验之前**，R3-A3）；②取 `before` 故障；③`coordinatorOnly` 且 `a.from !== coordinator` → `consumer_fenced`；④`exec()`；⑤有 `retryRequest` 则存账本（`structuredClone` 快照）；⑥取 `after` 故障（模拟"已落地但调用方看到超时"）；返回结果 + `replayed: false`。
  - `runCreate`：`coordinator = from`，返回 `run-1`。`runUse`（不经账本，但同样先取 `before` 故障，供 2B 测启动重试）：`coordinator = from`。`runShow`：返回 `coordinator`。
  - `taskCreate`（coordinatorOnly）：推一条 `ready` 任务，id `task-N`。
  - `dispatch`（coordinatorOnly）：任务不是 `ready` → `orca`/`invalid_state`；`inject && injectRejected.has(to)` → `orca`/`inject_rejected`（不改状态，R3-C1）；否则 `dispatched`、`assigneeHandle = to`、`dispatchId = ctx-N`，`injected = !!inject`。
  - `workerDone`（非 coordinatorOnly）：任务不是 `dispatched` 或 dispatchId 不符 → `inactive_dispatch`；`from !== assigneeHandle` → `worker_identity_changed`；否则按 `outcome` 转 `completed`/`failed`，`result = JSON.stringify({ outcome, reportedBy: from })`。
  - `gateCreate`（coordinatorOnly）：`gate-N` pending，任务 → `blocked`（R3-B1）。`gateResolve`（coordinatorOnly）：gate 不存在 → `gate_not_found`；→ resolved，任务 → `ready`（R3-B2）。
  - `terminalClose` 追加：把 assignee 为该 handle 的 `dispatched` 任务放回 `ready`（R3-C3）。
  - `mkDeps` 默认 `env: {}`（可被 `over` 覆盖）。
  - 新 helper `seedRunningTeam(o, over?: Partial<CommandDeps> & { yaml?: string })`：`mkDeps` → `registry.upsertTeam({ name: 'duo', specPath: mkTeam(over?.yaml ?? DUO_YAML), specHash: 'h'.repeat(64), runId: 'run-1', coordinatorHandle: 'coord-1', status: 'up' })`，`o.coordinator = 'coord-1'`，登记两个岗位 `builder@duo`（handle `term-b`，lead）与 `checker@duo`（handle `term-c`），并往 `o.terminals` 推两条对应终端（title 即地址）。`specPath` 必须是真实的临时文件（Task 9/10 会 `loadTeamSpec` 它）。

  `FakeOrca` 自身的语义用少量测试钉住（`test/commands/fake-client.test.ts`，新文件）：同 id 同参数回放返回旧快照、同 id 不同参数 `request_mismatch`、换协调者后旧 `from` 重放仍回放而新 id 被 fence、`gateCreate` 让 `dispatched` 变 `blocked` 且之后 `workerDone` 抛 `inactive_dispatch`、`terminalClose` 让任务回 `ready`。每条三五行，这里不逐字列出——它们是 spec 第 2 节事实 3、7 的逐条翻译。
- [ ] **Step 5：运行确认通过** — `pnpm vitest run packages/core/test` → PASS；`pnpm typecheck`。
- [ ] **Step 6：提交** — `git commit -m "feat(core): orchestration methods on OrcaClient and a FakeOrca that models Orca's replay/fence/gate semantics"`

---

### Task 4：幂等账本——`ledgered` / `oneShot` / `refreshCoordinator`

**Files:**
- Create：`packages/core/src/commands/task/ledger.ts`、`packages/core/test/commands/task/ledger.test.ts`

**Interfaces:**
- Consumes：`Registry` 账本方法（Task 2）、`OrcaClient.runShow`（Task 3）
- Produces：
  ```ts
  export interface LedgerCall<A extends object, R> {
    key: string
    team: string                                   // 团队名：fence 时刷新它的 coordinator_handle
    build: (team: TeamRow) => A | Promise<A>       // 完整参数（不含 retryRequest）；只在首次和 fence 重发时调用
    call: (a: A & { retryRequest: string }) => Promise<R>
  }
  /** spec 第 9.1 节 P1。返回值：done 行直接返回存下的结果（不调用 Orca）。 */
  export async function ledgered<A extends object, R>(deps: CommandDeps, c: LedgerCall<A, R>): Promise<R>
  /** spec 第 9.1 节 P2：retryRequest 缺省时新生成；不落盘；超时类错误的 hint 由 retryHint(id) 给出。 */
  export async function oneShot<A extends object, R>(deps: CommandDeps, c: Omit<LedgerCall<A, R>, 'key'> & { retryRequest?: string; retryHint: (id: string) => string }): Promise<R>
  export async function refreshCoordinator(deps: CommandDeps, team: string): Promise<TeamRow>
  ```

- [ ] **Step 1：写失败测试**

```ts
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
test('landed-but-timed-out: uncertain with the id kept; rerun replays the same id and creates nothing new', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain', hint: expect.stringContaining('原样重跑') })
  const id = registry.getRequest('k')!.retryRequest
  expect(registry.getRequest('k')!.state).toBe('uncertain')
  const r = await createCall(deps, o)
  expect(o.callsOf('taskCreate').map((a) => a.retryRequest)).toEqual([id, id])
  expect(o.tasks).toHaveLength(1)
  expect(r.id).toBe(o.tasks[0]!.id)
})
test('consumer_fenced on a pending replay: the original never landed → refresh coordinator, new id, retry once', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain' })
  const firstId = registry.getRequest('k')!.retryRequest
  await o.runUse({ id: 'run-1', from: 'coord-2' })          // 有人在两次尝试之间换了协调者
  await createCall(deps, o)
  const calls = o.callsOf('taskCreate')
  expect(calls.at(-1)).toMatchObject({ from: 'coord-2' })
  expect(calls.at(-1)!.retryRequest).not.toBe(firstId)
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
  expect(o.tasks).toHaveLength(1)
})
test('a landed call replays even after the coordinator changed (ledger is checked before fencing)', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  await createCall(deps, o)
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-1' })   // 原参数原样重放
  expect(o.tasks).toHaveLength(1)
  expect(registry.getRequest('k')!.state).toBe('done')
})
test('a definite Orca error drops the row so the next attempt starts fresh', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'before', error: new WinglineError('orca', 'inject_rejected', 'x') })
  await expect(createCall(deps, o)).rejects.toMatchObject({ kind: 'orca', code: 'inject_rejected' })
  expect(registry.getRequest('k')).toBeNull()
})
test('oneShot: generates an id unless given; an uncertain failure prints it in the hint', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'taskCreate', when: 'after', error: timeout() })
  const run = (retryRequest?: string) => oneShot(deps, {
    team: 'duo', retryRequest, retryHint: (id) => `wl task create duo --title t --retry-request ${id}`,
    build: (t) => ({ spec: 's', taskTitle: 't', run: t.runId!, from: t.coordinatorHandle! }), call: (a) => o.taskCreate(a),
  })
  const err = await run().catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
  await run(id)
  expect(o.tasks).toHaveLength(1)
})
```

> 第一条测试用到 `FakeOrca.onMutate?: () => void`（在 `mutate` 的第②步之前调用），已列入 Task 3 的模型，用来观察"调用发生时账本行的状态"。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `ledgered`：读行；`done` → `JSON.parse(receipt)`；无行 → `openIntent(key, randomUUID(), await build(team))` 后重读；调用 `call({ ...JSON.parse(args), retryRequest })`。捕获：`fenced`（`kind==='orca' && code==='consumer_fenced'`）且尚未重发 → `const t = await refreshCoordinator(...)`、`reissueIntent(key, randomUUID(), await build(t))`、重来一次；其他 `kind==='orca'` → `dropRequest(key)` 后上抛；`kind==='uncertain'` → `finishRequest(key, 'uncertain', { error })`，上抛 `new WinglineError('uncertain', err.code, err.message, { hint: \`原样重跑同一条命令即可：幂等 id ${retryRequest} 已记录，不会重复执行\`, cause: err })`；其余（内部错误）原样上抛。成功 → `finishRequest(key, 'done', value)`。`oneShot`：同样的 fence 重试（换新 id），不读写 `requests`；`uncertain` 时 hint 用 `retryHint(id)`。`refreshCoordinator`：`runShow({ id: team.runId! })` → `upsertTeam({ ...team, coordinatorHandle })` → 返回新行。三个函数各自 ≤50 行；`ledgered` 的错误分类抽成 `classify(err)`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): persisted intent ledger for orchestration writes"`

---

### Task 5：`wl up`——建立 Run、按规则保持协调者

**Files:**
- Modify：`packages/core/src/commands/up.ts`
- Modify：`packages/cli/src/cli.ts`（`exitCodeOfUp`：`r.run?.outcome === 'failed'` → 2，`'uncertain'` → 3，与岗位结果取最严重者）、`packages/cli/src/output.ts`（`renderUp` 多一行 Run 步骤）
- Modify（**已提交的阶段 1 测试，有断言要改**）：`packages/core/test/commands/up.test.ts`
  - 用例 `'fresh up does create → wait → brief per post'`：`o.calls` 的精确序列末尾追加 `'runCreate'`；`getTeam('duo')` 的期望从 `{ status: 'up', runId: null }` 改为 `{ status: 'up', runId: 'run-1', coordinatorHandle: 'term-1' }`。这是预期内的行为变化（阶段 2A 起 `wl up` 建 Run），不是回归。
  - 其余已有用例不受影响：启动命令保持原样（本计划不再注入 `WINGLINE_POST`，`'terminal is created with title, worktree and launch command'` 不用改）；其他用例没有对 `calls` 做精确断言或检查 `runId`。实现后跑一遍整个文件确认。
- Modify：`packages/cli/test/main.test.ts`（`up` 的退出码用例补一条 `run.outcome === 'uncertain'` → 3）

**Interfaces:**
- Consumes：`ledgered`（Task 4）、`runCreate`/`runUse`/`terminalList`（Task 3）
- Produces：
  ```ts
  export interface UpResult {
    team: string
    posts: Array<{ address: string; outcome: UpOutcome; reason?: string; retry?: string }>
    run: { outcome: 'created' | 'kept' | 'reclaimed' | 'deferred' | 'failed' | 'uncertain'; runId: string | null; reason?: string; retry?: string }
  }
  ```

- [ ] **Step 1：写失败测试（`up.test.ts` 新增）**

```ts
test('first up creates the Run from the lead handle through the ledger', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const r = await up(deps, { specPath: duo() })
  expect(r.run).toEqual({ outcome: 'created', runId: 'run-1' })
  expect(o.callsOf('runCreate')).toEqual([{ objective: 'wingline:duo', from: 'term-1', retryRequest: expect.any(String) }])
  expect(registry.getRequest('duo:run-create')!.state).toBe('done')
})
test('a timed-out run-create is uncertain; rerunning wl up replays it instead of creating a second Run', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const p = duo()
  o.faults.push({ method: 'runCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'uncertain', retry: `wl up ${p}` })
  expect((await up(deps, { specPath: p })).run).toMatchObject({ outcome: 'created', runId: 'run-1' })
  const ids = o.callsOf('runCreate').map((a) => a.retryRequest)
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0])
})
test('second up keeps the coordinator while its terminal is alive (e.g. a running dispatcher)', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  registry.upsertTeam({ ...registry.getTeam('duo')!, coordinatorHandle: 'term-dsp' }); o.coordinator = 'term-dsp'
  expect((await up(deps, { specPath: p })).run).toEqual({ outcome: 'kept', runId: 'run-1' })
  expect(o.callsOf('runUse')).toEqual([])
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
test('second up reclaims for the lead when the coordinator terminal is gone', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o); const p = duo()
  await up(deps, { specPath: p })
  await o.terminalClose({ handle: 'term-1' })            // lead 终端被关，下一轮 up 重建出 term-3
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
  expect(r.run.runId).toBe('run-1')
  expect(o.callsOf('runCreate')).toHaveLength(1)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `up()` 在 posts 循环后调用新函数 `ensureRun(l, posts)`：lead 结果不是 `launched`/`already_live` → `{ outcome: 'deferred', runId: team.runId }`；`leadHandle = registry.getPost(leadAddress)!.handle!`；无 `runId` → `ledgered(deps, { key: \`${name}:run-create\`, team: name, build: () => ({ objective: \`wingline:${name}\`, from: leadHandle }), call: (a) => orca.runCreate(a) })`，写回 `runId`/`coordinatorHandle`，`created`；有 `runId` → `terminalList()` 里有 `coordinatorHandle` → `kept`，否则 `runUse({ id, from: leadHandle })` 写回，`reclaimed`。捕获 `WinglineError`：`orca` → `failed`（`reason`）；`uncertain` → `uncertain`（`reason`、`retry: \`wl up ${specPath}\``）；`input`/`internal` 照旧上抛。`ensureRun` 保持在团队锁内执行（`up()` 已有的 `withTeamLock`）。`runUse` 不带 `--retry-request`（Global Constraints）。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/commands/up.test.ts packages/cli` → PASS（含按 Files 修改过的那一条已有用例）。
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl up establishes the orchestration Run and keeps the coordinator per the ownership rule"`

---

### Task 6：身份解析——`resolveActor` / `resolveHandle` / `isOwnTerminal`

**Files:**
- Create：`packages/core/src/commands/task/identity.ts`、`packages/core/test/commands/task/identity.test.ts`（`CommandDeps.env` 已在 Task 3 加好）

**Interfaces:**
- Produces：
  ```ts
  export interface Actor { address: string; explicit: boolean; handle?: string }   // handle 只在隐式解析时已知
  export async function resolveActor(deps: CommandDeps, as?: string): Promise<Actor | null>
  export async function requireActor(deps: CommandDeps, as?: string): Promise<Actor>      // actor_required
  export async function resolveHandle(deps: CommandDeps, actor: Actor): Promise<string>   // 显式 → locatePost；隐式 → actor.handle；post_offline
  export function isOwnTerminal(deps: CommandDeps, handle: string): boolean               // === env.ORCA_TERMINAL_HANDLE
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
test('a terminal whose title is not a registered post resolves to nobody → actor_required', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-x' } })
  o.terminals.push({ handle: 'term-x', title: 'zsh', connected: true, worktreeId: 'w' })
  expect(await resolveActor(deps)).toBeNull()
  await expect(requireActor(deps)).rejects.toMatchObject({ code: 'actor_required' })
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
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现**（按签名；隐式分支调用 `deps.orca.terminalList()`，按 `handle` 找终端，`deps.registry.getPost(title)` 存在才算）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): actor and handle resolution for task commands"`

---

### Task 7：gate 命令执行——`runGate`

**Files:**
- Create：`packages/core/src/commands/task/gate-exec.ts`、`packages/core/test/commands/task/gate-exec.test.ts`

**Interfaces:**
- Produces：`export interface GateExecResult { passed: boolean; output: string }`；`export function runGate(command: string | null, cwd: string): Promise<GateExecResult>`；`export const GATE_OUTPUT_LIMIT = 4000`

- [ ] **Step 1：写失败测试**

```ts
test('null command passes without spawning', async () => {
  expect(await runGate(null, process.cwd())).toEqual({ passed: true, output: '' })
})
test('exit code decides pass/fail; stdout is captured', async () => {
  expect((await runGate('node -e "process.exit(0)"', process.cwd())).passed).toBe(true)
  const r = await runGate('node -e "console.log(\'hi\'); process.exit(1)"', process.cwd())
  expect(r).toMatchObject({ passed: false, output: expect.stringContaining('hi') })
})
test('quotes, &&, and 中文 survive the shell round trip', async () => {
  const r = await runGate('node -e "console.log(\'a \\"b\\" 中文\')" && node -e "process.exit(0)"', process.cwd())
  expect(r).toMatchObject({ passed: true, output: expect.stringContaining('a "b" 中文') })
})
test('output is truncated to GATE_OUTPUT_LIMIT', async () => {
  expect((await runGate('node -e "process.stdout.write(\'x\'.repeat(6000))"', process.cwd())).output.length).toBeLessThanOrEqual(GATE_OUTPUT_LIMIT)
})
test('runs in the given cwd', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gate-'))
  expect((await runGate('node -e "process.stdout.write(process.cwd())"', dir)).output).toContain(fs.realpathSync(dir))
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `spawn(command, { shell: true, cwd })`（全项目唯一 `shell: true`，注释写明 spec 第 3 节约束 6）；合并 stdout+stderr，截断到 `GATE_OUTPUT_LIMIT`（与 `wl send` 消息上限同值：都是"一段文本能装多少"）；`exitCode === 0` 为通过。环境变量继承 `process.env`（Task 10 的测试靠它把计数文件路径传给 gate 命令）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): run gate commands via shell (the one documented exception)"`

---

### Task 8：查询、派发、`create`、`plan`

**Files:**
- Create：`packages/core/src/commands/task/query.ts`、`dispatch.ts`、`create.ts`、`plan.ts`
- Create：`packages/core/test/commands/task/query.test.ts`、`dispatch.test.ts`、`create.test.ts`

**Interfaces:**
- Consumes：Task 2–6
- Produces：
  ```ts
  // query.ts
  export interface TaskRow {
    id: string; status: OrchestrationTaskStatus; title: string; tags: string[]; kind: TaskKind
    plan: string | null; claimedBy: string | null; assigneeHandle: string | null; dispatchId: string | null
    epoch: number; gateFailures: number; result: string | null
  }
  export function mustTeamReady(deps: CommandDeps, name: string): TeamRow                 // team_unknown / run_not_ready
  export async function fetchTasks(deps: CommandDeps, team: string): Promise<TaskRow[]>   // taskList ⋈ task_ext（无 ext 行时 tags [], kind 'work', 其余 null/0）
  export async function findTask(deps: CommandDeps, team: string, id: string): Promise<TaskRow>                       // task_not_found
  export async function findTaskAnywhere(deps: CommandDeps, id: string): Promise<{ team: TeamRow; task: TaskRow }>  // task_ext.team 优先，否则遍历有 Run 的团队
  export async function listTasks(deps: CommandDeps, a: { team?: string; mine?: boolean; status?: string; tags?: string[]; as?: string }): Promise<TaskRow[]>
  export async function showTask(deps: CommandDeps, a: { id: string; team?: string }): Promise<TaskRow>
  // dispatch.ts
  export const INJECT_IDLE_WAIT_MS = 15_000
  export type Delivery = 'injected' | 'not_notified' | 'self'
  export async function dispatchTo(deps: CommandDeps, team: string, taskId: string, target: { address: string; handle: string }): Promise<{ delivery: Delivery; dispatchId: string }>
  // create.ts
  export async function createTask(deps: CommandDeps, a: { team: string; title: string; post?: string; tags?: string[]; parent?: string; as?: string; retryRequest?: string }): Promise<{ id: string; delivery?: Delivery }>
  // plan.ts
  export async function planTask(deps: CommandDeps, a: { id: string; text: string }): Promise<void>
  ```

- [ ] **Step 1：写失败测试**

```ts
// query.test.ts
const task = (over: Partial<OrchestrationTask>): OrchestrationTask => ({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null, ...over })
test('mustTeamReady: team_unknown / run_not_ready', () => {
  const { deps, registry } = mkDeps(new FakeOrca())
  expect(() => mustTeamReady(deps, 'ghost')).toThrow(expect.objectContaining({ code: 'team_unknown' }))
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  expect(() => mustTeamReady(deps, 'duo')).toThrow(expect.objectContaining({ code: 'run_not_ready' }))
})
test('fetchTasks merges Orca rows with task_ext', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({}))
  registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: ['backend'], kind: 'work', claimedBy: 'builder@duo' })
  expect(await fetchTasks(deps, 'duo')).toEqual([{ id: 't1', status: 'ready', title: 'a', tags: ['backend'], kind: 'work', plan: null, claimedBy: 'builder@duo', assigneeHandle: null, dispatchId: null, epoch: 0, gateFailures: 0, result: null }])
})
test('list --mine filters by claimed_by (stable across terminal restarts), --tags is strict intersection, --status accepts blocked', async () => {
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

// dispatch.test.ts —— 派给别人：等空闲后注入；不空闲：不注入，标记 not_notified；派给自己：不等、不注入
const readyTask = async (o: FakeOrca, deps: CommandDeps) => {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  return id
}
test('to another post: waits for tui-idle then dispatches with --inject', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await readyTask(o, deps)
  expect(await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })).toEqual({ delivery: 'injected', dispatchId: 'ctx-1' })
  expect(o.calls.filter((c) => c === 'terminalWait')).toHaveLength(1)
  expect(o.callsOf('dispatch')).toEqual([{ task: id, to: 'term-c', from: 'coord-1', inject: true, retryRequest: expect.any(String) }])
})
test('to another post that is busy: dispatched without --inject, delivery not_notified', async () => {
  const o = new FakeOrca(); o.waitSatisfied = false; const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  expect((await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })).delivery).toBe('not_notified')
  expect(o.callsOf('dispatch')[0]).toMatchObject({ inject: false })
})
test('to the caller\'s own terminal: no wait, no inject', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o, { env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await readyTask(o, deps)
  expect((await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })).delivery).toBe('self')
  expect(o.calls).not.toContain('terminalWait')
  expect(o.callsOf('dispatch')[0]).toMatchObject({ inject: false })
})
test('already dispatched to the same target: no second dispatch', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })
  expect(o.callsOf('dispatch')).toHaveLength(1)
})
test('task returned to ready after its terminal closed: next dispatch bumps epoch and uses a new ledger key', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await readyTask(o, deps)
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c' })
  await o.terminalClose({ handle: 'term-c' })                  // Orca 把任务放回 ready
  o.terminals.push({ handle: 'term-c2', title: 'checker@duo', connected: true, worktreeId: 'w' })
  await dispatchTo(deps, 'duo', id, { address: 'checker@duo', handle: 'term-c2' })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect(registry.getRequest(`dispatch:${id}:1`)!.state).toBe('done')
  expect(o.tasks.find((t) => t.id === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c2' })
})

// create.test.ts
test('create without --post: task-create via P2, ready, task_ext kind work, spec prefixed by actor or human', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: '顺手记下', tags: ['bug'] })
  expect(o.callsOf('taskCreate')[0]).toEqual({ spec: 'human: 顺手记下', taskTitle: '顺手记下', run: 'run-1', from: 'coord-1', retryRequest: expect.any(String) })
  expect(o.callsOf('dispatch')).toEqual([])
  expect(registry.getTaskExt(r.id)).toMatchObject({ tags: ['bug'], kind: 'work', claimedBy: null })
  await createTask(deps, { team: 'duo', title: 't', as: 'builder@duo' })
  expect(o.callsOf('taskCreate')[1]!.spec).toBe('builder@duo: t')
})
test('create --post: claimed_by = post, dispatched through dispatchTo with --inject', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const r = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })
  expect(registry.getTaskExt(r.id)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')[0]).toMatchObject({ task: r.id, to: 'term-c', from: 'coord-1', inject: true })
  expect(r.delivery).toBe('injected')
})
test('create --post: dispatch timed out → hint carries --retry-request; rerun with it does not create a second task', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.faults.push({ method: 'dispatch', when: 'before', error: new WinglineError('uncertain', 'orca_timeout', 't') })
  const err = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' }).catch((e) => e)
  const id = o.callsOf('taskCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${id}`) })
  await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo', retryRequest: id })
  expect(o.tasks).toHaveLength(1)
  expect(o.tasks[0]).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
})
test('create --post on an offline post fails before task-create', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_offline' })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('planTask writes the plan under the team lock; terminal tasks are rejected', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push(task({ id: 'p1' }), task({ id: 'p2', status: 'completed' }))
  registry.insertTaskExt({ taskId: 'p1', team: 'duo', tags: [], kind: 'work' }); registry.insertTaskExt({ taskId: 'p2', team: 'duo', tags: [], kind: 'work' })
  await planTask(deps, { id: 'p1', text: '先读代码' })
  expect(registry.getTaskExt('p1')!.plan).toBe('先读代码')
  await expect(planTask(deps, { id: 'p2', text: 'x' })).rejects.toMatchObject({ code: 'task_terminal' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `query.ts` 按签名；`listTasks` 的 `mine` 用 `requireActor(deps, a.as)` 的地址比 `claimedBy`。
  - `dispatch.ts` 的 `dispatchTo`（spec 第 9.3 节）：读 `task_ext`；`taskList` 取当前任务；键 `dispatch:<id>:<epoch>` 已 `done` 且任务 `ready` → `bumpEpoch(id, getVerdict(id, epoch)?.verdict === 'escalate')`，换键；任务 `dispatched` 且 `assigneeHandle === target.handle` 且键已 `done` → 返回存下的结果；任务既不是 `ready` 又没有未完成的账本行 → `task_not_open`；无账本行时才决定注入（`isOwnTerminal` → 不等不注；否则 `terminalWait({ handle, forState: 'tui-idle', timeoutMs: INJECT_IDLE_WAIT_MS })` 的 `satisfied`）；`ledgered(deps, { key, team, build: (t) => ({ task: id, to: target.handle, from: t.coordinatorHandle!, inject }), call: (a) => orca.dispatch(a) })`；若 `replayed`，再 `taskList` 确认任务 `dispatched` 给了目标，否则 `bumpEpoch` 后重走一次（最多一次）。返回 `{ delivery: self ? 'self' : injected ? 'injected' : 'not_notified', dispatchId }`。拆成 `currentEpochKey`、`decideInject`、`confirmDispatched` 三个小函数保持 ≤50 行。
  - `create.ts`：`mustTeamReady`；给了 `post` 先 `locatePost`（无 → `post_offline`，在任何 Orca 写调用之前）；`actor = await resolveActor(deps, a.as)`；`oneShot(deps, { team, retryRequest: a.retryRequest, retryHint: (id) => \`${重建出的同一条 wl task create 命令} --retry-request ${id}\`, build: (t) => ({ spec: \`${actor?.address ?? 'human'}: ${a.title}\`, taskTitle: a.title, run: t.runId!, from: t.coordinatorHandle!, ...(a.parent ? { parent: a.parent } : {}) }), call: (x) => orca.taskCreate(x) })`；`insertTaskExt({ taskId, team, tags, kind: 'work', claimedBy: a.post ?? null })`；给了 `post` → `dispatchTo(...)`。P2 的 id 在 `create.ts` 里先生成（`a.retryRequest ?? randomUUID()`）再传给 `oneShot`，所以 `dispatchTo` 抛出的 `uncertain` 错误可以在这里**改写 hint**，换成同一条 `wl task create … --retry-request <这个 id>`（复审 W4：派发超时后重跑整条命令必须带同一个 id 才不会建出第二个任务）。
  - `plan.ts`：`findTaskAnywhere` → `registry.withTeamLock(team, …)` 内检查状态并 `setTaskPlan`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): task queries, dispatchTo, wl task create and plan"`

---

### Task 9：`wl task claim` / `start`

**Files:**
- Create：`packages/core/src/commands/task/claim.ts`、`start.ts`、`packages/core/test/commands/task/claim-start.test.ts`
- Modify：`packages/core/test/spec/helpers.ts`（加 `SELF_CLAIM_YAML`：builder `self_claim: true`、`tags: [backend]`、`plan_first: true`）

**Interfaces:**
- Produces：`claimTask(deps, a: { id: string; as?: string }): Promise<void>`；`startTask(deps, a: { id: string; as?: string }): Promise<{ delivery: Delivery }>`。团队取自调用方地址的 `@` 后半段。

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
test('claim: tags must intersect; empty task tags match anyone with self_claim', async () => {
  const { deps, registry, add } = seed()
  await expect(claimTask(deps, { id: await add(['frontend']), as: 'builder@duo' })).rejects.toMatchObject({ code: 'tags_mismatch' })
  const id = await add([])
  await claimTask(deps, { id, as: 'builder@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('builder@duo')
})
test('claim: an already-claimed or non-ready task → task_not_open', async () => {
  const { o, deps, add } = seed()
  await expect(claimTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
  const id = await add(); await o.gateCreate({ task: id, question: 'q', from: 'coord-1' })   // → blocked
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'task_not_open' })
})
test('claim while another holder has the team lock → team_busy immediately (fail-fast, no queueing)', async () => {
  const { deps, registry, add } = seed(); const id = await add()
  let release!: () => void
  const held = registry.withTeamLock('duo', () => new Promise<void>((res) => { release = res }))
  await expect(claimTask(deps, { id, as: 'builder@duo' })).rejects.toMatchObject({ code: 'team_busy' })
  release(); await held
  await claimTask(deps, { id, as: 'builder@duo' })            // 锁释放后同一条命令即可成功
})
test('start: not claimed by you / plan required', async () => {
  const { deps, add } = seed()
  await expect(startTask(deps, { id: await add([], 'checker@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'not_claimed_by_you' })
  await expect(startTask(deps, { id: await add([], 'builder@duo'), as: 'builder@duo' })).rejects.toMatchObject({ code: 'plan_required' })
})
test('start: WIP exactly at the limit is rejected; one below is allowed', async () => {
  const { deps, registry, add } = seed()
  const ids = [await add([], 'builder@duo'), await add([], 'builder@duo'), await add([], 'builder@duo'), await add([], 'builder@duo')]
  for (const id of ids) registry.setTaskPlan(id, 'p')
  for (const id of ids.slice(0, 2)) await startTask(deps, { id, as: 'builder@duo' })
  await startTask(deps, { id: ids[2]!, as: 'builder@duo' })            // 第 3 个：此前 2 个在办，< 3，允许
  await expect(startTask(deps, { id: ids[3]!, as: 'builder@duo' })).rejects.toMatchObject({ code: 'wip_budget_exceeded' })
})
test('start by the post itself (implicit): dispatched to its own terminal, no inject', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  const id = await add([], 'builder@duo'); registry.setTaskPlan(id, 'p')
  expect(await startTask(deps, { id })).toEqual({ delivery: 'self' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b', inject: false })
})
test('start --as builder from the lead\'s (checker\'s) terminal: dispatched to builder, injected', async () => {
  const { o, deps, registry, add } = seed({ env: { ORCA_TERMINAL_HANDLE: 'term-c' } })
  const id = await add([], 'builder@duo'); registry.setTaskPlan(id, 'p')
  expect(await startTask(deps, { id, as: 'builder@duo' })).toEqual({ delivery: 'injected' })
  expect(o.callsOf('dispatch')[0]).toMatchObject({ to: 'term-b', inject: true })
})
test('start rerun after success is a no-op', async () => {
  const { o, deps, registry, add } = seed()
  const id = await add([], 'builder@duo'); registry.setTaskPlan(id, 'p')
  await startTask(deps, { id, as: 'builder@duo' }); await startTask(deps, { id, as: 'builder@duo' })
  expect(o.callsOf('dispatch')).toHaveLength(1)
})
```

> `withTeamLock` 只看持锁 pid 是否存活，同一进程内第二次获取同样 `team_busy`——阶段 1 `up.test.ts` 的 `'concurrent up on the same team → team_busy'` 就是这么测的，这里沿用。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `claim.ts`：`requireActor` → 团队 → `loadTeamSpec(mustTeamReady(...).specPath)` 找岗位（无 → `post_unknown`）→ `!selfClaim` → `self_claim_disabled` → `withTeamLock(team, async () => { findTask；status !== 'ready' || claimedBy → task_not_open；tags 不相交 → tags_mismatch；setTaskClaimedBy })`。`start.ts`：解析同上；`ext.claimedBy !== actor.address` → `not_claimed_by_you`；`planFirst && !ext.plan` → `plan_required`；`handle = await resolveHandle(deps, actor)`；`findTask`：`dispatched` 且 assignee 是 `handle` → 直接返回（不检查 WIP、不调 Orca——`dispatchTo` 也会处理，这里提前返回只为不误算 WIP）；`blocked`/终态 → `task_not_open`；`fetchTasks` 数 `claimedBy === actor && status === 'dispatched'` ≥ 上限 → `wip_budget_exceeded`；`dispatchTo(deps, team, id, { address: actor.address, handle })`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task claim and start"`

---

### Task 10：`wl task done`

**Files:**
- Create：`packages/core/src/commands/task/done.ts`、`packages/core/test/commands/task/done.test.ts`

**Interfaces:**
- Consumes：Task 2/4/6/7/8
- Produces：
  ```ts
  export type DoneOutcome = 'done' | 'gate_failed' | 'escalated'
  export type LinkDelivery = Delivery | 'skipped_frozen' | 'skipped_offline'
  export interface DoneResult {
    outcome: DoneOutcome
    linkedTasks?: Array<{ target: string; taskId: string; delivery: LinkDelivery }>
    gateId?: string
    replayed?: boolean
  }
  export async function doneTask(deps: CommandDeps, a: { id: string; cwd?: string; as?: string }): Promise<DoneResult>
  ```
  `skipped_frozen` 在本计划里不会产生（冻结是 2B 的），类型先留出来，2B 计划 Task 3 只加判断、不改类型。

- [ ] **Step 1：写失败测试**

```ts
// gate 命令通过环境变量拿计数文件和退出码，避免在命令字符串里嵌 Windows 路径；每跑一次往文件追加一个字符
const GATE = 'node -e "require(\'fs\').appendFileSync(process.env.WL_GATE_LOG,\'x\');process.exit(+process.env.WL_GATE_EXIT)"'
const yaml = (links = '') => DUO_YAML + `gates:\n  builder: '${GATE.replace(/'/g, "''")}'\n` + links
let gateLog: string
const gateRuns = () => (fs.existsSync(gateLog) ? fs.readFileSync(gateLog, 'utf8').length : 0)
beforeEach(() => {
  gateLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-gl-')), 'log')
  process.env.WL_GATE_LOG = gateLog; process.env.WL_GATE_EXIT = '0'
})
/** builder 名下一个已派发的任务（term-b），返回 { o, deps, registry, id }。 */
async function dispatched(links = '', env: NodeJS.ProcessEnv = { ORCA_TERMINAL_HANDLE: 'term-b' }) {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: yaml(links), env })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  o.orch.length = 0; o.calls.length = 0
  return { o, ...s, id }
}
const timeout = () => new WinglineError('uncertain', 'orca_timeout', 't')
const REVIEW = 'links:\n  builder:\n    reviewed_by: [checker]\n'

test('not your task → not_your_task', async () => {
  const { deps, id } = await dispatched()
  await expect(doneTask(deps, { id, as: 'checker@duo' })).rejects.toMatchObject({ code: 'not_your_task' })
})
test('gate passes, no links: one worker_done(succeeded) from the post\'s own handle', async () => {
  const { o, deps, id } = await dispatched()
  expect(await doneTask(deps, { id })).toEqual({ outcome: 'done', linkedTasks: [] })
  expect(o.callsOf('workerDone')).toEqual([{ taskId: id, dispatchId: 'ctx-1', outcome: 'succeeded', subject: 'gate passed', run: 'run-1', from: 'term-b', retryRequest: expect.any(String) }])
})
test('--as builder from checker\'s terminal reports with builder\'s handle (locatePost), not the caller\'s', async () => {
  const { o, deps, id } = await dispatched('', { ORCA_TERMINAL_HANDLE: 'term-c' })
  await doneTask(deps, { id, as: 'builder@duo' })
  expect(o.callsOf('workerDone')[0]).toMatchObject({ from: 'term-b' })
})
test('reviewed_by with two targets: report first, then one child per target with distinct ids, each dispatched to its own handle', async () => {
  const yaml3 = DUO_YAML + '  - id: auditor\n    agent: claude\n    worktree: current\n'
  const o = new FakeOrca(); const s = seedRunningTeam(o, { yaml: yaml3 + `gates:\n  builder: '${GATE.replace(/'/g, "''")}'\nlinks:\n  builder:\n    reviewed_by: [checker, auditor]\n`, env: { ORCA_TERMINAL_HANDLE: 'term-b' } })
  s.registry.upsertPost({ address: 'auditor@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-a', status: 'live', isLead: false })
  o.terminals.push({ handle: 'term-a', title: 'auditor@duo', connected: true, worktreeId: 'w' })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: '实现登录', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' }); o.calls.length = 0; o.orch.length = 0
  const r = await doneTask(s.deps, { id })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('taskCreate'))
  const creates = o.callsOf('taskCreate')
  expect(creates).toHaveLength(2)
  expect(creates[0]!.retryRequest).not.toBe(creates[1]!.retryRequest)
  expect(o.callsOf('dispatch').map((d) => d.to)).toEqual(['term-c', 'term-a'])
  expect(r.linkedTasks!.map((l) => [l.target, l.delivery])).toEqual([['checker@duo', 'injected'], ['auditor@duo', 'injected']])
  for (const l of r.linkedTasks!) expect(s.registry.getTaskExt(l.taskId)).toMatchObject({ kind: 'review', claimedBy: l.target })
})
test('a review task\'s done does not trigger links (mutual review stays finite)', async () => {
  const links = 'links:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n'
  const { o, deps, registry } = await dispatched(links)
  const { id: rev } = await o.taskCreate({ spec: 's', taskTitle: '评审：x', run: 'run-1', from: 'coord-1' })
  registry.insertTaskExt({ taskId: rev, team: 'duo', tags: [], kind: 'review', claimedBy: 'checker@duo' })
  await o.dispatch({ task: rev, to: 'term-c', from: 'coord-1' }); o.orch.length = 0
  expect(await doneTask(deps, { id: rev, as: 'checker@duo' })).toEqual({ outcome: 'done', linkedTasks: [] })
  expect(o.callsOf('taskCreate')).toEqual([])
})
test('link target offline: child created and claimed by the target, not dispatched (skipped_offline), done still succeeds', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'skipped_offline' }])
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')).toEqual([])
})
test('gate fails under budget: gate_failed, no Orca call, count +1', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  expect(await doneTask(deps, { id })).toEqual({ outcome: 'gate_failed' })
  expect(o.orch).toEqual([])
  expect(registry.getTaskExt(id)!.gateFailures).toBe(1)
})
test('gate fails exactly at the budget: worker_done(failed) BEFORE gate-create; task ends blocked; gate recorded', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures(id); registry.incrementGateFailures(id)
  const r = await doneTask(deps, { id })
  expect(r).toEqual({ outcome: 'escalated', gateId: 'gate-1' })
  expect(o.calls.indexOf('workerDone')).toBeLessThan(o.calls.indexOf('gateCreate'))
  expect(o.callsOf('workerDone')[0]).toMatchObject({ outcome: 'failed', subject: 'gate failed' })
  expect(o.callsOf('gateCreate')[0]).toMatchObject({ task: id, question: expect.stringContaining('连续 3 次') })
  expect(o.tasks.find((t) => t.id === id)!.status).toBe('blocked')
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
})

// —— 重跑安全（复审 M1：这些是可执行的测试，不是注释） ——
test('report landed but timed out: rerun replays the report, does not re-run the gate, then creates the review child', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'workerDone', when: 'after', error: timeout() })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  expect(o.callsOf('taskCreate')).toEqual([])                 // 先上报：上报没确认就不建子任务
  const r = await doneTask(deps, { id })
  expect(r.outcome).toBe('done')
  expect(gateRuns()).toBe(1)
  const reports = o.callsOf('workerDone')
  expect(reports).toHaveLength(2); expect(reports[1]!.retryRequest).toBe(reports[0]!.retryRequest)
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
})
test('child created, its dispatch timed out: rerun does not create a second child and finishes the dispatch', async () => {
  const { o, deps, id } = await dispatched(REVIEW)
  o.faults.push({ method: 'dispatch', when: 'before', error: timeout() })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  const r = await doneTask(deps, { id })
  expect(o.tasks.filter((t) => t.parentId === id)).toHaveLength(1)
  expect(o.tasks.find((t) => t.parentId === id)).toMatchObject({ status: 'dispatched', assigneeHandle: 'term-c' })
  expect(r.linkedTasks).toHaveLength(1)
})
test('escalate interrupted before gate-create: rerun keeps the verdict, the count and the question text', async () => {
  process.env.WL_GATE_EXIT = '1'
  const { o, deps, registry, id } = await dispatched()
  registry.incrementGateFailures(id); registry.incrementGateFailures(id)
  o.faults.push({ method: 'gateCreate', when: 'before', error: timeout() })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  process.env.WL_GATE_EXIT = '0'                              // 即使 gate 这次会通过，也不该重跑它
  expect(await doneTask(deps, { id })).toEqual({ outcome: 'escalated', gateId: 'gate-1' })
  expect(gateRuns()).toBe(1)
  expect(registry.getTaskExt(id)!.gateFailures).toBe(3)
  const qs = o.callsOf('gateCreate').map((g) => g.question)
  expect(new Set(qs).size).toBe(1)
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
  o.faults.push({ method: 'taskCreate', when: 'before', error: timeout() })
  await expect(doneTask(deps, { id })).rejects.toMatchObject({ kind: 'uncertain' })
  await o.runUse({ id: 'run-1', from: 'coord-2' })
  expect((await doneTask(deps, { id })).outcome).toBe('done')
  expect(o.callsOf('taskCreate').at(-1)).toMatchObject({ from: 'coord-2' })
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('coord-2')
})
test('when multilineSafe is false, a multi-line gate output goes to a file and --body is one line', async () => {
  const o = new FakeOrca()
  const s = seedRunningTeam(o, { multilineSafe: false, env: { ORCA_TERMINAL_HANDLE: 'term-b' },
    yaml: DUO_YAML + 'gates:\n  builder: \'node -e "console.log(1);console.log(2)"\'\n' })
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  s.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' })
  await doneTask(s.deps, { id })
  const body = o.callsOf('workerDone')[0]!.body as string
  expect(body).not.toMatch(/[\r\n]/)
  const file = body.replace(/^gate 输出见 /, '')
  expect(file).toBe(path.join(s.deps.home, 'logs', 'duo', `gate-${id}-0.txt`))
  expect(fs.readFileSync(file, 'utf8')).toMatch(/1\r?\n2/)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现**（spec 第 10 节 `done` 的 5 步；`done.ts` 拆成 `decide`、`report`、`linkAll`、`linkOne`、`escalateGate`、`toBody` 六个函数，各自 ≤50 行）。
  - 入口：`requireActor` → 团队 → `ext = getTaskExt(id)`（无 → `task_not_found`）→ `ext.claimedBy !== actor.address` → `not_your_task` → `v = getVerdict(id, ext.epoch)`：`v?.finishedAt` → `{ ...JSON.parse(v.result!), replayed: true }`；`!v` → `decide()`（可能直接返回 `gate_failed`）。
  - `decide()`：`findTask` 必须 `dispatched`（`ready` 时错误 hint 写"上一轮派发已结束，先 `wl task start <id>`"）；`handle = await resolveHandle(actor)`；`task.assigneeHandle !== handle` → `not_dispatched_to_you`；`gate = await runGate(post.gate, a.cwd ?? process.cwd())`；不通过且 `ext.gateFailures + 1 < max` → `incrementGateFailures`，返回 `gate_failed`；否则 `recordVerdict({ taskId, epoch: ext.epoch, post: actor.address, verdict, gateFailures: 不通过 ? ext.gateFailures + 1 : ext.gateFailures, dispatchId: task.dispatchId!, reportFrom: handle, body: toBody(...) })`。
  - `report(v)`：`ledgered(key \`done:${id}:${epoch}:report\`, build: () => ({ taskId: id, dispatchId: v.dispatchId, outcome: v.verdict === 'passed' ? 'succeeded' : 'failed', subject: v.verdict === 'passed' ? 'gate passed' : 'gate failed', ...(v.body ? { body: v.body } : {}), run: team.runId!, from: v.reportFrom }), call: workerDone)`。
  - `passed` → `report` → `ext.kind === 'work'` 时 `linkAll`：对 `post.reviewedBy`（`kind: 'review'`，前缀"评审"）或 `post.handsTo`（`kind: 'work'`，前缀"交接"）的每个目标 `linkOne`：`ledgered(key \`done:${id}:${epoch}:link:${target}\`, build: (t) => ({ spec: \`${label}（${target}）：${id}\`, taskTitle: \`${label}：${task.title}\`, run: t.runId!, from: t.coordinatorHandle!, parent: id }), call: taskCreate)` → `insertTaskExt({ taskId: child, team, tags: [], kind, claimedBy: target })` → `locatePost(target)` 为空 → `skipped_offline`；否则 `dispatchTo(deps, team, child, { address: target, handle })`。任务标题在重跑时从 `findTask` 再取（终态任务仍在 `task-list` 里）。
  - `escalate` → `report` → `escalateGate`：`ledgered(key \`done:${id}:${epoch}:gate\`, build: (t) => ({ task: id, question: \`连续 ${v.gateFailures} 次 gate 失败。resolve 后任务回到 ready：原岗位 wl task start 即重试；改派用 wl task resolve <gate> --reassign <地址>；不想继续就不要 resolve\`, from: t.coordinatorHandle! }), call: gateCreate)` → `recordGate(gateId, team, id)`。
  - 最后 `finishVerdict(id, epoch, result)` 并返回 `result`。
  - `toBody(output)`：空 → `null`；`multilineSafe` 或无换行 → 截断到 `GATE_OUTPUT_LIMIT`；否则写 `path.join(home, 'logs', team, \`gate-${id}-${epoch}.txt\`)`（`mkdirSync recursive`），写之前删除同目录下修改时间早于 7 天的 `gate-*.txt`，返回 `gate 输出见 <路径>`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task done with persisted verdicts and rerun-safe follow-ups"`

---

### Task 11：`wl task escalate` / `resolve`

**Files:**
- Create：`packages/core/src/commands/task/escalate.ts`、`packages/core/test/commands/task/escalate.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export async function escalateTask(deps: CommandDeps, a: { id: string; reason: string; retryRequest?: string }): Promise<{ gateId: string; status: OrchestrationTaskStatus }>
  export async function resolveGate(deps: CommandDeps, a: { gateId: string; resolution: string; reassign?: string }): Promise<{ taskId: string; status: OrchestrationTaskStatus; claimedBy: string | null }>
  ```
  两者不接 `--as`（spec 第 10 节：不校验身份）。

- [ ] **Step 1：写失败测试**

```ts
async function dispatchedTask(o: FakeOrca, deps: CommandDeps) {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'builder@duo' })
  await o.dispatch({ task: id, to: 'term-b', from: 'coord-1' }); o.orch.length = 0
  return id
}
test('escalate takes a dispatched task back (blocked) and records the gate', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  expect(await escalateTask(deps, { id, reason: '卡住了' })).toEqual({ gateId: 'gate-1', status: 'blocked' })
  expect(o.callsOf('gateCreate')).toEqual([{ task: id, question: '卡住了', from: 'coord-1', retryRequest: expect.any(String) }])
  expect(registry.getGate('gate-1')).toEqual({ team: 'duo', taskId: id })
})
test('escalate timed out: hint carries --retry-request; rerunning with it creates no second gate', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  o.faults.push({ method: 'gateCreate', when: 'after', error: new WinglineError('uncertain', 'orca_timeout', 't') })
  const err = await escalateTask(deps, { id, reason: 'x' }).catch((e) => e)
  const rid = o.callsOf('gateCreate')[0]!.retryRequest as string
  expect(err).toMatchObject({ kind: 'uncertain', hint: expect.stringContaining(`--retry-request ${rid}`) })
  await escalateTask(deps, { id, reason: 'x', retryRequest: rid })
  expect(o.gates.size).toBe(1)
})
test('escalate on an unknown task → task_not_found', async () => {
  await expect(escalateTask(mkDeps(new FakeOrca()).deps, { id: 'ghost', reason: 'x' })).rejects.toMatchObject({ code: 'task_not_found' })
})
test('resolve: Orca puts the task back to ready; owner unchanged; a bare rerun does not call Orca again', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  expect(await resolveGate(deps, { gateId, resolution: 'retry' })).toEqual({ taskId: id, status: 'ready', claimedBy: 'builder@duo' })
  expect(o.callsOf('gateResolve')).toEqual([{ id: gateId, resolution: 'retry', from: 'coord-1', retryRequest: expect.any(String) }])
  await resolveGate(deps, { gateId, resolution: 'retry' })
  expect(o.callsOf('gateResolve')).toHaveLength(1)
})
test('resolve --reassign changes the owner locally', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const id = await dispatchedTask(o, deps)
  const { gateId } = await escalateTask(deps, { id, reason: 'x' })
  await resolveGate(deps, { gateId, resolution: 'reassign', reassign: 'checker@duo' })
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
})
test('resolve on an unrecorded gate → gate_unknown', async () => {
  await expect(resolveGate(mkDeps(new FakeOrca()).deps, { gateId: 'ghost', resolution: 'x' })).rejects.toMatchObject({ code: 'gate_unknown' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `escalateTask`：`findTaskAnywhere` → `oneShot(gateCreate, retryHint: (rid) => \`wl task escalate ${id} --reason <同一个理由> --retry-request ${rid}\`)` → `recordGate` → `taskList` 读回任务当前状态（不用回执）返回。`resolveGate`：`getGate`（无 → `gate_unknown`）→ `ledgered(key \`resolve:${gateId}\`, build: (t) => ({ id: gateId, resolution, from: t.coordinatorHandle! }), call: gateResolve)` → `reassign` 时 `setTaskClaimedBy` → `taskList` 读回状态返回。`resolveGate` 不碰 `epoch`/`gate_failures`：下次派发时 `dispatchTo` 按 spec 9.3 处理（这样在 Orca 界面里直接 resolve 也走同一条路）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl task escalate and resolve"`

---

### Task 12：CLI 接入——`wl task <sub>`

**Files:**
- Modify：`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`、`packages/core/src/index.ts`、`packages/cli/test/main.test.ts`

命令面（spec 第 10 节）：

```
wl task create <team> --title <t> [--post <addr>] [--tags <a,b>] [--parent <id>] [--as <addr>] [--retry-request <id>] [--json]
wl task list [team] [--mine] [--status <s>] [--tags <a,b>] [--as <addr>] [--json]
wl task show <id> [--team <team>] [--json]
wl task claim <id> [--as <addr>] [--json]
wl task start <id> [--as <addr>] [--json]
wl task plan <id> <text> [--json]
wl task done <id> [--as <addr>] [--json]
wl task escalate <id> --reason <text> [--retry-request <id>] [--json]
wl task resolve <gateId> --resolution <text> [--reassign <addr>] [--json]
```

`done` 的退出码：`done` → 0（含 `replayed`），`gate_failed`/`escalated` → 1；`WinglineError` 按 `exitCodeOf`（`uncertain` → 3）。`start`/`create` 返回 `delivery: 'not_notified'` 时人读输出加一句"<地址> 正忙，任务已派发但未注入：可以 `wl send <地址> \"你有新任务 <id>，见 wl task show <id>\"`"；`done` 的 `linkedTasks` 同理逐项说明（含 `skipped_offline`）；`escalate` 输出注明"任务已从岗位手里收回，resolve 后回到 ready"。

- [ ] **Step 1：写失败测试**

```ts
test('wl task create --json prints the created id', async () => {
  const c = fakeCommands({ createTask: async () => ({ id: 'task-1' }) })
  const r = await runWith(['task', 'create', 'duo', '--title', 't', '--json'], c)
  expect(JSON.parse(r.out).result.id).toBe('task-1')
})
test('wl task create / escalate pass --retry-request through', async () => {
  const seen: unknown[] = []
  const c = fakeCommands({ createTask: async (_d, a) => { seen.push(a); return { id: 't' } }, escalateTask: async (_d, a) => { seen.push(a); return { gateId: 'g', status: 'blocked' } } })
  await runWith(['task', 'create', 'duo', '--title', 't', '--retry-request', 'rid-1'], c)
  await runWith(['task', 'escalate', 't1', '--reason', 'x', '--retry-request', 'rid-2'], c)
  expect(seen).toEqual([expect.objectContaining({ retryRequest: 'rid-1' }), expect.objectContaining({ retryRequest: 'rid-2' })])
})
test('wl task done exit codes follow outcome; an uncertain error exits 3 and prints the hint', async () => {
  for (const [outcome, code] of [['done', 0], ['gate_failed', 1], ['escalated', 1]] as const) {
    expect((await runWith(['task', 'done', 't1'], fakeCommands({ doneTask: async () => ({ outcome }) }))).code).toBe(code)
  }
  const r = await runWith(['task', 'done', 't1'], fakeCommands({ doneTask: async () => { throw new WinglineError('uncertain', 'orca_timeout', 't', { hint: '原样重跑同一条命令即可' }) } }))
  expect(r).toMatchObject({ code: 3, err: expect.stringContaining('原样重跑') })
})
test('wl task list --tags a,b parses into an array', async () => {
  let args: unknown
  await runWith(['task', 'list', 'duo', '--tags', 'a,b'], fakeCommands({ listTasks: async (_d, a) => { args = a; return [] } }))
  expect(args).toMatchObject({ tags: ['a', 'b'] })
})
```

> `fakeCommands(over)`/`runWith(argv, c)` 是对 `main.test.ts` 里已有 `run(argv, h.io, c, makeDeps)` 写法的两行包装（已有的 `Commands` 默认实现全部抛"未注入"），在本任务里加到文件顶部。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `Commands` 接口补 9 个字段，`realCommands` 补导入；逐个注册 `task` 子命令；逗号参数 `.split(',').filter(Boolean)`；`exitCodeOfDone`。`index.ts` 补 `commands/task/` 下 11 个文件的导出（`ledger`、`identity`、`gate-exec`、`query`、`dispatch`、`create`、`plan`、`claim`、`start`、`done`、`escalate`）。
- [ ] **Step 4：运行确认通过** — `pnpm test`；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(cli): wl task command surface"`

---

### Task 13：端到端流程测试

**Files:**
- Create：`packages/core/test/commands/task/flow.test.ts`

- [ ] **Step 1：写失败测试**

```ts
const FLOW_YAML = SELF_CLAIM_YAML + `gates:\n  builder: 'node -e "process.exit(0)"'\nlinks:\n  builder:\n    reviewed_by: [checker]\n  checker:\n    reviewed_by: [builder]\n`

test('up → create → claim → plan → start → done → review child → checker done; mutual review terminates', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  await up(deps, { specPath: mkTeam(FLOW_YAML) })                       // builder=term-1（lead，协调者），checker=term-2
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const asC = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-2' } }
  const { id } = await createTask(deps, { team: 'duo', title: '实现登录', tags: ['backend'] })
  await claimTask(asB, { id }); await planTask(asB, { id, text: '先读代码' })
  expect(await startTask(asB, { id })).toEqual({ delivery: 'self' })
  const r1 = await doneTask(asB, { id })
  expect(r1).toMatchObject({ outcome: 'done', linkedTasks: [{ target: 'checker@duo', delivery: 'injected' }] })
  const reviewId = r1.linkedTasks![0]!.taskId
  expect((await listTasks(asC, { team: 'duo', mine: true })).map((t) => t.id)).toEqual([reviewId])
  expect(await doneTask(asC, { id: reviewId })).toEqual({ outcome: 'done', linkedTasks: [] })
  expect((await fetchTasks(deps, 'duo')).map((t) => t.status)).toEqual(['completed', 'completed'])
})
test('escalate → resolve → owner restarts: new epoch, fresh gate budget, done succeeds', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: mkTeam(SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false')) })
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-1' } }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  const { gateId } = await escalateTask(deps, { id, reason: '先停一下' })
  await resolveGate(deps, { gateId, resolution: 'retry' })
  await startTask(asB, { id })
  expect(registry.getTaskExt(id)!.epoch).toBe(1)
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
test('the post\'s terminal is closed mid-task: Orca reverts it to ready, the owner\'s next start re-dispatches to the new terminal', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o); const specPath = mkTeam(SELF_CLAIM_YAML.replace('plan_first: true', 'plan_first: false'))
  await up(deps, { specPath })
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })
  await o.terminalClose({ handle: 'term-1' })
  await up(deps, { specPath })                                           // 重建 builder → term-3；协调者 reclaimed 到 term-3
  const asB = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-3' } }
  await startTask(asB, { id })
  expect((await doneTask(asB, { id })).outcome).toBe('done')
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：** 本任务不写生产代码；失败则回到对应任务修正。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS。
- [ ] **Step 5：提交** — `git commit -m "test: end-to-end phase 2A task workflow"`

---

## 自检记录

- **spec 覆盖：** 第 2 节（实测语义）→ Task 3 的 argv 与 `FakeOrca` 模型；第 3 节约束 6 → Task 7，约束 8（§2.2 修订）→ Task 2/4 与 `deps.ts` 注释；第 4 节（字段、连接触发、环检测）→ Task 1、Task 10；第 5 节（Run、协调者归属、Run 复用）→ Task 5，`wl task` 被 fence 时刷新 → Task 4；第 6 节（表）→ Task 2；第 7 节（身份）→ Task 6，7.3（注入判断）→ Task 8 `dispatchTo`；第 8 节（状态机、`epoch`）→ Task 8/10/11；第 9 节（账本、键表、派发）→ Task 4/8 与 Global Constraints 的表；第 10 节（命令）→ Task 8–12；第 11 节（错误与 `uncertain`）→ Task 4（hint）、Task 8/11（P2 hint）、Task 12（退出码）；第 12 节（测试要求）→ Task 3 模型、Task 4/10 的重跑测试、Task 13。
- **占位扫描：** 无 TBD；Task 3 的 `fake-client.test.ts` 只列了要钉的五条语义未逐字写出（每条是 spec 第 2 节事实的直接翻译），其余测试均为可执行代码；旧版里注释式的 claim/start/done 用例全部换成了可执行测试。
- **类型一致性：** `TeamRow.coordinatorHandle`、`RequestRow`、`TaskExtRow`（含 `kind`/`epoch`）、`DoneVerdictRow`、`OrchestrationTask`（含 `blocked`）、`Delivery`/`LinkDelivery`、`Actor` 在定义任务与消费任务之间一致（Task 2→4/8/9/10/11，Task 3→全部，Task 6→8/9/10，Task 8→9/10）。`runUse` 只在 Task 3 声明、无 `retryRequest`；2B 计划只消费它。
- **Review Focus：** 6 条各有对应任务的可执行测试（见 Review Focus 的任务标注）。
- **比例：** Task 10 最重（`done` 的判定 + 后续 + 重跑），测试也最多，符合它承载的风险；Task 7 最轻。
- **与 spec 的实现层决定：** `create --post` 的 P2 id 在 `create.ts` 里先生成再传入 `oneShot`，以便派发超时时 hint 里给出同一个 id（Task 8）；`start` 对"已派给自己"提前返回，避免把自己算进 WIP（Task 9）；`gateCreate` 不传 `--options`（Task 3）。
