# 雁阵 Wingline 阶段 3E：控制台全生命周期与团队定义扩展设计

- 日期：2026-10-29
- 状态：草案（待评审）
- 范围：阶段 3（控制台与恢复）子项目 E：在 `wl console` 与 CLI 中增加新建/导入团队配置（含默认模板）、角色岗位增删、团队规范（`NORMS.md`）与岗位职责简报（`briefs/*.md`）内联编辑，并将全部 CLI 操作（团队 `up`/`down`/`restore`、调度员 `up`/`down`、任务执行流 `claim`/`release`/`plan`/`start`/`done`、开机自启 `autostart`）完整呈现在 Web UI 中。
- 依赖：阶段 3B（`wl console` HTTP 服务、认证与 CSRF、`auditedCommands` 写接口框架、SSE 实时流）、阶段 3C（`/t/:team/edit` 双视图编辑器、`edit.ts` AST 手术式修改、`planSpecChange` 预演、`saveSpec`/`draft` 冲突检测）、阶段 3D（`restore`、`autostart`）。

---

## 1. 背景、意图与成功标准

在阶段 3B/3C 完成后，`wl console` 已经能够监控运行中的团队、处理收件箱待办并修改已有团队的部分 YAML 字段，但仍存在三处断点，迫使用户在浏览器与终端之间来回切换：

1. **无法从零定义团队**：控制台只能查看已经通过终端 `wl up` 登记进 `state.db` 的团队；新建团队、生成默认配置模板、增删角色岗位、编写团队规范（`NORMS.md`）与岗位职责简报（`briefs/*.md`）仍必须去终端手写文件。
2. **团队与调度员生命周期靠复制命令**：总览页、收件箱、编辑预演区里的 `wl up`、`wl up --draft`、`wl down`、`wl restore`、`wl dispatcher up/down`、`wl autostart` 只展示 `<CommandHint>` 让用户复制回终端执行。
3. **任务执行流缺少页面代操作**：当人需要手动介入或测试任务流转时，`claim`、`release`、`plan`、`start`、`done` 只能去终端敲 `--as <post>@<team>`。

### 1.1 目标（Goals）

- **一键新建团队与默认模板**：在控制台侧栏和空态首页提供「新建团队」，内置三套默认模板（双人协作 `duo`、单人 `solo`、三人流水线 `trio`）及「导入已有配置」，默认在 `<WINGLINE_HOME>/teams/<team>/` 下生成完整配置与职责文档并登记到注册表，支持「仅创建配置」或「创建并启动」；CLI 同步提供 `wl init` 命令。
- **角色增删与职责正文内联编辑**：在 `/t/:team/edit` 表单视图中支持新增岗位（带角色职责预设）、删除岗位，并直接读写团队规范 `NORMS.md` 与各岗位的职责简报 `briefs/<id>.md`；底部支持「保存并启动」或「保存草稿并重启应用」。
- **CLI 操作全量 UI 化**：在总览页、收件箱、编辑页、任务详情页、关于页提供纯中文操作按钮，覆盖团队启停与恢复、调度员启停、任务执行流五步操作（`claim`/`release`/`plan`/`start`/`done`）以及开机自动恢复（`autostart`），每处操作下方附带对应的 `wl` 命令行对照。
- **统一视觉与按钮规范**：按钮文案纯中文、不中英混杂；不使用红字透明底或蓝底红字等低对比度配色，严格统一为「深绿主按钮 / 描边次按钮 / 红底白字危险按钮」三档；输入框、下拉框、文本域在亮/暗模式下均保持清晰对比度。

### 1.2 非目标（Non-Goals）

- **不做任意文件管理器**：控制台只读写当前团队目录下由规格引用的 `norms` 与 `posts[*].brief[*]` Markdown 文件，不提供浏览或编辑任意目录文件的能力。
- **不在网页内嵌交互式终端（WebTTY）**：岗位终端的交互仍归 Orca 原生终端，岗位详情页保持 40 行纯文本只读预览与「发消息」入口。
- **不新增运行时第三方依赖**：后端继续只使用 Node 内置模块与现有的 `yaml`、`zod`；前端继续只使用 Preact。

### 1.3 反目标（Anti-Goals）

- **严禁写接口绕过审计或幂等账本**：所有新增写接口一律经 `auditedWriteCommands('console:')` 记入 `audit_events`（执行者为 `human`），TUI 同步共享同一套 `WriteCommands`。
- **严禁前端自动重试 504 `uncertain` 请求**：结果不确定时必须停下，由用户在弹窗中点击「按原样重试」（携带原 `retryRequest`）。
- **严禁破坏用户手写的 YAML 注释与排版**：已有字段修改继续走 `edit.ts` 的 AST 范围替换，新增/删除岗位仅操作 `posts`/`links`/`gates` 对应节点。

---

## 2. 方案对比与选型（Approaches）

在头脑风暴阶段对比了两种方案：

### 方案 A（已选）：在现有导航与页面上就地演进 + 侧栏「新建团队」弹窗

