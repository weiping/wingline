# 阶段 3D-2（块 d）：远端环境的会话恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `team.yaml` 的岗位可以写 `environment`（Orca 里的已配对环境名）；重启后 `wl restore` 用 `orca search --environment` 按标记找回 VM 里的会话并以 `<launch> --resume <id>` 接回，找不准时报 `uncertain` 而不是新起一个丢上下文的会话。

**Architecture:** 只改三处：规格（字段、校验、哈希）、`findSession`（多一个 `environment` 参数）、`restorePost`（把规格里的值传下去）。不加注册表列、不加迁移——`restore` 本来就读规格，规格是唯一来源。

**Tech Stack:** TypeScript、vitest、FakeOrca。

> **状态（2026-10-24）：已实现**（分支 `phase-3d2d-remote-environment`，Task 1–3 各一个提交；全量 114 个文件、1566 个用例通过）。Task 4 真机检查通过前两项（找到 VM 会话并接回、`--resume` 进程与接回提示），第三项（包装脚本不透传参数的反例）已做：**会静默假成功**，见 Task 4；结果见 `spikes/REPORT.md` “3D-2 远端环境真机验证”。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md` 第 5 节（5.1 字段、5.2 会话的确定顺序、5.3 探针 4 的结论）与第 11 节“远端环境”条目。块 (c) 画面信号不在本 plan（等探针 2 的样本）。前置：探针 4 已完成（`spikes/REPORT.md` “3D-2 探针 4”）。

## Global Constraints

- 不新增运行时依赖；函数 ≤ 50 行。
- `posts[].environment` 格式 `^[a-z0-9][a-z0-9._-]{0,63}$`；不符 → `environment_invalid`（input，退出码 1），校验放在 `spec/load.ts`（`at.fail`，与 `launch_required` 同样）；`schema.ts` 只声明 `z.string().min(1).optional()`（否则 zod 的格式错误会被统一映射成 `spec_invalid`）。
- 未写 `environment` 时不出现在 `PostSpec` 里、不进规格哈希（`spec/hash.ts` 的 `posts` 映射条件展开）；DUO_YAML 的已钉死哈希 `d6cf0b333ae8418f9fe51eced88cc223e889ebcdf2f6278c633fc37fbb2dc00c` 必须不变。
- 不加 `PostRow` 列、不加迁移。
- 远端岗位的搜索：`orca search "<标记>" --agent <agent> --fresh --environment <env>`；三道闸不变（`cwd` 与岗位 worktree 同路径、`snippet` 整串高亮标记、会话未被本团队其他岗位占用）。本机岗位的搜索不带 `environment`，行为与 3A 完全一致。
- 远端岗位**不静默退回 `fresh`**：标记已高亮但 `cwd` 不一致 → `uncertain`；有命中没有 `snippet` → `uncertain`；干净的未命中 → `none`（fresh）。`uncertain` 的原因里写 `wl restore <team> --session <post>=<id>`。
- 环境不可达（orca / uncertain 类错误）→ `uncertain`；环境名未登记（input / internal 类错误）→ 原样抛出。
- 恢复命令不变：`<launch> --resume <id>`（`resumeCommand`）。
- 提交信息末尾附 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **环境名写成 `Lima Agent` / `LIMA` / `a/b` / 超过 64 字符**：报 `environment_invalid`（带行号），不是笼统的 `spec_invalid`。归 Task 1。
2. **VM 里的 `cwd` 不是宿主路径**（没有同路径挂载的 VM）：标记已高亮的命中被 `cwd` 闸拒绝时报 `uncertain`，不是 `fresh`。归 Task 2。
3. **旧版 Orca 扣留 evidence（命中 `snippet` 为 null）**：报 `uncertain`，不是 `fresh`。归 Task 2。
4. **本机恰好有同一个标记的会话**：远端岗位不能用它；反过来本机岗位的搜索也不带 `--environment`。归 Task 2。
5. **环境不可达（ssh 隧道断了）**：`uncertain`，重跑即可；**环境名拼错**：抛出 input 类错误，不重试。归 Task 2。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/spec/{schema,load,hash}.ts` | `posts[].environment` |
| `packages/web/src/components/SpecForm.tsx` | 岗位字段加 `environment` |
| `packages/core/src/commands/restore/find-session.ts` | `environment` 参数与上面的判定 |
| `packages/core/src/commands/restore/posts.ts` | `restorePost` 传 `post.environment` |
| `packages/core/test/commands/fake-client.ts` | `FakeOrca.search` 记录调用参数（`searches`） |
| `README.md`、`teams/duo/team.yaml` | 字段说明与包装脚本要求 |

