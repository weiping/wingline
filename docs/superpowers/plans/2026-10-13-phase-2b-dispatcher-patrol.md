# 雁阵阶段 2B（调度员与巡查熔断）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 在阶段 2A 的 `wl task`/Orca Run 之上，实现可选的 `wl dispatcher up/down/run/freeze/unfreeze` 命令族：一个持有协调者身份的后台终端，循环 ack 收件箱、把 `question`/`escalation` 转述给牵头岗、巡查"卡住了"的岗位并三级升级（提示/通知牵头岗/冻结），永不杀进程。

**Architecture：** 调度员不是新状态机——任务状态仍是 Orca 原生状态，协调者归属以 2A spec 第 5.2 节为唯一规则。雁阵只加两张本地表（`patrol_state`/`frozen_posts`）和一批小函数（信号判定、升级推进、收件箱转述、主循环），全部通过 `CommandDeps` 组合；调度员就是另一个跑 `wl dispatcher run` 的 Orca 终端，用一把 `dispatcher:<team>` 进程锁保证唯一。

**Tech Stack：** TypeScript、vitest、`node:sqlite`（已用）、commander（已用）；不引入新运行时依赖。

**Spec：** `docs/superpowers/specs/2026-10-13-phase-2b-dispatcher-patrol-design.md`（下称 spec），以及它所依赖的 2A spec 第 5.2 节（协调者归属）。实现者必须先读 spec 全文。

> **2026-10-14 修订：** 按 spec 修订同步修正 Task 1/3/6/7/8/9（`check --wait` 进程级超时、巡查节拍与消息频率解耦、主循环异常边界、`lastOutputAt` 为数字）。
>
> **2026-10-14 第三次修订（本版）：** 按 spec 第三次修订与"补充探针三"重写：Task 1 不再声明 `runUse`（由 2A 计划 Task 3 提供，本计划只消费），删掉 `sendEscalation`（协调者发不了 escalation）与 `completedAt`（闸门连败改用 2A 的本地 `task_done`），`check` 消息按实测字段 `from_handle`/`payload` 映射；Task 3 的 `done` 补丁定义了 `skipped_frozen` 的记录方式并把冻结检查放在解析 handle 之前；Task 4 的启动命令按平台拼写；Task 6 改成"永远 ack、转述尽力而为"并钉住刷屏/毒消息两种故障；Task 7 改按 `claimed_by` 与 `task_done`；Task 8 每个岗位的升级互相隔离；Task 9 加进程锁、启动重试（仅 `run_not_found` 致命）、被 fence 后自愈、ack 随下一次 `check` 发出；Task 11 修掉两个终端 handle 撞号。

**前置依赖（2A 计划已落地的、本计划直接使用的东西；以 2A 落地后的真实代码为准）：**

- 类型与方法：`TeamRow.coordinatorHandle`；`OrcaClient` 的 `runUse({ id, from })`（无 `retryRequest`）、`runShow`、`taskList`、`terminalList`、`terminalWait`；`OrchestrationTask`（含 `blocked`）。
- 注册表：`getTaskExt(...).claimedBy`、`listFinishedVerdicts(post, limit)`（`task_done` 表）、`withTeamLock(key, fn)`。
- 命令：`commands/task/{identity,query,create,claim,start,done}.ts`，其中 `mustTeamReady`、`requireActor`、`LinkDelivery`（已含 `'skipped_frozen'`）、`done.ts` 的 `linkOne`。
- 测试设施：2A 的 `FakeOrca` 编排模型（`coordinator`、`tasks`、`orch`/`callsOf`、`faults`、`calls`）与 `seedRunningTeam`（团队 `duo`，`runId 'run-1'`，协调者 `coord-1`，`builder@duo`=`term-b`、`checker@duo`=`term-c`，终端已在 `o.terminals` 里，标题即地址）。

## Global Constraints

- Node ≥ 22.13；不新增运行时依赖。
- 子进程一律 `spawn(file, args, { shell: false })`；本阶段不新增任何 shell 执行。
- 退出码四分类沿用总纲 7.8；新增输入错误 `post_frozen`/`post_not_frozen`/`dispatcher_launch_unsupported`/`dispatcher_terminal_required` 为 1；第二个调度员启动时的 `team_busy` 为 1。
- CI 矩阵不变；新测试跨平台安全。启动命令按平台分支拼写（Task 4），测试对两个分支都显式传 `platform`，不依赖运行测试的平台。
- **已实测、不再是假设**（`spikes/REPORT.md` 补充探针二、三）：`lastOutputAt` 是 Unix 毫秒数字，`terminal list` 每条都带；`check` 回执字段为 `deliveryId`/`messages`/`count`/`replayed`/`timedOut`，消息字段为 `id`/`type`/`from_handle`/`subject`/`body`/`payload`（JSON 字符串）；`check` 只认当前协调者，否则 `consumer_fenced`；`run-use` 对不存在的 Run 报 `run_not_found`；协调者不能发 `send --type escalation`（`sender_not_assignee`）。
- **`check --wait` 的进程级超时留余量**：传 `{ timeoutMs: timeoutMs + WAIT_PROCESS_SLACK_MS }`，复用 `orca/client.ts` 里 `terminalWait` 已有的模块内常量。
- `check` 不带 `--retry-request`：取批次是读，`--ack` 是对一个 `deliveryId` 的确认，重复确认没有副作用（2A spec 第 9.2 节表）。

## Review Focus

1. **收件箱永远 ack**：牵头岗忙（`send_unconfirmed`）或转述因任何原因失败，下一次 `check` 仍带上上一批的 `--ack`；超长 `body` 被截断而不是变成毒消息；同一批重放不重复转述 → Task 6、Task 9。
2. **巡查信号边界**：无进展恰好等于阈值不触发、多 1 秒触发；闸门连败恰好 N 次 escalate 触发 → Task 7。
3. **三级升级每次扫描只升一级、按岗位隔离**：一个岗位的通知抛错不影响其他岗位，也不回滚已写的 level → Task 8。
4. **协调者归属**：调度员被 fence 后自动 `run-use` 收回并继续；`wl up` 在调度员运行时不动协调者；同一团队第二个调度员 `team_busy`；启动时只有 `run_not_found` 致命 → Task 9、Task 11。
5. **巡查节拍按墙钟**：密集消息下多次 tick 只推进一次升级 → Task 9。
6. **`wl dispatcher up` 幂等**：已有 `dispatcher@<team>` 终端时不再建 → Task 4。

---

## 文件结构