- **做法**：保持现有五项团队导航（总览 / 收件箱 / 任务看板 / 时间线 / 编辑）不变；侧栏团队切换器旁加「新建团队」按钮（打开弹窗，无团队时首页也直接呈现）；`/t/:team/edit` 表单直接内聚岗位增删、`NORMS.md` 文本框与各岗位的 `briefs/<id>.md` 文本框，保存时与 `team.yaml` 一同校验落盘；总览页、收件箱、任务详情页、关于页就地将原有的只读命令条升级为可执行按钮 + 下方命令行对照。
- **取舍**：改动最小，用户修改某个岗位的模型/闸门与修改它的职责简报在同一个卡片内完成，无需跨页面跳转；代价是编辑页表单纵向内容比之前略长（通过清晰的卡片分组解决）。

### 方案 B（未选）：独立「角色与职责库」页面 + 独立新建向导路由

- **做法**：在左侧导航新增独立的「角色与规范」页专门管理 Markdown 文件，另设 `/teams/new` 多步向导路由。
- **放弃原因**：把同一个岗位的参数配置（`agent`/`model`/`gate`/`links`）和职责简报（`brief`）拆在两个页面，编辑角色时需要来回切换且保存时机割裂。

---

## 3. 详细设计

### 3.1 团队模板与新建 / 导入（`packages/core/src/commands/init.ts`）

#### 3.1.1 内置预设模板

提供三套开箱即用的团队模板（常量 `TEAM_TEMPLATES`），所有模板均设置 `version: 1`、`norms: NORMS.md`、各岗位 `worktree: current`：

| 模板标识 | 中文名称 | 牵头岗（`lead`） | 岗位与默认配置 | 协作链（`links`） |
| --- | --- | --- | --- | --- |
| `duo`（默认） | 双人协作（推荐） | `builder` | `builder`（`claude` / `opus`，`brief: [briefs/builder.md]`）<br>`checker`（`codex`，`launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'`，`brief: [briefs/checker.md]`） | `builder.reviewed_by: [checker]` |
| `solo` | 单人 | `builder` | `builder`（`claude` / `opus`，`brief: [briefs/builder.md]`） | `{}` |
| `trio` | 三人流水线 | `planner` | `planner`（`claude` / `opus`，`brief: [briefs/planner.md]`）<br>`builder`（`claude` / `opus`，`brief: [briefs/builder.md]`）<br>`checker`（`codex`，`launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'`，`brief: [briefs/checker.md]`） | `planner.hands_to: [builder]`<br>`builder.reviewed_by: [checker]` |

模板的 `launch` 命令与仓库现有示例 `teams/duo/team.yaml` 保持一致（`codex --model gpt-6-astra -c model_reasoning_effort="high"`）；`model` 字段留空而由 `launch` 显式给出，避免 `load.ts` 的 `launch_required` 分支。

内置三份默认岗位职责模板（`ROLE_BRIEFS: Record<'builder' | 'checker' | 'planner', (team: string, post: string) => string>`）与默认 `NORMS.md` 模板（复用仓库 `teams/duo/` 的写法并按团队名与岗位名填充）。

#### 3.1.2 `initTeamCmd(deps, args)` 与登记规则

```ts
export type TeamTemplateId = 'duo' | 'solo' | 'trio'

export interface InitTeamArgs {
  mode: 'template' | 'import'
  /** mode === 'template' 时必填，符合 /^[a-z0-9-]+$/ */
  name?: string
  /** mode === 'template' 时必填；若不以 path: 开头则自动补上 path: 前缀 */
  repo?: string
  template?: TeamTemplateId
  /** 可选自定义生成目录；缺省为 path.join(deps.home, 'teams', name) */
  dir?: string
  /** mode === 'import' 时必填：已有 team.yaml 的文件路径 */
  specPath?: string
  retryRequest?: string
}

export interface InitTeamResult {
  team: string
  specPath: string
  created: boolean
}
```

1. **模板创建模式（`mode: 'template'`）**：
   - 校验 `name` 符合 `/^[a-z0-9-]+$/`，`repo` 非空，`template` 为 `'duo' | 'solo' | 'trio'`（缺省 `'duo'`）。
   - 目标目录 `targetDir = args.dir ? path.resolve(args.dir) : path.join(deps.home, 'teams', name)`，`specPath = path.join(targetDir, 'team.yaml')`。
   - **冲突与幂等**：
     - 若 `registry.getTeam(name)` 已存在：如果它的 `specPath === specPath` 且文件存在，视为同一请求重发，直接返回 `{ team: name, specPath, created: false }`；否则抛出 `WinglineError('input', 'team_already_exists', '团队 <name> 已存在')`。
     - 若磁盘上 `specPath` 已存在（但未登记）：抛出 `WinglineError('input', 'spec_already_exists', '配置文件已存在：<specPath>，请改用“导入已有配置”')`。
   - 依次写出 `NORMS.md`、`briefs/<id>.md`（若对应文件尚不存在）与 `team.yaml`，调用 `loadTeamSpec(specPath)` 校验并计算 `specHash`。
   - 在 `registry` 中写入未启动团队记录：
     - `registry.upsertTeam({ name, specPath, specHash, runId: null, coordinatorHandle: null, status: 'stopped' })`
     - 对 `spec.posts` 中的每个岗位调用 `registry.upsertPost({ address, team: name, agent: p.agent, worktree: p.worktree, handle: null, status: 'offline', isLead: p.id === spec.lead, sessionMarker: null, sessionId: null, sessionAt: null })`。
