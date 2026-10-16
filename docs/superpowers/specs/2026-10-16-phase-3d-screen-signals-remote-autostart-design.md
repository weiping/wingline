# 雁阵 Wingline 阶段 3D：画面信号、远端环境恢复、未读标记与登录后自动恢复设计

- 日期：2026-10-16
- 状态：设计中（未实现）
- 范围：阶段 3 的收尾子项目 D，集中前面各份 spec 推迟到阶段 3 的事项：
  1. 读画面的巡查信号：“上下文快满”（`context_low`）与“用量上限”（`usage_limit`）；
  2. 远端 / 配对环境（如 Lima VM）里岗位的会话恢复；
  3. 有新待办时在牵头岗终端上打未读标记；
  4. 登录后自动恢复：`wl restore --all` 与 `wl autostart`。
- 依赖：阶段 3A（`docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md`，下称 3A：`wl restore`、会话标记、`auditedCommands`）、阶段 3C（`docs/superpowers/specs/2026-10-16-phase-3c-editor-sync-tui-design.md`，下称 3C：Orca 卡片注释的信号标记）、阶段 2B（巡查循环、`patrol_state`/`patrol_events`、分级处理、“不通知自己”、退避、重启后首轮只观察、`patrolDelta` 规格哈希规则、`wl attention`）、阶段 2A（`screenGuard` 与其模式表、`typeTo`）。
- 不含：往终端里打 `/compact` 等命令、自动探测岗位所在环境、替用户启动 Orca、用户自定义画面模式、token 用量统计与“消耗过快”信号、“原地打转”信号与“陪护”诊断岗。
- 承接：2B 第 11 节“上下文快满、用量上限需要解析画面，阶段 3”；3A 第 11 节“配对 / 远端环境的会话搜索”“开机自动执行 restore”；3C 第 12 节“未读红点”。

## 1. 目标与成功标准

- 岗位因为上下文快满或用量用完而停下时，人能及时知道；用量用完期间不会被误判为“无进展”而一路升级，重置后岗位被提醒继续。
- agent 跑在 Lima VM 等远端环境里的岗位，重启后同样能接回原会话。
- 有新的待办时，Orca 界面上牵头岗的终端出现未读标记。
- 机器重启、重新登录后，不需要人手动操作，团队在 Orca 就绪后自动恢复。

成功标准：

- 一个 Claude 岗位画面上出现用量上限提示：牵头岗与外部通知各收到一次通知；到重置时间之前该岗位不出现“无进展”的提醒、通知与冻结；重置后提示消失时岗位收到一行“继续”提示，信号清除。
- 岗位写了 `environment: lima-agent`：Orca 重启后 `wl restore` 在该环境里搜到会话，用 `claude-lima --resume <id>` 接回。
- `wl attention` 新出现一条待办：牵头岗终端被标为未读；同一批待办不重复标记。
- `wl autostart install` 后重新登录：Orca 就绪后所有运行中的团队被恢复，`autostart.log` 记录结果，时间线上执行者为 `autostart`。

## 2. 全局约束补充

1. 画面信号只用于通知与暂停升级：不往终端里打任何命令（继续提示除外，且必须经 `screenGuard` 判定为 `clear`），从不冻结。
2. 新增 `team.yaml` 字段取默认值时不进规格哈希（2B 的 `patrolDelta` 规则同样适用于 `posts[].environment`：未写时不出现在哈希输入里）。
3. `wl autostart` 只创建、修改、删除属于雁阵自己的那一个文件或计划任务；系统命令以绝对路径、参数数组启动，不经 shell。
4. 函数 ≤ 50 行。

## 3. 先补探针（plan 的 Task 0）

新增 `spikes/phase-3d.ts`（可按项分别运行），在 macOS 或 Linux 真机上跑，第 2 项在 Lima 环境里跑，结论写回 `spikes/REPORT.md`：

