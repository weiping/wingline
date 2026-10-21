# 阶段 2/3 复审修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-10-21 阶段 2/3 复审的 6 条 Important、Windows CI 偶发超时与 4 条低成本 Minor，并把 spec 漂移与 3C/3D 计划失效点写回文档。

**Architecture:** 只改已交付文件，不动对外契约（错误码、退出码、路由、响应结构不变；`error.retryRequest` 字段本来就在 3B 契约里，这次是让 core 真正填上它）。安全修复落在唯一的清洗函数 `sanitizeQuote`；重试契约落在 ledger 的唯一不确定出口 `markUncertain`；restore 的"假 kept"在 `restorePost` 的 kept 分支前拦截。

**Tech Stack:** TypeScript、vitest（FakeOrca、`seed`/`mkDeps`/`seedRunningTeam` 夹具）、Preact（web 测试用 `test/helpers.tsx`）。

**Spec:** 复审结论（本会话，两份子报告）+ `docs/superpowers/specs/2026-10-13-phase-2a-task-workflow-design.md` §5.2/§7.4、`2026-10-13-phase-2b-dispatcher-patrol-design.md` §4.1、`2026-10-16-phase-3a-restore-timeline-design.md` §5.2/§5.6/§5.7、`2026-10-16-phase-3b-console-design.md` §2.4/§6.4/§7。

## Global Constraints

- 2A §7.4：插进通知的外来文本把 `` ` `` `$` `;` `|` `&` `<` `>` `\` 换成全角对应字符（`｀＄；｜＆＜＞＼`）；通知里 wl 自己写的命令提示（如 `--body "<回答>"`）不中和。
- 2A §5.2：`wl up` 绝不把协调者身份从一个存活的终端上拿走。
- 3B 错误体：`{ ok: false, error: { kind, code, message, hint, retry?, retryRequest? } }`；`retryRequest` 只在"原样重发同一 id 是安全且必要的"不确定结果上出现。
- 3A §5.6：`--dry-run` 不写注册表、不做任何 Orca 写调用。
- 函数 ≤ 50 行；不新增依赖。
- 提交信息与 PR 描述不加任何署名尾注。
- 在分支 `fix/phase-2-3-review` 上工作；**不 push、不开 PR**——等用户批准。
- 不在本计划范围：3D 远端会话判定的重新设计（需要新探针，见 Task 8 记为阻塞项）、复审其余 Minor（团队隔离、请求体类型校验、Origin 绑定 Host、openTab 吞错、`--json` 前台链接、岗位预览剥会话标记、写方法白名单、`fetchTasks` 重复调用、忙碌判断依赖英文、shell 信号）。

## Review Focus

1. **worker 原话里同时出现 `$(…)`、反引号、`;`、`|` 与换行**：转述后整行无任何 ASCII 元字符、仍是单行——Task 1 测试。
2. **`--adopt-run` 指定的 Run 协调者是正在跑的调度员**：协调者不变，`run-use` 不被调用——Task 2 测试；协调者已死则照旧认领。
3. **控制台在 FakeOrca 超时下创建任务**：响应带 `retryRequest`，带它重发不产生第二个 `task-create`——Task 3 走真实 core 的服务端测试。
4. **接回时终端一直不空闲，用户照提示重跑**：第二次不是 `kept`、不报退出码 0，而是重新等待并在成功后补发接回提示——Task 4 测试改写。
5. **SSE 断线 5 秒后重连**：时间线页补齐断线期间的事件——Task 5 web 测试；增量读超过 1000 行不跳行——Task 5 registry 测试。

---

## File Structure

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/commands/dispatcher/inbox.ts` | Task 1：`sanitizeQuote` 追加全角替换 |
| `packages/core/src/commands/task/notify.ts` | Task 1：导出 `shellSafe(text)`，`neutralize` 复用它 |
| `packages/core/src/commands/up.ts` | Task 2：`adoptRun` 走 `adoptDiscovered` |
| `packages/core/src/commands/task/ledger.ts`、`commands/send.ts`、`commands/task/create.ts` | Task 3：不确定错误带 `detail.retryRequest` |
| `packages/core/src/commands/restore/posts.ts` | Task 4：dry-run 不写库；未定案的接回不判 kept |
| `packages/core/src/registry/registry.ts` | Task 5：带 `afterId` 的增量读改升序 |
| `packages/web/src/stream.tsx`、`pages/Timeline.tsx` | Task 5：重连计数 + 时间线重取 |
| `packages/core/src/commands/dispatcher/advance.ts`、`lifecycle.ts` | Task 6：Minor 3/4 |
| `packages/core/src/server/sse.ts`、`cli/src/console.ts`、`cli/src/cli.ts` | Task 6：新订阅者快照、`console.json` 兜底、`wl log` 参数校验 |
| `packages/core/test/commands/dispatcher/flow.test.ts` | Task 7：单测超时 |
| `docs/superpowers/specs/*`、`docs/superpowers/plans/*` | Task 8：spec 漂移与 3C/3D 失效点 |

