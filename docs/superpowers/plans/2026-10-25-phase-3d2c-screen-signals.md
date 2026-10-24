# 阶段 3D-2（块 c）：读画面的巡查信号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调度员每轮从岗位终端读渲染后的画面，识别 Claude Code 的“上下文快满”（`context_low`）与“用量上限”（`usage_limit`）：通知一次、用量用完期间暂停“无进展”类升级、重置后在必要时提醒岗位继续。

**Architecture:** 画面信号走一个独立的小状态推进器（`screen-signals.ts`），不进 2B 的 `advancePatrol` 梯子：类型 `ScreenSignalKind` 不并入 `PatrolSignal`，清除循环显式跳过。每轮巡查先读各存活岗位的画面（`terminal read --screen --limit 40`，一次读出 `previews`，`quietScreens` 与画面信号共用），再 `advanceScreenSignals`，然后才是 `detectSignals` / `advancePatrol`。

**Tech Stack:** TypeScript、vitest、FakeOrca。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md` 第 4、8、11 节（块 c）。依据：探针 1（`terminal read --screen` 可用，`tail` 是行数组，屏幕行数由面板大小决定，窄面板会把长行截成 `…`）、探针 2 的**部分**结果（`spikes/REPORT.md` “3D-2（块 c）探针 2（部分）”：从 claude 2.1.310 程序本体取出的提示原文，**非截图**）。

## 与 spec 的差异（先读这一节）

1. **提示原文以程序本体为准，不用 spec 原稿的猜测**：上下文是红色的 `Context low (N% remaining)`（后缀 `· Run /compact to compact & continue` 或别的状态文字），不是 `Context left until auto-compact: N%`；用量上限以 `You've hit your <session limit｜weekly limit｜Opus limit｜Sonnet limit｜…>` 开头。**所有模式都是 provisional**：样本文件首行注明 `# source: claude 2.1.310 binary strings, not captured`，对应测试名带 `(provisional)`；取到真实画面后用 `spikes/phase-3d2.ts sample` 核对（Task 8）。
2. **Claude 2.1.310 会在限额重置后自己继续**（`Usage limit reached · continuing automatically {when} · esc to cancel`；取消后 `Automatic continue cancelled · /rate-limit-options to re-arm`）。画面上有 `continuing automatically` 时，到点**不发**“继续”（只保留通知与暂停升级）；没有，或已取消，才发。spec 第 4.3 节第 3 步已据此补充。
3. **`classifyPreview` 留在 `commands/task/notify.ts`**，不迁入 `screen/patterns.ts`：迁移只有改动量，没有行为收益。`detectScreen` 直接调用它，`ScreenState` 也不动。
4. 只有 Claude 有模式行；其它 agent（Codex 等）只返回 `guard`，不产生信号。

## Global Constraints

