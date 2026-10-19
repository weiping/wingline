import type { HandlerContext, Router } from './http.js'
import { checkParam } from './http.js'
import type { CommandDeps } from '../commands/deps.js'
import { postAddress } from '../commands/deps.js'
import { WinglineError } from '../errors.js'
import { auditedCommands, type AuditCtx, type AuditTable } from '../audit.js'
import { send } from '../commands/send.js'
import { createTask } from '../commands/task/create.js'
import { escalateTask, recoverTask, resolveGate } from '../commands/task/escalate.js'
import { reassignTask } from '../commands/task/claim.js'
import { freezePostCmd, hushCmd, unfreezePostCmd, unhushCmd } from '../commands/dispatcher/controls.js'
import { dispatcherReply } from '../commands/dispatcher/inbox.js'

export interface WriteCommands {
  send: typeof send
  createTask: typeof createTask
  escalateTask: typeof escalateTask
  reassignTask: typeof reassignTask
  recoverTask: typeof recoverTask
  resolveGate: typeof resolveGate
  freezePostCmd: typeof freezePostCmd
  unfreezePostCmd: typeof unfreezePostCmd
  hushCmd: typeof hushCmd
  unhushCmd: typeof unhushCmd
  dispatcherReply: typeof dispatcherReply
}

const ofAddress = (a: { address: string }) => a.address.split('@')[1] ?? '-'
const byTask = (idOf: (a: any) => string) => (_a: unknown, ctx: AuditCtx) => ctx.deps.registry.getTaskExt(idOf(_a))?.team ?? '-'
const byGate = (gateId: (a: any) => string) => (_a: unknown, ctx: AuditCtx) => ctx.deps.registry.getGate(gateId(_a))?.team ?? '-'

export const CONSOLE_AUDIT: AuditTable<WriteCommands> = {
  send: {
    command: 'send',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ message: a.message }),
  },
  createTask: {
    command: 'task create',
    team: (a) => a.team,
    target: (_a, ctx) => (ctx.result as { id?: string } | undefined)?.id ?? null,
    summary: (a) => ({ title: a.title, post: a.post, tags: a.tags, parent: a.parent }),
  },
  escalateTask: {
    command: 'task escalate',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ reason: a.reason, reopen: a.reopen }),
  },
  reassignTask: {
    command: 'task reassign',
    team: byTask((a) => a.id),
    target: (a) => a.id,
    summary: (a) => ({ to: a.to }),
  },
  recoverTask: {
    command: 'task recover',
    team: byTask((a) => a.id),
    target: (a) => a.id,
  },
  resolveGate: {
    command: 'task resolve',
    team: byGate((a) => a.gateId),
    target: (a) => a.gateId,
    summary: (a) => ({ resolution: a.resolution, reassign: a.reassign }),
  },
  freezePostCmd: {
    command: 'dispatcher freeze',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ reason: a.reason }),
  },
  unfreezePostCmd: {
    command: 'dispatcher unfreeze',
    team: ofAddress,
    target: (a) => a.address,
  },
  hushCmd: {
    command: 'dispatcher hush',
    team: ofAddress,
    target: (a) => a.address,
    summary: (a) => ({ forMs: a.forMs }),
  },
  unhushCmd: {
    command: 'dispatcher unhush',
    team: ofAddress,
    target: (a) => a.address,
  },
  dispatcherReply: {
    command: 'dispatcher reply',
    team: (a) => a.team,
    target: (a) => a.messageId,
    summary: (a) => ({ body: a.body, again: a.again }),
  },
}

export function consoleCommands(_deps: CommandDeps): WriteCommands {
  const raw: WriteCommands = {
    send,
    createTask,
    escalateTask,
    reassignTask,
    recoverTask,
    resolveGate,
    freezePostCmd,
    unfreezePostCmd,
    hushCmd,
    unhushCmd,
    dispatcherReply,
  }
  return auditedCommands(raw, CONSOLE_AUDIT, { prefix: 'console:', actor: 'human' })
}

function assertExactFields(body: any, allowed: readonly string[]): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new WinglineError('input', 'unknown_field', '请求体必须是 JSON 对象')
  }
  const allowedSet = new Set(allowed)
  for (const k of Object.keys(body)) {
    if (!allowedSet.has(k)) {
      throw new WinglineError('input', 'unknown_field', `未知字段 ${k}`)
    }
  }
}

