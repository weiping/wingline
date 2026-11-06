# 雁阵 Wingline × Orca 插件：完整控制台进侧栏（草案）

- 日期：2026-11-06
- 状态：**草案（待评审）** — 由用户选定「完整控制台进侧栏」+「worker 直连 `@weiping/wingline-core`」后起草
- 范围：用 Orca **1.4.250+** 插件 API（`manifestVersion: 2`、`execution: trusted-worker`、`ui: components` / 必要时 HTML）把 **3B/3C/3E 控制台能力**放进 Orca 侧栏；业务逻辑复用 core，不经 `wl console` HTTP
- 依赖：3B（控制台能力与审计）、3C（编辑器）、3E（全生命周期 UI 意图）、本机 Orca ≥ **1.4.248**（hooks / statusBar / `workspace:write` / `terminal:read` 等）
- 承接：总纲 §5.4「不做成 Orca 插件」的 **废止条件**；旧理由基于 **插件 API v0**
- **已决（2026-11-06，用户「按推荐默认」）**：
  1. Phase 1 **允许编辑器暂留** `wl console` / CLI（面板显示「请用 wl console / CLI」），Phase 3 再迁；
  2. audit `actor` **统一 `human`**，与 CLI / 旧 console 完全一致；插件来源不单独标记（若日后要区分，再加可选设置）；
  3. 包形态：**只进仓库** `packages/orca-plugin`（`@weiping/wingline-orca`，先 `private`），**P4 前不发布 npm / catalog**，只用 `orca plugin dev load` 开发加载；
  4. 总纲 §5.4 **暂不改写**，等 **P0 探针通过**后再动（避免先改总纲后被证伪）。

---

## 1. 背景：旧约束 vs 新 API

总纲 §5.4（2026-10-10）拒绝做成插件的理由（**API v0**）：

| 旧约束 | Orca **1.4.250** 现状 |
|--------|----------------------|
| 面板 CSP `connect-src 'none'`，几乎不能说话 | 仍成立于 **帧/面板**；**worker** 是独立 Node 进程，可 `import` core、调本机资源 |
| 面板只能 `workspace.readContext` / `terminal.sendText` / `notifications.show` | 面板可 `plugin.request` → worker；worker 可经 **capabilities** 使用 `terminal:*`、`workspace:*`、`agent:*`、storage/settings/secrets |
| **面板与 worker 无通道** | **`plugin.request` / `orca.panels.post`**（`worker-panel` 模板） |
| 安装按内容哈希校验 | 仍在；开发用 `orca plugin dev load --approve <fingerprint>` |

**结论**：§5.4 的「做不成完整控制台」在 v0 成立；在 **trusted-worker + components** 下可重开。本草案 **不推翻**「不 fork Orca、不读 Orca 内部文件」——仍然只走 **wingline-core → `orca … --json`**（与 CLI/console 相同路径），只是宿主从「本机 HTTP + tab」换成「Orca 侧栏 + worker」。

---

## 2. 目标与非目标

### 2.1 目标

1. **侧栏内完整控制台**：覆盖 3B/3E 意图的页面面（总览、收件箱、任务看板/详情、岗位详情、时间线、团队编辑、设置/关于、生命周期按钮），人不必再记一串 `wl`，也不必先起 `wl console`。
2. **单一业务实现**：写路径一律经 core 的 **`auditedCommands` / `WriteCommands`**（执行者 `human` 或插件专用 actor，见 §6）；与 CLI / 旧 console **结果一致**，进同一 `audit_events`。
3. **Orca 原生粘合**：点岗位 → `workspace.open` / 聚焦终端；状态条展示未读/冻结；可选 hooks 防误操作（后置）。
4. **可审批、可回滚**：插件需用户 `--approve`；`wl console` **保留为兼容与无 Orca 场景**，不在本阶段删除。

### 2.2 非目标

- 不在面板里嵌 **WebTTY**（岗位交互仍归 Orca 终端）。
- 不做远程多机控制台（仍是本机团队账本 + 本机/已配对 Orca）。
- 不把 MCP / skills / task sources 伪造成插件贡献（Orca 仍 reserved）。
- 本阶段不强制退役 `wl console`；仅约定 **功能奇偶** 与迁移路径。

### 2.3 反目标

- **严禁**面板或 worker 绕过审计直接改 `state.db`。
- **严禁**对 `uncertain` / 504 等价结果自动重试（须人确认 + 原 `retryRequest`）。
- **严禁**把密钥写入 manifest / 提交物；settings/secrets 走 `settings:own` / `secrets:own`。
- **严禁**在未获用户对 **本版 fingerprint** 同意时代为 `--approve`。

