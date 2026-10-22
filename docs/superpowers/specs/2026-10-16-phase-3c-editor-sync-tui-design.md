# 雁阵 Wingline 阶段 3C：团队编辑器、Orca 界面同步与 `wl tui` 设计

- 日期：2026-10-16
- 状态：设计中（未实现，2026-10-22 复审已并入正文）—— 实现计划见 `docs/superpowers/plans/2026-10-16-phase-3c-editor-sync-tui.md`
- 范围：阶段 3（控制台与恢复）子项目 C：控制台的团队编辑器（保存 + 预演）与“关于与诊断”页、`wl up --draft`、由调度员把状态同步到 Orca 原生界面（工作区状态、卡片注释）、`wl tui`（总览 / 收件箱 / 时间线，可处理待办）。
- 依赖：阶段 3B（`docs/superpowers/specs/2026-10-16-phase-3b-console-design.md`，下称 3B：服务、登录与安全、写接口约定、按团队的只读快照）、阶段 3A（`auditedCommands`、`TimelineEvent`、`wl log` 的游标）、阶段 2B（巡查循环与 `PATROL_INTERVAL_MS`、重启后首轮只观察、`patrol:` 字段与 `patrolDelta` 规格哈希规则、`worktree_comment`）、阶段 1（`loadTeamSpec` 的校验、`wl up`）。
- 不含：页面上的 `up`/`down`/应用草稿、全局配置文件、修改终端标题、未读红点、TUI 中的任务看板与任务详情、编辑 NORMS / brief 文件内容。
- 承接：总纲第 4 节阶段 3、第 5.4 节控制台（团队编辑器、设置、状态同步到 Orca 原生界面）与 `wl tui`。

## 1. 目标与成功标准

- 在控制台里改团队编排时，能边改边看到校验结果与“改完会发生什么”，保存不会打断正在运行的团队。
- 不打开控制台，只看 Orca 自己的界面，就能知道每个 worktree 上的岗位在做什么。
- 在终端里（比如牵头岗旁边）有一个实时的团队视图，并能就地处理待办。

成功标准：

- 运行中的 `duo` 团队，在编辑器里给 builder 加一个 gate 并保存：团队不受影响（`wl task` 命令照常工作），同目录出现 `team.draft.yaml`；预演页给出差异与命令 `wl down duo` → `wl up teams/duo/team.yaml --draft`；执行后新规格生效，旧规格备份为 `team.yaml.bak`。
- 调度员在跑时，builder 开始一个任务后，Orca 界面上该 worktree 的工作区状态在一个巡查周期内变为 in-progress；开启 `worktree_comment` 时卡片注释显示 builder 的当前任务。
- `wl tui duo` 实时显示岗位与待办，在收件箱里选中一个提问、按 `Enter` 回答后，时间线出现对应事件；退出后终端恢复原状。

## 2. 全局约束补充

1. 不新增运行时依赖：编辑器的 YAML 读写用 core 已有的 `yaml` 库；TUI 自写 ANSI 渲染，只用 `node:readline`、`node:tty`。
2. 写操作一律经 3A 的 `auditedCommands`，执行者为 `human`；审计命令名前缀：控制台 `console:`（3B）、TUI `tui:`。
3. 终端标题是岗位身份（按标题查找岗位），任何功能都不得修改它。
4. 同步到 Orca 只是展示：它的失败不影响任务、巡查与任何命令的结果。
5. 函数 ≤ 50 行。

## 3. 先补探针（plan 的 Task 1）

新增 `spikes/worktree-status.ts`，在 macOS 或 Linux 真机上跑，结论写回 `spikes/REPORT.md`：

1. `orca worktree set --help` 列出的工作区状态参数（总纲写作 `--workspace-status`），可取值是否为 `todo`/`in-progress`/`in-review`/`completed`，设置后 `orca worktree show --json` 能否读回、Orca 界面上是否可见。
2. `--comment` 参数的实际形态（2B 时标为未验证）：能否写入多行、长度上限、能否清空。

