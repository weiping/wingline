# 阶段 3D spec 与 plan 复审（第三轮）

- 日期：2026-10-23
- 对象：`docs/superpowers/specs/2026-10-16-phase-3d-screen-signals-remote-autostart-design.md`、`docs/superpowers/plans/2026-10-16-phase-3d-screen-signals-remote-autostart.md`
- 方法：superpowers:writing-plans 的自检清单（spec 覆盖、步骤粒度、类型一致性、Review Focus、篇幅比例），并对 spec 引用的代码事实逐条核对。
- 处理结果：spec 已修订（见其“第三轮”一节）；plan 拆成 3D-1 / 3D-2 并重写。

## 结论

spec 基本可用，有几处设计缺口；原 plan 不能开工，它在第二轮复审之后没有同步，仍是旧稿。

## 一、plan 与 spec 脱节（阻塞，已处理）

| spec 的结论 | 原 plan |
| --- | --- |
| 用 `terminal read --screen` 读画面（`terminal show` 只有约 300 字符） | 仍用 `terminalShow` 的 `preview` 读 40 行 |
| 画面信号用独立类型 `ScreenSignalKind`，不并入 `PatrolSignal`；清除循环显式跳过 | `PatrolSignal` 增加两项，无豁免 |
| `context_low` 键用会话标记的哈希 | 存会话标记原文，会进 `wl attention --json` |
| 到点即发“继续”，不等提示消失 | 测试写“提示仍在则按退避重新通知” |
| 未读标记走 `worktreeSet({ unread })`，目标是牵头岗 worktree | `terminalMarkUnread` 加终端 handle |
| 远端 `cwd` 为空即保留的规则作废 | 仍沿用 |
| `restoreOne` 注入已审计的 `restore`，`RestoreAllResult` 带 `error` | `RestoreResult[]`，还要改 `audit.ts`（已支持 `as`） |
| 团队锁拿不到立即抛 `team_busy`（`registry.ts:509`） | 写成“串行，第二个看到 `kept`” |
| `selfCommand(a: SelfSpec, o?)`，需新增 `absoluteSelfCommand` | 引用不存在的 `selfCommand(deps, args, o?)` |
| 迁移后 `migrate-3c.test.ts:22` 的 `toBe(5)` 必须改；样本目录要 `.gitattributes`；`api-read.ts:138` 要先修；`SpecForm.tsx` 白名单 | 均无对应步骤 |

另外，spec 修订表曾把“空函数体测试骨架”“`SpecForm` 白名单”“每块任务见 plan 顶部”三项标成“已落实（plan）”，实际都不成立，已改正。

其余结构问题：Task 4 把远端环境与未读标记合在一起（探针前提不同）；探针任务只覆盖 6 个探针中的 3 个；Windows 被完整实现，而 spec 要求探针 5 之前返回 `autostart_unsupported`；步骤多为“实现。”。

## 二、spec 的设计缺口（已补）

1. `context_low`“通知一次”与“画面消失即清除”冲突 → 清除后再次出现复用同一行，1 小时内不重复通知（`CONTEXT_RENOTIFY_MS`），`detail` 增 `notifiedAt`。
2. 用量上限可能是带编号选项的阻塞菜单（未核实，待探针 2）→ 探针增观察项；“继续”发不出时 3 轮后放弃并通知人一次，不替人选菜单项。
3. launchd / systemd 的 PATH 极简，`orca` 可能依赖 `env node` → plist / unit 写显式 PATH，真机项验证。
4. 40 行窗口含对话正文，引用的限额文字会误报 → 模式锚定状态行格式，同一类信号取最底部一处，加负例测试。
5. 未读键是否含画面信号不明确 → 不含（它们已直接通知）。
6. `usage_limit` 行键为 `task_id = ''`，多处命中的取舍未写 → 取最底部一处。

未做：第一、二轮修订表的压缩（留到 3D 收尾）。

## 三、核对过的代码事实（成立）

`cli.ts:258` 的 `restore <team>`；`advance.ts:194` 的清除循环；`load.ts` 中 `worktree_comment` 默认 `false`；`worktreeSet` 的“至少带 comment 或 status”守卫；`resetPatrolForPost` 无条件清所有行；`find-session.ts:65` 的 `cwd !== null` 与 `markerHighlighted`；`migrate-3c.test.ts:22`；`audit.ts` 已读 `as ?? actor`；`--home` / `--orca` 目前只有 `dispatcher run` 与 `console` 声明。

## 四、产出

- 3D-1（块 a + b，可立即开工）：`docs/superpowers/plans/2026-10-23-phase-3d1-restore-all-autostart-unread.md`
- 3D-2（块 c + d，探针 1、2、4 之后）：骨架在 `docs/superpowers/plans/2026-10-16-phase-3d-screen-signals-remote-autostart.md`

## 五、遗留

- 3D-1 的部分测试只有测试名，断言待执行时按 spec 第 11 节补全；plan 中个别测试文件路径是推断的，未逐个核对。
- 探针 3、6（3D-1 Task 1）已于同日在真机跑完：未读标记可用且 comment / status 不影响红点；终端列表稳定判据定为间隔 10 秒、连续 4 次相同（原 spec 为 3 次，依据一次实测调整）。结论见 `spikes/REPORT.md`。