2. **导入已有配置模式（`mode: 'import'`）**：
   - 调用 `loadTeamSpec(args.specPath)` 校验文件存在且合法，得到 `spec` 与 `specHash`。
   - 若 `registry.getTeam(spec.name)` 已存在：
     - 若 `existing.specPath === spec.specPath`，直接返回 `{ team: spec.name, specPath: spec.specPath, created: false }`；
     - 否则抛出 `WinglineError('input', 'team_already_exists', '同名团队 <name> 已登记在另一路径：<existing.specPath>')`。
   - 按同样方式将团队登记为 `status: 'stopped'` 并初始化 `posts` 表行。
3. **CLI 对齐**：新增 `wl init [name]` 命令（选项 `--template <duo|solo|trio>`、`--repo <path>`、`--dir <dir>`、`--import <team.yaml>`、`--json`），底层直接调用 `initTeamCmd` 并记入 `AUDIT`。

---

### 3.2 角色岗位增删与职责文档内联编辑

#### 3.2.1 结构化修改操作（扩展 `packages/core/src/spec/edit.ts`）

在保留现有 `setField(text, path, value)` 逐字节手术修改的基础上，新增 `applySpecOp(text: string, op: SpecEditOp): string`：

```ts
export type SpecEditOp =
  | { op?: 'set'; path: Array<string | number>; value: unknown }
  | {
      op: 'add_post'
      post: { id: string; agent: string; model?: string; launch?: string; worktree?: string; brief?: string[] }
    }
  | { op: 'remove_post'; index: number }
```

- **`add_post`**：
  - 解析 YAML Document，确保 `posts` 是序列；若已有同名 `id` 则抛出 `spec_invalid`（`岗位 id 重复：<id>`）。
  - 将新岗位节点追加到 `posts` 末尾（其中 `brief` 列表保持 flow 格式 `[briefs/<id>.md]`）。
- **`remove_post`**：
  - 校验 `index` 是 `posts` 的有效下标，且 `posts.items.length > 1`（只剩最后一个岗位时抛出 `spec_invalid`：`团队至少保留一个岗位`）。
  - 读取被删岗位的 `removedId`，从 `posts` 删除该项；若 `removedId` 非空：
    - 删除 `links.<removedId>` 与 `gates.<removedId>`；
    - 从其余岗位的 `links.*.(reviewed_by|hands_to|consults)` 数组中剔除 `removedId`（数组变空则删掉该子键，映射变空则删掉该岗位键）；
    - 若顶层 `lead === removedId`，将 `lead` 改为剩余第一个岗位的 `id`。

#### 3.2.2 规范与职责 Markdown 文件读写（扩展 `packages/core/src/commands/spec.ts`）

1. **安全边界与大小限制**：
   - 单份 Markdown 文件上限 `DOC_LIMIT_BYTES = 64 * 1024`（64 KB UTF-8 字节），超出报 `WinglineError('input', 'doc_too_large', '文档 <rel> 超过 64 KB 上限')`。
   - 路径解析函数 `resolveDocPath(specDir: string, rel: string): string`：
     - `rel` 必须为非空字符串、以 `.md` 结尾、不含 `\0`；
     - `abs = path.resolve(specDir, rel.replace(/\\/g, '/'))`；
     - 校验 `path.relative(specDir, abs)` 不以 `'..'` 开头且不是绝对路径；若目标文件或其已存在的父目录在磁盘上存在，再用 `fs.realpathSync` 核对真实路径仍在 `fs.realpathSync(specDir)` 之内，否则抛出 `WinglineError('input', 'doc_path_invalid', '文档路径 <rel> 必须位于团队目录内且为 .md 文件')`。
2. **加载（`readSpecForEdit`）**：
   - `SpecForEdit` 新增 `files: Record<string, string>`。
   - 收集正式规格与草稿（若有）中出现的 `norms` 相对路径及每个岗位的 `brief` 相对路径；对每个合法相对路径读取文件内容放入 `files[rel]`（若文件不存在则填 `''`）。
3. **实时校验与预演（`validateSpecEdit`）**：
   - 请求参数扩充为 `{ team: string; yaml: string; set?: SpecEditOp; files?: Record<string, string> }`。
   - `validateSpecText(text, specPath, o)` 增加可选参数 `virtualFiles?: ReadonlySet<string>`：当 `resolveFile` 检查 `norms` 或 `brief` 文件是否存在时，若磁盘文件已存在**或**其规范化相对路径在 `virtualFiles` 中，均视为存在。这样用户在表单里新增岗位并自动生成内存中的 `briefs/<id>.md` 时，实时校验与预演立即可过，无需先点保存。