- 画面信号只通知与暂停升级；除“继续”提示（必须经 `screenGuard` 为 `clear`，走 `typeTo`）外不往终端打字；**从不冻结**。
- 读画面：`orca terminal read --terminal <h> --screen --limit 40`；回执的文本在 `terminal.tail`（行数组），必须检查 `terminal.source === 'screen'`，为 `screen-unavailable` 或读失败时该岗位本轮没有画面（`guard = unknown`、无信号），不影响其它信号。窗口按 `returnedLineCount`，不假定恰好 40 行。
- `detectScreen(agent, text, now)`：按 `/\r?\n/` 切行；`guard` 仍只看最后 8 行（`classifyPreview`）；信号看最后 `SIGNAL_TAIL_LINES = 40` 行；同一 `kind` 多处命中取最靠底部的一处；每个命中带 `notice`（命中那一行原文），`noticeHash = sha256(notice).slice(0, 12)`。
- 模式**锚定行首**（允许行首空白和 `⎿ ⏺ ● ·` 这类前导符号），对话正文里引用的提示文字（前面有别的字）不触发。窄面板把长行截断成 `…` 时，不完整的行不触发。
- `usage_limit`：状态行放 `patrol_state`（`signal = 'usage_limit'`，`task_id = ''`）；识别到（非首轮、没有同 `noticeHash` 的已处理行）→ 直接建 level 1 行，`next_due_at = resetsAt + 2 分钟`（`resetsAt` 为空取 `now + 1 小时`），通知一次（牵头岗经 `typeTo`，画面 `clear` 才打字；外部通知若配置；岗位就是牵头岗时只走外部通知与 `wl attention`）；文本 `[雁阵] <岗位> 用量已用完，预计 <HH:MM> 重置；期间不会提醒它`。首轮（重启后）只建 level 0 的观察行。
- 暂停：`next_due_at` 之前，该岗位的 `no_progress`、`owner_idle`、`overdue` 只观察、不升级（level 不变、不提示、不通知、不冻结）；暂停结束后从当前 level 继续，不补发。
- 到点（首轮观察期不做）：画面上同一条提示仍带 `continuing automatically` → 延期 10 分钟（`detail.extensions` +1，最多 3 次），不发“继续”；否则 `resetsAt` 已知 → 视为已重置，**不等提示消失**，经 `typeTo` 发 `[雁阵] 用量已重置，请继续手上的任务 <id>`（没有在办任务写 `[雁阵] 用量已重置，请继续`），发出（`ok` / `unconfirmed`）→ 清除行并记 `detail.resumedAt`；`resetsAt` 未知且同 `noticeHash` 的提示仍在 → 延期 1 小时（最多 3 次）；画面不是 `clear` 等原因没发出 → 保留行，下一轮再试，最多 3 轮，仍失败 → 清除行、记事件 `resume_skipped`，并通知人一次（`[雁阵] <岗位> 用量应已重置，但画面停在选项 / 确认框上，没有自动继续，请手动处理`，牵头岗时只走外部通知与 `wl attention`）。
- 去重：行清除后，同 `noticeHash` 的提示仍留在屏幕上不再触发；`noticeHash` 不同视为新识别。`noProgress`（`signals.ts`）的计时起点取 `max(原起点, usage_limit 行的 detail.resumedAt)`。
- `context_low`：`task_id = 'sk-' + sha256(session_marker + ':' + (session_id ?? '')).slice(0, 12)`（**会话标记的哈希，不是原文**，否则会进 `wl attention --json`）；`detail = { percent, noticeHash, notifiedAt }`；提示持续显示期间同一会话只通知一次（`[雁阵] <岗位> 上下文剩余 <N%>，可能即将自动压缩或需要换会话`）；清除（画面不再显示，或会话标记 / 会话 ID 变了）后再次出现复用同一行，距上次 `notifiedAt` 不足 `CONTEXT_RENOTIFY_MS`（1 小时）只恢复行、不通知。
- 首轮（调度员重启后）只观察：只建行、不通知、不暂停；暂停截止时间从注册表读回，重启不丢、不重复通知。
- `resetPatrolForPost`（解冻）跳过两种画面信号；`advancePatrol` 的清除循环跳过它们；画面信号不产生未读键。
- 新迁移 `ALTER TABLE patrol_state ADD COLUMN detail TEXT`（JSON）；`PatrolStateRow.detail: Record<string, unknown> | null`。
- 函数 ≤ 50 行；提交信息末尾附 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **对话正文里引用了提示文字**（`⏺ 屏幕底部写着 Context low (5% remaining)`、用户贴了 `You've hit your session limit`）：不触发。Task 2。
2. **窄面板把提示截断**（`Context low (1…`）：不完整的行不触发，也不会解析出错误的百分比。Task 2。
3. **自动继续已武装**时到点不发“继续”，取消后才发。Task 6。
4. **暂停期间调度员重启**：首轮只观察，暂停截止时间从注册表读回，不重复通知。Task 6。
5. **读画面失败 / `screen-unavailable`**：该岗位本轮没有画面信号，其它信号照常。Task 3、4。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `test/fixtures/screens/*.txt`、`.gitattributes` | 画面样本（provisional，`eol=lf`） |
| `packages/core/src/screen/reset-time.ts`（新） | `parseResetTime` |
| `packages/core/src/screen/patterns.ts`（新） | 模式表与 `detectScreen` |
| `packages/core/src/orca/{types,client}.ts`、`core/test/commands/fake-client.ts`、`core/src/commands/dispatcher/loop.ts` | `terminalRead`、`READ_ONLY_CALLS`、FakeOrca 的画面模型 |
| `packages/core/src/commands/dispatcher/signals.ts` | `ScanSnapshot.previews`，`quietScreens` 优先取它，`noProgress` 的基线 |
| `packages/core/src/registry/{migrations,registry}.ts` | `detail` 列、`ScreenSignalKind`、`resetPatrolForPost` 跳过 |
| `packages/core/src/commands/dispatcher/screen-signals.ts`（新） | `advanceScreenSignals`、`isUsagePaused` |
| `packages/core/src/commands/dispatcher/{advance,loop,orca-sync,attention}.ts`、`core/src/server/api-read.ts` | 清除循环跳过、暂停判定、接线、标签与 `summary`、岗位详情的信号 |
| `packages/web/src/pages/{Inbox,PostDetail}.tsx`、`packages/cli/src/{output.ts,tui/items.ts}` | 显示 `summary` |