判读：每一项单独决定——成立则按实测形态实现；不成立则该项不同步，对应开关保留但不起作用。结论记为 `orca/client.ts` 中的常量 `ORCA_WORKTREE_SUPPORT = { workspaceStatus: boolean; comment: boolean; commentMax: number | null }`；开关为 `true` 而对应项不支持时，`wl attention` 的 `warnings`（第 6.5 节）列出“Orca 不支持 <项>：patrol.<字段> 不起作用”。该条由规格与常量推导，开关打开期间一直显示，不需要去重状态。

## 4. 团队编辑器（控制台）

### 4.1 页面 `/t/:team/edit`

- **两个视图**：表单与 YAML，切换时双向同步，YAML 是唯一的真实来源。
  - 表单的修改通过 `yaml` 库的 Document API 写回 YAML 文档（在服务端完成，见第 4.4 节的 `set`），保留原有注释与字段顺序；YAML 视图的修改提交校验后用返回的 `parsed` 刷新表单（`parsed` 为 `null` 即语法错误时，表单只读，并提示 YAML 有语法错误）。
  - 表单覆盖：岗位（`id`、`agent`、`model`、`launch`、`worktree`、`brief`、`self_claim`、`tags`、`plan_first`）、`lead`、`links`、`gates`、`budgets.task`、`patrol`（含第 6 节新增的 `workspace_status`）。`norms` 与 `brief` 只编辑路径，不编辑文件内容。
- **实时校验**：修改停顿 400 毫秒后调用校验接口；错误标在字段旁或 YAML 对应行上，错误码与提示与 `wl up` 的校验相同。`loadTeamSpec` 遇到第一处错误即停，因此一次最多显示一条错误。
- **预演**：显示 `planSpecChange` 的结果（第 4.2 节），以及要执行的命令（团队运行中：`wl down <team>` → `wl up <spec> --draft`；团队已停止：`wl up <spec>`）。
- **保存**：团队运行中写草稿，已停止写正式规格（第 4.3 节）。已有草稿时编辑器默认打开草稿，显示“丢弃草稿”按钮。
- 页面底部注明：`team.yaml` 视为可信配置，`launch`、`gates`、`notify.command` 会在本机执行。

### 4.2 预演：`planSpecChange(current, next, { running, specPath })`

纯函数，输入为现行规格（未登记或读不到时为 `null`，此时所有岗位都算 `added`）、新规格，以及团队是否在运行和规格路径（用于拼命令）。岗位去向的说明文字是固定文案，不需要注册表里的岗位记录。输出：

- **岗位去向**：
  - `added`：新增岗位，`wl up` 会新开终端并发送启动包。
  - `kept`：配置没变。
  - `launch_changed`：`agent`/`model`/`launch`/`worktree` 有变化。说明：岗位终端还在时 `wl up` 会保持原终端，新的启动参数要等终端重建后才生效；需要立即生效请用 `wl down <team> --close`。
  - `removed`：岗位被删除。说明：`wl up` 不会关闭它的终端，该终端将不再归雁阵管理，请先关闭或 `wl down <team> --close`。
  - `brief_changed`：简报路径变化，只影响之后新开的会话。
- **字段差异**：`lead`、`links`、`gates`、`budgets`、`patrol` 等按字段列出旧值与新值。
- **命令**：见第 4.1 节；`--close` 只在有 `launch_changed`/`removed` 时作为可选项列出。
- **校验结果**：新规格未通过校验时只返回错误，不给命令。

### 4.3 保存与草稿

- 草稿文件：正式规格同目录、同名加 `.draft`（`team.yaml` → `team.draft.yaml`）。
- 团队运行中（`teams.status = up`）→ 写草稿；已停止或未登记 → 写正式规格。
- 写入前再次校验（未通过 → `spec_invalid`，`detail.errors` 为错误列表，不写文件）；写入采用“先写同目录临时文件再改名”，避免半截文件；写临时文件或改名失败时删除临时文件，原样抛出（`internal`，消息含路径）。
- **冲突检测**。保存请求带两个字段：
  - `running`：加载时看到的团队是否在运行。与服务端当前判断不同 → 409 `spec_conflict`（消息“团队状态已变化，请重新加载”），因为写入目标会随之改变。
  - `baseHash`：加载时**写入目标**文件的内容哈希。团队运行中，它是草稿的哈希，没有草稿时为 `null`；团队已停止，它是正式规格的哈希。客户端按 `running ? draft?.hash ?? null : hash` 取值。目标文件当前哈希与之不符 → 409 `spec_conflict`，页面提示重新加载。
  - 例外：目标文件当前内容的哈希已经等于提交内容的哈希时，直接返回成功、不写文件。这样同一请求重发（包括结果不确定后的重试）不会撞 409。
