import { createHash } from 'node:crypto'
import { WinglineError } from '../errors.js'
import type { SendResult } from '../orca/types.js'
import { preflight, requestId, type CommandDeps } from './deps.js'
import { locatePost } from './locate.js'

export interface SendResultRow {
  address: string
  outcome: 'delivered'
  handle: string
}

const MAX_MESSAGE = 4000
const WAIT_SUBMIT_SEC = 10

function checkMessage(deps: CommandDeps, message: string): void {
  if (message.length > MAX_MESSAGE) {
    throw new WinglineError('input', 'message_too_long', `消息 ${message.length} 字符，超过上限 ${MAX_MESSAGE}`)
  }
  if (!deps.multilineSafe && /[\r\n]/.test(message)) {
    throw new WinglineError('input', 'multiline_unsupported', '当前 Orca 命令经 Windows .cmd 包装，无法安全传递换行', {
      hint: '设置 WINGLINE_ORCA 指向 orca.exe，或改写为单行消息',
    })
  }
}

/** 相同消息再次发送（上一次已送达）要换新 id，否则 Orca 会按旧 id 回放。未确认的发送沿用原 id 以便幂等重试。 */
function freshRequestId(deps: CommandDeps, team: string, post: string, hash: string): string {
  let gen = 0
  while (deps.registry.getRequest(requestId(team, post, 'send', hash, gen))?.state === 'done') gen++
  return requestId(team, post, 'send', hash, gen)
}

async function sendOnce(deps: CommandDeps, address: string, message: string, id: string) {
  const located = await locatePost(deps.orca, address)
  if (!located) {
    throw new WinglineError('input', 'post_offline', `${address} 没有对应的终端`, { hint: '先执行 wl up 拉起岗位' })
  }
  deps.registry.setPostHandle(address, located.handle)
  const result = await deps.orca.terminalSend({
    handle: located.handle, text: message, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC, retryRequest: id,
  })
  return { handle: located.handle, result }
}

async function sendWithRelocate(deps: CommandDeps, address: string, message: string, id: string) {
  try {
    return await sendOnce(deps, address, message, id)
  } catch (err) {
    if (err instanceof WinglineError && err.code === 'terminal_handle_stale') return sendOnce(deps, address, message, id)
    throw err
  }
}

const confirmed = (r: SendResult) => r.stages.includes('turn_started')

export async function send(deps: CommandDeps, args: { address: string; message: string }): Promise<SendResultRow> {
  checkMessage(deps, args.message)
  const post = deps.registry.getPost(args.address)
  if (!post) throw new WinglineError('input', 'post_unknown', `没有岗位 ${args.address}`, { hint: '用 wl ps 查看现有岗位' })
  await preflight(deps)
  const hash = createHash('sha256').update(args.message).digest('hex')
  const id = freshRequestId(deps, post.team, args.address.split('@')[0]!, hash)
  deps.registry.beginRequest(id)
  try {
    const { handle, result } = await sendWithRelocate(deps, args.address, args.message, id)
    deps.registry.finishRequest(id, confirmed(result) ? 'done' : 'uncertain', result)
    if (!confirmed(result)) {
      throw new WinglineError('uncertain', 'send_unconfirmed', `消息已输入 ${args.address}，但未确认被处理，不会自动重发`, {
        hint: `确认后可重试：wl send ${args.address} "<同样的消息>"`,
      })
    }
    return { address: args.address, outcome: 'delivered', handle }
  } catch (err) {
    if (deps.registry.getRequest(id)?.state === 'pending') {
      deps.registry.finishRequest(id, err instanceof WinglineError && err.kind === 'uncertain' ? 'uncertain' : 'failed', { error: String(err) })
    }
    throw err
  }
}
