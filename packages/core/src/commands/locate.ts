import { WinglineError } from '../errors.js'
import type { OrcaClient, TerminalSummary } from '../orca/types.js'

/** 按终端标题（即岗位地址）精确查找；多个同名终端无法判断该动哪个，按不确定处理。 */
export async function locatePost(orca: OrcaClient, address: string): Promise<TerminalSummary | null> {
  const matches = (await orca.terminalList()).filter((t) => t.title === address)
  if (matches.length > 1) {
    throw new WinglineError('uncertain', 'duplicate_post_terminal', `有 ${matches.length} 个终端的标题都是 ${address}`, {
      hint: '请在 Orca 中关闭多余的终端后重试',
    })
  }
  return matches[0] ?? null
}