- 丢弃草稿：删除草稿文件；草稿不存在 → 成功（无操作）。
- 提醒：存在草稿时，`wl attention` 的 `warnings`（第 6.5 节）与控制台总览页显示一条“有未应用的规格草稿：<路径>（执行 wl down <team> 后 wl up <spec> --draft）”。

### 4.4 接口（3B 的约定与安全校验，写接口进审计）

| 方法与路径 | 内容 |
| --- | --- |
| `GET /api/teams/:team/spec` | `{ specPath, yaml, parsed, hash, draft: { yaml, parsed, hash } \| null, running }` |
| `POST /api/teams/:team/spec/validate` `{ yaml, set? }` | `{ yaml, parsed, errors: Array<{ path, code, message, line }>, preview }`，不写文件 |
| `POST /api/teams/:team/spec` `{ yaml, baseHash, running, retryRequest? }` | 保存，返回 `{ wrote: 'draft' \| 'spec', path, hash }` |
| `POST /api/teams/:team/spec/discard-draft` `{ retryRequest? }` | 丢弃草稿，返回 `{ discarded: boolean }` |

- `parsed`：YAML 解析后的原始对象（未经 schema 默认值填充；语法错误时为 `null`），供表单显示各字段现值；前端不自己解析 YAML（复审 I-6）。
- `errors`：至多一条（第 4.1 节）。`code` 沿用 `loadTeamSpec` 抛出的错误码（`spec_invalid`、`links_unknown_post`、`file_missing`、`field_removed` 等；YAML 语法错误也是 `spec_invalid`），`path` 为字段路径（语法错误时为空数组），`line` 为行号或 `null`。
- `preview`：`planSpecChange` 的结果；`errors` 非空时为 `null`。
- `set`：`{ path: Array<string | number>, value }`。给出时服务端先用 Document API 把这一处写回 `yaml`（保留注释与顺序；`value` 为 `null` 表示删除该字段），再校验并返回新的 `yaml` 与 `parsed`；表单的每次修改都走这里。`yaml` 有语法错误时不能 `set`，返回 400 `spec_invalid`。
- `yaml` 字段上限 **48 KB**（按 UTF-8 字节计），超出 → 400 `spec_too_large`。其他写接口的请求体仍受 3B 的 64 KB 上限约束（超出 413）；保存与校验规格这两个接口放宽到 `48 KB × 6 + 4 KB`（JSON 里换行等字符要转义，最坏每字节变 6 字节），否则 40 KB 出头的 yaml 会先撞 413 而得不到 `spec_too_large`。
- 路由登记：
  - 保存与丢弃草稿是写接口，登记在 `api-write.ts` 的 `WRITE_ROUTES`、`WriteCommands`、`CONSOLE_AUDIT` 三处。`fields` 必须含 `retryRequest`（`test.each(WRITE_ROUTES)` 的要求）；两个命令天然幂等（第 4.3 节的“内容已相同即成功”，丢弃不存在的草稿即成功），`retryRequest` 只做格式校验，不另存。命令形态为 `(deps, a) => Promise<…>`，由 `commands/spec.ts` 的 `saveSpecCmd`、`discardDraftCmd` 包装 `draft.ts` 的同步函数，并按 `a.team` 从注册表取 `specPath`（团队未登记 → `team_unknown`）。审计摘要只记 `wrote`、`path` 与哈希，不记 YAML 内容。
  - `GET …/spec`、`GET /api/about` 与 `validate` 放在新文件 `server/api-spec.ts`，在 `index.ts` 的 `buildRouter` 中注册。`validate` 虽是 POST，但不写文件、不进审计；它和其他 POST 一样经过 3B 的 Origin 与 CSRF 校验。

### 4.5 `wl up <spec> --draft`

