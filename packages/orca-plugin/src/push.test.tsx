import { assert, mockHost, mount, test } from 'orca/testing'

import * as panel from './panel.js'

const TEAM = { name: 'duo', status: 'up', runId: 'r1', posts: 1, specPath: '/tmp/x' }

test('worker 推送 posts/inbox/tasks changed 时面板跟着更新', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': { posts: [] },
      'team.tasks': { tasks: [] },
      'team.inbox': { team: 'duo', pending: 0, dispatcher: { state: 'running' }, frozen: [], signals: [], questions: [], stale: [], warnings: [], unavailable: [] }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()

  // 岗位视图（默认）：推送后岗位列表更新
  await p.post('posts.changed', { team: 'duo', posts: [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h', isLead: true }] })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('builder@duo'), '岗位推送没生效')

  // 切到任务视图：先手动重取（空），再推送任务 → 更新
  await p.press({ text: '任务' })
  await p.settled()
  await p.post('tasks.changed', { team: 'duo', tasks: [{ id: 't1', status: 'ready', title: '推送来的任务', kind: 'work', tags: [], claimedBy: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null }] })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('推送来的任务'), '任务推送没生效')

  // 收件箱推送：待处理计数徽标（未展开收件箱也可见）
  await p.post('inbox.changed', { team: 'duo', inbox: { team: 'duo', pending: 3, dispatcher: { state: 'running' }, frozen: [], signals: [], questions: [], stale: [], warnings: [], unavailable: [] } })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('待处理'), '收件箱推送没生效')
  await p.unmount()
})