---

### Task 1: `posts[].environment` 字段

**Files:**
- Modify: `packages/core/src/spec/schema.ts`（`postSchema` 加 `environment: z.string().min(1).optional()`）、`spec/load.ts`（`PostSpec.environment?: string`；新函数 `environmentOf(p, i, at)`，在 `posts` 映射里条件展开）、`spec/hash.ts`（`posts` 映射条件展开 `...(p.environment !== undefined ? { environment: p.environment } : {})`）、`packages/web/src/components/SpecForm.tsx:156`（在 `launch` 之后加 `<TextField {...f('environment')} />`）与 `:221`（岗位字段白名单加 `'environment'`）
- Test: `packages/core/test/spec/load.test.ts`、`packages/core/test/spec/hash.test.ts`、`packages/web/test/edit.test.tsx`（追加）

**Interfaces:**
- Produces: `PostSpec.environment?: string`（未写则没有这个键）；`loadTeamSpec` 对不合格的值抛 `WinglineError('input', 'environment_invalid', …)`，路径为 `['posts', i, 'environment']`

- [ ] **Step 1: 写失败测试**

```ts
const ENV_YAML = DUO_YAML.replace('    agent: claude\n    model: opus\n', '    agent: claude\n    model: opus\n    environment: lima-agent\n')

test('posts[].environment is read when written and absent from PostSpec when not', () => {
  expect(loadTeamSpec(mkTeam(ENV_YAML)).posts[0]!.environment).toBe('lima-agent')
  expect('environment' in loadTeamSpec(mkTeam(DUO_YAML)).posts[0]!).toBe(false)
})
test.each(['Lima Agent', 'LIMA', 'a/b', 'x'.repeat(65)])('environment %j → environment_invalid, not spec_invalid', (bad) => {
  expect(() => loadTeamSpec(mkTeam(ENV_YAML.replace('lima-agent', `'${bad}'`)))).toThrow(expect.objectContaining({ kind: 'input', code: 'environment_invalid' }))
})
test('an empty environment is a schema error (spec_invalid)', () => {
  expect(() => loadTeamSpec(mkTeam(ENV_YAML.replace('lima-agent', "''")))).toThrow(expect.objectContaining({ code: 'spec_invalid' }))
})
// hash.test.ts
test('3D-2: a spec without environment keeps the pinned hash; writing one changes it, and different names differ', () => {
  expect(specHash(loadTeamSpec(mkTeam(DUO_YAML)))).toBe('d6cf0b333ae8418f9fe51eced88cc223e889ebcdf2f6278c633fc37fbb2dc00c')
  const a = specHash(loadTeamSpec(mkTeam(ENV_YAML)))
  expect(a).not.toBe(specHash(loadTeamSpec(mkTeam(DUO_YAML))))
  expect(specHash(loadTeamSpec(mkTeam(ENV_YAML.replace('lima-agent', 'other-vm'))))).not.toBe(a)
})
```

