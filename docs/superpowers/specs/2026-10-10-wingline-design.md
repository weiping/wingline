# 雁阵 Wingline 设计总纲

- 日期：2026-10-10
- 状态：阶段 0+1 已实现；按 Linux（1.4.222）、macOS 与 Windows（1.4.224，CI）上的实测修订（2026-10-13，见 `spikes/REPORT.md`）。阶段 2（2A、2B）与阶段 3 的 3A、3B、3C、3D 也已实现并合并（进度见第 4 节；3D 的画面信号模式表尚未用真实画面核对）；阶段 4 及其后未开始。
- 范围：全项目总纲（阶段 0–6）+ 首期（阶段 0、1）详细设计
- 对照的 Orca 版本：stablyai/orca 提交 59631b8（1.4.214，2026-10-09）

## 1. 目标与定位

### 1.1 要解决的问题

Orca 擅长把多个 coding agent 放进各自的 worktree 并行运行，并用 Run / Task / Dispatch 监督一次次具体任务。它缺少“常驻团队”这一层：一组长期在岗、分工固定、互相审查、机器重启后能接着干的 agent。

雁阵（Wingline）在 Orca 之上补这一层：团队规格、固定岗位、自动审查链、质量闸门、预算与熔断、重启恢复，以及一个在 Orca 内置浏览器里打开的控制台。

### 1.2 命名

- 中文名：雁阵。英文名：Wingline（wing 雁翼 + line 列阵）。
- npm 包：`wingline`。命令行：`wingline`，简写 `wl`。
- 数据目录：`~/.wingline/`（Windows 为 `%USERPROFILE%\.wingline\`）。
- 岗位用的 skill：`wingline-post`。Orca Run 的 objective 前缀：`wingline:`。

### 1.3 成功标准

- 首期（阶段 0+1）：在 macOS、Linux、Windows 上，用户写一份 `team.yaml`，执行 `wl up` 就能在 Orca 里拉起一个两岗位团队；`wl ps` 看到每个岗位的状态；`wl send` 给岗位发消息并拿到送达确认；`wl down --close` 收场。重复执行任何命令都不会产生重复的终端或任务。
- 全项目：团队能长期运行；任务完成后自动过闸门、进审查；岗位卡住时被发现并升级给人；机器重启后能逐岗位恢复；所有操作都能在 Orca 窗口里完成。

## 2. 全局约束

以下约束适用于所有阶段，后续阶段的 spec 不得违反：

1. **只经由 Orca CLI 操作。** 雁阵不持有 agent 进程，不读写 Orca 的内部文件或数据库，不使用 Orca 的内部 RPC。所有动作都是 `orca … --json` 子进程调用。
2. **一切改变状态的调用都可恢复、不重复。** 调用前先在注册表记下“进行中”，调用后记结果。Orca 的 `--retry-request` 只接受 Orca 自己分配的 UUID（回执里的 `mutation.requestId`），不能自编，且 `terminal create` 没有该参数；所以：创建终端靠“按标题查找”幂等，发送类调用把 Orca 报告的请求 ID 存入注册表，需要确认时带着它对同一条命令重试（Orca 回放回执，不重复执行）。**这条关于 `--retry-request` 的限制只对 `terminal` 命令族成立；`orchestration` 命令族接受调用方自生成的 UUID（`spikes/REPORT.md`"补充探针二""补充探针三"实测），阶段 2A 据此对本条做了有范围的修订：编排写调用同样"先记进行中再调用"、用同一张 `requests` 表，但这一行同时存下调用方生成的 id 和完整参数，失败时先用 `orchestration request-show` 查明这次调用是否已生效，再决定重放、作废或报不确定，见阶段 2A spec 第 3 节约束 8 与第 9 节。**
3. **不确定就不动手。** 沿用 Orca 编排的安全底线：没有明确的退出证据，不 close、不重试、不重建同一岗位。超时和查不到状态只算检查点。
4. **三平台同等支持。** macOS、Linux、Windows 都在 CI 矩阵里。子进程一律以参数数组启动，不经过 shell；例外只有两处：Windows 上启动 `.cmd` 包装（见 7.3），其转义函数单独测试；阶段 2A 的 `wl task done` 执行 `team.yaml` 里的 gate 命令（用户写的 shell 字符串，见阶段 2A spec 第 3 节约束 6），范围仅限这一处。
5. **不走插件后门。** 不利用 Orca 插件 worker 缺少系统级沙箱这一点去执行子进程。

## 3. 总体架构

```text
雁阵 Wingline
  wl 命令行 ─┐
  控制台网页 ─┼─→ core 命令层 ─→ OrcaClient ─→ orca … --json ─→ Orca（不改动）
  调度员    ─┘        │                                         │
                  注册表 state.db                          orcad 持有 PTY
                                                               │
                                              Orca 终端里的岗位：builder@duo、checker@duo、dispatcher@duo
