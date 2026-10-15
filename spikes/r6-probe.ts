// 阶段 2 第四次复审（2026-10-15）的补充探针六（R6）。回答复审汇总
// docs/superpowers/reviews/2026-10-15-phase-2-review.md 里仍未验证的问题：
//   S1（2A I9）同一个终端能否同时持有两个 dispatched 任务（WIP 默认值的前提）。
//   S2（2B C1）check 的 ack 语义：不 ack 再 check 是否重放、deliveryId 是否不变；同一 deliveryId ack 两次；
//       协调者换手后旧协调者 ack、新协调者 ack 上一代的 deliveryId。
//   S3（2B C1）check --wait 超过 CLI 默认 60 s socket 超时（75 s）是否干净超时。
//   S4（2B I6）ask 留下的问题，reply 需要什么身份（提问者以外的岗位 / 旧协调者 / 当前协调者）。
//   S5（2A I11）macOS 上 Orca 终端里 ORCA_TERMINAL_HANDLE 是否设置、是否等于该终端 handle。
//   S6（2A I9、2B C2，需 WINGLINE_SPIKE_AGENT=1，会启动真实 claude、消耗少量 token）：
//       往空闲 agent 连续两次 dispatch --inject（第二次时 agent 正忙）；agent 停在权限确认时
//       terminal show 的 preview、worker-list 里能看到什么。
// 会留下一个 Run（CLI 无法删除）。所有终端在 finally 里关闭。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> [WINGLINE_SPIKE_AGENT=1] pnpm tsx spikes/r6-probe.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, findString, record, setup } from './lib.js'

