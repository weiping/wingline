# 阶段 3B：本地 HTTP API 与控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wl console` 在 127.0.0.1 上提供带登录与 CSRF 保护的 HTTP API + SSE，以及 Preact 控制台的 6 个页面（总览、收件箱、任务看板、任务详情、岗位详情、时间线），`wl console --open` 在 Orca 内打开。

**Architecture:** 服务端只用 `node:http`，位于 `packages/core/src/server/`；读接口复用 core 的查询命令，写接口一律经 3A 的 `auditedCommands`（前缀 `console:`）。Orca 只读调用经 `core/src/view/snapshot.ts` 的 `cachedOrca` 装饰器缓存 5 秒，core 函数内部的调用也一并命中。SSE 复用 3A 的 `readTimelineAfter` 游标。前端是私有工作区包 `packages/web`，Vite 构建到 `packages/cli/dist/web/` 随包发布。

**Tech Stack:** TypeScript、`node:http`/`node:crypto`、Preact + Vite（仅构建时）、vitest + @testing-library/preact + jsdom、Playwright（仅 CI 冒烟）。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`（下称 spec）；依赖 3A 的 plan 已完成（`auditedCommands`、`readTimeline`/`readTimelineAfter`、`TimelineEvent`、`audit_events`）。

> **状态（2026-10-20）：已实现。** 合并于 PR #6（`bccd3db`），随后经 `docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md` 复审并修复，合并于 PR #7（`0284a16`）；2026-10-22 的复审跟进合并于 PR #9（`1743d13`，见 `docs/superpowers/plans/2026-10-22-phase-3b-review-followup.md`）。复审各项的处置见该报告末尾。
>
> **实际提交与本计划 Step 5 的提交信息对照**（实现时把部分前端任务合并成两个提交，且按项目惯例未加署名尾注）：
> - Task 9+10+11+12（前端）→ 实际为 `41f5ecb feat(web): console app with api client, layout and six pages`（四个前端任务合并为一个提交）；
> - Task 13（e2e/CI/文档）→ 实际为 `37798b8 test(e2e): console smoke — login, answer a question, see the audit event` + `161fe5b docs: console section in README; ci e2e job; manual console live check`；
> - 复审修复见 `docs/superpowers/plans/2026-10-20-phase-3b-review-fixes.md`。
>
> 复审另外修掉了 `main` 上既存的 Windows CI 红灯（`54aa5fc`、`254a90f`），不属于本计划的 Task 范围。

## Global Constraints

- `wingline` 包的 `dependencies` 不变；前端依赖只进 `packages/web` 的依赖与开发依赖（`preact`；`vite`、`@preact/preset-vite`、`@testing-library/preact`、`jsdom`），Playwright 只进根目录开发依赖。
- 只绑定 `127.0.0.1`，没有绑定其他地址的选项。
- 一次性登录 token：32 字节随机数（base64url），单次有效，5 分钟过期，内存中只存哈希。会话 cookie `wl_sid`：`HttpOnly; SameSite=Strict; Path=/`，有效 12 小时，只在内存中。
- 写请求：有效会话 + `X-Wingline-Token` 等于会话的 CSRF token + `Origin` 为 `http://127.0.0.1:<port>`（或与 Host 一致的 `http://localhost:<port>`）+ `Content-Type: application/json` + 请求体 ≤ 64 KB；否则 403（体积超限 413 `body_too_large`）。
- 所有请求 `Host` 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`，否则 421。
- 响应头：`Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'`；`X-Content-Type-Options: nosniff`；`Referrer-Policy: no-referrer`；`Cache-Control: no-store`（带内容哈希的静态文件除外）。
- 状态码：`input` 400、`orca` 502、`uncertain` 504、`internal` 500、未登录 401、校验失败 403、Host 不符 421、无路由 404、冲突 409（3C 用）。
- 响应格式与 CLI `--json` 相同：`{ ok: true, result }` / `{ ok: false, error: { kind, code, message, hint, retry?, retryRequest? } }`。
- Orca 只读调用经 `cachedOrca` 装饰器缓存 5 秒（`taskList`、`terminalList`、`terminalShow`、`workerList`、`runShow`）；写方法透传并作废全部缓存；服务端传给 core 函数的 `deps.orca` 一律是装饰后的客户端。
- SSE：`timeline` 每 2 秒、`snapshot` 每 5 秒（仅哈希变化时推送）、心跳注释 `: ping` 每 15 秒；事件 id `<来源>:<表内 id>`。
- `console.json`：`{ pid, port, startedAt, controlKey }`，权限 0600；`--open` 等待服务就绪每 200 毫秒一次、最多 10 秒。
- 新错误码：`console_port_in_use`（1）、`console_not_running`（1）、`console_no_worktree`（1）、`console_start_unconfirmed`（3）、`console_tab_unsupported`（提示，0）、`invalid_param`（400）、`unknown_field`（400）、`body_too_large`（413）。
- 页面从不自动重试写操作；终端预览与外部文本按纯文本渲染，服务端剥除 ANSI 控制序列。
- 函数 ≤ 50 行；提交信息末尾附 3A plan 中的两行署名。

