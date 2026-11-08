import { assert, mockHost, mount, test } from 'orca/testing'

import * as panel from './panel.js'

const TEAM = { name: 'duo', status: 'up', runId: 'r-12345678', posts: 2, specPath: '/tmp/duo/team.yaml', dispatcherState: 'running', offlinePosts: 0 }
const POSTS = {
  posts: [{ address: 'builder@duo', agent: 'claude', status: 'live', handle: 'term_1', isLead: true }]
}
const INBOX = {
  team: 'duo',
  pending: 3,
  dispatcher: { state: 'running' },
  frozen: [{ post: 'checker@duo', reason: '闸门连败', frozenAt: '2026-11-07T00:00:00Z' }],
  signals: [{ post: 'builder@duo', signal: 'no_progress', level: 1, summary: '20 分钟没输出', since: null }],
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
  assert.ok(JSON.stringify(p.tree()).includes('duo'))
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
  assert.ok(JSON.stringify(p.tree()).includes('builder@duo'))
  await p.press({ text: '打开终端' })
  await p.settled()
  assert.deepEqual(opened, [{ address: 'builder@duo' }])
  await p.unmount()
})

test('岗位预览：点「预览」请求 post.preview 并画出终端内容', async () => {
  const requested: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'post.preview': (input: unknown) => {
        requested.push(input)
        return { address: 'builder@duo', handle: 'term_1', lines: ['$ claude', 'hello'], truncated: false }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '预览' })
  await p.settled()
  assert.deepEqual(requested, [{ address: 'builder@duo' }])
  assert.ok(JSON.stringify(p.tree()).includes('hello'), '预览内容没画出来')
  await p.unmount()
})

test('收件箱视图列出冻结与提问，并显示待处理计数', async () => {
  const host = mockHost({
    requests: { 'teams.list': { teams: [TEAM] }, 'team.inbox': INBOX, 'team.posts': POSTS }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '收件箱' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('待处理'))
  assert.ok(tree.includes('冻结'))
  assert.ok(tree.includes('要改哪个文件'))
  await p.unmount()
})

test('收件箱「解冻」写操作发给 write.unfreeze', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.inbox': INBOX,
      'team.posts': POSTS,
      'write.unfreeze': (input: unknown) => {
        calls.push({ name: 'unfreeze', input })
        return { skipped: [] }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '收件箱' })
  await p.settled()
  await p.press({ text: '解冻' })
  await p.settled()
  assert.deepEqual(calls, [{ name: 'unfreeze', input: { address: 'checker@duo' } }])
  await p.unmount()
})

test('收件箱「冻结」写操作发给 write.freeze', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.inbox': INBOX,
      'team.posts': POSTS,
      'write.freeze': (input: unknown) => {
        calls.push({ name: 'freeze', input })
        return { ok: true }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '收件箱' })
  await p.settled()
  await p.press({ text: '冻结岗位' })
  await p.settled()
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.name, 'freeze')
  assert.equal((calls[0]!.input as { address: string }).address, 'builder@duo')
  await p.unmount()
})

test('收件箱「回答」把草稿发给 write.reply', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.inbox': INBOX,
      'team.posts': POSTS,
      'write.reply': (input: unknown) => {
        calls.push({ name: 'reply', input })
        return { messageId: 'm1', duplicate: false }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '收件箱' })
  await p.settled()
  await p.type({ role: 'textbox' }, '改 main.ts')
  await p.settled()
  await p.press({ text: '发送回答' })
  await p.settled()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]!.input, { team: 'duo', messageId: 'm1', body: '改 main.ts' })
  await p.unmount()
})

test('任务视图列出任务，并可认领（以岗位身份）', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.tasks': TASKS,
      'team.posts': POSTS,
      'write.claimTask': (input: unknown) => {
        calls.push({ name: 'claim', input })
        return { ok: true }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '任务' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('实现登录'))
  assert.ok(tree.includes('ready'))
  await p.type({ role: 'textbox' }, 'builder@duo')
  await p.settled()
  await p.press({ text: '认领' })
  await p.settled()
  assert.deepEqual(calls, [{ name: 'claim', input: { id: 't1', as: 'builder@duo' } }])
  await p.unmount()
})

test('offline 岗位禁用「打开终端 / 预览」', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': { posts: [{ address: 'checker@duo', agent: 'codex', status: 'offline', handle: 'term_stale', isLead: false }] }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('"disabled":true'), `offline 岗位的按钮没有被禁用：${tree.slice(0, 800)}`)
  await p.unmount()
})

