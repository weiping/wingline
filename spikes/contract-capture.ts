// 阶段 2A Task 15：在真实 Orca 里抓取编排命令的原始回执，脱敏后写入 test/fixtures/receipts/orchestration-2a.json，
// 供 packages/core/test/orca/contract.test.ts 钉住 OrcaClient 的解析。会留下一个 Run（CLI 无法删除），所有终端在 finally 里关闭。
//   WINGLINE_SPIKE_WORKTREE=path:<仓库路径> pnpm tsx spikes/contract-capture.ts
import fs from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, setup } from './lib.js'

const OUT = 'test/fixtures/receipts/orchestration-2a.json'
type Receipt = { ok: true; result: unknown } | { ok: false; error: { code?: string; kind?: string; message: string; data?: unknown } }

/** 与 orchestration-r6.json 同一规则：用户名与家目录前缀换成 USER。 */
function sanitize(text: string): string {
  const user = os.userInfo().username
  return text.replaceAll(os.homedir(), '/home/USER').replaceAll(`/Users/${user}`, '/Users/USER').replaceAll(`/home/${user}`, '/home/USER').replaceAll(user, 'USER')
}

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  const out: Record<string, unknown> = {
    _source: `spikes/contract-capture.ts，Orca ${await orcaVersion(runner)}，${process.platform}，${new Date().toISOString().slice(0, 10)}。只保留雁阵读取的命令回执；用户名与路径已脱敏，handle/id 为真实运行产生的随机值。`,
  }
  const mk = async (title: string) => {
    const t = await client.terminalCreate({ worktree, title, command: IDLE_COMMAND })
    open.add(t.handle)
    return t.handle
  }
  const call = async (key: string | null, args: string[], retry?: string): Promise<Receipt> => {
    let r: Receipt
    try {
      r = { ok: true, result: await runner.json([...args, ...(retry ? ['--retry-request', retry] : [])]) }
    } catch (e) {
      r = e instanceof WinglineError ? { ok: false, error: { code: e.code, kind: e.kind, message: e.message, data: e.detail } } : { ok: false, error: { message: String(e) } }
    }
    if (key) out[key] = r
    console.log(key ?? '(unrecorded)', JSON.stringify(r).slice(0, 300))
    return r
  }
  const ok = (r: Receipt) => { if (!r.ok) throw new Error(`capture step failed: ${JSON.stringify(r)}`); return r.result as any }
  try {
    const coord = await mk('spike-2a-coord')
    const w1 = await mk('spike-2a-w1')
    const w2 = await mk('spike-2a-w2')
    const w3 = await mk('spike-2a-w3')
    const runId = ok(await call('run-create', ['orchestration', 'run-create', '--objective', 'wingline:contract-capture', '--from', coord], randomUUID())).run.id as string
    await call('run-list', ['orchestration', 'run-list'])
    await call('run-show', ['orchestration', 'run-show', '--id', runId])
    const create = async (title: string, key: string | null, parent?: string, retry = randomUUID()) =>
      ok(await call(key, ['orchestration', 'task-create', '--spec', `capture ${title}`, '--task-title', title, '--run', runId, '--from', coord, ...(parent ? ['--parent', parent] : [])], retry)).task.id as string
    const t1Retry = randomUUID()
    const t1 = await create('T1', 'task-create', undefined, t1Retry)
    await create('T2-child', 'task-create-with-parent', t1)
    const t3 = await create('T3', null)
    const t4 = await create('T4', null)
    const d1 = ok(await call('dispatch', ['orchestration', 'dispatch', '--task', t1, '--to', w1, '--from', coord], randomUUID())).dispatch.id as string
    const doneRetry = randomUUID()
    const done = ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', t1, '--dispatch-id', d1, '--subject', 'capture done', '--run', runId, '--from', w1]
    await call('worker-done', done, doneRetry)
    await call('request-show-completed', ['orchestration', 'request-show', '--request', doneRetry])
    await call('request-show-completed-task-create', ['orchestration', 'request-show', '--request', t1Retry])
    await call('request-show-absent', ['orchestration', 'request-show', '--request', randomUUID()])
    const rejectedRetry = randomUUID()
    // 对已完成的派发重发 worker_done 实测会被接受（不是拒绝）；用不存在的 dispatch id 才会被拒并记入账本。
    await call('worker-done-rejected', done.map((x) => (x === d1 ? 'ctx_nonexistent' : x)), rejectedRetry)
    await call('request-show-rejected-worker-done', ['orchestration', 'request-show', '--request', rejectedRetry])
    await call('dispatch-t3', ['orchestration', 'dispatch', '--task', t3, '--to', w2, '--from', coord], randomUUID())
    await call(null, ['orchestration', 'dispatch', '--task', t4, '--to', w3, '--from', coord], randomUUID())
    const gate = ok(await call('gate-create', ['orchestration', 'gate-create', '--task', t4, '--question', 'capture gate', '--from', coord], randomUUID())).gate.id as string
    await call('task-list-mixed', ['orchestration', 'task-list', '--run', runId])
    await call('gate-resolve', ['orchestration', 'gate-resolve', '--id', gate, '--resolution', 'ok', '--from', coord], randomUUID())
    await call('worktree-show', ['worktree', 'show', '--worktree', worktree])
    await call('terminal-show', ['terminal', 'show', '--terminal', w1])
    console.log(`RESULT contract-capture done run=${runId}`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((e) => console.error('close failed', h, e))
  }
  fs.mkdirSync('test/fixtures/receipts', { recursive: true })
  fs.writeFileSync(OUT, sanitize(JSON.stringify(out, null, 2)) + '\n')
  console.log(`wrote ${OUT}`)
}

async function orcaVersion(runner: { json: (a: string[]) => Promise<unknown> }): Promise<string> {
  try { const r = (await runner.json(['status'])) as { app?: { version?: string } }; return r.app?.version ?? 'unknown' } catch { return 'unknown' }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
