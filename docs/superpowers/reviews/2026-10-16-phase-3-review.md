# 阶段 3（3A–3D）spec 与计划复审

- 日期：2026-10-16
- 范围：`docs/superpowers/specs/2026-10-16-phase-3{a,b,c,d}-*-design.md` 与 `docs/superpowers/plans/2026-10-16-phase-3{a,b,c,d}-*.md`
- 方式：对照当前 main（5db123d）的代码与 `spikes/REPORT.md` 的实测结论逐项核对；每条发现都注明核对依据。
- 结论：**四份 spec 与计划方向正确，修改后可以进入实现。** 没有阻塞性的设计错误；有 6 处应在实现前改掉的问题（两处会让功能在常见情况下失效），9 处次要项可在实现时顺手处理。

## 1. 应在实现前修改

| # | 所属 | 问题 | 依据 | 改法 |
| --- | --- | --- | --- | --- |
| I-1 | 3A spec §5.2 第 3 步；3A 计划 Task 7 | **第二次重启后 `restore` 会回放上一次的旧回执。** 计划规定 `restore` 的请求键为 `restore:<team>:<post>:<gen>:<step>`，`gen` 取 `lifetimeGen`。但 `lifetimeGen` 只统计 `wl up` 自己的 `create`/`brief` 键，`restore` 建的终端不会让它前进。第一次重启后 `restore` 落账了 `restore:duo:builder:1:create`；Orca 再次重启后，同一个键已是 `done`，`recorded` 直接取回上一次的 handle（已失效），岗位被判为接回成功，实际没有新开终端。 | `packages/core/src/commands/up.ts` `lifetimeGen`：`while (done('create', g) && done('brief', g)) g++` 只看 `requestId(...)` 键 | `restore` 用自己的代数：`restoreGen(team, post)` = 已 `done` 的 `restore:<team>:<post>:<g>:create` 的最大 `g` + 1（终端仍活着时不前进）；在计划 Task 7 的 Interfaces 写明，并加测试“连续两次重启、两次 restore，第二次新建了终端且命令带新的会话 ID”。 |
| I-2 | 3A spec §4、§5.2；3B/3C 的岗位详情与 TUI；3D §5.2 | **会话标记会泄露进别的会话，导致 `ambiguous`。** 标记只要出现在任何一个 agent 的会话记录里，就会被引号精确搜索命中。duo 的两个岗位共用一个 worktree，`cwd` 过滤分不开它们。可能的泄露途径：牵头岗运行 `wl ps --json`、`wl attention`、`wl log`（若输出含标记），或调度员转述的内容含标记。3D 的远端环境 `cwd` 为空时只凭标记判断，影响更大。 | 探针报告 Linux 补充验证第 2 条：运行探针的会话因命令行里含标记而被搜中 | ① 规定标记只写进启动包，**不出现在任何 CLI 输出与 `--json` 结果里**（`ps`、`attention`、`log`、`restore` 的结果只给会话 ID，不给标记）；控制台岗位详情与 TUI 只显示会话 ID。② 搜索结果先排除已被本团队其他岗位登记为 `session_id` 的会话，再判定条数。③ 在 3A 计划 Task 6 加测试：两条命中、其中一条已是另一岗位的 `session_id` → `found`。 |
| I-3 | 3B spec §5.1；3B 计划 Task 3、8 | **SameSite=Strict 的 cookie 在登录重定向后可能带不上。** 登录链接从 Orca 或系统浏览器外部打开，`/auth` 写 cookie 后 302 到 `/`。Chromium 系浏览器对“由跨站上下文发起的重定向链”不发送 `SameSite=Strict` cookie，首屏会 401；用户刷新一次才正常。Orca 内置浏览器的行为未知。 | Chromium 的 SameSite 重定向链规则；3B 探针第 2 条只测了 cookie 能否写入，没测重定向后的首个请求 | `/auth` 成功时返回 200 的小页面，用 `<meta http-equiv="refresh" content="0;url=/">` 跳转（同源发起的导航，Strict cookie 会带上；CSP 不影响 meta refresh）；3B 探针第 2 条加一项“登录后首个 `/api/session` 请求是否带 cookie”。 |
| I-4 | 3B spec §6.1、§8；3B 计划 Task 2、5、7；3C 计划 Task 7 | **快照缓存覆盖不到 core 内部的 Orca 调用。** 计划让读接口与 SSE“复用 `ps`、`attention`、`listTasks`”，同时用 `OrcaSnapshot.tasks()/terminals()` 做 5 秒缓存。但这些 core 函数内部直接调用 `deps.orca.taskList`/`terminalList`，不经过 `OrcaSnapshot`。结果是页面开得越多，Orca 调用越多，Review Focus 第 4 条“每团队每 5 秒最多一次”做不到。 | `packages/core/src/commands/ps.ts:36`、`task/query.ts:42`、`:272` 直接调用 `deps.orca` | 把 `OrcaSnapshot` 改为**缓存型 OrcaClient 装饰器**：`cachedOrca(inner: OrcaClient, o: { ttlMs, now }): OrcaClient & { invalidate(team?: string): void }`，只缓存 `taskList`、`terminalList`、`terminalShow`、`workerList`、`runShow` 这些只读方法（同参数单飞），写方法直接透传并在完成后作废全部缓存。服务端与 TUI 把 `{ ...deps, orca: cachedOrca(deps.orca) }` 传给 core 函数。3B 计划 Task 2 与 3C 计划 Task 7 相应改写。 |
| I-5 | 3B spec §4.2；3B 计划 Task 8 | **`--open` 新建终端没有可用的 worktree。** spec 写“工作目录为 `WINGLINE_HOME`”，但 `orca terminal create` 需要的是 worktree 选择器，`WINGLINE_HOME` 不是 worktree。控制台服务所有团队，没有天然的 worktree。 | `dispatcherUp` 用 `worktree: lead.worktree`（`dispatcher/lifecycle.ts`）；`OrcaClient.terminalCreate(a: { worktree; title; command })` | 规定：`--open` 时取第一个状态为 `up` 的团队的牵头岗 worktree；没有任何团队时报 `console_no_worktree`（退出码 1，提示先 `wl up` 或直接运行 `wl console`）；可用 `--worktree <选择器>` 覆盖。3B 计划 Task 8 补测试。 |
| I-6 | 3C spec §4.1、§4.4；3C 计划 Task 3、4 | **表单拿不到字段的当前值。** 计划规定前端不解析 YAML、由服务端用 `setField` 写回，但 `GET …/spec` 只返回 YAML 文本，表单无法显示各字段现值。 | 3C 计划 Task 4 的 Interfaces | `GET …/spec` 与 `POST …/spec/validate` 的响应增加 `parsed`（YAML 解析后的原始对象，未经 schema 默认值填充；解析失败为 `null`）；表单只读写 `parsed` 与 `set`。 |