```text
packages/core/src/
  orca/types.ts                     # 改：TerminalSummary.lastOutputAt；CheckMessage/CheckResult；OrcaClient.check
  orca/client.ts                    # 改：check；terminalList 映射 lastOutputAt
  spec/schema.ts, spec/load.ts      # 改：team.yaml 的 patrol 字段
  registry/migrations.ts            # 改：第三个迁移（patrol_state、frozen_posts）
  registry/registry.ts              # 改：PatrolStateRow/FrozenPostRow 及方法
  commands/task/create.ts, claim.ts, start.ts, done.ts   # 改（2A 文件）：冻结拦截/跳过
  commands/dispatcher/lifecycle.ts  # 新：dispatcherLaunchCommand、dispatcherUp、dispatcherDown
  commands/dispatcher/freeze.ts     # 新：freezePostCmd、unfreezePostCmd
  commands/dispatcher/inbox.ts      # 新：relayText、processBatch
  commands/dispatcher/patrol.ts     # 新：detectSignals、advancePatrol
  commands/dispatcher/loop.ts       # 新：connectDispatcher、dispatcherTick、runDispatcherLoop
  index.ts                          # 改：导出 commands/dispatcher/*
packages/cli/src/cli.ts, output.ts  # 改：wl dispatcher 子命令与渲染
packages/core/test/
  orca/client.test.ts               # 改
  commands/fake-client.ts           # 改：FakeOrca.check 模型、terminals 带 lastOutputAt
  spec/load.test.ts                 # 改：patrol 字段
  registry/registry.test.ts         # 改
  commands/task/create.test.ts, claim-start.test.ts, done.test.ts   # 改：冻结用例
  commands/dispatcher/{lifecycle,freeze,inbox,patrol,loop,flow}.test.ts   # 新
packages/cli/test/main.test.ts      # 改
```

---

### Task 1：`OrcaClient.check` + `lastOutputAt`

**Files:**
- Modify：`packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`
- Modify：`packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.ts`

**Interfaces:**
- Consumes：`OrcaRunner`；2A 的 `OrcaClient`（`runUse` 等已存在，本任务不重复声明）
- Produces：
  ```ts
  export interface TerminalSummary { handle: string; title: string | null; connected: boolean; worktreeId: string; lastOutputAt?: number | null }
  // 可选：2A 与阶段 1 的测试里大量 TerminalSummary 字面量不带这个字段；读取处一律 `?? null`
  export interface CheckMessage { id: string; type: string; fromHandle: string | null; subject: string | null; body: string | null; payload: string | null }
  export interface CheckResult { count: number; messages: CheckMessage[]; deliveryId: string | null; replayed: boolean; timedOut: boolean }
  check(a: { terminal: string; run: string; ack?: string; wait?: boolean; timeoutMs?: number }): Promise<CheckResult>
  ```
  argv：`orchestration check --terminal <t> --run <r> [--ack <d>] [--wait] [--timeout-ms <n>]`；消息 `from_handle → fromHandle`，缺失字段为 `null`；顶层缺失时 `count` 取 `messages.length`、`replayed`/`timedOut` 取 `false`。`a.wait` 为真时 `runner.json(args, { timeoutMs: (a.timeoutMs ?? 300_000) + WAIT_PROCESS_SLACK_MS })`，否则不传第二个参数。`terminalList` 的映射追加 `lastOutputAt: t.lastOutputAt ?? null`（数字原样，不做 `Date` 转换）。

- [ ] **Step 1：写失败测试（沿用已有 `clientWith`，它已返回 `{ client, calls, opts }`）**

```ts
test('check builds argv (ack before wait) and maps from_handle/payload', async () => {
  const { client, calls } = clientWith({ 'orchestration check': {
    count: 1, deliveryId: 'dlv-2', replayed: false, timedOut: false,
    messages: [{ id: 'msg-1', type: 'question', from_handle: 'term-c', subject: 's', body: 'b', payload: '{"x":1}' }],
  } })
  expect(await client.check({ terminal: 'term-dsp', run: 'run-1', ack: 'dlv-1', wait: true, timeoutMs: 300000 })).toEqual({
    count: 1, deliveryId: 'dlv-2', replayed: false, timedOut: false,
    messages: [{ id: 'msg-1', type: 'question', fromHandle: 'term-c', subject: 's', body: 'b', payload: '{"x":1}' }],
  })
  expect(calls[0]).toEqual(['orchestration', 'check', '--terminal', 'term-dsp', '--run', 'run-1', '--ack', 'dlv-1', '--wait', '--timeout-ms', '300000'])
})
test('check defaults missing message fields to null', async () => {
  const { client } = clientWith({ 'orchestration check': { count: 1, deliveryId: null, replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'worker_done' }] } })
  expect((await client.check({ terminal: 't', run: 'r' })).messages[0]).toEqual({ id: 'm1', type: 'worker_done', fromHandle: null, subject: null, body: null, payload: null })
})
test('check --wait gets a process-level timeout with slack; a non-waiting check does not', async () => {
  const { client, opts } = clientWith({ 'orchestration check': { count: 0, deliveryId: null, replayed: false, timedOut: true, messages: [] } })
  await client.check({ terminal: 't', run: 'r', wait: true, timeoutMs: 300_000 })
  expect(opts[0]).toEqual({ timeoutMs: 300_000 + 15_000 })   // 15_000 = client.ts 里 terminalWait 已用的 WAIT_PROCESS_SLACK_MS
  await client.check({ terminal: 't', run: 'r' })
  expect(opts[1]).toBeUndefined()
})
test('terminalList maps lastOutputAt (a number), defaulting to null', async () => {
  const { client } = clientWith({ 'terminal list': { terminals: [
    { handle: 'a', tabId: 't1', title: 'x', connected: true, worktreeId: 'w', lastOutputAt: 1791941667225 },
    { handle: 'b', tabId: 't2', title: 'y', connected: true, worktreeId: 'w' },
  ] } })
  expect((await client.terminalList()).map((t) => t.lastOutputAt)).toEqual([1791941667225, null])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现**（按 Interfaces）。`FakeOrca` 补：`checkResults: CheckResult[] = []`（按调用顺序 `shift()`；空时返回 `{ count: 0, messages: [], deliveryId: null, replayed: false, timedOut: true }`——不重复上一项，避免测试里同一批消息被意外处理两次）；`onCheck?: (a) => void`（记录调用之后、返回之前调用，可抛错）；`check` 推入 `calls`/`orch`（`callsOf('check')` 可读入参），并**模拟实测的 fence**：`a.terminal !== this.coordinator` → 抛 `orca`/`consumer_fenced`（在 `onCheck` 之后、取结果之前）。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/orca`；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): orchestration check on OrcaClient; lastOutputAt on terminal list"`

---

### Task 2：注册表——`patrol_state`、`frozen_posts`

**Files:**
- Modify：`packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`、`packages/core/test/registry/registry.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export type PatrolSignal = 'no_progress' | 'post_failure_streak'
  export interface PatrolStateRow { post: string; signal: PatrolSignal; level: number; since: string }
  getPatrolState(post: string): PatrolStateRow | null
  listPatrolState(team: string): PatrolStateRow[]          // post 以 @<team> 结尾的行
  setPatrolState(row: { post: string; signal: PatrolSignal; level: number }): void   // upsert，since 刷新为当前时间
  clearPatrolState(post: string): void
  freezePost(post: string, team: string, reason: string): void   // ON CONFLICT DO NOTHING（重复冻结是无操作）
  unfreezePost(post: string): void                                // 同一事务里同时 clearPatrolState
  isFrozen(post: string): boolean
  ```

- [ ] **Step 1：写失败测试（沿用 `tmpDb()`；`frozen_posts.team` 有外键，先 `upsertTeam`）**

