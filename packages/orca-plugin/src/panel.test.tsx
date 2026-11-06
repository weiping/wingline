import { assert, mockHost, mount, test } from 'orca/testing'

import * as panel from './panel.js'

test('面板列出团队名', async () => {
  const host = mockHost({
    requests: {
      'teams.list': {
        teams: [{ name: 'duo', status: 'up', runId: 'r1', posts: 2, specPath: '/tmp/duo.yaml' }]
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('duo'), `面板没有画出团队名：${tree}`)
  await p.unmount()
})