## 2. 次要项（实现时顺手处理）

- **M-1 审计包装的身份解析多一次 Orca 调用（3A 计划 Task 9）。** `resolveActor` 在设置了 `ORCA_TERMINAL_HANDLE` 时会调用 `terminalList`，每条写命令因此多一次 Orca 调用，Orca 不可达时还会让审计写失败。改为：命令执行完后再解析身份；解析失败记 `actor = 'unknown'`，不再调用第二次。`up` 的团队名在成功时取结果里的 `team`，失败时为 `-`，不为审计单独加载规格。
- **M-2 两个同类辅助函数重名（3B 计划 Task 8 `launchArgs`、3D 计划 Task 6 `selfCommand`）。** 统一为 3B 中定义的 `selfCommand(deps, args): { file, args }`，3D 直接复用。
- **M-3 3A 计划 Task 7 漏写两处 spec 规定：** 岗位按“牵头岗先、其余按 `team.yaml` 顺序”处理；接回或新开成功后更新 `posts.handle` 与 `posts.status = live`。
- **M-4 恢复与调度员的先后（3A 计划 Task 8）。** 第 6 步 recover 用 `teams.coordinator_handle` 作 `--from`；调度员刚被拉起时会重新认领协调者。规定 recover 在 `dispatcherUp` 确认心跳之后、重新读取 `teams.coordinator_handle` 再执行；并在 spec 风险表注明：`patrol.auto_recover` 需要连续两轮命中，调度员首轮只观察，不会与 `restore` 同时 recover 同一任务。
- **M-5 CSP 与 Preact 的内联样式（3B）。** `style-src 'self'` 不允许 HTML 里的 `style="…"` 字符串属性；Preact 通过 `el.style` 设置样式不受影响。前端约定只用 class 与对象形式的 `style`，不用字符串 `style`；加一个前端测试断言构建产物 `index.html` 不含 `style=`。
- **M-6 `context_low` 的去重键借用 `task_id` 列（3D 计划 Task 3）。** 可以接受，但会话换了之后旧行要一并清除（`cleared_at`），否则 `wl attention` 会同时显示新旧两条。补一条测试。
- **M-7 TUI 在 Windows 上的 VT 判断（3C 计划 Task 7）。** `stdout.hasColors()` 只是近似。改为：`process.platform === 'win32'` 时检查 `WT_SESSION` 或 `TERM_PROGRAM`，都没有时打印一行警告后继续（而不是直接报 `tui_unsupported_terminal`），渲染异常由用户自行判断；`tui_unsupported_terminal` 只在 `stdout.isTTY` 为真但 `columns` 为 0 时使用。
- **M-8 自启动里的 node 路径会过期（3D 计划 Task 6）。** 用户用 nvm 等切换 Node 版本后，写死的 `process.execPath` 可能不存在。`wl autostart status` 检查命令中的 node 与入口脚本是否存在，不存在时提示重新 `install`。
- **M-9 登录链接留在 `console@wingline` 终端的滚动记录里（3B）。** 岗位 agent 本就能运行 `wl` 命令，这不构成权限提升，但 README 应说明“登录链接等同凭据，5 分钟内有效且只能用一次”。