## Review Focus

1. **登录链接被打开两次**（比如 Orca 预取或用户刷新）：第二次看到“链接已失效，请运行 wl console --link”，而不是 500 或空白页；已登录的会话不受影响。测试归 Task 3。
2. **页面开着时服务重启**：SSE 断开后页面显示“重连中”，重连得到 401 时提示用 `wl console --link`，不陷入无限快速重连（`EventSource` 的错误时退避至少 5 秒）。测试归 Task 10。
3. **团队名或岗位名含大写或 `..`**：返回 400 `invalid_param`，不会拼进文件路径或注册表查询。测试归 Task 5。
4. **同时打开 5 个页面**：每个团队每 5 秒最多一次 `task-list` 与一次 `terminal list`。测试归 Task 2（快照）与 Task 7（SSE 共用循环）。
5. **`console.json` 指向的 pid 已被别的进程复用**：`--link` 连接端口失败或控制密钥被拒时视为没有服务（`console_not_running` 或重新启动），而不是挂起。测试归 Task 8。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `spikes/console-tab.ts`（新） | Orca 内置浏览器打开本地页面的探针 |
| `packages/core/src/view/snapshot.ts`（新） | `cachedOrca`：缓存只读方法的 OrcaClient 装饰器（3C 的 TUI 复用） |
| `packages/core/src/view/plain-text.ts`（新） | 剥除 ANSI 与控制字符 |
| `packages/core/src/server/auth.ts`（新） | token、会话、CSRF、Host/Origin/Content-Type 校验 |
| `packages/core/src/server/static.ts`（新） | 静态资源、SPA 回退、安全响应头 |
| `packages/core/src/server/http.ts`（新） | 路由器、参数校验、响应封装、错误到状态码 |
| `packages/core/src/server/api-read.ts`（新） | 读接口 |
| `packages/core/src/server/api-write.ts`（新） | 写接口 |
| `packages/core/src/server/sse.ts`（新） | 按团队的读取循环与订阅 |
| `packages/core/src/server/control.ts`（新） | `console.json` 与 `/_control/link` |
| `packages/core/src/server/index.ts`（新） | `createConsoleServer` 组装 |
| `packages/cli/src/console.ts`（新） | `wl console` 命令（单实例、`--link`、`--open`） |
| `packages/web/`（新） | Preact 应用：`src/api.ts`、`src/router.ts`、`src/components/*`、`src/pages/*` |
| 根 `package.json`、`vitest.config.ts`、`tsconfig.typecheck.json`、`.github/workflows/ci.yml` | 构建、测试与 CI 接入 |

---

### Task 1: 控制台标签页探针

**Files:**
- Create: `spikes/console-tab.ts`
- Modify: `spikes/REPORT.md`、`test/fixtures/receipts/tab-create.json`（新，成立时）

**Interfaces:**
- Produces: REPORT 中的结论——打开 URL 的实际命令与参数（例如 `orca tab create --url <url> --json`）、内置浏览器对 `HttpOnly`/`SameSite=Strict` cookie 与 `EventSource` 的支持情况；成立时脱敏回执 `tab-create.json`（供 Task 8 的契约测试）。

> 需要真机上运行中的 Orca。沙箱里无法完成时写好脚本并报告 NEEDS_CONTEXT，由控制方交给人运行；Task 2–13 不依赖结论（Task 8 的 `openTab` 默认返回“不支持”）。

- [x] **Step 1: 写探针**：起一个 `node:http` 小服务（`/set` 写 cookie、`/check` 回显 cookie、`/events` 每秒推一条 SSE），用 `orca --help` 列出的标签页命令打开 `/set` → 跳 `/check` 页面（页面里用 `EventSource` 连 `/events`，收到 5 条后把结果 POST 回服务）；输出 `RESULT console-tab <成立|不成立> cookie=<ok|no> sse=<ok|no> command=<实际命令>`。
- [x] **Step 2: 真机运行并记录**到 `spikes/REPORT.md`“3B 探针：控制台标签页”一节；存回执。
- [x] **Step 3: 提交** — `git commit -m "spike: open a local console page in Orca's built-in browser"`

