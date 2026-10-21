# 阶段 3B 复审修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md` 中的 C-1 与全部 Important 项，顺手处理 M-12/M-13/M-14/M-16/M-18。

**Architecture:** 全部改动落在 3B 已交付文件内，不动对外契约（错误码、路由路径、响应结构、页面行为均不变，`invalid_param` 的收紧属计划 Review Focus #3 本义）。服务端容错与 SSE 生命周期集中在 `server/index.ts` 一次重构；写路由表化同时解决行数、`retryRequest` 契约与审计测试覆盖；`selfCommand` 抽到 core 供 dispatcher、console、3D 三方共用。

**Tech Stack:** TypeScript、`node:http`、vitest（现有 FakeOrca/`seedRunningTeam` 夹具）。

**Spec:** 复审报告 `docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md`（下称报告）+ 3B spec `docs/superpowers/specs/2026-10-16-phase-3b-console-design.md` 的 Global Constraints。

## Global Constraints

- 只绑定 `127.0.0.1`；响应格式 `{ ok: true, result }` / `{ ok: false, error: { kind, code, message, hint, retry?, retryRequest? } }`；错误类别 → 状态码映射不变（input 400、orca 502、uncertain 504、internal 500、401/403/404/409/421）。
- 四个安全头（CSP/nosniff/no-referrer/no-store）伴随所有响应，仅带哈希静态文件对 `Cache-Control` 例外。
- `wingline` 包 `dependencies` 不变；不新增任何依赖。
- 函数 ≤ 50 行（本计划的 Task 1/5/7 就是为达成它）。
- 提交信息与 PR 描述不加任何署名尾注（含 Co-Authored-By / Claude-Session 行）。
- 全程在新分支 `fix/phase-3b-review`（基于 main）上工作；**不 push、不开 PR**——等用户批准。
- 报告 M-10/M-11/M-15/M-17 不在本计划范围（M-11 改动响应时序风险大于收益；其余为增强）。

## Review Focus

1. **任何单个请求的异常（含 SSE 订阅失败、body 读取中断）绝不杀进程**——Task 1 的两个崩溃复现测试 + close 测试。
2. **畸形参数在每一层都被 400/404 拦下**：SSE 路由的大写/`..`（Task 1）、`a/b`（Task 6 修正空转断言）、缺字段与 `reassign`/`to` 的岗位名（Task 5 的 `checkParam` 守卫）。
3. **前端"按原样重试"的重发体对全部 11 个写路由都被接受**（原 body + `retryRequest` 不撞 `unknown_field`）——Task 5 表驱动测试。
4. **有页面连接时服务能干净退出**：Ctrl+C 不挂起、不留双服务窗口——Task 1 的 close 测试。
5. **Windows 下 console 启动行与调度员同等安全**（`nodeOnPath` + 危险字符守卫）——Task 3 测试。

---