1. 找同目录的草稿；不存在 → `draft_not_found`（退出码 1）。
2. 按 `loadTeamSpec` 校验草稿；失败 → 与 `wl up` 相同的校验错误，不改动任何文件。
3. 团队仍在运行（`teams.status = up`）且 `specHash(草稿)` 与注册表的 `teams.spec_hash` 不同 → `team_spec_changed`（沿用现有错误，提示先 `wl down <team>`），不改动任何文件。比较的是规格哈希（2B 的规范化哈希），不是文件字节哈希：只改了注释的草稿可以在运行中应用。
4. 把正式规格复制为 `team.yaml.bak`（已存在则覆盖），再把草稿改名为正式规格；改名失败 → 删除刚写的备份，报错退出（正式规格未被改动）。
5. 照常执行 `wl up <spec>`。

## 5. 关于与诊断（控制台 `/settings`，只读）

`GET /api/about` 返回以下各项，每项附来源（`env`、`default`、`registry`、`file`、`orca`）。core 函数为异步的 `about(deps, o)`：取 Orca 版本要执行一次外部命令，失败时该项值为 `null`、附失败原因，不影响其余各项。

- 雁阵版本；Orca 可执行文件路径（及按哪条规则解析到的：`WINGLINE_ORCA`、`ORCA_CLI_COMMAND` 或平台默认）、Orca 版本（来源 `orca`）、是否在已验证的版本范围内。
- 数据目录（`WINGLINE_HOME` 或默认）、注册表的迁移版本、`logs/` 占用空间。
- 每个团队：规格文件路径、状态、是否有草稿、调度员状态（`dispatcherHealth`）。
- 控制台服务：pid、端口、启动时间。

不引入新的配置文件，页面不提供任何写操作。

## 6. 同步到 Orca 原生界面（调度员）

### 6.1 开关

在 `team.yaml` 的 `patrol:` 下：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `workspace_status`（新增） | `true` | 同步岗位所在 worktree 的工作区状态 |
| `worktree_comment`（2B 已有） | `false` | 为 `true` 时同步卡片注释：从 2B 的“只写通知”改为写岗位当前状态，通知并入其中（第 6.3 节） |

两个字段取默认值时不进规格哈希（2B 的 `patrolDelta` 规则），已有团队升级后哈希不变。

### 6.2 岗位状态

纯函数 `postWorkspaceStatus(p, tasks, verdictOf)`，不额外调用 Orca：

- `p = { address, handle }`：岗位地址与注册表 `posts.handle`（可能为 `null`）。
- `tasks`：本轮 `ScanSnapshot.tasks`（`TaskRow[]`，已合并 `task_ext` 的 `kind`、`claimedBy`、`epoch`）。
- `verdictOf(taskId, epoch)`：注册表 `getVerdict`，取 `task_done` 中该轮的结束记录。`sent_for_review` 不是任务状态，而是 `task_done.result`（JSON，`DoneResult`）里的 `closure.kind`，`ScanSnapshot` 里没有，所以要另查。

| 岗位当前情况 | 状态 |
| --- | --- |
| 有 `status = dispatched` 且 `assigneeHandle = p.handle` 的任务 | `in-progress` |
| 有一个未结束（`status` 不是 `completed`/`failed`）的 `kind = review` 任务，其父任务 `P` 满足：`verdictOf(P.id, P.epoch)` 已结束（`finishedAt` 非空）、`verdict.post = p.address`、`result.closure.kind = 'sent_for_review'` | `in-review` |
| 有 `status = ready` 且 `claimedBy = p.address` 的任务 | `todo` |
| 以上都没有 | `completed` |

按表格从上到下取第一个满足的。`p.handle` 为 `null` 时第一行不成立。`result` 解析失败时视为不满足第二行。

### 6.3 worktree 汇总

