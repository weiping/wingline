# 阶段 3A：重启恢复与审计时间线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wl restore <team>` 在 Orca 重启后接回岗位会话、重新认领协调者、拉起调度员、重新派发在办任务；`wl log <team>` 把任务变迁、巡查动作与每条写命令合成一条审计时间线。

**Architecture:** `wl up` 的拉起逻辑抽成 `commands/launch.ts` 供 `up` 与 `restore` 共用；会话标记写进启动包与 `posts` 表，`restore` 用 `orca search` 精确搜索标记找回会话 ID，再用 `resumeCommand` 拼出恢复命令。写命令经 core 的 `auditedCommands` 包装写入 `audit_events`；`wl log` 合并 `task_log`、`patrol_events`、`audit_events` 三张表。

**Tech Stack:** TypeScript（Node ≥ 22.13）、`node:sqlite`（经 `Registry`）、commander、vitest、FakeOrca。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3a-restore-timeline-design.md`（下称 spec）

> **状态（2026-10-20）：已实现。** Task 1–10 全部执行完毕并合并；随后经复审修复（`docs/superpowers/reviews/2026-10-16-phase-3-review.md` 与实现期的 fix 波次）。Step 5 的提交信息与历史基本一致，其中 Task 1 实际为 `spike: codex session search and resume probe`（结论是"不成立"，见该 Task 内的注记），Task 9 实际为 `feat(audit): audited command wrapper`，Task 10 实际为 `feat(cli): wl restore and wl log`（`readTimeline`/`followTimeline`）。

## Global Constraints

- Node ≥ 22.13；不新增运行时依赖。
- 只经由 `orca … --json` 子进程操作 Orca；子进程以参数数组启动，不经 shell（总纲第 2 节）。
- 一切改变状态的调用先在 `requests` 表记“进行中”再调用；不确定就不动手：不关闭、不重建、不重发（总纲第 2 节第 2、3 条）。
- 退出码四分类沿用总纲 7.8：0 成功；1 输入错误；2 Orca 明确报错；3 结果不确定；4 内部错误。
- 新错误码：`team_stopped`（1）、`session_override_invalid`（1）；沿用 `team_unknown`、`team_busy`、`team_spec_changed`、`spec_not_found`、`runtime_unavailable`、`duration_invalid`。
- 会话标记格式 `WLS-` + 8 位小写十六进制；会话 ID 只接受 `^[A-Za-z0-9-]+$`。
- 搜索一律加引号精确匹配并带 `--fresh`：`orca search '"<标记>"' --agent <agent> --fresh --json`。
- 审计摘要中 `send` 正文、`--body`、`--reason`、`--resolution`、`task plan` 文本截为前 60 字符，超出写“…（共 N 字）”；`audit_events` 保留 30 天。
- `wl log` 默认 `--limit 200`；`--follow` 每 2 秒轮询；`--json --follow` 输出 NDJSON。
- 函数 ≤ 50 行。
- 提交信息末尾附：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HZPHR19BmX8BKiMSJtVnyP
  ```

## Review Focus

1. **标记泄露进别的会话**（复审 I-2）：标记不出现在任何 CLI 输出、`--json`、审计摘要里；两条命中且其中一条已是另一岗位的 `session_id` 时判为 `found`。测试归 Task 6 与 Task 10。
2. **macOS 上 `cwd` 带 `/private` 前缀**：worktree 记为 `/tmp/x`，搜索命中的 `cwd` 是 `/private/tmp/x`；用户期望照样接回。比较前两边都做 `fs.realpathSync`（路径不存在时用原值）。测试归 Task 6。
3. **加了会话标记后启动包超过 12 000 字符**：标记行计入上限，超限时报 `briefing_too_long`，而不是静默截断或在拉起一半时失败。测试归 Task 4。
4. **`restore` 与 `wl up` 同时执行**：后到的一方得到 `team_busy`，不会建出两个同名终端。测试归 Task 8。
5. **审计摘要里的换行与控制字符**：多行的 `wl send` 正文在时间线上仍是一行，不破坏 `wl log` 的逐行输出与 NDJSON。测试归 Task 9。
6. **同一秒内的多条事件**：`wl log` 的合并排序稳定（按 `at`，再按来源 `task`<`patrol`<`command`，再按表内 id），`--follow` 不重复也不漏行。测试归 Task 10。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `spikes/codex-resume.ts`（新） | Codex 会话搜索与恢复探针 |
| `packages/core/src/registry/migrations.ts` | 追加迁移：`posts` 三列、`audit_events` |
| `packages/core/src/registry/registry.ts` | 会话字段读写；审计与时间线查询 |
| `packages/core/src/orca/types.ts`、`client.ts` | `search` |
| `packages/core/src/commands/launch.ts`（新） | 从 `up.ts` 抽出的 `recorded`、`stepDone`、`lifetimeGen`、`startPost`；会话标记 |
| `packages/core/src/commands/up.ts` | 改用 `launch.ts` |
| `packages/core/src/commands/restore/resume-command.ts`（新） | `resumeCommand` |
| `packages/core/src/commands/restore/find-session.ts`（新） | 会话 ID 的确定（覆盖 / 缓存 / 搜索） |
| `packages/core/src/commands/restore/posts.ts`（新） | 逐岗位判定与拉起 |
| `packages/core/src/commands/restore/index.ts`（新） | `restore()`：前置、岗位、Run、调度员、任务、dry-run |
| `packages/core/src/audit.ts`（新） | `auditedCommands`、摘要、截断 |
| `packages/core/src/commands/log.ts`（新） | 时间线合并、过滤、游标 |
| `packages/core/src/index.ts` | 导出新增接口 |
| `packages/cli/src/cli.ts`、`output.ts` | `wl restore`、`wl log`；`realCommands` 经 `auditedCommands` |
| `README.md` | 恢复与时间线一节 |
| `test/live/duo.live.test.ts` | 重启后 restore 的真机用例 |