---

## 3. 选定架构（已拍板）

| 决策 | 选择 | 含义 |
|------|------|------|
| 产品形态 | **完整控制台进侧栏** | 不是「状态壳 + 外链 console」 |
| 数据面 | **worker 直连 `@weiping/wingline-core`** | 不经 `127.0.0.1` console HTTP |
| UI | 优先 **`ui: "components"`**；重编辑/大表不够用时单页可降级 **HTML panel** | 零构建 TSX；复杂画布另议 |
| 执行档 | **`trusted-worker`** | `main` + panels + commands +（可选）statusBar / hooks |

```text
┌─────────────────────────────────────────────┐
│ Orca 侧栏 Panel (components / html)         │
│  atom 状态 · Table/List · 按钮 →            │
│              plugin.request(name, input)    │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│ Plugin Worker (Node, activate(orca))        │
│  orca.panels.handle → WinglineHost facade   │
│  import audited WriteCommands + 只读查询    │
│  createOrcaClient / createOrcaRunner        │
│  （子进程 orca CLI，与 wl 相同）              │
└─────────────────────┬───────────────────────┘
                      │
          ~/.wingline / state.db / teams/
```

**与旧「禁止插件后门跑子进程」的关系**：总纲曾反对用插件 worker 缺沙箱去乱起进程。本方案 **显式** 要求用户批准 `trusted-worker`；worker **只**通过 wingline-core 已有的 Orca 客户端调用 `orca … --json`，不引入第二套编排器。评审须接受：**插件 = 带 UI 的另一条 `wl` 入口**。

---

## 4. 包与仓库布局（建议）

```text
wingline/
  packages/
    core/                 # 不变；导出供插件使用的稳定 API（见 §5）
    cli/                  # wl console 保留
    orca-plugin/          # 新增 workspace 包（名暂定 @weiping/wingline-orca）
      orca-plugin.json
      src/
        main.ts           # activate(orca)
        protocol.ts       # PluginRequests / PluginPanelEvents
        host.ts           # 组装 Registry、OrcaClient、auditedCommands
        panels/
          shell.tsx       # 路由壳：导航 + 当前页
          overview.tsx
          inbox.tsx
          board.tsx
          task.tsx
          post.tsx
          timeline.tsx
          edit.tsx
          settings.tsx
        panels/*.check.ts
        *.test.ts
      .orca/              # generated types；勿手改
```

- **`engines.orca`: `>=1.4.248`**（若用 statusBar / hooks / `replaces`）；至少 **`>=1.4.246`**（components + 无 publisher）。
- **`id`**: `wingline`（安装键 `local.wingline` 或 Git owner 派生）；**禁止** `orca-` 前缀。
- 发布：GitHub + `orca-plugin` topic；与 npm `@weiping/wingline` **解耦版本号**，但 core 用 **peer 或 bundled 同版本**，避免协议漂移。
- **按已决 3**：本包先 `private: true`、**不进 publish 流程**；`dependencies: { "@weiping/wingline-core": "workspace:^" }` 走 pnpm workspace 链接（dev 加载时 Node 直接解析），发布前再改为打包（`--external:orca` 思路）或声明 peer。

---

## 5. core 对外稳定面（插件专用）

插件 **禁止** 深依赖 cli 私有模块。在 `@weiping/wingline-core`（或薄包 `@weiping/wingline-host`）明确导出：

1. **只读**：与 console GET 等价的查询（attention、ps、tasks、timeline、team list、dispatcher health…）——优先复用 `packages/core/src/server/` 已抽逻辑，或抽 `createConsoleQueries(deps)`。
2. **写入**：与 3B/3E 相同的 `WriteCommands` + `auditedCommands(..., { actor: 'human' | 'orca-plugin' })`。
3. **Deps 工厂**：`createPluginDeps({ winglineHome, orcaPath, signal })` → Registry、OrcaRunner、路径。

若现有 API 绑在 HTTP 层：本阶段 **抽一层纯函数/命令对象**，HTTP 与插件 **共用**；禁止在 worker 里复制一份业务。

---

## 6. 协议（`src/protocol.ts`）

声明式请求（示意，落地以类型为准）：

| request | 用途 |
|---------|------|
| `teams.list` / `team.snapshot` | 总览 |
| `attention.list` | 收件箱 |
| `tasks.list` / `task.get` | 看板/详情 |
| `post.get` / `post.screen` | 岗位（只读预览文本仍可由 core 提供） |
| `timeline.query` | 时间线 |
| `spec.get` / `spec.plan` / `spec.save` | 3C 编辑 |
| `write.*` | 冻结、回答、claim/done、up/down/restore…（参数对齐 CLI） |
| `orca.focusPost` | worker 调 `workspace.open` / 终端聚焦（需 capability） |