1. **画面样本**：抓取 Claude Code 与 Codex 的“上下文快满”“用量上限”真实画面，存入契约样本目录 `packages/core/test/contract/screens/`。用量上限难以当场触发时，可取 agent 源码或文档中的原文作为样本，并在样本文件头注明“文档来源，未截屏”。
2. **远端环境**：`orca search '"<标记>"' --agent claude --fresh --environment <env> --json` 能否精确命中、命中里有哪些字段（`sessionId`、`cwd` 是否为空）；用包装脚本（如 `claude-lima`）加 `--resume <id>` 开终端能否接回原会话。
3. **未读标记**：Orca 是否提供把某个终端标为未读、或在其上显示提示的 CLI 命令（以 `orca --help` 实际列出的为准），参数形态与效果。

退路：

- 第 1 项抓不到某个 agent 的某种画面 → 该 agent 暂不支持该信号（模式表里不写这一行）。
- 第 2 项不成立 → 写了 `environment` 的岗位维持 3A 的现状（“未找到原会话”，可用 `--session` 手工指定）。
- 第 3 项不成立 → `patrol.unread_mark` 不起作用，`wl attention` 的告警里提示一次“Orca 不支持未读标记”。

## 4. 读画面的巡查信号

### 4.1 模式表

新建 `packages/core/src/screen/patterns.ts`：

- 把 2A `screenGuard` 现有的判定（`at_prompt`、`shell`）连同其模式迁入本模块，`screenGuard` 改为调用它；行为不变，原有测试照跑。
- 新增两种信号，按 agent 分行：

| 信号 | 含义 | 提取 | 示例（Claude Code） |
| --- | --- | --- | --- |
| `context_low` | 上下文快满 | 剩余百分比（`percent: number \| null`） | `Context left until auto-compact: N%`，N ≤ 10 时成立；只有明确的“快满”文字而无数字时也成立，`percent = null` |
| `usage_limit` | 用量用完 | 重置时间（`resetsAt: Date \| null`） | `usage limit reached … resets <时间>` |

- 重置时间解析支持：`3pm`、`3:30pm`、`15:00`、带括号时区（如 `(Asia/Shanghai)`）、`in 2h`/`in 45m`；只有时刻没有日期时取“今天或明天中最早的未来时刻”；无时区时按本机时区。解析不出 → `resetsAt = null`。
- 接口：`detectScreen(agent: string, text: string): { guard: 'clear' | 'at_prompt' | 'shell'; signals: Array<{ kind: 'context_low'; percent: number | null } | { kind: 'usage_limit'; resetsAt: Date | null }> }`。只看画面最后 40 行。
- Codex 的行由第 3 节探针决定；没有样本的信号不写。

### 4.2 数据来源

- 调度员每次巡查扫描时，对每个存活的岗位读一次画面预览（与 `screenGuard` 相同的读取调用），同一轮内缓存，供 `screenGuard`、本节信号与 3C 的注释共用；不新增 Orca 命令。
- 重启后第一轮只观察（2B）：只记录、不通知、不暂停。

### 4.3 `usage_limit` 的处理

状态记录沿用 2B 的 `patrol_state`（`signal = usage_limit`，`task_id` 为该岗位当前任务或空），只用“观察”（level 0）与“通知”（level 1）两级。

1. **识别到**（非首轮）：level 0 → 1，`next_due_at = resetsAt + 2 分钟`（`resetsAt` 为空时取 `now + 1 小时`）；通知一次：
   - 通知牵头岗（经 `typeTo`，即画面检查为 `clear` 才打字）：“[雁阵] <岗位> 用量已用完，预计 <时间> 重置；期间不会提醒它”；
   - 外部通知（`patrol.notify`，若配置）；
   - 岗位就是牵头岗时只走外部通知与 `wl attention`（2B “不通知自己”）。
2. **暂停升级**：在 `next_due_at` 之前，该岗位的 `no_progress`、`owner_idle`、`overdue` 三种信号只观察、不升级（level 保持不变，不发提示、不通知、不冻结）；暂停结束后从当前 level 继续，不补发。
3. **到达 `next_due_at`**：
   - 画面上已无用量上限提示 → 经 `typeTo` 给岗位发一行“[雁阵] 用量已重置，请继续手上的任务 <id>”（没有在办任务时改为“…请继续”），清除信号（`cleared_at = now`）；画面不是 `clear` 时不打字，下一轮再试，直到发出或岗位有了新输出。
   - 提示仍在 → 保持信号，`resetsAt` 重新从画面提取并更新 `next_due_at`；按 2B 的退避规则再次通知。