---

### Task 1: Codex 会话探针

**Files:**
- Create: `spikes/codex-resume.ts`
- Modify: `spikes/REPORT.md`、`test/fixtures/receipts/search-claude.json`（新）、`test/fixtures/receipts/search-codex.json`（新，探针成立时）

**Interfaces:**
- Produces: `test/fixtures/receipts/search-claude.json`、`search-codex.json`（脱敏的 `orca search --json` 真实回执，供 Task 3 的契约测试）；REPORT 中 Codex 的结论（成立时写明恢复命令的形式：`codex resume <id> <原参数>` 或 `<原启动命令> resume <id>`）。

> 本任务需要真机上运行中的 Orca（macOS 或 Linux）。在沙箱里无法完成时，实现者写好脚本后报告 NEEDS_CONTEXT，由控制方交给人在真机上运行；Task 3–10 不依赖它的结论（Codex 默认归为”无接回能力”，Task 5 的模板留一行待填）。

> **实现结果（2026-10-17）：探针已跑完，结论是”不成立”** —— 两次真机运行都撞 `agent_prompt_blocked`（Orca 1.4.227 在 codex 一侧”被叫醒但还没到能接 prompt”是稳定状态），`orca search` 回执为 `hits: []`。空结果是**构造出来的**，不构成”Orca 不索引 codex 会话”的证据。codex 接回在本任务范围不可验证：3A 的接回逻辑只对 claude 验证通过（`spikes/REPORT.md`「3A 探针」与「3A 真机验证」两节），codex 岗位走 `fresh` 路径或用 `--session` 手工指定（3A spec §5.3 的逃生口）。`codex resume` 的命令形式与”Orca 是否索引 codex 会话”留待 3D 用 e2e 实测或在沙箱外直跑 codex CLI 验证。下方 Step 均已执行（脚本、真机运行、脱敏入库、提交）。

- [x] **Step 1: 写探针脚本**，沿用 `spikes/lib.ts` 的写法：开 `spike-codex` 终端（`--command codex`），等 `tui-idle`，`--text “只回复收到。标记 WLS-<随机>” --enter`，等答完；`orca search '”WLS-…”' --agent codex --fresh --json` 存为 `spikes/out/codex-resume/<平台>/search.json`；关闭终端；分别用 `codex resume <sessionId>` 与 `codex <原参数> resume <sessionId>` 开 `spike-codex-2`，等空闲后 `terminal show` 存 `after-*.json`；关闭。输出一行 `RESULT codex-resume <成立|不成立> search=<命中数> resume=<形式|无>`。
- [x] **Step 2: 在真机上运行**（`pnpm tsx spikes/codex-resume.ts`），同法用 `claude` 抓一份搜索回执。
- [x] **Step 3: 脱敏后存入** `test/fixtures/receipts/search-claude.json`（与 `search-codex.json`），替换用户名、路径为 `/Users/u/repo` 形式；在 `spikes/REPORT.md` 增加“3A 探针：Codex 会话恢复”一节，写结论与判读。
- [x] **Step 4: 提交** — `git commit -m "spike: codex session search and resume probe"`

---

### Task 2: 注册表迁移与读写

**Files:**
- Modify: `packages/core/src/registry/migrations.ts`、`packages/core/src/registry/registry.ts`
- Test: `packages/core/test/registry/registry.test.ts`（追加）、`packages/core/test/registry/migrate-3a.test.ts`（新）

