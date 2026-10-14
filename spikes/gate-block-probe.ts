// replay-probe 的续篇：gate-create 会把任务转成 blocked——之后 worker_done 还能不能发、gate-resolve 后任务回到哪个状态、
// worker_done 在任务已终态后用同一个 --retry-request 重放是否回放、completed_at 的格式。
// 只用占位终端。会留下一个 Run（CLI 无法删除）。
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/gate-block-probe.ts
import { randomUUID } from 'node:crypto'
import { WinglineError } from '../packages/core/src/index.js'
import { IDLE_COMMAND, record, setup } from './lib.js'

const probe = 'gate-block-probe'

async function main() {
  const { runner, client, worktree } = setup()
  const handles: string[] = []
  let n = 0
  const attempt = async (name: string, args: string[]) => {
    let out: { ok: boolean; result?: any; code?: string; message?: string }
    try {
      out = { ok: true, result: await runner.json(args) }
    } catch (e) {
      out = e instanceof WinglineError ? { ok: false, code: e.code, message: e.message } : { ok: false, message: String(e) }
    }
    record(probe, `${String(++n).padStart(2, '0')}-${name}`, { args, out })
    return out
  }
  try {
    const t1 = (await client.terminalCreate({ worktree, title: 'spike-gb-coord', command: IDLE_COMMAND })).handle
    handles.push(t1)
    const t2 = (await client.terminalCreate({ worktree, title: 'spike-gb-worker', command: IDLE_COMMAND })).handle
    handles.push(t2)
    const runId = (await attempt('run-create', ['orchestration', 'run-create', '--objective', 'wingline gate-block probe', '--from', t1])).result.run.id as string
    const list = async (name: string) => {
      const r = await attempt(name, ['orchestration', 'task-list', '--run', runId])
      const rows = (r.result.tasks as any[]).map((t) => ({ title: t.task_title, status: t.status, assignee: t.assignee_handle ?? null, dispatch: t.dispatch_id ?? null, completed_at: t.completed_at }))
      console.log(name, JSON.stringify(rows))
    }
    const task = async (title: string) =>
      (await attempt(`create-${title}`, ['orchestration', 'task-create', '--spec', title, '--task-title', title, '--run', runId, '--from', t1])).result.task.id as string
    const dispatch = async (title: string, id: string) =>
      (await attempt(`dispatch-${title}`, ['orchestration', 'dispatch', '--task', id, '--to', t2, '--from', t1])).result.dispatch.id as string
    const gate = (title: string, id: string) =>
      attempt(`gate-create-${title}`, ['orchestration', 'gate-create', '--task', id, '--question', 'q', '--options', '["a","b"]', '--from', t1])
    const done = (label: string, id: string, ctx: string, outcome: string, rid?: string) =>
      attempt(`worker-done-${label}`, ['orchestration', 'send', '--type', 'worker_done', '--outcome', outcome, '--task-id', id, '--dispatch-id', ctx, '--subject', label, '--run', runId, '--from', t2, ...(rid ? ['--retry-request', rid] : [])])
    const show = (label: string, r: { ok: boolean; result?: any; code?: string; message?: string }) =>
      console.log(label, r.ok ? JSON.stringify(r.result?.mutation ?? {}) : `${r.code}: ${r.message}`)

    if (process.argv.includes('--part2')) {
      // D：worker_done(succeeded) + 同 id 重放；F：failed → gate-create → gate-resolve 后的状态
      const d = await task('D'); const ctxD = await dispatch('D', d)
      const ridD = randomUUID()
      show('worker-done-D', await done('D', d, ctxD, 'succeeded', ridD))
      show('worker-done-D-replay', await done('D', d, ctxD, 'succeeded', ridD))
      const f = await task('F'); const ctxF = await dispatch('F', f)
      show('worker-done-F-failed', await done('F-failed', f, ctxF, 'failed'))
      const gF = (await gate('F', f)).result.gate.id as string
      await list('list-after-gate-F')
      show('gate-resolve-F', await attempt('gate-resolve-F', ['orchestration', 'gate-resolve', '--id', gF, '--resolution', 'a', '--from', t1]))
      await list('list-after-resolve-F')
      show('redispatch-F-after-resolve', await attempt('redispatch-F', ['orchestration', 'dispatch', '--task', f, '--to', t2, '--from', t1]))
      await list('list-after-redispatch-F')
      console.log(`RESULT ${probe} part2 done run=${runId}`)
      return
    }
    // A：dispatched → gate-create → worker_done(failed)
    const a = await task('A'); const ctxA = await dispatch('A', a)
    show('gate-create-A', await gate('A', a))
    await list('list-after-gate-A')
    show('worker-done-A-failed-while-blocked', await done('A-failed-while-blocked', a, ctxA, 'failed'))
    await list('list-after-done-A')

    // B：dispatched → gate-create → gate-resolve → worker_done(succeeded) + 重放
    const b = await task('B'); const ctxB = await dispatch('B', b)
    const gB = (await gate('B', b)).result.gate.id as string
    show('gate-resolve-B', await attempt('gate-resolve-B', ['orchestration', 'gate-resolve', '--id', gB, '--resolution', 'a', '--from', t1]))
    await list('list-after-resolve-B')
    const ridB = randomUUID()
    show('worker-done-B', await done('B', b, ctxB, 'succeeded', ridB))
    show('worker-done-B-replay', await done('B', b, ctxB, 'succeeded', ridB))
    await list('list-after-done-B')

    // C：dispatched → worker_done(failed) + 重放 → gate-create（已知可行）→ 状态
    const c = await task('C'); const ctxC = await dispatch('C', c)
    const ridC = randomUUID()
    show('worker-done-C-failed', await done('C', c, ctxC, 'failed', ridC))
    show('worker-done-C-failed-replay', await done('C', c, ctxC, 'failed', ridC))
    show('gate-create-C-after-failed', await gate('C', c))
    await list('list-after-gate-C')

    // E：ready（未派发）→ gate-create → gate-resolve
    const e = await task('E')
    const gE = (await gate('E', e)).result.gate.id as string
    await list('list-after-gate-E')
    await attempt('gate-resolve-E', ['orchestration', 'gate-resolve', '--id', gE, '--resolution', 'b', '--from', t1])
    await list('list-after-resolve-E')
    console.log(`RESULT ${probe} done run=${runId}`)
  } finally {
    for (const h of handles) await client.terminalClose({ handle: h }).catch((err) => console.error('close failed', h, err))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
