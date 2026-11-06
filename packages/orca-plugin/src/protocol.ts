// 面板 ↔ worker 契约：声明一次，两端都有类型。
export {}

declare module 'orca' {
  interface PluginRequests {
    /** 探针：worker 是否活着、core 是否可加载。 */
    'probe.ping': { output: { ok: true; home: string; teams: number } }
    /** 团队清单（来自本地账本，不碰 Orca）。 */
    'teams.list': { output: { teams: TeamSummary[] } }
  }
  interface PluginPanelEvents {
    /** 面板刷新时 worker 广播。 */
    'teams.changed': { teams: TeamSummary[] }
  }
}

export interface TeamSummary {
  name: string
  status: 'up' | 'stopped'
  runId: string | null
  posts: number
  specPath: string
}
