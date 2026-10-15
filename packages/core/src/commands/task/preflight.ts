import fs from 'node:fs'
import { WinglineError } from '../../errors.js'
import type { TeamRow } from '../../registry/registry.js'
import { specHash } from '../../spec/hash.js'
import { loadTeamSpec, type TeamSpec } from '../../spec/load.js'
import type { CommandDeps } from '../deps.js'
import { findTaskAnywhere, mustTeamReady, type TaskRow } from './query.js'

/** spec 第 10 节"通用前置"；list/show 用 { orca: false } 跳过 status 检查。顺序：Orca → 团队 → Run → 规格文件 → 规格哈希。 */
export async function taskPreflight(deps: CommandDeps, team: string, o: { orca?: boolean } = {}): Promise<{ team: TeamRow; spec: TeamSpec }> {
  if (o.orca !== false && !(await deps.orca.status()).reachable) {
    throw new WinglineError('orca', 'runtime_unavailable', 'Orca 运行时不可达', { hint: '先执行 orca open（或打开 Orca 应用）' })
  }
  const row = mustTeamReady(deps, team)
  if (!fs.existsSync(row.specPath)) {
    throw new WinglineError('input', 'spec_not_found', `团队规格 ${row.specPath} 不存在`, { hint: '恢复该文件，或 wl down 后重新 wl up' })
  }
  const spec = loadTeamSpec(row.specPath)
  if (specHash(spec) !== row.specHash) {
    throw new WinglineError('input', 'team_spec_changed', `团队 ${team} 的规格在运行期间被修改`, {
      hint: `不支持在线修改编队，请先执行 wl down ${team}，再 wl up`,
    })
  }
  return { team: row, spec }
}

/** 先做前置（Orca 可达、团队、规格），再读任务列表：Orca 不可达时报 runtime_unavailable，而不是 task-list 的原始错误。 */
export async function preflightTask(deps: CommandDeps, id: string): Promise<{ team: TeamRow; spec: TeamSpec; task: TaskRow }> {
  const known = deps.registry.getTaskExt(id)?.team
  let pre = known ? await taskPreflight(deps, known) : null
  const { team, task } = await findTaskAnywhere(deps, id)
  pre ??= await taskPreflight(deps, team.name)
  return { team, spec: pre.spec, task }
}
