# 雁阵阶段 2B（调度员与巡查熔断）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 在阶段 2A 的 `wl task`/Orca Run 之上，实现可选的 `wl dispatcher up/down/run/freeze/unfreeze <team>` 命令族：一个长期持有协调者身份的后台终端，循环处理收件箱消息并巡查"卡住了"的岗位，三级升级（提示/通知牵头岗/冻结），永不杀进程。

**Architecture：** 调度员本身不是新状态机——任务状态仍是 2A 的 Orca 原生状态；雁阵只加两张本地表（`patrol_state`/`frozen_posts`）和一批无状态的纯函数（信号判定、状态机推进、收件箱分发），全部通过 `CommandDeps` 组合，不引入新进程模型（调度员就是另一个跑 `wl dispatcher run` 的 Orca 终端，循环体是普通异步函数）。

**Tech Stack：** TypeScript、vitest、`node:sqlite`（已用）、commander（已用）；不引入新运行时依赖。

**Spec：** `docs/superpowers/specs/2026-10-13-phase-2b-dispatcher-patrol-design.md`（下称 spec）。实现者必须同时阅读 spec 全文。本计划的接口/字段/错误码均取自该 spec；本文档只在 spec 留了开放选择时才做出决定并在对应任务里注明。

**前置依赖：** 本计划假定阶段 2A 的实现计划（`docs/superpowers/plans/2026-10-13-phase-2a-task-workflow.md`，下称 2A 计划）已经落地：`teams.coordinator_handle`/`teams.run_id`、`commands/task/{identity,query,create,claim,start,done,escalate}.ts`、`OrcaClient` 的 `runCreate/taskCreate/taskList/dispatch/workerDone/gateCreate/gateResolve` 均已按 2A 计划的签名存在。本计划里对这些文件的"Modify"均基于 2A 计划文档里给出的签名，不是基于当前仓库的真实文件（2A 尚未实现）；真正执行本计划时如果 2A 的落地签名有出入，以 2A 落地后的真实代码为准。

## Global Constraints

- Node ≥ 22.13；不新增运行时依赖。
- 子进程一律 `spawn(file, args, { shell: false })`；本阶段不新增任何 shell 执行（调度员只调用 Orca CLI 和雁阵自己的函数，没有 gate 之外的本地命令执行）。
- Orca `--json` 信封、退出码四分类沿用总纲 7.8 节；本阶段新增的输入错误（`post_frozen`/`post_not_frozen`/`team_unknown`）均为退出码 1。
- CI 矩阵不变：`macos-latest`、`ubuntu-latest`、`windows-latest` × Node `22.13`、`24`——新测试跨平台安全；调度员启动命令的路径拼接只用简单双引号包裹（不依赖 shell 内置语法），同一套字符串在 POSIX 和 cmd.exe 里都能被正确分词。
- **已知未经真机核实的细节**（均已在对应任务里标注，不阻塞实现，但发版前应补一轮真机验证）：`check` 返回体里 `deliveryId`、消息对象的 `id`/`subject`/`body`/`from` 字段的确切大小写/命名，是本计划基于 spec 正文引用的 JSON 片段（`replayed`/`timedOut` 已确认，这两个是实测直接观察到的字段名）做的最佳推断；`run-use` 的返回体结构假定和 `run-create` 一致（`run.coordinator_handle`），未独立复核。

## Review Focus

1. **巡查信号的边界条件**：`now - lastOutputAt` 恰好等于 `patrol.no_progress_minutes`、恰好有 `patrol.post_failure_streak` 次失败但不多不少——spec 原文用"大于"（`>`），不是"大于等于"→ Task 6 的边界测试。
2. **三级升级每次扫描只升一级**：同一岗位信号连续多个巡查周期都命中时，`level` 必须每次 +1（1→2→3），不能跳级、不能同一周期重复触发同一级的动作两次 → Task 7。
3. **已冻结岗位的巡查短路**：一旦 `frozen_posts` 里有记录，即便信号仍然成立，巡查也不应该再发消息或试图升级（spec 没有定义 level 4）→ Task 7。
4. **收件箱批处理的失败原子性**：一批消息里只要有一条处理失败（比如 `wl send` 到牵头岗失败），整批都不能 `--ack`，否则这条失败的消息会永久丢失，不会在下次循环里重试 → Task 5。
5. **`wl dispatcher up` 的幂等性**：团队已经有一个标题为 `dispatcher@<team>` 的终端时，不应该再建一个（与阶段 1 `locatePost` 的"按标题幂等"逻辑一致，但这是新代码路径，需要专门测试）→ Task 4。

---

## 文件结构

```text
packages/core/src/
  orca/types.ts                     # 改：TerminalSummary 加 lastOutputAt；OrchestrationTask 加 completedAt；
                                     #     新增 CheckMessage/CheckResult 类型；OrcaClient 新增 runUse/check/sendEscalation
  orca/client.ts                    # 改：实现上述三个新方法 + terminalList/taskList 的字段映射追加
  registry/migrations.ts            # 改：新迁移（patrol_state、frozen_posts 表）
  registry/registry.ts              # 改：PatrolStateRow/FrozenPostRow 及读写方法
  commands/task/create.ts           # 改（2A 已有文件）：--post 指向冻结岗位时拒绝
  commands/task/claim.ts            # 改（2A 已有文件）：调用方被冻结时拒绝
  commands/task/start.ts            # 改（2A 已有文件）：调用方被冻结时拒绝
  commands/dispatcher/handles.ts    # 新：addressOfHandle
  commands/dispatcher/lifecycle.ts  # 新：dispatcherLaunchCommand、dispatcherUp、dispatcherDown
  commands/dispatcher/freeze.ts     # 新：freezePost、unfreezePost（CLI 包装 + 校验）
  commands/dispatcher/inbox.ts      # 新：relayToLead、processBatch
  commands/dispatcher/patrol.ts     # 新：detectSignals、advancePatrol
  commands/dispatcher/loop.ts       # 新：connectDispatcher、dispatcherTick、runDispatcherLoop
  index.ts                          # 改：补 commands/dispatcher/* 的导出
packages/cli/src/
  cli.ts                             # 改：wl dispatcher 子命令
  output.ts                          # 改：dispatcher 相关渲染
packages/core/test/
  orca/client.test.ts                           # 改：新方法 + 字段映射用例
  commands/fake-client.ts                       # 改：FakeOrca 实现 runUse/check/sendEscalation，terminals/tasks 支持新字段
  registry/registry.test.ts                     # 改：patrol_state/frozen_posts 的读写用例
  commands/task/create.test.ts, claim-start.test.ts   # 改：post_frozen 用例
  commands/dispatcher/lifecycle.test.ts         # 新
  commands/dispatcher/freeze.test.ts            # 新
  commands/dispatcher/inbox.test.ts             # 新
  commands/dispatcher/patrol.test.ts            # 新
  commands/dispatcher/loop.test.ts              # 新
  commands/dispatcher/flow.test.ts              # 新：端到端
packages/cli/test/
  main.test.ts                       # 改：wl dispatcher CLI 的用例
```