web 端：仿照 `edit.test.tsx` 里 `launch` 字段的用例加一条——岗位表单渲染出 `environment` 输入框，输入后提交的规格里 `posts[0].environment` 为输入值；服务端返回路径 `posts.0.environment` 的错误时显示在该字段旁（`SpecForm.tsx:221` 的白名单放行它）。

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/spec packages/web/test/edit.test.tsx` → FAIL（`environment` 是未知键 / 没有该字段）。
- [ ] **Step 3: 实现** 上述签名；`environmentOf` 在值不匹配 `^[a-z0-9][a-z0-9._-]{0,63}$` 时 `at.fail('environment_invalid', ['posts', i, 'environment'], …, '只能用小写字母、数字、连字符、下划线和点，1–64 个字符')`。
- [ ] **Step 4: 运行确认通过** — 连同 `pnpm typecheck`（`PostSpec` 的字面量写法有类型对照的测试一并修）。
- [ ] **Step 5: 提交** — `git commit -m "feat(spec): posts[].environment"`

---

### Task 2: `findSession` 按环境搜索

**Files:**
- Modify: `packages/core/src/commands/restore/find-session.ts`、`packages/core/test/commands/fake-client.ts`（`FakeOrca.search` 里 `this.searches.push({ ...a })`，新增公开字段 `searches: Array<{ query: string; agent: string; environment?: string }> = []`）
- Test: `packages/core/test/commands/restore/find-session.test.ts`（追加）

**Interfaces:**
- Consumes: `OrcaClient.search(a: { query; agent; environment? })`（已存在）、`markerHighlighted`、`samePath`
- Produces: `findSession(deps: CommandDeps, post: PostRow, worktreePath: string, override?: string, reserved?: string[], environment?: string): Promise<SessionLookup>` — `environment` 缺省时与现在完全一致；给了则搜索带 `environment`，并按下表判定

| 过标记闸（未被占用、`snippet` 整串高亮）后 | 结果 |
| --- | --- |
| 命中里 `cwd` 同 worktree 的恰好 1 条 | `found`（`via: 'search'`） |
| 多条 | `ambiguous` |
| 0 条，但有“标记已高亮而 `cwd` 不一致”的命中 | `uncertain`，原因含 `--session` 与“cwd” |
| 0 条，且原始命中里有 `snippet` 为 null 的 | `uncertain`，原因含 `--session` 与“证据” |
| 0 条，也没有上面两类 | `none`（“未找到原会话”） |

- [ ] **Step 1: 写失败测试**（`o.sessions` 里的项带 `environment`；`postRow()` 沿用文件里已有的）

```ts
const ENV = 'lima-agent'
const M = 'WLS-aaaa1111'
const remote = (over: Record<string, unknown> = {}) => ({ marker: M, agent: 'claude', sessionId: 'vm-1', cwd: '/wt', environment: ENV, ...over })