---

### Task 1: 转述的 worker 原话中和 shell 元字符

**Files:**
- Modify: `packages/core/src/commands/task/notify.ts:40-50`
- Modify: `packages/core/src/commands/dispatcher/inbox.ts:13-18`
- Test: `packages/core/test/commands/dispatcher/inbox.review.test.ts`

**Interfaces:**
- Produces: `export function shellSafe(text: string): string`（notify.ts，只做全角替换）。`sanitizeQuote(text, limit)` 签名不变，输出不再含 ASCII 元字符；`advance.ts` 的 `waiting_answer` 通知经它自动受益。

- [ ] **Step 1: 写失败测试**

```ts
test('sanitizeQuote neutralizes shell metacharacters (2A §7.4)', () => {
  expect(sanitizeQuote('run $(rm -rf ~); echo `id` | sh & <x> \\', 100)).toBe('run ＄(rm -rf ~)； echo ｀id｀ ｜ sh ＆ ＜x＞ ＼')
})
test('relayText: quoted body and options carry no ASCII metachar, the reply hint keeps its <回答>', () => {
  const t = relayText({ team: 'duo', asker: 'builder@duo', messageId: 'm1', body: 'a;b$(c)', options: ['x|y'], verb: '提问' })
  const quoted = t.slice(t.indexOf('「'), t.indexOf('。全文'))
  expect(quoted).not.toMatch(/[`$;|&<>\\]/)
  expect(t).toContain('--body "<回答>"')
})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/dispatcher/inbox.review.test.ts`，预期两条 FAIL。
- [ ] **Step 3: 实现** — notify.ts 抽出 `shellSafe`（`FULL_WIDTH` 替换），`neutralize` 改为调用它；`sanitizeQuote` 在压平空白后、截断前调用 `shellSafe`（先替换再截断，保证截断按全角字符计数）。
- [ ] **Step 4: 运行通过** — 同上命令 + `pnpm vitest run packages/core/test/commands/dispatcher`，全部 PASS（既有 `sanitizeQuote` 用例不含元字符，不受影响）。
- [ ] **Step 5: 提交** — `git commit -m "fix(dispatcher): 转述的 worker 原话中和 shell 元字符"`

### Task 2: `--adopt-run` 不抢存活调度员的协调者身份

**Files:**
- Modify: `packages/core/src/commands/up.ts:158-162`
- Test: `packages/core/test/commands/up.test.ts`（在 `two candidate Runs …` 用例附近）

**Interfaces:**
- Consumes: `adoptDiscovered(l, found: { id; coordinatorHandle }, leadHandle)`（已有）、`orca.runList()`（返回 `{ id, objective, coordinatorHandle, createdAt }[]`）。
- Produces: `adoptRun` 签名不变。

- [ ] **Step 1: 写失败测试**

```ts
test('--adopt-run keeps a live coordinator: no run-use, coordinator unchanged', async () => {
  // runList 里 run-9 的 coordinatorHandle 是 term-dsp，且 term-dsp 在 terminals 里 connected
  const r = await up(deps, { specPath: p, adoptRun: 'run-9' })
  expect(r.run).toEqual({ outcome: 'adopted', runId: 'run-9' })
  expect(o.calls).not.toContain('runUse')
  expect(registry.getTeam('duo')!.coordinatorHandle).toBe('term-dsp')
})
test('--adopt-run with a dead coordinator still reclaims for the lead', async () => { /* coordinatorHandle 指向不存在的终端 → runUse 被调用，协调者 = lead */ })
```

- [ ] **Step 2: 运行确认失败**（第一条：`runUse` 被调用）。
- [ ] **Step 3: 实现** — `adoptRun`：在 `runList()` 里按 id 找；找到 → `adoptDiscovered(l, found, leadHandle)`；找不到 → 保留现有 `runUse` 调用（让 Orca 抛 `run_not_found`，保住 `--adopt-run with an id Orca does not know → failed, nothing written` 用例）。
- [ ] **Step 4: 运行通过** — `pnpm vitest run packages/core/test/commands/up`。
- [ ] **Step 5: 提交** — `git commit -m "fix(up): --adopt-run 不抢存活协调者"`

### Task 3: 不确定错误带上 `detail.retryRequest`

**Files:**
- Modify: `packages/core/src/commands/task/ledger.ts:52-61`（`uncertainError`、`markUncertain`）
- Modify: `packages/core/src/commands/send.ts:62-66`
- Modify: `packages/core/src/commands/task/create.ts:68-74`（`afterCreateError`）
- Test: `packages/core/test/commands/task/ledger.test.ts`、`packages/core/test/server/api-write.real.test.ts`（新建）

**Interfaces:**
- Produces: `uncertainError(err, hint, retryRequest?: string)`；`markUncertain` 从 `storedRow(x.deps, x.c.key).retryRequest` 取 id 传入。`settleFailure` 中 `completed/absent` 分支（行已丢弃、"原样重跑即可"）**不**带 retryRequest。`send_unconfirmed` 带 `detail: { retryRequest: result.requestId }`（`requestId` 为空则不带）。`afterCreateError` 带 `detail: { retryRequest: id }`。

- [ ] **Step 1: 写失败测试**
  - ledger：`transport error + request-show pending → uncertain error has detail.retryRequest equal to the row's id`。
  - 服务端（真实 `createTask`，不用模拟命令）：FakeOrca 让 `taskCreate` 抛传输错误且 `requestShow` 返回 `pending` → `POST /api/teams/duo/tasks` 得 504，`error.retryRequest` 非空；再令 `requestShow` → `completed`、带该 `retryRequest` 重发 → 200，`o.calls.filter(c => c === 'taskCreate').length` 等于首发 + 一次重放（同 id），Orca 里只有一个任务。
  - send：`terminalSend` 未确认 → `error.detail.retryRequest === result.requestId`。