## File Structure

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/server/index.ts` | Task 1 重构（拆分、容错、SSE 生命周期、sse 注入）、Task 4（`consoleWorktree`） |
| `packages/core/src/server/http.ts` | Task 2（`writeEnvelope` 加安全头）、Task 5（`checkParam` 守卫） |
| `packages/core/src/server/api-write.ts` | Task 5 表驱动重构 + `retryRequest` 契约 |
| `packages/core/src/server/sse.ts`、`api-read.ts`、`static.ts` | Task 7 长函数拆分（行为不变） |
| `packages/core/src/commands/self.ts`（新） | Task 3 `selfCommand`/`commandLine`/`nodeOnPath` |
| `packages/core/src/commands/dispatcher/lifecycle.ts` | Task 3 改为复用 self.ts |
| `packages/cli/src/console.ts` | Task 3（launchLine）、Task 4（--open 降级）、Task 6（confirmMs/sleep、version） |
| `packages/cli/package.json`、根无改动 | Task 6（`files`） |
| 对应 `packages/core/test/...`、`packages/cli/test/console.test.ts` | 各任务测试 |

---

### Task 0: 分支与复审报告存档

**Files:**
- Create: `docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md`（已由协调者写好）
- Branch: `fix/phase-3b-review`

- [x] **Step 1:** `git checkout -b fix/phase-3b-review`（基于 main，工作树当前干净）。
- [x] **Step 2:** 提交报告 — `git add docs/superpowers/reviews/2026-10-20-phase-3b-code-review.md && git commit -m "docs: 3B 代码复审报告"`。

---

### Task 1: createConsoleServer 拆分与顶层容错（报告 C-1、I-2、I-3、I-8 的 index 部分）

**Files:**
- Modify: `packages/core/src/server/index.ts`
- Test: `packages/core/test/server/server.test.ts`（沿用该文件既有的真服务 + FakeOrca + `seedRunningTeam` + 登录夹具）

**Interfaces:**
- `createConsoleServer` 的选项增加 `sse?: { timelineMs?: number; snapshotMs?: number; pingMs?: number }`（透传 `TeamFeeds`，测试用短周期；缺省 2000/5000/15000 不变）
- 内部结构（不导出，全部 ≤ 50 行）：`handle(req, res)` 只做分派；`handleAuth`、`handleControl`、`handleSession`、`handleSse`、`readBody(req): Promise<{ body: unknown; tooLarge: boolean }>`；`respondError(res, err)`（`res.headersSent` ? `res.destroy()` : `writeEnvelope(res, statusOf(err), errorEnvelope(err))`）；`errorEnvelope(err)` 同时供 Router 分支复用（消除 index.ts:217-229 的重复构造）
- 顶层：`http.createServer((req, res) => { void handle(req, res).catch((err) => respondError(res, err)) })`；`req.on('error', …)`/`res.on('error', …)` 吞掉中断类错误并 `deps.warn` 一行
- SSE 分支顺序改变：先 `checkParam('team', team)`，再 `await feeds.subscribe(...)`（包 try/catch，失败走 `respondError`——未知团队 `team_unknown` 是 input → 400），成功后才 `writeHead(200, …)`；`sseClients = new Set<ServerResponse>()` 记录连接，`req.on('close')` 里退订并移除
- `close()`：`feeds.closeAll()` → `for (const res of sseClients) res.destroy()` → `await server.close(cb)` → `server.closeAllConnections()`（engines ≥ 22.13，可用）

- [x] **Step 1: 写失败测试**（追加到 server.test.ts）

```ts
test('GET /api/teams/ghost/events 回 400 team_unknown，且服务不崩（后续请求仍被应答）', async () => {
  // 登录后 fetch SSE 端点：ghost 合法字符 → subscribe → readTimeline 抛 team_unknown → 400 envelope
  // 紧接着再 GET /api/session 断言 200 —— 证明进程活着（C-1 复现路径）
})
test('GET /api/teams/Duo/events 回 400 invalid_param（SSE 路由也过参数校验）', async () => {})
test('SSE 未登录回 401', async () => {})
test('SSE 端点推送连接后写入的 timeline 事件', async () => {
  // createConsoleServer 传 sse: { timelineMs: 50 }；连接 events 流，registry.appendAudit 写一条命令事件，
  // 1 秒内收到 `id: command:<id>` 与 `event: timeline`
})
test('Last-Event-ID 只回退对应来源', async () => {
  // 先写 task 事件两条；带 Last-Event-ID: task:<第2条id> 连接，再各写一条 task 与 command 事件；
  // 断言只收到 id 大于对应游标的事件各一条
})
test('有 SSE 连接挂起时 close() 也能在 1 秒内完成', async () => {
  // 连一条 SSE；Promise.race([srv.close(), 超时 1s reject]) —— I-3 复现
})
```

- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/server/server.test.ts` → 新用例 FAIL（前两条：进程崩溃/连接被杀；close 超时）。
- [x] **Step 3: 实现**——按 Interfaces 重排 index.ts；`readBody` 沿用现有 64 KB 逻辑；Router 分支的 catch 换用 `respondError`。
- [x] **Step 4: 运行确认通过** — 同 Step 2 命令，全部 PASS（含既有用例）。
- [x] **Step 5: 提交** — `fix(server): 顶层容错、SSE 参数校验与连接生命周期`

