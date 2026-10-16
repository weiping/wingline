# 雁阵 Wingline 阶段 3B：本地 HTTP API 与控制台设计

- 日期：2026-10-16
- 状态：设计中（未实现）
- 范围：阶段 3（控制台与恢复）子项目 B：`wl console` 本地服务（HTTP API + SSE）、登录与安全、控制台 6 个页面（总览、收件箱、任务看板、任务详情、岗位详情、时间线）、`wl console --open` 在 Orca 内打开。
- 依赖：阶段 3A（`docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md`，下称 3A：`auditedCommands`、`audit_events`、`TimelineEvent`、`wl log` 的合并与游标、会话标记）、阶段 2A（任务命令与 `--stale` 判定）、阶段 2B（`attention`、`dispatcherHealth`、`dispatcher status`、冻结 / 静音 / 回答提问、调度员的启动方式与循环异常处理）。
- 不含：团队编辑器、设置页、向 Orca 原生界面同步状态（终端标题、工作区卡片状态行、`--workspace-status`、未读红点）、`wl tui`——均为 3C；页面上的 `up`/`down`/`restore` 与调度员启停。
- 承接：总纲第 4 节阶段 3、第 5.4 节控制台。

## 1. 目标与成功标准

人在 Orca 窗口里打开一个页面，就能看清团队在做什么、处理需要人处理的事项，而不必记住一串 `wl` 命令。

成功标准：

- `wl console --open` 在 Orca 内打开控制台；同一台机器上再次执行不会起第二个服务。
- 页面实时显示岗位状态、任务、待办与时间线（SSE 推送，无需刷新）。
- `wl attention` 里出现的事项，凡是有对应写命令的，都能在页面上处理：回答提问、resolve / 改派、recover、冻结 / 解冻 / 静音、建任务、给岗位发消息。页面上的写操作与命令行行为完全一致，并进入审计时间线。
- 服务只接受本机、已登录、通过 CSRF 与 Origin 校验的请求。

## 2. 全局约束补充

1. **不新增运行时依赖。** HTTP 服务只用 `node:http`、`node:crypto` 等 Node 内置模块；前端依赖（Preact、Vite 等）只在构建时使用，产物是静态文件。
2. **服务端不实现业务逻辑。** 每个接口都调用 core 已有的命令或查询函数；写接口一律经 3A 的 `auditedCommands`。页面能做的事，命令行都能做，结果一致。
3. **只服务本机。** 只绑定 `127.0.0.1`，不提供其他地址的选项，不做账号体系。
4. **页面从不自动重试写操作。** 结果不确定时，由人点“按原样重试”，发出与第一次完全相同的请求（含 `retryRequest`）。
5. 函数 ≤ 50 行；子进程沿用总纲第 2 节第 4 条（`--open` 启动终端时与 2B 调度员的启动方式相同）。

## 3. 先补探针（plan 的 Task 0）

新增 `spikes/console-tab.ts`，在 macOS 或 Linux 真机上跑，结论写回 `spikes/REPORT.md`：

1. Orca 是否提供在内置浏览器里打开 URL 的 CLI 命令（总纲写作 `orca tab create --url …`，以 `orca --help` 实际列出的为准），能否打开 `http://127.0.0.1:<port>/…`。
2. 内置浏览器里，`Set-Cookie`（HttpOnly、SameSite=Strict）能否写入，经 meta refresh 跳转后的首个请求与后续请求是否带上；`EventSource` 能否保持连接。
3. 在 Orca 终端里长期运行一个本地 HTTP 服务，页面断开、重连后服务是否稳定。

判读：

- 全部成立 → `--open` 按第 4.2 节实现。
- 第 1 条不成立 → `--open` 退化为“启动服务 + 打印登录链接”，返回码 0，附提示 `console_tab_unsupported`（第 9 节）。
- 第 2 条不成立 → 记为风险：内置浏览器不可用时由用户在系统浏览器里打开；服务端设计不变。