```

- **岗位**是常驻的 Orca 终端，终端标题就是岗位地址 `<post>@<team>`。
- **每项工作**是落在岗位终端上的一次 Orca Dispatch（阶段 2 起）。
- **判断类的事**交给牵头岗（一个 LLM 岗位）；**记账类的事**交给雁阵代码（调度员）。
- 命令行、调度员、控制台都调用同一个 core 命令层，所以行为一致，也都进审计日志。

## 4. 分阶段路线

| 阶段 | 交付物 | 为后续提供的接口 | 状态（2026-10-25） |
| --- | --- | --- | --- |
| 0 验证 | `spikes/` 下 5 个探针脚本 + `spikes/REPORT.md` | 决定依赖假设的设计走主方案还是退路 | **已完成** |
| 1 MVP | `team.yaml` 规格与校验、岗位注册表、`OrcaClient`、`wl up / ps / send / down`、`duo` 模板 | core 命令层 | **已完成** |
| 2 团队工作流 | 调度员、`wl task` 系列、`reviewed_by` / `hands_to` / `consults` 连接、质量闸门、先计划后动手、就绪队列与自领、顺手记下新发现、预算、巡查与熔断 | 事件表与任务状态机 | **已完成**（2A 任务工作流、2B 调度员与巡查） |
| 3 控制台与恢复 | 本地 HTTP API + SSE、控制台 8 个页面、审计时间线、`wl restore`、`wl tui` | HTTP API | **已完成（有保留）**：3A 恢复与时间线、3B 控制台、3C 编辑器/Orca 同步/`wl tui`、3D 画面信号/远端恢复/未读标记/自动恢复均已完成并合并（3D 的画面信号模式表是 provisional，由重新登录触发的自启动与 Linux 真机也未验证，见 3D spec 末尾“实施记录”） |
| 4 进阶协作 | 多路并跑择优、合并队列、头雁轮换（`wl lead pass`）、换班（`wl shift`）、团队决策日志 | — | 未开始 |
| 5 模板与分发 | 团队包（git 文件夹 + SHA-256 锁文件）、`wl pack install`、工作流模板、`debate` 等团队模板、工单联动 | — | 未开始 |
| 6 可选 | Slack 桥接；Orca 开放面板数据通道后把控制台迁入侧边栏 | — | 未开始 |

阶段 2 及以后各写独立的 spec 和 plan。本文对它们只定边界，细节以各自的 spec 为准。各阶段的 spec 与 plan 顶部记录了实施状态与实际提交对照（阶段 2A、2B、3A、3B、3C、3D 已实现）。

## 5. 后续阶段要点（边界说明）

### 5.1 团队规格的完整形态

首期只实现 `posts`、`lead`、`norms`。以下字段在首期规格里**保留但拒绝**（出现即报“该字段在阶段 N 开放”），避免用户写了却无效：

```yaml
links:            # 阶段 2：reviewed_by | hands_to | consults
gates:            # 阶段 2：任务完成后执行的检查命令
budgets:          # 阶段 2：团队与任务两级上限（实际只保留任务级，见 2A spec §4）
posts[].self_claim / posts[].tags / posts[].plan_first   # 阶段 2
```

### 5.2 调度员（阶段 2）

> 以 2B spec 为准：命令是 `wl dispatcher run <team>`；闸门、`worker-retain`、连接触发由 `wl task done` 执行，调度员只做收件箱、转述与巡查。

每个团队一个专用 Orca 终端 `dispatcher@<team>`，运行 `wl dispatcher <team>`。循环：`check --wait` 取收件箱 → 处理 `worker_done`（核对、闸门、`worker-retain`、按连接触发后续任务、摘要转牵头岗）、`question`、`escalation` → `check --ack` → 每 5 分钟扫超时、预算、熔断信号，刷新 `worktree set --comment`。岗位终端永不 release。

### 5.3 巡查与熔断（阶段 2）

> 以 2B spec 为准：信号集合与处理梯度见 2B spec §5；“陪护”诊断岗未实现。

四种信号（阈值可配置）：无进展（默认 20 分钟无输出和状态变化）、原地打转（同一命令连续 3 次且结果相同）、消耗过快（可取得 token 用量的岗位，每分钟消耗超过近 7 天均值 3 倍）、闸门连败（3 次）。三级处理：提示岗位 → 通知牵头岗并进收件箱 → 冻结（停派新活）。不杀进程。冻结时可选“陪护”：派诊断岗读会话记录、写出原因和建议。

### 5.4 控制台（阶段 3）

- 本地网页，`wl console` 在 127.0.0.1 随机端口提供服务，一次性 token 换 HttpOnly cookie，写请求校验 Origin 和请求头 token。
- `wl console --open` 在 Orca 的专用文件夹工作区里执行 `orca tab create --url …`，并用 `terminal split` 在旁边打开牵头岗终端。
- 8 个页面：总览、团队编辑器（表单 / YAML 双向、预演 Orca 调用）、任务看板、任务详情、收件箱、岗位详情、时间线、设置。
- 状态同步到 Orca 原生界面：终端标题、工作区卡片状态行、`--workspace-status`（就绪→todo，进行中→in-progress，待审/待合并→in-review，完成→completed）、未读红点。
- 不做成 Orca 插件面板的原因（插件 API v0）：面板 CSP 为 `connect-src 'none'`；面板只能调 `workspace.readContext`、`terminal.sendText`、`notifications.show`；面板与 worker 无通道；已安装插件按内容哈希校验。

## 6. 首期详细设计：阶段 0（验证）

### 6.1 探针

每个探针是 `spikes/` 下的独立 TypeScript 脚本，用 `tsx` 运行，输出“成立 / 不成立 / 部分成立”之一，并把原始回执存到 `spikes/out/<探针>/<平台>/`。

| 探针 | 验证的假设 | 不成立时的退路 | 是否阻塞 MVP |
| --- | --- | --- | --- |
| `adopt-terminal` | `worker-start --task <id> --terminal <handle>` 能接管 `terminal create` 建出的终端并注入 preamble（实测：必须由已绑定 Run 的协调者终端调用，从普通 shell 被拒；协调者终端内**已验证成立**：`worker-start --from <协调者 handle> --terminal <handle> --run <id>` 返回 `ok:true`、`state:ready`，终端被 `reused`、`worker-list` 可见，关闭终端后转 `failed`，见 REPORT「待验证项」B） | 岗位改由首次 `worker-start --agent` 建出，之后一直 retain | 否（影响阶段 2） |
| `run-lifetime` | 多个 Run 可并存；Orca 重启后 Run 元数据与 `coordinator_handle` 持久化保留，但绑定的终端 handle 随进程销毁、关联 worker 自动转为 `abandoned`/`terminal_missing`，须 `run-use` 重新认领协调者或新建 Run，不能假设旧终端仍可交互（实测：`run-create` 需要发送方终端——`--from <handle>` 或在 Orca 终端内——从普通 shell 失败；重启细节见 REPORT「待验证项」C） | 每个工作批次开新 Run，团队状态只存注册表 | 已决定：首期 `wl up` 不创建 Run |
| `session-id` | 能拿到每个岗位的会话 ID 和 `resumeCommand`（实测：`terminal show` 不给，只有 `agentIdentity`；真正来源是 `orca search --agent <agent> --json`，命中含 `sessionId`、`source.filePath`、现成的 `resumeCommand`，macOS、Linux 一致；终端↔会话须用加引号的唯一标记精确搜索，裸词搜索会分词出多个命中，见 REPORT「待验证项」A；远程/配对环境的 `search` 会扣留 `resumeCommand` 和 `source.filePath`） | 远程环境下按固定模式拼 `claude --resume <sessionId>`，或读 agent 自己的会话文件（`~/.claude/projects/<path>/<sessionId>.jsonl`） | 否（影响阶段 3） |
| `resume-after-restart` | 杀掉 orcad 后，`terminal create --command "<恢复命令>"` 能接回原会话（实测：macOS 真机完整重启后**成立**，`claude --resume <id>` 接回原会话，屏幕完整恢复历史现场，空闲等待输入，agent 不会自动乱动） | 恢复时报“已重启”并重发启动包 | 否（影响阶段 3） |
| `retained-reuse` | 已 retain 的终端能连续接活两次；观察休眠对 handle 的影响 | 按标题重查 handle；建议团队 worktree 关闭休眠 | 否（影响阶段 2） |

### 6.2 报告

`spikes/REPORT.md` 按 macOS、Linux、Windows 三列记录每个探针的结论、Orca 版本和关键回执摘录。报告同时确定首期的“已验证 Orca 版本范围”。

### 6.3 回执样本

探针录下的真实回执，去掉路径、ID、用户名等信息后，存入 `test/fixtures/receipts/`，作为契约测试的样本。

## 7. 首期详细设计：阶段 1（MVP）

### 7.1 仓库结构

```text
wingline/
  packages/
    core/
      src/orca/        # OrcaClient
      src/spec/        # team.yaml 读取与校验
      src/registry/    # SQLite 注册表
      src/brief/       # 启动包
      src/commands/    # up / ps / send / down
    cli/               # wl 命令（commander）
  teams/duo/           # team.yaml、NORMS.md、briefs/builder.md、briefs/checker.md
  skills/wingline-post/SKILL.md
  spikes/              # 阶段 0
  test/fixtures/receipts/
  test/fake-orca/      # 契约测试用的假 orca 可执行文件
  docs/superpowers/specs/、docs/superpowers/plans/