test('environment post: searches with --environment and ignores a local session with the same marker', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push({ marker: M, agent: 'claude', sessionId: 'local-1', cwd: '/wt' }, remote())
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'found', sessionId: 'vm-1', via: 'search' })
  expect(o.searches).toEqual([{ query: `"${M}"`, agent: 'claude', environment: ENV }])
})
test('local post (no environment) still searches without it and ignores remote sessions', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote(), { marker: M, agent: 'claude', sessionId: 'local-1', cwd: '/wt' })
  expect(await findSession(deps, postRow(), '/wt')).toEqual({ kind: 'found', sessionId: 'local-1', via: 'search' })
  expect(o.searches[0]).toEqual({ query: `"${M}"`, agent: 'claude' })
})
test('environment post: override and cached session id win without any search', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt', 'over-1', [], ENV)).toEqual({ kind: 'found', sessionId: 'over-1', via: 'override' })
  expect(await findSession(deps, postRow({ sessionId: 'c-1' }), '/wt', undefined, [], ENV)).toEqual({ kind: 'found', sessionId: 'c-1', via: 'cached' })
  expect(o.searches).toEqual([])
})
test('environment post: a highlighted hit whose cwd is a VM path is uncertain, never none', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote({ cwd: '/home/user/wt' }))
  const r = await findSession(deps, postRow(), '/wt', undefined, [], ENV)
  expect(r).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('--session') })
  expect((r as { reason: string }).reason).toContain('cwd')
})
test('environment post: hits without evidence are uncertain; a clean miss is none; a partial-token hit is not a marker hit', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'none', reason: '未找到原会话' })
  o.sessions.push(remote({ snippet: null }))
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('证据') })
  o.sessions.length = 0
  o.sessions.push(remote({ snippet: 'x [[wls]] y' }))
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toEqual({ kind: 'none', reason: '未找到原会话' })
})
test('environment post: two matching sessions are ambiguous; a session taken by another post is skipped', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.sessions.push(remote(), remote({ sessionId: 'vm-2' }))
  expect((await findSession(deps, postRow(), '/wt', undefined, [], ENV)).kind).toBe('ambiguous')
  expect(await findSession(deps, postRow(), '/wt', undefined, ['vm-2'], ENV)).toEqual({ kind: 'found', sessionId: 'vm-1', via: 'search' })
})
test('environment unreachable (orca error) is uncertain with a rerun hint; an unknown environment (input error) is thrown', async () => {
  const o = new FakeOrca(); const { deps } = mkDeps(o)
  o.searchError = new WinglineError('orca', 'runtime_unavailable', 'tunnel down')
  expect(await findSession(deps, postRow(), '/wt', undefined, [], ENV)).toMatchObject({ kind: 'uncertain', reason: expect.stringContaining('wl restore duo') })
  o.searchError = new WinglineError('input', 'environment_not_found', 'no such environment')
  await expect(findSession(deps, postRow(), '/wt', undefined, [], ENV)).rejects.toMatchObject({ code: 'environment_not_found' })
})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/restore/find-session.test.ts` → FAIL（`searches` 不存在 / 第 6 个参数被忽略）。
- [ ] **Step 3: 实现** `findSession` 的 `environment` 参数：搜索时 `...(environment !== undefined ? { environment } : {})`；把“过滤并判定”拆成一个纯函数 `pick(hits, { marker, worktreePath, taken, remote })`，返回上表的结果，避免 `findSession` 超过 50 行。`remote` 为假时走原来的判定（`cwd !== null` 且同路径且高亮），不引入 `uncertain` 分支。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/restore` 全部 PASS（3A 的本机用例一条都不能改）。
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): findSession searches remote environments"`

---

### Task 3: `restorePost` 接线、文档

**Files:**
- Modify: `packages/core/src/commands/restore/posts.ts:128`（`findSession(l.deps, row, worktreePath, o.override, o.reserved, post.environment)`）、`README.md`（字段速查表加一行；“重启之后：`wl restore`”一节后加“远端环境（Lima 等）”小节）、`teams/duo/team.yaml`（`environment` 的注释示例，保持注释状态）
- Test: `packages/core/test/commands/restore/posts.test.ts`（追加；把文件顶部的 `seed(o, builderOver)` 扩成 `seed(o, builderOver, yaml = DUO_YAML)`）

**Interfaces:**
- Consumes: Task 1 的 `PostSpec.environment`、Task 2 的 `findSession(…, environment)`

- [ ] **Step 1: 写失败测试**