---

### Task 1: 样本与重置时间解析

**Files:**
- Create: `test/fixtures/screens/claude-context-low.txt`、`claude-usage-limit.txt`、`claude-usage-limit-auto-resume.txt`、`claude-usage-limit-cancelled.txt`、`claude-quoted-text.txt`（负例）、`.gitattributes`（`test/fixtures/screens/*.txt text eol=lf`）、`packages/core/src/screen/reset-time.ts`
- Test: `packages/core/test/screen/reset-time.test.ts`

**Interfaces:**
- Produces: `parseResetTime(text: string, now: Date, tz?: string): Date | null` — 支持 `3pm`、`3:30pm`、`15:00`、括号时区 `(Asia/Shanghai)`、`in 2h`、`in 45m`；只有时刻没有日期时取“今天或明天中最早的未来时刻”；无时区用 `tz`，再不行用本机时区；解析不出 → `null`

样本文件每个首行 `# source: claude 2.1.310 binary strings, not captured`，后面是一个 40 行以内的屏幕：若干行对话正文，然后（视样本）底部的 `Context low (7% remaining) · Run /compact to compact & continue` 或 `You've hit your session limit · resets 3pm (Asia/Shanghai)` 等，再接 `────`、`❯`、`────` 和模式行 `⏵⏵ accept edits on (shift+tab to cycle)`。限额行里 `· resets …` 的写法是**假设**（没取到原文），样本里注明。

- [ ] **Step 1: 写失败测试**

```ts
test.each([
  ['resets 3pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-16T15:00:00+08:00'],
  ['resets 9am', '2026-10-16T10:00:00+08:00', 'Asia/Shanghai', '2026-10-17T09:00:00+08:00'],   // 已过去的时刻 → 明天
  ['resets 3:30pm', '2026-10-16T09:00:00+08:00', 'Asia/Shanghai', '2026-10-16T15:30:00+08:00'],
  ['resets 15:30 (Asia/Shanghai)', '2026-10-16T01:00:00Z', undefined, '2026-10-16T15:30:00+08:00'],
  ['try again in 45m', '2026-10-16T10:00:00Z', undefined, '2026-10-16T10:45:00Z'],
  ['resets in 2h', '2026-10-16T10:00:00Z', undefined, '2026-10-16T12:00:00Z'],
])('parseResetTime(%s) at %s [%s] → %s', (text, now, tz, want) => {
  expect(parseResetTime(text, new Date(now), tz)?.toISOString()).toBe(new Date(want).toISOString())
})
test('unparseable reset text → null; a 12am / 12pm edge is handled', () => {
  expect(parseResetTime('resets sometime soon', new Date(), 'UTC')).toBeNull()
  expect(parseResetTime('resets 12am', new Date('2026-10-16T10:00:00Z'), 'UTC')?.toISOString()).toBe('2026-10-17T00:00:00.000Z')
  expect(parseResetTime('resets 12pm', new Date('2026-10-16T10:00:00Z'), 'UTC')?.toISOString()).toBe('2026-10-16T12:00:00.000Z')
})
```
- [ ] **Step 2: 运行确认失败** — `vitest run packages/core/test/screen/reset-time.test.ts` → FAIL（模块不存在）。
- [ ] **Step 3: 实现** `parseResetTime`；用 `Intl.DateTimeFormat(..., { timeZone })` 求时区偏移，不引入依赖。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(screen): parseResetTime 与画面样本（provisional）"`

