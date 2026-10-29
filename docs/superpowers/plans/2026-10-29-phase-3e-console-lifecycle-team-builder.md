# 阶段 3E：控制台全生命周期与团队定义扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `wl console` 能从零新建团队（内置默认模板）、增删角色岗位并内联编辑团队规范与岗位职责简报，并把 `up`/`down`/`restore`/调度员启停/任务执行流五步/`autostart` 全部 CLI 操作变成页面上可点的按钮。

**Architecture:** 后端在 `packages/core` 增加 `initTeamCmd`（模板渲染 + 登记注册表）、`applySpecOp`（岗位增删的 YAML AST 手术）、规范与职责 Markdown 的读写（`spec/doc.ts` + `validateSpecText` 的 `virtualFiles`），并在 `server/api-write.ts` 里补 13 条写路由（全部走 `auditedWriteCommands('console:')`）、在 `server/api-read.ts` 里补团队状态与未启动团队的降级。前端在 `packages/web` 侧栏加「新建团队」弹窗、把编辑页升级成可增删岗位与内联编辑职责、并把各页的 `<CommandHint>` 命令条换成纯中文按钮 + 命令行对照。

**Tech Stack:** Node ≥22.13、TypeScript、`yaml`（AST 手术）、`node:sqlite`（注册表）、`node:http`（控制台服务）；前端 Preact + Vite；测试 vitest + `@testing-library/preact`。

**Spec:** `docs/superpowers/specs/2026-10-29-phase-3e-console-lifecycle-team-builder-design.md`（本计划逐条实现该规格；实现前请先读完它，尤其是第 4 节的安全约束与第 6 节的 9 条拍板决定）。

## Global Constraints

- 仓库全局约束：所有新增/修改的函数不超过 50 行；不新增运行时第三方依赖（后端只用 Node 内置模块 + 现有 `yaml`/`zod`，前端只用 Preact）。
- 提交信息用中文，格式 `type(scope): 描述`（例：`feat(core): 团队模板与 initTeamCmd`）。
- 每个任务结束前必须跑通 `pnpm test`（全量）与 `pnpm typecheck`；本会话中这两个命令需要 `dangerouslyDisableSandbox: true`（沙箱只放行了 `packages/core/src`）。
- 写接口一律经 `auditedWriteCommands('console:')` 记入 `audit_events`，执行者 `human`；**严禁**绕过审计直接调 core 函数写库。
- 结果不确定（`kind === 'uncertain'`）时前端**绝不自动重试**，必须由用户在弹窗里点「按原样重试」并携带原 `retryRequest`。
- 已有 YAML 的字段修改继续走 `packages/core/src/spec/edit.ts` 的 AST 范围替换，**不得**整篇 `doc.toString()` 重排用户手写的注释与排版。
- 按钮文案一律纯中文；不使用红字按钮（只用 `.btn` 深绿底白字 / `.btn.ghost` 白底描边 / `.btn.danger` 红底白字三档）；输入框、下拉框、文本域在亮暗两色下都必须是可读的白底深字或暗底浅字。
- 控制台只读写当前团队目录里被规格引用的 `norms` 与 `posts[*].brief[*]` 两类 `.md` 文件，不提供任意文件浏览或编辑。
- **绝不删除文件**：本计划不涉及任何文件删除；如实现中出现删除既有文件的写法，停下来问人。

## Review Focus

规格暗示、但没有任何一个任务的测试覆盖、最可能真正伤到人的五件事。每条在下方对应任务里都有钉住它的测试。

1. **运行中的团队改了 `.md` 之后，注册表里的 `specHash` 变旧**：`specHash` 把 `norms` 与每个 `brief` 的 sha256 一起算进去，所以页面改一次职责正文，`wl restore` 与 `wl up --draft` 就会抛 `team_spec_changed`。合理解释：控制台在保存成功时明确提示「规范已更新，恢复会话前需要重启团队」，而不是让用户撞见一条红字错误。→ 任务 4。
2. **任务五步接口的 `as` 可以跨团队伪造**：`as: 'builder@other-team'` 若不校验，就会以别的团队的身份写任务日志。合理解释：拒绝，返回 400。→ 任务 7。
3. **未启动的团队点「启动调度员」**：`dispatcherUp` 内部的 `mustTeamReady` 要求团队已有 Run。合理解释：返回可读的 `run_not_ready` 提示、按钮置灰，而不是 500。→ 任务 6。
4. **文档路径越界**：保存请求里的 `files` 若含 `../../evil.md` 或 `notes.txt`，就会写到团队目录之外或写入非 `.md` 文件。合理解释：一律 400 `doc_path_invalid`，一个字节都不写。→ 任务 4。
5. **新增岗位的 `brief` 还没落盘就校验规格**：表单里新增一个岗位时，`briefs/<id>.md` 只存在于内存里，此时校验必须把它当成存在，否则「新增岗位」永远保存不了。→ 任务 4。

---

### Task 1: 团队模板与 `initTeamCmd`

**Files:**
- Create: `packages/core/src/commands/templates.ts`
- Create: `packages/core/src/commands/init.ts`
- Modify: `packages/core/src/index.ts`（末尾追加两行导出）
- Test: `packages/core/test/commands/init.test.ts`

**Interfaces:**
- Consumes: `loadTeamSpec(specPath)`（`packages/core/src/spec/load.ts`）、`specHash(spec)`（`packages/core/src/spec/hash.ts`）、`deps.registry.upsertTeam/upsertPost`（`packages/core/src/registry/registry.ts`）、`CommandDeps`（`packages/core/src/commands/deps.ts`）。
- Produces:
  ```ts
  // packages/core/src/commands/templates.ts
  export type TeamTemplateId = 'duo' | 'solo' | 'trio'
  export type RoleKind = 'builder' | 'checker' | 'planner'
  export interface TeamTemplatePost { id: string; role: RoleKind; agent: string; model?: string; launch?: string; brief: string }
  export interface TeamTemplate {
    id: TeamTemplateId
    label: string          // 中文名，如「双人协作」
    summary: string        // 一句话说明角色与协作链
    lead: string
    posts: TeamTemplatePost[]
    links: Record<string, Record<string, string[]>>
  }
  export const TEAM_TEMPLATES: Record<TeamTemplateId, TeamTemplate>
  export const ROLE_BRIEFS: Record<RoleKind, (team: string, post: string) => string>
  export function renderTeamYaml(t: TeamTemplate, a: { name: string; repo: string }): string
  export function renderNorms(a: { team: string; posts: string[] }): string
  export function renderBrief(role: RoleKind, a: { team: string; post: string }): string

  // packages/core/src/commands/init.ts
  export type InitTeamMode = 'template' | 'import'
  export interface InitTeamArgs {
    mode: InitTeamMode
    name?: string          // mode==='template' 必填，匹配 /^[a-z0-9-]+$/
    repo?: string          // mode==='template' 必填
    template?: TeamTemplateId   // 缺省 'duo'
    dir?: string           // 缺省 path.join(deps.home, 'teams', name)
    specPath?: string      // mode==='import' 必填
  }
  export interface InitTeamResult { team: string; specPath: string; created: boolean }
  export async function initTeamCmd(deps: CommandDeps, a: InitTeamArgs): Promise<InitTeamResult>
  ```

- [ ] **Step 1: 写失败测试 `packages/core/test/commands/init.test.ts`**

  用 `mkDeps(new FakeOrca())`（`packages/core/test/commands/fake-client.ts`）拿到带临时 `home` 的 `deps`，不要用 `seedRunningTeam`（那是给已运行团队用的）。

  ```ts
  import fs from 'node:fs'
  import path from 'node:path'
  import { expect, test } from 'vitest'
  import { initTeamCmd } from '../../src/commands/init.js'
  import { loadTeamSpec } from '../../src/spec/load.js'
  import { FakeOrca, mkDeps } from './fake-client.js'

  test('模板模式生成 duo 团队：配置、规范与两份职责简报，并登记为未启动', async () => {
    const { deps } = mkDeps(new FakeOrca())
    const r = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
    expect(r).toEqual({ team: 'my-team', specPath: path.join(deps.home, 'teams', 'my-team', 'team.yaml'), created: true })
    expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'NORMS.md'))).toBe(true)
    expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'briefs', 'builder.md'))).toBe(true)
    expect(fs.existsSync(path.join(deps.home, 'teams', 'my-team', 'briefs', 'checker.md'))).toBe(true)
    const spec = loadTeamSpec(r.specPath)
    expect(spec.name).toBe('my-team')
    expect(spec.lead).toBe('builder')
    expect(spec.posts.map((p) => p.id)).toEqual(['builder', 'checker'])
    expect(spec.posts[1]!.launch).toContain('codex --model gpt-6-astra')
    const row = deps.registry.getTeam('my-team')!
    expect(row.status).toBe('stopped')
    expect(row.runId).toBeNull()
    expect(deps.registry.listPosts('my-team').map((p) => p.address).sort()).toEqual(['builder@my-team', 'checker@my-team'])
  })

  test('repo 自动补 path: 前缀；solo 模板只有一个岗位', async () => {
    const { deps } = mkDeps(new FakeOrca())
    const r = await initTeamCmd(deps, { mode: 'template', name: 'one', repo: '/tmp/repo', template: 'solo' })
    expect(loadTeamSpec(r.specPath).repo).toBe('path:/tmp/repo')
    expect(loadTeamSpec(r.specPath).posts.map((p) => p.id)).toEqual(['builder'])
  })

  test('重复初始化同一个团队是幂等的（created=false），不报错也不覆盖', async () => {
    const { deps } = mkDeps(new FakeOrca())
    const a = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
    const b = await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
    expect(b.created).toBe(false)
    expect(b.specPath).toBe(a.specPath)
  })

  test('非法的团队名与已存在的团队分别报可读错误', async () => {
    const { deps } = mkDeps(new FakeOrca())
    await expect(initTeamCmd(deps, { mode: 'template', name: 'My Team', repo: '/tmp/repo' }))
      .rejects.toMatchObject({ code: 'team_name_invalid' })
    await initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo' })
    await expect(initTeamCmd(deps, { mode: 'template', name: 'my-team', repo: '/tmp/repo', dir: path.join(deps.home, 'other') }))
      .rejects.toMatchObject({ code: 'team_already_exists' })
  })

  test('导入已有配置：登记为未启动团队；配置不合法时报 spec_invalid', async () => {
    const { deps } = mkDeps(new FakeOrca())
    const dir = path.join(deps.home, 'imported')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'NORMS.md'), '# 规范\n')
    fs.writeFileSync(path.join(dir, 'team.yaml'), [
      'version: 1', 'name: imported', 'repo: path:/tmp/repo', 'norms: NORMS.md', 'lead: builder',
      'posts:', '  - id: builder', '    agent: claude', '    model: opus', '    worktree: current', '    brief: [briefs/builder.md]',
    ].join('\n'))
    fs.mkdirSync(path.join(dir, 'briefs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'briefs', 'builder.md'), '# builder\n')
    const r = await initTeamCmd(deps, { mode: 'import', specPath: path.join(dir, 'team.yaml') })
    expect(r).toEqual({ team: 'imported', specPath: path.join(dir, 'team.yaml'), created: true })
    expect(deps.registry.getTeam('imported')!.status).toBe('stopped')
  })
  ```

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/commands/init.test.ts`
  Expected: FAIL —— `Cannot find module '../../src/commands/init.js'`。

- [ ] **Step 3: 实现 `packages/core/src/commands/templates.ts`**

  - `TEAM_TEMPLATES` 三套模板，字段严格按下表（`launch` 与仓库 `teams/duo/team.yaml` 一致）：

    | id | label | lead | posts | links |
    | --- | --- | --- | --- | --- |
    | `duo` | 双人协作 | `builder` | `builder`（`agent: claude`, `model: opus`, `brief: briefs/builder.md`）、`checker`（`agent: codex`, `launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'`, `brief: briefs/checker.md`） | `{ builder: { reviewed_by: ['checker'] } }` |
    | `solo` | 单人 | `builder` | `builder`（`agent: claude`, `model: opus`, `brief: briefs/builder.md`） | `{}` |
    | `trio` | 三人流水线 | `planner` | `planner`（`claude`/`opus`）、`builder`（`claude`/`opus`）、`checker`（`codex` + 上面那条 `launch`） | `{ planner: { hands_to: ['builder'] }, builder: { reviewed_by: ['checker'] } }` |

    注意：`model` 只在 `agent` 属于 `MODEL_FLAG_AGENTS`（`claude`、`codex`）时可用；`checker` 走显式 `launch`，**不要**同时写 `model`（否则 `load.ts` 的 `launchOf` 会拼出 `codex --model <model>` 而丢掉 `-c` 参数）。
  - `renderTeamYaml(t, { name, repo })` 产出的文本必须能被 `loadTeamSpec` 解析，关键行顺序固定：
    ```
    version: 1
    name: <name>
    repo: path:<repo>
    norms: NORMS.md
    lead: <lead>
    posts:
      - id: <id>
        agent: <agent>
        model: <model>          # 有才写
        launch: '<launch>'      # 有才写，单引号包住整条命令
        worktree: current
        brief: [briefs/<id>.md]
    links:                     # 有才写
      <post>:
        <rel>: [<target>]
    ```
    `repo` 已带 `path:` 前缀时不要重复加；`links` 为空对象时整段不写（`links` 在 schema 里是 `.default({})`，可省略）。
  - `renderNorms({ team, posts })`：仿 `teams/duo/NORMS.md` 的 8 条简明条款，第一行 `# <team> 团队规范`，条款里写出各岗位名字。
  - `ROLE_BRIEFS`：三个角色各一段 5–6 行的条款清单，签名 `({ name, post }) => string`，内容仿 `teams/duo/briefs/*.md`（角色职责 + 「用 `wl send <地址> "<消息>"` 联系对方」）。
  - `renderBrief(role, { team, post })` = `ROLE_BRIEFS[role](team, post)`，再补一行 `# <post> 岗位说明` 开头。