---

### Task 2: 安全响应头全覆盖（报告 I-9）

**Files:**
- Modify: `packages/core/src/server/http.ts`（`writeEnvelope`）、`packages/core/src/server/index.ts`（`/auth` 两个页面、`/_control/link`、421 分支、SSE 头）
- Test: `packages/core/test/server/server.test.ts`

**Interfaces:**
- `writeEnvelope` 用 `{ ...SECURITY_HEADERS, 'Content-Type': … }`（从 `./static.js` 导入；static.ts 不依赖 http.ts，无环）
- `/auth` 成功/失效两个 HTML 页面、`/_control/link`、421 分支：响应头并入 `SECURITY_HEADERS`
- SSE 头：`Cache-Control` 从 `no-cache` 改为 `SECURITY_HEADERS` 的 `no-store`，其余三头照加（`Content-Type: text/event-stream`、`Connection: keep-alive` 不变）

- [x] **Step 1: 写失败测试**

```ts
test.each([['GET /api/session（登录后）'], ['GET /auth?token=<失效token>'], ['GET /（静态 index.html）'], ['GET /api/teams/duo/events（登录后，SSE 头）']])(
  '%s 响应带齐 CSP/nosniff/no-referrer/no-store', async () => {},
)
test('421 响应也带安全头', async () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/server`（static.test.ts 的既有头断言须保持绿）。
- [x] **Step 5: 提交** — `fix(server): 安全响应头覆盖所有响应`

---

### Task 3: selfCommand 共享（报告 I-4 / M-2）

**Files:**
- Create: `packages/core/src/commands/self.ts`、`packages/core/test/commands/self.test.ts`
- Modify: `packages/core/src/commands/dispatcher/lifecycle.ts`（`dispatcherLaunchCommand` 改为薄封装；`nodeOnPath` 移入 self.ts）、`packages/cli/src/console.ts`（删 `launchLine` 本体）、`packages/core/src/index.ts`（导出）

**Interfaces:**
- `nodeOnPath(deps: CommandDeps): boolean`（从 lifecycle.ts 原样移入）
- `interface SelfSpec { platform: NodeJS.Platform; node: string; script: string; args: string[]; home: string; orca: string; nodeOnPath?: boolean }`
- `selfCommand(a: SelfSpec, o?: { unsupported?: (why: string) => WinglineError }): { file: string; args: string[] }` — win32：`nodeOnPath` 为假抛错；`[script, home, orca, ...args]` 任一含 `/["%$`]/` 抛错；file 为 `'node'`。非 win32：file 为 `a.node`。args 恒为 `[script, ...a.args, '--home', home, '--orca', orca]`。默认错误：`WinglineError('input', 'self_launch_unsupported', …)`
- `commandLine(c: { file: string; args: string[] }, platform: NodeJS.Platform): string` — POSIX 单引号 + `'\''` 转义；win32 双引号
- `dispatcherLaunchCommand` 对外签名与错误（`dispatcher_launch_unsupported`、含 `wl dispatcher run` 的 hint）**完全不变**，实现改为 `commandLine(selfCommand({ …, args: ['dispatcher', 'run', team], … }, { unsupported: (why) => unsupported(a.team, why) }), a.platform)`
- CLI 侧：`launchLine(deps) = commandLine(selfCommand({ platform: process.platform, node: process.execPath, script: process.argv[1] ?? '', args: ['console'], home: deps.home, orca: deps.orcaPath, nodeOnPath: win32 ? nodeOnPath(deps) : undefined }), process.platform)` —— console 从此享有与调度员相同的 Windows 守卫

- [x] **Step 1: 写失败测试**（self.test.ts，直接喂 SelfSpec，不需要 deps）

```ts
test('posix：路径含空格与单引号 → 单引号包裹且内部单引号转义', () => {})
test('win32 且 nodeOnPath：file 为 node，双引号包裹', () => {})
test('win32 无 node → self_launch_unsupported', () => {})
test('win32 任一参数含 " % $ ` → self_launch_unsupported', () => {})
```

- [x] **Step 2: 运行确认失败**（模块不存在）。
- [x] **Step 3: 实现**；`lifecycle.ts` 删除本地 `posixQuote`/`WINDOWS_UNSAFE`/`nodeOnPath`，改从 self.ts 引。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/commands/self.test.ts packages/core/test/commands/dispatcher packages/cli/test/console.test.ts`（lifecycle 既有断言 `dispatcher_launch_unsupported` 的用例必须原样通过）。
- [x] **Step 5: 提交** — `fix(core): 抽出 selfCommand，dispatcher 与 console 共用启动行拼装`