export function registerWriteRoutes(r: Router, cmds: WriteCommands): void {
  // 1. send
  r.post('/api/teams/:team/send', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    assertExactFields(ctx.body, ['post', 'message', 'retryRequest'])
    const { post, message, retryRequest } = ctx.body
    checkParam('post', post)
    const address = postAddress(post, team)
    try {
      return await cmds.send(ctx.deps, { address, message, retryRequest })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 2. tasks create
  r.post('/api/teams/:team/tasks', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    checkParam('team', team)
    assertExactFields(ctx.body, ['title', 'post', 'tags', 'parent', 'retryRequest'])
    const { title, post, tags, parent, retryRequest } = ctx.body
    if (post) checkParam('post', post)
    if (parent) checkParam('id', parent)
    try {
      // 请求体里的 post 是岗位名（与 send 一致），core 的 createTask 要的是地址
      return await cmds.createTask(ctx.deps, { team, title, post: post ? postAddress(post, team) : undefined, tags, parent, retryRequest })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 3. tasks escalate
  r.post('/api/teams/:team/tasks/:id/escalate', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const id = ctx.params.id!
    checkParam('team', team)
    checkParam('id', id)
    assertExactFields(ctx.body, ['reason', 'reopen', 'retryRequest'])
    const { reason, reopen, retryRequest } = ctx.body
    try {
      return await cmds.escalateTask(ctx.deps, { id, reason, reopen, retryRequest })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 4. tasks reassign
  r.post('/api/teams/:team/tasks/:id/reassign', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const id = ctx.params.id!
    checkParam('team', team)
    checkParam('id', id)
    assertExactFields(ctx.body, ['to'])
    const { to } = ctx.body
    try {
      return await cmds.reassignTask(ctx.deps, { id, to })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 5. tasks recover
  r.post('/api/teams/:team/tasks/:id/recover', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const id = ctx.params.id!
    checkParam('team', team)
    checkParam('id', id)
    assertExactFields(ctx.body, [])
    try {
      return await cmds.recoverTask(ctx.deps, { id })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 6. gates resolve
  r.post('/api/teams/:team/gates/:gateId/resolve', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const gateId = ctx.params.gateId!
    checkParam('team', team)
    checkParam('gateId', gateId)
    assertExactFields(ctx.body, ['resolution', 'reassign'])
    const { resolution, reassign } = ctx.body
    try {
      return await cmds.resolveGate(ctx.deps, { gateId, resolution, reassign })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 7. posts freeze
  r.post('/api/teams/:team/posts/:post/freeze', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const post = ctx.params.post!
    checkParam('team', team)
    checkParam('post', post)
    assertExactFields(ctx.body, ['reason'])
    const address = postAddress(post, team)
    try {
      return await cmds.freezePostCmd(ctx.deps, { address, reason: ctx.body.reason })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 8. posts unfreeze
  r.post('/api/teams/:team/posts/:post/unfreeze', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const post = ctx.params.post!
    checkParam('team', team)
    checkParam('post', post)
    assertExactFields(ctx.body, [])
    const address = postAddress(post, team)
    try {
      return await cmds.unfreezePostCmd(ctx.deps, { address })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 9. posts hush
  r.post('/api/teams/:team/posts/:post/hush', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const post = ctx.params.post!
    checkParam('team', team)
    checkParam('post', post)
    assertExactFields(ctx.body, ['forMs'])
    const address = postAddress(post, team)
    try {
      return await cmds.hushCmd(ctx.deps, { address, forMs: ctx.body.forMs })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 10. posts unhush
  r.post('/api/teams/:team/posts/:post/unhush', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const post = ctx.params.post!
    checkParam('team', team)
    checkParam('post', post)
    assertExactFields(ctx.body, [])
    const address = postAddress(post, team)
    try {
      return await cmds.unhushCmd(ctx.deps, { address })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })

  // 11. questions reply
  r.post('/api/teams/:team/questions/:messageId/reply', async (ctx: HandlerContext) => {
    const team = ctx.params.team!
    const messageId = ctx.params.messageId!
    checkParam('team', team)
    checkParam('messageId', messageId)
    assertExactFields(ctx.body, ['body', 'again'])
    const { body, again } = ctx.body
    try {
      return await cmds.dispatcherReply(ctx.deps, { team, messageId, body, again })
    } finally {
      ctx.deps.orca.invalidate()
    }
  })
}