Worker → Panel 事件：`team.changed`、`attention.changed`、`task.changed`（可用轮询 core + `panels.post`，或订阅 registry/文件；**禁止**面板自行轮询磁盘）。

**Actor**：`human`（已决 2）——与 CLI / 旧 console 一致，同写同一 `audit_events`。

---

## 7. UI 映射

| 页面 | 面板实现 | 备注 |
|------|----------|------|
| 壳 + 导航 | `components` | Tabs / List；未读 Badge |
| 总览 / 收件箱 / 看板 / 时间线 | `components` + Table | 大数据量分页走 request |
| 任务/岗位详情 | `components` | 「打开终端」→ worker host API |
| 团队编辑 | **优先 HTML** 或拆步 components | 3C 双视图复杂；可第一期「打开外部编辑器 / 仍链到 console 编辑页」为退路 |
| 设置 | `contributes.settings` + 面板 | `WINGLINE_HOME`、orca 路径、默认团队 |

第一期 **奇偶优先**：只读 + 收件箱写操作 + 任务流五步 + up/down/restore；**编辑器与 3E 新建模板**可标 Phase 2，避免面板复杂度阻塞。

> 用户选定「完整控制台」：Phase 1 验收仍须 **列出 3E 按钮矩阵的覆盖表**；未做项必须在面板显示「请用 wl console / CLI」而不是静默缺失。

---

## 8. Capabilities 与审批文案

| Capability | 用途 |
|------------|------|
| `storage:own` | 面板原子 / 草稿 |
| `settings:own` | 路径与偏好 |
| `notifications:show` | 冻结、闸门失败 |
| `workspace:read` | 上下文、事件 |
| `workspace:write` | 打开工作区/文件、跑内置 action |
| `terminal:read` | 岗位输出预览（若不用 core 截屏路径） |
| `terminal:send` | 「给岗位发消息」若走 Orca 而非仅 core |
| `agent:read` | 状态条 |

加载时 `error.data` 须让用户看懂：**将读写 `~/.wingline`，并以本机 `orca` 创建/发送终端**。  
内容变更 → 新 fingerprint → 重新批准。

---

## 9. 与 `wl console` 共存

| 场景 | 行为 |
|------|------|
| 有 Orca 桌面 | 主路径：侧栏插件 |
| 无 Orca / CI / 纯 SSH shell | 继续 `wl console` |
| 两边同时开 | 同库同审计；写冲突靠现有 DB/命令语义，不做分布式锁 |
| `--open` | 可改为「若插件已启用则 `orca plugin open wingline`，否则旧 tab」 |

---

## 10. 探针（阻塞实现）

在 `spikes/` 增加并记入 `spikes/REPORT.md`：

1. **`plugin-core-import`**：最小 worker `import` wingline-core，列团队，不崩、路径正确。
2. **`plugin-orca-runner`**：worker 内 `terminal list --json` 经 core 成功（审批后）。
3. **`plugin-request-roundtrip`**：components 面板 `plugin.request` ↔ handle，超 1MiB 边界有文档策略。
4. **`plugin-audit-parity`**：同一次 freeze，CLI 与插件各一次，audit 字段可区分 actor、业务结果一致。
5. **`plugin-edit-feasibility`**：3C 编辑在 components 是否不可接受 → 决定 HTML 或 Phase 2。

任一 **1–4 不成立** → 降级方案：**壳插件 + 仍调 console HTTP**（用户曾否决为默认，仅作退路）。

---

## 11. 实现阶段

| 阶段 | 交付 | 验收 |
|------|------|------|
| **P0** | `orca-plugin` scaffold、`protocol` 骨架、探针 1–3 | `plugin validate` / `plugin test` 绿 |
| **P1** | 总览、收件箱、看板、详情只读 + 收件箱写 + 打开终端 | 真机团队可值班 |
| **P2** | 任务五步、up/down/restore、dispatcher、statusBar 未读 | 对齐 3E 按钮矩阵（除编辑器） |
| **P3** | 团队编辑 / 新建模板 | 对齐 3C/3E 编辑；或正式接受 HTML 面板 |
| **P4** | 可选 hooks、`wl console --open` 智能跳转、发布 catalog | 文档 + 指纹说明 |

---

## 12. 风险

1. **信任面扩大**：worker = 本机 Node + 账本 + orca；依赖审批 UX 与审计 actor。
2. **components 表现力**：复杂表单可能逼出 HTML，双 UI 栈成本。
3. **core API 稳定性**：插件会冻结导出面，core 重构需版本策略。
4. **Orca 升级**：`Since` 字段与 `engines.orca` 必须齐升。
5. **与总纲「不走插件后门」文案冲突**：合并本草案前须 **改写总纲 §5.4**，写明废止条件与本文件链接。