## 3. 核对过、确认没问题的点

- 3A 恢复后再执行 `wl up`：`launchPost` 中 `located && !started` 判定为 `already_live`，不会重发启动包（`up.ts` `launchPost`）。
- 3A 调度员拉起：Orca 重启后旧调度员终端不在，`dispatcherUp` 不会报 `dispatcher_stale`；`dispatcherHealth` 为 `stale`（锁行在、进程已死）时按 spec 拉起（`dispatcher/lifecycle.ts`）。
- 3A/3C/3D 的新 `patrol` 字段与 `posts[].environment` 在取默认值时不改变规格哈希：`patrolDelta` 已只哈希非默认字段（`spec/hash.ts`）；`environment` 需在 `hash.ts` 的 `posts` 映射中按“为空不写键”处理（3D 计划 Task 4 已写）。
- 3B 控制台以 `human` 身份执行写命令：控制台运行在 `console@wingline` 终端，`resolveActor` 按标题找不到已登记岗位，返回 `null`，即 `human`（`task/identity.ts`）。
- 3C `worktreeSet` 的 worktree 参数：注册表里的岗位 worktree 已被 `wl up` 固定为 `path:<绝对路径>`（`up.ts` `pinWorktrees`），可直接作为选择器。
- 3D 的 `classifyPreview` 迁移：现有实现只看最后 8 行（`SCREEN_TAIL_LINES = 8`），计划保持不变，画面信号另看最后 40 行，两者不冲突。

## 4. 建议的下一步

1. 按第 1 节修改 3A、3B、3C 的 spec 与计划（I-1 至 I-6），第 2 节的次要项一并写进对应计划任务。
2. 修改后做一次针对性复核，只看改动处。
3. 推送 `docs/phase-3a` 分支并开 PR 合并这批文档，再按选定的执行方式从 3A 开始实施。
