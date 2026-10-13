// 假设：重启 Orca 后，terminal create --command "<恢复命令>" 能接回原会话。
// 探针不杀进程：让你自己退出并重开 Orca，避免误伤正在用的会话。
// 会话 ID / 恢复命令优先从 `orca search` 拿（本地主机完整返回，配对环境只给 sessionId）；
// 拿不到就退到读 agent 自己的会话文件 ~/.claude/projects/<path>/*.jsonl（文件名即 sessionId）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { confirm, finish, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const agent = process.env.WINGLINE_SPIKE_AGENT ?? 'claude'
const worktreePath = worktree.startsWith('path:') ? worktree.slice('path:'.length) : worktree

const created = await client.terminalCreate({ worktree, title: 'spike-resume', command: agent })
await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 60_000 })

// 发一个小标记，制造一次会话；client.terminalSend 自带 --enter --wait-submit，会真正提交。
const marker = 'Reply with exactly: SPIKE_RESUME_MARKER'
await client.terminalSend({ handle: created.handle, text: marker, enter: true, waitSubmitSec: 30 })
await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 90_000 })

// 优先从 orca search 拿。
let sessionId: string | undefined
let resume: string | undefined
try {
  const r = await runner.json<{ hits?: Array<{ sessionId?: string; resumeCommand?: string | null }> }>([
    'search', marker, '--agent', agent, '--path', worktreePath, '--fresh', '--sort', 'newest', '--limit', '1', '--json',
  ])
  record('resume-after-restart', 'search', r)
  const hit = r.hits?.[0]
  sessionId = hit?.sessionId
  resume = hit?.resumeCommand ?? (hit?.sessionId ? `${agent} --resume '${hit.sessionId}'` : undefined)
} catch {
  // search 可能配对环境扣留或出错，落到文件兜底
}

// 退路：直接读 agent 自己的会话文件（filename = sessionId）。仅对运行在宿主上的 agent 有效。
if (!resume) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects', worktreePath.replace(/\//g, '-'))
  if (fs.existsSync(projectsDir)) {
    const newest = fs.readdirSync(projectsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, m: fs.statSync(path.join(projectsDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]
    if (newest) {
      sessionId = path.basename(newest.f, '.jsonl')
      resume = `${agent} --resume '${sessionId}'`
    }
  }
}

record('resume-after-restart', 'before', { sessionId, resume })

if (!resume) {
  await client.terminalClose({ handle: created.handle })
  finish('resume-after-restart', '不成立', '拿不到恢复命令（orca search 与本地会话文件都查不到）')
} else {
  const restart = await confirm('接下来请完全退出并重新打开 Orca（会中断其中所有终端，包括你正在用的会话）。')
  if (!restart) {
    await client.terminalClose({ handle: created.handle })
    finish('resume-after-restart', '不成立', `用户取消重启（已拿到恢复命令 ${resume}，可手动验证）`)
  } else {
    await confirm('Orca 重新打开并就绪后：')
    const revived = await client.terminalCreate({ worktree, title: 'spike-resume-2', command: resume })
    await client.terminalWait({ handle: revived.handle, forState: 'tui-idle', timeoutMs: 60_000 })
    record('resume-after-restart', 'after', await runner.json<unknown>(['terminal', 'read', '--terminal', revived.handle]))
    await client.terminalClose({ handle: revived.handle })
    finish('resume-after-restart', '部分成立', `已录下恢复后的终端输出，请人工判断是否接回原会话（恢复命令：${resume}）`)
  }
}
