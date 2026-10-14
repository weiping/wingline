// 阶段 2 第三次复审的补充探针：Orca 的 --retry-request 账本对"失败的调用"和"落地后环境变了的重放"怎么处理。
// 回答 2A spec 第 9.1 节 P1 "明确报错就删行" 是否安全：
//   Q1 一次以 ok:false 结束的调用，会不会被记进账本（之后同 id 同参数重放：重新执行，还是回放那次失败）？
//   Q2 "只有 ready 的任务能派发" 的真实错误码。
//   Q3 一次已落地的 dispatch，在 --to 指向的终端被关闭之后重放：回放，还是报终端类错误？
//   Q4 一次已落地的 worker_done，在 --from（assignee）终端被关闭之后重放：回放，还是报错？
// 只用占位终端（不跑 agent，不 --inject）。会留下 Run（CLI 无法删除）。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/ledger-failure-probe.ts
import { randomUUID } from 'node:crypto'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, record, setup } from './lib.js'

const probe = 'ledger-failure-probe'

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  const mk = async (title: string) => {
    const t = await client.terminalCreate({ worktree, title, command: IDLE_COMMAND })
    open.add(t.handle)
    return t.handle
  }
  const close = async (h: string) => {
    await client.terminalClose({ handle: h })
    open.delete(h)
  }
  let n = 0
  const attempt = async (name: string, args: string[]) => {
    let out: unknown
    try {
      out = { ok: true, result: await runner.json(args) }
    } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message, detail: e.detail } : { ok: false, threw: String(e) }
    }
    record(probe, `${String(++n).padStart(2, '0')}-${name}`, { args, out })
    console.log(name, JSON.stringify(out).slice(0, 300))
    return out as { ok: boolean; result?: any; code?: string }
  }
  const status = async (runId: string, id: string) => {
    const l = await attempt(`task-list-${id}`, ['orchestration', 'task-list', '--run', runId])
    const t = (l.result.tasks as any[]).find((x) => x.id === id)
    return { status: t?.status, assignee: t?.assignee_handle ?? null, dispatchId: t?.dispatch_id ?? null }
  }
  try {
    const coord = await mk('spike-ledger-coord')
    const w1 = await mk('spike-ledger-w1')
    const w2 = await mk('spike-ledger-w2')
    const run = await attempt('run-create', ['orchestration', 'run-create', '--objective', 'wingline ledger-failure probe', '--from', coord, '--retry-request', randomUUID()])
    const runId = run.result.run.id as string
    const create = async (title: string) =>
      (await attempt(`task-create-${title}`, ['orchestration', 'task-create', '--spec', `probe ${title}`, '--task-title', title, '--run', runId, '--from', coord])).result.task.id as string

    // Q2 + Q1(b)：A 已派给 w1；用新 id 把 A 派给 w2 → 状态错误（记下真实错误码）。
    // 然后关掉 w1（Orca 把 A 放回 ready），同 id 同参数重放：重新执行 = 失败没进账本；仍报错/replayed = 进了账本。
    const a = await create('A')
    await attempt('dispatch-A-to-w1', ['orchestration', 'dispatch', '--task', a, '--to', w1, '--from', coord, '--retry-request', randomUUID()])
    const ridA2 = randomUUID()
    const dA2 = ['orchestration', 'dispatch', '--task', a, '--to', w2, '--from', coord, '--retry-request', ridA2]
    await attempt('dispatch-A-to-w2-while-dispatched', dA2)
    await close(w1)
    record(probe, 'A-after-close-w1', await status(runId, a))
    await attempt('dispatch-A-to-w2-replay-after-ready', dA2)
    record(probe, 'A-after-replay', await status(runId, a))

    // Q1(a)：用非协调者的 --from 建任务 → consumer_fenced；run-use 把协调者换成 w2 后，同 id 同参数重放。
    // 放到最后做，免得影响后面的协调者调用 —— 见文件末尾。

    // Q3：B 派给 w3 落地；关掉 w3（B 回 ready）；同 id 同参数重放 dispatch。
    const w3 = await mk('spike-ledger-w3')
    const b = await create('B')
    const dB = ['orchestration', 'dispatch', '--task', b, '--to', w3, '--from', coord, '--retry-request', randomUUID()]
    await attempt('dispatch-B-to-w3', dB)
    await close(w3)
    record(probe, 'B-after-close-w3', await status(runId, b))
    await attempt('dispatch-B-replay-after-target-closed', dB)
    record(probe, 'B-after-replay', await status(runId, b))

    // Q4：C 派给 w4，w4 名下 worker_done 落地；关掉 w4；同 id 同参数重放 worker_done。
    const w4 = await mk('spike-ledger-w4')
    const c = await create('C')
    const dc = await attempt('dispatch-C-to-w4', ['orchestration', 'dispatch', '--task', c, '--to', w4, '--from', coord])
    const dcId = dc.result.dispatch.id as string
    const wC = ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', c, '--dispatch-id', dcId, '--subject', 's', '--run', runId, '--from', w4, '--retry-request', randomUUID()]
    await attempt('worker-done-C', wC)
    await close(w4)
    await attempt('worker-done-C-replay-after-assignee-closed', wC)

    // Q1(c)：一次 worker_done 被拒（--from 不是 assignee → worker_identity_changed），之后同 id 同参数重放。
    // 条件没变，预期还是同样的错误；看错误回执里是否带 replayed 之类的标记。
    const w5 = await mk('spike-ledger-w5')
    const d = await create('D')
    const dd = await attempt('dispatch-D-to-w5', ['orchestration', 'dispatch', '--task', d, '--to', w5, '--from', coord])
    const wD = ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', d, '--dispatch-id', dd.result.dispatch.id, '--subject', 's', '--run', runId, '--from', w2, '--retry-request', randomUUID()]
    await attempt('worker-done-D-from-non-assignee', wD)
    await attempt('worker-done-D-from-non-assignee-replay', wD)

    // Q1(a)：fence 失败是否进账本。
    const ridF = randomUUID()
    const fArgs = ['orchestration', 'task-create', '--spec', 'probe F', '--task-title', 'F', '--run', runId, '--from', w2, '--retry-request', ridF]
    await attempt('task-create-F-fenced', fArgs)
    await attempt('run-use-to-w2', ['orchestration', 'run-use', '--id', runId, '--from', w2])
    await attempt('task-create-F-replay-after-w2-is-coordinator', fArgs)
    await attempt('task-create-F-replay-again', fArgs)
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((e) => console.error('close failed', h, e))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
