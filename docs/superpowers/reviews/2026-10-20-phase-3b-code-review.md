# 阶段 3B 代码复审报告（2026-10-20）

**范围**：`1d439b3..554ee3f`（16 个提交，79 个文件，+6775/−28），已合入 main 为 `bccd3db`。
**依据**：`docs/superpowers/plans/2026-10-16-phase-3b-console.md`、`docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`、实施前复审 `2026-10-16-phase-3-review.md`。
**验证**：`pnpm typecheck` 通过；`packages/core/test/server`、`test/view`、`packages/web/test`、`packages/cli/test` 共 15 文件 144 测试通过；本机 e2e 未跑（Playwright Chromium 未安装，环境问题，CI e2e job 覆盖）。Critical-1 与 Important-3（close）经 /tmp 临时脚本实测复现，未动工作树。

**结论：With fixes**——主干质量高，Critical-1 必须修复后方可视为 3B 收口。

## 前置复审项核验

| 项 | 结论 |
| --- | --- |
| I-3 `/auth` 200 + meta refresh | 已实现（`server/index.ts:89-94`） |
| I-4 `cachedOrca` 装饰器注入 | 已实现（`view/snapshot.ts`、`server/index.ts:59-64`） |
| I-5 `--open` worktree 解析 | 部分：`consoleWorktree` 不筛 `status === 'up'`（见 I-5'） |
| M-2 `selfCommand` 共享 | 未实现：`cli/console.ts:40-45` 复制 `dispatcherLaunchCommand` 且丢失 Windows 守卫 |
| M-5 无内联 style/script | 已实现（构建产物实测干净） |
| M-9 README 凭据声明 | 已实现 |

## Strengths

- `cachedOrca` 装饰器方案正确：同参单飞、失败不缓存、写后作废，core 内部 Orca 调用一并命中，Review Focus #4（多标签页不放大 Orca 调用）架构上成立。
- SSE 游标语义正确：cursor 取自未截断查询，首连不补历史、`Last-Event-ID` 只回退对应来源，事件 id 与 `cursorFrom` 解析闭环。
- 安全主干扎实：Host 校验先于一切；token 只存哈希、单次有效；CSRF `timingSafeEqual`；静态服务三重防穿越；`WLS-` 标记不外泄有测试。
- 前端纪律好：写操作从不自动重试、重试带原请求体；SSE 退避 ≥5s、401 转 closed；终端预览纯文本渲染。
- fix 提交质量高，附正反测试；探针报告诚实。

## Issues

### Critical

**C-1 请求处理器无顶层异常兜底，单个请求可杀死整个进程。** `server/index.ts:70` async handler 的 Promise 被忽略，任何异常 → unhandled rejection → Node ≥15 进程退出。实测：登录后 `GET /api/teams/ghost/events` → `knownTeam` 抛 `team_unknown` → 进程崩溃。现实触发：页面开着时团队被移除，`EventSource` 自动重连即崩。违反 spec §9。

### Important

- **I-2 SSE 路由绕过参数校验**：`server/index.ts:133-140` 正则抢在 Router 前分派，非法团队名直达 `readTimeline`（Review Focus #3）。
- **I-3 `close()` 不关 SSE 连接**：`sse.ts:150-161` 只清定时器；`server.close()` 等连接断开。开着页面 Ctrl+C 挂起；期间 `console.json` 已删，可误起第二个服务。
- **I-4 M-2 未落实**：`launchLine` 复制 `dispatcherLaunchCommand`，丢 `nodeOnPath` 与 `WINDOWS_UNSAFE` 守卫；3D 还要复用。
- **I-5 `consoleWorktree` 偏差**：不筛 `up` 团队（已停止团队被选中）；且"服务已运行但无团队"时 `--open` 因解析 worktree 退出 1，丢掉已可用链接。
- **I-6 前端重试体与服务端白名单不匹配**：TaskDetail/Inbox/PostDetail 重试附加 `retryRequest`，但 recover/gates resolve/freeze/unfreeze/hush/unhush/reassign/reply 白名单不含该字段 → 重试必撞 `unknown_field` 400（现靠 core 不返回 `retryRequest` 才未引爆）。
- **I-7 计划点名测试缺失**：HTTP 层 SSE 零测试；"新服务 10 秒未就绪 → 退出码 3"；`Last-Event-ID` 恢复、tick 失败自愈；审计表测试仅覆盖 5/11 路由（`86cdeb0` 修的 createTask bug 恰在未覆盖的 6 个里）；`api-read.test.ts:104-110` 的 `a/b` 用例因 `if (route)` 空转。
- **I-8 "函数 ≤ 50 行"被最大新函数违反**：`createConsoleServer` ~207 行、`registerWriteRoutes` 167 行、`registerReadRoutes` 144 行、`serveStatic` 73 行、`startLoop` 55 行。
- **I-9 安全响应头只在静态路径**：`writeEnvelope`、`/auth`、`/_control/link`、SSE、421 分支全缺 CSP/nosniff/no-referrer/no-store（Global Constraints 硬要求）。

### Minor

- M-10 SSE 重连算游标做全表 `readTimeline`（O(历史)）。
- M-11 413 后仍读完上传体，不 `req.destroy()`。
- M-12 `checkParam` 对 `undefined` 放行（`"undefined"` 恰好匹配规则），产出误导报因；`reassign`/`to` 未走 `checkParam`。
- M-13 `packages/cli/package.json` 无 `files` 字段。
- M-14 `/api/session` 的 `version` 硬编码 `'1.0.0'`。
- M-15 页面细项缺口（gate 输出路径、时间范围筛选、卡住角标）。
- M-16 `consoleCommands(_deps)` 参数从未使用。
- M-17 Auth 过期条目不主动清扫。
- M-18 每路由 `finally { invalidate() }` 与 `cachedOrca` 写后自动作废重复。

## Declined to judge（执行方裁定：全部为客户端/服务端成对自洽的措辞偏差，不判）

`/auth?token=` vs `t=`；`X-Control-Key` vs `X-Wingline-Control`；controlKey base64url vs 十六进制；`console: send` 带空格 vs 示例无空格；`invalid_json` 为良性增补；收件箱无"告警"分节（`AttentionReport` 无该字段）；回答提问 UI 无 `again` 选项；Windows 反斜杠穿越（resolve+startsWith 已封死）；本机 e2e 失败（环境问题）；`showTask` 增补 `gateId`（计划外加法，gate 页面必需）；看板按主人筛选的客户端实现。

## Assessment

**Ready to merge? With fixes**（已合并，作为合并后跟进项处理：修复计划见 `docs/superpowers/plans/2026-10-20-phase-3b-review-fixes.md`）

**Reasoning**：架构与安全主干质量高、测试大体可信；但 C-1"一个请求杀掉整个服务"实测可复现且违反 spec §9，加上 SSE 参数校验与 close() 两处同类硬伤，必须修复；其余项可随后跟进。