### Task 2: 模式表与 `detectScreen`

**Files:**
- Create: `packages/core/src/screen/patterns.ts`
- Test: `packages/core/test/screen/patterns.test.ts`

**Interfaces:**
- Consumes: `classifyPreview`（`commands/task/notify.ts`）、`parseResetTime`（Task 1）
- Produces:
  - `type ScreenSignal = { kind: 'context_low'; percent: number | null; notice: string; noticeHash: string } | { kind: 'usage_limit'; resetsAt: Date | null; autoResume: 'armed' | 'cancelled' | null; notice: string; noticeHash: string }`
  - `detectScreen(agent: string, text: string, now: Date): { guard: ScreenState; signals: ScreenSignal[] }` — 未知 agent 只返回 `guard`
  - `SIGNAL_TAIL_LINES = 40`

- [ ] **Step 1: 写失败测试**（样本从 `test/fixtures/screens/` 读，LF 与 CRLF 各喂一份；测试名带 `(provisional)`）

```ts
test('claude context-low sample → context_low 7 with the whole footer line as notice (provisional)', () => {
  const r = detectScreen('claude', sample('claude-context-low'), NOW)
  expect(r.signals).toEqual([expect.objectContaining({ kind: 'context_low', percent: 7, notice: expect.stringMatching(/^Context low \(7% remaining\)/) })])
})
test('claude usage-limit sample → usage_limit with the parsed reset time (provisional)', () => {
  const r = detectScreen('claude', sample('claude-usage-limit'), new Date('2026-10-16T09:00:00+08:00'))
  expect(r.signals).toEqual([expect.objectContaining({ kind: 'usage_limit', autoResume: null, notice: expect.stringMatching(/^You've hit your session limit/) })])
  expect((r.signals[0] as { resetsAt: Date | null }).resetsAt?.toISOString()).toBe(new Date('2026-10-16T15:00:00+08:00').toISOString())
})
test('auto-continue banner → autoResume armed; "Automatic continue cancelled" → cancelled (provisional)', () => {
  expect(detectScreen('claude', sample('claude-usage-limit-auto-resume'), NOW).signals[0]).toMatchObject({ kind: 'usage_limit', autoResume: 'armed' })
  expect(detectScreen('claude', sample('claude-usage-limit-cancelled'), NOW).signals[0]).toMatchObject({ kind: 'usage_limit', autoResume: 'cancelled' })
})
test('quoted or mid-line mentions in the conversation do not trigger (provisional)', () => {
  expect(detectScreen('claude', sample('claude-quoted-text'), NOW).signals).toEqual([])
})
test('a footer truncated by a narrow pane ("Context low (1…") does not trigger', () => {
  expect(detectScreen('claude', 'x\nContext low (1…\n❯', NOW).signals).toEqual([])
})
test('only the last 40 lines count; the bottom-most match of a kind wins', () => {})
test('unknown agent yields guard only; guard still looks at the last 8 lines (same as classifyPreview)', () => {
  expect(detectScreen('codex', sample('claude-context-low'), NOW).signals).toEqual([])
  expect(detectScreen('claude', 'Do you want to proceed?\n❯ 1. Yes', NOW).guard).toBe('at_prompt')
})
test('CRLF text gives the same result as LF', () => {})
```
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 模式：`context_low` 用 `/^[\s⎿⏺●·]*Context low \((\d{1,3})% remaining\)/`；`usage_limit` 用 `/^[\s⎿⏺●·]*You've hit your (?:session|weekly|Opus|Sonnet|Fable|usage credit) limit\b/` 与 `/^[\s⎿⏺●·]*You're out of (?:extra )?usage/`；自动继续看同窗口里以 `Usage limit reached` / `Continuing automatically` 打头的行（含 `continuing automatically` → armed），`Automatic continue cancelled` → cancelled；重置时间从命中行里交给 `parseResetTime`。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/task` 全部 PASS（`classifyPreview` 未动）。
- [ ] **Step 5: 提交** — `git commit -m "feat(screen): detectScreen 模式表（provisional）"`

### Task 3: `terminalRead` 与 FakeOrca 的画面模型

**Files:**
- Modify: `packages/core/src/orca/types.ts`、`orca/client.ts`、`packages/core/src/commands/dispatcher/loop.ts`（`READ_ONLY_CALLS` 加 `['terminal', 'read']`）、`packages/core/test/commands/fake-client.ts`
- Create: `test/fixtures/receipts/terminal-read.json`（从 `spikes/out/phase-3d2/darwin/read-screen-limit-8.json` 脱敏）
- Test: `packages/core/test/orca/client.test.ts`、`packages/core/test/commands/fake-client.test.ts`

**Interfaces:**
- Produces: `OrcaClient.terminalRead(a: { handle: string; lines: number }): Promise<{ text: string; rows: number }>` — argv `terminal read --terminal <h> --screen --limit <n>`；`text = terminal.tail.join('\n')`，`rows = terminal.returnedLineCount`；`terminal.source !== 'screen'`（含 `screen-unavailable`）→ 抛 `WinglineError('orca', 'screen_unavailable', …)`
- Produces（FakeOrca）：`screens: Map<handle, string>` 模型——`terminalRead` 返回其最后 `lines` 行；`terminalShow` 的 `preview` 改为取同一份文本的**末尾 300 个字符**（与真机一致，防止单测假绿）；没给 `screens` 的终端沿用 `previews`

- [ ] **Step 1: 写失败测试**：argv 与回执映射（用 `terminal-read.json`）、`source: 'screen-unavailable'` 抛 `screen_unavailable`；FakeOrca：60 行的屏幕 `terminalRead({ lines: 40 })` 恰好 40 行，`terminalShow` 的 `preview` 长度 ≤ 300 且读不到前面的行。
- [ ] **Step 2: 运行确认失败。** **Step 3: 实现。** **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(orca): terminalRead（terminal read --screen）与 FakeOrca 画面模型"`