## 4. `wl console` 进程

### 4.1 命令

```
wl console [--port <n>] [--open] [--worktree <选择器>] [--link] [--json]
```

- **默认**：前台运行服务，绑定 `127.0.0.1`，端口随机（`--port` 指定时用指定端口；被占用 → `console_port_in_use`，退出码 1）。启动后在标准输出打印一次性登录链接。
- **单实例**：启动时读 `~/.wingline/console.json`（`WINGLINE_HOME` 下）：
  - 记录的 pid 存活且端口可连 → 不起第二个服务，向它申请一个新登录链接（同 `--link`）、打印后退出，退出码 0。
  - pid 已死或文件损坏 → 视为没有服务，正常启动并覆盖写入。
- **`console.json`**：`{ pid, port, startedAt, controlKey }`，权限 0600（Windows 上为当前用户可读写）；`controlKey` 为 32 字节随机数的十六进制。
- **`--link`**：向已在运行的服务申请新登录链接并打印；没有服务 → `console_not_running`（退出码 1，提示 `wl console --open`）。
- **`--open`**：见第 4.2 节。
- **退出**：收到 SIGINT/SIGTERM/SIGHUP 时停止接受新连接、关闭 SSE 连接、退出；只有 `console.json` 的 pid 等于自己时才删除该文件。

### 4.2 `--open`

1. 已有服务在运行 → 申请新登录链接，跳到第 3 步。
2. 没有服务 → 在 Orca 里新建终端 `console@wingline`。`terminal create` 需要 worktree 选择器：取 `--worktree <选择器>`；未给时取第一个状态为 `up` 的团队的牵头岗 worktree；一个都没有 → `console_no_worktree`（退出码 1，提示先 `wl up`，或直接在任意终端运行 `wl console`）（复审 I-5）。命令为 `wl console --home <home> --orca <orca 路径>`（做法与 2B 调度员的 `dispatcher up` 相同，Windows 用 PATH 上的 `node` 执行入口脚本）；轮询 `console.json`（每 200 毫秒，最多 10 秒）直到出现可连的服务，再经控制接口申请登录链接。等不到 → `console_start_unconfirmed`（退出码 3，提示到 `console@wingline` 终端里查看）。
3. 用第 3 节探针确认的命令在 Orca 内置浏览器里打开登录链接；Orca 不支持 → 打印链接，提示 `console_tab_unsupported`，退出码 0。

### 4.3 控制接口

`POST /_control/link`：请求头 `X-Wingline-Control: <controlKey>`，返回新的一次性登录链接。只接受来自 `127.0.0.1` 的连接，且同样做第 5.4 节的 Host 校验；控制密钥比较用定长比较。

## 5. 登录与安全

### 5.1 登录

- 一次性登录链接 `http://127.0.0.1:<port>/auth?t=<token>`：token 为 32 字节随机数（base64url），只能使用一次，5 分钟后过期，服务内存中保存其哈希。
- 访问登录链接 → 校验通过后创建会话，返回 `Set-Cookie: wl_sid=<会话 id>; HttpOnly; SameSite=Strict; Path=/`，响应为 200 的小页面，用 `<meta http-equiv="refresh" content="0;url=/">` 跳到 `/`。不用 302：登录链接通常从 Orca 或系统浏览器外部打开，Chromium 系浏览器在由外部发起的重定向链上不发送 `SameSite=Strict` cookie，首屏会 401；由页面自身发起的同源跳转则会带上（复审 I-3）。会话有效期 12 小时，保存在服务内存中（服务重启后需要重新登录，用 `wl console --link` 取新链接）。
- token 无效、已用或过期 → 返回一个说明页“链接已失效，请运行 wl console --link 获取新链接”，状态码 401。

### 5.2 读请求

所有 `/api/*` 需要有效会话，否则 401。

### 5.3 写请求

所有 POST 必须同时满足，否则 403：

