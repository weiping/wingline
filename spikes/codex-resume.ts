// 假设：Codex 的会话能被 `orca search '"<标记>"' --fresh` 找到，且 `codex resume <sessionId>` 能接回原对话。
// 用法：WINGLINE_SPIKE_WORKTREE=<测试仓库专用 worktree 选择器> pnpm tsx spikes/codex-resume.ts
// 抓 Claude 回执：WINGLINE_SPIKE_AGENT=claude（同法，只多试一条已实测的 --resume 形式）。
// 只在测试仓库的专用 worktree 里运行；不杀任何进程。
import crypto from 'node:crypto'
import { finish, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const agent = process.env.WINGLINE_SPIKE_AGENT ?? 'codex'
const probe = 'codex-resume'

// 两种恢复形式：`codex resume <id> <原参数>`（前置）与 `codex <原参数> resume <id>`（后置）。
// 本探针的启动命令是裸 `codex`（原参数为空），两形式合一，只试一次；结论里注明。
const marker = `WLS-${crypto.randomBytes(4).toString('hex')}`
const created = await client.terminalCreate({ worktree, title: 'spike-codex', command: agent })
try {
  await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 60_000 })
  await client.terminalSend({ handle: created.handle, text: `只回复收到。标记 ${marker}`, enter: true, waitSubmitSec: 30 })
  await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 120_000 })
} finally {
  await client.terminalClose({ handle: created.handle })
}

// 引号精确搜索并带 --fresh（spec 第 2 节第 2 条）；回执原样存档，供 Task 3 契约测试与人工判读。
const searched = await runner.json<{ hits?: Array<{ sessionId?: string; cwd?: string | null }> }>([
  'search', `"${marker}"`, '--agent', agent, '--fresh', '--json',
])
record(probe, agent === 'codex' ? 'search' : `search-${agent}`, searched)
const hits = searched.hits ?? []
const sessionId = hits[0]?.sessionId
console.log(`search: hits=${hits.length} sessionId=${sessionId ?? '无'} cwd=${hits[0]?.cwd ?? '无'} 标记=${marker}`)

if (!sessionId) {
  finish(probe, '不成立', `search=${hits.length} resume=无（sessionId 缺失；标记 ${marker}）`)
} else {
  const forms: Array<{ label: string; command: string }> = agent === 'claude'
    ? [{ label: '--resume', command: `${agent} --resume ${sessionId}` }]
    : [{ label: '前置', command: `${agent} resume ${sessionId}` }]
  let working: string | null = null
  for (const [i, form] of forms.entries()) {
    const revived = await client.terminalCreate({ worktree, title: 'spike-codex-2', command: form.command })
    try {
      await client.terminalWait({ handle: revived.handle, forState: 'tui-idle', timeoutMs: 60_000 })
      const shown = await runner.json<unknown>(['terminal', 'show', '--terminal', revived.handle])
      record(probe, `after-${i + 1}-${form.label}`, shown)
      // 接回的判读：恢复后的屏幕里应当能看到重启前发送的标记文本。
      if (JSON.stringify(shown).includes(marker)) working = form.label
    } finally {
      await client.terminalClose({ handle: revived.handle })
    }
  }
  finish(probe, working ? '成立' : '不成立', `search=${hits.length} resume=${working ?? '无'}（原参数为空，前后置形式合一；标记 ${marker}）`)
}