- [ ] **Step 4: 实现 `packages/core/src/commands/init.ts`**

  `initTeamCmd(deps, a)` 的分支（每个分支不超过 50 行，必要时抽 `writeTemplate` / `registerSpec` 两个私有函数）：

  1. `mode === 'template'`：
     - 校验 `name` 匹配 `/^[a-z0-9-]+$/`，否则 `WinglineError('input', 'team_name_invalid', '团队名只能用小写字母、数字与连字符')`；`repo` 非空，否则 `WinglineError('input', 'invalid_param', '缺少代码库目录')`；`template` 缺省 `'duo'`，不在 `TEAM_TEMPLATES` 里则 `invalid_param`。
     - `targetDir = a.dir ? path.resolve(a.dir) : path.join(deps.home, 'teams', a.name)`；`specPath = path.join(targetDir, 'team.yaml')`。
     - `repo` 归一：不含 `path:` 前缀则补 `path:`。
     - 已登记且 `specPath` 相同且文件存在 → 返回 `{ team, specPath, created: false }`；已登记但路径不同 → `WinglineError('input', 'team_already_exists', ...)`；未登记但磁盘上 `specPath` 已存在 → `WinglineError('input', 'spec_already_exists', '配置文件已存在：<specPath>，请改用“导入已有配置”')`。
     - 写出 `NORMS.md`、`briefs/<id>.md`（每个模板岗位一份，内容来自 `renderBrief`）、`team.yaml`（内容来自 `renderTeamYaml`）。父目录用 `fs.mkdirSync(dir, { recursive: true })` 建。
     - `loadTeamSpec(specPath)` 校验（会读 `NORMS.md` 与各 `brief`，所以必须先写文件）；`specHash(spec)`。
     - 登记：`registry.upsertTeam({ name, specPath, specHash: hash, runId: null, coordinatorHandle: null, status: 'stopped' })`；每个岗位 `registry.upsertPost({ address: postAddress(p.id, name), team: name, agent: p.agent, worktree: p.worktree, handle: null, status: 'offline', isLead: p.id === spec.lead, sessionMarker: null, sessionId: null, sessionAt: null })`。
     - 返回 `{ team: name, specPath, created: true }`。
  2. `mode === 'import'`：
     - `a.specPath` 缺失 → `invalid_param`；`loadTeamSpec(a.specPath)` 校验失败时让它自己的 `WinglineError` 冒出去。
     - `spec.name` 已在注册表：路径相同 → `created: false` 直接返回；路径不同 → `team_already_exists`（消息里带上旧路径）。
     - 登记方式与模板模式相同（`status: 'stopped'`、`runId: null`、岗位 `status: 'offline'`）。
     - 返回 `{ team: spec.name, specPath: path.resolve(a.specPath), created: true }`。

  `postAddress` 从 `packages/core/src/commands/deps.ts` 引入。

- [ ] **Step 5: 在 `packages/core/src/index.ts` 末尾追加导出**

  ```ts
  export * from './commands/templates.js'
  export * from './commands/init.js'
  ```

- [ ] **Step 6: 跑测试确认通过**

  Run: `pnpm test packages/core/test/commands/init.test.ts`
  Expected: PASS（5 个用例全绿）。

- [ ] **Step 7: 提交**

  ```bash
  git add packages/core/src/commands/templates.ts packages/core/src/commands/init.ts packages/core/src/index.ts packages/core/test/commands/init.test.ts
  git commit -m "feat(core): 团队模板与 initTeamCmd"
  ```

---

### Task 2: `wl init` CLI 命令

**Files:**
- Modify: `packages/core/src/audit.ts`（`WRITE_COMMANDS` 数组加 `'init'`）
- Modify: `packages/cli/src/cli.ts`（`Commands` 接口、`rawCommands`、`registerBaseCommands`）
- Modify: `packages/cli/src/audit-table.ts`（`AUDIT` 表加 `init` 条目）
- Modify: `packages/cli/src/output.ts`（新增 `renderInit`）
- Test: `packages/cli/test/main.test.ts`（追加用例）

**Interfaces:**
- Consumes: 任务 1 的 `initTeamCmd(deps, a)`、`InitTeamArgs`、`InitTeamResult`。
- Produces: CLI 命令 `wl init [name]`，选项 `--template <duo|solo|trio>`、`--repo <path>`、`--dir <dir>`、`--import <team.yaml>`、`--json`；输出函数 `renderInit(r: InitTeamResult): string`。

- [ ] **Step 1: 写失败测试（追加到 `packages/cli/test/main.test.ts`）**

  ```ts
  test('wl init 用模板生成团队并打印生成目录', async () => {
    const h = io()
    const code = await run(['init', 'my-team', '--repo', '/tmp/repo', '--template', 'solo', '--json'], h.io, cmds(), makeDeps)
    expect(code).toBe(0)
    const out = JSON.parse(h.out())
    expect(out.ok).toBe(true)
    expect(out.result.team).toBe('my-team')
    expect(out.result.created).toBe(true)
  })
  ```
  `cmds()` 与 `makeDeps` 用文件里已有的 fixture（`makeDeps` 会把 `home` 指到临时目录）；若 `makeDeps` 不能指定临时 home，就在用例里自己构造 `Commands`（`cmds()` 返回的对象上覆盖 `init`）。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/cli/test/main.test.ts`
  Expected: FAIL —— `init` 不在 `Commands` 里（TypeScript 报错或运行时报未知命令）。

- [ ] **Step 3: `packages/core/src/audit.ts` 的 `WRITE_COMMANDS` 加 `'init'`**

  加在数组末尾。`packages/cli/test/main.test.ts` 里那条「每个写命令都在审计表里」的测试会强制 `AUDIT` 与 `Commands` 同步补齐，两边必须一起改。

- [ ] **Step 4: `packages/cli/src/cli.ts` 注册命令**

  - `Commands` 接口加 `init: typeof initTeamCmd`；`rawCommands` 加 `init: initTeamCmd`；`import` 里补 `initTeamCmd`。
  - 在 `registerBaseCommands` 里加：
    ```ts
    program.command('init [name]').description('用预设模板生成团队配置（或导入已有 team.yaml）')
      .option('--template <id>', '预设模板：duo / solo / trio（默认 duo）')
      .option('--repo <path>', '代码库目录')
      .option('--dir <dir>', '配置存放目录（默认 <数据目录>/teams/<name>）')
      .option('--import <team.yaml>', '导入已有的 team.yaml')
      .option('--json', '输出 JSON')
      .action((name: string | undefined, o: { template?: string; repo?: string; dir?: string; import?: string; json?: boolean }) =>
        execute(!!o.json, async (d) => {
          if (o.import) {
            if (name) throw new WinglineError('input', 'init_args_invalid', '--import 与团队名不能同时给')
            return commands.init(d, { mode: 'import', specPath: o.import })
          }
          if (!name) throw new WinglineError('input', 'init_args_invalid', '需要给出团队名')
          if (!o.repo) throw new WinglineError('input', 'init_args_invalid', '需要给出 --repo 代码库目录')
          return commands.init(d, { mode: 'template', name, repo: o.repo, template: o.template as TeamTemplateId | undefined, dir: o.dir })
        }, renderInit))
    ```
    `TeamTemplateId` 从 `@weiping/wingline-core` 导入。
  - `Commands` 里的字段名用 `init`（不是 `initTeamCmd`），审计表 key 与之一致。

- [ ] **Step 5: `packages/cli/src/audit-table.ts` 加审计条目**

  ```ts
  init: {
    command: 'init',
    team: (_a, ctx) => (ctx.result as { team?: string } | undefined)?.team ?? '-',
    summary: (a, ctx) => ({ mode: a.mode, template: a.template, created: (ctx.result as { created?: boolean } | undefined)?.created }),
  },
  ```

- [ ] **Step 6: `packages/cli/src/output.ts` 加 `renderInit`**

  仿 `renderDown` 的写法，返回一行纯中文 + 生成目录，例如：
  `已生成团队 <name> 的配置：<specPath>（用 wl up <specPath> 启动）`。

- [ ] **Step 7: 跑测试确认通过**

  Run: `pnpm test packages/cli/test/main.test.ts packages/core/test/commands/init.test.ts && pnpm typecheck`
  Expected: PASS。审计完整性那条测试（`Object.keys(AUDIT).sort()` 对 `WRITE_COMMANDS`）必须仍然通过。

- [ ] **Step 8: 提交**

  ```bash
  git add packages/core/src/audit.ts packages/cli/src/cli.ts packages/cli/src/audit-table.ts packages/cli/src/output.ts packages/cli/test/main.test.ts
  git commit -m "feat(cli): wl init 命令与审计"
  ```

---

### Task 3: `applySpecOp` 岗位增删

**Files:**
- Modify: `packages/core/src/spec/edit.ts`
- Test: `packages/core/test/spec/edit.test.ts`

**Interfaces:**
- Consumes: `yaml` 库的 `parseDocument` / `Document` / `YAMLMap` / `YAMLSeq`（`edit.ts` 已导入）；`setField(text, path, value)`（同文件既有函数）。
- Produces:
  ```ts
  export type SpecEditOp =
    | { op?: 'set'; path: Array<string | number>; value: unknown }
    | { op: 'add_post'; post: { id: string; agent: string; model?: string; launch?: string; worktree?: string; brief?: string[] } }
    | { op: 'remove_post'; index: number }
  export function applySpecOp(text: string, op: SpecEditOp): string
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/core/test/spec/edit.test.ts`）**

  ```ts
  test('add_post 追加岗位且不动其它行的字节', () => {
    const yaml = ['version: 1', 'name: duo', 'repo: path:/tmp/r', 'norms: NORMS.md', 'lead: builder',
      'posts:', '  - id: builder', '    agent: claude', '    worktree: current', '    brief: [briefs/builder.md]',
      '', '# 末尾注释', ''].join('\n')
    const out = applySpecOp(yaml, { op: 'add_post', post: { id: 'reviewer', agent: 'claude', model: 'opus', worktree: 'current', brief: ['briefs/reviewer.md'] } })
    expect(out).toContain('# 末尾注释')
    expect(out).toContain('  - id: reviewer')
    expect(out).toContain('    brief: [briefs/reviewer.md]')
    expect(out.indexOf('- id: reviewer')).toBeGreaterThan(out.indexOf('- id: builder'))
    // 原有那一行逐字节不变
    expect(out).toContain('  - id: builder\n    agent: claude\n    worktree: current\n    brief: [briefs/builder.md]')
  })

  test('add_post 遇到重复 id 报错', () => {
    expect(() => applySpecOp(DUO_YAML, { op: 'add_post', post: { id: 'builder', agent: 'claude' } }))
      .toThrow(expect.objectContaining({ code: 'spec_invalid' }))
  })

  test('remove_post 删除岗位，并清掉 links/gates 与他人 links 里的引用', () => {
    const yaml = ['version: 1', 'name: duo', 'repo: path:/tmp/r', 'norms: NORMS.md', 'lead: builder',
      'posts:', '  - id: builder', '    agent: claude', '    worktree: current',
      '  - id: checker', '    agent: codex', '    worktree: current',
      'links:', '  builder:', '    reviewed_by: [checker]', ''].join('\n')
    const out = applySpecOp(yaml, { op: 'remove_post', index: 1 })
    expect(out).not.toContain('id: checker')
    expect(out).not.toContain('reviewed_by')
    expect(out).toContain('  - id: builder')
  })

  test('remove_post 不能删掉最后一个岗位；删掉 lead 时 lead 改为剩下的第一个', () => {
    const solo = ['version: 1', 'name: solo', 'repo: path:/tmp/r', 'norms: NORMS.md', 'lead: builder',
      'posts:', '  - id: builder', '    agent: claude', '    worktree: current', ''].join('\n')
    expect(() => applySpecOp(solo, { op: 'remove_post', index: 0 })).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
    const two = ['version: 1', 'name: duo', 'repo: path:/tmp/r', 'norms: NORMS.md', 'lead: checker',
      'posts:', '  - id: builder', '    agent: claude', '    worktree: current',
      '  - id: checker', '    agent: codex', '    worktree: current', ''].join('\n')
    expect(applySpecOp(two, { op: 'remove_post', index: 1 })).toContain('lead: builder')
  })

  test('op 缺省就是 set，等价于 setField', () => {
    expect(applySpecOp(DUO_YAML, { path: ['lead'], value: 'checker' })).toBe(setField(DUO_YAML, ['lead'], 'checker'))
  })
  ```
  `DUO_YAML` 从 `packages/core/test/spec/helpers.ts` 引入。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/spec/edit.test.ts`
  Expected: FAIL —— `applySpecOp` 未导出。