```

工具链：pnpm workspaces、TypeScript、Node ≥ 22.13、vitest、tsx。运行时依赖只有 commander、zod、yaml。

### 7.2 组件

| 单元 | 职责 | 对外接口 | 依赖 |
| --- | --- | --- | --- |
| `orca/` | 解析 Orca 可执行文件；以参数数组调用；解析 `--json` 回执；错误码映射 | `OrcaClient`：`version`、`status`、`terminalList`、`terminalCreate`、`terminalWait`、`terminalSend`、`terminalClose`（Run 相关方法随阶段 2 加入） | `child_process` |
| `spec/` | 读取并校验 `team.yaml`，展开 `norms`、`brief` 路径，报错带行号 | `loadTeamSpec(path): TeamSpec` | zod、yaml |
| `registry/` | SQLite 注册表，表 `teams`、`posts`、`requests`；所有写操作在事务中 | `Registry` | `node:sqlite` |
| `brief/` | 生成启动包文本 | `renderBriefing(spec, postId): string` | 无 |
| `commands/` | 四条命令的逻辑，返回结构化结果，不打印 | `up(deps, args)`、`ps`、`send`、`down` | 以上四者（依赖注入） |
| `cli` | 参数解析、表格或 `--json` 输出、退出码 | `wl` / `wingline` | commander、core |

### 7.3 Orca 可执行文件的解析

按顺序：

1. 环境变量 `WINGLINE_ORCA`（用户显式指定）。
2. 环境变量 `ORCA_CLI_COMMAND`（Orca 为托管 WSL 会话导出）。
3. Linux：`orca-ide`。自动解析时永远不使用裸 `orca`，因为在 Orca 终端外它通常指向 GNOME 读屏器 `/usr/bin/orca`。
4. macOS：`orca`。
5. Windows：在 PATH 中依次查找 `orca.exe`、`orca.cmd`（1.4.224 的安装只有 `orca.cmd`，位于 `…\Programs\orca\resources\bin\`）。`.cmd` 需要经 `cmd.exe /d /s /c` 启动，参数按 cmd 规则转义；这是全项目唯一允许经过 shell 的情况，转义函数单独测试。

解析结果在一次命令执行内缓存。按以上顺序都找不到时，报用户输入错误，提示安装 Orca 或设置 `WINGLINE_ORCA`。

### 7.4 团队规格（首期子集）

```yaml
version: 1
name: duo                       # 团队名：小写字母、数字、连字符
repo: path:/abs/repo            # Orca repo selector，原样传给 Orca
norms: NORMS.md                 # 相对 team.yaml 的路径
lead: builder                   # 必须是 posts 里的某个 id
posts:
  - id: builder                 # 小写字母、数字、连字符；团队内唯一
    agent: claude               # Orca 的 agent id
    model: opus                 # 可选
    worktree: current           # current | <Orca worktree selector>
    brief: [briefs/builder.md]  # 可选，相对路径
  - id: checker
    agent: codex
    launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'   # 可选，覆盖默认启动命令
    worktree: current
    brief: [briefs/checker.md]
