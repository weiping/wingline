import { assert, mockHost, mount, test } from 'orca/testing'

import * as panel from './panel.js'

const TEAM = { name: 'duo', status: 'up', runId: 'r-12345678', posts: 2, specPath: '/tmp/duo/team.yaml' }
const POSTS = {
  posts: [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'term_1', isLead: true }]
}
const INBOX = {
  team: 'duo',
  pending: 2,
  dispatcher: { state: 'running' },
  frozen: [{ post: 'builder@duo', reason: '闸门连败', frozenAt: '2026-11-07T00:00:00Z' }],
  signals: [],
  questions: [{ messageId: 'm1', asker: 'checker@duo', body: '要改哪个文件？', options: ['a', 'b'], relayedAt: '2026-11-07T00:00:00Z' }],
  stale: [],
  warnings: [],
  unavailable: []
}
const TASKS = {
  tasks: [{ id: 't1', status: 'ready', title: '实现登录', kind: 'work', tags: [], claimedBy: null, epoch: 0, gateFailures: 0, readySince: null, dispatchedAt: null }]
}

test('面板列出团队名', async () => {
  const host = mockHost({ requests: { 'teams.list': { teams: [TEAM] } } })
  const p = await mount(panel, { host })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('duo'), `面板没有画出团队名：${tree}`)
  await p.unmount()
})

test('展开后能列出岗位，点「打开终端」请求 post.openTerminal', async () => {
  const opened: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'post.openTerminal': (input: unknown) => {
        opened.push(input)
        return { navigated: true, handle: 'term_1' }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()

  await p.press({ text: '展开' })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('builder@duo'), '展开后没有画出岗位')

  await p.press({ text: '打开终端' })
  await p.settled()
  assert.deepEqual(opened, [{ address: 'builder@duo' }])
  await p.unmount()
})

test('收件箱视图列出冻结与提问，并显示待处理计数', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.inbox': INBOX,
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()

  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '收件箱' })
  await p.settled()

  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('待处理'), `没有待处理计数：${tree}`)
  assert.ok(tree.includes('冻结'), `没有冻结条目：${tree}`)
  assert.ok(tree.includes('要改哪个文件'), `没有提问条目：${tree}`)
  await p.unmount()
})

test('任务视图列出任务标题与状态', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.tasks': TASKS,
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()

  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '任务' })
  await p.settled()

  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('实现登录'), `没有任务标题：${tree}`)
  assert.ok(tree.includes('ready'), `没有任务状态：${tree}`)
  await p.unmount()
})
