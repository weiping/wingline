// 插件 worker：Orca 在面板第一次 plugin.request 时启动它，保存文件会重启它。
// 无构建步骤：.ts 由 Orca 直接转译（不做类型检查，类型由 tsc -p . 保证）。
import type { OrcaWorkerApi } from 'orca/worker'

import { createDeps, teamSummaries } from './host.js'
import type { CommandDeps } from '@weiping/wingline-core'

let deps: CommandDeps | undefined

function shared(): CommandDeps {
  // worker 重启后内存态丢失，但账本与 core 都是外部状态，重建是安全的。
  deps ??= createDeps()
  return deps
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('probe.ping', async () => {
    const d = shared()
    return { ok: true, home: d.home, teams: d.registry.listTeams().length }
  })

  orca.panels.handle('teams.list', async () => {
    const teams = teamSummaries(shared())
    orca.panels.post('teams.changed', { teams })
    return { teams }
  })
}
