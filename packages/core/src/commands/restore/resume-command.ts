import { WinglineError } from '../../errors.js'

/** 会话 ID 形如 Orca 分配的 UUID / 内部 ID：字母、数字、连字符之外的字符一律拒绝。 */
export const SESSION_ID = /^[A-Za-z0-9-]+$/

/** 各 agent 的接回命令模板：launch 原样保留所有旗标，接回参数追加在末尾。 */
const RESUME_TEMPLATES: Record<string, (launch: string, sessionId: string) => string> = {
  claude: (launch, sessionId) => `${launch} --resume ${sessionId}`,
}

/** 拼出该 agent 的接回命令；不支持接回的 agent 返回 null（调用方走 fresh）。 */
export function resumeCommand(agent: string, launch: string, sessionId: string): string | null {
  if (!SESSION_ID.test(sessionId)) {
    throw new WinglineError('input', 'session_override_invalid', `会话 ID ${sessionId} 含非法字符`, {
      hint: '只接受字母、数字与连字符',
    })
  }
  const template = RESUME_TEMPLATES[agent]
  return template ? template(launch, sessionId) : null
}