---

### Task 2: 缓存型 OrcaClient 与纯文本工具

**Files:**
- Create: `packages/core/src/view/snapshot.ts`、`packages/core/src/view/plain-text.ts`
- Test: `packages/core/test/view/snapshot.test.ts`、`packages/core/test/view/plain-text.test.ts`

**Interfaces:**
- Produces:
  - `type CachedOrca = OrcaClient & { invalidate(): void }`
  - `cachedOrca(inner: OrcaClient, o?: { ttlMs?: number; now?: () => number }): CachedOrca` — `ttlMs` 默认 5000；缓存 `taskList`、`terminalList`、`terminalShow`、`workerList`、`runShow`，键为方法名 + 参数的 JSON；同键并发共享同一个进行中的 Promise；失败不缓存；其余方法透传，写方法（`terminalCreate`、`terminalSend`、`terminalClose`、`runCreate`、`runUse`、`taskCreate`、`dispatch`、`workerDone`、`gateCreate`、`gateResolve`、`reply`、`worktreeSet`）完成后（成功或失败）调用 `invalidate()`
  - 背景（复审 I-4）：`ps`、`attention`、`listTasks` 等 core 函数内部直接调用 `deps.orca`，所以缓存必须做成装饰器，由调用方以 `{ ...deps, orca: cachedOrca(deps.orca) }` 传入
  - `plainText(s: string): string` — 去掉 ANSI CSI/OSC 序列与除 `\n`、`\t` 外的控制字符

- [x] **Step 1: 写失败测试**

```ts
test('core queries run through the decorator share one Orca call per kind within ttl', async () => {
  const o = new FakeOrca(); const { deps } = seedRunningTeam(o); const d = { ...deps, orca: cachedOrca(o) }
  await Promise.all([ps(d, { team: 'duo' }), attention(d, 'duo'), listTasks(d, { team: 'duo' })])
  expect(o.calls.filter((c) => c === 'taskList')).toHaveLength(1)
  expect(o.calls.filter((c) => c === 'terminalList')).toHaveLength(1)
})
test('after ttl, or after any write method, the next read calls Orca again', async () => {})
test('a failed read is not cached', async () => {})
test('plainText strips colors, cursor moves and OSC titles but keeps newlines', () => {
  expect(plainText('\x1b[31mred\x1b[0m\n\x1b]0;t\x07ok\x1b[2K')).toBe('red\nok')
})
```

- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/view` → FAIL。
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(view): shared Orca snapshot cache and plain text"`

---

### Task 3: 登录、会话与请求校验

**Files:**
- Create: `packages/core/src/server/auth.ts`
- Test: `packages/core/test/server/auth.test.ts`

**Interfaces:**
- Produces:
  - `class Auth { constructor(o: { now: () => number; random?: (n: number) => Buffer }); issueLoginToken(): string; redeem(token: string): { sid: string } | null; session(cookieHeader: string | undefined): { sid: string; csrf: string } | null }` — token 5 分钟过期、单次有效；会话 12 小时
  - `sessionCookie(sid: string): string` — 返回 `wl_sid=<sid>; HttpOnly; SameSite=Strict; Path=/`
  - `checkHost(host: string | undefined, port: number): boolean`
  - `checkWrite(req: { method: string; headers: IncomingHttpHeaders }, port: number, s: { csrf: string } | null): 'ok' | 'unauthenticated' | 'forbidden'`
  - `safeEqual(a: string, b: string): boolean`（`crypto.timingSafeEqual`，长度不同直接 false）

- [x] **Step 1: 写失败测试**

```ts
test('a login token redeems once; the second use and an expired token fail', () => {})
test('session cookie carries HttpOnly, SameSite=Strict and Path=/', () => {
  expect(sessionCookie('abc')).toBe('wl_sid=abc; HttpOnly; SameSite=Strict; Path=/')
})
test('sessions expire after 12 hours', () => {})
test('host check accepts 127.0.0.1:<port> and localhost:<port> only', () => {
  expect(checkHost('127.0.0.1:4100', 4100)).toBe(true)
  expect(checkHost('evil.example:4100', 4100)).toBe(false)
  expect(checkHost('127.0.0.1:9999', 4100)).toBe(false)
})
test.each([
  ['missing csrf header', { origin: 'http://127.0.0.1:4100', 'content-type': 'application/json' }],
  ['wrong origin', { origin: 'http://evil', 'x-wingline-token': 'C', 'content-type': 'application/json' }],
  ['form content type', { origin: 'http://127.0.0.1:4100', 'x-wingline-token': 'C', 'content-type': 'text/plain' }],
])('write is forbidden on %s', (_n, headers) => {
  expect(checkWrite({ method: 'POST', headers }, 4100, { csrf: 'C' })).toBe('forbidden')
})
test('write without a session is unauthenticated', () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（token 只存 `sha256` 哈希）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(server): login tokens, sessions and request checks"`

