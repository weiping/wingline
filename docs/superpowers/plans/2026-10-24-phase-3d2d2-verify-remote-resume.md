# 3D-2（块 d）补充：核对远端岗位真的接回了原会话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写了 `environment` 的岗位接回后，`wl restore` 核对“接回提示”确实落进了要接回的那个会话；落进了别的会话（包装脚本没透传 `--resume`，VM 里起的是全新会话）就报 `uncertain`，不再静默地声称接回成功。

> **状态（2026-10-24）：已实现并在 Lima 真机上验证**（Task 1–3；全量 115 个文件、1598 个用例通过）。真机暴露了标识会重复的缺陷，已改为并入会话标记（`resumeToken`），见 `spikes/REPORT.md` “续二”。

**起因:** 真机反例（`spikes/REPORT.md` “包装脚本不透传参数的反例”）：包装脚本丢掉 `--resume <id>` 时，VM 里起的是同样空闲的全新 claude，`restore` 报“已接回原会话”、退出码 0、岗位 `live`，接回提示落进了新会话。

**Architecture:** 只动 `restore/posts.ts` 的 `settleResume`。远端岗位的接回提示末尾带一个**每次接回唯一**的标识 `WLR-<8 位十六进制>`（由该次接回的请求键哈希得到，重试时不变）；发出后用 `orca search --environment` 按标识搜，看命中它的会话 ID 是不是要接回的那个。

**Tech Stack:** TypeScript、vitest、FakeOrca。

**Spec:** `docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md` 第 5.4 节（本次新增）。

## Global Constraints

- 只对写了 `environment` 的岗位核对；本机岗位的提示文字与行为不变（既有测试的断言不改）。
- 提示里必须有每次接回唯一的标识：接回提示原文每次相同，原会话里可能早就有同样的提示（之前某次真接回留下的），不带标识会让“又丢了上下文”的这一次被旧提示误判为通过。
- 标识形如 `WLR-` 加 8 位小写十六进制（与 `WLS-` 标记同形，已知能被 `orca search` 的整串高亮闸处理）；由 `restoreKey(team, post, gen, 'notice')` 的 sha256 取前 8 位，同一次接回重试时不变。
- 核对用 `findSession` 同款的整串高亮闸（`markerHighlighted`）；命中集合里有要接回的会话 → 通过；命中了别的会话但没有它 → `uncertain`；没有命中（索引延迟、搜索失败）→ 仍报 `resumed`，附 `note` 说明没能核对，**不因为核对不了而让接回失败**。
- 最多搜 3 次、间隔 2 秒（`--fresh` 本身最多等 5 秒）；测试可注入次数与间隔。
- 不通过时：岗位记为 `uncertain`，`reason` 写明落进了哪个会话、很可能是包装脚本没透传 `--resume`、修好后关掉该岗位终端再 `wl restore`；已缓存的 `session_id` 保留（原会话仍然是对的）。
- 函数 ≤ 50 行；提交信息末尾附 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **原会话里已有旧的接回提示**（上一次真接回留下）：这一次丢了 `--resume`，仍要判为不通过。测试在 Task 1。
2. **索引还没跟上**（搜不到）：不能把接回判成失败，也不能静默：`resumed` 加 `note`。Task 1。
3. **搜索本身出错**（环境断了）：同上，`note`，不抛。Task 1。
4. **本机岗位**：提示原文不变，不搜索。Task 2。
5. **提示没发出去**（画面不是 clear）：没有可核对的东西，不搜索。Task 2。

---

### Task 1: 标识与核对函数

**Files:**
- Modify: `packages/core/src/commands/restore/posts.ts`
- Test: `packages/core/test/commands/restore/posts.test.ts`

**Interfaces:**
- Produces:
  - `noticeToken(requestKey: string): string` — `'WLR-' + sha256(requestKey).slice(0, 8)`
  - `resumeNotice(address: string, token?: string): string` — 无 token 时与现在的文字完全一致；有 token 时末尾追加 `（接回标识 ${token}）`
  - `type Landing = { kind: 'confirmed' } | { kind: 'mismatch'; landed: string[] } | { kind: 'unknown'; why: string }`
  - `verifyLanding(deps: CommandDeps, a: { agent: string; environment: string; token: string; expected: string }, o: { tries: number; pauseMs: number }): Promise<Landing>`

- [ ] **Step 1: 写失败测试**