- [ ] **Step 3: 实现 `applySpecOp`**

  在 `packages/core/src/spec/edit.ts` 里实现，三个分支各自一个私有函数：

  - **`set`（缺省 op）**：直接 `return setField(text, op.path, op.value)`。
  - **`add_post`**：
    1. `parseDocument(text)`，`doc.errors[0]` 存在则 `WinglineError('input', 'spec_invalid', ...)`（与 `setField` 同样的处理）。
    2. `doc.get('posts', true)` 必须是块序列 `YAMLSeq`（不是 flow），否则 `spec_invalid`。
    3. 遍历 `seq.items`，若某个 item 是 `YAMLMap` 且其 `id` 标量等于 `op.post.id`，抛 `WinglineError('input', 'spec_invalid', '岗位 id 重复：<id>')`。
    4. 用 `doc.createNode({ id, agent, model?, launch?, worktree?, brief? })` 造新节点，把它 `toString(RENDER)` 渲染成块映射文本（RENDER 复用文件里已有的常量），再把 `brief` 子节点设成 flow（`briefNode.flow = true`）以保持 `brief: [briefs/x.md]` 的写法。
    5. 文本手术：找到 `posts` 序列最后一个 item 的范围（`seq.items[seq.items.length - 1].range`），从该 item 首键所在行的行首算出两层缩进（序列项的 `- ` 缩进 = 行首空白长度；项内键缩进 = `- ` 之后两格），把渲染出的块按这两层缩进拼好（首行前缀 `- `，其余行前缀项内缩进），插到最后一个 item 内容结束处（`range[1]` 之后）并补一个换行。
    6. 返回拼好的文本。**不要**用 `doc.toString()` 整篇重排。
  - **`remove_post`**：
    1. `seq.items.length <= 1` → `WinglineError('input', 'spec_invalid', '团队至少保留一个岗位')`。
    2. `op.index` 不是合法下标 → `spec_invalid`。
    3. 记下被删 item 的 `id`（读它的 `id` 标量）。
    4. 文本手术删除该 item 的整段：从该 item 首键所在行的行首删到它内容结束（含其后换行）；若下一项与它同行起始（`lineStart(nextKey) === pairEnd(item)`），连下一项的 `- ` 一起删（可复用文件里 `deleteFirstOfItem` 的思路，但那是删块映射的键，序列要另写一个 `deleteSeqItem`）。
    5. 删 `links.<id>` 与 `gates.<id>`：用 `setField(text, ['links', id], null)` / `setField(text, ['gates', id], null)`（`setField` 的 `value === null` 就是删键）。
    6. 从其余岗位的 `links.*.(reviewed_by|hands_to|consults)` 数组里剔除该 id：读原始 YAML 找出所有引用它的数组，用 `setField(text, ['links', post, rel], 新数组)` 覆盖；新数组为空则 `setField(text, ['links', post, rel], null)` 删掉这个子键；`links` 映射变空则 `setField(text, ['links'], null)`。
    7. 若顶层 `lead` 等于被删的 id，`setField(text, ['lead'], 剩余第一个岗位的 id)`。
    8. 返回文本。

  每一步都用 `WinglineError('input', 'spec_invalid', ...)` 报告用户可见的原因。

- [ ] **Step 4: 跑测试确认通过**

  Run: `pnpm test packages/core/test/spec/edit.test.ts`
  Expected: PASS（5 个新用例全绿，旧的 `setField` 用例不受影响）。

- [ ] **Step 5: 提交**

  ```bash
  git add packages/core/src/spec/edit.ts packages/core/test/spec/edit.test.ts
  git commit -m "feat(core): applySpecOp 岗位增删"
  ```

---

### Task 4: 规范与职责文档读写（`spec/doc.ts`、`virtualFiles`、`files` 保存）

**Files:**
- Create: `packages/core/src/spec/doc.ts`
- Modify: `packages/core/src/spec/load.ts`（`validateSpecText` 与 `specFromRaw` 支持 `virtualFiles`）
- Modify: `packages/core/src/spec/draft.ts`（抽出 `checkSaveConflict`，供 `saveSpec` 与 `saveSpecCmd` 共用）
- Modify: `packages/core/src/commands/spec.ts`（`readSpecForEdit` / `validateSpecEdit` / `saveSpecCmd` 支持 `files`）
- Modify: `packages/core/src/server/api-spec.ts`（`/spec/validate` 与 `/spec` 接受新字段）
- Modify: `packages/core/src/server/index.ts`（`SPEC_BODY_LIMIT` 提到 512 KB）
- Test: `packages/core/test/spec/doc.test.ts`（新建）、`packages/core/test/commands/spec.test.ts`（追加）

**Interfaces:**
- Consumes: 任务 3 的 `SpecEditOp` / `applySpecOp`；`validateSpecText(text, specPath, o)`、`loadTeamSpec`；`saveSpec` / `draftPathOf` / `fileHash` / `textHash`。
- Produces:
  ```ts
  // packages/core/src/spec/doc.ts
  export const DOC_LIMIT_BYTES = 64 * 1024
  export function resolveDocPath(specDir: string, rel: string): string
  export function readDocText(abs: string): string
  export function writeDocAtomic(abs: string, content: string): void
  export function docRelsOf(parsed: unknown): string[]      // 从原始 YAML 里取出 norms 与 posts[*].brief 的相对路径
  // packages/core/src/spec/load.ts
  export function validateSpecText(text: string, specPath: string, o?: { platform?: NodeJS.Platform; virtualFiles?: ReadonlySet<string> }): { spec: TeamSpec | null; parsed: unknown | null; errors: SpecError[] }
  // packages/core/src/spec/draft.ts
  export function checkSaveConflict(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): { target: string; hash: string; skip: boolean }
  // packages/core/src/commands/spec.ts
  export interface SpecForEdit { specPath: string; yaml: string; parsed: unknown | null; hash: string | null; draft: {…} | null; running: boolean; files: Record<string, string> }
  export function validateSpecEdit(deps: CommandDeps, a: { team: string; yaml: string; set?: SpecEditOp; files?: Record<string, string> }): SpecEditResult
  export async function saveSpecCmd(deps: CommandDeps, a: { team: string; yaml: string; baseHash: string | null; running: boolean; files?: Record<string, string> }): Promise<{ wrote: 'draft' | 'spec'; path: string; hash: string; docsUpdated: string[] }>
  ```

- [ ] **Step 1: 写失败测试 `packages/core/test/spec/doc.test.ts`**

  ```ts
  test('resolveDocPath 只接受团队目录内的 .md 相对路径', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
    expect(resolveDocPath(dir, 'NORMS.md')).toBe(path.join(dir, 'NORMS.md'))
    expect(resolveDocPath(dir, 'briefs/a.md')).toBe(path.join(dir, 'briefs', 'a.md'))
    for (const bad of ['../evil.md', '/etc/passwd', 'notes.txt', '', 'a.md\0b']) {
      expect(() => resolveDocPath(dir, bad)).toThrow(expect.objectContaining({ code: 'doc_path_invalid' }))
    }
  })

  test('resolveDocPath 拒绝软链接越界', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-doc-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-out-'))
    fs.writeFileSync(path.join(outside, 'evil.md'), 'x')
    fs.symlinkSync(path.join(outside, 'evil.md'), path.join(dir, 'link.md'))
    expect(() => resolveDocPath(dir, 'link.md')).toThrow(expect.objectContaining({ code: 'doc_path_invalid' }))
  })
  ```