4. 用量上限从不导致冻结。

### 4.4 `context_low` 的处理

1. **识别到**（非首轮）：同一岗位、同一会话（3A 的 `posts.session_marker` 与 `session_id` 组合）只通知一次：通知牵头岗或外部通知（规则同 4.3 第 1 步），内容“[雁阵] <岗位> 上下文剩余 <N%>，可能即将自动压缩或需要换会话”。
2. **清除**：画面不再显示该提示，或岗位的会话标记 / 会话 ID 变化。
3. 不暂停其他信号，不打字，从不冻结。

### 4.5 展示

两种信号出现在 `wl attention` 的“处理中的信号”一节（附剩余百分比或重置时间）、控制台收件箱与岗位详情、TUI 收件箱，以及 3C 卡片注释的 `⚠ 上下文快满` / `⚠ 用量用完（<时间> 重置）` 标记。`patrol_events` 记录识别、通知、继续提示与清除。

## 5. 远端环境的会话恢复

### 5.1 字段

```yaml
posts:
  - id: builder
    agent: claude
    launch: 'claude-lima --dangerously-skip-permissions'
    environment: lima-agent      # 可选；Orca 里的环境名
```

- 值的格式：小写字母、数字、连字符、下划线、点，1–64 字符；不符 → `environment_invalid`（`wl up` 的校验错误，退出码 1）。
- 未写即本机，行为不变，不进规格哈希；写了才进规格哈希。

### 5.2 恢复

- 3A `wl restore` 的会话搜索在岗位写了 `environment` 时加 `--environment <env>`：`orca search '"<标记>"' --agent <agent> --fresh --environment <env> --json`。
- `cwd` 过滤规则（远端命中的 `cwd` 可能为空，或是 VM 内的路径）：
  - 命中有 `cwd` 且等于岗位 worktree 的绝对路径 → 保留；
  - 命中 `cwd` 为空 → 只凭标记判断（标记本身唯一），保留；
  - 命中有 `cwd` 但不等 → 排除。
  - 之后按 3A 的规则判定：先排除已被本团队其他岗位登记为 `session_id` 的会话，再看条数（恰好 1 条 → 接回；0 条 → `fresh`；多条 → `ambiguous`）。`cwd` 为空时只凭标记判断，3A 第 4.3 节“标记不外泄”的规定在这里尤其关键。
- 恢复命令不变：岗位启动命令加恢复参数（3A 第 5.3 节），例如 `claude-lima --dangerously-skip-permissions --resume <id>`。README 写明：包装脚本必须把参数原样传给 agent（例如 `exec limactl shell agent claude "$@"`）。
- `orca search` 的 `resumeCommand` 在远端环境被扣留不影响本设计：雁阵从不使用它，只用 `sessionId`。

## 6. 未读标记

- 开关：`patrol.unread_mark`，默认 `true`，取默认值时不进规格哈希。
- 每轮巡查末尾，计算本团队 `wl attention` 的条目键集合（键：分节 + 任务 id / 岗位 / 消息 id / gate id）；与注册表 `unread_marks` 中已标记过的键比较：
  - 有新键 → 用第 3 节探针确认的命令把牵头岗终端标为未读，成功后把新键写入 `unread_marks`；
  - 没有新键 → 不调用。
- 已从 `wl attention` 消失的键从 `unread_marks` 删除（再次出现时视为新条目）。
- 红点由 Orca 在用户查看终端时自行清除，雁阵不负责清除。
- 标记失败只记 `patrol_events`，下一轮重试；连续 3 次失败后本次调度员运行期间不再尝试，并在告警里提示一次。
- 首轮只观察（2B）同样适用：首轮只把现有键写入 `unread_marks`、不标记，避免调度员重启就打一次红点。

## 7. 登录后自动恢复

### 7.1 `wl restore --all`

```
wl restore --all [--wait-orca <时长>] [--json]
```