**Interfaces:**
- Produces:
  - `PostRow` 增加 `sessionMarker: string | null; sessionId: string | null; sessionAt: string | null`
  - `Registry.setSessionMarker(address: string, marker: string, at: string): void` — 同时清空 `session_id`
  - `Registry.setSessionId(address: string, sessionId: string): void`
  - `interface AuditRow { id: number; team: string; at: string; actor: string; command: string; target: string | null; outcome: string; detail: string | null }`
  - `Registry.appendAudit(r: Omit<AuditRow, 'id' | 'at'> & { at?: string; detail?: unknown }): void`
  - `Registry.listAudit(team: string, o: { afterId?: number; since?: string; limit?: number }): AuditRow[]` — 按 `id` 升序；带 `limit` 时返回最新的 `limit` 条（仍升序）
  - `Registry.pruneAudit(before: string): number`
  - `Registry.listTeamTaskLog(team: string, o: { afterId?: number; since?: string; limit?: number }): TaskLogRow[]`（语义同 `listAudit`）
  - `Registry.listPatrolEvents(team, o)` 的选项增加 `afterId?: number`

- [x] **Step 1: 写失败测试**

```ts
test('setSessionMarker stores marker and time and clears a cached session id', () => {
  const r = seededRegistry()          // 现有测试里登记 duo 团队与 builder@duo 的辅助函数
  r.setSessionId('builder@duo', 'old-id')
  r.setSessionMarker('builder@duo', 'WLS-0a1b2c3d', '2026-10-16T00:00:00.000Z')
  expect(r.getPost('builder@duo')).toMatchObject({ sessionMarker: 'WLS-0a1b2c3d', sessionId: null, sessionAt: '2026-10-16T00:00:00.000Z' })
})
test('audit rows round-trip; limit keeps the newest n in ascending order; afterId pages forward', () => {
  const r = seededRegistry()
  for (let i = 1; i <= 5; i++) r.appendAudit({ team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok', detail: { i } })
  expect(r.listAudit('duo', { limit: 2 }).map((a) => JSON.parse(a.detail!).i)).toEqual([4, 5])
  expect(r.listAudit('duo', { afterId: 3 }).map((a) => a.id)).toEqual([4, 5])
})
test('pruneAudit deletes rows older than the cutoff', () => { /* 写两条不同 at，prune 后只剩新的一条 */ })
test('listTeamTaskLog and listPatrolEvents accept afterId', () => { /* 各写 3 条，afterId=1 返回后两条 */ })
```

`migrate-3a.test.ts`：用 2B 时的迁移列表建一个库并写入一个岗位，再用当前迁移打开：岗位数据保留、三列为 `null`、`audit_events` 存在。

- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/registry` → 新测试 FAIL（方法不存在）。
- [x] **Step 3: 实现** — 追加一个迁移字符串（spec 第 8 节的 SQL）；`PostRow` 映射新列；按上面的签名实现方法（`detail` 以 `JSON.stringify` 存）。
- [x] **Step 4: 运行确认通过** — 同上命令全部 PASS。
- [x] **Step 5: 提交** — `git commit -m "feat(registry): session columns and audit_events"`

---

### Task 3: `OrcaClient.search`

**Files:**
- Modify: `packages/core/src/orca/types.ts`、`packages/core/src/orca/client.ts`、`packages/core/test/commands/fake-client.ts`
- Test: `packages/core/test/orca/client.test.ts`（追加）、`packages/core/test/orca/contract.test.ts`（追加）

**Interfaces:**
- Produces:
  - `interface SearchHit { sessionId: string; cwd: string | null; updatedAt: string | null; messageCount: number | null }`
  - `OrcaClient.search(a: { query: string; agent: string; environment?: string }): Promise<SearchHit[]>` — 调用 `orca search <query> --agent <agent> --fresh [--environment <env>] --json`，`query` 原样作为一个参数（调用方负责加引号）
  - `FakeOrca.sessions: Array<{ marker: string; agent: string; sessionId: string; cwd: string | null; updatedAt?: string; messageCount?: number; environment?: string }>`；`FakeOrca.searchError?: Error`；`search` 返回 `query` 去掉引号后等于 `marker`、`agent`（与 `environment`）相同的条目，并记入 `calls`（`'search'`）

- [x] **Step 1: 写失败测试**

```ts
test('search passes the quoted query as one argument with --fresh and maps hits', async () => {
  const { client, calls } = clientOver({ 'search "WLS-0a1b2c3d"': { hits: [{ sessionId: 's1', cwd: '/r', updatedAt: 't', messageCount: 2 }] } })
  // clientOver 的 key 取 args.slice(0,2)；search 的第二个参数就是查询串
  expect(await client.search({ query: '"WLS-0a1b2c3d"', agent: 'claude' })).toEqual([{ sessionId: 's1', cwd: '/r', updatedAt: 't', messageCount: 2 }])
  expect(calls[0]).toEqual(['search', '"WLS-0a1b2c3d"', '--agent', 'claude', '--fresh'])
})
test('search adds --environment when given', async () => { /* calls[0] 末尾为 '--environment','lima-agent' */ })
test('search maps the real claude receipt (contract)', async () => {
  const receipt = fixture('search-claude')
  // 真实回执的 hits 至少一条：sessionId 为字符串，cwd 为字符串或 null
})
```

> `OrcaRunner.json` 会自动追加 `--json`（沿用现有约定）；断言里不含它。真实回执的字段名以 Task 1 存下的 `search-claude.json` 为准；Task 1 未完成时，契约测试先用 spec 第 2 节第 1 条的字段（`result.hits[].sessionId/cwd/updatedAt`）手写一份最小回执，并在测试名里标 `(provisional)`。

- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/orca` → FAIL。
- [x] **Step 3: 实现** `search`（缺失字段映射为 `null`）与 FakeOrca 的同名方法。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(orca): search client method"`