```ts
const running: TeamRow = { ...team, runId: 'run-1', coordinatorHandle: 'coord-1' }
test('patrol_state round trip; since refreshes on each set', async () => {
  const r = Registry.open(tmpDb())
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 1 })
  const first = r.getPatrolState('builder@duo')!
  await new Promise((res) => setTimeout(res, 5))
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 2 })
  expect(r.getPatrolState('builder@duo')).toMatchObject({ level: 2 })
  expect(r.getPatrolState('builder@duo')!.since > first.since).toBe(true)
  r.clearPatrolState('builder@duo')
  expect(r.getPatrolState('builder@duo')).toBeNull()
})
test('listPatrolState is scoped to the team', () => {
  const r = Registry.open(tmpDb())
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 1 })
  r.setPatrolState({ post: 'x@other', signal: 'post_failure_streak', level: 1 })
  expect(r.listPatrolState('duo').map((x) => x.post)).toEqual(['builder@duo'])
})
test('freeze is idempotent; unfreeze clears patrol_state too', () => {
  const r = Registry.open(tmpDb()); r.upsertTeam(running)
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 3 })
  r.freezePost('builder@duo', 'duo', 'patrol: no_progress')
  expect(() => r.freezePost('builder@duo', 'duo', 'again')).not.toThrow()
  expect(r.isFrozen('builder@duo')).toBe(true)
  r.unfreezePost('builder@duo')
  expect(r.isFrozen('builder@duo')).toBe(false)
  expect(r.getPatrolState('builder@duo')).toBeNull()
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** 迁移数组第三项（接 2A 的第二项）：`CREATE TABLE patrol_state (post TEXT PRIMARY KEY, signal TEXT NOT NULL, level INTEGER NOT NULL, since TEXT NOT NULL); CREATE TABLE frozen_posts (post TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), reason TEXT NOT NULL, frozen_at TEXT NOT NULL);`。`setPatrolState` 用 `ON CONFLICT(post) DO UPDATE`；`listPatrolState` 用 `WHERE post LIKE '%@' || ?`；`unfreezePost` 在 `BEGIN IMMEDIATE` 里删两张表的行。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): registry support for patrol state and frozen posts"`

---

### Task 3：给 2A 四个命令打冻结补丁

**Files:**
- Modify：`packages/core/src/commands/task/create.ts`、`claim.ts`、`start.ts`、`done.ts`（2A 文件）
- Modify：`packages/core/test/commands/task/create.test.ts`、`claim-start.test.ts`、`done.test.ts`

**Interfaces:**
- Consumes：`Registry.isFrozen`（Task 2）；2A `done.ts` 的 `linkOne`、`LinkDelivery`

- [ ] **Step 1：写失败测试**

```ts
// create.test.ts
test('create --post at a frozen post is rejected before any Orca write', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost('checker@duo', 'duo', 'test')
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  expect(o.orch).toEqual([])
})
// claim-start.test.ts（复用 2A 该文件里的 seed/add）
test('claim and start by a frozen post are rejected', async () => {
  const { deps, registry, add } = seed()
  const open = await add(); const mine = await add([], 'builder@duo'); registry.setTaskPlan(mine, 'p')
  registry.freezePost('builder@duo', 'duo', 'test')
  await expect(claimTask(deps, { id: open, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  await expect(startTask(deps, { id: mine, as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
})
// done.test.ts（复用 2A 该文件里的 dispatched/REVIEW）
test('reviewed_by a frozen checker: child created and owned by checker, not dispatched, recorded as skipped_frozen', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  registry.freezePost('checker@duo', 'duo', 'test')
  const warnings: string[] = []; deps.warn = (m) => warnings.push(m)
  const r = await doneTask(deps, { id })
  expect(r.linkedTasks).toEqual([{ target: 'checker@duo', taskId: expect.any(String), delivery: 'skipped_frozen' }])
  expect(registry.getTaskExt(r.linkedTasks![0]!.taskId)!.claimedBy).toBe('checker@duo')
  expect(o.callsOf('dispatch')).toEqual([])
  expect(warnings.join()).toContain('checker@duo')
})
test('frozen check happens before handle resolution: a frozen target with no terminal is skipped_frozen, not skipped_offline', async () => {
  const { o, deps, registry, id } = await dispatched(REVIEW)
  registry.freezePost('checker@duo', 'duo', 'test')
  o.terminals = o.terminals.filter((t) => t.title !== 'checker@duo')
  expect((await doneTask(deps, { id })).linkedTasks![0]!.delivery).toBe('skipped_frozen')
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `create.ts`：给了 `post` 时，在 `locatePost` 与任何 Orca 写调用之前 `isFrozen(post)` → `post_frozen`（hint：`wl dispatcher unfreeze <post>`）。`claim.ts`/`start.ts`：解析出调用方地址后、取锁/调 Orca 之前同样检查。`done.ts` 的 `linkOne`：子任务 `task-create` 与 `insertTaskExt` 照常；在 `locatePost(target)` **之前** `isFrozen(target)` → `deps.warn(\`${target} 已冻结：评审/交接任务 ${child} 已建未派发，解冻后由它 wl task start\`)`，返回 `skipped_frozen`。跳过的派发不产生 Orca 调用，痕迹在返回值、`task_ext` 和这条警告里（spec 第 7 节）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): frozen posts block create/claim/start and skip link dispatch"`

---

### Task 4：调度员生命周期——`up`/`down` 与按平台拼写的启动命令

**Files:**
- Create：`packages/core/src/commands/dispatcher/lifecycle.ts`、`packages/core/test/commands/dispatcher/lifecycle.test.ts`

**Interfaces:**
- Consumes：`mustTeamReady`（2A）、`locatePost`、`loadTeamSpec`、`postAddress`
- Produces：
  ```ts
  export function dispatcherLaunchCommand(a: { platform: NodeJS.Platform; node: string; script: string; team: string }): string
  export async function dispatcherUp(deps: CommandDeps, a: { team: string; platform?: NodeJS.Platform }): Promise<{ address: string; outcome: 'already_live' | 'launched' }>
  export async function dispatcherDown(deps: CommandDeps, a: { team: string; close: boolean }): Promise<{ address: string; outcome: 'noop' | 'closed' | 'already_gone' }>
  ```

- [ ] **Step 1：写失败测试**