- 有效会话；
- 请求头 `X-Wingline-Token` 等于该会话的 CSRF token（页面加载时从 `GET /api/session` 取得，与会话一一对应）；
- `Origin` 等于 `http://127.0.0.1:<port>`（或 `http://localhost:<port>`，与 Host 一致）；
- `Content-Type: application/json`，请求体不超过 64 KB。

### 5.4 通用

- **Host 校验（防 DNS 重绑定）**：所有请求的 `Host` 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`，否则 421。
- **响应头**：`Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'`，`X-Content-Type-Options: nosniff`，`Referrer-Policy: no-referrer`，`Cache-Control: no-store`（静态资源除外，带内容哈希的文件名可长期缓存）。
- **静态资源**：从包内的 `dist/web/` 目录读取；路径规范化后必须仍在该目录内，否则 404。前端路由（`/t/...`）一律返回 `index.html`。
- 写操作的执行者记为 `human`（与在普通 shell 里运行 `wl` 相同）；审计事件的 `command` 加前缀 `console:`（例如 `console:task resolve`），以便在时间线上区分来源。

## 6. HTTP API

### 6.1 约定

- **响应格式**与命令行 `--json` 相同：成功 `{ ok: true, result }`，失败 `{ ok: false, error: { kind, code, message, hint } }`；结果不确定时 `error` 里带 CLI 给出的 `retry` 提示与 `retryRequest`。
- **状态码**：`input` → 400，`orca` → 502，`uncertain` → 504，`internal` → 500，未登录 → 401，写请求校验失败 → 403，Host 不符 → 421，路由不存在 → 404。
- **Orca 只读调用的合并（`core/src/view/snapshot.ts`）**：一个缓存型的 `OrcaClient` 装饰器 `cachedOrca`，包住 `deps.orca`，服务端把 `{ ...deps, orca: cachedOrca(deps.orca) }` 传给所有 core 函数。只缓存只读方法（`taskList`、`terminalList`、`terminalShow`、`workerList`、`runShow`），同参数 5 秒内只调用一次、并发请求共享同一次进行中的调用；写方法直接透传，完成后作废全部缓存。必须做成装饰器而不是另一套查询函数：`ps`、`attention`、`listTasks` 等 core 函数内部直接调用 `deps.orca`，只有替换掉 `deps.orca` 才能让它们也命中缓存（复审 I-4）。
- 团队名、岗位、任务 id 等路径参数先按现有规则校验（小写字母、数字、连字符；任务 id 按 Orca 的格式），不合法 → 400 `input:invalid_param`。

### 6.2 读接口（GET）

| 路径 | 内容 | 复用 |
| --- | --- | --- |
| `/api/session` | `{ csrfToken, version, teams: string[] }` | — |
| `/api/teams` | 每个团队：岗位状态摘要、调度员状态、待办数 | `ps`、`dispatcherHealth`、`attention` |
| `/api/teams/:team` | 岗位表（含冻结 / 静音 / 会话 ID）、Run、调度员状态 | `ps`、`dispatcher status` |
| `/api/teams/:team/attention` | 同 `wl attention --json` | `attention` |
| `/api/teams/:team/tasks?status&tags&stale` | 任务列表 | `task list` |
| `/api/teams/:team/tasks/:id` | 任务详情与历史 | `task show --history` |
| `/api/teams/:team/posts/:post` | 岗位详情：当前任务与排队任务、巡查信号及等级、冻结 / 静音、近期事件、终端最后 40 行 | `ps`、`patrol_state`、`log --post`、终端读取 |
| `/api/teams/:team/log?since&task&post&source&limit` | `TimelineEvent[]`（3A） | `log` |

终端最后 40 行的读取单独限速：每个岗位每 5 秒最多读一次，结果缓存。

### 6.3 写接口（POST）

请求体字段与命令行参数一一对应；命令行没有的参数一律不接受（多余字段 → 400 `input:unknown_field`）。