---

### Task 4: 静态资源与安全响应头

**Files:**
- Create: `packages/core/src/server/static.ts`
- Test: `packages/core/test/server/static.test.ts`

**Interfaces:**
- Produces:
  - `SECURITY_HEADERS: Record<string, string>`（Global Constraints 中的四个头）
  - `serveStatic(root: string, urlPath: string, res: ServerResponse): boolean` — 命中文件返回 true；`/assets/` 下（带哈希）的文件 `Cache-Control: public, max-age=31536000, immutable`，其余 `no-store`；规范化后不在 `root` 内 → 404；非 `/api`、`/_control`、`/auth` 且无扩展名的路径回退 `index.html`
  - `assertWebBuilt(root: string): void` — `index.html` 不存在时抛 `WinglineError('internal', 'web_missing', '控制台前端未构建', { hint: '运行 pnpm build' })`

- [x] **Step 1: 写失败测试**：`/` 与 `/t/duo/inbox` 都返回 `index.html`；`/assets/app-abc123.js` 带长期缓存头；`/../package.json` 与 `/%2e%2e/x` 返回 404；每个响应都带 `SECURITY_HEADERS`；`assertWebBuilt` 在空目录抛 `web_missing`。
- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（MIME 只需 `.html`、`.js`、`.css`、`.svg`、`.json`、`.woff2`）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(server): static assets with security headers"`

---

### Task 5: 路由器与读接口

**Files:**
- Create: `packages/core/src/server/http.ts`、`packages/core/src/server/api-read.ts`
- Test: `packages/core/test/server/api-read.test.ts`

**Interfaces:**
- Consumes: `cachedOrca`（Task 2；`ctx.deps.orca` 已是装饰后的客户端）、`ps`、`dispatcherHealth`、`dispatcherStatus`、`attention`、`listTasks`、`listStale`、`showTask`、`readTimeline`（3A）、`registry.listPatrolState`、`getFrozen`、`hushedUntil`
- Produces:
  - `type Handler = (ctx: { deps: CommandDeps & { orca: CachedOrca }; params: Record<string, string>; query: URLSearchParams; body: unknown }) => Promise<unknown>`
  - `class Router { get(pattern: string, h: Handler): void; post(pattern: string, h: Handler): void; match(method: string, path: string): { h: Handler; params: Record<string, string> } | null }` — 模式形如 `/api/teams/:team/tasks/:id`
  - `const PARAM_RULES: Record<string, RegExp>` — `team`/`post`：`/^[a-z0-9-]+$/`；`id`/`gateId`/`messageId`：`/^[A-Za-z0-9_-]{1,80}$/`；不符 → `WinglineError('input', 'invalid_param', …)`
  - `statusOf(err: unknown): number` 与 `writeEnvelope(res, status, body)`（错误类别 → 状态码见 Global Constraints）
  - `registerReadRoutes(r: Router): void` — spec 第 6.2 节的 8 个 GET（`/api/session` 由 Task 8 注册）；岗位详情的终端预览经 `deps.orca.terminalShow(...).preview` → `plainText` 取最后 40 行
  - 岗位与团队的返回结果只含会话 ID，不含会话标记（3A 第 4.3 节）
  - `interface PostDetail { address: string; row: PsRow; sessionId: string | null; currentTask: TaskRow | null; queued: TaskRow[]; signals: PatrolStateRow[]; frozen: FrozenRow | null; hushedUntil: string | null; events: TimelineEvent[]; preview: string[] }`

- [x] **Step 1: 写失败测试**（直接调用 `router.match(...).h(ctx)`，不起服务）