- [ ] **Step 2: 运行确认失败**（`retryRequest` 为 undefined）。
- [ ] **Step 3: 实现** — 按 Interfaces 改三处；服务端 `errorEnvelope` 不动。
- [ ] **Step 4: 运行通过** — `pnpm vitest run packages/core/test/commands/task packages/core/test/server packages/core/test/commands/send`。
- [ ] **Step 5: 提交** — `git commit -m "fix(core): 不确定结果在 detail 带 retryRequest，控制台重试走得通"`

### Task 4: restore 不把未定案的接回报成 kept；dry-run 不写库

**Files:**
- Modify: `packages/core/src/commands/restore/posts.ts:58-63`、`:97-135`
- Test: `packages/core/test/commands/restore/posts.test.ts:29`（改名）、`:101-112`（改期望）

**Interfaces:**
- Produces（posts.ts 内部）：
  - `pendingResume(reg: Registry, team: string, post: string, handle: string): { gen: number } | null` — 取最后一个 `create` 为 `done` 的代 `g`（即 `restoreGen(...) - 1`，<0 返回 null）；该行 receipt 解析出的 `handle` 等于传入 handle、且本代 `notice` 不是 `done`、且（`wait` 不是 `done` 或屏幕检查曾跳过——以 `wait` 行判断即可）时返回 `{ gen: g }`。
  - `settleResume(l, address, handle, sessionId, rid): Promise<RestorePost>` — 从现有 resumed 分支抽出"wait → setSessionId → screenGuard → notice → live"这一段，kept 补救路径与首发路径共用。
  - `setSessionId` 移到 `create` 成功之后（会话已经用恢复命令拉起，缓存即成立）。