> **结构说明：** 调度员相关命令全部放进新的 `commands/dispatcher/` 子目录，和 2A 的 `commands/task/` 并列——两者是独立的命令族，互不下沉到对方目录。

---

### Task 1：`OrcaClient` 调度员方法——`runUse`/`check`/`sendEscalation` + 字段补充

**Files:**
- Modify：`packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`
- Modify：`packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.ts`

**Interfaces:**
- Consumes：`OrcaRunner`（已有）
- Produces：
  ```ts
  // types.ts
  export interface TerminalSummary {
    handle: string; title: string | null; connected: boolean; worktreeId: string
    lastOutputAt: string | null   // 新增
  }
  export interface OrchestrationTask {
    // 2A 已定义的字段不变，新增：
    completedAt: string | null
  }
  export interface CheckMessage { id: string; type: string; from: string | null; subject: string | null; body: string | null }
  export interface CheckResult { count: number; messages: CheckMessage[]; deliveryId: string | null; replayed: boolean; timedOut: boolean }
  // OrcaClient 新增：
  runUse(a: { id: string; from: string }): Promise<{ coordinatorHandle: string }>
  check(a: { terminal: string; run: string; wait?: boolean; timeoutMs?: number; ack?: string }): Promise<CheckResult>
  sendEscalation(a: { to: string; from: string; subject: string; body: string; run: string }): Promise<void>
  ```
  argv：
  - `runUse` → `['orchestration','run-use','--id',a.id,'--from',a.from]`，读 `r.run.coordinator_handle`（假定与 `run-create` 同一返回体形状，见 Global Constraints 的已知未核实项）
  - `check` → `['orchestration','check','--terminal',a.terminal,'--run',a.run, ...(a.ack?['--ack',a.ack]:[]), ...(a.wait?['--wait']:[]), ...(a.timeoutMs!==undefined?['--timeout-ms',String(a.timeoutMs)]:[])]`，直接读顶层 `count`/`messages`/`deliveryId`/`replayed`/`timedOut`（`messages[]` 里缺失的 `from`/`subject`/`body` 缺省 `null`）
  - `sendEscalation` → `['orchestration','send','--type','escalation','--to',a.to,'--subject',a.subject,'--body',a.body,'--run',a.run,'--from',a.from]`（`--from` 放最后，与 2A `workerDone` 的既有惯例一致），不读返回值
  - `terminalList` 的已有映射追加 `lastOutputAt: titles 同层的 RawTerminal.lastOutputAt ?? null`
  - `taskList` 的已有映射追加 `completedAt: t.completed_at ?? null`

- [ ] **Step 1：写失败测试**

```ts
test('runUse reads run.coordinator_handle', async () => {
  const { client, calls } = clientWith({ 'orchestration run-use': { run: { coordinator_handle: 'term-9' } } })
  expect(await client.runUse({ id: 'run-1', from: 'term-9' })).toEqual({ coordinatorHandle: 'term-9' })
  expect(calls[0]).toEqual(['orchestration', 'run-use', '--id', 'run-1', '--from', 'term-9'])
})
test('check builds argv with optional ack/wait/timeout-ms, and maps result fields', async () => {
  const { client, calls } = clientWith({ 'orchestration check': {
    count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false,
    messages: [{ id: 'msg-1', type: 'question', from: 'term-2', subject: 's', body: 'b' }],
  } })
  expect(await client.check({ terminal: 'term-1', run: 'run-1', wait: true, timeoutMs: 300000 })).toEqual({
    count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false,
    messages: [{ id: 'msg-1', type: 'question', from: 'term-2', subject: 's', body: 'b' }],
  })
  expect(calls[0]).toEqual(['orchestration', 'check', '--terminal', 'term-1', '--run', 'run-1', '--wait', '--timeout-ms', '300000'])
  await client.check({ terminal: 'term-1', run: 'run-1', ack: 'dlv-1' })
  expect(calls[1]).toEqual(['orchestration', 'check', '--terminal', 'term-1', '--run', 'run-1', '--ack', 'dlv-1'])
})
test('check defaults missing optional message fields to null', async () => {
  const { client } = clientWith({ 'orchestration check': { count: 1, deliveryId: null, replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'worker_done' }] } })
  expect((await client.check({ terminal: 't', run: 'r' })).messages[0]).toEqual({ id: 'm1', type: 'worker_done', from: null, subject: null, body: null })
})
test('sendEscalation builds argv in the from-last convention', async () => {
  const { client, calls } = clientWith({ 'orchestration send': {} })
  await client.sendEscalation({ to: 'term-1', from: 'coord-1', subject: 'patrol: no_progress', body: 'b', run: 'run-1' })
  expect(calls[0]).toEqual(['orchestration', 'send', '--type', 'escalation', '--to', 'term-1', '--subject', 'patrol: no_progress', '--body', 'b', '--run', 'run-1', '--from', 'coord-1'])
})
test('terminalList maps lastOutputAt, defaulting to null', async () => {
  const { client } = clientWith({ 'terminal list': { terminals: [{ handle: 'term-1', tabId: 't1', title: 'x', connected: true, worktreeId: 'w', lastOutputAt: '2026-10-13T10:00:00Z' }] } })
  expect((await client.terminalList())[0]).toMatchObject({ lastOutputAt: '2026-10-13T10:00:00Z' })
})
test('taskList maps completed_at to completedAt, defaulting to null', async () => {
  const { client } = clientWith({ 'orchestration task-list': { tasks: [{ id: 't1', status: 'completed', task_title: 'x', spec: 's', parent_id: null, result: null, completed_at: '2026-10-13T10:00:00Z' }] } })
  expect((await client.taskList({ run: 'run-1' }))[0]).toMatchObject({ completedAt: '2026-10-13T10:00:00Z' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** 按 Interfaces 加三个方法；`terminalList`/`taskList` 的既有映射各加一行。`FakeOrca`（`fake-client.ts`）补：`runUseCalls`/`checkCalls`/`sendEscalationCalls` 记录数组；`checkResults: CheckResult[] = []`（按调用顺序消费，用完后重复最后一项；默认空数组时返回 `{ count: 0, messages: [], deliveryId: null, replayed: false, timedOut: true }`）；`coordinatorHandleAfterRunUse = 'coord-1'`；`terminals`/`tasks` 的元素类型分别补 `lastOutputAt`/`completedAt`（测试里直接 push 带这两个字段的对象）；已有的 `workerDone` 实现追加：成功/失败时把对应任务的 `completedAt` 设为 `new Date().toISOString()`。
- [ ] **Step 4：运行确认通过** — `pnpm vitest run packages/core/test/orca` → PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(core): run-use/check/send-escalation on OrcaClient"`