---

### Task 4: 抽出拉起逻辑并写入会话标记

**Files:**
- Create: `packages/core/src/commands/launch.ts`
- Modify: `packages/core/src/commands/up.ts`、`packages/core/src/brief/render.ts`
- Test: `packages/core/test/commands/launch.test.ts`（新）；`packages/core/test/commands/up.test.ts` 全部照跑

**Interfaces:**
- Produces（`launch.ts`）：
  - `interface Launch { deps: CommandDeps; spec: TeamSpec; hash: string }`
  - `recorded<T>(reg: Registry, id: string, fn: () => Promise<T>, ok?: (v: T) => boolean): Promise<{ confirmed: boolean; value: T }>`（从 `up.ts` 原样搬移）
  - `stepDone(reg: Registry, id: string): boolean`
  - `lifetimeGen(l: Launch, post: string, located: boolean): number`
  - `newSessionMarker(rand?: () => string): string` — 返回 `WLS-` + 8 位小写十六进制
  - `ensureMarker(l: Launch, post: PostSpec, gen: number): string` — 同一代 `create` 步骤已落账且 `posts.session_marker` 非空时沿用，否则生成并 `setSessionMarker`
  - `withMarker(briefing: string, marker: string): string` — 在第一行之后插入 `会话标记：<marker>（雁阵用它在重启后找回本会话，无需理会）`
  - `startPost(l: Launch, post: PostSpec, o: { text: string; command: string; existingHandle: string | null; keyOf: (step: Step) => string }): Promise<'sent' | 'unconfirmed' | 'at_prompt' | 'shell'>` — `up.ts` 现有 `startPost` 的参数化版本：终端命令、发送文本、请求键由调用方给出
- `renderBriefing` 不变；`BRIEFING_LIMIT` 的检查移到“加标记之后”（导出 `checkBriefingLimit(text: string, address: string): void`，抛 `briefing_too_long`）。

- [x] **Step 1: 写失败测试**（`launch.test.ts`）

```ts
test('wl up writes a fresh marker before sending and the brief carries it on the line after the first', async () => {
  const o = new FakeOrca(); const { deps, registry } = mkDeps(o)
  await up(deps, { specPath: mkTeam(DUO_YAML) })
  const marker = registry.getPost('builder@duo')!.sessionMarker!
  expect(marker).toMatch(/^WLS-[0-9a-f]{8}$/)
  const brief = o.sent.find((s) => s.handle === o.terminals.find((t) => t.title === 'builder@duo')!.handle)!.text
  expect(brief.split('\n')[1]).toBe(`会话标记：${marker}（雁阵用它在重启后找回本会话，无需理会）`)
})
test('on .cmd (multilineSafe false) the one-line pointer ends with the marker', async () => {
  // mkDeps(o, { multilineSafe: false })；发送文本匹配 /^请先完整阅读 .+，这是你的岗位说明。（会话标记 WLS-[0-9a-f]{8}）$/
})
test('rerunning an interrupted launch of the same generation keeps the marker', async () => {
  // 让第一次 terminalSend 抛 uncertain（o.failSendOnce），重跑 up：sessionMarker 不变，第二次发送文本里的标记与之相同
})
test('a brief that only exceeds the limit because of the marker line is rejected with briefing_too_long', async () => {
  // NORMS 填充到 renderBriefing 结果恰为 BRIEFING_LIMIT - 10 字符；up 抛 { code: 'briefing_too_long' }，且没有 terminalCreate 调用
})
```