### Task 4: 每轮读画面进 `previews`

**Files:**
- Modify: `packages/core/src/commands/dispatcher/signals.ts`（`ScanSnapshot.previews?: ReadonlyMap<string, string>`；`takeSnapshot` 对每个存活岗位读一次；`quietScreens` 优先取 `previews`，没有才回退 `screenGuard`）
- Test: `packages/core/test/commands/dispatcher/signals.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `terminalRead`
- Produces: `ScanSnapshot.previews`：handle → 文本（读失败 / `screen_unavailable` 的岗位没有条目）

- [ ] **Step 1: 写失败测试**：存活岗位各读一次且只读一次（`terminalRead` 调用次数 = 存活岗位数）；`quietScreens` 的候选岗位不再额外调 `terminalShow`；某岗位 `terminalRead` 抛错 → 它没有 `previews` 条目、其它岗位不受影响、扫描不中断；`screenGuard` 在“往终端打字之前”的即时检查中仍走 `terminalShow`（行为不变，原有测试照跑）。
- [ ] **Step 2–4:** 失败 → 实现 → 通过（连同 `packages/core/test/commands/dispatcher` 全部）。
- [ ] **Step 5: 提交** — `git commit -m "feat(patrol): 每轮读岗位画面进 previews，quietScreens 共用"`

### Task 5: 注册表——`detail` 列与 `ScreenSignalKind`

**Files:**
- Modify: `packages/core/src/registry/migrations.ts`（追加迁移）、`registry.ts`（`ScreenSignalKind`、`PatrolStateRow.signal: PatrolSignal | ScreenSignalKind`、`detail`、`putPatrolState`/`patrolRow`、`resetPatrolForPost` 加 `AND signal NOT IN ('context_low', 'usage_limit')`）、`commands/dispatcher/orca-sync.ts`（`SIGNAL_LABEL` 与 `postLine` 的类型随之扩展：`上下文快满`、`用量用完`）、`commands/dispatcher/advance.ts`（清除循环跳过画面信号）
- Test: `packages/core/test/registry/migrate-3d2c.test.ts`、`packages/core/test/registry/patrol.review.test.ts` 及 `orca-sync.test.ts`（“SIGNAL_LABEL names every patrol signal” 的键列表更新）

**Interfaces:**
- Produces: `type ScreenSignalKind = 'context_low' | 'usage_limit'`；`PatrolStateRow.detail: Record<string, unknown> | null`

- [ ] **Step 1: 写失败测试**：从上一版数据库升级后有 `detail` 列且原有行 `detail = null`；`detail` 往返；`resetPatrolForPost` 不清画面信号行、清其它行；两轮扫描后画面信号行**仍未清除**（`advancePatrol` 不碰它）；`pnpm typecheck` 枚举出的类型使用点都已处理。
- [ ] **Step 2–4:** 失败 → 实现 → 通过。
- [ ] **Step 5: 提交** — `git commit -m "feat(registry): patrol_state.detail 与画面信号类型"`

### Task 6: 画面信号的状态推进

**Files:**
- Create: `packages/core/src/commands/dispatcher/screen-signals.ts`
- Modify: `packages/core/src/commands/dispatcher/advance.ts`（`step()` 里暂停判定）、`signals.ts`（`noProgress` 的基线）、`loop.ts`（`scan()` 里在 `detectSignals` 之前调用）
- Test: `packages/core/test/commands/dispatcher/screen-signals.test.ts`、`screen-signals.flow.test.ts`

**Interfaces:**
- Consumes: `detectScreen`（Task 2）、`ScanSnapshot.previews`（Task 4）、`notifyHuman`、`typeTo`、`registry.getPatrolState/putPatrolState`、`posts.session_marker/session_id`
- Produces:
  - `advanceScreenSignals(deps: CommandDeps, ctx: { team: TeamRow; spec: TeamSpec }, snap: ScanSnapshot, o: { observeOnly: boolean; io?: OutletIo }): Promise<void>` — 永不抛出
  - `isUsagePaused(registry: Registry, team: string, post: string, now: Date): boolean`
  - 常量 `CONTEXT_RENOTIFY_MS = 3_600_000`、`AUTO_RESUME_GRACE_MS = 600_000`

- [ ] **Step 1: 写失败测试**（FakeOrca + `clock()`，`mkDeps(o, { now: c.now, monotonic: c.monotonic })`；`o.screens` 给出画面）

```ts
// 沿用 orca-sync.test.ts 的 world() 写法：FakeOrca + seedRunningTeam + clock()；牵头岗 builder@duo，被观察的岗位 checker@duo（term-c）。
// o.screens.set('term-c', screen) 给出画面；w.scan() = 时钟前进一个巡查周期后 loopOnce；w.sentTo(handle) = o.sent 里发给该终端的文本。
const limit = (extra = '') => [...BODY, "You've hit your session limit · resets 3pm", extra, '────', '❯', '────', '  ⏵⏵ accept edits on (shift+tab to cycle)'].join('\n')