---

### Task 2：注册表扩展——`patrol_state`、`frozen_posts`

**Files:**
- Modify：`packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`
- Modify：`packages/core/test/registry/registry.test.ts`

**Interfaces:**
- Produces：
  ```ts
  export type PatrolSignal = 'no_progress' | 'post_failure_streak'
  export interface PatrolStateRow { post: string; signal: PatrolSignal; level: number; since: string }
  export interface FrozenPostRow { post: string; team: string; reason: string; frozenAt: string }
  // Registry 新增方法：
  getPatrolState(post: string): PatrolStateRow | null
  listPatrolState(): PatrolStateRow[]
  setPatrolState(row: { post: string; signal: PatrolSignal; level: number }): void   // upsert，since 每次都刷新为当前时间
  clearPatrolState(post: string): void
  freezePost(post: string, team: string, reason: string): void
  unfreezePost(post: string): void   // 同时 clearPatrolState(post)
  isFrozen(post: string): boolean
  ```

- [ ] **Step 1：写失败测试**

```ts
test('patrol_state round trip; since refreshes on every setPatrolState call', async () => {
  const r = Registry.open(tmpFile())
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 1 })
  const first = r.getPatrolState('builder@duo')!
  expect(first).toMatchObject({ post: 'builder@duo', signal: 'no_progress', level: 1 })
  await new Promise((res) => setTimeout(res, 2))
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 2 })
  const second = r.getPatrolState('builder@duo')!
  expect(second.level).toBe(2)
  expect(second.since >= first.since).toBe(true)
  r.clearPatrolState('builder@duo')
  expect(r.getPatrolState('builder@duo')).toBeNull()
})
test('listPatrolState returns all rows across teams', () => {
  const r = Registry.open(tmpFile())
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 1 })
  r.setPatrolState({ post: 'x@other', signal: 'post_failure_streak', level: 1 })
  expect(r.listPatrolState().map((x) => x.post).sort()).toEqual(['builder@duo', 'x@other'])
})
test('freeze/unfreeze round trip; unfreeze also clears patrol_state', () => {
  const r = Registry.open(tmpFile())
  r.setPatrolState({ post: 'builder@duo', signal: 'no_progress', level: 3 })
  r.freezePost('builder@duo', 'duo', 'patrol: no_progress')
  expect(r.isFrozen('builder@duo')).toBe(true)
  r.unfreezePost('builder@duo')
  expect(r.isFrozen('builder@duo')).toBe(false)
  expect(r.getPatrolState('builder@duo')).toBeNull()
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `migrations.ts` 追加数组第三项（接在 2A 的第二项之后）：`CREATE TABLE patrol_state (post TEXT PRIMARY KEY, signal TEXT NOT NULL, level INTEGER NOT NULL, since TEXT NOT NULL); CREATE TABLE frozen_posts (post TEXT PRIMARY KEY, team TEXT NOT NULL REFERENCES teams(name), reason TEXT NOT NULL, frozen_at TEXT NOT NULL);`。`registry.ts` 按 Interfaces 实现；`setPatrolState` 用 `INSERT ... ON CONFLICT(post) DO UPDATE SET signal=excluded.signal, level=excluded.level, since=excluded.since`，`since` 每次都传 `now()`；`unfreezePost` 在一个事务里先 `DELETE FROM frozen_posts`，再调用 `this.clearPatrolState`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): registry support for patrol state and frozen posts"`

---

### Task 3：2A 三个命令打补丁——冻结拦截

**Files:**
- Modify：`packages/core/src/commands/task/create.ts`、`claim.ts`、`start.ts`（2A 已有文件；按 2A 计划 Task 7/8 落地后的真实代码定位插入点）
- Modify：`packages/core/test/commands/task/create.test.ts`、`claim-start.test.ts`

**Interfaces:**
- Consumes：`Registry.isFrozen`（Task 2）

- [ ] **Step 1：写失败测试**

```ts
// create.test.ts
test('createTask --post pointing at a frozen post is rejected before dispatch', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'term-2', status: 'live', isLead: false })
  registry.freezePost('checker@duo', 'duo', 'test')
  await expect(createTask(deps, { team: 'duo', title: 't', post: 'checker@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
  expect(o.dispatchCalls).toEqual([])
})
// claim-start.test.ts
test('claim by a frozen post is rejected', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  o.tasks.push({ id: 't1', status: 'ready', title: 'a', spec: 's', parentId: null, assigneeHandle: null, dispatchId: null, result: null, completedAt: null })
  deps.registry.insertTaskExt({ taskId: 't1', team: 'duo', tags: [] })
  registry.freezePost('builder@duo', 'duo', 'test')
  await expect(claimTask(deps, { id: 't1', as: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
})
test('start by a frozen post is rejected', async () => { /* 同上，换成已 claim 好的任务 + startTask */ })
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** 三处均在各自函数解析出 actor/目标地址之后、发起任何 Orca 调用之前插入：`if (deps.registry.isFrozen(targetAddress)) throw new WinglineError('input', 'post_frozen', \`${targetAddress} 已被巡查冻结\`, { hint: '用 wl dispatcher unfreeze 解除' })`（`create.ts` 里 `targetAddress` 是 `args.post`，仅当给出时才检查；`claim.ts`/`start.ts` 里是解析出的 `actor`）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): reject task create/claim/start for frozen posts"`

---

### Task 4：调度员生命周期命令——`up`/`down`

**Files:**
- Create：`packages/core/src/commands/dispatcher/lifecycle.ts`
- Create：`packages/core/test/commands/dispatcher/lifecycle.test.ts`

**Interfaces:**
- Consumes：`mustTeamReady`（2A `commands/task/query.ts`）、`locatePost`（阶段 1）、`loadTeamSpec`（已有+2A）、`postAddress`（`commands/deps.ts`）
- Produces：
  ```ts
  export function dispatcherLaunchCommand(execPath: string, scriptPath: string, team: string): string
  export async function dispatcherUp(deps: CommandDeps, args: { team: string }): Promise<{ address: string; outcome: 'already_live' | 'launched' }>
  export async function dispatcherDown(deps: CommandDeps, args: { team: string; close: boolean }): Promise<{ address: string; outcome: 'noop' | 'closed' | 'already_gone' }>
  ```