- [ ] **Step 1: 改写测试**
  - `:29` 改名为 `a live post is kept with no Orca writes and no request rows`（断言不变）。
  - 新增 `dry run on a live post writes nothing`：`seed(..., { handle: 'term-stale', status: 'uncertain' })` + 终端 connected → dry-run 结果 `kept`，之后 `getPost` 的 handle 仍是 `term-stale`、status 仍是 `uncertain`。
  - `:101-112` 改为：第一次 `uncertain`；令 `s.o.waitSatisfied = true` 后重跑 → `outcome: 'resumed'`、`sessionId: 's1'`、`s.o.sent` 含 `重启后已接回本会话`、`s.o.created.length === 1`；另一条：`waitSatisfied` 仍为 false 时重跑 → `uncertain`（不是 `kept`），`created.length === 1`。
- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/restore`。
- [ ] **Step 3: 实现** — kept 分支：`o.dryRun` 时直接返回 `{ address, outcome: 'kept' }` 不写库；否则先 `pendingResume`，命中则 `settleResume(…, row.sessionId!)`，未命中照旧写 handle/status 返回 kept。`restoreGen` 的 `_located` 参数注释同步更新。
- [ ] **Step 4: 运行通过** — 同上 + `pnpm vitest run packages/core/test/commands/restore packages/cli`（CLI 的 restore 退出码用例）。
- [ ] **Step 5: 提交** — `git commit -m "fix(restore): 未定案的接回重跑时补完而非判 kept；dry-run 不写库"`

### Task 5: 时间线不丢事件

**Files:**
- Modify: `packages/core/src/registry/registry.ts:752-790`（三个 `list*` 方法）
- Modify: `packages/web/src/stream.tsx`（`StreamValue` 加 `connection: number`）、`packages/web/src/pages/Timeline.tsx`
- Test: `packages/core/test/registry/registry.test.ts`（或现有 timeline 测试文件）、`packages/web/test/dialog-stream.test.tsx`

**Interfaces:**
- Produces：`list*({ afterId })` 带 `afterId > 0` 时 `ORDER BY id ASC LIMIT ?`（取游标后最早的 limit 条），不带时维持"最新 limit 条、升序返回"。`StreamValue.connection`：每次 `onopen` 加 1（首连为 1）。
- Timeline：`connection > 1` 变化时调用 `log.reload()` 并清空 `live`（重取结果已含断线期间事件）。

- [ ] **Step 1: 写失败测试**
  - registry：写 1500 条 audit，`listAudit(team, { afterId: 0, limit: 1000 })` 取最新 1000；`listAudit(team, { afterId: 100, limit: 1000 })` 第一条 id 为 101、最后一条为 1100。patrol/task_log 同。
  - web：mock EventSource 触发 `onerror` → 推进 5 秒 → `onopen`，断言 `/log` 被 GET 两次。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现** — registry 三处改 SQL 分支；stream.tsx 用 `useState` 计数并经 `useEventStream` 回调上报；Timeline 加 `useEffect([connection])`。
- [ ] **Step 4: 运行通过** — `pnpm vitest run packages/core/test/registry packages/core/test/server packages/web`（SSE 轮询依赖 afterId 语义，server 测试一并跑）。
- [ ] **Step 5: 提交** — `git commit -m "fix(timeline): 增量读按游标升序；断线重连后时间线重取"`

### Task 6: 低成本 Minor 一批

**Files / 期望行为（每条一个测试，同一提交）：**
- `dispatcher/advance.ts:105-106`：level-1 recover 步主人不在 → 直接写 `level: 2` 并发 level-2 通知；测试：连续两轮只发一次该通知。
- `dispatcher/lifecycle.ts:133-134`：`already_gone` 分支调用 `clearDeadLock`；测试：之后 `wl ps` 的调度员状态不是"失联"。
- `server/sse.ts:147`：新订阅者加入已有轮询循环时立即单独推一次当前快照；测试：第二个订阅者在无数据变化时也收到 `snapshot`。
- `cli/src/console.ts:94`：写 `console.json` 失败 → `warn` 一行、服务照常；测试：只读目录下 `wl console` 仍返回 ready。
- `cli/src/cli.ts`（`wl log`）：`--limit` 非正整数、`--source` 不在 `task|patrol|command` → input 错误、退出码 1；测试各一条。

- [ ] **Step 1: 写 5 条失败测试** → **Step 2: 确认失败** → **Step 3: 实现** → **Step 4:** `pnpm vitest run` 全绿 → **Step 5:** `git commit -m "fix: 复审 Minor——重复通知、死锁行、新订阅者快照、console.json 兜底、wl log 参数校验"`

### Task 7: Windows CI 偶发超时

**Files:** Modify `packages/core/test/commands/dispatcher/flow.test.ts:27`

- [ ] **Step 1:** 给该 `test(...)` 加第三个参数 `60_000`，行内注释：Windows Node 24 上实测 40 s（CI run 39444377212），全局 20 s 不够；只放宽这一条。
- [ ] **Step 2:** `pnpm vitest run packages/core/test/commands/dispatcher/flow.test.ts` PASS。
- [ ] **Step 3:** `git commit -m "test(dispatcher): 端到端用例在 Windows 上放宽到 60 秒"`

### Task 8: 文档——spec 漂移与 3C/3D 计划失效点

**Files:** 下表所列 spec/plan；不改代码。

| 文档 | 改动 |
| --- | --- |
| 2A spec §5.2 表 | 加 `--adopt-run`（按 Task 2 行为）与 `--new-run`（协调者成为 lead）两行 |
| 2A spec §8 状态图 | `escalate` 注明终态需 `--reopen` |
| 2A spec §13 | 注明 `wl ps` 显示固定 `path:` worktree（release notes F-4） |
| 2B spec §4.1 | 清洗规则引用 2A §7.4 的全角中和 |
| 路线图 §5.1–5.3 | 各加一行"以阶段 spec 为准"的指针 |
| 3A spec §5.2/§5.7 | 终端连着但本代接回未定案 → 补完而非 kept；引用 REPORT 第 152 行（只重启 orca-serve 时 claude 被重拉、上下文丢失却判 kept）列为已知限制 |
| 3B spec §2.4/§7 | 写明 core 在 `detail.retryRequest` 提供 id；§6.4 写明断线补齐靠页面重取 `/log` |
| 3A plan Task 10 Step 3 | 加注：真机用例以关闭终端模拟，Orca 完整重启未验证 |
| 3B review-fixes plan Task 8 Step 4 | 勾选旁注"实际已推送并合并（用户批准）" |
| 3C spec/plan | 路由三处登记（`WRITE_ROUTES`/`WriteCommands`/`CONSOLE_AUDIT`）；`server/routes.ts` 改为实际文件名；worktree 选择器解析（去 `path:` 前缀或 `worktreeShow`，每轮缓存）；新建 `AttentionReport.warnings` 及其四处消费方；YAML 上限降到 48 KB；TUI 复用 `consoleCommands()`；`postWorkspaceStatus` 需额外查 verdict |
| 3D spec/plan | **阻塞项**：远端会话判定待探针确认 `--environment` 命中是否给 snippet，未确认前只支持 `--session` 手工指定；`context_low` 去重键用标记哈希；autostart 用绝对路径的 `selfCommand` 变体；`RestoreArgs.as` 承接 `--actor autostart`；Review Focus 5 改为团队锁立即失败、`--all` 逐团队兜底换算退出码 1；§9 路径改 `restore/` 目录；Task 5–6 不依赖 3C，可先做 |

- [ ] **Step 1:** 按表逐条改；每份文档改完 `grep` 一遍旧说法确认无残留。
- [ ] **Step 2:** `git commit -m "docs: 阶段 2/3 复审——spec 漂移与 3C/3D 计划失效点"`

### Task 9: 收尾

- [ ] **Step 1:** `pnpm test && pnpm typecheck` 全绿；`pnpm build && pnpm test:e2e`（本机无 Chromium 则如实注明，交给 CI）。
- [ ] **Step 2:** 派一个全分支复审（`superpowers:requesting-code-review`，范围 `main..HEAD`），处理其 Critical/Important。
- [ ] **Step 3:** 本计划逐条打勾，停在本地分支，询问用户是否 push 开 PR。