---

### Task 4: consoleWorktree 过滤与 --open 降级（报告 I-5）

**Files:**
- Modify: `packages/core/src/server/index.ts`（`consoleWorktree`）、`packages/cli/src/console.ts`（open 分支、`ConsoleResult`、`renderConsole`）
- Test: `packages/core/test/server/server.test.ts`、`packages/cli/test/console.test.ts`

**Interfaces:**
- `consoleWorktree`：只遍历 `deps.registry.listTeams().filter((t) => t.status === 'up')` 的团队
- `ConsoleResult` 增加 `tabReason?: 'worktree'`；`consoleCmd` 的 open 分支把 `consoleWorktree` 包进 try/catch：抛错时返回 `{ outcome: 'opened', url, tab: 'unsupported', tabReason: 'worktree' }`（链接仍然给用户）；`startInOrca` 里的 worktree 解析失败仍照旧抛 `console_no_worktree`（那时没有链接可降级）
- `renderConsole`：`tabReason === 'worktree'` 时输出 `控制台链接：${url}` + 提示行（含 `console_no_worktree` 字样与"请运行 wl up 或用 --worktree 指定，也可直接在浏览器打开链接"）；否则维持 `console_tab_unsupported` 文案

- [x] **Step 1: 写失败测试**

server.test.ts：
```ts
test('consoleWorktree 跳过 stopped 团队，取 up 团队牵头岗 worktree', () => {
  // seedRunningTeam 后 setTeamStatus('duo','stopped') 再登记一个 up 团队 → 取后者的 lead.worktree
})
test('只有 stopped 团队时 consoleWorktree 抛 console_no_worktree', () => {})
```
console.test.ts：
```ts
test('服务在运行但没有任何团队：--open 降级为链接 + worktree 提示，退出不报错', async () => {
  // mkDeps（无团队）+ runningConsole → consoleCmd({ open: true }) →
  // { outcome: 'opened', tab: 'unsupported', tabReason: 'worktree' }，renderConsole 含 url 与 console_no_worktree
})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。**
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/server/server.test.ts packages/cli/test/console.test.ts`（既有 `--open` 用例——up 团队场景——必须保持绿）。
- [x] **Step 5: 提交** — `fix(console): worktree 只认 up 团队，--open 解析失败时降级给链接`

---

### Task 5: 写路由表驱动 + retryRequest 契约 + 审计全量测试（报告 I-6、I-7 审计部分、I-8 api-write 部分；顺手 M-12/M-18）

