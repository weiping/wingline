# 阶段 3B 复审跟进小修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补上 2026-10-22 对 `2026-10-20-phase-3b-review-fixes.md` 复审发现的四处缺口：未预期异常不记日志、`console.json` 先删后关、`retryRequest` 不校验类型、3B spec 把 M-15 的三项缺口标成"已实现"。

**Architecture:** 只改 3B 已交付的文件，不动对外契约（错误码、状态码、响应结构不变；新增的 400 `invalid_param` 沿用 `checkParam` 现有语义）。日志落在唯一的错误出口 `respondError`；`retryRequest` 校验落在写路由的统一入口（`assertExactFields` 之后）；`console.json` 改在服务关闭之后删除。

**Tech Stack:** TypeScript、`node:http`、vitest（FakeOrca / `seedRunningTeam` / `createConsoleServer` 真实服务夹具）。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`（§9 第 204 行"未预期的异常返回 500 `internal`，记一行日志"；§7 页面表第 157、158、160 行）+ 复审报告 `docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md` 的 I-3、M-15。

> **状态（2026-10-23）：已实现。** 合并于 PR #9（`1743d13`，分支 `fix/phase-3b-review-followup`）。Task 1–4 的提交信息与本计划一致，依次为 `874447c`、`7a9d26c`、`f7c2008`、`b44d555`。Task 5 的“全分支复审”没有留下完成记录（PR #9 描述写的是“仍在进行”，合并前没有追加修复提交），该步骤保持未勾选；`pnpm typecheck` 与 `pnpm test`（107 个文件、1465 条通过、8 条按设计跳过）已在 2026-10-23 的 main 上复核通过。

## Global Constraints

- 错误响应格式不变：`{ ok: false, error: { kind, code, message, hint, retry?, retryRequest? } }`；input → 400、internal → 500。
- 日志只经 `deps.warn`，一行，不含请求体与 cookie（请求体可能含消息正文，cookie 是会话凭据）。
- 不新增依赖；函数 ≤ 50 行（`createConsoleServer` 现为 51 行，本计划不得再加长它）。
- 提交信息与 PR 描述不加任何署名尾注。
- 在分支 `fix/phase-3b-review-followup` 上工作；**不 push、不开 PR**——等用户批准。
- 不在本计划范围：已删团队的 SSE 连接刷屏、`commandLine` POSIX 引号规则、Windows console 提示文案、偏弱的旧测试、M-15 三项前端功能的实现（本计划只把 spec 状态改准，功能另立任务）。

## Review Focus

1. **一个普通的输入错误（400）不该刷日志**：只有非 `WinglineError` 或 `kind === 'internal'` 才记——Task 1 测试。
2. **响应头已发出后才出错（SSE 中途）**：仍然记一行，且连接被销毁而不是写第二个响应——Task 1 测试。
3. **`retryRequest` 是数字、对象、空串或超长串**：400 `invalid_param`，命令一次都没被调用——Task 2 表驱动测试（覆盖全部写路由）。
4. **控制台收到 SIGINT 时另一个 `wl console --link` 正好来读**：要么读到仍可用的服务，要么读不到文件，绝不读到指向已关闭服务的文件——Task 3 测试以顺序断言保证。
5. **合法的 `retryRequest`（UUID、Orca 的 `req-1` 形式）照常通过**——Task 2 测试。

---

## File Structure

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/server/index.ts` | Task 1：`respondError` 加 `warn` 参数，三个调用点传入 |
| `packages/core/src/server/http.ts` | Task 2：`PARAM_RULES.retryRequest` |
| `packages/core/src/server/api-write.ts` | Task 2：统一入口校验 `retryRequest` |
| `packages/cli/src/console.ts` | Task 3：`stop` 改为先 `close` 后删文件 |
| `docs/superpowers/specs/2026-10-16-phase-3b-console-design.md` | Task 4：状态行与页面表注明 M-15 缺口 |

---

### Task 1: 未预期的异常记一行日志（spec §9）

**Files:**
- Modify: `packages/core/src/server/index.ts:67-74`（`respondError`）及其三处调用（约 216、265、384 行）
- Test: `packages/core/test/server/server.test.ts`

**Interfaces:**
- Produces: `function respondError(res: http.ServerResponse, err: unknown, warn: (msg: string) => void, where: string): void`。`where` 为 `` `${req.method} ${url.pathname}` ``。当 `!(err instanceof WinglineError) || err.kind === 'internal'` 时调用一次 `warn`，内容为 `` `请求 ${where} 出错：${err instanceof Error ? err.stack ?? err.message : String(err)}` ``；其余错误不记。记日志与 `res.destroyed`/`headersSent` 分支无关（先记再决定写响应还是 destroy）。

- [x] **Step 1: 写失败测试**
  - `an unexpected error in a write route is answered 500 internal and logged once with method and path`：用 `createConsoleServer` 起服务，`o.taskCreate` 被替换成 `async () => { throw new TypeError('boom') }`；登录后 `POST /api/teams/duo/tasks` `{ title: 't' }` → 500，`error.kind === 'internal'`；`warnings.filter(w => w.includes('POST /api/teams/duo/tasks') && w.includes('boom'))` 长度为 1。
  - `an input error (400) is not logged`：`POST /api/teams/duo/send` 带未知字段 → 400；`warnings` 中无 `/api/teams/duo/send`。
- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/server/server.test.ts`，预期第一条 FAIL（warnings 为空），第二条已 PASS。
- [x] **Step 3: 实现** — 按 Interfaces 改 `respondError`；三处调用传入作用域里 `CommandDeps` 的 `warn` 与 `where`。
- [x] **Step 4: 运行通过** — `pnpm vitest run packages/core/test/server`，全部 PASS。
- [x] **Step 5: 提交** — `git commit -m "fix(server): 未预期的异常记一行日志（spec §9）"`

### Task 2: `retryRequest` 校验类型与格式

**Files:**
- Modify: `packages/core/src/server/http.ts:7-13`、`packages/core/src/server/api-write.ts`（统一入口，`assertExactFields(ctx.body, spec.fields)` 之后，约 233 行）
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- Produces: `PARAM_RULES.retryRequest = /^[A-Za-z0-9._:-]{1,128}$/`；统一入口在 `ctx.body.retryRequest !== undefined` 时调用 `checkParam('retryRequest', ctx.body.retryRequest)`。

- [x] **Step 1: 写失败测试**（沿用文件里遍历 `WRITE_ROUTES` 的样本）
  - `test.each(WRITE_ROUTES)('%s rejects a malformed retryRequest before calling the command')`：对每条路由，分别以 `123`、`{}`、`''`、`'a b'`、`'x'.repeat(129)` 作为 `retryRequest` → `rejects.toMatchObject({ code: 'invalid_param' })`，且对应命令的调用计数为 0。
  - `a UUID and an Orca-style id are accepted`：`retryRequest` 为 `randomUUID()` 与 `'req-1'` 时不抛 `invalid_param`。
- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/server/api-write.test.ts`，预期非法值用例 FAIL。
- [x] **Step 3: 实现** — 按 Interfaces。
- [x] **Step 4: 运行通过** — `pnpm vitest run packages/core/test/server packages/web`（web 的"按原样重试"用例用的是 `rq-7` 形式，须仍通过）。
- [x] **Step 5: 提交** — `git commit -m "fix(server): retryRequest 校验类型与格式"`

### Task 3: `console.json` 在服务关闭之后再删（I-3 残余窗口）

**Files:**
- Modify: `packages/cli/src/console.ts:102-108`（`foreground` 的 `stop`）
- Test: `packages/cli/test/console.test.ts`

**Interfaces:**
- Consumes: `removeConsoleFileIfMine(home, pid)`、`srv.close(): Promise<void>`（均已有）。
- Produces: `export async function stopServer(srv: { close(): Promise<void> }, cleanup: () => void): Promise<void>`（console.ts）：`await srv.close()`，`finally` 里调用 `cleanup()`。`foreground` 的 `stop` 改为 `void stopServer(srv, () => removeConsoleFileIfMine(deps.home, process.pid)).then(resolve)`。

- [x] **Step 1: 写失败测试**
  - `stopServer removes console.json only after close has finished`：假 `srv.close` 内记录 `cleanedDuringClose = cleaned`（`cleanup` 置 `cleaned = true`）；断言 `cleanedDuringClose === false` 且结束后 `cleaned === true`。
  - `stopServer still cleans up when close rejects`：`close` 抛错 → `stopServer` 也 reject，但 `cleaned === true`。
  - 旧的前台用例（`console.json` 写失败只警告、SIGINT 后返回 `started`）须仍通过。
- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/cli/test/console.test.ts`。
- [x] **Step 3: 实现** — 按 Interfaces。
- [x] **Step 4: 运行通过** — 同上。
- [x] **Step 5: 提交** — `git commit -m "fix(console): 服务关闭后再删 console.json"`

### Task 4: 3B spec 注明 M-15 的三项缺口

**Files:** Modify `docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`（第 4 行状态、第 157/158/160 行页面表）

- [x] **Step 1:** 状态行改为"**已实现（有三项页面缺口，见第 7 节标注）**"。页面表三处在对应文字后加"（未实现，见复审 M-15）"：任务看板的"卡住原因角标"（目前只在"只看卡住的"视图里显示，分列卡片上没有）、任务详情的"gate 输出文件路径"、时间线的"时间范围"筛选。
- [x] **Step 2:** `grep -n "M-15" docs/superpowers/specs/2026-10-16-phase-3b-console-design.md` 应有 3 处页面表标注。
- [x] **Step 3:** `git commit -m "docs(3b): 注明 M-15 三项页面缺口，状态不再写成全部实现"`

### Task 5: 收尾

- [x] **Step 1:** `pnpm test && pnpm typecheck` 全绿。
- [ ] **Step 2:** 全分支复审（`superpowers:requesting-code-review`，范围 `main..HEAD`），处理 Critical/Important。（无完成记录，见顶部状态）
- [x] **Step 3:** 本计划逐条打勾，停在本地分支，询问用户是否 push 开 PR。（用户批准后已 push，合并为 PR #9）
