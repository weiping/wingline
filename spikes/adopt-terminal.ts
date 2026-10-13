// 假设：worker-start --terminal <handle> 能接管 terminal create 建出的终端；terminal send 能收下 12,000 字符。
import { IDLE_COMMAND, finish, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const created = await client.terminalCreate({ worktree, title: 'spike-adopt', command: IDLE_COMMAND })
let adopt: 'ok' | 'rejected' = 'rejected'
let long: 'ok' | 'rejected' = 'rejected'
try {
  await client.terminalWait({ handle: created.handle, forState: 'tui-idle', timeoutMs: 30_000 })
  try {
    record('adopt-terminal', 'worker-start', await runner.json(['orchestration', 'worker-start', '--spec', 'spike: adopt', '--terminal', created.handle, '--worktree', worktree]))
    adopt = 'ok'
  } catch (e) { record('adopt-terminal', 'worker-start-error', String(e)) }
  try {
    const sent = await client.terminalSend({ handle: created.handle, text: 'x'.repeat(12_000), enter: true, waitSubmitSec: 10 })
    record('adopt-terminal', 'send-12000', sent)
    const read = await runner.json<unknown>(['terminal', 'read', '--terminal', created.handle])
    record('adopt-terminal', 'read-after-send', read)
    long = JSON.stringify(read).includes('x'.repeat(2000)) ? 'ok' : 'rejected'
  } catch (e) { record('adopt-terminal', 'send-12000-error', String(e)) }
} finally {
  await client.terminalClose({ handle: created.handle })
}
finish('adopt-terminal', adopt === 'ok' && long === 'ok' ? '成立' : adopt === 'ok' || long === 'ok' ? '部分成立' : '不成立', `adopt=${adopt} long-send=${long}`)
