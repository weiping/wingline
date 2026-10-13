// 假设：多个 Run 可并存；Orca 重启后 Run 仍在。第一次运行建 Run；重启 Orca 后加 --verify 再运行一次。
import fs from 'node:fs'
import path from 'node:path'
import { finish, record, setup } from './lib.js'

const { runner, client } = setup()
const stateFile = path.join('spikes', 'out', 'run-lifetime', process.platform, 'runs.json')

if (process.argv.includes('--verify')) {
  const ids: string[] = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const list = JSON.stringify(await runner.json<unknown>(['orchestration', 'run-list']))
  record('run-lifetime', 'run-list-after-restart', list)
  const survived = ids.filter((id) => list.includes(id)).length
  finish('run-lifetime', survived === ids.length ? '成立' : survived > 0 ? '部分成立' : '不成立', `重启后 ${survived}/${ids.length} 个 Run 仍在`)
} else {
  const a = await client.runCreate({ objective: 'wingline:spike-a', retryRequest: `spike:run-a:${Date.now()}` })
  const b = await client.runCreate({ objective: 'wingline:spike-b', retryRequest: `spike:run-b:${Date.now()}` })
  record('run-lifetime', 'run-list-before-restart', await runner.json<unknown>(['orchestration', 'run-list']))
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify([a.runId, b.runId]))
  console.log(`已创建 Run ${a.runId}、${b.runId}。请完全退出并重新打开 Orca，然后运行：pnpm tsx spikes/run-lifetime.ts --verify`)
}
