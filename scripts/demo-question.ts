/**
 * 造一条演示提问（开发工具）。
 *
 * 走的是真链路：给调度员终端发一条 Orca 编排消息（type=question）→ 调度员在自己的 check 循环里
 * 收到 → 中继给人类 → 落进 `questions` 表 → Orca 插件面板的收件箱里能看到并能回答。
 *
 * 用法：
 *   pnpm demo:question                      # 给 duo 造一条
 *   pnpm demo:question -- --team duo --body "改哪个文件？" --count 2
 *   pnpm demo:question -- --reset           # 清掉本脚本造过的演示提问
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { DatabaseSync } from 'node:sqlite'

import { Registry, resolveOrcaExecutable, winglineHome } from '@weiping/wingline-core'

const execFileAsync = promisify(execFile)

/** 演示提问的 subject 前缀；--reset 按它认领。 */
const MARKER = '演示提问'

interface Args {
  team: string
  body: string
  count: number
  reset: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { team: 'duo', body: '演示问题：要不要我在仓库里跑一次只读检查？', count: 1, reset: false }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--team') a.team = argv[++i] ?? a.team
    else if (v === '--body') a.body = argv[++i] ?? a.body
    else if (v === '--count') a.count = Number(argv[++i] ?? '1')
    else if (v === '--reset') a.reset = true
    else if (v === '--help' || v === '-h') {
      console.log('用法：tsx scripts/demo-question.ts [--team <团队>] [--body <正文>] [--count <条数>] [--reset]')
      process.exit(0)
    }
  }
  return a
}

function which(name: string, env: NodeJS.ProcessEnv): string | null {
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        // 继续找
      }
    }
  }
  return null
}

function openRegistry(): Registry {
  return Registry.open(path.join(winglineHome(), 'state.db'))
}

/** 本脚本造过的 messageId 台账（放在 wingline home，不进仓库）。 */
function ledgerPath(): string {
  return path.join(winglineHome(), 'demo-questions.json')
}

function readLedger(): { messageIds: string[] } {
  try {
    const raw = fs.readFileSync(ledgerPath(), 'utf8')
    const parsed = JSON.parse(raw) as { messageIds?: unknown }
    return { messageIds: Array.isArray(parsed.messageIds) ? parsed.messageIds.filter((x): x is string => typeof x === 'string') : [] }
  } catch {
    return { messageIds: [] }
  }
}

function writeLedger(ids: string[]): void {
  fs.writeFileSync(ledgerPath(), JSON.stringify({ messageIds: ids }, null, 2), 'utf8')
}

/**
 * 清掉本脚本造过的演示提问。
 * 两条路：台账里的 messageId（消息已发出但还没被调度员中继时也清得掉），
 * 以及 body 里带标记的行（台账丢了也能兜住）。
 */
function resetQuestions(team: string): number {
  const db = new DatabaseSync(path.join(winglineHome(), 'state.db'))
  const ids = new Set(readLedger().messageIds)
  const rows = db.prepare('SELECT message_id, body FROM questions WHERE team = ?').all(team) as Array<{ message_id: string; body: string }>
  for (const r of rows) if (r.body.includes(MARKER)) ids.add(r.message_id)
  for (const id of ids) db.prepare('DELETE FROM questions WHERE message_id = ?').run(id)
  db.close()
  writeLedger([])
  return ids.size
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const registry = openRegistry()

  if (args.reset) {
    const n = resetQuestions(args.team)
    console.log(`已清掉 ${n} 条演示提问（团队 ${args.team}）`)
    return
  }

  const team = registry.getTeam(args.team)
  if (!team) throw new Error(`团队 ${args.team} 未登记（先 wl up）`)
  if (!team.runId) throw new Error(`团队 ${args.team} 还没有 Run（先 wl up）`)
  if (!team.coordinatorHandle) throw new Error(`团队 ${args.team} 没有协调者终端（调度器没起来？）`)

  const posts = registry.listPosts(args.team).filter((p) => p.handle !== null)
  const asker = posts[0]
  if (!asker) throw new Error(`团队 ${args.team} 没有带终端的岗位，先 wl up`)

  const exe = resolveOrcaExecutable({ env: process.env, platform: process.platform, which: (n) => which(n, process.env) })
  const ids: string[] = []
  for (let i = 0; i < args.count; i++) {
    const body = args.count > 1 ? `${MARKER} ${i + 1}/${args.count}：${args.body}` : `${MARKER}：${args.body}`
    const { stdout } = await execFileAsync(
      exe.file,
      [
        'orchestration', 'send',
        '--type', 'question',
        '--to', team.coordinatorHandle,
        '--from', asker.handle!,
        '--subject', `${MARKER}：面板演示`,
        '--body', body,
        '--run', team.runId,
        '--json',
      ],
      { env: process.env }
    )
    const out = JSON.parse(stdout) as { ok: boolean; result?: { messageId: string }; error?: { message: string } }
    if (!out.ok || !out.result) throw new Error(`发送失败：${out.error?.message ?? stdout}`)
    ids.push(out.result.messageId)
  }

  writeLedger([...readLedger().messageIds, ...ids])
  console.log(`已造 ${ids.length} 条演示提问（团队 ${args.team}，提问方 ${asker.address}）`)
  for (const id of ids) console.log(`  messageId = ${id}`)
  console.log('看：Orca 插件面板 → duo → 收件箱；或 wl dispatcher status ' + args.team)
  console.log('清：pnpm demo:question -- --reset')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