- [x] **Step 2: 运行确认失败** — `pnpm vitest run packages/core/test/commands/launch.test.ts` → FAIL。
- [x] **Step 3: 实现** — 搬移函数到 `launch.ts`；`up.ts` 的 `launchPost` 改为：`gen` → `ensureMarker` → `text = briefText(…withMarker(briefing, marker)…)`（单行指引末尾附 `（会话标记 <marker>）`）→ `checkBriefingLimit` → `startPost(l, post, { text, command: post.launch, existingHandle, keyOf: (s) => requestId(team, post.id, s, hash, gen) })`。`up` 开头的 `renderBriefing` 不再自行检查上限（改由 `checkBriefingLimit` 在发送前检查；仍在调用 Orca 之前完成——所有岗位的文本在进入 `withTeamLock` 前先算好并检查）。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/commands` 全部 PASS（`up.test.ts` 无需修改，除非断言了完整启动包文本：那类断言改为断言首行与其余部分不变）。
- [x] **Step 5: 提交** — `git commit -m "refactor(up): extract launch helpers; session marker in briefs"`

---

### Task 5: `resumeCommand`

**Files:**
- Create: `packages/core/src/commands/restore/resume-command.ts`
- Test: `packages/core/test/commands/restore/resume-command.test.ts`

**Interfaces:**
- Produces:
  - `const SESSION_ID = /^[A-Za-z0-9-]+$/`
  - `resumeCommand(agent: string, launch: string, sessionId: string): string | null` — `claude` → `${launch} --resume ${sessionId}`；`codex` → Task 1 的结论（未定前返回 `null`）；其他 → `null`；`sessionId` 不匹配 `SESSION_ID` 时抛 `WinglineError('input', 'session_override_invalid', …)`
  - `supportsResume(agent: string): boolean`

- [x] **Step 1: 写失败测试**

```ts
test('claude keeps every launch flag and appends --resume', () => {
  expect(resumeCommand('claude', 'claude --dangerously-skip-permissions --model opus', 'a1-b2')).toBe('claude --dangerously-skip-permissions --model opus --resume a1-b2')
})
test('unsupported agents return null', () => { expect(resumeCommand('gemini', 'gemini', 'x')).toBeNull() })
test('session ids with shell metacharacters are rejected', () => {
  expect(() => resumeCommand('claude', 'claude', "x; rm -rf ~")).toThrow(expect.objectContaining({ code: 'session_override_invalid' }))
})
test('codex follows the probe result', () => { /* 按 Task 1 结论；未定前断言 null 并在测试名标 (pending probe) */ })
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（一张 `Record<string, (launch: string, id: string) => string>` 模板表）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(restore): per-agent resume command"`

---

### Task 6: 确定会话 ID

**Files:**
- Create: `packages/core/src/commands/restore/find-session.ts`
- Test: `packages/core/test/commands/restore/find-session.test.ts`

**Interfaces:**
- Consumes: `OrcaClient.search`（Task 3）、`PostRow.sessionMarker/sessionId`（Task 2）、`SESSION_ID`（Task 5）
- Produces:
  - `type SessionLookup = { kind: 'found'; sessionId: string; via: 'override' | 'cached' | 'search' } | { kind: 'none'; reason: string } | { kind: 'ambiguous'; candidates: Array<{ sessionId: string; updatedAt: string | null; messageCount: number | null }> } | { kind: 'uncertain'; reason: string }`
  - `findSession(deps: CommandDeps, post: PostRow, worktreePath: string, override?: string): Promise<SessionLookup>`
  - `samePath(a: string, b: string): boolean` — 两边 `fs.realpathSync`（不存在时用原值）后比较
  - 判定条数之前，排除 `session_id` 已被本团队其他岗位登记的命中（复审 I-2）

- [x] **Step 1: 写失败测试**

```ts
test('override wins, then cached session id, then search', async () => { /* 三种情况分别返回 via: override / cached / search，后两者不调用 search 的断言用 o.calls */ })
test('search keeps only hits whose cwd is the post worktree', async () => {
  // o.sessions: 同一标记两条，cwd 一个是 worktree、一个是 /other；返回 found 且 sessionId 为前者
})
test('cwd under a symlinked prefix still matches (macOS /private/tmp)', async () => {
  // worktreePath 为 fs.mkdtempSync(os.tmpdir()) 的结果，命中 cwd 为其 realpath；返回 found
})
test('zero hits → none with reason 未找到原会话; no marker → none with reason 阶段 3 之前启动', async () => {})
test('more than one matching hit → ambiguous with candidates', async () => {})
test('a hit already bound to another post of the team is excluded before counting', async () => {
  // 两条命中：s-other 已是 checker@duo 的 sessionId，s1 未被占用 → found s1
})
test('search failure → uncertain, never none', async () => { /* o.searchError = new WinglineError('uncertain', 'timeout', 'x') */ })
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现** — 查询串为 `"${marker}"`；`hit.cwd === null` 的命中在本阶段排除（3D 才放宽）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(restore): session lookup by marker"`

---

### Task 7: 逐岗位判定与拉起

**Files:**
- Create: `packages/core/src/commands/restore/posts.ts`
- Test: `packages/core/test/commands/restore/posts.test.ts`

**Interfaces:**
- Consumes: `launch.ts`（Task 4）、`findSession`（Task 6）、`resumeCommand`（Task 5）、`locatePost`、`screenGuard`
- Produces:
  - `type RestorePostOutcome = 'kept' | 'resumed' | 'fresh' | 'ambiguous' | 'uncertain' | 'failed'`
  - `interface RestorePost { address: string; outcome: RestorePostOutcome; sessionId?: string; reason?: string; candidates?: Array<{ sessionId: string; updatedAt: string | null; messageCount: number | null }>; retry?: string; noticeSkipped?: string }`
  - `restorePost(l: Launch, post: PostSpec, o: { dryRun: boolean; override?: string; briefing: string }): Promise<RestorePost>`