- [ ] **Step 1：写失败测试**

```ts
test('dispatcherLaunchCommand wraps both paths in double quotes', () => {
  expect(dispatcherLaunchCommand('/usr/bin/node', '/opt/wl/dist/main.js', 'duo'))
    .toBe('"/usr/bin/node" "/opt/wl/dist/main.js" dispatcher run duo')
})
test('dispatcherUp creates a terminal titled dispatcher@<team> on the lead\'s worktree when none exists', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)   // duo 的 lead 是 builder，worktree: current
  const r = await dispatcherUp(deps, { team: 'duo' })
  expect(r).toEqual({ address: 'dispatcher@duo', outcome: 'launched' })
  expect(o.created[0]).toMatchObject({ title: 'dispatcher@duo', worktree: 'current' })
  expect(o.created[0]!.command).toContain('dispatcher run duo')
})
test('dispatcherUp is idempotent when the terminal already exists', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-9', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  const r = await dispatcherUp(deps, { team: 'duo' })
  expect(r).toEqual({ address: 'dispatcher@duo', outcome: 'already_live' })
  expect(o.created).toEqual([])
})
test('dispatcherUp before the team has a Run fails with run_not_ready', async () => {
  const { deps, registry } = mkDeps(new FakeOrca())
  registry.upsertTeam({ name: 'duo', specPath: '/s', specHash: 'h'.repeat(64), runId: null, coordinatorHandle: null, status: 'up' })
  await expect(dispatcherUp(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'run_not_ready' })
})
test('dispatcherDown without --close is a noop', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-9', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  expect(await dispatcherDown(deps, { team: 'duo', close: false })).toEqual({ address: 'dispatcher@duo', outcome: 'noop' })
  expect(o.calls).not.toContain('terminalClose')
})
test('dispatcherDown --close closes the terminal, or reports already_gone', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-9', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'closed' })
  expect(await dispatcherDown(deps, { team: 'duo', close: true })).toEqual({ address: 'dispatcher@duo', outcome: 'already_gone' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `dispatcherLaunchCommand`：`` `"${execPath}" "${scriptPath}" dispatcher run ${team}"` `` 的双引号包裹版本（路径里若含双引号用 `\\"` 转义，和 cmd-escape.ts 的转义思路一致但不复用其代码，因为这里两种 shell 下语法都一样，不需要 cmd 专门分支）。`dispatcherUp`：`const team = mustTeamReady(deps, args.team)`；`const address = postAddress('dispatcher', args.team)`；`locatePost(deps.orca, address)` 命中则 `already_live`；否则 `loadTeamSpec(team.specPath)` 找 `spec.posts.find(p => p.id === spec.lead)!.worktree`，`terminalCreate({ worktree, title: address, command: dispatcherLaunchCommand(process.execPath, process.argv[1]!, args.team) })`，返回 `launched`。`dispatcherDown`：`!deps.registry.getTeam(args.team)` 报 `team_unknown`；`!args.close` 直接 `noop`；否则 `locatePost` 找不到 `already_gone`，找到则 `terminalClose` 后 `closed`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): wl dispatcher up/down lifecycle"`

---

### Task 5：手动冻结/解冻——`freezePost`/`unfreezePost`（命令层）

**Files:**
- Create：`packages/core/src/commands/dispatcher/freeze.ts`
- Create：`packages/core/test/commands/dispatcher/freeze.test.ts`

**Interfaces:**
- Consumes：`Registry.freezePost`/`unfreezePost`/`isFrozen`（Task 2）
- Produces：
  ```ts
  export async function freezePostCmd(deps: CommandDeps, args: { address: string; reason: string }): Promise<void>
  export async function unfreezePostCmd(deps: CommandDeps, args: { address: string }): Promise<void>
  ```
  （命名带 `Cmd` 后缀以避免和 `Registry.freezePost`/`unfreezePost` 同名造成调用处混淆；这层只做校验，真正的状态写入委托给 Task 2 的 Registry 方法——巡查自动触发时直接调用 Registry 方法，不经过这一层，和 spec"同一套底层逻辑"的描述一致。）

- [ ] **Step 1：写失败测试**

```ts
test('freezePostCmd rejects an unknown team', async () => {
  const { deps } = mkDeps(new FakeOrca())
  await expect(freezePostCmd(deps, { address: 'builder@ghost', reason: 'x' })).rejects.toMatchObject({ code: 'team_unknown' })
})
test('freezePostCmd records the freeze', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  await freezePostCmd(deps, { address: 'builder@duo', reason: '手动冻结' })
  expect(registry.isFrozen('builder@duo')).toBe(true)
})
test('unfreezePostCmd on a non-frozen post fails with post_not_frozen', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  await expect(unfreezePostCmd(deps, { address: 'builder@duo' })).rejects.toMatchObject({ code: 'post_not_frozen' })
})
test('unfreezePostCmd clears an existing freeze', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.freezePost('builder@duo', 'duo', 'x')
  await unfreezePostCmd(deps, { address: 'builder@duo' })
  expect(registry.isFrozen('builder@duo')).toBe(false)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `freezePostCmd`：`const team = args.address.split('@')[1]!`；`if (!deps.registry.getTeam(team)) throw team_unknown`；`deps.registry.freezePost(args.address, team, args.reason)`。`unfreezePostCmd`：`if (!deps.registry.isFrozen(args.address)) throw new WinglineError('input', 'post_not_frozen', ...)`；否则 `deps.registry.unfreezePost(args.address)`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): manual freeze/unfreeze commands"`

---

### Task 6：收件箱分发——`relayToLead`/`processBatch`

**Files:**
- Create：`packages/core/src/commands/dispatcher/handles.ts`、`packages/core/src/commands/dispatcher/inbox.ts`
- Create：`packages/core/test/commands/dispatcher/inbox.test.ts`

**Interfaces:**
- Consumes：`send`（`commands/send.ts`，阶段 1 已有）、`CheckMessage`（Task 1）、`postAddress`（`commands/deps.ts`）
- Produces：
  ```ts
  // handles.ts
  export function addressOfHandle(deps: CommandDeps, team: string, handle: string): string | null
  // inbox.ts
  export async function processBatch(deps: CommandDeps, team: TeamRow, spec: TeamSpec, messages: CheckMessage[]): Promise<boolean>   // 返回是否全部成功（决定调用方要不要 ack）
  ```

