// 阶段 2 第二次复审补充探针（第四段）：从另一个 Orca 终端（有稳定 pane 身份）里代某个岗位发 worker_done 是否被接受；
// Orca 终端里 ORCA_TERMINAL_HANDLE 是否真的存在且等于该终端的 handle；send --type escalation --to <普通终端 handle> 是否可行。
// 会在一个 shell 终端里执行命令（写到 /tmp 下的文件），只用占位终端，会留下一个 Run。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/pane-identity-probe.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, record, setup } from './lib.js'

const probe = 'pane-identity-probe'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFile(file: string, ms = 30_000): Promise<string> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { await sleep(500); return fs.readFileSync(file, 'utf8') }
    await sleep(500)
  }
  return '<timeout>'
}

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  const attempt = async (name: string, args: string[]) => {
    let out: { ok: boolean; result?: any; code?: string; message?: string }
    try { out = { ok: true, result: await runner.json(args) } } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message } : { ok: false, message: String(e) }
    }
    record(probe, name, { args, out })
    console.log(name, out.ok ? 'ok' : `${out.code}: ${out.message}`)
    return out
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-pane-'))
  try {
    const t1 = (await client.terminalCreate({ worktree, title: 'spike-pane-coord', command: IDLE_COMMAND })).handle; open.add(t1)
    const t2 = (await client.terminalCreate({ worktree, title: 'spike-pane-worker', command: IDLE_COMMAND })).handle; open.add(t2)
    const sh = (await runner.json<{ terminal: { handle: string } }>(['terminal', 'create', '--worktree', worktree, '--title', 'spike-pane-shell'])).terminal.handle; open.add(sh)
    await sleep(3000)
    const runId = (await attempt('01-run-create', ['orchestration', 'run-create', '--objective', 'wingline pane probe', '--from', t1])).result.run.id as string
    const x = (await attempt('02-create', ['orchestration', 'task-create', '--spec', 'X', '--task-title', 'X', '--run', runId, '--from', t1])).result.task.id as string
    const ctx = (await attempt('03-dispatch', ['orchestration', 'dispatch', '--task', x, '--to', t2, '--from', t1])).result.dispatch.id as string

    const envFile = path.join(dir, 'env.txt')
    await client.terminalSend({ handle: sh, text: `echo "ORCA_TERMINAL_HANDLE=$ORCA_TERMINAL_HANDLE" > ${envFile}`, enter: true, waitSubmitSec: 5 })
    const env = await waitFile(envFile)
    record(probe, '04-shell-env', { shell: sh, env })
    console.log('04-shell-env', env.trim(), 'shell handle =', sh)

    const doneFile = path.join(dir, 'done.json')
    const cmd = `orca-ide orchestration send --type worker_done --outcome succeeded --task-id ${x} --dispatch-id ${ctx} --subject from-other-pane --run ${runId} --from ${t2} --json > ${doneFile} 2>&1`
    await client.terminalSend({ handle: sh, text: cmd, enter: true, waitSubmitSec: 5 })
    const done = await waitFile(doneFile)
    record(probe, '05-worker-done-from-other-pane', { cmd, output: done })
    console.log('05-worker-done-from-other-pane', done.slice(0, 400))
    await attempt('06-task-list', ['orchestration', 'task-list', '--run', runId])

    await attempt('07-escalation-to-plain-handle', ['orchestration', 'send', '--type', 'escalation', '--to', t2, '--subject', 'patrol: probe', '--body', 'b', '--run', runId, '--from', t1])
    await attempt('08-escalation-to-run-mailbox', ['orchestration', 'send', '--type', 'escalation', '--to', `run:${runId}`, '--subject', 'patrol: probe', '--body', 'b', '--run', runId, '--from', t1])
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((err) => console.error('close failed', h, err))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