- [ ] **Step 2: 写失败测试（追加到 `packages/core/test/commands/spec.test.ts`）**

  ```ts
  test('readSpecForEdit 带上规范与各岗位简报的正文', () => {
    const { deps } = seed()
    const r = readSpecForEdit(deps, 'duo')
    expect(Object.keys(r.files).sort()).toEqual(['NORMS.md', 'briefs/builder.md', 'briefs/checker.md'])
    expect(r.files['NORMS.md']).toContain('# duo 团队规范')
  })

  test('validateSpecEdit 用 files 里的虚拟文件通过校验（新岗位的简报还没落盘）', () => {
    const { deps } = seed()
    const yaml = DUO_YAML.replace('  - id: checker', '  - id: reviewer\n    agent: claude\n    model: opus\n    worktree: current\n    brief: [briefs/reviewer.md]\n  - id: checker')
    const r = validateSpecEdit(deps, { team: 'duo', yaml, files: { 'briefs/reviewer.md': '# reviewer\n' } })
    expect(r.errors).toEqual([])
  })

  test('没有虚拟文件时同一个 yaml 报 file_missing', () => {
    const { deps } = seed()
    const yaml = DUO_YAML.replace('  - id: checker', '  - id: reviewer\n    agent: claude\n    model: opus\n    worktree: current\n    brief: [briefs/reviewer.md]\n  - id: checker')
    expect(validateSpecEdit(deps, { team: 'duo', yaml }).errors[0]).toMatchObject({ code: 'file_missing' })
  })

  test('saveSpecCmd 把 files 里的正文写到磁盘，并拒绝未被规格引用的文档', async () => {
    const { deps, specPath } = seed()
    const dir = path.dirname(specPath)
    const r = await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: false, files: { 'NORMS.md': '# 新规范\n' } })
    expect(r.docsUpdated).toEqual(['NORMS.md'])
    expect(fs.readFileSync(path.join(dir, 'NORMS.md'), 'utf8')).toBe('# 新规范\n')
    await expect(saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: false, files: { 'secret.md': 'x' } }))
      .rejects.toMatchObject({ code: 'doc_not_referenced' })
  })

  test('运行中团队保存文档：注册表里的规格哈希变旧，restore 随后报 team_spec_changed', async () => {
    const { deps } = seed()
    await saveSpecCmd(deps, { team: 'duo', yaml: DUO_YAML, baseHash: null, running: true, files: { 'NORMS.md': '# 改过的规范\n' } })
    await expect(restore(deps, { team: 'duo' })).rejects.toMatchObject({ code: 'team_spec_changed' })
  })
  ```
  `restore` 从 `../../src/commands/restore/index.js` 引入；`path`/`fs` 已在该测试文件里可用（`fs` 已在用，`path` 需补 import）。

- [ ] **Step 3: 跑测试确认失败**

  Run: `pnpm test packages/core/test/spec/doc.test.ts packages/core/test/commands/spec.test.ts`
  Expected: FAIL —— `resolveDocPath` 未导出、`readSpecForEdit` 没有 `files`。

- [ ] **Step 4: 实现 `packages/core/src/spec/doc.ts`**

  - `resolveDocPath(specDir, rel)`：
    - `rel` 必须是非空字符串、以 `.md` 结尾、不含 `\0`，否则 `WinglineError('input', 'doc_path_invalid', '文档路径 <rel> 必须位于团队目录内且为 .md 文件')`。
    - `abs = path.resolve(specDir, rel.replace(/\\/g, '/'))`；`path.relative(specDir, abs)` 不得以 `'..'` 开头、不得是绝对路径，否则同样的错误。
    - 若 `abs` 已存在，用 `fs.realpathSync(abs)` 与 `fs.realpathSync(specDir)` 再比一次，真实路径必须仍在真实 `specDir` 之内，否则同样的错误（软链接越界）。
  - `readDocText(abs)`：读不到返回 `''`；读得到返回 utf8 文本。
  - `writeDocAtomic(abs, content)`：`Buffer.byteLength(content, 'utf8') > DOC_LIMIT_BYTES` → `WinglineError('input', 'doc_too_large', '文档 <basename> 超过 64 KB 上限')`；先 `fs.mkdirSync(path.dirname(abs), { recursive: true })`，再写同目录临时文件 `.<basename>.<pid>.tmp` 后 `fs.renameSync` 原子替换（照抄 `packages/core/src/spec/draft.ts` 里 `writeAtomic` 的做法，含权限位继承）。
  - `docRelsOf(parsed)`：从原始 YAML 对象里取 `norms`（字符串）与 `posts[].brief[]`（字符串数组），返回去重后的相对路径数组；`parsed` 不是对象时返回 `[]`。

- [ ] **Step 5: `packages/core/src/spec/load.ts` 支持 `virtualFiles`**

  `validateSpecText(text, specPath, o)` 的 `o` 增加 `virtualFiles?: ReadonlySet<string>`，并把它透传给 `specFromRaw` → `resolveFile(dir, rel, at, p, virtualFiles)`。`resolveFile` 的存在性判断改为：磁盘上存在 **或** `virtualFiles?.has(rel)` 成立即视为存在（`rel` 是 YAML 里写的相对路径原样，比较前先做 `\\` → `/` 归一）。其余行为不变。

- [ ] **Step 6: `packages/core/src/spec/draft.ts` 抽出 `checkSaveConflict`**

  ```ts
  /** 保存前的冲突检查：目标文件当前内容既不等于新内容、也不等于加载时的 baseHash 时抛 spec_conflict。 */
  export function checkSaveConflict(a: { specPath: string; text: string; baseHash: string | null; running: boolean }): { target: string; hash: string; skip: boolean } {
    const target = a.running ? draftPathOf(a.specPath) : a.specPath
    const hash = textHash(a.text)
    const current = fileHash(target)
    if (current === hash) return { target, hash, skip: true }
    if (current !== a.baseHash) throw new WinglineError('input', 'spec_conflict', `${path.basename(target)} 在加载后被改动过，请重新加载`)
    return { target, hash, skip: false }
  }
  ```
  `saveSpec` 改成调用它（`skip === true` 时直接返回不写盘），保证 `saveSpecCmd` 与 `saveSpec` 的冲突判定完全一致。

- [ ] **Step 7: `packages/core/src/commands/spec.ts` 支持 `files`**

  - `readSpecForEdit`：算出 `files` —— 把正式规格与草稿（若有）两份 `parsed` 里的 `docRelsOf` 结果合并去重，逐个 `readDocText(resolveDocPath(path.dirname(row.specPath), rel))` 填进 `files[rel]`（读不到就是 `''`）。`resolveDocPath` 抛错时跳过该条（不认识的相对路径不该让整个编辑页打不开）。
  - `validateSpecEdit`：`a.set` 的类型换成 `SpecEditOp`；有 `a.set` 时统一用 `applySpecOp(a.yaml, a.set)`（`applySpecOp` 内部已经把缺省 `op` 的情况转给 `setField`，不要在这里分叉）；`a.files` 的键集合作为 `virtualFiles` 传给 `validateSpecText`。
  - `saveSpecCmd`：
    1. `validateSpecText(a.yaml, row.specPath, { virtualFiles: new Set(Object.keys(a.files ?? {})) })`；有错则 `WinglineError('input', 'spec_invalid', errors[0].message, { detail: { errors } })`。
    2. `checkSaveConflict({ specPath: row.specPath, text: a.yaml, baseHash: a.baseHash, running: a.running })` —— **先查冲突再写文档**，冲突时一个字节都不写。
    3. `referenced = new Set(docRelsOf(parsed))`；对 `a.files` 的每个 `[rel, content]`：
       - `rel` 不在 `referenced` → `WinglineError('input', 'doc_not_referenced', '文档 <rel> 没有被团队规格引用')`。
       - `abs = resolveDocPath(path.dirname(row.specPath), rel)`；`writeDocAtomic(abs, content)`；把 `rel` 记进 `docsUpdated`。
    4. 调用 `saveSpec({ specPath: row.specPath, text: a.yaml, baseHash: a.baseHash, running: a.running })`，返回 `{ ...res, docsUpdated }`。

- [ ] **Step 8: `packages/core/src/server/api-spec.ts` 与 `server/index.ts`**

  - `/api/teams/:team/spec/validate` 的允许字段改成 `['yaml', 'set', 'files']`；`parseSet` 扩展成能解析三种形态：`{ path, value }`（`op` 缺省）、`{ op: 'add_post', post }`、`{ op: 'remove_post', index }`，解析结果就是 `SpecEditOp`。`files` 必须是「键为字符串、值为字符串」的对象，否则 `invalid_param`。
  - `POST /api/teams/:team/spec` 的允许字段（在 `api-write.ts` 里）加上 `'files'`。
  - `packages/core/src/server/index.ts`：`SPEC_BODY_LIMIT` 从 `48 * 1024 * 6 + 4096` 改成 `512 * 1024`，并把注释补成「规格 48 KB + 若干份 64 KB 以内的 .md」。

- [ ] **Step 9: 跑测试确认通过**

  Run: `pnpm test packages/core/test/spec/doc.test.ts packages/core/test/commands/spec.test.ts packages/core/test/spec/edit.test.ts && pnpm typecheck`
  Expected: PASS。`packages/core/test/templates/duo.test.ts`（读仓库 `teams/duo/team.yaml`）仍然通过。

- [ ] **Step 10: 提交**

  ```bash
  git add packages/core/src/spec/doc.ts packages/core/src/spec/load.ts packages/core/src/spec/draft.ts packages/core/src/commands/spec.ts packages/core/src/server/api-spec.ts packages/core/src/server/index.ts packages/core/test/spec/doc.test.ts packages/core/test/commands/spec.test.ts
  git commit -m "feat(core): 规范与职责文档读写"
  ```

---

### Task 5: core 支撑改动（`planTask` 的 `as`、`realAutostartSys` 上移）

**Files:**
- Modify: `packages/core/src/commands/task/plan.ts`
- Create: `packages/core/src/commands/autostart/sys.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/cli.ts`（删掉本地 `realAutostartSys` 实现，改从 core 引入并转调）
- Test: `packages/core/test/commands/task/plan.test.ts`（新建）

**Interfaces:**
- Consumes: `resolveActor(deps, as?)`（`packages/core/src/commands/task/identity.ts`）、`AutostartSys`（`packages/core/src/commands/autostart/index.ts`）。
- Produces:
  ```ts
  // packages/core/src/commands/task/plan.ts
  export async function planTask(deps: CommandDeps, a: { id: string; text: string; as?: string }): Promise<void>
  // packages/core/src/commands/autostart/sys.ts
  export function realAutostartSys(): AutostartSys
  ```