- 请求键：`restore:<team>:<post>:<gen>:<step>`，`step` 取 `create`/`wait`/`notice`；`fresh` 走 Task 4 的 `up` 拉起路径（同一 `requestId` 命名空间）。
- `restoreGen(reg: Registry, team: string, post: string, located: boolean): number` — 已完成的 `restore:<team>:<post>:<g>:create` 中最大的 `g` 加 1；终端仍活着（`located`）或本代 `create` 尚未完成时不前进（复审 I-1）。**不用 `lifetimeGen`**，它只统计 `wl up` 的键。
- 处理顺序：牵头岗先，其余按 `team.yaml` 顺序；接回或新开成功后 `setPostHandle` 并 `setPostStatus(address, 'live')`（复审 M-3）。
- 接回提示文本：`[雁阵] 重启后已接回本会话，你的地址仍是 ${address}。`

- [x] **Step 1: 写失败测试**

```ts
test('a live post is kept and nothing is written', async () => {})
test('a dead post with a found session is resumed with the resume command, notified once, and its session id cached', async () => {
  // o.created.at(-1).command === 'claude --model opus --resume s1'；o.sent 里恰一条接回提示；registry.getPost(..).sessionId === 's1'
})
test('resume notice is skipped (outcome still resumed) when the screen is not clear', async () => {
  // o.previews.set(handle, 'Do you want to proceed?\n❯ 1. Yes') → noticeSkipped 含 at_prompt，o.sent 无接回提示
})
test('no session found → fresh launch with a new marker and the context-lost reason', async () => {})
test('ambiguous → no terminal is created and candidates are listed with a --session retry', async () => {})
test('terminal never becomes idle → uncertain, not resent on the next run until the ledger row resolves', async () => {})
test('dry run reports the would-be outcome and makes no Orca writes', async () => {
  // dryRun: true → o.created 与 o.sent 为空；registry 的 requests 表无新行
})
test('rerun after the resume notice was sent does not resend it', async () => {})
test('a second Orca restart after a first restore creates a new terminal with the new session id', async () => {
  // 第一次 restore 接回 s1；再次清空 o.terminals 并把命中改为 s2；第二次 restore：o.created 新增一条，命令以 --resume s2 结尾
})
test('the lead is processed first and handle/status are updated', async () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（判定顺序见 spec 第 5.2 节第 2 步；`fresh` 时 reason 为 `未找到原会话，上下文已丢失` 或 `该岗位在阶段 3 之前启动，没有会话标记` 或 `<agent> 不支持接回会话`）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(restore): per-post resume or fresh launch"`

---

### Task 8: `restore()` 编排

**Files:**
- Create: `packages/core/src/commands/restore/index.ts`
- Modify: `packages/core/src/commands/up.ts`（导出 `ensureRun`）、`packages/core/src/index.ts`
- Test: `packages/core/test/commands/restore/restore.test.ts`、`packages/core/test/commands/restore/flow.test.ts`

**Interfaces:**
- Consumes: `restorePost`（Task 7）、`ensureRun(l, posts, args)`（从 `up.ts` 导出；`posts` 只需 `address` 与 `outcome`：`resumed`/`fresh`/`kept` 视同 `launched`/`already_live`）、`dispatcherHealth`、`dispatcherUp`、`gatherStaleInput`、`staleReasons`、`recoverTask`、`taskPreflight` 的规格检查部分
- Produces:
  - `interface RestoreArgs { team: string; dryRun?: boolean; noTasks?: boolean; sessions?: Record<string, string> }`
  - `interface RestoreResult`（spec 第 5.4 节，字段名照抄）
  - `restore(deps: CommandDeps, a: RestoreArgs): Promise<RestoreResult>`
  - `restoreExitCode(r: RestoreResult): 0 | 2 | 3`

- [x] **Step 1: 写失败测试**（`restore.test.ts`）

```ts
test('unknown team → team_unknown; stopped team → team_stopped with a wl up hint', async () => {})
test('--session for a post not in the team → session_override_invalid', async () => {})
test('spec changed on disk → team_spec_changed before any Orca write', async () => {})
test('another process holds the team lock → team_busy', async () => {
  // 在 registry.withTeamLock('duo', …) 内调用 restore → rejects { code: 'team_busy' }
})
test('coordinator is reclaimed after posts; dead_assignee tasks are recovered to their owners', async () => {})
test('a task whose owner came back ambiguous is skipped with a retry hint', async () => {})
test('--no-tasks skips recovery', async () => {})
test('a stale dispatcher is restarted; a never-started one is left alone', async () => {})
test('exit code: all good 0, any ambiguous/uncertain 3, orca failure without uncertainty 2', () => {})
```