test('usage limit: the lead is notified once and the row survives later scans (advancePatrol does not clear it)', async () => {
  const w = world(); w.o.screens.set('term-c', limit())
  await w.scan() // 首轮只观察：建 level 0 的行，不通知
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')).toMatchObject({ level: 0, clearedAt: null })
  expect(w.sentTo('term-b').filter((t) => t.includes('用量已用完'))).toEqual([])
  await w.scan(); await w.scan()
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')).toMatchObject({ level: 1, clearedAt: null })
  expect(w.sentTo('term-b').filter((t) => t.includes('用量已用完'))).toHaveLength(1)
  expect(w.registry.getFrozen('checker@duo')).toBeNull()
})

test('while paused, no_progress is observed but never escalates; after the pause it continues from its level without catching up', async () => {
  const w = world(); w.dispatchTo('checker@duo', 'term-c', { quietForMin: 60 }) // 有在办任务、终端 60 分钟没输出
  w.o.screens.set('term-c', limit('(reset in 2h)')); w.setNow('2026-10-16T09:00:00+08:00')
  await w.scan(); await w.scan(); await w.scan()
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', w.taskId)).toMatchObject({ level: 0 })
  expect(w.sentTo('term-c')).toEqual([]) // 暂停期间不发无进展提示
  w.advanceTo('2026-10-16T15:05:00+08:00'); w.o.screens.set('term-c', '❯ ')
  await w.scan(); await w.scan()
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'no_progress', w.taskId)!.level).toBeLessThanOrEqual(1)
})