- 对注册表中 `teams.status = up` 的每个团队依次执行 3A 的 `restore`（规则不变；与 `--session`、`<team>` 互斥，同时给出 → 输入错误）；按团队分节输出。
- 退出码取所有团队中最严重的（3 > 2 > 1 > 0 的优先顺序：有不确定项为 3，其次 Orca 报错 2，再次输入错误 1）。
- `--wait-orca <时长>`（`parseDuration`）：先每 10 秒执行一次 `orca status`，直到可达或超时；超时 → `runtime_unavailable`（退出码 2）。不替用户启动 Orca。
- 审计事件的执行者记为 `autostart`（由 `wl autostart` 安装的命令带隐藏参数 `--actor autostart` 传入；手动执行时仍按 2A 第 7.1 节解析）。

### 7.2 `wl autostart`

```
wl autostart install [--wait-orca <时长>] [--json]   # 默认 15m
wl autostart uninstall [--json]
wl autostart status [--json]
```

安装的命令：`<node 绝对路径> <wingline 入口脚本绝对路径> restore --all --wait-orca <时长> --actor autostart --home <WINGLINE_HOME> --orca <Orca 可执行文件绝对路径>`（登录时没有交互式 shell 的 PATH，因此全部写绝对路径；与 2B 调度员的启动参数构造共用一个函数）。输出追加到 `~/.wingline/logs/autostart.log`。

| 平台 | 安装位置 | 方式 |
| --- | --- | --- |
| macOS | `~/Library/LaunchAgents/wingline.restore.plist` | launchd 用户代理，`RunAtLoad = true`，`StandardOutPath`/`StandardErrorPath` 指向日志；安装后 `launchctl bootstrap gui/<uid> <plist>`（已加载则先 `bootout`） |
| Linux | `~/.config/systemd/user/wingline-restore.service` | systemd 用户服务，`Type=oneshot`，`WantedBy=default.target`；安装后 `systemctl --user daemon-reload` 与 `systemctl --user enable wingline-restore.service` |
| Windows | 任务计划 `\Wingline\Restore` | `%SystemRoot%\System32\schtasks.exe /Create /F /SC ONLOGON /TN \Wingline\Restore /TR <命令行>`，参数数组启动；`/TR` 命令行的引号规则单独实现并测试 |

- `install` 幂等：重复执行覆盖自己的文件 / 任务。
- `uninstall`：删除自己的文件 / 任务并从服务管理器注销；没安装过 → 成功（无操作）。
- `status`：是否已安装、文件 / 任务位置、将执行的命令（并检查其中的 node 与入口脚本是否仍存在；不存在时提示“Node 路径已变化，请重新 wl autostart install”）、`autostart.log` 最后 20 行；Linux 上额外检查 `loginctl show-user <user> -p Linger`，未开启时提示“无界面或 SSH 场景需要 loginctl enable-linger <user>”。
- Linux 上 Orca 以系统服务运行时（例如 `orca-serve.service`），用户服务无法声明在其之后启动，依靠 `--wait-orca` 等待。
- 平台没有对应机制（例如 Linux 上没有 systemd 用户会话）→ `autostart_unsupported`。
- `autostart.log` 与其他日志一样保留 7 天（按天清理时一并处理）。

## 8. 注册表迁移

追加一个迁移版本：

```sql
CREATE TABLE unread_marks (
  team TEXT NOT NULL,
  item_key TEXT NOT NULL,
  marked_at TEXT NOT NULL,
  PRIMARY KEY (team, item_key)
);
```

- `usage_limit` 的暂停截止时间存放在 `patrol_state` 现有的 `next_due_at` 列，不新增列。
- 带一个从 3C 数据库升级的测试；规格哈希不变。

## 9. 代码结构

```text
packages/core/src/screen/patterns.ts        # 模式表与 detectScreen（含迁入的 at_prompt / shell）
packages/core/src/screen/reset-time.ts      # 重置时间解析
packages/core/src/commands/dispatcher/screen-signals.ts   # context_low / usage_limit 的状态推进与处理
packages/core/src/commands/dispatcher/unread.ts           # 未读标记
packages/core/src/commands/restore.ts       # 增加 environment 搜索参数与 cwd 规则、--all、--wait-orca、--actor
packages/core/src/commands/autostart/       # plan.ts（生成文件内容与命令，纯函数）、apply.ts（经注入的执行器执行）、status.ts
packages/core/src/spec/schema.ts            # posts[].environment、patrol.unread_mark
```

## 10. 错误处理