```ts
test('POSIX launch command single-quotes both paths (escaping embedded quotes)', () => {
  expect(dispatcherLaunchCommand({ platform: 'linux', node: '/usr/bin/node', script: "/opt/it's/main.js", team: 'duo' }))
    .toBe("'/usr/bin/node' '/opt/it'\\''s/main.js' dispatcher run duo")
})
test('Windows launch command is unquoted when both paths are plain (valid in cmd and PowerShell)', () => {
  expect(dispatcherLaunchCommand({ platform: 'win32', node: 'C:\\node\\node.exe', script: 'C:\\wl\\dist\\main.js', team: 'duo' }))
    .toBe('C:\\node\\node.exe C:\\wl\\dist\\main.js dispatcher run duo')
})
test('Windows paths with spaces → dispatcher_launch_unsupported with manual instructions', () => {
  expect(() => dispatcherLaunchCommand({ platform: 'win32', node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\wl\\main.js', team: 'duo' }))
    .toThrow(expect.objectContaining({ code: 'dispatcher_launch_unsupported', hint: expect.stringContaining('wl dispatcher run duo') }))
})
test('dispatcherUp creates dispatcher@<team> on the lead\'s worktree when none exists', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  expect(await dispatcherUp(deps, { team: 'duo', platform: 'linux' })).toEqual({ address: 'dispatcher@duo', outcome: 'launched' })
  expect(o.created[0]).toMatchObject({ title: 'dispatcher@duo', worktree: 'current', command: expect.stringContaining('dispatcher run duo') })
})
test('dispatcherUp is idempotent when the terminal already exists', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  expect(await dispatcherUp(deps, { team: 'duo' })).toEqual({ address: 'dispatcher@duo', outcome: 'already_live' })
  expect(o.created).toEqual([])
})
test('dispatcherUp before the team has a Run → run_not_ready', async () => {
  const { deps, registry } = mkDeps(new FakeOrca())
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h', runId: null, coordinatorHandle: null, status: 'up' })
  await expect(dispatcherUp(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'run_not_ready' })
})
test('dispatcherDown: noop without --close; closes, then already_gone', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  expect(await dispatcherDown(deps, { team: 'duo', close: false })).toEqual({ address: 'dispatcher@duo', outcome: 'noop' })
  expect(o.calls).not.toContain('terminalClose')
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'closed' })
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'already_gone' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** POSIX：每个路径按 sh 单引号规则包裹——`'` 替换成 `'\''`（结束引号、转义单引号、重开引号），两端各加一个 `'`；win32：两个路径都匹配 `/^[A-Za-z0-9\\/:._-]+$/` 才拼不加引号的形式，否则抛 `input`/`dispatcher_launch_unsupported`，hint："Windows 上路径含空格等字符时不能自动启动调度员：在 Orca 里手动开一个终端、标题设为 dispatcher@<team>，在里面运行 wl dispatcher run <team>"。`dispatcherUp`：`mustTeamReady` → `locatePost('dispatcher@<team>')` 命中 → `already_live`；否则 lead 的 worktree，`terminalCreate({ worktree, title, command: dispatcherLaunchCommand({ platform: a.platform ?? process.platform, node: process.execPath, script: process.argv[1]!, team }) })` → `launched`。`dispatcherDown`：团队不存在 → `team_unknown`；`!close` → `noop`；`locatePost` 为空 → `already_gone`；否则 `terminalClose` → `closed`。不交还协调者（spec 第 1.1 节）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl dispatcher up/down with per-platform launch command"`

---

### Task 5：手动冻结/解冻——`freezePostCmd`/`unfreezePostCmd`

**Files:**
- Create：`packages/core/src/commands/dispatcher/freeze.ts`、`packages/core/test/commands/dispatcher/freeze.test.ts`

**Interfaces:**
- Produces：`freezePostCmd(deps, a: { address: string; reason: string }): Promise<void>`；`unfreezePostCmd(deps, a: { address: string }): Promise<void>`。只做校验，写入委托给 Task 2 的 Registry 方法；巡查自动冻结直接调 Registry（spec："同一套底层逻辑"）。

- [ ] **Step 1：写失败测试**

```ts
test('freezePostCmd: unknown team → team_unknown; unknown post → post_unknown; otherwise frozen', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(freezePostCmd(deps, { address: 'builder@ghost', reason: 'x' })).rejects.toMatchObject({ code: 'team_unknown' })
  await expect(freezePostCmd(deps, { address: 'ghost@duo', reason: 'x' })).rejects.toMatchObject({ code: 'post_unknown' })
  await freezePostCmd(deps, { address: 'builder@duo', reason: '手动冻结' })
  expect(registry.isFrozen('builder@duo')).toBe(true)
})
test('unfreezePostCmd: not frozen → post_not_frozen; otherwise clears', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await expect(unfreezePostCmd(deps, { address: 'builder@duo' })).rejects.toMatchObject({ code: 'post_not_frozen' })
  registry.freezePost('builder@duo', 'duo', 'x')
  await unfreezePostCmd(deps, { address: 'builder@duo' })
  expect(registry.isFrozen('builder@duo')).toBe(false)
})
```

- [ ] **Step 2：运行确认失败。** - [ ] **Step 3：实现**（按签名；岗位存在性用 `registry.getPost`）。 - [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): manual freeze/unfreeze commands"`

---

### Task 6：收件箱——`relayText`/`processBatch`（永远 ack、转述尽力而为）

**Files:**
- Create：`packages/core/src/commands/dispatcher/inbox.ts`、`packages/core/test/commands/dispatcher/inbox.test.ts`

**Interfaces:**
- Consumes：`send`（阶段 1）、`CheckResult`/`CheckMessage`（Task 1）、`postAddress`
- Produces：
  ```ts
  export const RELAY_BODY_LIMIT = 3000
  export interface InboxState { lastRelayedDelivery: string | null }
  export function relayText(m: CheckMessage, fromAddress: string, multilineSafe: boolean): string
  /** 永不抛出：转述失败只 deps.warn。返回本批实际尝试转述的条数（供测试与日志）。 */
  export async function processBatch(deps: CommandDeps, team: TeamRow, spec: TeamSpec, batch: CheckResult, state: InboxState): Promise<number>
  ```

> 本任务及 Task 7/8/9 测试里的 `SPEC` 指 `loadTeamSpec(mkTeam(DUO_YAML))`（只用到 `lead` 与 `patrol` 默认值）。

- [ ] **Step 1：写失败测试**

```ts
const batch = (messages: CheckMessage[], over: Partial<CheckResult> = {}): CheckResult => ({ count: messages.length, messages, deliveryId: 'dlv-1', replayed: false, timedOut: false, ...over })
const q = (over: Partial<CheckMessage> = {}): CheckMessage => ({ id: 'msg-1', type: 'question', fromHandle: 'term-c', subject: 's', body: '要不要重试？', payload: null, ...over })
const fresh = (): InboxState => ({ lastRelayedDelivery: null })

test('worker_done needs nothing beyond the (later) ack', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  expect(await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q({ type: 'worker_done', body: null })]), fresh())).toBe(0)
  expect(o.sent).toEqual([])
})
test('question is relayed to the lead with the sender resolved from its terminal title', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q()]), fresh())
  expect(o.sent[0]).toMatchObject({ handle: 'term-b', text: 'checker@duo 问：要不要重试？（msg id: msg-1，用 orca orchestration reply --id msg-1 --body "<回答>" 来回复）' })
})
test('escalation uses the same relay with verb 上报; an unknown sender is shown with its handle', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q({ type: 'escalation', fromHandle: 'term-ghost' })]), fresh())
  expect(o.sent[0]!.text).toMatch(/^未知岗位（term-ghost） 上报：/)
})
test('a body longer than the relay limit is truncated so the relay always fits wl send\'s 4000-char limit', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q({ body: 'x'.repeat(10_000) })]), fresh())
  expect(o.sent[0]!.text.length).toBeLessThanOrEqual(4000)
  expect(o.sent[0]!.text).toContain('全文见 orca orchestration check --all')
})
test('multiline body is collapsed to one line when multilineSafe is false', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o, { multilineSafe: false })
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q({ body: '第一行\n第二行' })]), fresh())
  expect(o.sent[0]!.text).not.toMatch(/[\r\n]/); expect(o.sent[0]!.text).toContain('第一行 第二行')
})
test('lead busy (send_unconfirmed) or offline: processBatch still resolves and warns, later messages are still relayed', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const warnings: string[] = []; deps.warn = (m) => warnings.push(m)
  o.sendStages = ['input_accepted']                                   // 阶段 1 的 send 因此抛 uncertain/send_unconfirmed
  await expect(processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q(), q({ id: 'msg-2' })]), fresh())).resolves.toBe(2)
  expect(o.sent).toHaveLength(2)
  expect(warnings).toHaveLength(2)
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')  // 牵头岗终端不在：post_offline
  await expect(processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q()], { deliveryId: 'dlv-9' }), fresh())).resolves.toBe(1)
})
test('a replayed batch already relayed in this process is not relayed again', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const state = fresh()
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q()]), state)
  await processBatch(deps, registry.getTeam('duo')!, SPEC, batch([q()], { replayed: true }), state)
  expect(o.sent).toHaveLength(1)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `relayText`：`body` 先按 `multilineSafe` 决定是否 `replace(/[\r\n]+/g, ' ')`，再超过 `RELAY_BODY_LIMIT` 时截断并接"…（全文见 orca orchestration check --all）"；动词 `question → 问`、其余 → `上报`；模板见测试。`processBatch`：`batch.replayed && batch.deliveryId === state.lastRelayedDelivery` → 返回 0；只有 `question`/`escalation` 才转述；发送方地址用一次 `terminalList()`（失败则全部显示为"未知岗位（<handle>）"）按 `fromHandle` 找标题；每条 `send(deps, { address: lead, message })` 各自 `try/catch`，失败 `deps.warn(\`转述 ${m.id} 给 ${lead} 未成功（${code}），原文仍在 Orca 收件箱\`)`；最后 `state.lastRelayedDelivery = batch.deliveryId`。函数本身不抛出。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): dispatcher inbox relay that never blocks the ack"`