test('at reset with no auto-continue banner: one continue line is typed, the row is cleared with resumedAt, and no_progress counts from resumedAt', async () => {
  const w = world(); w.dispatchTo('checker@duo', 'term-c', { quietForMin: 60 })
  w.o.screens.set('term-c', limit()); w.setNow('2026-10-16T09:00:00+08:00')
  await w.scan(); await w.scan()
  w.advanceTo('2026-10-16T15:03:00+08:00'); w.o.screens.set('term-c', limit()) // 提示仍留屏，但 resetsAt 已知：到点即发
  await w.scan()
  expect(w.sentTo('term-c').filter((t) => t.includes('用量已重置，请继续手上的任务'))).toHaveLength(1)
  const row = w.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')!
  expect(row.clearedAt).not.toBeNull()
  expect(row.detail).toMatchObject({ resumedAt: expect.any(String) })
  await w.scan() // 同一刻 no_progress 不会马上追加提示：计时从 resumedAt 重新开始
  expect(w.sentTo('term-c').filter((t) => t.includes('巡查提示'))).toEqual([])
})

test('at reset with "continuing automatically" on screen: no continue line, due time pushed 10 minutes, at most 3 times; "Automatic continue cancelled" then gets the line', async () => {
  const w = world(); w.o.screens.set('term-c', limit('Usage limit reached · continuing automatically at 3pm · esc to cancel')); w.setNow('2026-10-16T09:00:00+08:00')
  await w.scan(); await w.scan()
  w.advanceTo('2026-10-16T15:03:00+08:00')
  await w.scan()
  expect(w.sentTo('term-c')).toEqual([])
  expect(w.registry.getPatrolState('duo', 'checker@duo', 'usage_limit', '')!.detail).toMatchObject({ extensions: 1 })
  w.o.screens.set('term-c', limit('Automatic continue cancelled · /rate-limit-options to re-arm'))
  w.advanceTo('2026-10-16T15:14:00+08:00')
  await w.scan()
  expect(w.sentTo('term-c').filter((t) => t.includes('用量已重置'))).toHaveLength(1)
})