**Files:**
- Modify: `packages/core/src/server/api-write.ts`、`packages/core/src/server/http.ts`（`checkParam`）
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- `checkParam(key, val)`：`typeof val !== 'string'` 即抛 `invalid_param`（undefined 不再因 `"undefined"` 恰好匹配规则而放行）
- `interface WriteRouteSpec { pattern: string; check: readonly ('team' | 'post' | 'id' | 'gateId' | 'messageId')[]; fields: readonly string[]; call: (cmds: WriteCommands, ctx: HandlerContext) => Promise<unknown> }`
- `export const WRITE_ROUTES: WriteRouteSpec[]`——11 条；每条的 `fields` 都含 `'retryRequest'`；`call` 里把 `retryRequest` 传给命令**当且仅当该 core 命令签名声明了它**（今天只有 `send`、`createTask`、`escalateTask`；其余接受但不下传——这是与前端 ActionDialog"总是可带 retryRequest 重试"的对齐契约）
- `registerWriteRoutes(r, cmds)` 变为遍历 `WRITE_ROUTES` 的 ≤ 15 行函数；每条 handler：`check` 逐个 `checkParam` → `assertExactFields(body, spec.fields)` → `spec.call(cmds, ctx)`；**删除各路由的 `finally { ctx.deps.orca.invalidate() }`**（`cachedOrca` 写方法透传后自动作废，报告 M-18）
- reassign 的 `to` 与 gates 的 `reassign`：不含 `@` 时先 `checkParam('post', 值)` 再拼地址（报告 M-12 收口到 invalid_param）
- `consoleCommands()` 去掉从未使用的 `_deps` 参数（调用点同步）

- [x] **Step 1: 写失败测试**（表驱动，替换/扩展现有 5 条覆盖的审计测试）

```ts
test.each(WRITE_ROUTES)('$pattern：审计行带 console: 前缀、actor human', async () => {
  // 用注入的记录型 cmds（每个方法记下调用参数并返回最小结果），调用后断言 registry 审计表最后一行
  // command 以 'console:' 开头、actor === 'human' —— 全部 11 条，不再只有 5 条
})
test.each(WRITE_ROUTES)('$pattern：原样重试体（原字段 + retryRequest）被接受，不撞 unknown_field', async () => {})
test('resolve 映射 {resolution, reassign} 为地址；hush 映射 forMs；reply 映射 {body, again}', async () => {
  // 记录型 cmds 断言三者的出参（报告 I-7 点名缺失的映射测试）
})
test('send 缺 post 字段 → 400 invalid_param（不再是 post_unknown）', async () => {})
test('reassign 的 to=Duo → invalid_param', async () => {})
```

- [x] **Step 2: 运行确认失败**（表驱动的 retryRequest 用例在现白名单下必 FAIL）。
- [x] **Step 3: 实现**（保持每条路由的对外路径与响应不变）。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/server`。
- [x] **Step 5: 提交** — `fix(server): 写路由表驱动化，retryRequest 契约与 11 路由审计全覆盖`

---

### Task 6: 剩余缺失测试与杂项（报告 I-7 收尾与 M-13/M-14；M-16 已在 Task 5 处理）

**Files:**
- Modify: `packages/cli/src/console.ts`（`ConsoleArgs` 增加 `confirmMs?: number; sleep?: (ms: number) => Promise<void>`，`startInOrca` 采用，缺省 10_000/200ms 不变）、`packages/cli/package.json`（`"files": ["dist"]`）、`packages/core/src/server/index.ts`（`createConsoleServer` 选项增加 `version?: string`，`/api/session` 用它，缺省 `'dev'`）、`packages/cli/src/console.ts` 的 `foreground`（读自身 `package.json` 的 version 传入）
- Test: `packages/cli/test/console.test.ts`、`packages/core/test/server/api-read.test.ts`、`packages/core/test/server/sse.test.ts`

**Interfaces:**
- `ConsoleArgs.confirmMs/sleep` 语义同 dispatcher 的 `UpArgs.confirmMs/pollMs/sleep` 注入模式

- [x] **Step 1: 写失败测试**

```ts
// console.test.ts
test('--open 新服务 confirmMs 内未就绪 → console_start_unconfirmed（kind uncertain，CLI 映射退出码 3）', async () => {
  // 无 live 服务、无团队、confirmMs: 0 → rejects.toMatchObject({ kind: 'uncertain', code: 'console_start_unconfirmed' })
})
// api-read.test.ts
test('team 形如 a/b 时路由不匹配 → HTTP 404（修正原 if (route) 空转断言）', () => {
  // 直接断言 router.match('GET', '/api/teams/a/b/tasks') === null；'Duo' 与 '..' 用例维持 invalid_param 断言
})
// api-read.test.ts：会话标记遍历扩到含 /tasks/:id 的全部读 GET
// sse.test.ts
test('timeline tick 内单次读取失败只 warn，下一次 tick 照常运行', () => {})
```

- [x] **Step 2: 运行确认失败**（`confirmMs` 注入不存在；`a/b` 断言改法后先确认现状）。
- [x] **Step 3: 实现**（`files` 与 `version` 无新测试，随本任务提交；README 不改——CLI 用法未变）。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/cli/test/console.test.ts packages/core/test/server packages/web/test`。
- [x] **Step 5: 提交** — `test(console): 10 秒未就绪与 SSE 自愈用例；cli files 与版本号杂项`