- [ ] **Step 1: 写失败测试 `packages/core/test/commands/task/plan.test.ts`**

  ```ts
  test('planTask 显式传 as 时执行者记为该岗位', async () => {
    const { deps } = seedRunningTeam(new FakeOrca())
    await planTask(deps, { id: 'task-1', text: '第一步', as: 'builder@duo' })
    const events = await readTimeline(deps, { team: 'duo', limit: 50 })
    expect(events.events.some((e) => e.actor === 'builder@duo')).toBe(true)
  })

  test('planTask 不传 as 时行为不变（执行者由环境推断，记 human）', async () => {
    const { deps } = seedRunningTeam(new FakeOrca())
    await planTask(deps, { id: 'task-1', text: '第一步' })
    const events = await readTimeline(deps, { team: 'duo', limit: 50 })
    expect(events.events.some((e) => e.actor === 'human')).toBe(true)
  })
  ```
  `readTimeline` 从 `../../src/commands/log.js` 引入；若时间线里没有 actor 字段，就改成断言任务行上的 `actor`（`deps.registry.getTaskExt('task-1')!.actor`），以仓库既有断言口径为准。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/commands/task/plan.test.ts`
  Expected: FAIL —— `planTask` 的参数里没有 `as`，执行者不是 `builder@duo`。

- [ ] **Step 3: `packages/core/src/commands/task/plan.ts` 加 `as`**

  签名改为 `planTask(deps, a: { id: string; text: string; as?: string })`，内部把 `resolveActor(deps)` 改成 `resolveActor(deps, a.as)`。**不传 `as` 时的行为必须逐字节不变**（CLI 的 `wl task plan` 不传 `--as`）。

- [ ] **Step 4: 新建 `packages/core/src/commands/autostart/sys.ts`**

  把 `packages/cli/src/cli.ts` 里 `realAutostartSys()` 的实现原样搬过来（`spawn` 不经 shell、入口脚本取 `fs.realpathSync`、返回 `{ platform, homeDir, uid, user, node, script, exec, fs }`），并在文件头注释里说明「控制台服务在 core 内，需要同样的宿主信息」。在 `packages/core/src/index.ts` 导出：`export * from './commands/autostart/sys.js'`。

- [ ] **Step 5: `packages/cli/src/cli.ts` 改为转调**

  删掉本地的 `realAutostartSys` 实现与 `spawn`/`os` 的 import（若不再被别处使用），改成：
  ```ts
  import { …, realAutostartSys as coreRealAutostartSys } from '@weiping/wingline-core'
  /** 保留这个导出名，既有测试从这里导入。 */
  export const realAutostartSys: typeof coreRealAutostartSys = coreRealAutostartSys
  ```

- [ ] **Step 6: 跑测试确认通过**

  Run: `pnpm test packages/core/test/commands/task/plan.test.ts packages/cli/test/main.test.ts && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 7: 提交**

  ```bash
  git add packages/core/src/commands/task/plan.ts packages/core/src/commands/autostart/sys.ts packages/core/src/index.ts packages/cli/src/cli.ts packages/core/test/commands/task/plan.test.ts
  git commit -m "refactor(core): planTask 支持 as 并上移 realAutostartSys"
  ```

---

### Task 6: 团队与调度员生命周期写接口

**Files:**
- Modify: `packages/core/src/server/api-write.ts`
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- Consumes: core 的 `up` / `down` / `restore` / `dispatcherUp` / `dispatcherDown`；`postAddress`（`packages/core/src/commands/deps.ts`）。
- Produces: 5 条新路由 + `WriteCommands` 新字段：
  ```ts
  export interface ConsoleUpArgs { team: string; draft?: boolean; newRun?: boolean; adoptRun?: string }
  export interface ConsoleDownArgs { team: string; close?: boolean }
  export interface ConsoleRestoreArgs { team: string; dryRun?: boolean; noTasks?: boolean; sessions?: Record<string, string> }
  // WriteCommands 新增
  up: (deps: CommandDeps, a: ConsoleUpArgs) => Promise<UpResult>
  down: (deps: CommandDeps, a: ConsoleDownArgs) => Promise<DownResult>
  restore: (deps: CommandDeps, a: ConsoleRestoreArgs) => Promise<RestoreResult>
  dispatcherUp: (deps: CommandDeps, a: { team: string }) => Promise<{ address: string; outcome: 'already_running' | 'started'; handle?: string }>
  dispatcherDown: (deps: CommandDeps, a: { team: string; close?: boolean }) => Promise<{ address: string; outcome: 'noop' | 'closed' | 'already_gone' }>
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/core/test/server/api-write.test.ts`）**

  复用文件里已有的 `makeRecordingCmds()`：它按命令名记录调用参数。新增用例：
  ```ts
  test.each([
    ['/api/teams/:team/up', '/api/teams/duo/up', { draft: true }],
    ['/api/teams/:team/down', '/api/teams/duo/down', { close: true }],
    ['/api/teams/:team/restore', '/api/teams/duo/restore', { dryRun: true }],
    ['/api/teams/:team/dispatcher/up', '/api/teams/duo/dispatcher/up', {}],
    ['/api/teams/:team/dispatcher/down', '/api/teams/duo/dispatcher/down', { close: true }],
  ])('写路由 %s 调到了对应的 core 命令', async (pattern, path, body) => {
    const { router, cmds } = ...   // 照抄文件里既有用例的搭建方式
    const res = await call(router, 'POST', path, body)
    expect(res.status).toBe(200)
  })
  ```
  同时断言 `WRITE_ROUTES` 里这 5 条 pattern 都存在（文件里已有一条遍历 `WRITE_ROUTES` 的用例，确认新路由的 `fields` 与 `check` 完整）。

  再加一条 Review Focus 第 3 条的用例：
  ```ts
  test('未启动的团队启动调度员时给出可读提示，而不是 500', async () => {
    // 用只登记、runId 为 null 的团队
    const res = await call(router, 'POST', '/api/teams/newbie/dispatcher/up', {})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('run_not_ready')
  })
  ```

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/server/api-write.test.ts`
  Expected: FAIL —— 路由不存在（404）。

- [ ] **Step 3: 实现 5 条路由**

  在 `packages/core/src/server/api-write.ts` 里：

  - `WriteCommands` 接口加上面 5 个字段（用 `ConsoleUpArgs` 等显式类型，参数里带 `team` 名字，审计表才拿得到团队名）。
  - `WRITE_ROUTES` 加 5 条：
    | pattern | check | fields | 调用 |
    | --- | --- | --- | --- |
    | `/api/teams/:team/up` | `['team']` | `['draft', 'newRun', 'adoptRun', 'retryRequest']` | `cmds.up(ctx.deps, { team: ctx.params.team!, draft: ctx.body.draft, newRun: ctx.body.newRun, adoptRun: ctx.body.adoptRun })` |
    | `/api/teams/:team/down` | `['team']` | `['close', 'retryRequest']` | `cmds.down(ctx.deps, { team: …, close: !!ctx.body.close })` |
    | `/api/teams/:team/restore` | `['team']` | `['dryRun', 'noTasks', 'sessions', 'retryRequest']` | `cmds.restore(ctx.deps, { team: …, dryRun: !!ctx.body.dryRun, noTasks: !!ctx.body.noTasks, sessions: ctx.body.sessions })` |
    | `/api/teams/:team/dispatcher/up` | `['team']` | `['retryRequest']` | `cmds.dispatcherUp(ctx.deps, { team: … })` |
    | `/api/teams/:team/dispatcher/down` | `['team']` | `['close', 'retryRequest']` | `cmds.dispatcherDown(ctx.deps, { team: …, close: ctx.body.close ?? true })` |
  - `auditedWriteCommands` 的 `raw` 对象里给这 5 个命令写包装（`WriteCommands` 的类型是控制台口径，与 core 原函数的参数不同）：
    ```ts
    up: async (deps, a) => {
      const row = deps.registry.getTeam(a.team)
      if (!row) throw new WinglineError('input', 'team_unknown', `团队 ${a.team} 未登记`)
      return up(deps, { specPath: row.specPath, draft: a.draft, newRun: a.newRun, adoptRun: a.adoptRun })
    },
    down: (deps, a) => down(deps, { team: a.team, close: !!a.close }),
    restore: (deps, a) => restore(deps, { team: a.team, dryRun: !!a.dryRun, noTasks: !!a.noTasks, sessions: a.sessions }),
    dispatcherUp: (deps, a) => dispatcherUp(deps, { team: a.team }),
    dispatcherDown: (deps, a) => dispatcherDown(deps, { team: a.team, close: a.close ?? true }),
    ```
  - `CONSOLE_AUDIT` 加 5 条：`up`（`command: 'up'`，`team: (a) => a.team`，summary `{ draft, newRun, adoptRun }`）、`down`（`command: 'down'`，summary `{ close }`）、`restore`（`command: 'restore'`，`skip: (a) => !!a.dryRun`，summary `{ dryRun, noTasks, session: Object.keys(a.sessions ?? {}) }`）、`dispatcherUp`（`command: 'dispatcher up'`）、`dispatcherDown`（`command: 'dispatcher down'`，summary `{ close }`）。

- [ ] **Step 4: 跑测试确认通过**

  Run: `pnpm test packages/core/test/server/api-write.test.ts && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 5: 提交**

  ```bash
  git add packages/core/src/server/api-write.ts packages/core/test/server/api-write.test.ts
  git commit -m "feat(server): 团队与调度员生命周期写接口"
  ```

---

### Task 7: 任务执行流写接口

**Files:**
- Modify: `packages/core/src/server/api-write.ts`
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- Consumes: core 的 `claimTask` / `releaseTask` / `planTask` / `startTask` / `doneTask`；`postAddress`。
- Produces: 5 条新路由 + `WriteCommands` 新字段：
  ```ts
  claimTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<void>
  releaseTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<void>
  planTask: (deps: CommandDeps, a: { id: string; as?: string; text: string }) => Promise<void>
  startTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<{ delivery: Delivery; reason?: string; already?: true }>
  doneTask: (deps: CommandDeps, a: { id: string; as?: string }) => Promise<DoneResult>
  ```
  `Delivery` 来自 `packages/core/src/commands/task/dispatch.js`，`DoneResult` 来自 `packages/core/src/commands/task/done.js`。