```ts
const ENV_YAML = DUO_YAML.replace('    agent: claude\n    model: opus\n', '    agent: claude\n    model: opus\n    environment: lima-agent\n')
const vm = (over: Record<string, unknown> = {}) => ({ marker: 'WLS-aaaa1111', agent: 'claude', sessionId: 'vm-1', cwd: os.tmpdir(), environment: 'lima-agent', ...over })

test('remote post: resumes the VM session found through --environment with launch + --resume', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm())
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(s.o.created.at(-1)!.command).toBe('claude --model opus --resume vm-1')
  expect(s.o.searches).toEqual([{ query: '"WLS-aaaa1111"', agent: 'claude', environment: 'lima-agent' }])
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('vm-1')
})
test('remote post: a local session with the same marker is not used, so it starts fresh with the context-lost note', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(hit('local-1'))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toMatchObject({ outcome: 'fresh', reason: '未找到原会话，上下文已丢失' })
})
test('remote post: --session skips the search entirely', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  const r = await restorePost(s.l, s.post, { dryRun: false, override: 'vm-9', briefing: s.briefing })
  expect(r).toMatchObject({ outcome: 'resumed', sessionId: 'vm-9' })
  expect(s.o.searches).toEqual([])
})
test('remote post: a VM-path cwd is uncertain, with nothing created and the retry command named', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm({ cwd: '/home/user/wt' }))
  const r = await restorePost(s.l, s.post, { dryRun: false, briefing: s.briefing })
  expect(r).toMatchObject({ outcome: 'uncertain', retry: 'wl restore duo' })
  expect(r.reason).toContain('--session')
  expect(s.o.created).toEqual([])
})
test('remote post: dry-run reports resumed without creating a terminal', async () => {
  const s = seed(new FakeOrca(), {}, ENV_YAML)
  s.o.sessions.push(vm())
  expect(await restorePost(s.l, s.post, { dryRun: true, briefing: s.briefing })).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(s.o.created).toEqual([])
})
```

- [ ] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/restore/posts.test.ts` → FAIL（`restorePost` 还没传 `environment`，搜索不带环境，找不到 `vm-1`）。
- [ ] **Step 3: 实现** 接线一行。README 写明：(1) `environment` 是 Orca 里已配对环境的名字（`orca environment list`），`launch` 要写成能在那个环境里启动 agent 的命令（如 `claude-lima --dangerously-skip-permissions`）；(2) **包装脚本必须把参数原样传给 agent**，例如 `exec limactl shell agent claude "$@"`，否则 `--resume <id>` 到不了 agent；(3) 重启后 `wl restore` 自动在该环境里按标记找会话；找不到可用的会话时会报 `uncertain` 并提示 `--session`；会话 ID 可从 VM 内 `claude --resume` 的列表，或 `orca search --environment <env> "<关键词>"` 回执里的 `sessionId` 取得；(4) 已验证的环境是 Lima 默认的同路径挂载（宿主 home 以同样路径出现在 VM 里）；`cwd` 在 VM 里不是宿主路径时自动搜索会报 `uncertain`，需要手工 `--session`。
- [ ] **Step 4: 运行确认通过** — `pnpm typecheck && pnpm test` → 全部 PASS（贴出输出再声明完成）。
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): remote-environment posts resume through --environment"`

---

### Task 4: 真机检查（人执行，逐项勾选）

对已配对的 `lima-agent`（本机已有，见探针 4）：

- [ ] 在 VM 里启动一个带标记的 claude 会话（用 `wl up` 起一个 `environment: lima-agent` 的岗位，`launch` 指向透传参数的包装脚本），确认岗位上线、启动包送达。
- [ ] 模拟重启（关掉岗位终端），`wl restore <team> --dry-run`：显示 `resumed` 与会话 ID；再 `wl restore <team>`：新终端里执行 `<launch> --resume <id>`，岗位收到接回提示，`wl ps` 为 `live`。
- [x] 把 `launch` 换成不透传参数的包装脚本再试一次（2026-10-24 已做）。**原先写的预期“应停在 `uncertain`”是错的**：参数被丢掉后，VM 里起的是一个全新但同样空闲的 claude，`wl restore` 报“已接回原会话”、退出码 0、岗位 `live`、会话 ID 已缓存，接回提示落进了新会话。静默的上下文丢失；后来已加核对（见 `2026-10-24-phase-3d2d2-verify-remote-resume.md`）。结果见 `spikes/REPORT.md`。
- [ ] 结果记入 `spikes/REPORT.md`（“3D-2 远端环境真机验证”），并在本 plan 顶部写明状态。
