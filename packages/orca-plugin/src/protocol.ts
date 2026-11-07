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