const probe = 'r6-probe'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  const mk = async (title: string, command = IDLE_COMMAND) => {
    const t = await client.terminalCreate({ worktree, title, command })
    open.add(t.handle)
    return t.handle
  }
  let n = 0
  const attempt = async (name: string, args: string[], timeoutMs?: number) => {
    let out: unknown
    const started = Date.now()
    try {
      out = { ok: true, result: await runner.json(args, timeoutMs ? { timeoutMs } : undefined) }
    } catch (e) {
      out = e instanceof WinglineError ? { ok: false, kind: e.kind, code: e.code, message: e.message, detail: e.detail } : { ok: false, threw: String(e) }
    }
    const ms = Date.now() - started
    record(probe, `${String(++n).padStart(2, '0')}-${name}`, { args, ms, out })
    console.log(`[${ms}ms] ${name}`, JSON.stringify(out).slice(0, 400))
    return out as { ok: boolean; result?: any; code?: string }
  }
  const taskState = async (runId: string, id: string) => {
    const l = await attempt(`task-list-${id}`, ['orchestration', 'task-list', '--run', runId])
    const t = (l.result?.tasks as any[] | undefined)?.find((x) => x.id === id)
    return { status: t?.status, assignee: t?.assignee_handle ?? null, dispatchId: t?.dispatch_id ?? null }
  }
  try {
    const t1 = await mk('spike-r6-coord')
    const t3 = await mk('spike-r6-coord2')
    const w1 = await mk('spike-r6-w1')
    const w2 = await mk('spike-r6-w2')
    record(probe, '00-terminals', { t1, t3, w1, w2 })
    const run = await attempt('run-create', ['orchestration', 'run-create', '--objective', 'wingline r6 probe', '--from', t1, '--retry-request', randomUUID()])
    const runId = run.result.run.id as string
    let coord = t1
    const create = async (title: string, spec = `probe ${title}`) =>
      (await attempt(`task-create-${title}`, ['orchestration', 'task-create', '--spec', spec, '--task-title', title, '--run', runId, '--from', coord])).result.task.id as string

    // ---- S1：同一终端两个 dispatched 任务 ----
    const a = await create('A')
    const b = await create('B')
    const dA = await attempt('S1-dispatch-A-to-w1', ['orchestration', 'dispatch', '--task', a, '--to', w1, '--from', t1])
    await attempt('S1-dispatch-B-to-w1-while-A-dispatched', ['orchestration', 'dispatch', '--task', b, '--to', w1, '--from', t1])
    record(probe, 'S1-states', { A: await taskState(runId, a), B: await taskState(runId, b) })

    // ---- S2：check / ack ----
    const doneMsg = async (task: string, dispatchRes: any, label: string) =>
      attempt(`S2-worker-done-${label}`, ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', task,
        '--dispatch-id', dispatchRes.result.dispatch.id, '--subject', `done ${label}`, '--run', runId, '--from', w1])
    if (dA.ok) await doneMsg(a, dA, 'A')
    const c1 = await attempt('S2-check-1', ['orchestration', 'check', '--terminal', t1, '--run', runId])
    const d1 = findString(c1.result, /delivery/i)
    const c2 = await attempt('S2-check-2-without-ack', ['orchestration', 'check', '--terminal', t1, '--run', runId])
    const d1again = findString(c2.result, /delivery/i)
    record(probe, 'S2-delivery-ids', { d1, d1again, same: d1 === d1again })
    if (d1) {
      await attempt('S2-ack-d1-then-wait', ['orchestration', 'check', '--terminal', t1, '--run', runId, '--ack', d1, '--wait', '--timeout-ms', '3000'], 30_000)
      await attempt('S2-ack-d1-again', ['orchestration', 'check', '--terminal', t1, '--run', runId, '--ack', d1, '--wait', '--timeout-ms', '3000'], 30_000)
    }
    const dB = await attempt('S2-dispatch-B-to-w1-after-A-done', ['orchestration', 'dispatch', '--task', b, '--to', w1, '--from', t1])
    if (dB.ok) await doneMsg(b, dB, 'B')
    const c3 = await attempt('S2-check-3', ['orchestration', 'check', '--terminal', t1, '--run', runId])
    const d2 = findString(c3.result, /delivery/i)
    await attempt('S2-run-use-to-t3', ['orchestration', 'run-use', '--id', runId, '--from', t3])
    coord = t3
    if (d2) {
      await attempt('S2-old-coord-acks-d2', ['orchestration', 'check', '--terminal', t1, '--run', runId, '--ack', d2])
      await attempt('S2-new-coord-acks-d2', ['orchestration', 'check', '--terminal', t3, '--run', runId, '--ack', d2])
    }
    await attempt('S2-new-coord-check-after', ['orchestration', 'check', '--terminal', t3, '--run', runId])

    // ---- S3：超过 60 s 的 check --wait ----
    if (process.env.WINGLINE_SPIKE_SKIP_S3 !== '1') await attempt('S3-check-wait-75s', ['orchestration', 'check', '--terminal', t3, '--run', runId, '--wait', '--timeout-ms', '75000'], 110_000)

    // ---- S4：ask / reply 的身份 ----
    const c = await create('C')
    await attempt('S4-dispatch-C-to-w2', ['orchestration', 'dispatch', '--task', c, '--to', w2, '--from', t3])
    await attempt('S4-ask-from-w2', ['orchestration', 'ask', '--question', 'r6 probe question?', '--options', 'a,b', '--timeout-ms', '3000', '--run', runId, '--from', w2], 30_000)
    const q = await attempt('S4-coord-check-question', ['orchestration', 'check', '--terminal', t3, '--run', runId])
    const msgs: any[] = q.result?.messages ?? []
    const qid = msgs.find((m) => m.type === 'question')?.id as string | undefined
    record(probe, 'S4-question-id', { qid })
    if (qid) {
      await attempt('S4-reply-from-w1-non-coordinator', ['orchestration', 'reply', '--id', qid, '--body', 'from w1', '--run', runId, '--from', w1])
      await attempt('S4-reply-from-t1-old-coordinator', ['orchestration', 'reply', '--id', qid, '--body', 'from t1', '--run', runId, '--from', t1])
      await attempt('S4-reply-from-t3-coordinator', ['orchestration', 'reply', '--id', qid, '--body', 'from t3', '--run', runId, '--from', t3])
      await attempt('S4-reply-no-from', ['orchestration', 'reply', '--id', qid, '--body', 'no from', '--run', runId])
    }

    // ---- S5：macOS 上的 ORCA_TERMINAL_HANDLE ----
    const envFile = path.join(os.tmpdir(), `wl-r6-env-${process.pid}.txt`)
    const e1 = await mk('spike-r6-env', `sh -c 'env | grep ^ORCA_ > ${envFile}; exec cat'`)
    await sleep(3000)
    const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : null
    record(probe, 'S5-env', { handle: e1, platform: process.platform, envText, matches: envText?.includes(`ORCA_TERMINAL_HANDLE=${e1}`) ?? false })
    if (envText) fs.unlinkSync(envFile)

    // ---- S6：真实 agent（可选） ----
    if (process.env.WINGLINE_SPIKE_AGENT === '1') {
      const ag = await mk('spike-r6-agent', 'claude')
      await attempt('S6-wait-idle', ['terminal', 'wait', '--terminal', ag, '--for', 'tui-idle', '--timeout-ms', '60000'], 90_000)
      await attempt('S6-show-idle', ['terminal', 'show', '--terminal', ag])
      const d = await create('D', 'Reply with exactly the word OK. Do not use any tools.')
      const e = await create('E', 'Reply with exactly the word SECOND. Do not use any tools.')
      await attempt('S6-dispatch-D-inject-idle', ['orchestration', 'dispatch', '--task', d, '--to', ag, '--from', t3, '--inject'])
      await attempt('S6-dispatch-E-inject-busy', ['orchestration', 'dispatch', '--task', e, '--to', ag, '--from', t3, '--inject'])
      await sleep(25_000)
      await attempt('S6-read-after-two-injects', ['terminal', 'read', '--terminal', ag])
      record(probe, 'S6-states', { D: await taskState(runId, d), E: await taskState(runId, e) })
      await attempt('S6-send-permission-trigger', ['terminal', 'send', '--terminal', ag, '--text', 'Use your Bash tool to run exactly this command: uname -a', '--enter'])
      await sleep(15_000)
      await attempt('S6-show-at-permission', ['terminal', 'show', '--terminal', ag])
      await attempt('S6-read-at-permission', ['terminal', 'read', '--terminal', ag])
      await attempt('S6-terminal-list-at-permission', ['terminal', 'list'])
      await attempt('S6-worker-list-at-permission', ['orchestration', 'worker-list', '--run', runId])
    }
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((e) => console.error('close failed', h, e))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