```ts
test('noticeToken is WLR- plus 8 hex, stable for one key and different across restore generations', () => {
  const k0 = restoreKey('duo', 'builder', 0, 'notice')
  expect(noticeToken(k0)).toMatch(/^WLR-[0-9a-f]{8}$/)
  expect(noticeToken(k0)).toBe(noticeToken(k0))
  expect(noticeToken(k0)).not.toBe(noticeToken(restoreKey('duo', 'builder', 1, 'notice')))
})
test('resumeNotice without a token is exactly the old text; with one it ends with the token', () => {
  expect(resumeNotice('builder@duo')).toBe('[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。')
  expect(resumeNotice('builder@duo', 'WLR-1a2b3c4d')).toBe('[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。（接回标识 WLR-1a2b3c4d）')
})
test('verifyLanding: confirmed when the token landed in the expected session; mismatch when only in others; an old notice in the expected session does not count', async () => {
  // o.sessions 里放 { marker: token, sessionId, environment }；原会话 s-old 里另有一个旧标识
})
test('verifyLanding: no hit after the tries, or a failing search, is unknown (never throws)', async () => {})
test('verifyLanding retries until the index catches up', async () => {
  // 第一次 sessions 为空、第二次出现：用 o.faults 或在 pauseMs 回调里 push sessions
})
```
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现** 上述四个导出；`verifyLanding` 内部复用 `markerHighlighted`，搜索失败（`WinglineError`）记为 `unknown`。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): 接回提示的唯一标识与落点核对"`

### Task 2: 接进 `settleResume` 与展示

**Files:**
- Modify: `packages/core/src/commands/restore/posts.ts`（`settleResume` 增加 `environment?`，`restorePost` 的 `o` 增加 `verify?: { tries: number; pauseMs: number }`；`RestorePost` 增加 `note?: string`）、`packages/cli/src/output.ts`（`restorePostLines` 显示 `note`）
- Test: `packages/core/test/commands/restore/posts.test.ts`、`packages/cli/test/main.test.ts`

**Interfaces:**
- Consumes: Task 1 的四个导出
- Produces: 远端岗位接回后的结果：通过 → `{ outcome: 'resumed', sessionId }`；没能核对 → 加 `note`；不通过 → `{ outcome: 'uncertain', sessionId, reason, retry }`

- [ ] **Step 1: 写失败测试**（沿用文件里 3D-2 的 `seed(o, {}, ENV_YAML)`；标识用 `noticeToken(restoreKey('duo','builder',0,'notice'))` 算出，不写死）

```ts
test('remote post: the notice carries the token, and when it landed in the resumed session the result is a plain resumed', async () => {
  // o.sessions: 原会话 vm-1（接回用）；另外放 { marker: token, sessionId: 'vm-1', environment } 模拟落点正确
  expect(r).toEqual({ address: 'builder@duo', outcome: 'resumed', sessionId: 'vm-1' })
  expect(s.o.sent.at(-1)!.text).toBe(resumeNotice('builder@duo', token))
})
test('remote post: the notice landing in another session (wrapper dropped --resume) is uncertain, names both sessions, keeps the cached session id', async () => {
  // 标识只出现在 'vm-new' 里
  expect(r).toMatchObject({ outcome: 'uncertain', sessionId: 'vm-1', retry: 'wl restore duo' })
  expect(r.reason).toContain('vm-new'); expect(r.reason).toContain('--resume')
  expect(s.registry.getPost('builder@duo')!.status).toBe('uncertain')
  expect(s.registry.getPost('builder@duo')!.sessionId).toBe('vm-1')
})
test('remote post: nothing found or the search fails is resumed with a note, not a failure', async () => {})
test('remote post: an old notice in the resumed session does not make a dropped --resume pass (the token differs per restore generation)', async () => {})
test('local post: the notice text is unchanged and no verification search runs', async () => {
  expect(s.o.sent).toEqual([{ handle: 'term-1', text: '[雁阵] 重启后已接回本会话，你的地址仍是 builder@duo。', retryRequest: undefined }])
  expect(s.o.searches).toHaveLength(1) // 只有按标记找会话的那一次
})
test('remote post: when the notice is skipped (screen not clear) there is nothing to verify', async () => {})
```
CLI：`restorePostLines` 把 `note` 显示在岗位行下面（`注：…`），`uncertain` 的退出码仍是 3。

- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**；`settleResume` 里发提示前后的逻辑拆出 `sendNotice` 与 `landingResult` 两个小函数，保持每个 ≤ 50 行。
- [ ] **Step 4: 运行确认通过** — `tsc -p tsconfig.typecheck.json` 与全量 `vitest run`。
- [ ] **Step 5: 提交** — `git commit -m "feat(restore): 远端岗位接回后核对提示落进了原会话"`

### Task 3: 文档与真机

- [ ] spec 新增第 5.4 节；README 把“后果是静默的”改成“`wl restore` 会核对，落进别的会话会报 `uncertain`”，保留自查办法；`spikes/REPORT.md` 记录真机结果。
- [ ] **真机**（人或 Claude 在有 `lima-agent` 的机器上做）：(1) 透传的包装脚本：`wl restore` 报 `resumed` 且不带 `note`；(2) 不透传的包装脚本：报 `uncertain`，原因里写出新会话 ID；(3) 两种情形下 `orca search --environment` 能在几秒内搜到带标识的提示（决定 3 次 × 2 秒够不够）。
- [ ] 提交 — `git commit -m "docs: 远端接回核对的说明与真机结果"`