```ts
test('GET /api/teams lists every team with post summary, dispatcher state and attention counts', async () => {})
test('GET /api/teams/:team/tasks passes status/tags/stale through', async () => {})
test('GET /api/teams/:team/posts/:post returns the last 40 preview lines as plain text', async () => {
  // o.previews 设 60 行带颜色的文本 → preview.length === 40 且不含 '\x1b'
})
test('GET /api/teams/:team/log returns TimelineEvent[] with filters', async () => {})
test.each(['Duo', '..', 'a/b'])('team param %s is rejected with invalid_param', async (bad) => {})
test('no response contains a session marker', async () => { /* 遍历 8 个 GET 的 JSON，断言不含 'WLS-' */ })
test('statusOf maps input/orca/uncertain/internal to 400/502/504/500', () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(server): router and read API"`

---

### Task 6: 写接口

**Files:**
- Create: `packages/core/src/server/api-write.ts`
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- Consumes: `auditedCommands`（3A，`prefix: 'console:'`）、`send`、`createTask`、`escalateTask`、`reassignTask`、`recoverTask`、`resolveGate`、`freezePostCmd`、`unfreezePostCmd`、`hushCmd`、`unhushCmd`、`dispatcherReply`；写方法经 `cachedOrca` 透传时自动作废缓存
- Produces:
  - `registerWriteRoutes(r: Router, cmds: WriteCommands): void` — spec 第 6.3 节的 11 个 POST；每个路由声明允许的字段（`fields: readonly string[]`），多余字段 → `unknown_field`；完成后（成功或失败）调用 `deps.orca.invalidate()`
  - `type WriteCommands = Pick<CoreCommands, 'send' | 'createTask' | 'escalateTask' | 'reassignTask' | 'recoverTask' | 'resolveGate' | 'freezePostCmd' | 'unfreezePostCmd' | 'hushCmd' | 'unhushCmd' | 'dispatcherReply'>`（`CoreCommands` 为这些 core 函数的类型集合，在 `api-write.ts` 中声明）
  - `consoleCommands(deps: CommandDeps): WriteCommands` — 用 `auditedCommands(rawWrite, CONSOLE_AUDIT, { prefix: 'console:', actor: 'human' })` 生成
  - 不确定错误的响应体附 `retry`（CLI 提示）与 `retryRequest`（来自 `WinglineError` 的 `detail.retryRequest`，没有则省略）

- [x] **Step 1: 写失败测试**

```ts
test('POST send maps {post, message} to send({address, message}) and invalidates the snapshot', async () => {})
test('POST resolve maps {resolution, reassign} to resolveGate({gateId, resolution, reassign})', async () => {})
test('POST hush maps forMs; reply maps {body, again}', async () => {})
test('an unknown body field is rejected with unknown_field and the command is not called', async () => {})
test('every write route is audited with console: prefix and actor human', async () => {
  // 遍历全部 11 个路由：调用后 registry.listAudit('duo') 最后一行 command 以 'console:' 开头，actor === 'human'
})
test('an uncertain send returns 504 with retry and retryRequest', async () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(server): write API through audited commands"`

---

### Task 7: SSE

**Files:**
- Create: `packages/core/src/server/sse.ts`
- Test: `packages/core/test/server/sse.test.ts`

**Interfaces:**
- Consumes: `readTimelineAfter`、`LogCursor`（3A）、`cachedOrca`、`ps`、`attention`
- Produces:
  - `class TeamFeeds { constructor(deps: CommandDeps & { orca: CachedOrca }, o?: { timelineMs?: number; snapshotMs?: number; pingMs?: number; setTimer?: typeof setInterval; clearTimer?: typeof clearInterval }); subscribe(team: string, write: (chunk: string) => void, lastEventId?: string): () => void; closeAll(): void }` — 每个团队一个循环，订阅者为 0 时停止；`timeline` 事件 `id: <source>:<id>`、`event: timeline`、`data: <TimelineEvent JSON>`；`snapshot` 在 `ps`+`attention` 结果的 sha256 变化时推送 `{ team, posts, dispatcher, attentionCounts }`；心跳 `: ping\n\n`
  - `cursorFrom(lastEventId: string | undefined, start: LogCursor): LogCursor` — 只前移对应来源，其余取 `start`（连接建立时刻的游标）

- [x] **Step 1: 写失败测试**（注入假的定时器，手动触发 tick）

```ts
test('first connection gets no history; new rows after it are pushed with source:id ids', () => {})
test('Last-Event-ID task:5 resumes the task source after 5 and others from now', () => {})
test('snapshot is pushed only when the hash changes', () => {})
test('two subscribers on one team share one loop; the loop stops when both leave', () => {
  // 两个订阅 → tick 一次只有一次 taskList；退订两个后 setTimer 的句柄被 clear
})
test('a failing read in a tick is logged and the next tick runs', () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(server): per-team SSE feeds"`

