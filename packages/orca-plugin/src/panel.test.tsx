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

test('stopped 团队显示「拉起岗位」，路由到 team.up（新生命周期）', async () => {
  const STOPPED = { ...TEAM, status: 'stopped', dispatcherState: 'stale', offlinePosts: 2 }
  const ups: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [STOPPED] },
      'team.up': (input: unknown) => {
        ups.push(input)
        return {
          posts: [{ address: 'builder@duo', outcome: 'launched' }, { address: 'checker@duo', outcome: 'launched' }],
          run: { outcome: 'ok' },
          dispatcher: { outcome: 'started' },
          live: 2,
          total: 2
        }
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
  assert.ok(tree.includes('2 个岗位已全新启动'), `没有全新启动提示：${tree.slice(0, 500)}`)
  assert.ok(tree.includes('2 个已就绪'), `没有就绪结论：${tree.slice(0, 500)}`)
  await p.unmount()
})

test('up 团队的拉起路由到 team.restore（kept/resumed/fresh 逐岗位判断）', async () => {
  const restores: unknown[] = []
  const OFFLINE_UP = { ...TEAM, status: 'up', offlinePosts: 2 } // 团队 up 但岗位掉线（崩溃恢复场景）
  const host = mockHost({
    requests: {
      'teams.list': { teams: [OFFLINE_UP] },
      'team.restore': (input: unknown) => {
        restores.push(input)
        return {
          team: 'duo', dryRun: false,
          posts: [
            { address: 'builder@duo', outcome: 'kept' },
            { address: 'checker@duo', outcome: 'resumed', sessionId: 's1' }
          ],
          run: { outcome: 'ok' }, dispatcher: { action: 'restarted', state: 'running' }, tasks: [],
          live: 2, total: 2
        }
      },
      'team.posts': POSTS
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '拉起岗位' })
  await p.settled()
  assert.deepEqual(restores, [{ team: 'duo' }])
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('2 个岗位已接回'), `没有接回提示：${tree.slice(0, 600)}`)
  assert.ok(tree.includes('接回了原会话'), `没有 resumed 标注：${tree.slice(0, 600)}`)
  await p.unmount()
})

test('岗位视图有离线岗位时不出「重拉离线岗位」按钮（拉起入口在卡片上）', async () => {
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
  const tree = JSON.stringify(p.tree())
  assert.ok(!tree.includes('重拉离线岗位'), `不该有重拉按钮：${tree.slice(0, 700)}`)
  assert.ok(tree.includes('offline'), '离线岗位仍应显示')
  await p.unmount()
})

test('滞留视图列出滞留任务与处理命令', async () => {
  const STALE = {
    stale: [{ taskId: 't9', title: '卡住的任务', reason: '无进展', owner: 'builder@duo', since: null, command: 'wl task recover t9' }]
  }
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'team.tasks.stale': STALE,
      'team.tasks': { tasks: [] }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '滞留' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('卡住的任务'), `没画出滞留任务：${tree.slice(0, 700)}`)
  assert.ok(tree.includes('wl task recover t9'), `没画出处理命令：${tree.slice(0, 700)}`)
  await p.unmount()
})

test('时间线视图列出全团队事件（倒序，带条数）', async () => {
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'team.timeline': {
        events: [
          { id: 'task:1', at: '2026-11-08T01:00:00Z', source: 'task', actor: 'builder@duo', action: 'done', target: 't1', outcome: 'ok' },
          { id: 'task:2', at: '2026-11-08T02:00:00Z', source: 'task', actor: 'dispatcher@duo', action: 'dispatch', target: 't2', outcome: 'ok' }
        ]
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '时间线' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('dispatch'), `没画出时间线事件：${tree.slice(0, 700)}`)
  assert.ok(tree.includes('共') && tree.includes('条'), `没画出条数：${tree.slice(0, 700)}`)
  await p.unmount()
})