- **归组键**：注册表 `posts.worktree` 存的是选择器（`path:/abs`、`current` 等，见 `up.ts`），不是绝对路径。以 `path:` 开头的直接去掉前缀；其余选择器用 `orca.worktreeShow({ worktree })` 解析出 `path`，每轮巡查内按选择器缓存一次（`cachedOrca` 不缓存 `worktreeShow`）。解析失败的岗位本轮跳过，不计入失败次数。`orca_sync.worktree` 存解析后的绝对路径，写入时以 `path:<绝对路径>` 作为 `worktree` 参数。
- 一个 worktree 上有多个岗位时，状态取优先级最高的：`in-review` > `in-progress` > `todo` > `completed`。
- 注释：每个岗位一行，按岗位在规格中的顺序排列，形如 `builder：实现登录（进行中，第 2 轮）`；没有任务时为 `builder：空闲`。该岗位有未清除的巡查信号时在行尾加 `⚠ <信号中文名>`（多个时取 level 最高的一个）；被冻结时加 `❄ 已冻结`。任务标题等外部文本先经 `plainText` 剥除控制字符，换行替换为空格。整段最长 500 字符（或探针测得的 `commentMax`，取小者），超出截断并以 `…` 结尾（`…` 计入长度）。

### 6.4 写入

- 调度员每次巡查扫描（2B 的 `PATROL_INTERVAL_MS`）末尾计算一次，与注册表 `orca_sync` 表中该 worktree 上次写入的值比较，不同才调用 Orca（`orca worktree set …`，参数形态按第 3 节探针）。
- 成功 → 更新 `orca_sync`（`status`、`comment`、`written_at`，`fail_count = 0`）。
- 失败 → `fail_count + 1`，记一条 `patrol_events`（`action = orca_sync`，`outcome = failed`，`detail = { worktree, error: <错误码> }`），下一轮重试；`fail_count ≥ 3` 的 worktree 停止尝试。
- 停止期间，`wl attention` 的 `warnings` 列出“Orca 同步已停止：<worktree>（连续 3 次失败，重启调度员后重试）”。该条从 `orca_sync` 推导，停止期间一直显示。
- 调度员启动时把本团队所有 `orca_sync` 行的 `fail_count` 清零（`resetOrcaSyncFailures(team)`），从而“重启后重新尝试”。
- 重启后第一轮只观察（2B 的 `observeOnlyNextScan`）同样适用：首轮不对 Orca 写任何东西（包括巡查清除信号时触发的重算），也不更新 `orca_sync`。
- `orca_sync` 按 `(worktree, team)` 记录：两个团队共用一个 worktree 时各记各的上次写入值，不会互相覆盖；同一 worktree 上谁的值先变谁先写。
- 某项开关为 `false` 或探针判定不支持时，调用里不带该参数；两项都不带时不调用。
- 调度员不在运行时不同步；README 写明“Orca 界面上的状态需要调度员在运行”。
- 2B 的 `worktree_comment` 原先在通知时写注释的路径（`outlets.ts` 的 `worktreeComment`）改为调用本节的同一写入函数，不再单独写：通知不再覆盖整段注释，而是体现为该岗位一行末尾的信号标记。

### 6.5 `wl attention` 的 `warnings`

`AttentionReport` 目前只有 `frozen/signals/questions/stale/unavailable`，本阶段新增 `warnings: string[]`，内容为：未应用的规格草稿（第 4.3 节）、Orca 不支持某项同步（第 3 节）、某 worktree 同步已停止（第 6.4 节）。四处消费方同步修改：

- CLI 的 `renderAttention`：新增“告警”一节，每条一行。
- 控制台收件箱页：在列表顶部显示告警。
- SSE 快照的 `attentionCounts`：新增 `warnings` 计数，顶栏待办数把它计入。
- TUI 的收件箱视图：告警作为一个分节，只显示、没有操作。

注意与 `DispatcherStatus.warnings`（`wl dispatcher status` 已有的字段）区分，两者各自独立，不合并。

## 7. `wl tui`

### 7.1 命令与视图

```
wl tui [team]
```

- 省略团队名：只登记了一个团队时直接进入，否则先显示团队列表（名称、状态，`↑` `↓` 选择、`Enter` 进入、`q` 退出）供选择；没有任何团队 → `team_unknown`。给出的团队名未登记 → `team_unknown`。
- 标准输入或输出不是 TTY → `tui_not_tty`（退出码 1）。
- 三个视图：
  1. **总览**：调度员状态行；岗位表（地址、agent、状态、当前任务、冻结 / 静音 / 巡查信号标记）；底部最近 8 条时间线。
  2. **收件箱**：`wl attention` 的分节（含第 6.5 节的告警），每条一行。
  3. **时间线**：`TimelineEvent` 列表，新的在下，实时追加，可按来源过滤。过滤输入为 `source:<来源>`、`post:<岗位>`、`task:<任务 id>` 之一，空输入清除过滤。