| 错误码 | 类别 | 退出码 | 场景 |
| --- | --- | --- | --- |
| `environment_invalid` | input | 1 | `posts[].environment` 格式不符 |
| `autostart_unsupported` | input | 1 | 平台没有对应的自启动机制 |
| `autostart_failed` | internal | 4 | `launchctl`/`systemctl`/`schtasks` 执行失败；附原始输出 |
| `runtime_unavailable` | orca | 2 | `--wait-orca` 等待超时（已有错误码） |

- 画面识别出错（模式异常、读不到画面）时，该岗位本轮只是没有这两种信号，不影响其他信号。
- 重置时间解析不出 → 按 1 小时后复查。
- 未读标记、继续提示的失败只记事件，不影响巡查。
- `autostart install` 失败时不留下半成品：先写临时文件再改名，注册失败则删除刚写的文件。

## 11. 测试

- **模式表**：每个模式对应真实或文档样本——命中、不命中、百分比提取、各种重置时间写法与时区、跨日；迁入的 `at_prompt`/`shell` 判定行为不变（原有测试照跑）；只看最后 40 行。
- **巡查**：`usage_limit` 的完整流程（通知一次 → 暂停三种升级 → 到点后提示消失则发“继续”并清除、提示仍在则保持并按退避再通知、画面非 `clear` 时不打字）；牵头岗用完时不通知自己；`context_low` 同一会话只通知一次、换会话后清除；两种信号都不会冻结；重启后首轮只观察；3C 注释标记。
- **远端环境**：`environment` 校验；带 `--environment` 的搜索参数；三种 `cwd` 情况；未写 `environment` 时规格哈希不变、写了时变化。
- **未读标记**：新键才标记；同一批不重复；键消失后再次出现视为新条目；首轮只记录；开关关闭不调用；连续失败后停止并提示。
- **`restore --all`**：多团队、只处理 `up` 的团队、与 `<team>`/`--session` 互斥、退出码取最严重、`--wait-orca` 的轮询与超时、`--actor autostart` 写入审计。
- **autostart**：三个平台生成的文件内容与命令（快照测试）、Windows `/TR` 引号（含空格路径、引号字符）、重复安装、未安装时卸载、`status` 输出与 linger 检查、失败时清理；系统命令一律经注入的执行器调用，测试不改动系统。
- **迁移**：从 3C 数据库升级。
- **真机**（只在真机上跑，需人工确认）：重新登录后，Orca 就绪时团队被自动恢复。

## 12. 不做的事（阶段 3D）

- 往终端里打 `/compact` 等命令。
- 自动探测岗位所在的环境（必须显式写 `environment`）。
- 替用户启动 Orca。
- 用户自定义画面模式。
- token 用量统计与“消耗过快”信号——需要用量数据，不属于阶段 3。
- “原地打转”信号与“陪护”诊断岗——没有可靠的数据源，不属于阶段 3。

## 13. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| agent 升级后提示文字变化 | 信号漏报 | 契约样本测试；`detectScreen` 只做通知类动作，漏报的后果是退回 2B 的现有行为 |
| 误把正文里引用的提示文字当成信号 | 误报通知或误暂停升级 | 只看画面最后 40 行；模式锚定到 agent 状态行的格式；暂停只影响升级、不影响任务 |
| 重置时间解析错（时区、跨日） | 过早或过晚发“继续” | 到点时先确认提示已消失才发；解析不出时 1 小时后复查 |
| 远端环境的 `cwd` 为空导致只凭标记判断 | 理论上可能接错会话 | 标记为随机 8 位十六进制、每次新开都换；多条命中时 `ambiguous`、不猜 |
| 包装脚本不透传参数 | 远端岗位接回失败 | README 示例；等不到空闲 → `uncertain`，不重发（3A） |
| Orca 不提供未读标记命令 | 无红点 | 探针与退路；`wl attention` 与外部通知照常 |
| 登录时 Orca 启动很慢 | 自动恢复超时 | `--wait-orca` 可配置；超时记日志，用户可手动 `wl restore --all` |
| 自启动配置残留 | 卸载雁阵后仍在登录时执行 | `wl autostart uninstall`；README 列出三个平台的文件 / 任务位置 |