| 路径 | 请求体 | 对应命令 |
| --- | --- | --- |
| `/api/teams/:team/send` | `{ post, message, retryRequest? }` | `wl send` |
| `/api/teams/:team/tasks` | `{ title, post?, tags?, parent?, retryRequest? }` | `wl task create` |
| `/api/teams/:team/tasks/:id/escalate` | `{ reason, reopen?, retryRequest? }` | `wl task escalate` |
| `/api/teams/:team/tasks/:id/reassign` | `{ to }` | `wl task reassign` |
| `/api/teams/:team/tasks/:id/recover` | `{}` | `wl task recover` |
| `/api/teams/:team/gates/:gateId/resolve` | `{ resolution, reassign? }` | `wl task resolve` |
| `/api/teams/:team/posts/:post/freeze` | `{ reason }` | `wl dispatcher freeze` |
| `/api/teams/:team/posts/:post/unfreeze` | `{}` | `wl dispatcher unfreeze` |
| `/api/teams/:team/posts/:post/hush` | `{ forMs? }` | `wl dispatcher hush` |
| `/api/teams/:team/posts/:post/unhush` | `{}` | `wl dispatcher unhush` |
| `/api/teams/:team/questions/:messageId/reply` | `{ body, again? }` | `wl dispatcher reply` |

### 6.4 SSE

`GET /api/teams/:team/events`（需要会话；`EventSource` 自动带 cookie）：

- **`timeline`**：每 2 秒读一次 3A 的三张事件表中游标之后的新行，按时间合并后逐条推送 `TimelineEvent`。事件 id 为 `<来源>:<表内 id>`（如 `task:123`）。重连时浏览器带 `Last-Event-ID`，服务从该来源的该 id 之后续推；其余两个来源从连接建立时刻之后开始。首次连接（无 `Last-Event-ID`）不补历史，页面另用 `/log` 取历史。
- **`snapshot`**：每 5 秒计算一次该团队 `ps` 与 `attention` 结果的哈希（数据来自 6.1 的缓存），变化时推送 `{ team, posts, dispatcher, attentionCounts }`。
- 每 15 秒发一行注释 `: ping` 作为心跳。
- 同一服务的所有连接共用同一个按团队的读取循环（订阅者为 0 时停止该团队的循环）。

## 7. 控制台页面

所有页面共用左侧导航（团队切换器 + 6 个页面）；顶部显示 SSE 连接状态（实时 / 重连中 / 已断开）和待办数角标。跟随系统亮色 / 暗色主题，使用系统字体，不加载任何外部资源。

| 页面 | 路由 | 内容 | 操作 |
| --- | --- | --- | --- |
| 总览 | `/t/:team` | 调度员状态卡（运行中 / 已停止 / 失联、心跳）、Run 状态、待办数；岗位卡片（地址、agent、状态、当前任务、冻结 / 静音 / 巡查信号标记）；最近 20 条时间线 | 岗位卡上“发消息” |
| 收件箱 | `/t/:team/inbox` | `wl attention` 的分节：调度员失联、待回答的提问、等待决策的 gate、冻结岗位、卡住的任务、巡查信号、告警 | 每条旁边的操作按钮（提问 → 回答；gate → resolve / 改派；派发失主 → recover；冻结 → 解冻；巡查信号 → 静音 / 发消息）。没有对应写接口的（例如需要岗位自己执行的 `wl task done`）显示可复制的命令 |
| 任务看板 | `/t/:team/tasks` | 按 ready / dispatched / blocked / completed / failed 分列；卡片显示标题、主人、标签、第几轮、卡住原因角标；按标签、主人、“只看卡住的”筛选 | 新建任务（可直接派给岗位） |
| 任务详情 | `/t/:team/tasks/:id` | 标题、状态、主人、计划、父 / 子任务（评审 / 交接链）、闸门失败次数、最近一次完成的结果与 gate 输出文件路径、完整变迁历史 | 按状态显示：转人工、改派、recover、resolve |
| 岗位详情 | `/t/:team/posts/:post` | 状态、会话 ID（不显示会话标记，见 3A 第 4.3 节）、当前与排队任务、巡查信号及等级、冻结 / 静音信息、终端最后 40 行（只读，5 秒刷新）、该岗位的时间线 | 发消息、冻结 / 解冻、静音 / 取消静音 |
| 时间线 | `/t/:team/log` | `TimelineEvent` 列表，新的在上，实时追加；按来源、岗位、任务、时间范围筛选；展开查看完整 `detail`，点任务 / 岗位跳转详情 | — |

