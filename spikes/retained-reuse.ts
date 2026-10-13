// 假设：已 retain 的终端能连续接活两次。
import { IDLE_COMMAND, finish, findString, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const created = await client.terminalCreate({ worktree, title: 'spike-retain', command: IDLE_COMMAND })
let served = 0
try {
  await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 30_000 })
  for (const n of [1, 2]) {
    try {
      const started = await runner.json<unknown>(['orchestration', 'worker-start', '--spec', `spike: reuse ${n}`, '--terminal', created.handle, '--worktree', worktree])
      record('retained-reuse', `worker-start-${n}`, started)
      const dispatch = findString(started, /dispatch.?id/i)
      if (dispatch) record('retained-reuse', `worker-retain-${n}`, await runner.json<unknown>(['orchestration', 'worker-retain', '--dispatch', dispatch]))
      served++
    } catch (e) { record('retained-reuse', `worker-start-${n}-error`, String(e)) }
  }
  record('retained-reuse', 'terminal-list', await client.terminalList({ worktree }))
} finally {
  await client.terminalClose({ handle: created.handle })
}
finish('retained-reuse', served === 2 ? '成立' : served === 1 ? '部分成立' : '不成立', `同一终端接活 ${served}/2 次`)