> 本任务及之后 Task 7/8/9/11 的测试代码里出现的 `SPEC` 统一指 `loadTeamSpec(mkTeam(DUO_YAML))` 的返回值（只用到 `spec.lead`/`spec.patrol`，不需要和 `seedRunningTeam` 用的是同一个 `specPath`）。

- [ ] **Step 1：写失败测试**

```ts
// handles.test（并入 inbox.test.ts）
test('addressOfHandle finds the post whose handle matches; unknown handle returns null', () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'term-2', status: 'live', isLead: false })
  expect(addressOfHandle(deps, 'duo', 'term-2')).toBe('checker@duo')
  expect(addressOfHandle(deps, 'duo', 'term-ghost')).toBeNull()
})
// inbox.test.ts
test('worker_done messages require no action beyond ack (processBatch succeeds, sends nothing)', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  const ok = await processBatch(deps, deps.registry.getTeam('duo')!, SPEC, [{ id: 'm1', type: 'worker_done', from: 'term-2', subject: 's', body: null }])
  expect(ok).toBe(true)
  expect(o.sent).toEqual([])
})
test('question messages are relayed to the lead with the exact template', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'checker@duo', team: 'duo', agent: 'codex', worktree: 'current', handle: 'term-2', status: 'live', isLead: false })
  o.terminals.push({ handle: 'term-1', title: 'builder@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  const ok = await processBatch(deps, deps.registry.getTeam('duo')!, SPEC, [{ id: 'msg-1', type: 'question', from: 'term-2', subject: 's', body: '要不要重试？' }])
  expect(ok).toBe(true)
  expect(o.sent[0]!.text).toBe('checker@duo 问：要不要重试？（msg id: msg-1，用 orca orchestration reply --id msg-1 --body "<回答>" 来回复）')
})
test('escalation messages use the same relay, with a different verb', async () => {
  // 同上，type: 'escalation'，断言文本里出现 "上报 escalation" 而不是 "问"
})
test('unknown sender handle falls back to "未知岗位" in the relayed text', async () => { /* from: 'term-ghost' */ })
test('one failing send fails the whole batch (no ack upstream), later messages still get a chance to run', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.failSendOnce = new Error('boom')
  const ok = await processBatch(deps, deps.registry.getTeam('duo')!, SPEC, [
    { id: 'msg-1', type: 'question', from: null, subject: null, body: 'x' },
    { id: 'msg-2', type: 'worker_done', from: null, subject: null, body: null },
  ])
  expect(ok).toBe(false)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `handles.ts` 按签名实现。`inbox.ts`：内部 `relayToLead(deps, team, spec, msg)`：`const leadAddress = postAddress(spec.lead, team.name)`；`const fromAddress = msg.from ? (addressOfHandle(deps, team.name, msg.from) ?? '未知岗位') : '未知岗位'`；`const verb = msg.type === 'question' ? '问' : '上报 escalation'`；`const text = \`${fromAddress} ${verb}：${msg.body ?? ''}（msg id: ${msg.id}，用 orca orchestration reply --id ${msg.id} --body "<回答>" 来回复）\``；`await send(deps, { address: leadAddress, message: text })`。`processBatch`：遍历消息，`type` 为 `question`/`escalation` 调用 `relayToLead`，其余类型不做任何事；每条用 `try/catch` 包裹，失败则 `deps.warn(...)` 并记 `ok = false`（不中断循环，继续处理后面的消息）；返回 `ok`。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): dispatcher inbox relay for question/escalation messages"`

---

### Task 7：巡查信号判定——`detectSignals`

**Files:**
- Create：`packages/core/src/commands/dispatcher/patrol.ts`（本任务只写 `detectSignals`，`advancePatrol` 留给 Task 8）
- Create：`packages/core/test/commands/dispatcher/patrol.test.ts`

**Interfaces:**
- Consumes：`OrcaClient.taskList`/`terminalList`（已有+Task 1）、`addressOfHandle`（Task 6）
- Produces：
  ```ts
  export interface PatrolHit { post: string; handle: string; signal: PatrolSignal }
  export async function detectSignals(deps: CommandDeps, team: TeamRow, spec: TeamSpec, now?: Date): Promise<PatrolHit[]>
  ```
  （`now` 默认 `new Date()`，测试传固定时间做边界判定；一个岗位可以同时命中两个信号，各自一条 `PatrolHit`）

- [ ] **Step 1：写失败测试**