### 7.2 按键

| 按键 | 作用 |
| --- | --- |
| `1` `2` `3` / `Tab` | 切换视图 |
| `↑` `↓` / `j` `k` | 选中行 |
| `Enter` | 打开选中项的操作菜单 |
| `/` | 时间线视图里按来源 / 岗位 / 任务过滤 |
| `r` | 立即刷新 |
| `R` | 结果不确定时按原样重试上一次写操作 |
| `?` | 帮助 |
| `q` / `Ctrl-C` | 退出 |

### 7.3 操作

- 收件箱：提问 → 回答；gate → resolve / 改派；派发失主 → recover；冻结 → 解冻；巡查信号 → 静音 / 发消息。
- 总览选中岗位：发消息、冻结 / 解冻、静音 / 取消静音。
- 没有写接口的条目显示对应的 `wl` 命令。
- 需要输入的内容在底部单行输入框填写（可打印字符、退格、左右移动、`Enter` 提交、`Esc` 取消），提交前再确认一次（`y` 确认，其他键取消）。
- 写操作经 `auditedCommands` 执行（前缀 `tui:`），结果显示在底部状态行。TUI 不另写一份命令表：把 `api-write.ts` 的 `consoleCommands()` 改为 `auditedWriteCommands(prefix: 'console:' | 'tui:')`，与控制台共用 `CONSOLE_AUDIT`；`consoleCommands()` 保留为 `auditedWriteCommands('console:')`。
- 结果不确定时，core 抛出的错误带 `detail.retryRequest`（2026-10-21 复审修复已落地，见 3B spec 的响应约定）。状态行显示 CLI 的提示，`R` 以同一参数、同一 `retryRequest` 重试；没有不确定的上一次操作时 `R` 无效果。

### 7.4 数据

- 在进程内直接调用 core，不依赖控制台服务。
- 与 3B 共用缓存型 OrcaClient 装饰器 `cachedOrca`（`packages/core/src/view/snapshot.ts`）：TUI 把 `{ ...deps, orca: cachedOrca(deps.orca) }` 传给 core 函数，只读调用 5 秒内合并。
- 时间线按 3A `wl log --follow` 的游标每 2 秒读一次；岗位与待办每 5 秒刷新；写操作完成后立即刷新并作废快照。

### 7.5 渲染

- 进入时切换到备用屏幕缓冲区、隐藏光标、开启 raw 模式；只在内容变化时按行差分重绘。
- 终端尺寸变化（`stdout` 的 `resize` 事件）时重新布局并整屏重绘。
- 按显示宽度截断与对齐：自写 `cellWidth`（东亚宽字符与常见 emoji 计 2 列、组合字符计 0 列、控制字符剥除），单独测试。
- 退出时恢复终端（退出备用屏幕、显示光标、关闭 raw 模式）：在 `finally`、`process.on('exit')` 与 SIGINT/SIGTERM/SIGHUP 处理中都执行一次（幂等）；未捕获的异常先恢复终端再打印错误。
- Windows：要求支持 VT 序列的终端（Windows Terminal、新版控制台）。没有可靠的探测方法，因此不拒绝运行：没有 `WT_SESSION` 也没有 `TERM_PROGRAM` 时先打印一行警告“当前终端可能不支持 VT 序列，显示异常请改用 Windows Terminal”，再照常启动（复审 M-7）。`tui_unsupported_terminal` 只用于 `stdout.isTTY` 为真但报告的列数为 0 的情形。
- 提问正文、消息、任务标题、时间线摘要等外部文本在显示前经 core 已有的 `plainText`（`view/plain-text.ts`）剥除控制字符与 ANSI/OSC 序列，换行替换为空格。否则一条带 `\x1b]0;…\x07` 的提问就能改掉终端标题，违反第 2 节约束 3。
- 宽度小于 40 列时只显示一行“窗口太窄”，放大后恢复。

## 8. 注册表迁移

