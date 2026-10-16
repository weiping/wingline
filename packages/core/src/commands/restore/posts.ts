import { checkBriefingLimit } from '../../brief/render.js'
import { WinglineError } from '../../errors.js'
import type { Registry } from '../../registry/registry.js'
import type { PostSpec } from '../../spec/load.js'
import { postAddress, requestId } from '../deps.js'
import { briefText } from '../up.js'
import {
  ensureMarker, lifetimeGen, recorded, startPost, stepDone, WAIT_SUBMIT_SEC, WAIT_TIMEOUT_MS, withMarker, type Launch,
} from '../launch.js'
import { locatePost } from '../locate.js'
import { screenGuard } from '../task/notify.js'
import { findSession } from './find-session.js'
import { resumeCommand, SESSION_ID } from './resume-command.js'

export type RestorePostOutcome = 'kept' | 'resumed' | 'fresh' | 'ambiguous' | 'uncertain' | 'failed'

export interface RestorePost {
  address: string
  outcome: RestorePostOutcome
  sessionId?: string
  reason?: string
  candidates?: Array<{ sessionId: string; updatedAt: string | null; messageCount: number | null }>
  retry?: string
  noticeSkipped?: string
}

/** restore 的请求键独立命名空间（复审 I-1）：与 wl up 的键不冲突，代数各自计数。 */
export const restoreKey = (team: string, post: string, gen: number, step: 'create' | 'wait' | 'notice') =>
  `restore:${team}:${post}:${gen}:${step}`

/** 已完成的 restore create 中最大代数加 1；本代 create 尚未完成（中断重跑沿用原代）时不前进。终端仍活着（located）时调用方已走 kept，不会拉起新代。 */
export function restoreGen(reg: Registry, team: string, post: string, _located: boolean): number {
  let g = 0
  while (reg.getRequest(restoreKey(team, post, g, 'create'))?.state === 'done') g++
  return g
}

const RESUME_NOTICE = (address: string) => `[雁阵] 重启后已接回本会话，你的地址仍是 ${address}。`

const FRESH_REFUSE = {
  at_prompt: '岗位停在确认提示上',
  shell: '岗位已退回 shell',
  unconfirmed: '岗位未确认就绪，启动包未送达',
} as const

/**
 * 逐岗位判定与拉起（spec §5.2 第 2–3 步）：终端活着 → kept；
 * 失效则按 override > 缓存 > 标记搜索确定会话，能接回的恢复命令拉起并缓存 session_id，
 * 接不回的走 wl up 的新建路径（新标记、启动包）并醒目标注上下文已丢失。
 */
export async function restorePost(
  l: Launch, post: PostSpec, o: { dryRun: boolean; override?: string; briefing: string },
): Promise<RestorePost> {
  const { orca, registry } = l.deps
  const address = postAddress(post.id, l.spec.name)
  const retry = `wl restore ${l.spec.name}`
  try {
    const located = await locatePost(orca, address)
    if (located && located.connected) return { address, outcome: 'kept' }

    const row = registry.getPost(address)!
    // path: 固定值直接用；选择器（阶段 3 之前的行）现解析一次
    const worktreePath = row.worktree.startsWith('path:')
      ? row.worktree.slice(5)
      : (await orca.worktreeShow({ worktree: row.worktree })).path
    const lookup = await findSession(l.deps, row, worktreePath, o.override)
    if (lookup.kind === 'ambiguous') {
      return { address, outcome: 'ambiguous', candidates: lookup.candidates, retry: `${retry} --session ${post.id}=<id>` }
    }
    if (lookup.kind === 'uncertain') {
      return { address, outcome: 'uncertain', reason: lookup.reason, retry }
    }

    let sessionId: string | null = null
    let reason: string | undefined
    let command: string | null = null
    if (lookup.kind === 'found') {
      if (!SESSION_ID.test(lookup.sessionId)) {
        return { address, outcome: 'uncertain', reason: `搜索返回的会话 ID ${lookup.sessionId} 无效`, retry }
      }
      command = resumeCommand(post.agent, post.launch, lookup.sessionId)
      if (command === null) reason = `${post.agent} 不支持接回会话`
      else sessionId = lookup.sessionId
    } else {
      reason = lookup.reason === '未找到原会话' ? '未找到原会话，上下文已丢失' : lookup.reason
    }

    if (sessionId !== null && command !== null) {
      if (o.dryRun) return { address, outcome: 'resumed', sessionId }
      const gen = restoreGen(registry, l.spec.name, post.id, located !== null)
      const rid = (step: 'create' | 'wait' | 'notice') => restoreKey(l.spec.name, post.id, gen, step)
      let handle = stepDone(registry, rid('create')) ? row.handle : null
      if (!handle) {
        const created = await recorded(registry, rid('create'), () =>
          orca.terminalCreate({ worktree: post.worktree, title: address, command }),
        )
        handle = created.value.handle
        registry.setPostHandle(address, handle)
      }
      if (!stepDone(registry, rid('wait'))) {
        const waited = await recorded(
          registry, rid('wait'),
          () => orca.terminalWait({ handle, forState: 'tui-idle', timeoutMs: WAIT_TIMEOUT_MS }),
          (v) => v.satisfied,
        )
        if (!waited.confirmed) {
          registry.setPostStatus(address, 'uncertain')
          return { address, outcome: 'uncertain', reason: '终端未进入空闲，接回提示未发送', retry }
        }
      }
      registry.setSessionId(address, sessionId)
      const screen = await screenGuard(l.deps, handle)
      if (screen !== 'clear') {
        registry.setPostStatus(address, 'live')
        return { address, outcome: 'resumed', sessionId, noticeSkipped: `未发送接回提示（${screen}）` }
      }
      if (!stepDone(registry, rid('notice'))) {
        await recorded(
          registry, rid('notice'),
          () => orca.terminalSend({ handle, text: RESUME_NOTICE(address), enter: true, waitSubmitSec: WAIT_SUBMIT_SEC }),
          (v) => v.accepted,
        )
      }
      registry.setPostStatus(address, 'live')
      return { address, outcome: 'resumed', sessionId }
    }

    // fresh：与 wl up 的新建路径完全相同（新标记、启动包），醒目标注上下文已丢失
    if (o.dryRun) return { address, outcome: 'fresh', ...(reason !== undefined ? { reason } : {}) }
    const gen = lifetimeGen(l, post.id, located !== null)
    const marker = ensureMarker(l, post, gen)
    const text = briefText(l, post, withMarker(o.briefing, marker), marker)
    checkBriefingLimit(text, address)
    const result = await startPost(l, post, {
      text, command: post.launch, existingHandle: located?.handle ?? null,
      keyOf: (s) => requestId(l.spec.name, post.id, s, l.hash, gen),
    })
    if (result === 'sent') {
      registry.setPostStatus(address, 'live')
      return { address, outcome: 'fresh', ...(reason !== undefined ? { reason } : {}) }
    }
    registry.setPostStatus(address, 'uncertain')
    return { address, outcome: 'uncertain', reason: FRESH_REFUSE[result], retry }
  } catch (err) {
    if (!(err instanceof WinglineError) || err.kind === 'input' || err.kind === 'internal') throw err
    const outcome = err.kind === 'orca' ? 'failed' : 'uncertain'
    registry.setPostStatus(address, outcome === 'failed' ? 'offline' : 'uncertain')
    return { address, outcome, reason: err.message, ...(outcome === 'uncertain' ? { retry } : {}) }
  }
}
