// 阶段 2 第二次复审的补充探针：幂等重放在"任务状态已经前进之后"是否仍然成立、协调者换手后重放/check 的行为、
// run-use 的直接回执形状、completed_at 的格式、Run 不存在时 run-use 的错误码。
// 只用占位终端（不跑 agent，不 --inject）。会留下一个 Run（CLI 无法删除）。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/replay-probe.ts
import { randomUUID } from 'node:crypto'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, record, setup } from './lib.js'

const probe = 'replay-probe'

async function main() {
  const { runner, client, worktree } = setup()
  const handles: string[] = []
  const mk = async (title: string) => {
    const t = await client.terminalCreate({ worktree, title, command: IDLE_COMMAND })
    handles.push(t.handle)
    return t.handle
  }
  let n = 0
  const attempt = async (name: string, args: string[]) => {
    let out: unknown
    try {
      out = { ok: true, result: await runner.json(args) }
    } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message } : { ok: false, threw: String(e) }
    }
    record(probe, `${String(++n).padStart(2, '0')}-${name}`, { args, out })
    console.log(name, JSON.stringify(out).slice(0, 300))
    return out as { ok: boolean; result?: any; code?: string }
  }
  try {
    const t1 = await mk('spike-replay-coord')
    const t2 = await mk('spike-replay-worker')
    const t3 = await mk('spike-replay-coord2')
    record(probe, '00-terminals', { t1, t2, t3 })

    const ridRun = randomUUID()
    const runArgs = ['orchestration', 'run-create', '--objective', 'wingline replay probe', '--from', t1, '--retry-request', ridRun]
    const run = await attempt('run-create', runArgs)
    const runId = run.result.run.id as string
    await attempt('run-create-replay', runArgs)

    const ridTc = randomUUID()
    const tcArgs = (from: string) => ['orchestration', 'task-create', '--spec', 'probe X', '--task-title', 'X', '--run', runId, '--from', from, '--retry-request', ridTc]
    const tc = await attempt('task-create-X', tcArgs(t1))
    const x = tc.result.task.id as string

    const ridD = randomUUID()
    const dArgs = (to: string) => ['orchestration', 'dispatch', '--task', x, '--to', to, '--from', t1, '--retry-request', ridD]
    await attempt('dispatch-X', dArgs(t2))
    await attempt('task-create-X-replay-after-dispatched', tcArgs(t1))
    await attempt('dispatch-X-replay-same-args-after-dispatched', dArgs(t2))
    await attempt('dispatch-X-same-id-different-to', dArgs(t1))

    const ridG = randomUUID()
    const gArgs = ['orchestration', 'gate-create', '--task', x, '--question', 'probe q', '--options', '["a","b"]', '--from', t1, '--retry-request', ridG]
    await attempt('gate-create-X', gArgs)
    await attempt('gate-create-X-replay', gArgs)

    // worker_done 的 --from 是否必须等于 assignee（单独一个任务 Y，免得把 X 弄成终态）
    const y = (await attempt('task-create-Y', ['orchestration', 'task-create', '--spec', 'probe Y', '--task-title', 'Y', '--run', runId, '--from', t1])).result.task.id as string
    const dy = await attempt('dispatch-Y', ['orchestration', 'dispatch', '--task', y, '--to', t2, '--from', t1])
    const dyId = dy.result.dispatch.id as string
    await attempt('worker-done-Y-from-non-assignee', ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', y, '--dispatch-id', dyId, '--subject', 's', '--run', runId, '--from', t3])

    const list1 = await attempt('task-list-before-done', ['orchestration', 'task-list', '--run', runId])
    const dispatchIdX = (list1.result.tasks as any[]).find((t) => t.id === x).dispatch_id as string
    const ridW = randomUUID()
    const wArgs = ['orchestration', 'send', '--type', 'worker_done', '--outcome', 'succeeded', '--task-id', x, '--dispatch-id', dispatchIdX, '--subject', 'gate passed', '--run', runId, '--from', t2, '--retry-request', ridW]
    await attempt('worker-done-X', wArgs)
    await attempt('worker-done-X-replay-after-completed', wArgs)
    await attempt('task-list-after-done', ['orchestration', 'task-list', '--run', runId])
    await attempt('dispatch-X-replay-after-completed', dArgs(t2))
    await attempt('task-create-X-replay-after-completed', tcArgs(t1))

    // 协调者换手
    await attempt('run-use-to-t3', ['orchestration', 'run-use', '--id', runId, '--from', t3, '--retry-request', randomUUID()])
    await attempt('run-show-after-run-use', ['orchestration', 'run-show', '--id', runId])
    await attempt('task-create-X-replay-old-from-after-handover', tcArgs(t1))
    await attempt('task-create-X-replay-new-from-after-handover', tcArgs(t3))
    await attempt('task-create-new-from-old-coordinator', ['orchestration', 'task-create', '--spec', 'probe Z', '--task-title', 'Z', '--run', runId, '--from', t1])
    await attempt('check-from-old-coordinator', ['orchestration', 'check', '--terminal', t1, '--run', runId])
    await attempt('check-from-new-coordinator', ['orchestration', 'check', '--terminal', t3, '--run', runId])
    await attempt('check-from-worker', ['orchestration', 'check', '--terminal', t2, '--run', runId])
    await attempt('run-use-nonexistent-run', ['orchestration', 'run-use', '--id', 'run_000000000000', '--from', t3])
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of handles) await client.terminalClose({ handle: h }).catch((e) => console.error('close failed', h, e))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
