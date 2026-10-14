// 阶段 2 第二次复审补充探针（第三段）：
//   a) dispatch --inject 被拒（inject_rejected）后，任务是否仍是 ready（明确的 Orca 错误是否意味着没有发生任何变更）
//   b) 协调者终端被关闭后，用它的 handle 当 --from 是否仍被接受（值匹配是否连终端存活都不看）
//   c) assignee 终端已关闭的 dispatched 任务（孤儿），gate-create 能否把它转成 blocked，gate-resolve 后能否重新派发
// 只用占位终端。会留下一个 Run（CLI 无法删除）。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/orphan-probe.ts
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, record, setup } from './lib.js'

const probe = 'orphan-probe'

async function main() {
  const { runner, client, worktree } = setup()
  const open = new Set<string>()
  let n = 0
  const attempt = async (name: string, args: string[]) => {
    let out: { ok: boolean; result?: any; code?: string; message?: string }
    try {
      out = { ok: true, result: await runner.json(args) }
    } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message } : { ok: false, message: String(e) }
    }
    record(probe, `${String(++n).padStart(2, '0')}-${name}`, { args, out })
    console.log(name, out.ok ? JSON.stringify(out.result?.mutation ?? 'ok') : `${out.code}: ${out.message}`)
    return out
  }
  const mk = async (title: string) => {
    const h = (await client.terminalCreate({ worktree, title, command: IDLE_COMMAND })).handle
    open.add(h)
    return h
  }
  const close = async (h: string) => { await client.terminalClose({ handle: h }); open.delete(h) }
  try {
    const t1 = await mk('spike-orphan-coord')
    const t2 = await mk('spike-orphan-worker')
    const t4 = await mk('spike-orphan-worker2')
    const runId = (await attempt('run-create', ['orchestration', 'run-create', '--objective', 'wingline orphan probe', '--from', t1])).result.run.id as string
    const status = async (name: string) => {
      const r = await attempt(name, ['orchestration', 'task-list', '--run', runId])
      console.log('  ', JSON.stringify((r.result.tasks as any[]).map((t) => [t.task_title, t.status, t.assignee_handle ?? null])))
    }
    const create = async (title: string) =>
      (await attempt(`create-${title}`, ['orchestration', 'task-create', '--spec', title, '--task-title', title, '--run', runId, '--from', t1])).result.task.id as string

    // a) inject 被拒后的任务状态
    const a = await create('A')
    await attempt('dispatch-A-inject-to-placeholder', ['orchestration', 'dispatch', '--task', a, '--to', t2, '--from', t1, '--inject'])
    await status('list-after-inject-rejected')

    // c) 孤儿：派给 t4，关掉 t4，再 gate-create / gate-resolve / 重新派给 t2
    const c = await create('C')
    await attempt('dispatch-C-to-t4', ['orchestration', 'dispatch', '--task', c, '--to', t4, '--from', t1])
    await close(t4)
    await status('list-after-assignee-closed')
    const g = await attempt('gate-create-C-orphan', ['orchestration', 'gate-create', '--task', c, '--question', 'assignee gone', '--from', t1])
    await status('list-after-gate-orphan')
    if (g.ok) {
      await attempt('gate-resolve-C', ['orchestration', 'gate-resolve', '--id', g.result.gate.id, '--resolution', 'retry', '--from', t1])
      await attempt('redispatch-C-to-t2', ['orchestration', 'dispatch', '--task', c, '--to', t2, '--from', t1])
      await status('list-after-redispatch')
    }

    // b) 关掉协调者终端后，用它的 handle 当 --from
    await close(t1)
    await attempt('task-create-from-closed-coordinator', ['orchestration', 'task-create', '--spec', 'B', '--task-title', 'B', '--run', runId, '--from', t1])
    await attempt('run-show-after-coordinator-closed', ['orchestration', 'run-show', '--id', runId])
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of open) await client.terminalClose({ handle: h }).catch((err) => console.error('close failed', h, err))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
