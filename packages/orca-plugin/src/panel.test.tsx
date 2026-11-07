import { assert, mockHost, mount, test } from 'orca/testing'

import * as panel from './panel.js'

const TEAM = { name: 'duo', status: 'up', runId: 'r-12345678', posts: 2, specPath: '/tmp/duo/team.yaml' }

test('面板列出团队名', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('duo'), `面板没有画出团队名：${tree}`)
  await p.unmount()
})

test('点「岗位终端」展开岗位，点「打开终端」请求 post.openTerminal', async () => {
  const opened: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': {
        posts: [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'term_1', isLead: true }]
      },
      'post.openTerminal': (input: unknown) => {
        opened.push(input)
        return { navigated: true, handle: 'term_1' }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()

  await p.press({ text: '岗位终端' })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('builder@duo'), '展开后没有画出岗位')

  await p.press({ text: '打开终端' })
  await p.settled()
  assert.deepEqual(opened, [{ address: 'builder@duo' }])
  await p.unmount()
})