---

### Task 7：巡查信号——`detectSignals` + `team.yaml` 的 `patrol`

**Files:**
- Create：`packages/core/src/commands/dispatcher/patrol.ts`（本任务只写 `detectSignals`）、`packages/core/test/commands/dispatcher/patrol.test.ts`
- Modify：`packages/core/src/spec/schema.ts`、`packages/core/src/spec/load.ts`、`packages/core/test/spec/load.test.ts`

**Interfaces:**
- Consumes：`taskList`/`terminalList`、2A 的 `getTaskExt`、`listFinishedVerdicts`
- Produces：
  ```ts
  // load.ts
  export interface TeamSpec { /* … */ patrol: { noProgressMinutes: number; postFailureStreak: number } }
  // patrol.ts
  export interface PatrolHit { post: string; signal: PatrolSignal }
  export async function detectSignals(deps: CommandDeps, team: TeamRow, spec: TeamSpec, now?: Date): Promise<PatrolHit[]>
  ```

- [ ] **Step 1：写失败测试**

```ts
// load.test.ts
test('patrol defaults to 20/3; custom values parse', () => {
  expect(loadTeamSpec(mkTeam(DUO_YAML)).patrol).toEqual({ noProgressMinutes: 20, postFailureStreak: 3 })
  expect(loadTeamSpec(mkTeam(DUO_YAML + 'patrol:\n  no_progress_minutes: 5\n  post_failure_streak: 2\n')).patrol).toEqual({ noProgressMinutes: 5, postFailureStreak: 2 })
})
// patrol.test.ts
const NOW = new Date('2026-10-13T10:00:00Z')
async function withDispatched(o: FakeOrca, deps: CommandDeps, post: string, handle: string) {
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'coord-1' })
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: post })
  await o.dispatch({ task: id, to: handle, from: 'coord-1' })
}
const term = (o: FakeOrca, title: string) => o.terminals.find((t) => t.title === title)!
const escalated = (deps: CommandDeps, post: string, ids: string[], last: 'escalate' | 'passed' = 'escalate') => ids.forEach((id, i) => {
  deps.registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work' })
  deps.registry.recordVerdict({ taskId: id, epoch: 0, post, verdict: i === ids.length - 1 ? last : 'escalate', gateFailures: 3, dispatchId: 'x', reportFrom: 'h', body: null })
  deps.registry.finishVerdict(id, 0, {})
})

test('no_progress: exactly at the threshold does not trigger; one second past does', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'builder@duo', 'term-b')
  term(o, 'builder@duo').lastOutputAt = NOW.getTime() - 20 * 60_000
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([])
  term(o, 'builder@duo').lastOutputAt = NOW.getTime() - (20 * 60_000 + 1000)
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([{ post: 'builder@duo', signal: 'no_progress' }])
})
test('no_progress: a post whose terminal is missing counts as no progress', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'builder@duo', 'term-b')
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([{ post: 'builder@duo', signal: 'no_progress' }])
})
test('post_failure_streak reads local finished verdicts: exactly N escalations trigger; a most recent pass does not', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'builder@duo', 'term-b'); term(o, 'builder@duo').lastOutputAt = NOW.getTime()
  escalated(deps, 'builder@duo', ['c1', 'c2', 'c3'])
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([{ post: 'builder@duo', signal: 'post_failure_streak' }])
  escalated(deps, 'builder@duo', ['c4'], 'passed')
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([])
})
test('only posts with a currently dispatched task (by claimed_by) are scanned', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  escalated(deps, 'checker@duo', ['c1', 'c2', 'c3'])                 // checker 有连败历史但手上没有在办任务
  expect(await detectSignals(deps, registry.getTeam('duo')!, SPEC, NOW)).toEqual([])
})
```

> 对一个岗位同时命中两个信号时返回两条（顺序：`no_progress` 在前）；本任务的用例都只构造单一信号，所以用 `toEqual` 精确断言整个数组。

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `schema.ts` 加 `patrol: z.object({ no_progress_minutes: z.number().int().positive().default(20), post_failure_streak: z.number().int().positive().default(3) }).strict().default({})`，`load.ts` 填驼峰字段。`detectSignals`：`taskList` → `status === 'dispatched'` 的任务按 `getTaskExt(id)?.claimedBy` 去重得岗位集合；一次 `terminalList()`；对每个岗位：标题等于地址的终端的 `lastOutputAt ?? null`，为 null 或 `now - lastOutputAt > noProgressMinutes * 60_000` → `no_progress`；`listFinishedVerdicts(post, postFailureStreak)` 长度等于阈值且全部 `escalate` → `post_failure_streak`。不经过 `Date.parse`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): patrol signal detection (no_progress, post_failure_streak)"`

---

### Task 8：三级升级——`advancePatrol`（按岗位隔离）

**Files:**
- Modify：`packages/core/src/commands/dispatcher/patrol.ts`、`packages/core/test/commands/dispatcher/patrol.test.ts`

**Interfaces:**
- Produces：`export async function advancePatrol(deps: CommandDeps, team: TeamRow, spec: TeamSpec, now?: Date): Promise<void>`
  > 一个岗位同时命中两个信号时，沿用它已有 `patrol_state` 行的信号；全新命中按 `post_failure_streak` > `no_progress` 选一个（`patrol_state` 主键只有 `post`，一个岗位只追踪一个信号）。

- [ ] **Step 1：写失败测试**