---

### Task 8: 服务组装与 `wl console`

**Files:**
- Create: `packages/core/src/server/control.ts`、`packages/core/src/server/index.ts`、`packages/cli/src/console.ts`
- Modify: `packages/core/src/index.ts`、`packages/cli/src/cli.ts`
- Test: `packages/core/test/server/server.test.ts`、`packages/core/test/server/control.test.ts`、`packages/cli/test/console.test.ts`

**Interfaces:**
- Consumes: Task 3–7；2B 调度员启动命令的构造（`dispatcher/lifecycle.ts` 的 `dispatcherLaunchCommand`），抽出通用部分 `selfCommand(deps: CommandDeps, args: string[], o?: { platform?: NodeJS.Platform }): { file: string; args: string[] }` 后由调度员、控制台与 3D 的 autostart 共用（复审 M-2）
- Produces:
  - `createConsoleServer(deps: CommandDeps, o: { port?: number; webRoot: string; now?: () => number }): Promise<{ port: number; loginUrl(): string; close(): Promise<void> }>` — 组装路由、`/auth`、`/_control/link`、`/api/session`（`{ csrfToken, version, teams }`）、`/api/teams/:team/events`、静态资源；每个请求先 `checkHost`，`/api/*` 需会话，POST 需 `checkWrite`
  - `readConsoleFile(home: string): ConsoleFile | null`；`writeConsoleFile(home: string, f: ConsoleFile): void`（0600，先写临时文件再改名）；`removeConsoleFileIfMine(home: string, pid: number): void`；`interface ConsoleFile { pid: number; port: number; startedAt: string; controlKey: string }`
  - `requestLink(f: ConsoleFile, fetchImpl?: typeof fetch): Promise<string | null>` — 连接失败、非 200、密钥被拒都返回 `null`
  - `openTab(deps: CommandDeps, url: string): Promise<'opened' | 'unsupported'>` — 按 Task 1 的结论调用 Orca；未定前恒返回 `'unsupported'`
  - `consoleWorktree(deps: CommandDeps, override?: string): string` — `override` → 第一个 `up` 团队的牵头岗 worktree → 抛 `console_no_worktree`（复审 I-5）
  - `/auth` 成功时返回 200 页面，内容含 `<meta http-equiv="refresh" content="0;url=/">`，不用 302（复审 I-3）
  - CLI：`wl console [--port <n>] [--open] [--worktree <选择器>] [--link] [--json]`，行为见 spec 第 4 节；`Commands` 增加 `console` 字段以便测试注入

- [x] **Step 1: 写失败测试**

`server.test.ts`（起真实服务于随机端口、FakeOrca 后端、`webRoot` 为临时目录里的最小 `index.html`）：

```ts
test('login link sets the cookie and answers 200 with a meta refresh to / (no 302); second use shows the expired page with 401', async () => {})
test('--open without --worktree and without any running team → console_no_worktree', async () => {})
test('a request with a foreign Host gets 421 before anything else', async () => {})
test('GET /api without a session is 401; POST with a session but no csrf is 403', async () => {})
test('a POST body over 64 KB is 413 body_too_large', async () => {})
test('POST /_control/link with the right key returns a fresh login url; a wrong key is 403', async () => {})
test('SSE endpoint streams a timeline event written after connecting', async () => {})
```

`control.test.ts`：`writeConsoleFile` 的权限为 0600（POSIX 上断言 `stat.mode & 0o777`）；`removeConsoleFileIfMine` 只删 pid 相同的文件；`requestLink` 在端口无人监听时返回 `null`。

`console.test.ts`（CLI，注入 `console` 命令）：已有存活服务时只打印新链接、退出码 0；`--link` 无服务 → 退出码 1、`console_not_running`；`--port` 被占用 → 退出码 1、`console_port_in_use`；`--open` 在 `openTab` 返回 `unsupported` 时打印链接、提示 `console_tab_unsupported`、退出码 0；新服务 10 秒内未就绪 → 退出码 3。

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（服务的 `webRoot` 在 CLI 中为 `new URL('./web/', import.meta.url)` 对应的 `dist/web/`；启动前 `assertWebBuilt`；SIGINT/SIGTERM/SIGHUP → `close()` + `removeConsoleFileIfMine`）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(console): wl console server, single instance and --open"`

---

### Task 9: 前端工程与基础设施