- [ ] **Step 1: 写失败测试（追加到 `packages/core/test/server/api-write.test.ts`）**

  ```ts
  test.each([
    ['claim', {}], ['release', {}], ['plan', { text: '先读代码再改' }], ['start', {}], ['done', {}],
  ])('任务执行流 %s 的路由可达并带上了 as', async (verb, extra) => {
    const res = await call(router, 'POST', `/api/teams/duo/tasks/task-1/${verb}`, { as: 'builder@duo', ...extra })
    expect(res.status).toBe(200)
  })

  test('as 必须属于该团队，跨团队的 as 被拒绝', async () => {
    const res = await call(router, 'POST', '/api/teams/duo/tasks/task-1/claim', { as: 'builder@other' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_param')
  })

  test('as 缺省或格式不对时报 invalid_param', async () => {
    expect((await call(router, 'POST', '/api/teams/duo/tasks/task-1/claim', {})).status).toBe(400)
    expect((await call(router, 'POST', '/api/teams/duo/tasks/task-1/claim', { as: 'bad name' })).status).toBe(400)
  })
  ```
  `call` 与 `router` 的搭建方式照抄文件里既有用例。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/server/api-write.test.ts`
  Expected: FAIL —— 路由不存在（404）。

- [ ] **Step 3: 实现 5 条路由**

  - 统一用一个私有函数解析 `as`：
    ```ts
    /** 任务执行流的执行者：必填；不带 @ 时按本团队岗位解释，带 @ 时团队后缀必须一致。 */
    function actorOf(ctx: HandlerContext): string {
      const raw = ctx.body.as
      if (typeof raw !== 'string' || !raw.trim()) throw new WinglineError('input', 'invalid_param', '参数 as 不合法')
      if (!raw.includes('@')) { checkParam('post', raw); return postAddress(raw, ctx.params.team!) }
      const [post, team] = raw.split('@')
      checkParam('post', post!)
      if (team !== ctx.params.team) throw new WinglineError('input', 'invalid_param', '执行者不属于该团队')
      return raw
    }
    ```
  - 5 条路由：`/api/teams/:team/tasks/:id/{claim,release,plan,start,done}`，`check` 都是 `['team', 'id']`；`fields` 分别是 `['as', 'retryRequest']`、`['as', 'retryRequest']`、`['as', 'text', 'retryRequest']`、`['as', 'retryRequest']`、`['as', 'retryRequest']`。
    - `plan` 额外要求 `text` 是非空字符串，否则 `invalid_param`。
    - `done` 的结果里 `outcome` 可能是 `'gate_failed'`，由前端展示（后端原样返回）。
  - `WriteCommands` 加 5 个字段；`auditedWriteCommands` 的 `raw` 里包一层，把 `as` 传给 core：
    ```ts
    claimTask: (deps, a) => claimTask(deps, { id: a.id, as: a.as }),
    releaseTask: (deps, a) => releaseTask(deps, { id: a.id, as: a.as }),
    planTask: (deps, a) => planTask(deps, { id: a.id, as: a.as, text: a.text }),
    startTask: (deps, a) => startTask(deps, { id: a.id, as: a.as }),
    doneTask: (deps, a) => doneTask(deps, { id: a.id, as: a.as }),
    ```
  - `CONSOLE_AUDIT` 加 5 条：`command` 分别是 `'task claim'`、`'task release'`、`'task plan'`、`'task start'`、`'task done'`；`team` 用文件里已有的 `byTask((a) => a.id)`；`target: (a) => a.id`；summary 分别 `{ as }`、`{ as }`、`{ as, text }`、`{ as }`、`{ as }`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `pnpm test packages/core/test/server/api-write.test.ts && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 5: 提交**

  ```bash
  git add packages/core/src/server/api-write.ts packages/core/test/server/api-write.test.ts
  git commit -m "feat(server): 任务执行流写接口"
  ```

---

### Task 8: 新建团队与自动恢复写接口

**Files:**
- Modify: `packages/core/src/server/api-write.ts`
- Test: `packages/core/test/server/api-write.test.ts`

**Interfaces:**
- Consumes: 任务 1 的 `initTeamCmd`；任务 5 的 `realAutostartSys`；core 的 `autostartInstall` / `autostartUninstall`。
- Produces: 3 条新路由 + `WriteCommands` 新字段：
  ```ts
  initTeamCmd: (deps: CommandDeps, a: { mode: InitTeamMode; name?: string; repo?: string; template?: TeamTemplateId; dir?: string; specPath?: string }) => Promise<InitTeamResult>
  autostartInstall: (deps: CommandDeps, a: { waitOrca?: string }) => Promise<{ platform: string; file: string; command: string; waitOrca: string }>
  autostartUninstall: (deps: CommandDeps) => Promise<{ file: string; removed: boolean }>
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/core/test/server/api-write.test.ts`）**

  ```ts
  test('POST /api/teams 用模板新建团队', async () => {
    const res = await call(router, 'POST', '/api/teams', { mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' })
    expect(res.status).toBe(200)
    expect(res.body.result.team).toBe('my-team')
  })

  test('POST /api/teams 拒绝未知字段与非法模板', async () => {
    expect((await call(router, 'POST', '/api/teams', { mode: 'template', name: 'x', repo: '/r', template: 'nope' })).status).toBe(400)
    expect((await call(router, 'POST', '/api/teams', { mode: 'template', name: 'x', repo: '/r', what: 1 })).status).toBe(400)
  })

  test('POST /api/autostart/install 与 /uninstall 路由可达', async () => {
    expect((await call(router, 'POST', '/api/autostart/install', { waitOrca: '15m' })).status).toBe(200)
    expect((await call(router, 'POST', '/api/autostart/uninstall', {})).status).toBe(200)
  })
  ```
  自动恢复这两条路由会真的动系统（launchd / systemd），测试里必须能替换宿主。做法：`WriteCommands` 的 `autostartInstall` / `autostartUninstall` 在 `auditedWriteCommands` 里默认用 `realAutostartSys()`；测试通过传入自己的 `cmds` 覆盖这两个字段（文件里 `makeRecordingCmds()` 就是干这个的），因此实现时 **`auditedWriteCommands` 的 `raw` 里这两个字段要能被外部替换**——即在 `registerWriteRoutes(r, cmds)` 的 `cmds` 上直接替换，而不是在 `raw` 里写死。
  因此实现形态定为：`auditedWriteCommands` 的 `raw` 里写
  ```ts
  autostartInstall: (deps, a) => autostartInstall(deps, realAutostartSys(), { waitOrca: a.waitOrca }),
  autostartUninstall: (deps) => autostartUninstall(deps, realAutostartSys()),
  ```
  而测试用 `makeRecordingCmds()` 那种「自造 cmds」的方式（不经过 `auditedWriteCommands`）来验证路由。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/server/api-write.test.ts`
  Expected: FAIL —— 路由不存在（404）。

- [ ] **Step 3: 实现 3 条路由**

  - `POST /api/teams`：`check: []`，`fields: ['mode', 'name', 'repo', 'template', 'dir', 'specPath', 'retryRequest']`；`mode` 必须是 `'template'` 或 `'import'`（否则 `invalid_param`）；调 `cmds.initTeamCmd(ctx.deps, { mode, name, repo, template, dir, specPath })`。
  - `POST /api/autostart/install`：`check: []`，`fields: ['waitOrca', 'retryRequest']`；调 `cmds.autostartInstall(ctx.deps, { waitOrca: ctx.body.waitOrca })`。
  - `POST /api/autostart/uninstall`：`check: []`，`fields: ['retryRequest']`；调 `cmds.autostartUninstall(ctx.deps)`。
  - `WriteCommands` 加 3 个字段；`CONSOLE_AUDIT` 加 3 条：
    - `initTeamCmd`：`command: 'init'`，`team: (_a, ctx) => (ctx.result as { team?: string } | undefined)?.team ?? '-'`，summary `{ mode, template, created }`。
    - `autostartInstall`：`command: 'autostart install'`，`team: () => '-'`，summary `{ waitOrca }`。
    - `autostartUninstall`：`command: 'autostart uninstall'`，`team: () => '-'`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `pnpm test packages/core/test/server/api-write.test.ts && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 5: 提交**

  ```bash
  git add packages/core/src/server/api-write.ts packages/core/test/server/api-write.test.ts
  git commit -m "feat(server): 新建团队与自动恢复写接口"
  ```

---

### Task 9: 读接口扩展与未启动团队降级

**Files:**
- Modify: `packages/core/src/server/api-read.ts`
- Modify: `packages/core/src/commands/about.ts`
- Test: `packages/core/test/server/api-read.test.ts`（追加）、`packages/core/test/commands/about.test.ts`（追加）

**Interfaces:**
- Consumes: core 的 `ps` / `dispatcherStatus` / `dispatcherHealth` / `about` / `autostartStatusOf` / `realAutostartSys`；`registry.listPosts` / `getTeam`。
- Produces:
  ```ts
  // GET /api/teams 的每个团队摘要新增：
  { name: string; postsCount: number; dispatcher: DispatcherHealth['state']; attentionCount: number; status: 'up' | 'stopped'; hasDraft: boolean }
  // GET /api/teams/:team 新增：
  { …既有字段…, status: 'up' | 'stopped'; specPath: string; hasDraft: boolean; neverStarted?: boolean; orcaUnavailable?: string }
  // GET /api/about 新增：
  autostart: { supported: true } & AutostartStatus & { platform: string; user?: string; logPath: string } | { supported: false; reason: string }
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/core/test/server/api-read.test.ts`）**

  ```ts
  test('未启动的团队也能读出总览，且标记 neverStarted', async () => {
    // 造一个只登记、没起来的团队
    const { deps, registry } = seedNeverStarted()
    const res = await get(router, '/api/teams/newbie')
    expect(res.status).toBe(200)
    expect(res.body.result.neverStarted).toBe(true)
    expect(res.body.result.status).toBe('stopped')
    expect(res.body.result.posts.every((p: any) => p.status === 'offline')).toBe(true)
    expect(res.body.result.dispatcher.health.state).toBe('never')
  })

  test('团队列表带出 status 与 hasDraft', async () => {
    const res = await get(router, '/api/teams')
    expect(res.body.result.teams[0]).toMatchObject({ status: 'up' })
  })

  test('about 带上 autostart 状态；取不到时给出 supported:false', async () => {
    const res = await get(router, '/api/about')
    expect(res.body.result.autostart).toHaveProperty('supported')
  })
  ```
  `seedNeverStarted()` 用 `mkDeps(new FakeOrca())` + `registry.upsertTeam({ name: 'newbie', specPath: <某个 team.yaml>, specHash: 'x', runId: null, coordinatorHandle: null, status: 'stopped' })` 造出来。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/core/test/server/api-read.test.ts`
  Expected: FAIL —— `neverStarted` 不在返回里。

- [ ] **Step 3: `packages/core/src/server/api-read.ts` 扩充读接口**

  - `GET /api/teams`：每个团队摘要加 `status: row.status` 与 `hasDraft: fs.existsSync(draftPathOf(row.specPath))`；`teamSummary` 里 `ps()` 对未启动团队会抛错，改成先判 `registry.getTeam(name)?.runId === null` 就跳过 `ps()`（`postsCount: 0`、`attentionCount: 0`）。
  - `GET /api/teams/:team`：
    - 取 `row = registry.getTeam(team)`；`row` 为空则仍抛 `team_unknown`（400）。
    - `row.runId === null`（从未启动）时：**不调用** `ps()` 与 `dispatcherStatus()`，直接返回 `{ team, runId: null, status: 'stopped', specPath: row.specPath, hasDraft, neverStarted: true, dispatcher: { health: { state: 'never' }, frozen: 0, hushed: 0, attentionItems: 0 }, posts: <离线岗位列表> }`。离线岗位列表由 `registry.listPosts(team)` 构造，每个岗位给出 `PsRow` 的完整字段：`{ address, agent, status: 'offline', handle: null, worktree, isLead, sessionId: null }`。
    - 否则照旧调 `ps()` / `dispatcherStatus()`，并把 `status`、`specPath`、`hasDraft` 一起返回；`ps()` 抛 `WinglineError` 且 `kind === 'orca'` 时，降级成同一套离线岗位列表并附 `orcaUnavailable: err.message`。
  - `GET /api/about`：`about()` 的返回值新增 `autostart` 字段。

- [ ] **Step 4: `packages/core/src/commands/about.ts` 加上 `autostart`**

  ```ts
  /** 开机自启状态：取不到（平台不支持 / 权限不足）时显式说原因，不抛错。 */
  async function autostartItem(): Promise<About['autostart']> {
    try {
      return { supported: true, ...(await autostartStatusOf(deps, realAutostartSys())) }
    } catch (err) {
      return { supported: false, reason: err instanceof Error ? err.message : String(err) }
    }
  }
  ```
  `about()` 的返回类型加 `autostart` 字段；`AutostartStatus` 从 `packages/core/src/commands/autostart/status.js` 导入。

- [ ] **Step 5: 跑测试确认通过**

  Run: `pnpm test packages/core/test/server/api-read.test.ts packages/core/test/commands/about.test.ts && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 6: 提交**

  ```bash
  git add packages/core/src/server/api-read.ts packages/core/src/commands/about.ts packages/core/test/server/api-read.test.ts packages/core/test/commands/about.test.ts
  git commit -m "feat(server): 团队状态读接口与未启动团队降级"
  ```