追加一个迁移版本：

```sql
CREATE TABLE orca_sync (
  worktree TEXT NOT NULL,
  team TEXT NOT NULL,
  status TEXT,
  comment TEXT,
  written_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worktree, team)
);
```

带一个从 3A/3B 数据库升级的测试；规格哈希不变。

## 9. 代码结构

```text
packages/core/src/view/snapshot.ts     # cachedOrca：缓存只读方法的 OrcaClient 装饰器（3B 与 TUI 共用）
packages/core/src/spec/plan-change.ts  # planSpecChange
packages/core/src/spec/load.ts         # 抽出 validateSpecText（从字符串校验），loadTeamSpec 改为读文件后调用它
packages/core/src/spec/edit.ts         # setField：Document API 写回一处
packages/core/src/spec/draft.ts        # 草稿路径、保存（临时文件 + 改名）、baseHash、--draft 的替换流程
packages/core/src/commands/spec.ts     # saveSpecCmd、discardDraftCmd：(deps, a) => Promise 形态，供写路由与审计
packages/core/src/commands/dispatcher/orca-sync.ts  # postWorkspaceStatus、worktree 归组与汇总、注释拼接、写入
packages/core/src/commands/about.ts    # 关于与诊断（异步）
packages/core/src/server/api-spec.ts   # GET spec、validate、GET about（buildRouter 注册）
packages/core/src/server/api-write.ts  # 保存 / 丢弃草稿登记 WRITE_ROUTES、WriteCommands、CONSOLE_AUDIT；auditedWriteCommands(prefix)
packages/web/src/pages/Edit.tsx、Settings.tsx
packages/cli/src/tui/                  # screen.ts（备用屏幕、差分、恢复）、width.ts（cellWidth）、keys.ts、views/*.ts、app.ts
```

3B 的 spec 已把快照模块定在 `core/src/view/`（而不是 `server/`），以便 TUI 复用。

## 10. 错误处理

| 错误码 | 类别 | 退出码 / 状态码 | 场景 |
| --- | --- | --- | --- |
| `draft_not_found` | input | 退出码 1 | `wl up --draft` 找不到草稿 |
| `spec_conflict` | input | 409 | 保存时文件在这期间被改过 |
| `spec_invalid` | input | 400 | 保存的 YAML 未通过校验（`detail.errors`，不写文件）；或 `validate` 在 YAML 有语法错误时仍带了 `set` |
| `spec_too_large` | input | 400 | `yaml` 字段超过 48 KB |
| `tui_not_tty` | input | 退出码 1 | `wl tui` 不在交互式终端里 |
| `tui_unsupported_terminal` | input | 退出码 1 | 终端报告的列数为 0，无法布局 |

- `wl up --draft` 的替换顺序为“校验 → 备份 → 改名 → up”；任一步失败都不会留下半新半旧的规格文件。
- Orca 同步失败只记事件与告警，不影响巡查与任务（第 6.4 节）。
- TUI 中单次写操作失败只显示在状态行，TUI 不退出；读取循环的异常显示为顶部“数据过期”提示，下一轮继续。

## 11. 测试