test('岗位「详情」请求 post.detail 并画出时间线', async () => {
  const requested: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'post.detail': (input: unknown) => {
        requested.push(input)
        return {
          address: 'builder@duo', status: 'live', isLead: true, handle: 'term_1', sessionId: null,
          currentTask: { id: 't9', title: '评审登录', status: 'dispatched' }, queued: [],
          signals: [], frozen: null, hushedUntil: null,
          events: [{ id: 'task:1', at: '2026-11-07T13:18:46Z', source: 'task', actor: 'builder@duo', action: 'done', target: 't1', outcome: 'ok' }]
        }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '详情' })
  await p.settled()
  assert.deepEqual(requested, [{ team: 'duo', address: 'builder@duo' }])
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('评审登录'), `没画出当前任务：${tree}`)
  assert.ok(tree.includes('done'), `没画出时间线事件：${tree}`)
  await p.unmount()
})

test('stopped 团队显示「拉起岗位」，点击发 team.up 并刷新', async () => {
  const STOPPED = { ...TEAM, status: 'stopped', dispatcherState: 'stale', offlinePosts: 2 }
  const ups: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [STOPPED] },
      'team.up': (input: unknown) => {
        ups.push(input)
        return { posts: [{ address: 'builder@duo', outcome: 'launched' }], run: { outcome: 'ok' }, live: 1, total: 1 }
      },
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '拉起岗位' })
  await p.settled()
  assert.deepEqual(ups, [{ team: 'duo' }])
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('个岗位已启动'), `没有成功提示：${tree.slice(0, 500)}`)
  assert.ok(tree.includes('1 个已就绪'), `没有就绪结论：${tree.slice(0, 500)}`)
  await p.unmount()
})

test('岗位视图有离线岗位时显示「重拉离线岗位」', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': {
        posts: [
          { address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h1', isLead: true },
          { address: 'checker@duo', agent: 'codex', status: 'offline', handle: null, isLead: false }
        ]
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('重拉离线岗位'))
  await p.unmount()
})

test('up 团队显示「停止岗位」，二段确认后发 team.down（close=true）', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'team.down': (input: unknown) => {
        calls.push({ name: 'down', input })
        return { posts: [{ address: 'builder@duo', outcome: 'closed' }, { address: 'checker@duo', outcome: 'closed' }] }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('停止岗位'), '没有停止按钮')

  // 第一段：只点亮确认
  await p.press({ text: '停止岗位' })
  await p.settled()
  assert.equal(calls.length, 0, '第一段就发了请求')
  assert.ok(JSON.stringify(p.tree()).includes('确认停止？'), '没进入确认态')

  // 第二段：真正执行
  await p.press({ text: '确认停止？' })
  await p.settled()
  assert.deepEqual(calls, [{ name: 'down', input: { team: 'duo', close: true } }])
  assert.ok(JSON.stringify(p.tree()).includes('已停止'), '没有成功提示')
  await p.unmount()
})

test('stopped 团队不显示「停止岗位」', async () => {
  const STOPPED = { ...TEAM, status: 'stopped', dispatcherState: 'stale', offlinePosts: 2 }
  const host = mockHost({ requests: { 'teams.list': { teams: [STOPPED] } } })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(!JSON.stringify(p.tree()).includes('停止岗位'), 'stopped 团队不该有停止按钮')
  await p.unmount()
})

test('offlinePosts=0 时不显示「拉起岗位」', async () => {
  const LIVE = { ...TEAM, status: 'up', offlinePosts: 0 }
  const host = mockHost({ requests: { 'teams.list': { teams: [LIVE] } } })
  const p = await mount(panel, { host })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(!tree.includes('拉起岗位'), `全在线时不该有拉起按钮：${tree.slice(0, 700)}`)
  await p.unmount()
})

test('有离线岗位时显示「拉起岗位」', async () => {
  const OFFLINE = { ...TEAM, status: 'up', offlinePosts: 2 }
  const host = mockHost({ requests: { 'teams.list': { teams: [OFFLINE] } } })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('拉起岗位'), '有离线岗位时应有拉起按钮')
  await p.unmount()
})