---

### Task 10: 前端「新建团队」弹窗、侧栏与首页空态

**Files:**
- Create: `packages/web/src/components/NewTeamDialog.tsx`
- Modify: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/src/app.tsx`
- Modify: `packages/web/src/styles.css`
- Test: `packages/web/test/new-team.test.tsx`（新建）

**Interfaces:**
- Consumes: `api.post` / `api.get`（`packages/web/src/api.ts`）；`useApi`（`packages/web/src/hooks.ts`）；`ActionDialog` 的样式口径（`packages/web/src/components/ActionDialog.tsx`）；后端 `POST /api/teams`（任务 8）。
- Produces:
  ```ts
  // packages/web/src/components/NewTeamDialog.tsx
  export function NewTeamDialog(props: { open: boolean; onClose: () => void; onCreated: (team: string, started: boolean) => void }): ComponentChildren
  export const TEAM_TEMPLATES_UI: Array<{ id: 'duo' | 'solo' | 'trio'; label: string; summary: string }>
  ```

- [ ] **Step 1: 写失败测试 `packages/web/test/new-team.test.tsx`**

  用 `packages/web/test/helpers.tsx` 的 `mockApi` 路由表写法：
  ```ts
  test('新建团队弹窗：选模板、填名字与代码库目录后能创建并跳到编辑页', async () => {
    const api = mockApi({
      'POST /api/teams': { ok: true, result: { team: 'my-team', specPath: '/x/team.yaml', created: true } },
    })
    render(<NewTeamDialog open onClose={() => {}} onCreated={() => {}} />, { api })
    await userEvent.click(screen.getByRole('button', { name: '使用预设模板' }))   // 默认已选中
    fireEvent.input(screen.getByLabelText('团队名称'), { target: { value: 'my-team' } })
    fireEvent.input(screen.getByLabelText('代码库目录'), { target: { value: '/tmp/repo' } })
    await userEvent.click(screen.getByRole('button', { name: '仅创建配置' }))
    expect(api.calls['POST /api/teams'][0].body).toMatchObject({ mode: 'template', name: 'my-team', repo: '/tmp/repo', template: 'duo' })
  })

  test('导入模式提交 mode: import 与 specPath', async () => { … })

  test('创建失败时显示错误文案，不跳转', async () => { … })
  ```
  具体 helper 名字以 `packages/web/test/helpers.tsx` 里已有的为准（`mockApi` / `Fail` / `SESSION`）。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/web/test/new-team.test.tsx`
  Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `NewTeamDialog.tsx`**

  - 两种模式：「使用预设模板」（默认）/「导入已有配置」，用两个按钮切换。
  - 模板模式：三张模板卡片（双人协作（推荐）/ 单人 / 三人流水线），每张显示一句角色与协作链摘要；两个必填输入「团队名称」「代码库目录」，一个可选输入「配置存放目录」（留空提示 `~/.wingline/teams/<团队名称>`）。
  - 导入模式：一个必填输入「配置文件路径（team.yaml）」。
  - 底部按钮：模板模式是「仅创建配置」「创建并启动」；导入模式是「导入团队」「导入并启动」。
  - 提交：`api.post('/api/teams', body)`；「创建并启动」在创建成功后接着 `api.post('/api/teams/<name>/up', {})`，再 `onCreated(name, true)`；「仅创建配置」直接 `onCreated(name, false)`。
  - 请求在途时按钮禁用并显示「执行中…」；失败时把 `errorText(err)` 显示在弹窗里（不自动重试）。
  - 弹窗外观复用 `ActionDialog.tsx` 的 `.dialog-backdrop` / `.dialog` / `.field` / `.dialog-actions` 类名。
  - 按钮文案全部中文；模板卡片用 `.tag` 样式，不要红色字。

- [ ] **Step 4: 侧栏与首页接入**

  - `Layout.tsx`：在团队下拉框下面加一个「新建团队」主按钮（`.btn`），点击打开 `NewTeamDialog`；弹窗放在 `Layout` 内部（`Layout` 需要自己持有 `open` 状态）。`teams.length === 0` 时把按钮放在「还没有团队」提示下面。
  - `app.tsx` 的 `Home`：空态时展示引导文案 + 「新建团队」按钮（同样打开 `NewTeamDialog`）；创建成功后 `navigate(teamPath(name, '/edit'))`。
  - 「创建并启动」成功后 `navigate(teamPath(name))`（总览页）。

- [ ] **Step 5: 补齐 `packages/web/src/styles.css` 的控件与按钮配色**

  规格第 3.4.1 条要求：任何原生表单控件在亮暗两色下都不能出现「黑底黑字」或看不清的下拉框；按钮只用三档（深绿主按钮 / 白底描边次按钮 / 红底白字危险按钮），不出现红字按钮。

  现有规则只覆盖 `.team-switch` 与 `.field` 下的控件，新弹窗与新下拉框若不套 `.field` 就会掉回浏览器默认样式。补一条全局规则：
  ```css
  input, select, textarea { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
  ```
  并把 `.btn.ghost` 的背景从 `transparent` 改成 `var(--surface)`（透明底在深色下与卡片边界糊在一起）。`.btn` 的 `color: var(--surface)` 保持不变：亮色下是深绿底白字，暗色下 `--accent` 是浅绿、`--surface` 是近黑，等于浅绿底深字，两种模式都可读。

- [ ] **Step 6: 跑测试确认通过**

  Run: `pnpm test packages/web/test/new-team.test.tsx packages/web/test/pages.test.tsx && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 7: 提交**

  ```bash
  git add packages/web/src/components/NewTeamDialog.tsx packages/web/src/components/Layout.tsx packages/web/src/app.tsx packages/web/src/styles.css packages/web/test/new-team.test.tsx
  git commit -m "feat(web): 新建团队弹窗与侧栏入口"
  ```

---

### Task 11: 前端总览页与收件箱的生命周期按钮

**Files:**
- Create: `packages/web/src/components/TeamActions.tsx`
- Modify: `packages/web/src/pages/Overview.tsx`
- Modify: `packages/web/src/pages/Inbox.tsx`
- Test: `packages/web/test/pages.test.tsx`（追加）

**Interfaces:**
- Consumes: 后端 `POST /api/teams/:team/{up,down,restore,dispatcher/up,dispatcher/down}`（任务 6）；`GET /api/teams/:team` 的 `status` / `specPath` / `hasDraft` / `neverStarted`（任务 9）；`CommandHint` 组件。
- Produces:
  ```ts
  // packages/web/src/components/TeamActions.tsx
  export function TeamActions(props: { team: string; view: { status: string; runId: string | null; specPath: string; hasDraft: boolean; neverStarted?: boolean }; onChanged: () => void }): ComponentChildren
  export function DispatcherActions(props: { team: string; state: 'running' | 'stale' | 'stopped' | 'never'; onChanged: () => void }): ComponentChildren
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/web/test/pages.test.tsx`）**

  ```ts
  test('总览页的「停止团队」按钮调用 POST /api/teams/duo/down', async () => {
    const api = mockApi({ 'GET /api/teams/duo': { ok: true, result: teamOf('duo') }, 'POST /api/teams/duo/down': { ok: true, result: { outcome: 'stopped' } } })
    render(<Overview team="duo" />, { api })
    await userEvent.click(screen.getByRole('button', { name: '停止团队' }))
    await waitFor(() => expect(api.calls['POST /api/teams/duo/down']).toBeTruthy())
  })

  test('未启动的团队显示「启动团队」，不显示「停止团队」', async () => { … })

  test('调度员已停止时显示「启动调度员」', async () => { … })
  ```
  `teamOf` 来自 `packages/web/test/helpers.tsx`。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/web/test/pages.test.tsx`
  Expected: FAIL —— 找不到「停止团队」按钮。

- [ ] **Step 3: 实现 `TeamActions.tsx`**

  - 团队状态徽标：`运行中` / `已停止`（`Pill` 的 `ok` / `warn`）。
  - 按钮组（文案全中文）：
    - 未启动 →「启动团队」（`.btn`）；运行中 →「补齐岗位」（`.btn.ghost`），都调 `POST /api/teams/:team/up`。
    - `up` 的返回里 `run.outcome` 是 `'ambiguous'` 或 `'lost'` 时，弹出「选择要接管的运行」对话框：列出 `run.candidates`（每项 `{ id, createdAt }`）供选择后重发 `up { adoptRun: <id> }`，另给一个「新建运行（丢弃旧任务）」选项对应 `up { newRun: true }`。其它 outcome 直接刷新页面。
    - `hasDraft` →「应用草稿并重启」（`.btn`）：弹窗确认（勾选「同时关闭旧岗位终端」），依次 `down` → `up { draft: true }`。
    - 「接回会话」（`.btn.ghost`）：弹窗可勾选「仅预览不执行」「不恢复任务」、可填 `builder=sess-1` 形式的会话编号，调 `POST /api/teams/:team/restore`，结果按岗位展示 `kept` / `resumed` / `fresh` / `ambiguous` / `uncertain`。
    - 运行中 →「停止团队」（`.btn.danger`）：确认弹窗带复选框「同时关闭岗位终端」，调 `POST /api/teams/:team/down`。
  - 按钮组下方用 `CommandHint` 给出命令对照：`wl up <specPath>` / `wl restore <team>` / `wl down <team>`。
  - `DispatcherActions`：`state !== 'running'` →「启动调度员」（`.btn`）；`state === 'running' | 'stale'` →「停止调度员」（`.btn.danger`）；未启动团队（`neverStarted`）时把「启动调度员」置灰并提示「先启动团队」；下方 `CommandHint` 给 `wl dispatcher up/down <team>`。
  - 所有按钮在请求在途时禁用并显示「执行中…」；失败显示 `errorText(err)`；返回 `uncertain` 时不自动重试，只提示「按原样重试」（把 `retryRequest` 原样带回即可，复用 `ActionDialog` 的 retry 逻辑）。

- [ ] **Step 4: 接入 `Overview.tsx` 与 `Inbox.tsx`**

  - `Overview.tsx`：页面头部换成「团队名 + 状态徽标 + `Run <runId>` + `TeamActions`」；`DispatcherCard` 右侧挂 `DispatcherActions`；当返回里带 `orcaUnavailable` 时，在页面顶部显示一条普通提示条「Orca 未运行或不可达，岗位状态暂不可用」（用 `.banner` 而不是 `.error`，不显示红色错误块）；`neverStarted` 时显示「该团队还没有启动过，先点『启动团队』」。
  - `Inbox.tsx`：调度员告警区的 `CommandHint` 旁边加「启动调度员」按钮；「卡住的任务」按原因给一键按钮：`unclaimed` →「认领任务」（先选岗位）、`owner_idle` →「开始任务」（以当前主人）、`done_unfinished` →「完成并校验」（以当前主人）、`overdue` / `gate_streak` →「改派主人」/「转人工处理」。原有的 `CommandHint` 保留。