4. **保存（`saveSpecCmd`）**：
   - `SaveSpecArgs` 新增可选 `files?: Record<string, string>`。
   - 先用 `validateSpecText(a.yaml, row.specPath, { virtualFiles: new Set(Object.keys(a.files ?? {})) })` 校验新规格合法，并提取新规格引用的全部文档相对路径集合 `referencedDocs`。
   - 对 `a.files` 中的每个 `[rel, content]`：
     - 必须在 `referencedDocs` 集合内（防止借接口写入未被引用的任意 `.md` 文件）；
     - 经 `resolveDocPath(specDir, rel)` 与 `DOC_LIMIT_BYTES` 校验通过后，先写同目录临时文件再 `renameSync` 原子落盘（父目录如 `briefs/` 不存在时自动 `fs.mkdirSync(..., { recursive: true })`）。
   - 文档全部落盘后，调用原有的 `saveSpec` 保存 `team.yaml`（已停止时）或 `team.draft.yaml`（运行中时）。
   - **运行中团队修改文档的保护**：当 `a.running === true`（保存为草稿）时，若某份 `.md` 文件是正式规格正在使用的已存在文件且内容发生了改动，为了不静默篡改运行中团队的正式规范，保存草稿时：
     - 新建岗位对应的新 `.md` 文件（磁盘尚不存在）直接写入 `briefs/<id>.md`；
     - 已存在的 `.md` 文件若内容未变则不重写，若内容有变则同样直接更新该 `.md` 文件（因为 `.md` 只在 `wl up` / `wl restore` 新开会话生成启动包时读取，不会打断正在运行的终端会话；在页面保存提示中明确说明“规范与职责文档已更新，将在下次启动或新开会话时生效”）。

---

### 3.3 HTTP API 与审计扩展（`packages/core/src/server/`）

#### 3.3.1 读接口扩展

- **`GET /api/session`**：保持返回 `{ csrfToken, version, teams }`。
- **`GET /api/teams`**（`api-read.ts`）：每个团队摘要扩充 `status: 'up' | 'stopped'` 与 `hasDraft: boolean`，供侧栏和总览直接区分「运行中」与「已停止」。
- **`GET /api/teams/:team`**（`api-read.ts`）：返回对象扩充 `status: 'up' | 'stopped'`、`specPath: string`、`hasDraft: boolean`；未启动与 Orca 不可达时的降级规则见 3.3.4。
- **`GET /api/about`**（`api-spec.ts` / `about.ts`）：返回对象新增 `autostart` 字段，形状沿用 core 已有的 `AutostartStatus`：
  ```ts
  autostart:
    | { supported: true } & AutostartStatus & { platform: string; user?: string; logPath: string }
    | { supported: false; reason: string }
  ```
  `AutostartStatus` 为 `{ installed, location, command: string[], commandMissing: string[], logTail: string[], linger?: boolean }`（见 `packages/core/src/commands/autostart/status.ts`）。`autostartStatusOf` 需要 `AutostartSys`，取用 3.3.3 第 2 条搬到 core 的 `realAutostartSys()`；取失败（如权限不足）时返回 `{ supported: false, reason }` 而不抛错。

#### 3.3.4 未启动团队与 Orca 不可达时的降级

新建的团队在 `wl up` 之前处于「已登记但未启动」状态（`teams.status = 'stopped'` 且 `runId = null`），此时若 Orca 没开或根本没起过，`ps()` 的 `preflight` 会抛 `orca` 类错误，任务列表的 `mustTeamReady` 会抛 `run_not_ready`。控制台必须能正常展示这类团队并引导用户启动：

- **`GET /api/teams/:team`（总览）**：当 `registry.getTeam(team).runId === null`（从未启动）时，不调用 `ps()` 与 `dispatcherStatus()`，改为返回 `{ team, status: 'stopped', runId: null, specPath, hasDraft, dispatcher: { health: { state: 'never' }, frozen: 0, hushed: 0, attentionItems: 0 }, posts: <由 registry.listPosts 构造的离线岗位>, neverStarted: true }`；当 `runId` 存在但 Orca 不可达时，捕获 `orca` 类错误，同样降级为离线岗位列表，并在返回值里附 `orcaUnavailable: <消息>`，页面顶部显示「Orca 未运行或不可达，岗位状态暂不可用」。
- **任务相关接口**（`/api/teams/:team/tasks`、`/api/teams/:team/tasks/:id`）：`run_not_ready` 原样透传（400），前端捕获后显示空状态提示「团队尚未启动，先点击「启动团队」」，不显示红色错误块。
- **`POST /api/teams/:team/dispatcher/up`**：`dispatcherUp` 内部 `mustTeamReady` 要求团队已有 Run，因此未启动团队的「启动调度员」按钮置灰，提示「先启动团队」。

#### 3.3.2 写接口与 `CONSOLE_AUDIT` 扩展（`api-write.ts`）

