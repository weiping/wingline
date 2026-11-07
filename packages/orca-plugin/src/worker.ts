// 插件 worker：Orca 在面板第一次 plugin.request 时启动它，保存文件会重启它。
// 无构建步骤：.ts 由 Orca 直接转译（不做类型检查，类型由 tsc -p . 保证）。
import type { OrcaWorkerApi } from 'orca/worker'

import {
  auditedInit,
  claimTask,
  createDeps,
  doneTask,
  freezePost,
  inboxDto,
  openPostTerminal,
  postDtos,
  postPreview,
  replyQuestion,
  specForEditDto,
  taskDtos,
  teamSummaries,
  unfreezePost
} from './host.js'
import { createSpecFacade, type CommandDeps } from '@weiping/wingline-core'

let deps: CommandDeps | undefined

function shared(): CommandDeps {
  // worker 重启后内存态丢失，但账本与 core 都是外部状态，重建是安全的。
  deps ??= createDeps()
  return deps
}

/** 状态条刷新间隔（毫秒）。 */
const STATUS_BAR_INTERVAL_MS = 30_000

let statusTimer: ReturnType<typeof setInterval> | null = null

/** 状态条刷新：各团队收件箱的待处理数汇总；有待处理时用 warning 色。 */
async function refreshStatusBar(orca: OrcaWorkerApi): Promise<void> {
  const d = shared()
  let pending = 0
  for (const team of d.registry.listTeams()) {
    try {
      pending += (await inboxDto(d, team.name)).pending
    } catch {
      // 单个团队读不到（未启动 / Orca 不可达）不影响其它团队
    }
  }
  await orca.host.call('statusBar.update', {
    id: 'wingline',
    text: pending > 0 ? `雁阵 ${pending}` : '雁阵',
    tone: pending > 0 ? 'warning' : 'neutral',
    tooltip: pending > 0 ? `雁阵：${pending} 项待处理` : '雁阵：没有待处理事项'
  })
}

/**
 * 定时刷状态条。用 setInterval + unref：不会阻塞进程退出（测试里 mountWorker 后进程能收尾）。
 * worker 停止时随 worker 一起结束。
 */
function startStatusBar(orca: OrcaWorkerApi): void {
  if (statusTimer !== null) return
  const tick = (): void => {
    refreshStatusBar(orca).catch((err) => {
      console.warn('[wingline] 状态条刷新失败：', err instanceof Error ? err.message : String(err))
    })
  }
  tick()
  statusTimer = setInterval(tick, STATUS_BAR_INTERVAL_MS)
  statusTimer.unref?.()
}

/** worker 停止前清理定时器。 */
export function deactivate(): void {
  if (statusTimer !== null) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  // 状态条：待处理事项数（收件箱口径）。带状态条项的插件，worker 会在启用时启动并常驻。
  startStatusBar(orca)

  orca.panels.handle('probe.ping', async () => {
    const d = shared()
    return { ok: true, home: d.home, teams: d.registry.listTeams().length }
  })

  orca.panels.handle('probe.orca', async () => {
    const d = shared()
    try {
      const status = await d.orca.status()
      if (!status.reachable) return { reachable: false, version: null, terminals: 0, error: 'Orca 不可达' }
      const version = await d.orca.version()
      const terminals = await d.orca.terminalList()
      return { reachable: true, version, terminals: terminals.length }
    } catch (err) {
      return { reachable: false, version: null, terminals: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })

  orca.panels.handle('probe.audit', async ({ name, repo, template }) => {
    const init = auditedInit()
    const result = (await init.init(shared(), { mode: 'template', name, repo, template: template ?? 'duo' })) as {
      team: string
      specPath: string
      created: boolean
    }
    return result
  })

  orca.panels.handle('spec.readForEdit', async ({ team }) => {
    const view = createSpecFacade(shared()).readForEdit(team)
    return specForEditDto(view)
  })

  orca.panels.handle('teams.list', async () => {
    const teams = teamSummaries(shared())
    orca.panels.post('teams.changed', { teams })
    return { teams }
  })

  orca.panels.handle('team.posts', async ({ team }) => {
    const posts = await postDtos(shared(), team)
    return { posts }
  })

  orca.panels.handle('post.openTerminal', async ({ address }) => {
    return openPostTerminal(shared(), address)
  })

  orca.panels.handle('team.inbox', async ({ team }) => {
    return inboxDto(shared(), team)
  })

  orca.panels.handle('team.tasks', async ({ team }) => {
    const tasks = await taskDtos(shared(), team)
    return { tasks }
  })

  orca.panels.handle('write.reply', async ({ team, messageId, body }) => {
    return replyQuestion(shared(), { team, messageId, body })
  })

  orca.panels.handle('write.freeze', async ({ address, reason }) => {
    await freezePost(shared(), { address, reason })
    return { ok: true }
  })

  orca.panels.handle('write.unfreeze', async ({ address }) => {
    const res = await unfreezePost(shared(), { address })
    return { skipped: res.skipped }
  })

  orca.panels.handle('write.claimTask', async ({ id, as }) => {
    await claimTask(shared(), { id, as })
    return { ok: true }
  })

  orca.panels.handle('write.doneTask', async ({ id, as }) => {
    await doneTask(shared(), { id, as })
    return { ok: true }
  })

  orca.panels.handle('post.preview', async ({ address, lines }) => {
    return postPreview(shared(), address, lines ?? 40)
  })
}
