// 阶段 2 第四次复审的补充探针：Orca 的 --retry-request 账本是不是按"调用方身份"分区的。
// `orchestration request-show --help` 写着 "absent means this runtime holds no receipt for that request under your caller identity"。
// 2A 的重跑安全假设"原样重跑同一条命令"从哪个终端跑都会命中同一个账本（例如第一次在岗位终端里 wl task done，
// 重跑在 lead 终端或 Orca 之外的 shell 里 wl task done --as）。本探针验证：
//   Q1 在 Orca 之外落地的请求，从一个 Orca shell 终端里 request-show / 原样重放：回放，还是 absent/重新执行？
//   Q2 在 Orca shell 终端里落地的请求，从 Orca 之外原样重放：回放，还是重新执行？
// 复用补充探针四留下的 Run（run_3d9c053676fa，协调者 handle 已关闭，值匹配仍接受，第 2 节事实 1），不新建 Run。
// 只开一个 shell 终端，结束时关闭。会在那个旧 Run 里多出最多 3 个占位任务。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/caller-scope-probe.ts
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WinglineError } from '../packages/core/src/index.js'
import { record, setup } from './lib.js'

const probe = 'caller-scope-probe'
const RUN = 'run_3d9c053676fa'
const COORD = 'term_1438e66d-0755-40be-ab65-190bc1c54c6d'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFile(file: string, ms = 60_000): Promise<string> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { await sleep(800); return fs.readFileSync(file, 'utf8') }
    await sleep(500)
  }
  return '<timeout>'
}

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-scope-'))
  let n = 0
  const outside = async (name: string, args: string[]) => {
    let out: unknown
    try { out = { ok: true, result: await runner.json(args) } } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message } : { ok: false, threw: String(e) }
    }
    record(probe, `${String(++n).padStart(2, '0')}-outside-${name}`, { args, out })
    console.log('outside', name, JSON.stringify(out).slice(0, 240))
    return out as { ok: boolean; result?: any }
  }
  const inside = async (sh: string, name: string, args: string[]) => {
    const file = path.join(dir, `${name}.json`)
    const quoted = args.map((a) => `'${a.replaceAll("'", `'"'"'`)}'`).join(' ')
    await client.terminalSend({ handle: sh, text: `orca-ide ${quoted} --json > ${file} 2>&1`, enter: true, waitSubmitSec: 5 })
    const raw = await waitFile(file)
    let out: unknown = raw
    try { out = JSON.parse(raw) } catch { /* 原样记录 */ }
    record(probe, `${String(++n).padStart(2, '0')}-inside-${name}`, { args, out })
    console.log('inside', name, raw.slice(0, 240).replace(/\s+/g, ' '))
    return out as any
  }
  const taskCount = async () => ((await outside('task-list', ['orchestration', 'task-list', '--run', RUN])).result.tasks as any[]).length
  try {
    const sh = (await runner.json<{ terminal: { handle: string } }>(['terminal', 'create', '--worktree', worktree, '--title', 'spike-scope-shell'])).terminal.handle
    open.add(sh)
    await sleep(3000)
    const envFile = path.join(dir, 'env.txt')
    await client.terminalSend({ handle: sh, text: `echo "ORCA_TERMINAL_HANDLE=$ORCA_TERMINAL_HANDLE" > ${envFile}`, enter: true, waitSubmitSec: 5 })
    record(probe, '00-shell-env', { shell: sh, env: await waitFile(envFile) })

    // Q1：在 Orca 之外落地，再从 shell 终端里看、重放。
    const idA = randomUUID()
    const a = ['orchestration', 'task-create', '--spec', 'scope A', '--task-title', 'scopeA', '--run', RUN, '--from', COORD, '--retry-request', idA]
    await outside('task-create-A', a)
    const before = await taskCount()
    await inside(sh, 'request-show-A', ['orchestration', 'request-show', '--request', idA])
    await inside(sh, 'task-create-A-replay', a)
    record(probe, 'A-task-count', { before, after: await taskCount() })

    // Q2：在 shell 终端里落地，再从 Orca 之外看、重放。
    const idB = randomUUID()
    const b = ['orchestration', 'task-create', '--spec', 'scope B', '--task-title', 'scopeB', '--run', RUN, '--from', COORD, '--retry-request', idB]
    await inside(sh, 'task-create-B', b)
    const beforeB = await taskCount()
    await outside('request-show-B', ['orchestration', 'request-show', '--request', idB])
    await outside('task-create-B-replay', b)
    record(probe, 'B-task-count', { before: beforeB, after: await taskCount() })
    console.log(`RESULT ${probe} done`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((e) => console.error('close failed', h, e))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