`WriteCommands` 接口与 `WRITE_ROUTES`、`CONSOLE_AUDIT` 新增以下 13 个动作（全部走 `auditedCommands`，执行者 `human`）：

| 路由 | 请求体字段 | 调用的 core 函数 | 审计 `command` | 审计 `summary` |
| --- | --- | --- | --- | --- |
| `POST /api/teams` | `mode`, `name`, `repo`, `template`, `dir`, `specPath`, `retryRequest` | `initTeamCmd` | `init` | `{ mode, template, created }` |
| `POST /api/teams/:team/up` | `draft`, `newRun`, `adoptRun`, `retryRequest` | `up`（自动传入团队的 `specPath`） | `up` | `{ draft, newRun, adoptRun }` |
| `POST /api/teams/:team/down` | `close`, `retryRequest` | `down` | `down` | `{ close: !!a.close }` |
| `POST /api/teams/:team/restore` | `dryRun`, `noTasks`, `sessions`, `retryRequest` | `restore` | `restore`（`dryRun` 时 `skip: true`） | `{ dryRun: !!a.dryRun, noTasks: !!a.noTasks, session: Object.keys(a.sessions ?? {}) }` |
| `POST /api/teams/:team/dispatcher/up` | `retryRequest` | `dispatcherUp` | `dispatcher up` | `{}` |
| `POST /api/teams/:team/dispatcher/down` | `close`, `retryRequest` | `dispatcherDown`（默认 `close: true`） | `dispatcher down` | `{ close: a.close }` |
| `POST /api/teams/:team/tasks/:id/claim` | `as`, `retryRequest` | `claimTask` | `task claim` | `{ as: a.as }` |
| `POST /api/teams/:team/tasks/:id/release` | `as`, `retryRequest` | `releaseTask` | `task release` | `{ as: a.as }` |
| `POST /api/teams/:team/tasks/:id/plan` | `as`, `text`, `retryRequest` | `planTask`（需先给它补一个 `as` 形参，见 3.3.3） | `task plan` | `{ as: a.as, text: a.text }` |
| `POST /api/teams/:team/tasks/:id/start` | `as`, `retryRequest` | `startTask` | `task start` | `{ as: a.as }` |
| `POST /api/teams/:team/tasks/:id/done` | `as`, `retryRequest` | `doneTask` | `task done` | `{ as: a.as }` |
| `POST /api/autostart/install` | `waitOrca`, `retryRequest` | `autostartInstall` | `autostart install` | `{ waitOrca: a.waitOrca }` |
| `POST /api/autostart/uninstall` | `retryRequest` | `autostartUninstall` | `autostart uninstall` | `{}` |

参数校验与安全细节：
- 任务执行流的 5 个接口中，`as` 必填（字符串）：若不含 `@` 则先 `checkParam('post', as)` 再拼成 `postAddress(as, ctx.params.team!)`；若含 `@` 则校验其团队后缀必须等于 `ctx.params.team!`，防止跨团队伪造。
- `POST /api/teams/:team/spec` 的允许字段扩充为 `['yaml', 'baseHash', 'running', 'files', 'retryRequest']`；`SPEC_BODY_LIMIT` 调整为 `512 * 1024`（512 KB），容纳 `team.yaml` 加若干份 64 KB 以内的 `.md` 文档。
- `POST /api/teams/:team/spec/validate` 的允许字段扩充为 `['yaml', 'set', 'files']`，其中 `parseSet` 支持 `{ path, value }`、`{ op: 'add_post', post }`、`{ op: 'remove_post', index }` 三种形态。

#### 3.3.3 需要连带修改的两处 core 函数

1. **`planTask` 增加 `as` 形参**（`packages/core/src/commands/task/plan.ts`）：
   - 现状：`planTask(deps, a: { id: string; text: string })` 内部用 `resolveActor(deps)`，取不到执行者时记为 `human`；**没有 `as` 形参**。
   - 控制台要「以岗位身份记录计划」必须能显式指定岗位。最小改动：签名改为 `planTask(deps, a: { id: string; text: string; as?: string })`，内部改为 `resolveActor(deps, a.as)`。
   - 显式 `as` 时 `resolveActor` 返回 `{ address: as, explicit: true }`，任务日志的 `actor` 记为该岗位、`actorSource` 为 `explicit`；未传 `as` 时行为与现在完全一致（`ORCA_TERMINAL_HANDLE` 推断，或记为 `human`）。CLI 的 `wl task plan` 不传 `--as`，行为不变。
2. **`realAutostartSys()` 从 CLI 移到 core**（新增 `packages/core/src/commands/autostart/sys.ts`）：
   - 现状：该函数在 `packages/cli/src/cli.ts` 里私有实现；`autostartInstall` / `autostartUninstall` / `autostartStatusOf` 都需要一个 `AutostartSys`（平台、homeDir、uid、user、node、入口脚本、`exec`、`fs`）。
   - 控制台服务在 core 内，没有 `AutostartSys`。因此把该函数整体搬到 core 并导出，CLI 改为从 core 引入（删掉本地副本），`packages/cli/src/cli.ts` 的 `realAutostartSys` 保留为一行转调以免影响既有测试导入。
   - 控制台侧调用：`autostartInstall(deps, realAutostartSys(), { waitOrca })`、`autostartUninstall(deps, realAutostartSys())`、`autostartStatusOf(deps, realAutostartSys())`。

