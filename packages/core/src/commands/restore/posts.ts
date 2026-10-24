import { createHash } from 'node:crypto'
import { checkBriefingLimit } from '../../brief/render.js'
import { WinglineError } from '../../errors.js'
import type { Registry } from '../../registry/registry.js'
import type { PostSpec } from '../../spec/load.js'
import { postAddress, requestId, type CommandDeps } from '../deps.js'
import { briefText } from '../up.js'
import {
  ensureMarker, lifetimeGen, recorded, startPost, stepDone, WAIT_SUBMIT_SEC, WAIT_TIMEOUT_MS, withMarker, type Launch,
} from '../launch.js'
import { locatePost } from '../locate.js'
import { screenGuard } from '../task/notify.js'
import { findSession, markerHighlighted } from './find-session.js'
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
  /** 结果是对的但有一点没能确认（例如远端岗位接回后没能核对提示落进了哪个会话）。 */
  note?: string
}

/** restore 的请求键独立命名空间（复审 I-1）：与 wl up 的键不冲突，代数各自计数。 */
export const restoreKey = (team: string, post: string, gen: number, step: 'create' | 'wait' | 'notice') =>
  `restore:${team}:${post}:${gen}:${step}`

/** 已完成的 restore create 中最大代数加 1；本代 create 尚未完成（中断重跑沿用原代）时不前进。终端仍活着（located）时调用方走 kept 或补完上一代（pendingResume），不会拉起新代。 */
export function restoreGen(reg: Registry, team: string, post: string, _located: boolean): number {
  let g = 0
  while (reg.getRequest(restoreKey(team, post, g, 'create'))?.state === 'done') g++
  return g
}

/**
 * 远端岗位的接回提示带一个每次接回唯一的标识（`WLR-` 加 8 位十六进制，由该次接回的请求键哈希得到，重试时不变）。
 * 提示原文每次相同，原会话里可能早有旧的同样的提示；不带标识，丢了 `--resume` 的这一次会被旧提示误判为通过。
 */
export const noticeToken = (requestKey: string): string => `WLR-${createHash('sha256').update(requestKey).digest('hex').slice(0, 8)}`

export const resumeNotice = (address: string, token?: string): string =>
  `[雁阵] 重启后已接回本会话，你的地址仍是 ${address}。${token ? `（接回标识 ${token}）` : ''}`

export type Landing = { kind: 'confirmed' } | { kind: 'mismatch'; landed: string[] } | { kind: 'unknown'; why: string }

const pause = (ms: number): Promise<void> => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

/**
 * 接回提示发出后，到远端环境里按标识搜，看它落进了哪个会话：要接回的那个 → confirmed；只落进别的会话 → mismatch
 * （包装脚本没把 --resume 透传给 agent，VM 里起的是全新会话）；搜不到或搜索失败 → unknown（索引可能还没跟上，不因此让接回失败）。
 */
export async function verifyLanding(
  deps: CommandDeps, a: { agent: string; environment: string; token: string; expected: string }, o: { tries: number; pauseMs: number },
): Promise<Landing> {
  let why = '远端搜索没有命中接回标识'
  for (let i = 0; i < o.tries; i++) {
    if (i > 0) await pause(o.pauseMs)
    try {
      const hits = await deps.orca.search({ query: `"${a.token}"`, agent: a.agent, environment: a.environment })
      const landed = [...new Set(hits.filter((h) => markerHighlighted(h.snippet, a.token)).map((h) => h.sessionId))]
      if (landed.includes(a.expected)) return { kind: 'confirmed' }
      if (landed.length > 0) return { kind: 'mismatch', landed }
      why = '远端搜索没有命中接回标识（索引可能还没跟上）'
    } catch (err) {
      if (!(err instanceof WinglineError)) throw err
      why = `远端搜索失败：${err.message}`
    }
  }
  return { kind: 'unknown', why }
}

const FRESH_REFUSE = {
  at_prompt: '岗位停在确认提示上',
  shell: '岗位已退回 shell',
  unconfirmed: '岗位未确认就绪，启动包未送达',
} as const

type StepKey = (step: 'create' | 'wait' | 'notice') => string

/** 写了 environment 的岗位：接回后核对提示落点所需的信息。 */
interface RemoteCheck {
  agent: string
  environment: string
  verify: { tries: number; pauseMs: number }
}

/** 搜 3 次、间隔 2 秒（`--fresh` 本身最多再等 5 秒），给远端索引一点时间。 */
const VERIFY_DEFAULT = { tries: 3, pauseMs: 2000 }

/** 接回提示发出后的核对结果：落进要接回的会话 → 照常 resumed；核对不了 → resumed 加 note；落进别的会话 → uncertain。 */
async function landingResult(
  deps: CommandDeps, address: string, sessionId: string, token: string, remote: RemoteCheck, retry: string,
): Promise<RestorePost> {
  const landing = await verifyLanding(deps, { agent: remote.agent, environment: remote.environment, token, expected: sessionId }, remote.verify)
  if (landing.kind === 'confirmed') return { address, outcome: 'resumed', sessionId }
  if (landing.kind === 'unknown') return { address, outcome: 'resumed', sessionId, note: `未能确认接回提示落在原会话里：${landing.why}` }
  deps.registry.setPostStatus(address, 'uncertain')
  return {
    address, outcome: 'uncertain', sessionId, retry,
    reason: `接回提示落进了另一个会话（${landing.landed.join('、')}），不是要接回的 ${sessionId}：包装脚本很可能没有把 --resume 透传给 agent，`
      + '岗位现在是上下文已丢失的新会话。修好包装脚本后，先关掉该岗位的终端再重跑',
  }
}

