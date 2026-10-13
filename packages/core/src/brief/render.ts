import fs from 'node:fs'
import { WinglineError } from '../errors.js'
import type { TeamSpec } from '../spec/load.js'

export const BRIEFING_LIMIT = 12_000

export function renderBriefing(
  spec: TeamSpec,
  postId: string,
  readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8'),
): string {
  const post = spec.posts.find((p) => p.id === postId)
  if (!post) throw new WinglineError('input', 'post_unknown', `团队 ${spec.name} 没有岗位 ${postId}`)

  const roster = spec.posts
    .map((p) => `- ${p.id}@${spec.name}${p.id === spec.lead ? '（牵头）' : ''} · ${p.agent}`)
    .join('\n')
  const sections = [
    `你是 ${postId}@${spec.name}，你的职责见下方岗位说明。`,
    `## 团队名册\n${roster}`,
    `## 团队规范\n${readFile(spec.normsPath).trim()}`,
    ...post.briefPaths.map((p) => `## 岗位说明\n${readFile(p).trim()}`),
    `## 沟通方式\n用 \`wl send <地址> "<消息>"\` 联系其他岗位，例如 \`wl send ${spec.lead}@${spec.name} "..."\`。`,
  ]
  const text = sections.join('\n\n')
  if (text.length > BRIEFING_LIMIT) {
    throw new WinglineError('input', 'briefing_too_long', `岗位 ${postId}@${spec.name} 的启动包 ${text.length} 字符，超过 ${BRIEFING_LIMIT}`, {
      hint: '请精简 NORMS 或 brief 文件，雁阵不会截断启动包',
    })
  }
  return text
}