```ts
const stale = (o: FakeOrca, title: string) => { term(o, title).lastOutputAt = NOW.getTime() - 3_600_000 }
test('first hit: level 1, nudge sent to the post itself', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'builder@duo', 'term-b'); stale(o, 'builder@duo')
  await advancePatrol(deps, registry.getTeam('duo')!, SPEC, NOW)
  expect(registry.getPatrolState('builder@duo')).toMatchObject({ signal: 'no_progress', level: 1 })
  expect(o.sent.map((s) => s.handle)).toEqual(['term-b'])
})
test('a persisting signal advances exactly one level per scan; level 2 notifies the lead only via wl send; level 3 freezes', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'checker@duo', 'term-c'); stale(o, 'checker@duo')
  const levels: number[] = []
  for (let i = 0; i < 3; i++) { await advancePatrol(deps, registry.getTeam('duo')!, SPEC, NOW); levels.push(registry.getPatrolState('checker@duo')!.level) }
  expect(levels).toEqual([1, 2, 3])
  expect(o.sent.map((s) => s.handle)).toEqual(['term-c', 'term-b', 'term-b'])   // 提示 checker → 通知 lead（builder）→ 冻结通知 lead
  expect(o.orch.filter((c) => c.m !== 'taskCreate' && c.m !== 'dispatch')).toEqual([])   // 除了建测试数据，没有任何编排调用（没有 escalation）
  expect(registry.isFrozen('checker@duo')).toBe(true)
})
test('once frozen, further scans are a no-op even though the signal persists', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'checker@duo', 'term-c'); stale(o, 'checker@duo')
  registry.setPatrolState({ post: 'checker@duo', signal: 'no_progress', level: 3 }); registry.freezePost('checker@duo', 'duo', 'x')
  await advancePatrol(deps, registry.getTeam('duo')!, SPEC, NOW)
  expect(o.sent).toEqual([])
  expect(registry.getPatrolState('checker@duo')!.level).toBe(3)
})
test('signal resolved (fresh output, or no dispatched task any more): the row is cleared and nothing is sent', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await withDispatched(o, deps, 'checker@duo', 'term-c'); term(o, 'checker@duo').lastOutputAt = NOW.getTime()
  registry.setPatrolState({ post: 'checker@duo', signal: 'no_progress', level: 1 })   // 有新输出了
  registry.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 2 })   // 手上已没有在办任务
  await advancePatrol(deps, registry.getTeam('duo')!, SPEC, NOW)
  expect(registry.getPatrolState('checker@duo')).toBeNull()
  expect(registry.getPatrolState('builder@duo')).toBeNull()
  expect(o.sent).toEqual([])
})
test('one post\'s failing notification does not stop the scan for others, and its level is still recorded', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  const warnings: string[] = []; deps.warn = (m) => warnings.push(m)
  await withDispatched(o, deps, 'builder@duo', 'term-b'); await withDispatched(o, deps, 'checker@duo', 'term-c')
  o.terminals = o.terminals.filter((t) => t.title !== 'builder@duo')     // builder 的提示会 post_offline
  stale(o, 'checker@duo')
  await expect(advancePatrol(deps, registry.getTeam('duo')!, SPEC, NOW)).resolves.toBeUndefined()
  expect(registry.getPatrolState('builder@duo')).toMatchObject({ level: 1 })
  expect(registry.getPatrolState('checker@duo')).toMatchObject({ level: 1 })
  expect(o.sent.map((s) => s.handle)).toEqual(['term-c'])
  expect(warnings.join()).toContain('builder@duo')
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  ```ts
  export async function advancePatrol(deps, team, spec, now = new Date()) {
    const hits = groupBySignal(await detectSignals(deps, team, spec, now))       // Map<post, Set<PatrolSignal>>
    const posts = new Set([...hits.keys(), ...deps.registry.listPatrolState(team.name).map((r) => r.post)])
    for (const post of posts) {
      if (deps.registry.isFrozen(post)) continue
      const existing = deps.registry.getPatrolState(post)
      const signal = pickSignal(existing, hits.get(post))
      if (!signal) { if (existing) deps.registry.clearPatrolState(post); continue }
      const level = existing && existing.signal === signal ? existing.level + 1 : 1
      deps.registry.setPatrolState({ post, signal, level })                      // 先记"这一级已尝试"
      try { await act(deps, team, spec, post, signal, level) }
      catch (err) { deps.warn(`巡查对 ${post} 的第 ${level} 级动作未成功：${err instanceof Error ? err.message : err}`) }
    }
  }
  ```
  `act`：`level === 1` → `send(post, \`巡查提示：${label}，需要帮忙请用 wl task escalate\`)`；`level === 2` → `send(lead, \`${post} 触发巡查信号 ${signal}，已提示但未恢复，请关注\`)`；`level >= 3` → 先 `registry.freezePost(post, team.name, \`patrol: ${signal}\`)`，再 `send(lead, \`${post} 已冻结，不会再分配新任务，需要 wl dispatcher unfreeze 解除\`)`。`label`：`no_progress` → `无进展已 ${noProgressMinutes} 分钟`；`post_failure_streak` → `最近 ${postFailureStreak} 个任务都以 escalate 收场`。**没有** `orchestration send --type escalation`（spec 第 6 节：协调者发不了）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): three-level patrol escalation, isolated per post"`

---

### Task 9：主循环——`connectDispatcher`/`dispatcherTick`/`runDispatcherLoop`

**Files:**
- Create：`packages/core/src/commands/dispatcher/loop.ts`、`packages/core/test/commands/dispatcher/loop.test.ts`

**Interfaces:**
- Consumes：`mustTeamReady`（2A）、`runUse`（2A）、`check`（Task 1）、`processBatch`（Task 6）、`advancePatrol`（Task 8）、`withTeamLock`
- Produces：
  ```ts
  export const PATROL_INTERVAL_MS = 300_000
  export interface DispatcherState extends InboxState { lastScanAt: number; pendingAck: string | null }
  export interface LoopOpts { signal?: AbortSignal; timeoutMs?: number; errorBackoffMs?: number }   // errorBackoffMs 默认 5000，只为测试可调小
  export async function connectDispatcher(deps: CommandDeps, team: string, handle: string, opts?: LoopOpts): Promise<TeamRow>
  export interface TickResult { timedOut: boolean; messageCount: number; scanned: boolean }
  export async function dispatcherTick(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec; handle: string }, state: DispatcherState, timeoutMs?: number): Promise<TickResult>
  export async function runDispatcherLoop(deps: CommandDeps, team: string, opts?: LoopOpts): Promise<void>
  ```

- [ ] **Step 1：写失败测试**