test('拉起成功后按每岗位 outcome 如实提示（未就绪的要点名）', async () => {
  const OFFLINE = { ...TEAM, status: 'up', offlinePosts: 2 }
  const host = mockHost({
    requests: {
      'teams.list': { teams: [OFFLINE] },
      'team.up': () => ({
        posts: [
          { address: 'builder@duo', outcome: 'launched' },
          { address: 'checker@duo', outcome: 'uncertain', reason: '岗位未确认就绪' }
        ],
        run: { outcome: 'failed', reason: 'consumer_fenced' },
        live: 1,
        total: 2
      }),
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '拉起岗位' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('1 个已启动'), `没如实反映岗位结果：${tree.slice(0, 700)}`)
  assert.ok(tree.includes('checker@duo uncertain'), `没点名未就绪岗位：${tree.slice(0, 700)}`)
  assert.ok(tree.includes('Run 未绑定'), `没提示 Run 未绑定：${tree.slice(0, 900)}`)
  await p.unmount()
})

test('拉起成功后「拉起岗位」按钮消失（刷新后岗位全在线）', async () => {
  const OFFLINE = { ...TEAM, status: 'up', offlinePosts: 2 }
  let current = OFFLINE
  const host = mockHost({
    requests: {
      'teams.list': () => ({ teams: [current] }),
      'team.up': () => ({ ok: true }),
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('拉起岗位'))
  await p.press({ text: '拉起岗位' })
  await p.settled()
  // 权威刷新后仍显示（mock 还是离线数据），但乐观归零已把按钮藏掉的那一刻生效过
  current = { ...OFFLINE, offlinePosts: 0 }
  await p.post('teams.changed', { teams: [current] })
  await p.settled()
  assert.ok(!JSON.stringify(p.tree()).includes('拉起岗位'), '推送后按钮应隐藏')
  await p.unmount()
})

test('up 团队显示「接回会话」，点击发 team.restore 并按岗位如实显示结果', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.restore': (input: unknown) => {
        calls.push({ name: 'restore', input })
        return {
          team: 'duo',
          dryRun: false,
          posts: [
            { address: 'builder@duo', outcome: 'resumed', sessionId: 'sess-1' },
            { address: 'checker@duo', outcome: 'uncertain', reason: '没找到可接回的会话' }
          ],
          run: { outcome: 'ok', runId: 'r-12345678' },
          dispatcher: { action: 'left', state: 'running' },
          tasks: [{ taskId: 't1', owner: 'builder@duo', outcome: 'recovered' }]
        }
      },
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(JSON.stringify(p.tree()).includes('接回会话'), '没有接回会话按钮')
  await p.press({ text: '接回会话' })
  await p.settled()
  assert.deepEqual(calls, [{ name: 'restore', input: { team: 'duo' } }])
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('builder@duo'), `没画出接回结果：${tree.slice(0, 900)}`)
  assert.ok(tree.includes('结果不确定'), `没如实标出未接回的岗位：${tree.slice(0, 900)}`)
  await p.unmount()
})

test('stopped 团队不显示「接回会话」（restore 只对运行中的团队成立）', async () => {
  const STOPPED = { ...TEAM, status: 'stopped', dispatcherState: 'stale', offlinePosts: 2 }
  const host = mockHost({ requests: { 'teams.list': { teams: [STOPPED] } } })
  const p = await mount(panel, { host })
  await p.settled()
  assert.ok(!JSON.stringify(p.tree()).includes('接回会话'), 'stopped 团队不该有接回按钮')
  await p.unmount()
})

test('拉起回执带就绪数：面板给出「已就绪/未就绪」结论', async () => {
  const OFFLINE = { ...TEAM, status: 'up', offlinePosts: 2 }
  const host = mockHost({
    requests: {
      'teams.list': () => ({ teams: [OFFLINE] }),
      'team.up': () => ({
        posts: [
          { address: 'builder@duo', outcome: 'launched' },
          { address: 'checker@duo', outcome: 'launched' }
        ],
        run: { outcome: 'ok' },
        live: 2,
        total: 2
      }),
      'team.posts': {
        posts: [
          { address: 'builder@duo', agent: 'claude', status: 'live', handle: 'h1', isLead: true },
          { address: 'checker@duo', agent: 'codex', status: 'live', handle: 'h2', isLead: false }
        ]
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '拉起岗位' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('2 个已就绪'), `没给出就绪结论：${tree.slice(0, 600)}`)
  assert.ok(tree.includes('2 个岗位已启动'), `没给出启动结果：${tree.slice(0, 600)}`)
  await p.unmount()
})

test('面板不再显示调度员启停按钮（调度员随岗位隐式起停）', async () => {
  const STALE = { ...TEAM, dispatcherState: 'stale', offlinePosts: 2 }
  const host = mockHost({ requests: { 'teams.list': { teams: [STALE] } } })
  const p = await mount(panel, { host })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(!tree.includes('启动调度员'), `不该有启动调度员按钮：${tree.slice(0, 700)}`)
  assert.ok(!tree.includes('停止调度员'), `不该有停止调度员按钮：${tree.slice(0, 700)}`)
  await p.unmount()
})