- **编辑器**：`planSpecChange` 的每种岗位去向、字段差异、团队运行 / 停止两种命令、校验失败；表单修改写回后保留注释与字段顺序；校验接口与 `wl up` 的错误一致；保存（运行中写草稿、停止写正式规格、运行中且无草稿时 `baseHash = null` 的首次保存成功、`running` 与服务端不符 409、`baseHash` 冲突 409、内容已相同时重发成功、`spec_invalid` 不写文件、临时文件 + 改名、目录不可写时不留临时文件）；`spec_too_large`；丢弃草稿；写路由进审计且接受 `retryRequest`；`validate` 不进审计；前端表单与 YAML 的双向同步、语法错误时表单只读、校验错误标注、预演渲染、总览页草稿提醒。
- **`wl up --draft`**：没有草稿；草稿校验失败时不动任何文件；团队仍在运行且规格哈希不同时拒绝、只改注释时允许；成功时的备份与替换；改名失败时清理备份。
- **关于与诊断**：每一项的值与来源标注（用不同的环境变量组合）；Orca 版本取不到时该项为 `null`，其余照常。
- **`warnings`**：三种来源各自出现与消失；四处消费方都显示。
- **Orca 同步**：`postWorkspaceStatus` 的四种状态与优先顺序（含 `handle` 为 `null`、`result` 不可解析）；选择器归组（`path:` 前缀、`current` 经 `worktreeShow` 解析且每轮只解析一次、解析失败跳过）；多岗位共用 worktree 的汇总；注释拼接、信号与冻结标记、外部文本剥除控制字符、截断；只在值变化时写入；首轮只观察；失败记 `patrol_events`；连续 3 次失败后停止并出现在 `warnings`、调度员启动时清零后恢复；开关为 `false` 或不支持时不带对应参数；两个开关的默认值不改变规格哈希；`worktree_comment` 的通知路径改走同一写入函数。
- **TUI**：`cellWidth`（中文、英文、emoji、组合字符、控制字符）；按行差分渲染（写入内存终端后比较屏幕快照）；按键状态机（视图切换、选择、操作菜单、输入框编辑、确认、`R` 重试、`/` 过滤、`?` 帮助、团队选择）；尺寸变化后整屏重绘、过窄提示；外部文本里的 ANSI/OSC 序列不会写到终端；退出与异常时恢复终端；非 TTY 报错；写操作经 `auditedWriteCommands('tui:')`。
- **迁移**：从 3A/3B 数据库升级。
- **真机集成**（只在真机上跑，需人工确认）：调度员运行时，Orca 界面上的工作区状态随任务开始与完成而变化。

## 12. 不做的事（阶段 3C）

- 页面或 TUI 上的 `up`/`down`/应用草稿：保存后仍由人在命令行执行。
- 全局配置文件。
- 修改终端标题（标题是岗位身份）。
- 未读红点。
- TUI 中的任务看板与任务详情（由控制台提供）。
- 编辑 NORMS 与 brief 文件的内容。
- 没有调度员时的 Orca 同步。

## 13. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Orca 没有工作区状态参数，或 `--comment` 形态与预期不同 | 同步做不了 | 第 3 节探针；逐项退路，开关保留但不起作用，打开期间在 `warnings` 中提示 |
| 多岗位共用一个 worktree 时，界面只有一个状态 | 看不出是哪个岗位在忙 | 优先级汇总 + 每岗位一行的注释（开启 `worktree_comment` 时） |
| 用户在 Orca 界面里手动改了工作区状态 | 调度员下一次变化时覆盖 | 只在雁阵计算的值变化时写入，不会每轮覆盖；文档说明该状态由雁阵维护 |
| 草稿与正式规格长期分叉 | 用户忘了应用草稿 | 总览页与 `wl attention` 显示“有未应用的草稿”；编辑器默认打开草稿 |
| 表单写回 YAML 时改变了用户的格式 | 版本对比出现无关改动 | 用 Document API 只改动涉及的节点；测试覆盖注释与顺序保留 |
| TUI 异常退出后终端停留在 raw 模式 / 备用屏幕 | 终端不可用 | 多处幂等恢复；未捕获异常先恢复再报错；测试覆盖 |
| 宽字符宽度计算与终端实际显示不一致 | 表格错位 | `cellWidth` 按 Unicode 东亚宽度表实现并测试；截断留 1 列余量 |

## 修订记录

- **2026-10-21 复审**：阶段 3A/3B 落地后核对出 5 处前提失效（`warnings` 字段不存在、`posts.worktree` 是选择器、写路由三处登记、TUI 复用写命令表、`postWorkspaceStatus` 的输入不够）。
- **2026-10-22 复审**：上述 5 条已并入正文（第 6.5、6.3、4.4、7.3、6.2 节），不再单列。同时补充：保存的 `running` / `baseHash` 冲突规则与重发幂等（第 4.3 节）、`spec_too_large` 与 48 KB 上限（第 4.4 节）、`validate` 的路由位置、`--draft` 比较规格哈希而非文件哈希（第 4.5 节）、`about` 为异步（第 5 节）、探针结论的常量与告警（第 3 节）、`fail_count` 在调度员启动时清零（第 6.4 节）、TUI 外部文本复用 `plainText`（第 7.5 节）。