---

### 3.4 前端界面与交互设计（`packages/web/src/`）

#### 3.4.1 视觉、配色与按钮文案规范

1. **配色与暗色模式兼容**：
   - 保持 `packages/web/src/styles.css` 的 `:root` 亮/暗双色变量体系，显式确保所有原生表单控件（`input`、`select`、`textarea`）继承 `color-scheme: light dark`、`color: var(--ink)`、`background: var(--surface)`、`border: 1px solid var(--line)`，杜绝任何「黑底黑字」或不可读的原生下拉选择器。
2. **三档按钮样式（无红字按钮）**：
   - 主操作按钮（`.btn`）：`background: var(--accent)`（深绿）、白字（亮色下 `#ffffff`、暗色下 `#171816`）。
   - 次操作按钮（`.btn.ghost`）：`background: var(--surface)`、`color: var(--ink)`、`border: 1px solid var(--line)`。
   - 危险操作按钮（`.btn.danger`）：`background: var(--bad)`、白字（`#ffffff`）、`border-color: var(--bad)`。
3. **纯中文按钮文案 + 下方命令行对照**：
   - 按钮本身只写纯中文动词短语（如「新建团队」「启动团队」「应用草稿并重启」「接回会话」「停止团队」「启动调度员」「停止调度员」「认领任务」「放弃认领」「记录计划」「开始任务」「完成并校验」「改派主人」「恢复派发」「转人工处理」「新增角色岗位」「删除岗位」「开启自动恢复」「关闭自动恢复」）。
   - 在每组操作按钮下方或弹窗底部渲染一行 `<CommandHint>`（或紧凑型命令行对照），展示对应的 `wl ...` 终端命令并带「复制」按钮，实现「将命令行操作在 UI 呈现」的同时保留透明可查的命令映射。

#### 3.4.2 侧栏与「新建团队」弹窗（`Layout.tsx`、`App.tsx`、`NewTeamDialog.tsx`）

- 左侧栏 `.side` 在团队下拉框下方固定放置「新建团队」主按钮；当 `teams.length === 0` 时，首页居中展示引导文案与「新建团队」按钮（同时保留 `wl up <team.yaml>` 提示）。
- 点击「新建团队」打开弹窗：
  - **模式切换**：「使用预设模板」（默认） / 「导入已有配置」。
  - **预设模板模式**：
    - 模板单选卡片：「双人协作（推荐）」「单人」「三人流水线」（切换时展示该模板包含的角色与协作链摘要）；
    - 必填输入：「团队名称」（小写字母、数字、连字符）、「代码库目录」（本机仓库路径）；
    - 可选输入：「配置存放目录」（留空默认 `~/.wingline/teams/<团队名称>`）；
    - 底部两个提交按钮：「仅创建配置」（调 `POST /api/teams` 后刷新会话并跳至 `/t/<name>/edit`）与「创建并启动」（先调 `POST /api/teams`，成功后紧接着调 `POST /api/teams/<name>/up`，跳至 `/t/<name>` 总览页）。
  - **导入已有配置模式**：
    - 必填输入：「配置文件路径（team.yaml）」；
    - 提交按钮：「导入团队」与「导入并启动」。

#### 3.4.3 总览页 `/t/:team`：团队与调度员生命周期控制（`Overview.tsx`）

- **页面头部操作栏**：
  - 展示团队名称、状态徽标（`运行中` / `已停止`）、运行编号 `Run <runId>`。
  - 操作按钮组：
    - 「启动团队」（团队已停止时为主按钮，运行中时为「补齐岗位」次按钮）：点击调用 `POST /api/teams/:team/up`。若返回 `run.outcome === 'ambiguous'` 或 `'lost'`，弹出运行选择对话框，允许选择候选 `adoptRun` 或勾选「新建运行（丢弃旧任务）」后再次提交。
    - 当 `hasDraft === true` 时显示「应用草稿并重启」主按钮：弹窗说明将先停止团队再以 `--draft` 启动（可勾选「同时关闭旧岗位终端」），确认后依次调用 `down` 与 `up({ draft: true })`。
    - 「接回会话」按钮：打开弹窗，可勾选「仅预览不执行」「不恢复任务」或填写指定岗位的会话编号（`builder=sess-1`），调用 `POST /api/teams/:team/restore` 并展示每个岗位的接回结果（`kept` / `resumed` / `fresh` / `ambiguous` / `uncertain`）。
    - 「停止团队」危险按钮（团队运行中时显示）：打开确认弹窗，提供复选框「同时关闭岗位终端」，调用 `POST /api/teams/:team/down`。
  - 操作栏下方展示对应命令行：`wl up <specPath>` / `wl restore <team>` / `wl down <team>`。
