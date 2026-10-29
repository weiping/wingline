export type TeamTemplateId = 'duo' | 'solo' | 'trio'
export type RoleKind = 'builder' | 'checker' | 'planner'

export interface TeamTemplatePost {
  id: string
  role: RoleKind
  agent: string
  model?: string
  launch?: string
  brief: string
}

export interface TeamTemplate {
  id: TeamTemplateId
  label: string
  summary: string
  lead: string
  posts: TeamTemplatePost[]
  links: Record<string, Record<string, string[]>>
}

const CHECKER_LAUNCH = 'codex --model gpt-6-astra -c model_reasoning_effort="high"'

export const TEAM_TEMPLATES: Record<TeamTemplateId, TeamTemplate> = {
  duo: {
    id: 'duo',
    label: '双人协作',
    summary: 'builder 负责实现，checker 负责独立审查',
    lead: 'builder',
    posts: [
      { id: 'builder', role: 'builder', agent: 'claude', model: 'opus', brief: 'briefs/builder.md' },
      { id: 'checker', role: 'checker', agent: 'codex', launch: CHECKER_LAUNCH, brief: 'briefs/checker.md' },
    ],
    links: { builder: { reviewed_by: ['checker'] } },
  },
  solo: {
    id: 'solo',
    label: '单人',
    summary: '单岗位 builder 独立完成实现与自检',
    lead: 'builder',
    posts: [
      { id: 'builder', role: 'builder', agent: 'claude', model: 'opus', brief: 'briefs/builder.md' },
    ],
    links: {},
  },
  trio: {
    id: 'trio',
    label: '三人流水线',
    summary: 'planner 规划拆解，移交 builder 实现，checker 负责审查',
    lead: 'planner',
    posts: [
      { id: 'planner', role: 'planner', agent: 'claude', model: 'opus', brief: 'briefs/planner.md' },
      { id: 'builder', role: 'builder', agent: 'claude', model: 'opus', brief: 'briefs/builder.md' },
      { id: 'checker', role: 'checker', agent: 'codex', launch: CHECKER_LAUNCH, brief: 'briefs/checker.md' },
    ],
    links: {
      planner: { hands_to: ['builder'] },
      builder: { reviewed_by: ['checker'] },
    },
  },
}

export const ROLE_BRIEFS: Record<RoleKind, (team: string, post: string) => string> = {
  builder: (team, _post) =>
    [
      `你是 ${team} 团队的实现岗，负责把需求落成代码。`,
      '',
      '- 先读懂需求和现有代码，再说明方案，再实现。',
      '- 优先写测试，再写实现；每次改动保持测试通过。',
      `- 完成一个可审查的改动后，用 \`wl send checker@${team} "<摘要和文件列表>"\` 请审查岗审查。`,
      '- 收到审查意见后，逐条回应：修改，或说明为什么不改。',
      '- 需求不清时向牵头岗或用户确认，不要自行扩大范围。',
    ].join('\n'),
  checker: (team, _post) =>
    [
      `你是 ${team} 团队的审查岗，负责独立审查改动。`,
      '',
      '- 收到审查请求后，先看改动本身和相关测试，再给意见。',
      '- 重点看：正确性、边界情况、测试是否真的覆盖了行为、是否引入不必要的复杂度。',
      `- 意见分级：必须修改 / 建议修改 / 仅供参考；用 \`wl send builder@${team} "<意见>"\` 回复。`,
      '- 你可以运行测试和只读命令，但不要直接改实现岗的代码；需要改动时把建议发给对方。',
      '- 没有问题时明确回复"通过"，并说明你检查了什么。',
    ].join('\n'),
  planner: (team, _post) =>
    [
      `你是 ${team} 团队的规划岗，负责拆解需求与验收标准。`,
      '',
      '- 先读懂需求与现有代码结构，给出清晰的分步方案与边界条件。',
      '- 将拆解好的子任务与验收标准写清楚，避免模糊描述。',
      `- 方案就绪后，用 \`wl send builder@${team} "<方案与任务说明>"\` 移交实现岗。`,
      '- 实现或审查过程中遇到范围变更时，及时更新方案并同步相关岗位。',
      '- 拿不准的产品或架构取舍先向用户确认，不要替用户拍板。',
    ].join('\n'),
}

export function renderTeamYaml(t: TeamTemplate, a: { name: string; repo: string }): string {
  const repo = a.repo.startsWith('path:') ? a.repo : `path:${a.repo}`
  const lines = [
    'version: 1',
    `name: ${a.name}`,
    `repo: ${repo}`,
    'norms: NORMS.md',
    `lead: ${t.lead}`,
    'posts:',
  ]
  for (const p of t.posts) {
    lines.push(`  - id: ${p.id}`, `    agent: ${p.agent}`)
    if (p.model) lines.push(`    model: ${p.model}`)
    if (p.launch) lines.push(`    launch: '${p.launch}'`)
    lines.push('    worktree: current', `    brief: [${p.brief}]`)
  }
  const linkEntries = Object.entries(t.links)
  if (linkEntries.length > 0) {
    lines.push('links:')
    for (const [post, rels] of linkEntries) {
      lines.push(`  ${post}:`)
      for (const [rel, targets] of Object.entries(rels)) {
        lines.push(`    ${rel}: [${targets.join(', ')}]`)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

export function renderNorms(a: { team: string; posts: string[] }): string {
  const lead = a.posts[0] ?? 'builder'
  const peer = a.posts[1] ?? lead
  return [
    `# ${a.team} 团队规范`,
    '',
    `在岗角色：${a.posts.join('、')}。`,
    '',
    '1. 改动前先用一两句话说明你打算怎么做，再动手。',
    '2. 改完先自己跑测试，确认通过再汇报。',
    `3. 需要其他岗位审查或回答时，用 \`wl send <地址> "<消息>"\` 联系，地址形如 \`${peer}@${a.team}\`。`,
    '4. 消息写清楚：改了什么、在哪个文件、希望对方做什么。',
    '5. 不修改其他岗位正在改的文件；拿不准时先问。',
    '6. 小步提交，提交信息说明为什么改。',
    `7. 遇到无法判断的事（需求不清、权限、破坏性操作），停下来问牵头岗 \`${lead}@${a.team}\`，不要猜。`,
    '8. 收到消息后尽快回复；暂时无法处理时说明原因。',
    '',
  ].join('\n')
}

export function renderBrief(role: RoleKind, a: { team: string; post: string }): string {
  return `# ${a.post} 岗位说明\n\n${ROLE_BRIEFS[role](a.team, a.post)}\n`
}
