// 假设：多个 Run 可并存；Orca 重启后 Run 仍在。第一次运行建 Run；重启 Orca 后加 --verify 再运行一次。
import fs from 'node:fs'
import path from 'node:path'
import { IDLE_COMMAND, finish, record, setup } from './lib.js'

const { runner, client, worktree } = setup()
const stateFile = path.join('spikes', 'out', 'run-lifetime', process.platform, 'runs.json')

if (process.argv.includes('--verify')) {
  const ids: string[] = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const list = JSON.stringify(await runner.json<unknown>(['orchestration', 'run-list']))
  record('run-lifetime', 'run-list-after-restart', list)
  const survived = ids.filter((id) => list.includes(id)).length
  finish('run-lifetime', survived === ids.length ? '成立' : survived > 0 ? '部分成立' : '不成立', `重启后 ${survived}/${ids.length} 个 Run 仍在`)
} else {
  // run-create 需要发送方终端：在 Orca 终端内运行，或像这里一样用 --from 指定一个终端 handle
  const sender = await client.terminalCreate({ worktree, title: 'spike-run-sender', command: IDLE_COMMAND })
  const create = async (objective: string) =>
    (await runner.json<{ run: { id: string } }>(['orchestration', 'run-create', '--objective', objective, '--from', sender.handle])).run.id
  const a = await create('wingline:spike-a')
  const b = await create('wingline:spike-b')
  await client.terminalClose({ handle: sender.handle })
  record('run-lifetime', 'run-list-before-restart', await runner.json<unknown>(['orchestration', 'run-list']))
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify([a, b]))
  console.log(`已创建 Run ${a}、${b}。请完全退出并重新打开 Orca，然后运行：pnpm tsx spikes/run-lifetime.ts --verify`)
}