**Files:**
- Create: `packages/web/package.json`、`packages/web/vite.config.ts`、`packages/web/tsconfig.json`、`packages/web/index.html`、`packages/web/src/main.tsx`、`src/api.ts`、`src/router.ts`、`src/components/Layout.tsx`、`src/components/ActionDialog.tsx`、`src/components/Toast.tsx`、`src/styles.css`
- Modify: 根 `package.json`（`build` 增加 `pnpm --filter @wingline/web build`）、`vitest.config.ts`（`include` 增加 `packages/*/test/**/*.test.tsx`）、`tsconfig.typecheck.json`（`packages/web` 的 JSX 设置）、`packages/cli/package.json`（`files` 含 `dist/web`）
- Test: `packages/web/test/api.test.tsx`、`packages/web/test/layout.test.tsx`

**Interfaces:**
- Produces:
  - `packages/web/package.json`：`"name": "@wingline/web"`, `"private": true`；构建输出 `../cli/dist/web`（`build.outDir`，`emptyOutDir: true`，资源放 `assets/` 并带哈希）
  - `class ApiError extends Error { kind: string; code: string; hint?: string; retry?: string; retryRequest?: string; status: number }`
  - `api.get<T>(path: string): Promise<T>`；`api.post<T>(path: string, body: object): Promise<T>` — 首次调用时从 `/api/session` 取 `csrfToken` 并缓存；401 时抛 `ApiError` 且 `code = 'unauthenticated'`
  - `useEventStream(team: string, on: { timeline(e: TimelineEvent): void; snapshot(s: TeamSnapshotEvent): void }): 'live' | 'reconnecting' | 'closed'` — `EventSource` 出错时关闭并在 5 秒后重建；连续 3 次失败后先 `api.get('/api/session')`，得到 401 则返回 `'closed'`
  - `router`：基于 `history.pushState` 的极简路由，`route(path)` 与 `<Link href>`；路由表见 spec 第 7 节
  - `<ActionDialog title fields onSubmit>`：渲染确认框与必填字段，提交后按结果显示成功提示、`hint`，或“按原样重试”按钮（重发同一请求体与 `retryRequest`）
  - `<Layout>`：左侧团队切换器与 6 个入口、顶部连接状态与待办数角标；跟随 `prefers-color-scheme`
  - 共享类型：从 `@wingline/core` 以 `import type` 引入 `TimelineEvent`、`AttentionReport`、`PsRow`、`TaskRow`、`PostDetail`（仅类型，不进运行时包）

- [x] **Step 1: 写失败测试**（jsdom，文件首行 `// @vitest-environment jsdom`）

```tsx
test('api.post sends X-Wingline-Token from /api/session and JSON content type', async () => {})
test('a 504 response becomes ApiError with retry and retryRequest', async () => {})
test('ActionDialog requires the reason field, then shows a retry button on uncertain and resends the same body', async () => {})
test('Layout shows reconnecting when the stream reports it', () => {})
test('the built index.html has no inline style or script attributes', () => { /* 读 packages/cli/dist/web/index.html（构建后）断言不含 'style=' 与 '<script>' 内联代码 */ })
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现** 工程与上述模块；`pnpm install` 更新锁文件。样式只用 class 与对象形式的 `style`（Preact 经 `el.style` 设置，不受 CSP 的 `style-src 'self'` 限制），不写字符串形式的 `style="…"`（复审 M-5）。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/web`；`pnpm build` 后 `packages/cli/dist/web/index.html` 存在。
- [x] **Step 5: 提交** — `git commit -m "feat(web): console app scaffold, api client and layout"`

---

### Task 10: 总览与时间线页

**Files:**
- Create: `packages/web/src/pages/Overview.tsx`、`packages/web/src/pages/Timeline.tsx`、`packages/web/src/components/PostCard.tsx`、`packages/web/src/components/EventRow.tsx`
- Test: `packages/web/test/overview.test.tsx`、`packages/web/test/timeline.test.tsx`

**Interfaces:**
- Consumes: `api`、`useEventStream`、`ActionDialog`（Task 9）；`GET /api/teams/:team`、`/log`
- Produces: 页面组件 `Overview({ team })`、`Timeline({ team })`；`EventRow` 供岗位详情复用

- [x] **Step 1: 写失败测试**：总览渲染调度员状态卡、每个岗位一张卡（冻结 / 静音 / 信号标记）、最近 20 条时间线；SSE 推来的 `snapshot` 更新岗位卡状态；“发消息”打开对话框并 POST `/send`。时间线新事件在顶部、筛选来源 / 岗位 / 任务、展开显示 `detail`、点击任务跳到任务详情；断线后显示“重连中”，`closed` 时显示“会话已过期，请运行 wl console --link 获取新链接”。
- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(web): overview and timeline pages"`

