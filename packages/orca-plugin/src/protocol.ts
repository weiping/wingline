// 面板 ↔ worker 契约：声明一次，两端都有类型。
export {}

declare module 'orca' {
  interface PluginRequests {
    /** 探针：worker 是否活着、core 是否可加载。 */
    'probe.ping': { output: { ok: true; home: string; teams: number } }
    /** 探针：worker 经 core 调 Orca（orca … --json）是否通。 */
    'probe.orca': { output: { reachable: boolean; version: string | null; terminals: number; error?: string } }
    /** 探针：插件走审计包装写一次 init（与 CLI 对照）。 */
    'probe.audit': {
      input: { name: string; repo: string; template?: 'duo' | 'solo' | 'trio' }
      output: { team: string; specPath: string; created: boolean }
    }
    /** 编辑器：加载团队规格（需 team 已登记）。 */
    'spec.readForEdit': { input: { team: string }; output: import('./host.js').SpecForEditDto }
    /** 团队清单（来自本地账本，不碰 Orca）。 */
    'teams.list': { output: { teams: TeamSummary[] } }
    /** 岗位列表：走 core 的 ps()，含存活状态与终端 handle。 */
    'team.posts': { input: { team: string }; output: { posts: import('./host.js').PostDto[] } }
    /** 把 Orca 窗口切到某个岗位的终端。 */
    'post.openTerminal': { input: { address: string }; output: { navigated: boolean; handle: string | null; reason: string | null } }
    /** 收件箱：需要人处理的事项（冻结、信号、提问、滞留、警告）。 */
    'team.inbox': { input: { team: string }; output: import('./host.js').InboxDto }
    /** 任务看板：团队当前的任务列表。 */
    'team.tasks': { input: { team: string }; output: { tasks: import('./host.js').TaskDto[] } }
    /** 写操作：回答提问。 */
    'write.reply': {
      input: { team: string; messageId: string; body: string }
      output: { messageId: string; duplicate: boolean }
    }
    /** 写操作：冻结岗位。 */
    'write.freeze': { input: { address: string; reason: string }; output: { ok: true } }
    /** 写操作：解冻岗位。 */
    'write.unfreeze': { input: { address: string }; output: { skipped: unknown[] } }
    /** 写操作：认领任务（以岗位身份）。 */
    'write.claimTask': { input: { id: string; as: string }; output: { ok: true } }
    /** 写操作：完成任务（以岗位身份）。 */
    'write.doneTask': { input: { id: string; as: string }; output: { ok: true } }
    /** 岗位终端预览：最后 40 行。 */
    'post.preview': { input: { address: string; lines?: number }; output: import('./host.js').PreviewDto }
    /** 岗位详情：当前任务、信号、冻结、时间线 50 条。 */
    'post.detail': { input: { team: string; address: string }; output: import('./host.js').PostDetailDto }
    /** 任务详情：计划、历史、gate 输出。 */
    'task.detail': { input: { id: string }; output: import('./host.js').TaskDetailDto }
    /** 启动调度员。node/script 由 worker 自动解析（宿主 execPath 是 Orca 时不能用）。 */
    'team.dispatcher-up': {
      input: { team: string }
      output: { outcome: 'already_running' | 'started' }
    }
    /** 停止调度员＝关闭调度员终端（close 缺省 true；false 是 core 的 noop，别用）。 */
    'team.dispatcher-down': {
      input: { team: string; close?: boolean }
      output: { outcome: 'noop' | 'closed' | 'already_gone' }
    }
    /** 停止团队：close=true 关岗位终端（二段确认由面板做），false 只标记 stopped。 */
    'team.down': {
      input: { team: string; close: boolean }
      output: { posts: Array<{ address: string; outcome: string; reason?: string }> }
    }
    /** 拉起岗位（wl up 的插件入口；幂等）。耗时可能 1–2 分钟，面板侧用 120s 超时。 */
    'team.up': {
      input: { team: string; draft?: boolean; newRun?: boolean; adoptRun?: string }
      output: import('./host.js').UpResultDto
    }
  }
  interface PluginPanelEvents {
    /** 面板刷新时 worker 广播。 */
    'teams.changed': { teams: TeamSummary[] }
    /** worker 轮询发现变化后推送（免手刷）。 */
    'inbox.changed': { team: string; inbox: import('./host.js').InboxDto }
    'tasks.changed': { team: string; tasks: import('./host.js').TaskDto[] }
    'posts.changed': { team: string; posts: import('./host.js').PostDto[] }
  }
}

export interface TeamSummary {
  name: string
  status: 'up' | 'stopped'
  runId: string | null
  posts: number
  specPath: string
  dispatcherState: 'running' | 'stale' | 'stopped' | 'never'
  offlinePosts: number | null
}
