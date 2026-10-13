// 假设：能拿到岗位的会话 ID 与 resumeCommand。在专用终端里启动 agent 后查看终端元数据。
import { finish, findString, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const agent = process.env.WINGLINE_SPIKE_AGENT ?? 'claude'
const created = await client.terminalCreate({ worktree, title: 'spike-session', command: agent })
try {
  await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 60_000 })
  const shown = await runner.json<unknown>(['terminal', 'show', '--terminal', created.handle])
  record('session-id', 'terminal-show', shown)
  const sessionId = findString(shown, /session.?id/i)
  const resume = findString(shown, /resume/i)
  finish('session-id', sessionId && resume ? '成立' : sessionId || resume ? '部分成立' : '不成立', `sessionId=${sessionId ?? '无'} resume=${resume ?? '无'}`)
} finally {
  await client.terminalClose({ handle: created.handle })
}