```

- `launch` 缺省时，启动命令为 `agent` 字段的值；指定了 `model` 且未指定 `launch` 时，按 agent 生成：`claude --model <m>`、`codex --model <m>`，其他 agent 报“请用 launch 指定”。
- `launch` 是一整条命令字符串，原样作为 `terminal create --command` 的一个参数传给 Orca，由 Orca 在终端的 shell 里执行；雁阵不切分、不改写它。
- 注意：`--command` 里的裸 agent 名（如 `claude`）会被 Orca 按用户在 Orca 里配置的 agent 启动偏好解析，不是 shell 的 PATH 解析。同一份 team.yaml 在不同机器上可能跑进本机、VM 或远端（macOS 真机实测：`claude` 被解析成 `claude-lima …`，跑进了 Lima VM）。需要固定执行环境时，用 `launch` 写显式路径（见 `spikes/REPORT.md` 实测发现 12）。
- 首期不接受 `links`、`gates`、`budgets`、`self_claim`、`tags`、`plan_first`，出现即报错并注明开放阶段。
- 规格哈希：对规范化后的规格（字段排序、路径展开为相对 team.yaml 的形式、引用文件的内容哈希）取 SHA-256。

### 7.5 注册表

位置：`~/.wingline/state.db`。可用环境变量 `WINGLINE_HOME` 改变根目录。

```sql
teams(
  name TEXT PRIMARY KEY,
  spec_path TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  run_id TEXT,                 -- 首期恒为 NULL（不创建 Run），阶段 2 起使用
  status TEXT NOT NULL,        -- up | stopped
  updated_at TEXT NOT NULL
)
posts(
  address TEXT PRIMARY KEY,    -- <post>@<team>
  team TEXT NOT NULL REFERENCES teams(name),
  agent TEXT NOT NULL,
  worktree TEXT NOT NULL,
  handle TEXT,                 -- 最近一次解析到的终端 handle
  status TEXT NOT NULL,        -- live | offline | uncertain | closed
  is_lead INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)