```ts
const DSP = { ORCA_TERMINAL_HANDLE: 'term-dsp' }
const fresh = (): DispatcherState => ({ lastScanAt: 0, pendingAck: null, lastRelayedDelivery: null })
const ctxOf = (deps: CommandDeps) => ({ team: deps.registry.getTeam('duo')!, spec: SPEC, handle: 'term-dsp' })
function dsp(env: NodeJS.ProcessEnv = DSP) {
  const o = new FakeOrca(); const s = seedRunningTeam(o, { env })
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })
  return { o, ...s }
}
const msgs = (deliveryId: string, type = 'question'): CheckResult => ({ count: 1, deliveryId, replayed: false, timedOut: false, messages: [{ id: `m-${deliveryId}`, type, fromHandle: 'term-c', subject: null, body: 'x', payload: null }] })

test('connectDispatcher: run-use from its own handle, persisted', async () => {
  const { o, deps } = dsp()
  expect((await connectDispatcher(deps, 'duo', 'term-dsp')).coordinatorHandle).toBe('term-dsp')
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-1', from: 'term-dsp' }])
  expect(deps.registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
test('connectDispatcher retries transient failures (e.g. runtime_unavailable after an Orca restart); run_not_found is fatal', async () => {
  const { o, deps } = dsp()
  o.faults.push({ method: 'runUse', when: 'before', error: new WinglineError('orca', 'runtime_unavailable', 'x') })
  await connectDispatcher(deps, 'duo', 'term-dsp', { errorBackoffMs: 1 })
  expect(o.callsOf('runUse')).toHaveLength(2)
  o.faults.push({ method: 'runUse', when: 'before', error: new WinglineError('orca', 'run_not_found', 'gone') })
  await expect(connectDispatcher(deps, 'duo', 'term-dsp', { errorBackoffMs: 1 })).rejects.toMatchObject({ code: 'run_not_found' })
})
test('the ack for a batch rides on the next check, even when relaying it failed (lead busy)', async () => {
  const { o, deps } = dsp(); await connectDispatcher(deps, 'duo', 'term-dsp')
  o.sendStages = ['input_accepted']                                  // 转述 send_unconfirmed
  o.checkResults = [msgs('dlv-1')]
  const state = fresh()
  await dispatcherTick(deps, ctxOf(deps), state)
  await dispatcherTick(deps, ctxOf(deps), state)
  expect(o.callsOf('check').map((c) => c.ack)).toEqual([undefined, 'dlv-1'])
})
test('after a timed-out check there is nothing to ack', async () => {
  const { o, deps } = dsp(); await connectDispatcher(deps, 'duo', 'term-dsp')
  const state = fresh()
  expect(await dispatcherTick(deps, ctxOf(deps), state)).toMatchObject({ timedOut: true, messageCount: 0 })
  await dispatcherTick(deps, ctxOf(deps), state)
  expect(o.callsOf('check').map((c) => c.ack)).toEqual([undefined, undefined])
})
test('patrol scans by wall clock: a fresh state scans, a recent lastScanAt does not, and a dense inbox advances escalation at most once', async () => {
  const { o, deps, registry } = dsp(); await connectDispatcher(deps, 'duo', 'term-dsp')
  const { id } = await o.taskCreate({ spec: 's', taskTitle: 't', run: 'run-1', from: 'term-dsp' })
  registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work', claimedBy: 'checker@duo' })
  await o.dispatch({ task: id, to: 'term-c', from: 'term-dsp' })     // checker 的终端没有 lastOutputAt → 无进展
  o.checkResults = [msgs('d1', 'worker_done'), msgs('d2', 'worker_done'), msgs('d3', 'worker_done'), msgs('d4', 'worker_done')]
  const state = fresh()
  const scanned: boolean[] = []
  for (let i = 0; i < 4; i++) scanned.push((await dispatcherTick(deps, ctxOf(deps), state)).scanned)
  expect(scanned).toEqual([true, false, false, false])
  expect(registry.getPatrolState('checker@duo')!.level).toBe(1)
})
test('a consumer_fenced check (someone ran run-use) is healed: the loop reclaims and keeps going', async () => {
  const { o, deps } = dsp()
  const ac = new AbortController()
  o.onCheck = () => {
    const n = o.callsOf('check').length
    if (n === 1) o.coordinator = 'term-other'                        // 第一次 check 前身份被拿走 → 这次 check 被 fence
    if (n >= 3) ac.abort()
  }
  await runDispatcherLoop(deps, 'duo', { signal: ac.signal, errorBackoffMs: 1 })
  expect(o.callsOf('runUse')).toEqual([{ id: 'run-1', from: 'term-dsp' }, { id: 'run-1', from: 'term-dsp' }])
  expect(o.coordinator).toBe('term-dsp')
})
test('any other exception mid-tick is logged and the loop continues', async () => {
  const { o, deps } = dsp()
  const ac = new AbortController(); let n = 0
  o.onCheck = () => { n++; if (n === 1) throw new Error('boom'); if (n >= 3) ac.abort() }
  await runDispatcherLoop(deps, 'duo', { signal: ac.signal, errorBackoffMs: 1 })
  expect(n).toBeGreaterThanOrEqual(3)
})
test('a second dispatcher for the same team exits with team_busy', async () => {
  const { deps, registry } = dsp()
  let release!: () => void
  const held = registry.withTeamLock('dispatcher:duo', () => new Promise<void>((res) => { release = res }))
  await expect(runDispatcherLoop(deps, 'duo', {})).rejects.toMatchObject({ code: 'team_busy' })
  release(); await held
})
test('outside an Orca terminal → dispatcher_terminal_required', async () => {
  const { deps } = dsp({})
  await expect(runDispatcherLoop(deps, 'duo', {})).rejects.toMatchObject({ code: 'dispatcher_terminal_required' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  - `connectDispatcher`：`mustTeamReady` → 循环：`runUse({ id: team.runId!, from: handle })` 成功 → `upsertTeam({ ...team, coordinatorHandle })` 返回；失败：`code === 'run_not_found'` → 上抛；`opts.signal?.aborted` → 上抛最后的错误；否则 `deps.warn` + 退避 `errorBackoffMs` 后重试。
  - `dispatcherTick`：`batch = await orca.check({ terminal: handle, run: team.runId!, ...(state.pendingAck ? { ack: state.pendingAck } : {}), wait: true, timeoutMs: timeoutMs ?? 300_000 })`；`state.pendingAck = null`；有消息 → `await processBatch(deps, team, spec, batch, state)`，`state.pendingAck = batch.deliveryId`；`scanned = Date.now() - state.lastScanAt >= PATROL_INTERVAL_MS`，为真则 `await advancePatrol(...)` 后 `state.lastScanAt = Date.now()`（`advancePatrol` 抛错时不更新，留给循环的异常边界）。
  - `runDispatcherLoop`：`handle = deps.env.ORCA_TERMINAL_HANDLE`，无 → `input`/`dispatcher_terminal_required`；`return deps.registry.withTeamLock(\`dispatcher:${name}\`, async () => { let team = await connectDispatcher(...); const spec = loadTeamSpec(team.specPath); const state = { lastScanAt: 0, pendingAck: null, lastRelayedDelivery: null }; while (!aborted) { try { await dispatcherTick(deps, { team, spec, handle }, state, opts.timeoutMs) } catch (err) { if (fenced(err)) { team = await connectDispatcher(deps, name, handle, opts); deps.warn('协调者身份曾被另一个终端拿走，已收回'); continue } deps.warn(...); await sleep(backoff) } } })`。`connectDispatcher` 失败（`run_not_found`）是唯一让函数抛出的情形（除锁与环境变量的前置检查）。
  - `fenced(err)` 与 2A `ledger.ts` 里的同名判断复用（从那里导出）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): dispatcher main loop with lock, fenced self-heal and piggybacked ack"`