```ts
const NOW = new Date('2026-10-13T10:00:00Z')

test('no_progress: exactly at the threshold does not trigger; one minute past does', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-1', status: 'live', isLead: true })
  o.terminals.push({ handle: 'term-1', title: 'builder@duo', connected: true, worktreeId: 'w', lastOutputAt: '2026-10-13T09:40:00Z' }) // 恰好 20 分钟前
  o.tasks.push({ id: 't1', status: 'dispatched', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'ctx-1', result: null, completedAt: null })
  expect(await detectSignals(deps, deps.registry.getTeam('duo')!, SPEC, NOW)).toEqual([])
  o.terminals[0]!.lastOutputAt = '2026-10-13T09:39:59Z' // 20 分钟零 1 秒前
  expect(await detectSignals(deps, deps.registry.getTeam('duo')!, SPEC, NOW)).toEqual([{ post: 'builder@duo', handle: 'term-1', signal: 'no_progress' }])
})
test('post_failure_streak: exactly N consecutive failures triggers; N-1 failures plus one success does not', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)   // SPEC.budgets 等默认；patrol.postFailureStreak 默认 3
  registry.upsertPost({ address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-1', status: 'live', isLead: true })
  o.terminals.push({ handle: 'term-1', title: 'builder@duo', connected: true, worktreeId: 'w', lastOutputAt: NOW.toISOString() })
  o.tasks.push(
    { id: 'c1', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x1', result: null, completedAt: '2026-10-13T09:00:00Z' },
    { id: 'c2', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x2', result: null, completedAt: '2026-10-13T09:10:00Z' },
    { id: 'c3', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x3', result: null, completedAt: '2026-10-13T09:20:00Z' },
    { id: 't9', status: 'dispatched', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'ctx-9', result: null, completedAt: null },
  )
  expect(await detectSignals(deps, deps.registry.getTeam('duo')!, SPEC, NOW)).toContainEqual({ post: 'builder@duo', handle: 'term-1', signal: 'post_failure_streak' })
  o.tasks.find((t) => t.id === 'c1')!.status = 'completed'
  expect(await detectSignals(deps, deps.registry.getTeam('duo')!, SPEC, NOW))
    .not.toContainEqual(expect.objectContaining({ signal: 'post_failure_streak' }))
})
test('only posts with a currently dispatched task are scanned', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  // 该岗位有历史失败但当前没有 dispatched 任务 → 不在扫描范围内
  o.tasks.push({ id: 'c1', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x1', result: null, completedAt: NOW.toISOString() })
  expect(await detectSignals(deps, deps.registry.getTeam('duo')!, SPEC, NOW)).toEqual([])
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `const tasks = await deps.orca.taskList({ run: team.runId! })`；`const dispatchedHandles = new Set(tasks.filter(t => t.status === 'dispatched' && t.assigneeHandle).map(t => t.assigneeHandle!))`；对每个 handle：no_progress — 从 `terminalList()` 找该 handle 的 `lastOutputAt`，`lastOutputAt` 为空或 `(now.getTime() - Date.parse(lastOutputAt)) / 60000 > spec.patrol.noProgressMinutes` → 命中；post_failure_streak — `tasks.filter(t => t.assigneeHandle === handle && (t.status === 'completed' || t.status === 'failed')).sort((a,b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, spec.patrol.postFailureStreak)`，长度等于阈值且全部 `failed` → 命中；`post = addressOfHandle(deps, team.name, handle) ?? handle`。（本任务不读 `spec.patrol`，因为 2A 的 `TeamSpec` 还没有这个字段——留给 Task 8 之前先在本任务里顺带给 `spec/schema.ts`/`load.ts` 加 `patrol.no_progress_minutes`/`patrol.post_failure_streak`，见下方补充 Step。）
- [ ] **Step 3b：补充——`team.yaml` 的 `patrol` 字段。** 修改 `packages/core/src/spec/schema.ts`：`teamSchema` 加 `patrol: z.object({ no_progress_minutes: z.number().int().positive().default(20), post_failure_streak: z.number().int().positive().default(3) }).strict().default({})`；`packages/core/src/spec/load.ts` 的 `loadTeamSpec` 返回值顶层加 `patrol: { noProgressMinutes: team.patrol.no_progress_minutes, postFailureStreak: team.patrol.post_failure_streak }`；对应测试加进 `packages/core/test/spec/load.test.ts`：`test('patrol defaults to 20/3; custom values parse', ...)`（写法同 2A 计划 Task 1 的 budgets 测试）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): patrol signal detection (no_progress, post_failure_streak)"`

---

### Task 8：三级升级状态机——`advancePatrol`

**Files:**
- Modify：`packages/core/src/commands/dispatcher/patrol.ts`
- Modify：`packages/core/test/commands/dispatcher/patrol.test.ts`

**Interfaces:**
- Consumes：`detectSignals`（Task 7）、`Registry.{getPatrolState,listPatrolState,setPatrolState,clearPatrolState,freezePost,isFrozen}`（Task 2）、`send`（阶段 1）、`OrcaClient.sendEscalation`（Task 1）
- Produces：
  ```ts
  export async function advancePatrol(deps: CommandDeps, team: TeamRow, spec: TeamSpec, now?: Date): Promise<void>
  ```
  > 一个岗位同时命中两个信号时，优先沿用它已有 `patrol_state` 行记录的信号；如果是全新命中（没有已有行），按固定优先级 `post_failure_streak` > `no_progress` 选一个——这是 spec 没明确、因为 `patrol_state` 的主键只有 `post`（一post 一信号）而必须做出的实现判断，记在这里供以后对照 spec 时核对。

- [ ] **Step 1：写失败测试**

```ts
test('first hit: level goes 0 → 1, sends the nudge to the post itself', async () => {
  const o = new FakeOrca(); const { deps, registry } = seedRunningTeam(o)
  registry.upsertPost({ address: 'builder@duo', team: 'duo', agent: 'claude', worktree: 'current', handle: 'term-1', status: 'live', isLead: true })
  o.terminals.push({ handle: 'term-1', title: 'builder@duo', connected: true, worktreeId: 'w', lastOutputAt: '2026-10-13T09:00:00Z' })
  o.tasks.push({ id: 't1', status: 'dispatched', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'ctx-1', result: null, completedAt: null })
  await advancePatrol(deps, deps.registry.getTeam('duo')!, SPEC, new Date('2026-10-13T10:00:00Z'))
  expect(registry.getPatrolState('builder@duo')).toMatchObject({ signal: 'no_progress', level: 1 })
  expect(o.sent[0]!.handle).toBe('term-1')
})
test('persisting signal: level advances exactly one per scan (1→2→3), never skips or repeats', async () => {
  // 同样的 FakeOrca/registry 状态，连续三次调用 advancePatrol（每次用同一个 now，模拟信号持续）
  // 断言三次调用后 level 依次是 1、2、3，且 level=2 时同时发了 wl send 给 lead + o.sendEscalationCalls 长度为 1，
  // level=3 时 registry.isFrozen('builder@duo') 变成 true
})
test('once frozen, further scans are a no-op even though the signal is still present', async () => {
  // 预置 frozen_posts 有该岗位；advancePatrol 不应该再调用 send/sendEscalation，也不应该再改 patrol_state
})
test('signal resolves (lastOutputAt refreshed, or the post no longer has a dispatched task): patrol_state row is cleared, frozen_posts untouched', async () => {
  // 场景 A：patrol_state 已有 level=1 的行，这次扫描该岗位 lastOutputAt 已刷新 → 行被删除
  // 场景 B：patrol_state 已有行，但该岗位这次扫描已经没有 dispatched 任务 → 行同样被删除
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。**
  ```ts
  export async function advancePatrol(deps, team, spec, now = new Date()) {
    const hits = await detectSignals(deps, team, spec, now)
    const hitsByPost = new Map<string, Set<PatrolSignal>>()
    for (const h of hits) { if (!hitsByPost.has(h.post)) hitsByPost.set(h.post, new Set()); hitsByPost.get(h.post)!.add(h.signal) }
    const tracked = deps.registry.listPatrolState().filter((r) => r.post.endsWith(`@${team.name}`))
    const posts = new Set([...hitsByPost.keys(), ...tracked.map((r) => r.post)])
    for (const post of posts) {
      if (deps.registry.isFrozen(post)) continue
      const existing = deps.registry.getPatrolState(post)
      const available = hitsByPost.get(post)
      const signal = !available ? undefined
        : existing && available.has(existing.signal) ? existing.signal
        : available.has('post_failure_streak') ? 'post_failure_streak' : [...available][0]
      if (!signal) { if (existing) deps.registry.clearPatrolState(post); continue }
      const level = existing && existing.signal === signal ? existing.level + 1 : 1
      deps.registry.setPatrolState({ post, signal, level })
      await act(deps, team, spec, post, signal, level)
    }
  }
  ```
  `act(deps, team, spec, post, signal, level)` 按 spec 第 6 节的表：`level === 1` → `send(deps, { address: post, message: \`巡查提示：${label(signal, ...)}，需要我帮你叫人吗？\` })`；`level === 2` → `send(deps, { address: leadAddress, message: \`${post} 触发巡查信号 ${signal}，已提示但未恢复，请关注\` })` 并且 `deps.orca.sendEscalation({ to: leadHandle, from: team.coordinatorHandle!, subject: \`patrol: ${signal}\`, body: \`${post} 的巡查信号 ${signal} 已持续两个周期未恢复\`, run: team.runId! })`；`level === 3` → `deps.registry.freezePost(post, team.name, \`patrol: ${signal}\`)` 然后 `send(deps, { address: leadAddress, message: \`${post} 已冻结，不会再分配新任务，需要 wl dispatcher unfreeze 解除\` })`（`leadAddress`/`leadHandle` 通过 `postAddress(spec.lead, team.name)` 和 `deps.registry.getPost(leadAddress)?.handle` 取得）。`label()` 是一个小 helper：`no_progress` → `\`无进展已 ${spec.patrol.noProgressMinutes} 分钟\``；`post_failure_streak` → `\`最近 ${spec.patrol.postFailureStreak} 次任务都失败了\``。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): three-level patrol escalation state machine"`

---

### Task 9：调度员主循环——`connectDispatcher`/`dispatcherTick`/`runDispatcherLoop`

**Files:**
- Create：`packages/core/src/commands/dispatcher/loop.ts`
- Create：`packages/core/test/commands/dispatcher/loop.test.ts`

**Interfaces:**
- Consumes：`mustTeamReady`（2A）、`resolveOwnHandle`（2A `commands/task/identity.ts`）、`loadTeamSpec`、`processBatch`（Task 6）、`advancePatrol`（Task 8）、`OrcaClient.{runUse,check}`（Task 1）
- Produces：
  ```ts
  export async function connectDispatcher(deps: CommandDeps, team: string): Promise<TeamRow>
  export interface TickResult { timedOut: boolean; messageCount: number }
  export async function dispatcherTick(deps: CommandDeps, team: TeamRow, spec: TeamSpec, timeoutMs?: number): Promise<TickResult>
  export async function runDispatcherLoop(deps: CommandDeps, team: string, opts?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>
  ```

- [ ] **Step 1：写失败测试**

```ts
test('connectDispatcher calls run-use with its own resolved handle and persists the returned coordinatorHandle', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-9', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  o.coordinatorHandleAfterRunUse = 'term-9'
  const team = await connectDispatcher(deps, 'duo')
  expect(o.runUseCalls).toEqual([{ id: 'run-1', from: 'term-9' }])
  expect(team.coordinatorHandle).toBe('term-9')
  expect(deps.registry.getTeam('duo')!.coordinatorHandle).toBe('term-9')
})
test('dispatcherTick with messages: processes then acks with the batch deliveryId', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.checkResults = [{ count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'worker_done', from: null, subject: null, body: null }] }]
  const r = await dispatcherTick(deps, deps.registry.getTeam('duo')!, SPEC)
  expect(r).toEqual({ timedOut: false, messageCount: 1 })
  expect(o.checkCalls[1]).toMatchObject({ ack: 'dlv-1' })
})
test('dispatcherTick on timeout: no ack call, patrol scan still runs', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.checkResults = [{ count: 0, deliveryId: null, replayed: false, timedOut: true, messages: [] }]
  const r = await dispatcherTick(deps, deps.registry.getTeam('duo')!, SPEC)
  expect(r).toEqual({ timedOut: true, messageCount: 0 })
  expect(o.checkCalls).toHaveLength(1)   // 只有取批次那一次调用，没有 ack 调用
})
test('dispatcherTick does not ack when processBatch reports a failure', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.failSendOnce = new Error('boom')
  o.checkResults = [{ count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'question', from: null, subject: null, body: 'x' }] }]
  await dispatcherTick(deps, deps.registry.getTeam('duo')!, SPEC)
  expect(o.checkCalls).toHaveLength(1)
})
test('runDispatcherLoop connects once, then ticks until the signal aborts', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o)
  o.terminals.push({ handle: 'term-9', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })
  const ac = new AbortController()
  o.checkResults = [{ count: 0, deliveryId: null, replayed: false, timedOut: true, messages: [] }]
  o.onCheck = () => { if (o.checkCalls.length >= 2) ac.abort() }
  await runDispatcherLoop(deps, 'duo', { signal: ac.signal })
  expect(o.runUseCalls).toHaveLength(1)
  expect(o.checkCalls.length).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `connectDispatcher`：`const team = mustTeamReady(deps, teamName)`；`const handle = await resolveOwnHandle(deps, postAddress('dispatcher', teamName))`；`const { coordinatorHandle } = await deps.orca.runUse({ id: team.runId!, from: handle })`；`deps.registry.upsertTeam({ ...team, coordinatorHandle })`；返回 `{ ...team, coordinatorHandle }`。`dispatcherTick`：`const handle = await resolveOwnHandle(deps, postAddress('dispatcher', team.name))`；`const batch = await deps.orca.check({ terminal: handle, run: team.runId!, wait: true, timeoutMs: timeoutMs ?? 300_000 })`；若 `batch.messages.length > 0`：`const ok = await processBatch(deps, team, spec, batch.messages)`；`ok && batch.deliveryId` 才调用 `deps.orca.check({ terminal: handle, run: team.runId!, ack: batch.deliveryId })`；无论如何都 `await advancePatrol(deps, team, spec)`；返回 `{ timedOut: batch.timedOut, messageCount: batch.messages.length }`。`runDispatcherLoop`：`const team = await connectDispatcher(deps, teamName)`；`const spec = loadTeamSpec(team.specPath)`；`while (!opts?.signal?.aborted) await dispatcherTick(deps, team, spec, opts?.timeoutMs)`。`FakeOrca.check` 补一个 `onCheck?: () => void` 钩子，在记录调用之后、返回结果之前调用（本任务顺带给 Task 1 的 `FakeOrca.check` 实现补这一行，不单独起任务）。
- [ ] **Step 4：运行确认通过。**
- [ ] **Step 5：提交** — `git commit -m "feat(core): dispatcher main loop (connect, tick, run)"`

---

### Task 10：CLI 接入——`wl dispatcher <sub>`

**Files:**
- Modify：`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`
- Modify：`packages/core/src/index.ts`（补导出 `commands/dispatcher/*`）
- Modify：`packages/cli/test/main.test.ts`

**Interfaces:**
- Consumes：Task 4、5、9 的全部命令函数

命令面：

```
wl dispatcher up <team> [--json]
wl dispatcher down <team> [--close] [--json]
wl dispatcher run <team>                         # 长期运行，无 --json（没有单次退出的"结果"可汇报）
wl dispatcher freeze <post@team> --reason <text> [--json]
wl dispatcher unfreeze <post@team> [--json]
```

- [ ] **Step 1：写失败测试**

```ts
test('wl dispatcher up --json prints the outcome', async () => { /* 注入假 commands.dispatcherUp，断言 stdout JSON 含 result.outcome */ })
test('wl dispatcher freeze requires --reason', async () => { /* commander 校验，退出码 1 */ })
test('wl dispatcher run never exits on its own (invokes commands.runDispatcherLoop and awaits it)', async () => {
  // 注入假 commands.runDispatcherLoop：返回一个立即 resolve 的 Promise，断言被调用时传入了正确的 team 参数
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：实现。** `Commands` 接口补 `dispatcherUp`/`dispatcherDown`/`runDispatcherLoop`/`freezePostCmd`/`unfreezePostCmd` 五个字段，`realCommands` 补对应导入（后两个从 `commands/dispatcher/freeze.ts` 导入时在 CLI 层重新导出为 `freeze`/`unfreeze` 字段名，保持 CLI 子命令名和字段名对齐）。仿照现有 `up`/`down` 写法注册四个带结果输出的子命令；`wl dispatcher run <team>` 单独处理：不接 `--json`，`action` 直接 `await commands.runDispatcherLoop(deps, team, {})`，异常时仍走统一的 `renderError`/`exitCodeOf`（正常情况下这个 promise 永不 resolve，进程靠 Orca `terminal close` 结束，不需要特殊退出路径）。`output.ts` 补 `renderDispatcherUp`/`renderDispatcherDown` 等渲染函数。`index.ts` 补导出。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS；`pnpm typecheck`。
- [ ] **Step 5：提交** — `git commit -m "feat(cli): wl dispatcher command surface"`

---

### Task 11：端到端集成测试

**Files:**
- Create：`packages/core/test/commands/dispatcher/flow.test.ts`

**Interfaces:**
- Consumes：Task 1–9 的全部产物（不新增接口）

- [ ] **Step 1：写失败测试**

```ts
test('full flow: dispatcher connects, acks a worker_done, then two consecutive failures freeze the post and block new tasks', async () => {
  const o = new FakeOrca()
  const { deps, registry } = mkDeps(o)
  const specPath = mkTeam(DUO_YAML_WITH_PATROL)   // patrol.post_failure_streak: 2，其余默认；builder self_claim+tags
  await up(deps, { specPath })
  registry.upsertPost({ ...registry.getPost('builder@duo')!, handle: 'term-1' })
  o.terminals.push({ handle: 'term-2', title: 'dispatcher@duo', connected: true, worktreeId: 'w', lastOutputAt: null })

  const team0 = await connectDispatcher(deps, 'duo')
  const spec = loadTeamSpec(specPath)

  // 一条 worker_done：tick 应该 ack 掉，不触发任何 send
  o.checkResults = [{ count: 1, deliveryId: 'dlv-1', replayed: false, timedOut: false, messages: [{ id: 'm1', type: 'worker_done', from: 'term-1', subject: 's', body: null }] }]
  await dispatcherTick(deps, team0, spec)
  expect(o.sent).toEqual([])

  // 两次连续失败的历史 dispatch + 一个当前 dispatched 任务，驱动两次巡查扫描直到冻结
  o.tasks.push(
    { id: 'c1', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x1', result: null, completedAt: '2026-10-13T09:00:00Z' },
    { id: 'c2', status: 'failed', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'x2', result: null, completedAt: '2026-10-13T09:10:00Z' },
    { id: 't9', status: 'dispatched', title: 'a', spec: 's', parentId: null, assigneeHandle: 'term-1', dispatchId: 'ctx-9', result: null, completedAt: null },
  )
  o.checkResults = [{ count: 0, deliveryId: null, replayed: false, timedOut: true, messages: [] }]
  await advancePatrol(deps, team0, spec)   // level 1：提示 builder
  await advancePatrol(deps, team0, spec)   // level 2：通知 lead + orchestration escalation
  await advancePatrol(deps, team0, spec)   // level 3：冻结
  expect(registry.isFrozen('builder@duo')).toBe(true)

  await expect(createTask(deps, { team: 'duo', title: 't', post: 'builder@duo' })).rejects.toMatchObject({ code: 'post_frozen' })
})
```

- [ ] **Step 2：运行确认失败。**
- [ ] **Step 3：** 本任务不写新的生产代码，只写测试；若失败，回到对应任务修正（不在本任务里改动除测试外的文件）。
- [ ] **Step 4：运行确认通过** — `pnpm test` 全仓库 PASS。
- [ ] **Step 5：提交** — `git commit -m "test: end-to-end phase 2B dispatcher and patrol flow"`

---

## 自检记录

- **spec 覆盖：** spec 第 2 节（命令）→ Task 4/5/9/10；第 3 节（主循环）→ Task 9；第 4 节（收件箱）→ Task 6；第 5 节（巡查信号）→ Task 7；第 5.3 节（`team.yaml` 新字段）→ Task 7 的补充 Step；第 6 节（三级升级）→ Task 8；第 7 节（冻结效果）→ Task 2/3；第 8 节（错误处理）→ Task 6/9（批处理失败不 ack，CallLog 已由 `OrcaRunner` 自动记录，无需本阶段新增代码）；第 9 节（测试分层）→ Task 1（契约）、Task 2/6/7/8（单元）、Task 11（集成）。
- **类型一致性：** `TeamRow`/`TeamSpec`/`CheckMessage`/`CheckResult`/`PatrolHit`/`PatrolStateRow`/`FrozenPostRow` 在定义任务与使用任务中签名一致（已核对 Task 1→6/7/9，Task 2→3/5/8 的消费点）。
- **Review Focus：** 5 条均已在对应任务里有专门测试（见上文 Review Focus 小节的任务标注）。
- **与 spec 的已知偏离/判断（均为实现判断，已在对应任务里注明理由）：** 一岗位同时命中两个信号时的优先级选择（Task 8，因为 `patrol_state` 的主键设计决定了一岗位只能追踪一个信号）；`worker_done` 的"每 10 条批量提醒牵头岗"被判定为纯 YAGNI 可选项，本计划不实现（Task 6，`processBatch` 对 `worker_done` 只 ack 不发送）；`check`/消息对象的部分字段名未经独立真机核实（见 Global Constraints，已标注发版前需补验证）。