`flow.test.ts`（端到端，FakeOrca）：`wl up` duo → 模拟 Orca 重启（清空 `o.terminals`、旧 handle 失效、`o.sessions` 填入两岗位的标记命中）→ 一个 dispatched 任务的 assignee 失效 → `restore`：两岗位 `resumed`、Run `reclaimed`、任务 `recovered`；再跑一次：全部 `kept`，没有新的 `terminalCreate`、接回提示与派发。

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现**（整个函数体在 `registry.withTeamLock` 内；`dryRun` 时 Run 只读出 `teams.run_id/coordinator_handle` 现状、调度员只读出 `dispatcherHealth`、任务只列出 `dead_assignee`）。第 6 步在 `dispatcherUp` 返回（已确认心跳）之后执行，执行前重新读取 `teams.coordinator_handle`（复审 M-4）。
- [x] **Step 4: 运行确认通过。**
- [x] **Step 5: 提交** — `git commit -m "feat(restore): orchestrate posts, run, dispatcher and tasks"`

---

### Task 9: 审计包装

**Files:**
- Create: `packages/core/src/audit.ts`
- Modify: `packages/core/src/index.ts`、`packages/cli/src/cli.ts`
- Test: `packages/core/test/audit.test.ts`、`packages/cli/test/main.test.ts`（追加）

**Interfaces:**
- Consumes: `Registry.appendAudit`（Task 2）、`resolveActor`/`actorOf`
- Produces:
  - `interface AuditEntry<A> { command: string; team: (a: A) => string; target?: (a: A) => string | null; summary?: (a: A) => Record<string, unknown> }`
  - `type AuditTable<C> = { [K in keyof C]?: AuditEntry<Parameters<Extract<C[K], (...x: any) => any>>[1]> }`
  - `auditedCommands<C extends Record<string, (deps: CommandDeps, a: any) => Promise<unknown>>>(c: C, table: AuditTable<C>, o?: { prefix?: string; actor?: string }): C` — 表里有的命令被包装：执行 → 写一行（成功 `ok`，失败 `<kind>:<code>`）→ 返回原结果或重抛原错误；表里没有的原样返回
  - `clip(s: string, n?: number): string` — 默认 60；先把换行与控制字符替换为空格，超出写 `…（共 N 字）`
  - `WRITE_COMMANDS: readonly string[]` — CLI `Commands` 中属于写命令的字段名（`up`、`down`、`restore`、`send`、`createTask`、`claimTask`、`releaseTask`、`reassignTask`、`startTask`、`planTask`、`doneTask`、`escalateTask`、`resolveGate`、`recoverTask`、`dispatcherUp`、`dispatcherDown`、`freezePostCmd`、`unfreezePostCmd`、`hushCmd`、`unhushCmd`、`dispatcherReply`）
- CLI：`Commands` 增加 `restore`、`log`（Task 10）；`realCommands = auditedCommands(rawCommands, AUDIT)`，`AUDIT` 定义在 `cli.ts` 旁的 `packages/cli/src/audit-table.ts`（新）。`restore` 的 `dryRun` 为真时不写审计。

- [x] **Step 1: 写失败测试**

```ts
test('a wrapped command writes ok with actor, target and clipped summary', async () => {
  // send 正文 100 字含换行 → detail.message 为单行、前 60 字 + '…（共 100 字）'
})
test('a failing command writes <kind>:<code> and rethrows the same error', async () => {})
test('audit write failure only warns', async () => { /* registry.appendAudit 抛错 → deps.warn 被调用一次，结果照常返回 */ })
test('every write command in Commands is in the audit table and no read command is', () => {
  expect(Object.keys(AUDIT).sort()).toEqual([...WRITE_COMMANDS].sort())
  // 另断言 Commands 的每个键要么在 WRITE_COMMANDS，要么在显式的 READ_COMMANDS 列表里（新增命令忘登记时失败）
})
test('restore --dry-run is not audited', async () => {})
```

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现。** 团队名：地址参数取 `@` 之后；任务 id 参数经 `registry.getTaskExt(id)?.team`；`up` 成功时取结果里的 `team`，失败时为 `-`，不为审计单独加载规格；取不到写 `-`。执行者在命令执行**之后**解析（`resolveActor`），解析失败记 `unknown`，不重试，避免 Orca 不可达时每条命令多一次失败调用（复审 M-1）。
- [x] **Step 4: 运行确认通过** — `pnpm vitest run packages/core/test/audit.test.ts packages/cli/test`。
- [x] **Step 5: 提交** — `git commit -m "feat(audit): audited command wrapper"`

---

### Task 10: 时间线 `wl log` 与 CLI 接入

**Files:**
- Create: `packages/core/src/commands/log.ts`
- Modify: `packages/core/src/index.ts`、`packages/cli/src/cli.ts`、`packages/cli/src/output.ts`、`README.md`、`test/live/duo.live.test.ts`
- Test: `packages/core/test/commands/log.test.ts`、`packages/cli/test/main.test.ts`（追加）