/**
 * 上一代 restore 拉起了接回终端、却没走完（空闲等待未确认，或接回提示未发出且岗位不是 live）：
 * 返回要补完的会话 ID 与请求键；否则 null。会话 ID 没缓存、岗位已 live、句柄对不上都不算。
 */
function pendingResume(reg: Registry, team: string, post: string, handle: string): { sessionId: string; rid: StepKey } | null {
  const gen = restoreGen(reg, team, post, true) - 1
  if (gen < 0) return null
  const rid: StepKey = (step) => restoreKey(team, post, gen, step)
  const row = reg.getPost(postAddress(post, team))
  if (!row || row.handle !== handle || row.status === 'live' || !row.sessionId) return null
  return stepDone(reg, rid('wait')) && stepDone(reg, rid('notice')) ? null : { sessionId: row.sessionId, rid }
}

/** 等接回的终端空闲 → 画面检查 → 发一次接回提示 → live。首次接回与补完共用；每步都是幂等的账本步骤。 */
async function settleResume(
  l: Launch, address: string, handle: string, sessionId: string, rid: StepKey, retry: string, remote?: RemoteCheck,
): Promise<RestorePost> {
  const { orca, registry } = l.deps
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
  const screen = await screenGuard(l.deps, handle)
  if (screen === 'shell' || screen === 'offline') {
    // agent 没起来（--resume 失败退回 shell）或终端已不在：不能记成 live，否则下一次重跑会报 kept
    registry.setPostStatus(address, 'uncertain')
    return { address, outcome: 'uncertain', reason: screen === 'shell' ? '接回后终端停在 shell，agent 没有启动' : '接回后终端已不在', retry }
  }
  if (screen !== 'clear') {
    registry.setPostStatus(address, 'live')
    return { address, outcome: 'resumed', sessionId, noticeSkipped: `未发送接回提示（${screen}）` }
  }
  const token = remote ? noticeToken(rid('notice')) : undefined
  if (!stepDone(registry, rid('notice'))) {
    await recorded(
      registry, rid('notice'),
      () => orca.terminalSend({ handle, text: resumeNotice(address, token), enter: true, waitSubmitSec: WAIT_SUBMIT_SEC }),
      (v) => v.accepted,
    )
  }
  registry.setPostStatus(address, 'live')
  if (!remote || token === undefined) return { address, outcome: 'resumed', sessionId }
  return landingResult(l.deps, address, sessionId, token, remote, retry)
}

/**
 * 逐岗位判定与拉起（spec §5.2 第 2–3 步）：终端活着 → kept；
 * 失效则按 override > 缓存 > 标记搜索确定会话，能接回的恢复命令拉起并缓存 session_id，
 * 接不回的走 wl up 的新建路径（新标记、启动包）并醒目标注上下文已丢失。
 */
export async function restorePost(
  l: Launch, post: PostSpec, o: { dryRun: boolean; override?: string; briefing: string; reserved?: string[]; verify?: { tries: number; pauseMs: number } },
): Promise<RestorePost> {
  const { orca, registry } = l.deps
  const remote: RemoteCheck | undefined = post.environment === undefined ? undefined : { agent: post.agent, environment: post.environment, verify: o.verify ?? VERIFY_DEFAULT }
  const address = postAddress(post.id, l.spec.name)
  const retry = `wl restore ${l.spec.name}`
  try {
    const located = await locatePost(orca, address)
    if (located && located.connected) {
      // 上次接回没走完（终端是 restore 拉起的、空闲等待或接回提示未定案）：补完它，而不是报 kept
      const pending = pendingResume(registry, l.spec.name, post.id, located.handle)
      if (pending && o.dryRun) return { address, outcome: 'resumed', sessionId: pending.sessionId }
      if (pending) return await settleResume(l, address, located.handle, pending.sessionId, pending.rid, retry, remote)
      if (!o.dryRun) {
        registry.setPostHandle(address, located.handle)
        registry.setPostStatus(address, 'live')
      }
      return { address, outcome: 'kept' }
    }

    const row = registry.getPost(address)!
    // path: 固定值直接用；选择器（阶段 3 之前的行）现解析一次
    const worktreePath = row.worktree.startsWith('path:')
      ? row.worktree.slice(5)
      : (await orca.worktreeShow({ worktree: row.worktree })).path
    const lookup = await findSession(l.deps, row, worktreePath, o.override, o.reserved, post.environment)
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
      registry.setSessionId(address, sessionId)
      return await settleResume(l, address, handle, sessionId, rid, retry, remote)
    }

    // fresh：与 wl up 的新建路径完全相同（新标记、启动包），醒目标注上下文已丢失
    if (o.dryRun) return { address, outcome: 'fresh', ...(reason !== undefined ? { reason } : {}) }
    const gen = lifetimeGen(l, post.id, located !== null)
    const marker = ensureMarker(l, post, gen)
    // 复审 I-3：检查完整启动包，且在任何副作用之前（.cmd 模式下 briefText 会落文件、发出去的是短指针）
    const full = withMarker(o.briefing, marker)
    checkBriefingLimit(full, address)
    const text = briefText(l, post, full, marker)
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
