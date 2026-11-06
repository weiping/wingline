// 用 mock host 跑 src/worker.ts 的 activate(orca)：不启动真实 Orca、不改真实账本。
import { assert, mountWorker, test } from 'orca/testing'

import * as main from './worker.js'

test('worker 能应答 teams.list', async () => {
  const worker = await mountWorker(main)
  const answer = (await worker.request('teams.list')) as { teams: unknown[] }
  assert.ok(Array.isArray(answer.teams))
  await worker.deactivate()
})