requests(
  id TEXT PRIMARY KEY,         -- 本地账本键 <team>:<post>:<step>:<hash 前 8 位>；岗位前一轮生命周期已完成（终端被关后重建）、或相同消息再次发送时加 -N 后缀。不发给 Orca
  state TEXT NOT NULL,         -- pending | done | uncertain | failed
  receipt TEXT,                -- 回执 JSON，截断到 16 KB；含 Orca 分配的 mutation.requestId
  updated_at TEXT NOT NULL
)
```

数据库启用 WAL 和外键。模式版本记在 `PRAGMA user_version`，迁移按版本号顺序执行。

### 7.6 启动包

岗位拉起后收到的第一条消息，由 `renderBriefing` 生成，依次包含：

1. 身份：“你是 `<post>@<team>`，你的职责见下方岗位说明。”
2. 团队名册：每个岗位的地址、agent、是否牵头。
3. `NORMS.md` 全文。
4. 该岗位的 brief 文件全文（按列出顺序）。
5. 沟通方式：用 `wl send <地址> "<消息>"` 联系其他岗位。

总长度超过 12,000 字符时报用户输入错误，提示精简 brief，不做截断。

### 7.7 命令

**`wl up <team.yaml>`**

1. 读取并校验规格，计算规格哈希。
2. 查 `teams`：已存在且哈希相同 → 只补拉离线岗位；哈希不同且团队仍为 up → 拒绝，提示先 `wl down`（已 stopped 的团队允许换规格重新拉起）。
3. 首期不创建 Run（实测 `run-create` 需要发送方终端，见 6.1），`teams.run_id` 留空，`wl ps` 不查询 `worker-list`。
4. 对每个岗位：
   - `terminal list --include-visual-layouts --json`，按**标签页的自定义标题** `<post>@<team>` 查找（`list` 里的 `title` 是 shell 自己的窗口标题，自定义标题只在 `visualLayouts` 的标签页里，用 `tabId` 对应）；找到且这一轮启动已完成 → 登记 handle，状态 live，跳过（已在岗）。找到但上次启动没做完（有 create 记录、启动包未送达）→ 接着等待就绪并发送启动包，不重建。多个同名终端 → 不确定，不动它们。
   - 找不到 → `terminal create --worktree <sel> --title <post>@<team> --command <launch>`（无 `--retry-request`）→ `terminal wait --terminal <h> --for tui-idle --timeout-ms 60000`（超时时 Orca 返回 `ok:false`、code `timeout`，视为未就绪）→ `terminal send --terminal <h> --text <启动包> --enter --wait-submit 10`（`result.send.accepted` 为 true 即视为启动包已送达；岗位收到后会立刻开始工作）。
   - 每步先写 `requests`（pending），再调用，结束后更新为 done / uncertain / failed。
5. 输出每个岗位的结果：已在岗、已拉起、失败（附原因）、不确定（附重试命令）。

**`wl ps [team]`**：调用 `terminal list --include-visual-layouts`，按标签页标题与注册表合并，输出岗位、agent、状态、handle、worktree：找不到 → offline；找到但未连接或同名多个 → uncertain；其余 live。只读；唯一的写入是 handle 变化时更新 `posts.handle`。（首期不查 `worker-list`；有 Run 后再加。）

**`wl send <post@team> <message> [--retry-request <id>]`**：按标题解析 handle（`terminal_handle_stale` 时重查一次）→ `terminal send --text --enter --wait-submit 10`，读 `result.send.accepted`、`result.send.prompt.stages` 与 `result.mutation.requestId`。`stages` 含 `turn_started` 记“已送达”；仅 `input_accepted`（常见于岗位正忙）记“已输入，未确认”（`send_unconfirmed`），退出码 3，提示里给出 Orca 的请求 ID 和确认命令。不自动重发。`--retry-request <id>` 用同一条消息、同一个 Orca 请求 ID 重新发起：Orca 回放回执并继续观察，不会重复发送。消息超过 4,000 字符时报用户输入错误。相同消息在上一次已送达后再次发送，视为新的一次发送。

**`wl down <team> [--close]`**：默认只把团队标为 stopped，终端不动（不调用 Orca）。`--close` 时逐岗位 `terminal close`；Orca 明确报告退出 → closed；否则 → uncertain，退出码 3。

### 7.8 错误处理

| 类别 | 例子 | 退出码 | 处理 |
| --- | --- | --- | --- |
| 用户输入错误 | 规格校验失败、岗位名重复、找不到 Orca 可执行文件、启动包过长 | 1 | 指明文件、行号和改法，不调用 Orca |
| Orca 明确报错 | 回执 `ok:false`，如 `runtime_access_denied`、worktree 不存在 | 2 | 原样附上 Orca 错误码与信息；Orca 未运行时提示 `orca open`，不代为启动 |
| 结果不确定 | `terminal wait` 超时、只拿到 `input_accepted`、退出状态查不清、同名终端多于一个 | 3 | 注册表标 uncertain，输出重试命令（`wl up` 可直接重跑；`wl send` 带 Orca 的请求 ID 确认），不自动重发、不关进程 |
| 内部错误 | 回执无法解析、注册表写入失败 | 4 | 打印回执原文与日志路径，提示可能是 Orca 版本不兼容 |

每条命令启动时执行一次 `orca --version` 读取版本（纯文本输出），不在已验证范围内时打印警告但继续；再执行 `orca status --json`，`result.runtime.reachable` 为 false 时按“Orca 明确报错”处理并提示 `orca open`。

Orca `--json` 输出的统一信封（据 Orca 源码 `src/shared/runtime-rpc-envelope.ts`，已在 1.4.222 上核对）：成功为 `{ id, ok: true, result, _meta }`，失败为 `{ id, ok: false, error: { code, message, data? } }`，失败时进程退出码为 1。

实测的回执字段（Orca 1.4.222）：`terminal create` → `result.terminal.handle`；`terminal wait` → `result.wait.satisfied`（超时为 `ok:false`/`timeout`）；`terminal send` → `result.send.{accepted,prompt.stages}` 与 `result.mutation.requestId`；`terminal close` → `result.close.ptyKilled`；`terminal list` → `result.terminals[]` 加（带 `--include-visual-layouts` 时）`result.visualLayouts`。Orca 拒绝未知参数（`invalid_argument`）。

日志写到 `~/.wingline/logs/`，每次 Orca 调用记录参数、耗时、回执（消息正文截断到 200 字符），按天滚动，保留 7 天。

### 7.9 测试

| 层 | 范围 | 方法 | 运行时机 |
| --- | --- | --- | --- |
| 单元 | `spec/`、`brief/`、`registry/`、`commands/` 分支逻辑、Windows 转义函数 | vitest；`commands/` 注入假 `OrcaClient` | 每次提交，三平台 |
| 契约 | `orca/` 的回执解析与错误映射 | 假 `orca` 可执行文件（Node 脚本，Windows 配 `.cmd` 包装）按参数回放 `test/fixtures/receipts/` | 每次提交，三平台 |
| 集成 | 真实 Orca 上 `up → ps → send → down --close` | `pnpm test:live`，需本机已安装并运行 Orca | 发版前，三平台各一次 |

CI：GitHub Actions，`macos-latest`、`ubuntu-latest`、`windows-latest` × Node 22.13、24。

### 7.10 首期验收

1. 三个平台上，`wl up teams/duo/team.yaml` 在测试仓库里拉起两个岗位，Orca 中两个终端的标题分别为 `builder@duo`、`checker@duo`。
2. 立即再执行一次 `wl up`，不产生新终端，输出两个岗位“已在岗”。
3. `wl ps` 显示两个岗位为 live。
4. `wl send checker@duo "你好"` 的结果为“已送达”。
5. `wl down duo --close` 后两个岗位为 closed，Orca 中对应终端消失。
6. 单元测试和契约测试在三平台 CI 上全部通过。
7. `spikes/REPORT.md` 填满三平台结论。

## 8. 不做的事（首期）

- 不常驻守护进程；`wl` 每次执行完即退出。
- 不建任务、不监督 Dispatch（阶段 2）。
- 不提供网页或 TUI（阶段 3）。
- 不统计 token。
- 一个团队只对应一个仓库。
- 不支持在线修改编队（规格哈希变化必须先 `wl down`）。

## 9. 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Orca CLI 变化快，已有命令被标为 Retired | 回执解析或调用失败 | 契约测试；版本检查与警告；必要时读 `orca skills get` 的版本匹配指南 |
| Windows 上 `.cmd` 包装的转义 | 参数被截断或注入 | 唯一经过 shell 的路径，转义函数独立测试，含引号、`%`、`^`、`&` 等用例 |
| `node:sqlite` 在 Node 22 上为实验特性 | 启动时打印警告；接口可能小幅变化 | CLI 屏蔽该警告；注册表通过 `Registry` 封装，必要时可换实现 |
| 探针结论与假设不符 | 后续阶段设计需要调整 | 第 6.1 节已为每个假设准备退路；首期只有 `run-lifetime` 影响 MVP，已按退路实现（不创建 Run）。实测还纠正了 7.7 中的回执字段、标题查找和重试 ID 三处假设 |
| 阶段 2 调度员基于 Run 做协调者绑定，Orca 重启后旧终端 handle 悬空 | 调度员循环死在一个已失效的终端上 | `run-lifetime` 实测：Run 与 `coordinator_handle` 跨重启持久化，但终端随进程销毁；阶段 2 spec 设计调度员启动时必须先 `run-use` 重新认领协调者（或新建 Run），不能假设旧终端仍可交互，见 6.1 |
| `terminal send` 对单条文本可能有长度上限，文档未写明 | 启动包被截断或拒收 | 探针 `adopt-terminal` 顺带用 12,000 字符文本测一次；上限更低时把启动包写成文件，只发送“请先阅读 <路径>” |
| Windows 上 Orca CLI 只有 `.cmd` 包装（1.4.224 实测，没有 orca.exe），换行无法安全经过 `cmd.exe`，整条命令行有约 8191 字符上限 | 多行或过长的启动包和消息无法发送 | 经 `.cmd` 时启动包写入 `~/.wingline/briefs/<team>/<post>.md`，只发送一行“请先完整阅读 <路径>”；含换行或使命令行超限的 `wl send` 消息报输入错误，提示改成单行或写进文件后只发路径 |
| `terminal wait --for tui-idle` 对部分 agent 不准 | 启动包在 agent 就绪前送出而丢失 | 超时即标 uncertain、不发送；集成测试覆盖 Claude Code 与 Codex |

## 10. 参考

- Orca 仓库：https://github.com/stablyai/orca （提交 59631b8）
- Orca orchestration 指南：`skill-guides/orchestration.md` 及 `references/`
- Orca CLI 指南：`skill-guides/orca-cli.md`
- Orca 插件能力：`src/shared/plugins/plugin-capabilities.ts`、`plugin-panel-shell.ts`、`plugin-host-api.ts`
- 同类工具调研：Claude Code agent teams、Gas Town、Beads、Vibe Kanban、Conductor、Claude Squad、Sculptor、GitHub Agent HQ