**Interfaces:**
- Consumes: `listTeamTaskLog`、`listPatrolEvents`、`listAudit`、`pruneAudit`（Task 2）、`parseDuration`、`restore`/`restoreExitCode`（Task 8）
- Produces:
  - `interface TimelineEvent { at: string; source: 'task' | 'patrol' | 'command'; actor: string; action: string; target: string | null; outcome: string | null; detail: unknown; id: string }` — `id` 形如 `task:12`（3B 的 SSE 事件 id）
  - `interface LogCursor { task: number; patrol: number; command: number }`
  - `readTimeline(deps: CommandDeps, a: { team: string; task?: string; post?: string; since?: string; limit?: number; source?: TimelineEvent['source'] }): { events: TimelineEvent[]; cursor: LogCursor }`
  - `readTimelineAfter(deps: CommandDeps, team: string, cursor: LogCursor, filter?: Pick<…, 'task' | 'post' | 'source'>): { events: TimelineEvent[]; cursor: LogCursor }`
  - `followTimeline(deps, a, emit: (e: TimelineEvent) => void, o: { intervalMs?: number; signal: AbortSignal; sleep?: (ms: number) => Promise<void> }): Promise<void>`
  - `parseSince(s: string, now: Date): string` — 时长或 ISO；否则 `duration_invalid`
- 映射规则见 spec 第 7.1 节；排序键 `(at, sourceOrder, id)`，`sourceOrder`：task 0、patrol 1、command 2。
- 每次 `readTimeline` 顺带 `pruneAudit(now - 30 天)`（失败只警告）。

- [x] **Step 1: 写失败测试**（`log.test.ts`）

```ts
test('merges the three sources by time and maps actor/target/action per spec', () => {
  // patrol 事件 actor 为 'dispatcher@duo'，带 signal 时 action 为 'no_progress/notify_lead'；task 事件 target 为 '<id>#<epoch>'
})
test('ties on the same timestamp sort task < patrol < command, then by id', () => {})
test('--task, --post, --source and --since filter; --limit keeps the newest n', () => {})
test('--since rejects garbage with duration_invalid', () => {})
test('follow emits only rows after the cursor, never twice, and stops on abort', async () => {
  // 三轮：第 1 轮后写 2 条、第 2 轮后写 0 条；emit 共被调 2 次；abort 后 promise resolve
})
test('unknown team → team_unknown', () => {})
```

标记不外泄（复审 I-2）：对 `ps`、`attention`、`log`、`restore` 的 `--json` 输出与 `audit_events.detail` 断言不含 `WLS-`。

CLI（`main.test.ts`）：`wl restore duo --json` 透传 `{ team, dryRun, noTasks, sessions }`（`--session builder=s1 --session checker=s2` → `{ builder: 's1', checker: 's2' }`；缺 `=` → 退出码 1）；`wl restore` 结果含 `ambiguous` 时退出码 3；`wl log duo` 每事件一行，形如 `10:00:01  命令  human  send  builder@duo  ok`，跨天插入日期行；`wl log duo --follow --json` 输出 NDJSON 并在 SIGINT 后退出码 0。

- [x] **Step 2: 运行确认失败。**
- [x] **Step 3: 实现** core 函数与 CLI：
  - `program.command('restore <team>')`：`--dry-run`、`--no-tasks`、`--session <post=id>`（可重复）、`--json`；`exitOf = restoreExitCode`；`renderRestore` 按“岗位 → Run → 调度员 → 任务”分节，`fresh` 行带“上下文已丢失”，`ambiguous` 行列出候选与 `wl restore <team> --session <post>=<id>`。
  - `program.command('log <team>')`：`--task`、`--post`、`--since`、`--limit`、`--source`、`--follow`、`--json`；`--follow` 用 `AbortController` 接 SIGINT/SIGTERM。
  - README 增加“重启之后：`wl restore`”与“时间线：`wl log`”两节（中文），说明 `fresh` 意味着上下文丢失、`--dry-run` 的用法、旧岗位没有标记的情形、开机自动恢复留到后续（3D）。
  - `test/live/duo.live.test.ts` 增加一个默认跳过的用例（`WL_LIVE_RESTART=1` 时运行）：`wl up` → 提示人重启 Orca → `wl restore` → 断言 `terminal show` 的 `preview` 含重启前发送的标记文本。
  - **实际（2026-10-21 复审注）：** 真机用例改为关闭 builder 终端来模拟终端丢失，Orca 桌面端完整重启后的接回**没有验证**；成功标准“Orca 完整重启后接回”仍是待验证项。
- [x] **Step 4: 运行确认通过** — `pnpm test` 全仓库 PASS（沙箱里已知的两例僵尸进程失败除外）；`pnpm typecheck` 通过。
- [x] **Step 5: 提交** — `git commit -m "feat(cli): wl restore and wl log"`
