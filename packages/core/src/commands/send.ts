import { createHash } from 'node:crypto'
import { WinglineError } from '../errors.js'
import type { SendResult } from '../orca/types.js'
import { nextRequestId, preflight, type CommandDeps } from './deps.js'
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
      hint: '改写成单行消息，或把内容写进文件后只发送路径（Orca 的 Windows 安装只提供 orca.cmd）',
    })
  }
}

async function sendOnce(deps: CommandDeps, address: string, message: string, retryRequest?: string) {
  const located = await locatePost(deps.orca, address)
  if (!located) {
    throw new WinglineError('input', 'post_offline', `${address} 没有对应的终端`, { hint: '先执行 wl up 拉起岗位' })
  }
  deps.registry.setPostHandle(address, located.handle)
  const result = await deps.orca.terminalSend({
    handle: located.handle, text: message, enter: true, waitSubmitSec: WAIT_SUBMIT_SEC, retryRequest,
  })
  return { handle: located.handle, result }
}

async function sendWithRelocate(deps: CommandDeps, address: string, message: string, retryRequest?: string) {
  try {
    return await sendOnce(deps, address, message, retryRequest)
  } catch (err) {
    if (err instanceof WinglineError && err.code === 'terminal_handle_stale') return sendOnce(deps, address, message, retryRequest)
    throw err
  }
}

const confirmed = (r: SendResult) => r.stages.includes('turn_started')

export async function send(deps: CommandDeps, args: { address: string; message: string; retryRequest?: string }): Promise<SendResultRow> {
  checkMessage(deps, args.message)
  const post = deps.registry.getPost(args.address)
  if (!post) throw new WinglineError('input', 'post_unknown', `没有岗位 ${args.address}`, { hint: '用 wl ps 查看现有岗位' })
  await preflight(deps)
  const hash = createHash('sha256').update(args.message).digest('hex')
  const id = nextRequestId(deps.registry, post.team, args.address.split('@')[0]!, 'send', hash)
  deps.registry.beginRequest(id)
  try {
    const { handle, result } = await sendWithRelocate(deps, args.address, args.message, args.retryRequest)
    deps.registry.finishRequest(id, confirmed(result) ? 'done' : 'uncertain', result)
    if (!confirmed(result)) {
      throw new WinglineError('uncertain', 'send_unconfirmed', `消息已输入 ${args.address}，但未确认被处理，不会自动重发`, {
        hint: `先看 ${args.address} 的终端是否收到。要确认是否送达（不会重复发送）：` +
          `wl send ${args.address} <同一条消息> --retry-request ${result.requestId ?? '<ID>'}`,
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