---

### Task 11: 收件箱与岗位详情页

**Files:**
- Create: `packages/web/src/pages/Inbox.tsx`、`packages/web/src/pages/PostDetail.tsx`、`packages/web/src/components/CommandHint.tsx`
- Test: `packages/web/test/inbox.test.tsx`、`packages/web/test/post-detail.test.tsx`

**Interfaces:**
- Consumes: `AttentionReport` 的分节结构（2B）；写接口路径（Task 6）
- Produces: `Inbox({ team })`、`PostDetail({ team, post })`；`CommandHint({ command })`（可复制的命令）
- 收件箱条目 → 操作的映射：提问 → `reply`（必填回答）；gate → `resolve`（必填说明，可选改派）；`dead_assignee` → `recover`；冻结 → `unfreeze`；巡查信号 → `hush`（可选时长）/ `send`；其余条目只显示 `CommandHint`。

- [x] **Step 1: 写失败测试**：每类条目渲染出对应按钮，提交时 POST 到正确路径与请求体；`done_unfinished` 等无写接口的条目只显示命令；调度员失联一节在最前；岗位详情显示会话 ID（不显示会话标记）、排队任务、信号等级、40 行预览（预览中的 `<script>` 文本按字面显示，不生成元素）。
- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(web): inbox and post detail pages"`

---

### Task 12: 任务看板与任务详情页

**Files:**
- Create: `packages/web/src/pages/TaskBoard.tsx`、`packages/web/src/pages/TaskDetail.tsx`
- Test: `packages/web/test/task-board.test.tsx`、`packages/web/test/task-detail.test.tsx`

**Interfaces:**
- Consumes: `GET /api/teams/:team/tasks`、`/tasks/:id`；`POST /tasks`、`/escalate`、`/reassign`、`/recover`、`/gates/:gateId/resolve`
- Produces: `TaskBoard({ team })`、`TaskDetail({ team, id })`

- [x] **Step 1: 写失败测试**：五列按状态分组；卡片显示主人、标签、第几轮、卡住原因角标；按标签 / 主人 / 只看卡住的筛选；“新建任务”可选岗位并 POST；任务详情显示计划、父子链、闸门失败次数、gate 输出路径、历史，并按状态只显示可用的按钮（`blocked` 有 resolve，`dispatched` 且主人终端失效有 recover，未终态有转人工与改派）。
- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(web): task board and task detail pages"`

---

### Task 13: 端到端冒烟、CI 与文档

**Files:**
- Create: `test/e2e/console.e2e.ts`、`test/e2e/server-fixture.ts`、`playwright.config.ts`
- Modify: 根 `package.json`（开发依赖 `@playwright/test`；脚本 `test:e2e`）、`.github/workflows/ci.yml`、`README.md`、`test/live/duo.live.test.ts`

**Interfaces:**
- Consumes: `createConsoleServer`（Task 8）、FakeOrca 与 `seedRunningTeam`

- [x] **Step 1: 写冒烟用例**：`server-fixture.ts` 用 FakeOrca 与临时 `WINGLINE_HOME` 起服务、写入一个待回答的提问；Playwright 打开登录链接 → 进入收件箱 → 回答提问 → 打开时间线页，断言出现 `console:dispatcher reply` 的命令事件。
- [x] **Step 2: 运行** — `pnpm build && pnpm test:e2e`（使用预装的 Chromium，`PLAYWRIGHT_BROWSERS_PATH` 已配置）→ PASS。（复审注：本机没有装 Chromium，未在本机跑过；该用例以 CI 的 `e2e` job 通过为准。）
- [x] **Step 3: CI**：新增 job `e2e`（仅 `ubuntu-latest`、Node 24）：`pnpm install --frozen-lockfile` → `pnpm exec playwright install --with-deps chromium` → `pnpm build` → `pnpm test:e2e`。
- [x] **Step 4: 文档与真机用例**：README 增加“控制台：`wl console`”一节（中文；说明登录链接等同凭据、5 分钟内有效且只能用一次、`--link`、`--open` 的 worktree 规则与退路、只服务本机）；`test/live/duo.live.test.ts` 增加默认跳过、需人工确认的 `wl console --open` 用例。
- [x] **Step 5: 全量验证** — `pnpm typecheck && pnpm test`（已知的两例沙箱僵尸进程失败除外）→ PASS。
- [x] **Step 6: 提交** — `git commit -m "test(e2e): console smoke; ci job; docs"`