通用交互：

- 写操作都弹确认框；冻结、改派、resolve 必须填写原因或说明。
- 提交后：成功 → 右下角提示，并作废本页数据重新拉取；不确定 → 显示 CLI 的提示与“按原样重试”按钮（同一请求体、同一 `retryRequest`）；失败 → 显示 `message` 与 `hint`。
- 401 → 显示“会话已过期，请运行 wl console --link 获取新链接”。
- 终端预览与提问正文按纯文本渲染（不解释 HTML 或 ANSI 转义，ANSI 控制序列在服务端剥除）。

## 8. 代码结构

```text
packages/core/src/server/
  index.ts       # createConsoleServer(deps, opts) → { url, close }；组装各模块
  auth.ts        # 一次性 token、会话、CSRF、Host / Origin / Content-Type 校验
  routes.ts      # 路由表：路径 → 参数校验 → core 命令 / 查询；错误类别 → 状态码
  sse.ts         # 按团队的读取循环、游标、订阅者管理、心跳
  static.ts      # 静态资源、SPA 回退、CSP 与安全响应头
  control.ts     # /_control/link 与 console.json 的读写
packages/core/src/view/
  snapshot.ts    # cachedOrca：缓存只读方法 5 秒的 OrcaClient 装饰器；写后作废（放在 view/ 而非 server/，3C 的 wl tui 复用）
packages/web/    # 私有工作区包：Preact + Vite；构建产物输出到 packages/cli/dist/web/
  src/api.ts     # fetch 封装（带 CSRF 头）、错误类型、EventSource 封装与重连状态
  src/pages/*.tsx
  src/components/*.tsx
packages/cli/src/ # 新增 wl console 命令；--open 的终端启动复用 2B 的启动参数构造
```

- 根目录 `pnpm build` 增加 `packages/web` 的构建步骤；`packages/cli` 的 `files` 包含 `dist/web/`。
- `packages/web` 的依赖：`preact`；开发依赖：`vite`、`@preact/preset-vite`、`@testing-library/preact`、`jsdom`。`wingline` 包的 `dependencies` 不变。

## 9. 错误处理

| 错误码 | 类别 | 退出码 / 状态码 | 场景 |
| --- | --- | --- | --- |
| `console_port_in_use` | input | 退出码 1 | `--port` 指定的端口被占用 |
| `console_not_running` | input | 退出码 1 | `--link` 时没有在运行的服务 |
| `console_start_unconfirmed` | uncertain | 退出码 3 | `--open` 新建的服务 10 秒内没有就绪 |
| `console_no_worktree` | input | 退出码 1 | `--open` 需要新建终端，但没有 `--worktree` 也没有运行中的团队 |
| `console_tab_unsupported` | 提示 | 退出码 0 | Orca 不支持打开标签页，已打印链接 |
| `invalid_param` | input | 400 | 路径参数不合法 |
| `unknown_field` | input | 400 | 请求体含命令行没有的字段 |
| `body_too_large` | input | 413 | 请求体超过 64 KB |

- 单个请求出错只影响这个请求；未预期的异常返回 500 `internal`，记一行日志，服务不退出。
- SSE 读取循环里的异常只记日志，下一轮继续（与 2B 调度员循环相同）。
- `console.json` 写入失败 → 服务照常运行，打印警告（单实例检查与 `--link` 将不可用）。

## 10. 测试