- **调度员卡片**：
  - 当 `dispatcher.health.state !== 'running'` 时，右侧显示「启动调度员」主按钮（调用 `POST /api/teams/:team/dispatcher/up`）；
  - 当 `state === 'running'` 或 `'stale'` 时，右侧显示「停止调度员」危险按钮（调用 `POST /api/teams/:team/dispatcher/down`，默认 `close: true`）；
  - 卡片底部保留 `wl dispatcher up/down <team>` 命令对照。

#### 3.4.4 收件箱 `/t/:team/inbox`：补齐快捷执行按钮（`Inbox.tsx`）

- 「调度员」告警区：除了展示 `wl dispatcher up <team>`，直接提供「启动调度员」按钮。
- 「卡住的任务」列表：除原有的 `dead_assignee`（「恢复派发」）外，对其余卡住原因也提供一键处理弹窗按钮（同时保留旁边的 `CommandHint`）：
  - `unclaimed` →「认领任务」（选择岗位后调 `/claim`）
  - `owner_idle` →「开始任务」（以当前主人调 `/start`）
  - `done_unfinished` →「完成并校验」（以当前主人调 `/done`）
  - `overdue` / `gate_streak` →「改派主人」或「转人工处理」

#### 3.4.5 编辑页 `/t/:team/edit`：角色增删、职责正文与一键应用（`Edit.tsx`、`SpecForm.tsx`、`SpecPreview.tsx`）

- **团队分组卡片**：
  - 原有的「牵头岗（lead）」改为下拉选择框（选项来自当前 `posts` 的 `id` 列表，若当前值不在列表中则保留文本输入兜底）；
  - 新增「团队规范正文（`norms` 文件）」多行文本域，绑定 `files[parsed.norms ?? 'NORMS.md']`，右上角标注相对文件路径。
- **角色岗位分组卡片**：
  - 每个岗位卡片右上角增加「删除岗位」危险小按钮（当 `posts.length > 1` 时可点，触发 `{ op: 'remove_post', index: i }`）；
  - 保留原有的岗位参数字段（全部配中文标签：`岗位标识 id`、`代理 agent`、`模型 model`、`启动命令 launch`、`远端环境 environment`、`工作区 worktree`、`简报文件 brief`、`标签 tags`、`自主认领 self_claim`、`先写计划 plan_first`）；
  - 在岗位卡片底部新增「岗位职责简报正文」多行文本域，绑定该岗位第一个简报文件 `files[post.brief?.[0] ?? 'briefs/<id>.md']`（当岗位还没有填 `brief` 且用户输入了职责正文时，自动将 `posts[i].brief` 设为 `['briefs/<id>.md']`）。
- **新增角色岗位操作栏**：
  - 在岗位列表下方提供「新增角色岗位」按钮：点击可选择预设角色（「实现岗」「审查岗」「规划岗」「自定义」），输入新岗位标识（如 `reviewer`），触发 `{ op: 'add_post', post }` 并在 `files['briefs/reviewer.md']` 中填入对应角色的默认职责模板。
- **保存与一键启动/应用栏**：
  - 除原有的「保存 / 保存为草稿」按钮外：
    - 当团队处于已停止（`!spec.running`）时，并排提供「保存并启动」主按钮（先调 `POST /api/teams/:team/spec` 保存配置与 Markdown 文件，成功后调 `POST /api/teams/:team/up` 并展示启动结果）；
    - 当团队处于运行中（`spec.running`）时，并排提供「保存草稿并重启应用」按钮（弹窗确认是否关闭旧终端，依次执行保存草稿 → `down` → `up --draft`）。

#### 3.4.6 任务详情页 `/t/:team/tasks/:id`：手动代岗位执行流（`TaskDetail.tsx`）

- 当任务未处于终态（`status !== 'completed' && status !== 'failed'`）时，在任务详情页顶部操作区上方渲染「以岗位身份执行」卡片：
  - **执行岗位下拉框**：从 `/api/teams/:team` 读取团队岗位列表，默认选中 `task.claimedBy`（若任务尚未被认领则默认选中团队牵头岗 `lead`）。
  - **五个纯中文操作按钮**：
    1. 「认领任务」：调用 `POST /api/teams/:team/tasks/:id/claim`（`{ as }`）；
    2. 「放弃认领」：调用 `POST /api/teams/:team/tasks/:id/release`（`{ as }`）；
    3. 「记录计划」：打开带多行文本框的弹窗，调用 `POST /api/teams/:team/tasks/:id/plan`（`{ as, text }`）；
    4. 「开始任务」：调用 `POST /api/teams/:team/tasks/:id/start`（`{ as }`）；
    5. 「完成并校验」：调用 `POST /api/teams/:team/tasks/:id/done`（`{ as }`）。若返回 `outcome === 'gate_failed'` 或 `'escalated'`，在弹窗或页面提示中清晰展示闸门失败原因与输出摘要，并刷新任务详情。
  - 卡片底部展示动态拼接的对应命令行：`wl task <claim|release|plan|start|done> <id> --as <选中岗位>`。
