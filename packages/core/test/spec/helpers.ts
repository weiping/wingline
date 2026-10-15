import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DUO_YAML = `version: 1
name: duo
repo: path:/abs/repo
norms: NORMS.md
lead: builder
posts:
  - id: builder
    agent: claude
    model: opus
    worktree: current
    brief: [briefs/builder.md]
  - id: checker
    agent: codex
    launch: 'codex --model gpt-6-astra -c model_reasoning_effort="high"'
    worktree: current
    brief: [briefs/checker.md]
`

/** 在临时目录里写出 team.yaml 与引用文件，返回 team.yaml 路径。 */
export function mkTeam(yaml: string, opts: { dir?: string; files?: Record<string, string> } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-spec-'))
  const dir = path.join(root, opts.dir ?? 'team')
  const files = { 'NORMS.md': 'norms', 'briefs/builder.md': 'b', 'briefs/checker.md': 'c', ...opts.files }
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  fs.writeFileSync(path.join(dir, 'team.yaml'), yaml)
  return path.join(dir, 'team.yaml')
}

/** builder 允许自领、带 backend 标签、先计划后动手；checker 保持默认。 */
export const SELF_CLAIM_YAML = DUO_YAML.replace(
  '    brief: [briefs/builder.md]',
  '    brief: [briefs/builder.md]\n    self_claim: true\n    tags: [backend]\n    plan_first: true',
)