// 其余用例（每条都要有断言，写法同上）：
//  · reset time unknown：暂停到 now+1h；同 noticeHash 的提示还在 → 延期 1 小时，最多 3 次，第 4 次按“已重置”处理。
//  · 画面不是 clear（确认框 / /rate-limit-options 菜单）：不打字，保留行最多 3 轮；第 3 轮后 resume_skipped 事件恰好一条、牵头岗收到一条“请手动处理”。
//  · 行清除后同 noticeHash 的提示仍在屏幕上不再触发；noticeHash 不同视为新识别并重新通知。
//  · 牵头岗用完：o.sent 里没有发给牵头岗自己的通知，patrol_events 有外部通知的记录，wl attention 能看到这一行。
//  · context_low：一次通知；换会话标记后旧行被清除、attention 里只有一条；行键与 detail 里没有会话标记原文（用 JSON.stringify 断言不含 'WLS-'）。
//  · context_low 在 CONTEXT_RENOTIFY_MS 内再次出现只恢复行不通知，之后再出现重新通知（时钟前进 59 / 61 分钟）。
//  · 重启后首轮只观察，暂停截止时间从注册表读回：新建 LoopState（initialState）再扫描，不重复通知，到点仍然发“继续”。
//  · 某岗位 terminalRead 抛错：该岗位没有信号，其它岗位的信号照常；扫描不中断。
```
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 把识别、通知、到点处理拆成小函数，每个 ≤ 50 行；`step()` 里对 `no_progress` / `owner_idle` / `overdue` 在 `isUsagePaused` 为真时直接返回。
- [ ] **Step 4: 运行确认通过** — 连同 `packages/core/test/commands/dispatcher` 全部 PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(patrol): context_low 与 usage_limit 画面信号（含自动继续）"`

### Task 7: 展示

**Files:**
- Modify: `packages/core/src/commands/dispatcher/attention.ts`（`AttentionReport.signals` 的行多带 `detail` 与服务端算好的 `summary`：`剩余 5%`、`预计 15:00 重置`、`重置后会自动继续`）、`orca-sync.ts`（卡片注释 `⚠ 上下文快满`、`⚠ 用量用完（15:00 重置）`；同一岗位多个信号取舍：level 高者优先，同级 `usage_limit` 优先，其次 `LADDERS` 声明顺序，`context_low` 最后）、`packages/core/src/server/api-read.ts:138`（`listPatrolState(address)` 把岗位地址当团队名传，岗位详情的信号恒为空——必须先修）、`packages/web/src/pages/{Inbox,PostDetail}.tsx`、`packages/cli/src/{output.ts,tui/items.ts}`
- Test: `attention.test.ts`、`orca-sync.test.ts`（显式打开 `worktree_comment`）、`api-read.test.ts`、`packages/web/test/pages.test.tsx`、`packages/cli/test/`

- [ ] **Step 1: 写失败测试**：`wl attention --json` 里画面信号行带 `summary` 且 `detail` 不含会话标记原文；岗位详情现在能列出该岗位的信号（修复 `api-read.ts:138`）；多信号取舍规则；Inbox / 岗位详情 / TUI 都显示 `summary` 而不是各自解析。
- [ ] **Step 2–4:** 失败 → 实现 → 通过。
- [ ] **Step 5: 提交** — `git commit -m "feat(attention): 画面信号的摘要与展示，修复岗位详情的信号取数"`

### Task 8: 文档与真机核对

- [ ] README：`wl attention` 的“处理中的信号”里多了哪两种、含义、暂停与自动继续的规则；写明模式依据 claude 2.1.310，换版本后若不触发先看 `spikes/REPORT.md`。
- [ ] **真机核对（取真实画面）**：用 `spikes/phase-3d2.ts sample <handle> claude-context-low` / `claude-usage-limit` 在画面真的出现这两种提示时存样本（入库前人工检查有无对话内容与敏感信息），替换 provisional 样本，核对：模式是否仍然匹配、`·  resets …` 的真实写法、提示在画面里的位置（是否在最后 40 行内）、窄面板的截断、限额时有没有弹 `/rate-limit-options` 菜单、重置后提示是否留屏、自动继续的 `{when}` 写法。
- [ ] **端到端**：调度员运行时对真实 claude 观察一次 `context_low`（把 `autocompact` 阈值调低或灌入长上下文）；`usage_limit` 无法主动触发，依赖真实遇到或手工往终端打一行样本文字（只能验证识别与暂停，验证不了 Claude 自己的自动继续）。
- [ ] 结果记入 `spikes/REPORT.md`，把 provisional 标记按核对结果改掉；提交 — `git commit -m "docs: 画面信号的说明与真机结果"`