---

## 13. 总纲修订建议（合并时改）

将 §5.4 末条改为：

> 控制台默认以 Orca 插件侧栏为一级入口（见 `2026-11-06-orca-plugin-console-design.md`）；`wl console` 保留给无 Orca 环境。历史「API v0 不可做插件」结论仅适用于 < 1.4.246 且无 worker↔panel 通道的主机。

---

## 14. 已确认事项（2026-11-06 定稿，取代原提问）

| # | 问题 | 决定 |
|---|------|------|
| 1 | Phase 1 是否允许编辑器暂留 console/CLI | **允许**；面板显式提示，不静默缺失 |
| 2 | audit `actor` | **`human`**（与 CLI/console 一致） |
| 3 | 包形态 | 仓库内 `packages/orca-plugin`（private），**P4 前不发布** |
| 4 | 何时改总纲 §5.4 | **P0 探针通过后**再改 |

下一步：**P0**（scaffold + 协议 + 探针 1–3）。

---

## 15. P0 现状（2026-11-06 已落地）

已建 `packages/orca-plugin`（`@weiping/wingline-orca`，private，不发布）：

| 文件 | 作用 |
|------|------|
| `orca-plugin.json` | `manifestVersion 2` / `execution: trusted-worker` / `ui: components` / capabilities：`storage:own`、`settings:own`、`workspace:read` |
| `src/protocol.ts` | 面板↔worker 契约（`probe.ping`、`teams.list`、`teams.changed`） |
| `src/host.ts` | 组装 core 依赖：`winglineHome` + `Registry.open(state.db)` + `resolveOrcaExecutable` + `createOrcaRunner` + `createOrcaClient` |
| `src/worker.ts` | `activate(orca)`，`orca.panels.handle('teams.list')` 读本地账本 |
| `src/panel.tsx` | components 面板：团队清单 + 刷新 |
| `src/*.test.tsx` `src/*.check.ts` | `orca plugin test` / `plugin check` 用例 |
| `types/*.d.ts` | **本地兜底 typings**（见下） |

**已通过**：`orca plugin validate` ✅、`orca plugin test`（2/2）✅、`orca plugin check` ✅、`tsc -p packages/orca-plugin` ✅、`pnpm typecheck` ✅、`pnpm test`（1853 通过）✅。

**探针结论**：
- 探针 1（worker 能加载 core、读账本）：**成立**（worker.test 通过；`@weiping/wingline-core` 由 pnpm workspace 链接，worker 直接 `import`）。
- 探针 3（面板↔worker request 往返）：**成立**（panel.test 用 `mockHost.requests` 应答，`plugin.request` 正常）。
- 探针 2（worker 内调 `orca … --json`）：**未验**（需用户批准插件后 `orca plugin dev load` 实跑）。
- 探针 4（audit parity）、5（编辑器可行性）：**未做**。

### 15.1 踩坑：本机 Orca 1.4.250 安装缺 `orca.d.ts`

`orca plugin create` / `orca plugin types` 在本机报错：

```
ENOENT: .../app.asar.unpacked/resources/plugins/declarative/orca.d.ts
```

该目录只有 `orca-runtime.mjs` / `orca-testing.mjs` / `orca-test-hooks.mjs`，**缺 `orca.d.ts`**（疑似打包遗漏）。后果：拿不到官方 `.orca/types`，`tsconfig` 无法 `extends`。

**处置**：插件自带 `types/orca.d.ts`、`types/orca-worker.d.ts`、`types/orca-testing.d.ts`（最小声明），`tsconfig` 用 `paths` 指过去。**上游修复后应换回官方 typings**。

### 15.2 其他坑

- **相对导入必须带 `.js` 后缀**：Orca 的加载器把 `./host.js` 映射到 `host.ts`；不带后缀在仓库 `tsc`（node16）下会报错。两边统一用 `.js` 写法。
- **`mountWorker` 要传模块命名空间**：`import * as main from './worker'`，传 `default` 会报 “no default-exported activate”。
- **`plugin test` / `plugin check` 会在本机 unsandboxed 跑插件代码**，只对自己代码用。
- 仓库 `pnpm typecheck` 已 **exclude** `packages/orca-plugin`（工具链不同：Orca 转译 + 自带 typings），另加脚本 `pnpm typecheck:plugin`。


---

*本文件由会话「找回插件方案 → 选 2」生成；非已实现规格。实现前须探针与用户对上表确认项签字。*