test('编辑视图：读规格 → 加岗位（add_post op）→ 保存走 spec.save', async () => {
  const YAML = 'version: 1\nname: duo\nrepo: "path:/r"\nnorms: NORMS.md\nlead: builder\nposts:\n  - id: builder\n    agent: claude\n    model: opus\n    worktree: current\n    brief: [briefs/builder.md]\n  - id: checker\n    agent: codex\n    launch: codex\n    worktree: current\n    brief: [briefs/checker.md]\n'
  const ops: unknown[] = []
  const saves: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS,
      'spec.readForEdit': {
        specPath: '/s/team.yaml', yaml: YAML, hash: 'h1', running: false, hasDraft: false,
        docKeys: ['NORMS.md'], files: { 'NORMS.md': '# 规范\n' }
      },
      'spec.validate': (input: unknown) => {
        ops.push(input)
        const i = input as { set?: { op?: string } }
        const added = i.set && i.set.op === 'add_post'
        return {
          yaml: YAML + (added ? '  - id: writer\n    agent: pi\n    worktree: current\n' : ''),
          errors: [],
          preview: added
            ? { posts: [{ id: 'writer', kind: 'added' }], fields: [], commands: ['wl up /s/team.yaml'] }
            : { posts: [], fields: [], commands: [] },
          postsParsed: added
            ? [
                { id: 'builder', agent: 'claude', model: 'opus', worktree: 'current' },
                { id: 'checker', agent: 'codex', worktree: 'current' },
                { id: 'writer', agent: 'pi', worktree: 'current' }
              ]
            : [
                { id: 'builder', agent: 'claude', model: 'opus', worktree: 'current' },
                { id: 'checker', agent: 'codex', worktree: 'current' }
              ]
        }
      },
      'spec.save': (input: unknown) => {
        saves.push(input)
        return { wrote: 'spec', path: '/s/team.yaml', hash: 'h2', docsUpdated: [] }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '展开' })
  await p.settled()
  await p.press({ text: '编辑' })
  await p.settled()
  const tree = JSON.stringify(p.tree())
  assert.ok(tree.includes('builder'), `没画出岗位列表：${tree.slice(0, 800)}`)

  // 新增岗位（三段表单）
    const fs = await import('node:fs')
  fs.writeFileSync('/tmp/edit-tree.json', JSON.stringify(p.tree()))
await p.type({ label: '岗位 id' }, 'writer')
  await p.settled()
  await p.type({ label: 'agent' }, 'pi')
  await p.settled()
  await p.press({ text: '添加岗位' })
  await p.settled()
  assert.equal(ops.length, 1)
  assert.equal((ops[0] as { set: { op: string; post: { id: string } } }).set.op, 'add_post')
  assert.equal((ops[0] as { set: { post: { id: string } } }).set.post.id, 'writer')

  // 删除（第一个「删除」按钮）
  await p.press({ text: '删除' })
  await p.settled()
  assert.equal(ops.length, 2)
  assert.equal((ops[1] as { set: { op: string; index: number } }).set.op, 'remove_post')

  // 保存
  await p.press({ text: '保存' })
  await p.settled()
  assert.equal(saves.length, 1)
  assert.equal((saves[0] as { baseHash: string }).baseHash, 'h1')
  assert.equal((saves[0] as { running: boolean }).running, false)
  assert.ok(JSON.stringify(p.tree()).includes('已保存到团队规格'), '没有保存提示')
  await p.unmount()
})

test('空态提供「新建团队」，提交走 team.init', async () => {
  const inits: unknown[] = []
  const host = mockHost({
    requests: {
      'teams.list': { teams: [] },
      'team.init': (input: unknown) => {
        inits.push(input)
        return { team: 'newteam', specPath: '/s', created: true }
      }
    }
  })
  const p = await mount(panel, { host })
  await p.settled()
  await p.press({ text: '新建团队' })
  await p.settled()
  await p.type({ label: '团队名' }, 'demo')
  await p.settled()
  await p.type({ label: '仓库目录' }, '/tmp/repo')
  await p.settled()
  await p.press({ text: '创建' })
  await p.settled()
  assert.deepEqual(inits, [{ name: 'demo', template: 'duo', repo: '/tmp/repo' }])
  await p.unmount()
})
