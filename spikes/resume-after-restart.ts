// 假设：重启 Orca 的后台进程后，terminal create --command "<恢复命令>" 能接回原会话。
// 探针不杀进程：它让你自己退出并重开 Orca，避免误伤你正在使用的会话。
import { confirm, finish, findString, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const created = await client.terminalCreate({ worktree, title: 'spike-resume', command: process.env.WINGLINE_SPIKE_AGENT ?? 'claude' })
await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 60_000 })
const shown = await runner.json<unknown>(['terminal', 'show', '--terminal', created.handle])
record('resume-after-restart', 'before', shown)
const resume = findString(shown, /resume/i)
if (!resume) {
  await client.terminalClose({ handle: created.handle })
  finish('resume-after-restart', '不成立', '拿不到 resumeCommand（先看 session-id 探针）')
} else if (await confirm('接下来请完全退出并重新打开 Orca（会中断其中所有终端，包括你正在用的会话）。')) {
  await confirm('Orca 重新打开并就绪后：')
  const revived = await client.terminalCreate({ worktree, title: 'spike-resume-2', command: resume })
  await client.terminalWait({ handle: revived.handle, forState: 'tui-idle', timeoutMs: 60_000 })
  record('resume-after-restart', 'after', await runner.json<unknown>(['terminal', 'read', '--terminal', revived.handle]))
  await client.terminalClose({ handle: revived.handle })
  finish('resume-after-restart', '部分成立', '已录下恢复后的终端输出，请人工判断是否接回原会话')
}