---

### Task 7: 长函数拆分收尾（报告 I-8 剩余部分，行为不变）

**Files:**
- Modify: `packages/core/src/server/static.ts`（`serveStatic` 73 行）、`packages/core/src/server/api-read.ts`（`registerReadRoutes` 144 行）、`packages/core/src/server/sse.ts`（`startLoop` 55 行）

**Interfaces:**
- 纯机械拆分：`serveStatic` → 抽 `resolveUnder(root, urlPath): string | null` 与发送封装；`registerReadRoutes` → 按资源抽 `registerTeamRoutes(r)`/`registerPostRoutes(r)`/`registerLogRoute(r)`（命名可依现状调整，导出面不变）；`startLoop` → 抽 `tickTimeline(team, loop)`/`tickSnapshot(team, loop)` 私有方法。所有导出签名不变。

- [x] **Step 1: 基线** — `pnpm vitest run packages/core/test/server packages/core/test/view` 全绿记录在案。
- [x] **Step 2: 实现**（不改任何行为、不加条件分支）。
- [x] **Step 3: 验证** — 同 Step 1 命令全绿；列出本次改动的函数清单及行数，确认 ≤ 50。
- [x] **Step 4: 提交** — `refactor(server): static/api-read/sse 长函数拆分至 50 行内`

---

### Task 8: 全量验证与收尾

> **实际执行（2026-10-20）：** 计划止于"停在本地分支、询问用户"。用户直接授权完整交付流程（提交 / 推送 / 开 PR / 合并 / 收尾），故未停在本地分支。额外做了两件计划外的事：① 修 `main` 上既存的 Windows CI 红灯（`path.posix.normalize` 与 `nodeOnPath` 守卫），提交 `54aa5fc` 与 `254a90f`；② PR #7 合并为 `0284a16`（merge commit），本地与远端分支已删。

- [x] **Step 1:** `pnpm typecheck && pnpm vitest run`（全仓单测）→ PASS（已知的两例沙箱僵尸进程失败若复现，按既有记录说明，不算本次回归）。
- [x] **Step 2:** e2e 本机不跑（Chromium 未安装，环境问题；CI e2e job 覆盖），在交付说明里如实注明。
- [x] **Step 3:** `git log --oneline main..fix/phase-3b-review` 核对提交序列与报告条目的对应（C-1→Task 1、I-2→Task 1、I-3→Task 1、I-4→Task 3、I-5→Task 4、I-6→Task 5、I-7→Task 1/5/6、I-8→Task 1/5/7、I-9→Task 2、M-12/M-18→Task 5、M-13/M-14→Task 6）。
- [x] **Step 4:** 停在本地分支，向用户汇报并询问是否 push / 开 PR。（实际：用户批准后已推送并合并为 PR #7）