- 原有的管理员操作按钮文案同步规范为纯中文：「改派主人」「恢复派发」「处理闸门」「转人工处理」；当任务处于终态（`completed` / `failed`）时，提供「重开并转人工」按钮（调用 `escalate` 带 `reopen: true`）。

#### 3.4.7 关于与诊断页 `/settings`：开机自动恢复管理（`Settings.tsx`）

- 新增「登录后自动恢复（`wl autostart`）」区块：
  - 当 `autostart.supported === false` 时，显示平台不支持的原因说明；
  - 当 `supported === true` 时，展示当前安装状态（`已开启` / `未开启`）、服务文件路径、将执行的命令及最近日志尾部；
  - 右侧提供「开启自动恢复」主按钮（可填等待 Orca 时长，默认 `15m`，调用 `POST /api/autostart/install`）与「关闭自动恢复」危险按钮（调用 `POST /api/autostart/uninstall`），下方附 `wl autostart install / uninstall` 命令对照。

---

## 4. 错误处理、边界与安全约束

1. **路径穿越防护**：`readSpecForEdit` 与 `saveSpecCmd` 处理 `files` 时，严格限制相对路径在 `path.dirname(specPath)` 目录内部且扩展名为 `.md`；拒绝绝对路径、`..` 越界、非 `.md` 文件及软链接越界。新建团队的默认目录位于 `<WINGLINE_HOME>/teams/<team>`；若用户在新建或导入时显式指定本机路径，與 `wl up` 一致视为本机已认证用户的可信操作（控制台本身受 `127.0.0.1` + 一次性登录令牌 + `SameSite=Strict` 会话 + CSRF + Origin 四重保护）。
2. **长耗时命令的超时与不确定状态**：
   - `up`、`restore`、`dispatcher up`、`task done`（含跑闸门命令）可能耗时数秒至数十秒；前端按钮在请求在途时禁用并显示「执行中…」。
   - 若请求返回 504（`kind === 'uncertain'`），`ActionDialog` 与操作栏统一展示警告与「按原样重试」按钮（携带返回的 `retryRequest`），绝不自动重发。
3. **单文件与函数规模约束**：遵守仓库全局约束，所有新增与修改的函数控制在 50 行以内。

---

## 5. 留给实现者决定的细节（Left to the Builder）

- 新建团队弹窗、运行结果详情弹窗的具体 DOM class 命名与间距微调（直接复用 `styles.css` 现有的 `.dialog`、`.card`、`.field`、`.row` 即可）。
- `ROLE_BRIEFS` 与默认 `NORMS.md` 模板的具体措辞润色（保持与 `teams/duo/` 相同的简明条款风格）。
- 前端组件拆分粒度（如将总览页的团队生命周期按钮栏拆为独立的 `TeamActions.tsx`、任务详情页的岗位代执行拆为 `TaskPostActions.tsx`，以保持单文件清晰精简）。

---

## 6. 本次由设计方拍板的决定（请一并复核）

以下是头脑风暴中没有逐条确认、由设计方按仓库既有约定直接定下的选择；如与预期不符请指出，实施前改比实施后改便宜：

1. **默认配置目录**：新建团队落在 `<WINGLINE_HOME>/teams/<团队名称>/`（即 `~/.wingline/teams/<name>/`），而不是仓库的 `teams/` 目录——后者属于源码仓库，不该被控制台写入。
2. **模板集合**：只做三套（双人协作 / 单人 / 三人流水线），不做可自定义模板的模板编辑器；「导入已有配置」覆盖自定义需求。
3. **`wl init` 命令名**：使用 `wl init`（而非 `wl new` / `wl team create`），与 `wl up` / `wl down` / `wl restore` 的动词风格一致。
4. **职责正文的落盘时机**：`.md` 文件与 `team.yaml` / `team.draft.yaml` 在同一次保存请求里一起落盘；运行中的团队改 `.md` 也直接写正式 `.md`（不影响已在运行的终端会话，下次启动或新开会话时生效），页面提示这一点。
5. **危险按钮样式**：沿用仓库现有 `.btn.danger`（红底白字），不使用红字；主按钮沿用 `.btn`（深绿底白字），次按钮沿用 `.btn.ghost`。
6. **按钮下方的命令行对照**：保留 `<CommandHint>` 组件（可一键复制），但按钮本身只写纯中文。
7. **`plan` 的执行者归属**：给 `planTask` 补 `as` 形参（不改 CLI 现有行为），使页面代写的计划记在该岗位名下而不是 `human`。
8. **`realAutostartSys()` 上移 core**：为了让控制台能读写开机自启状态，必须把它从 CLI 移到 core；CLI 侧保留一行转调以免破坏既有测试。
9. **新增 CLI 命令**：只加 `wl init` 一个；其余能力（`up` / `down` / `restore` / 任务五步 / `autostart`）都是既有命令的网页入口，不新增 CLI 子命令。