- [ ] **Step 5: 跑测试确认通过**

  Run: `pnpm test packages/web/test/pages.test.tsx && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 6: 提交**

  ```bash
  git add packages/web/src/components/TeamActions.tsx packages/web/src/pages/Overview.tsx packages/web/src/pages/Inbox.tsx packages/web/test/pages.test.tsx
  git commit -m "feat(web): 总览与收件箱的生命周期按钮"
  ```

---

### Task 12: 前端编辑页的角色增删、职责正文与保存并启动

**Files:**
- Modify: `packages/web/src/components/SpecForm.tsx`
- Modify: `packages/web/src/pages/Edit.tsx`
- Test: `packages/web/test/edit.test.tsx`（追加）

**Interfaces:**
- Consumes: 后端 `GET/PUT /api/teams/:team/spec`（任务 4 的 `files` 与 `SpecEditOp`）、`POST /api/teams/:team/spec/validate`、`POST /api/teams/:team/up`（任务 6）；`SpecForm` 既有 props。
- Produces: `SpecForm` 新增两个可选 props：
  ```ts
  onFiles?: (files: Record<string, string>) => void   // 职责正文变化时把整份 files 交给上层
  onOp?: (op: SpecEditOp) => void                     // 岗位增删时把结构化操作交给上层
  ```

- [ ] **Step 1: 写失败测试（追加到 `packages/web/test/edit.test.tsx`）**

  ```ts
  test('编辑页能新增岗位并自动带出默认职责正文', async () => {
    const api = mockApi({ 'GET /api/teams/duo/spec': { ok: true, result: specForEdit() }, 'POST /api/teams/duo/spec/validate': { ok: true, result: { yaml: '…', parsed: {}, errors: [], preview: null } } })
    render(<Edit team="duo" />, { api })
    await userEvent.click(screen.getByRole('button', { name: '新增角色岗位' }))
    // 弹窗里选「实现岗」并填 id
    fireEvent.input(screen.getByLabelText('岗位标识'), { target: { value: 'reviewer' } })
    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    expect(screen.getByText('reviewer')).toBeTruthy()
    expect(screen.getByLabelText('岗位职责简报正文').value).toContain('reviewer')
  })

  test('运行中的团队保存时带 files，并提示规范将在下次启动生效', async () => { … })

  test('已停止的团队有「保存并启动」按钮，依次调用 spec 与 up', async () => { … })
  ```
  `specForEdit()` 造一份含 `files: { 'NORMS.md': '# 规范', 'briefs/builder.md': '# builder' }` 的返回体。

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/web/test/edit.test.tsx`
  Expected: FAIL —— 找不到「新增角色岗位」按钮。

- [ ] **Step 3: `SpecForm.tsx` 支持岗位增删与职责正文**

  - 团队卡片里的「牵头岗（lead）」改成下拉选择框：选项来自当前 `posts` 的 `id` 列表；若当前 `lead` 值不在列表里（规格坏了），退化成文本输入。
  - 岗位卡片右上角加「删除岗位」（`.btn.danger small`）：仅 `posts.length > 1` 时可点，点击后调 `onOp({ op: 'remove_post', index })`。
  - 岗位卡片底部加「岗位职责简报正文」多行文本域：绑定 `files[post.brief?.[0] ?? 'briefs/<id>.md']`；若该岗位还没有 `brief` 且用户输入了正文，先调 `onOp({ op: 'set', path: ['posts', i, 'brief'], value: ['briefs/<id>.md'] })` 再更新正文。
  - 岗位列表下方加「新增角色岗位」按钮：弹窗里选预设角色（实现岗 / 审查岗 / 规划岗 / 自定义）+ 填岗位标识，提交后调 `onOp({ op: 'add_post', post: { id, agent, model, worktree: 'current', brief: ['briefs/<id>.md'] } })`，并把 `files['briefs/<id>.md']` 置为该角色的默认职责正文。
  - 团队卡片里加「团队规范正文」多行文本域，绑定 `files[parsed.norms ?? 'NORMS.md']`，右上角标注相对路径。
  - 所有岗位字段标签保持中文：`岗位标识 id`、`代理 agent`、`模型 model`、`启动命令 launch`、`远端环境 environment`、`工作区 worktree`、`简报文件 brief`、`标签 tags`、`自主认领 self_claim`、`先写计划 plan_first`。

- [ ] **Step 4: `Edit.tsx` 串起来**

  - 页面维护一份 `files: Record<string, string>`（初值来自 `spec.files`）。
  - 校验请求体改为 `{ yaml, set?, files }`；`set` 支持三种形态（`{ path, value }` / `{ op: 'add_post', post }` / `{ op: 'remove_post', index }`）。
  - 「保存」按钮的请求体加 `files`；成功提示里带上后端返回的 `docsUpdated`。
  - 运行中的团队：保存后显示提示「规范与职责文档已更新，将在下次启动或新开会话时生效；恢复会话前需要重启团队。」（对应 Review Focus 第 1 条）。
  - 已停止的团队：并排加「保存并启动」（`.btn`）——先 `POST /spec` 再 `POST /up`，成功后跳总览页。
  - 运行中的团队：并排加「保存草稿并重启应用」（`.btn`）——弹窗确认「是否关闭旧终端」，依次 `POST /spec`（running=true）→ `POST /down` → `POST /up { draft: true }`。

- [ ] **Step 5: 跑测试确认通过**

  Run: `pnpm test packages/web/test/edit.test.tsx && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 6: 提交**

  ```bash
  git add packages/web/src/components/SpecForm.tsx packages/web/src/pages/Edit.tsx packages/web/test/edit.test.tsx
  git commit -m "feat(web): 编辑页角色增删与职责正文"
  ```

---

### Task 13: 前端任务详情页代岗位执行与关于页自动恢复

**Files:**
- Modify: `packages/web/src/pages/TaskDetail.tsx`
- Modify: `packages/web/src/pages/TaskBoard.tsx`
- Modify: `packages/web/src/pages/Settings.tsx`
- Test: `packages/web/test/pages.test.tsx`（追加）、`packages/web/test/settings.test.tsx`（追加）

**Interfaces:**
- Consumes: 后端 5 条任务执行流写接口（任务 7）、`POST /api/autostart/{install,uninstall}`（任务 8）、`GET /api/about` 的 `autostart` 字段（任务 9）、`GET /api/teams/:team` 的 `posts`。
- Produces: `packages/web/src/pages/TaskDetail.tsx` 里新增「以岗位身份执行」卡片；`packages/web/src/pages/Settings.tsx` 里新增「登录后自动恢复」区块。

- [ ] **Step 1: 写失败测试（追加到 `packages/web/test/pages.test.tsx` 与 `packages/web/test/settings.test.tsx`）**

  ```ts
  test('任务详情页有「以岗位身份执行」卡片与五个按钮', async () => {
    const api = mockApi({ 'GET /api/teams/duo/tasks/task-1': { ok: true, result: shownTask() }, 'GET /api/teams/duo': { ok: true, result: teamOf('duo') } })
    render(<TaskDetail team="duo" id="task-1" />, { api })
    for (const label of ['认领任务', '放弃认领', '记录计划', '开始任务', '完成并校验']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  test('「认领任务」带上选中的岗位身份', async () => {
    …点击后断言 api.calls['POST /api/teams/duo/tasks/task-1/claim'][0].body.as === 'builder@duo'…
  })

  test('关于页显示自动恢复状态并有开启/关闭按钮', async () => {
    const api = mockApi({ 'GET /api/about': { ok: true, result: { items: [], teams: [], autostart: { supported: true, installed: true, location: '/x', command: ['wl'], commandMissing: [], logTail: [], platform: 'darwin', logPath: '/x.log' } } } })
    render(<Settings />, { api })
    expect(screen.getByText('已开启')).toBeTruthy()
    expect(screen.getByRole('button', { name: '关闭自动恢复' })).toBeTruthy()
  })
  ```

- [ ] **Step 2: 跑测试确认失败**

  Run: `pnpm test packages/web/test/pages.test.tsx packages/web/test/settings.test.tsx`
  Expected: FAIL —— 找不到「认领任务」按钮。

- [ ] **Step 3: `TaskDetail.tsx` 加「以岗位身份执行」卡片**

  - 只在任务未处于终态（`status !== 'completed' && status !== 'failed'`）时渲染。
  - 岗位下拉框：选项来自 `GET /api/teams/:team` 的 `posts`（用 `address` 作值，显示 `岗位标识@team（牵头岗）` 这类中文标签）；默认选中 `task.claimedBy`，未认领时选团队的牵头岗（`posts` 里 `isLead` 为真的那个）。
  - 五个按钮：「认领任务」「放弃认领」「记录计划」「开始任务」「完成并校验」，分别调 `/claim`、`/release`、`/plan`（带 `text`）、`/start`、`/done`，请求体都带 `as`。
  - 「完成并校验」返回 `outcome === 'gate_failed'` 或 `'escalated'` 时，在页面上显示闸门失败原因与输出摘要，并刷新任务详情。
  - 卡片底部一行 `CommandHint`：按当前选中的岗位动态拼 `wl task <claim|release|plan|start|done> <id> --as <岗位>`。
  - 原有管理员按钮文案改成纯中文：「改派主人」「恢复派发」「处理闸门」「转人工处理」；终态任务额外给「重开并转人工」（`escalate` 带 `reopen: true`）。

- [ ] **Step 4: `Settings.tsx` 加「登录后自动恢复」区块**

  - `autostart.supported === false` → 显示原因说明。
  - `supported === true` → 显示「已开启」/「未开启」、服务文件路径、将执行的命令、最近日志尾部（`logTail` 取最后几行）。
  - 「开启自动恢复」（`.btn`）：弹窗填「等待 Orca 就绪的时长」（默认 `15m`），调 `POST /api/autostart/install { waitOrca }`。
  - 「关闭自动恢复」（`.btn.danger`）：确认后调 `POST /api/autostart/uninstall`。
  - 区块下方附 `CommandHint`：`wl autostart install` / `wl autostart uninstall`。

- [ ] **Step 5: 任务相关页面在团队未启动时给空状态提示**

  规格第 3.3.4 条：`/api/teams/:team/tasks` 与 `/api/teams/:team/tasks/:id` 在团队没有 Run 时返回 `run_not_ready`（400）。前端要把它变成中性提示，而不是红色错误块。

  - `TaskBoard.tsx` 与 `TaskDetail.tsx`：`ApiError` 且 `code === 'run_not_ready'` 时渲染「团队尚未启动，先点击『启动团队』」的普通提示（`.banner`，不是 `.error`）；其它错误仍走 `ErrorBox`。
  - `TaskDetail.tsx` 在 `run_not_ready` 时不渲染「以岗位身份执行」卡片。

- [ ] **Step 6: 跑测试确认通过**

  Run: `pnpm test packages/web/test/pages.test.tsx packages/web/test/settings.test.tsx && pnpm typecheck`
  Expected: PASS。

- [ ] **Step 7: 全量验证**

  Run: `pnpm test && pnpm typecheck && pnpm build`
  Expected: 全部通过（本会话需要 `dangerouslyDisableSandbox: true`）。

- [ ] **Step 8: 提交**

  ```bash
  git add packages/web/src/pages/TaskDetail.tsx packages/web/src/pages/TaskBoard.tsx packages/web/src/pages/Settings.tsx packages/web/test/pages.test.tsx packages/web/test/settings.test.tsx
  git commit -m "feat(web): 任务详情页代岗位执行与自动恢复管理"
  ```