- **服务端**（在随机端口起真实 HTTP 服务，后端接 FakeOrca 与临时注册表）：
  - 登录：一次性 token 只能用一次、过期、cookie 属性；401 / 403 / 421 的各个条件。
  - 写请求的三项校验（CSRF token、Origin、Content-Type）各自缺失时都被拒；请求体大小限制；多余字段被拒。
  - 每个读写接口调用了对应的 core 函数、返回格式正确；错误类别到状态码的映射。
  - 表驱动测试：全部写接口都经过 `auditedCommands`，审计事件带 `console:` 前缀、执行者为 `human`。
  - 5 秒缓存：并发请求只触发一次 Orca 调用；写后作废。
  - SSE：游标续推、`Last-Event-ID` 断点续传、`snapshot` 只在变化时推送、心跳、订阅者为 0 时停止循环。
  - 静态资源：路径穿越被拒、SPA 回退、安全响应头。
  - 单实例：`console.json` 存活时不起第二个服务；pid 已死时覆盖；退出时只删除自己的文件；`/_control/link` 的密钥校验。
- **前端**（Vitest + Testing Library + jsdom）：每个页面的渲染；操作表单的确认、必填项、提交；“按原样重试”发出相同请求；SSE 推送后的更新；断线重连状态；401 的提示；终端预览与提问正文按纯文本渲染。
- **端到端冒烟**（Playwright Chromium，只在 ubuntu CI 上跑一条）：启动服务 → 用登录链接登录 → 打开收件箱 → 回答一个提问（FakeOrca 后端）→ 时间线页出现对应事件。
- **契约**：`--open` 所用的标签页命令补真实回执样本（视探针结论）。
- **真机集成**（`pnpm test:live`，只在真机上跑，需人工确认）：`wl console --open` 后在 Orca 内置浏览器里看到总览页。

## 11. 不做的事（阶段 3B）

- 团队编辑器（表单 / YAML 双向、预演 Orca 调用）、设置页——3C。
- 向 Orca 原生界面同步状态——3C。
- `wl tui`——3C。
- 页面上的 `up`/`down`/`restore`、调度员启停——继续只在命令行做。
- 多用户、远程访问、非 loopback 绑定、账号体系。
- 浏览器推送通知——外部通知仍走 2B 的 `patrol.notify`。
- 会话持久化——服务重启后需要重新登录。

## 12. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Orca 没有打开内置浏览器标签页的 CLI 命令 | `--open` 不能在 Orca 内打开页面 | 第 3 节探针；退路为打印链接（`console_tab_unsupported`） |
| 内置浏览器对 cookie 或 `EventSource` 的支持与普通浏览器不同 | 登录失败或无法实时更新 | 探针第 2 条；不成立时用系统浏览器打开，服务端不变 |
| 本机其他进程访问控制台端口 | 未授权读取团队数据 | 只绑定 loopback；所有接口需要会话；会话只能由一次性 token 换取；写请求另需 CSRF 与 Origin |
| 恶意网页通过 DNS 重绑定访问本地服务 | 读取或篡改数据 | Host 校验（421）、SameSite=Strict、Origin 校验 |
| 多个页面并开导致频繁调用 Orca | Orca 负载上升 | 按团队 5 秒缓存、请求合并、SSE 共用读取循环、终端预览单独限速 |
| 终端预览或提问正文里含恶意 HTML / 转义序列 | 页面注入 | 一律按纯文本渲染；服务端剥除 ANSI 控制序列；CSP 禁止内联脚本 |
| `console.json` 被其他用户读取 | 控制密钥泄露，可申请登录链接 | 文件权限 0600；数据目录本身在用户主目录下 |
| 登录链接留在 `console@wingline` 终端的滚动记录里 | 能读该终端的进程可以登录 | 岗位 agent 本就能运行 `wl`，不构成权限提升；链接 5 分钟内有效且只能用一次；README 说明登录链接等同凭据 |
| 前端构建产物未随包发布 | `wl console` 打开空白页 | 发布前检查 `dist/web/index.html` 存在；服务启动时缺失则报错退出（`internal`，提示重新构建） |