---

### Task 10：CLI 接入——`wl dispatcher <sub>`

**Files:**
- Modify：`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`、`packages/core/src/index.ts`、`packages/cli/test/main.test.ts`

命令面：

```
wl dispatcher up <team> [--json]
wl dispatcher down <team> [--close] [--json]
wl dispatcher run <team>                         # 长期运行，无 --json
wl dispatcher freeze <post@team> --reason <text> [--json]
wl dispatcher unfreeze <post@team> [--json]
```

- [ ] **Step 1：写失败测试**（复用 2A 计划 Task 12 加的 `fakeCommands`/`runWith`）

```ts
test('wl dispatcher up --json prints the outcome', async () => {
  const r = await runWith(['dispatcher', 'up', 'duo', '--json'], fakeCommands({ dispatcherUp: async () => ({ address: 'dispatcher@duo', outcome: 'launched' }) }))
  expect(JSON.parse(r.out).result.outcome).toBe('launched')
})
test('wl dispatcher freeze requires --reason', async () => {
  expect((await runWith(['dispatcher', 'freeze', 'builder@duo'], fakeCommands({}))).code).toBe(1)
})
test('wl dispatcher run awaits runDispatcherLoop with the team; a team_busy error exits 1', async () => {
  let team: string | undefined
  await runWith(['dispatcher', 'run', 'duo'], fakeCommands({ runDispatcherLoop: async (_d, t) => { team = t } }))
  expect(team).toBe('duo')
  const r = await runWith(['dispatcher', 'run', 'duo'], fakeCommands({ runDispatcherLoop: async () => { throw new WinglineError('input', 'team_busy', 'busy') } }))
  expect(r.code).toBe(1)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `Commands` 补 `dispatcherUp`/`dispatcherDown`/`runDispatcherLoop`/`freezePostCmd`/`unfreezePostCmd`；注册子命令；`run` 不接 `--json`，`await commands.runDispatcherLoop(deps, team, {})`，异常走统一的 `renderError`/`exitCodeOf`。`index.ts` 补导出。
- [ ] **Step 4：运行确认通过** — `pnpm test`；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(cli): wl dispatcher command surface"`

---

### Task 11：端到端集成测试

**Files:**
- Create：`packages/core/test/commands/dispatcher/flow.test.ts`

- [ ] **Step 1：写失败测试**

```ts
test('dispatcher takes the coordinator, wl up leaves it alone, inbox is acked, an escalation streak freezes the post', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  const specPath = mkTeam(DUO_YAML + 'patrol:\n  post_failure_streak: 2\n')
  await up(deps, { specPath })                                        // builder=term-1（lead），checker=term-2，协调者 term-1
  o.terminals.push({ handle: 'term-dsp', title: 'dispatcher@duo', connected: true, worktreeId: 'w' })   // 不与 term-1/term-2 撞号
  const dsp = { ...deps, env: { ORCA_TERMINAL_HANDLE: 'term-dsp' } }
  const team = await connectDispatcher(dsp, 'duo', 'term-dsp')
  expect(team.coordinatorHandle).toBe('term-dsp')

  expect((await up(deps, { specPath })).run.outcome).toBe('kept')    // 2A spec 5.2：不从活着的调度员身上拿走身份
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')

  const spec = loadTeamSpec(specPath); const state = { lastScanAt: Date.now(), pendingAck: null, lastRelayedDelivery: null }
  o.checkResults = [{ count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'worker_done', fromHandle: 'term-2', subject: 's', body: null, payload: null }] }]
  await dispatcherTick(dsp, { team, spec, handle: 'term-dsp' }, state)
  await dispatcherTick(dsp, { team, spec, handle: 'term-dsp' }, state)
  expect(o.callsOf('check')[1]).toMatchObject({ ack: 'dlv-1' })
  expect(o.sent.filter((s) => s.text.includes('问：'))).toEqual([])

  for (const id of ['c1', 'c2']) {                                     // checker 之前两个任务都以 escalate 收场
    registry.insertTaskExt({ taskId: id, team: 'duo', tags: [], kind: 'work' })
    registry.recordVerdict({ taskId: id, epoch: 0, post: 'checker@duo', verdict: 'escalate', gateFailures: 3, dispatchId: 'x', reportFrom: 'term-2', body: null })
    registry.finishVerdict(id, 0, {})
  }
  const { id } = await createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })   // 当前在办任务
  o.terminals.find((t) => t.handle === 'term-2')!.lastOutputAt = Date.now()
  for (let i = 0; i < 3; i++) await advancePatrol(dsp, team, spec)
  expect(registry.isFrozen('checker@duo')).toBe(true)
  expect(registry.getTaskExt(id)!.claimedBy).toBe('checker@duo')
  await expect(createTask(deps, { team: 'duo', title: 't2', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：** 本任务不写生产代码；失败则回到对应任务修正。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS。
- [ ] **Step 5：提交** — `git commit -m "test: end-to-end phase 2B dispatcher and patrol flow"`

---

## 自检记录

- **spec 覆盖：** 第 1.1 节（协调者归属引用 2A 5.2）→ Task 9（connect/fence 自愈）、Task 11（`wl up` 为 `kept`）；第 2 节（命令、启动命令按平台）→ Task 4/5/10；第 3 节（锁、connect 重试、ack 随下一次 check、节拍）→ Task 9；第 4 节（永远 ack、截断、去重、`from_handle`）→ Task 1/6/9；第 5 节（按 `claimed_by` 扫描、`task_done` 连败、patrol 字段）→ Task 7；第 6 节（三级、无 Orca escalation、按岗位隔离）→ Task 8；第 7 节（四个命令、`skipped_frozen`、冻结检查先于 handle 解析）→ Task 3；第 8 节（异常边界）→ Task 8/9；第 9 节（测试分层）→ Task 1（契约）、Task 2–9（单元）、Task 11（集成）；第 10 节（盲区说明）无代码。
- **占位扫描：** 无 TBD；所有测试为可执行代码（旧版 Task 8/9 的注释式用例已全部换成可执行测试）。
- **类型一致性：** `CheckMessage.fromHandle`、`CheckResult`、`PatrolHit`（不再带 `handle`）、`PatrolStateRow`、`DispatcherState`（扩展 `InboxState`）、`LoopOpts` 在定义与消费任务之间一致；`runUse` 不在本计划声明（2A Task 3 唯一声明，无 `retryRequest`），`FakeOrca` 不再有 `coordinatorHandleAfterRunUse`——`runUse` 直接改 2A 模型里的 `coordinator`。
- **Review Focus：** 6 条均标注到具体任务且有对应可执行测试（编号与任务一一核对过：收件箱 → Task 6/9、信号边界 → Task 7、升级 → Task 8、归属 → Task 9/11、节拍 → Task 9、幂等 → Task 4）。
- **比例：** Task 9（主循环）与 Task 6（收件箱）承载复审指出的主要故障，测试最多；Task 5 最轻。
- **实现层决定：** `processBatch` 返回尝试转述的条数而不是布尔值（不再有"批次失败"的概念）；`FakeOrca.checkResults` 用尽后返回超时而不是重复最后一项；一个岗位同时命中两个信号时的优先级（Task 8）。
