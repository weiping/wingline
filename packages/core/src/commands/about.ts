import fs from 'node:fs'
import path from 'node:path'
import { WinglineError } from '../errors.js'
import type { ConsoleFile } from '../server/control.js'
import { draftPathOf } from '../spec/draft.js'
import type { CommandDeps } from './deps.js'
import { dispatcherHealth, type DispatcherHealth } from './dispatcher/lifecycle.js'
import { autostartStatusOf, type AutostartStatus, type AutostartSys } from './autostart/index.js'
import { realAutostartSys } from './autostart/sys.js'
import { inRange } from './version-range.js'

export interface AboutItem {
  key: string
  value: string | number | boolean | null
  source: 'env' | 'default' | 'registry' | 'file' | 'orca'
  note?: string
}

export type AboutAutostart =
  | ({ supported: true } & AutostartStatus & { platform: string; user?: string; logPath: string })
  | { supported: false; reason: string }

export interface AboutTeam {
  name: string
  specPath: string
  status: string
  draft: boolean
  dispatcher: DispatcherHealth['state']
}

/** 目录下所有文件的字节数之和；目录不存在算 0。 */
function dirBytes(dir: string): number {
  let total = 0
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    try {
      total += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size
    } catch {
      // 读到一半被删掉的文件不算
    }
  }
  return total
}

async function orcaVersion(deps: CommandDeps): Promise<{ version: AboutItem; verified: AboutItem }> {
  try {
    const v = await deps.orca.version()
    return {
      version: { key: 'orca.version', value: v, source: 'orca' },
      verified: { key: 'orca.verified', value: inRange(v, deps.verifiedOrca), source: 'default', note: deps.verifiedOrca },
    }
  } catch (err) {
    const note = err instanceof WinglineError ? err.code : 'unknown'
    return {
      version: { key: 'orca.version', value: null, source: 'orca', note },
      verified: { key: 'orca.verified', value: null, source: 'default', note: deps.verifiedOrca },
    }
  }
}

function orcaPathItem(deps: CommandDeps, env: NodeJS.ProcessEnv): AboutItem {
  if (env.WINGLINE_ORCA) return { key: 'orca.path', value: deps.orcaPath, source: 'env', note: 'WINGLINE_ORCA' }
  if (env.ORCA_CLI_COMMAND) return { key: 'orca.path', value: deps.orcaPath, source: 'env', note: 'ORCA_CLI_COMMAND' }
  return { key: 'orca.path', value: deps.orcaPath, source: 'default', note: 'PATH' }
}

function consoleItems(f: ConsoleFile | null): AboutItem[] {
  if (!f) return []
  return [
    { key: 'console.pid', value: f.pid, source: 'file' },
    { key: 'console.port', value: f.port, source: 'file' },
    { key: 'console.startedAt', value: f.startedAt, source: 'file' },
  ]
}

/** 开机自启状态：取不到（平台不支持 / 权限不足）时显式说原因，不抛错。 */
async function autostartItem(deps: CommandDeps, sys: AutostartSys): Promise<AboutAutostart> {
  try {
    return { supported: true, ...(await autostartStatusOf(deps, sys)) }
  } catch (err) {
    return { supported: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** 控制台“关于与诊断”页的数据：只读，取不到的项目显式标 null，不影响其余各项。 */
export async function about(
  deps: CommandDeps,
  o: { version: string; consoleFile: ConsoleFile | null; env?: NodeJS.ProcessEnv; autostartSys?: AutostartSys },
): Promise<{ items: AboutItem[]; teams: AboutTeam[]; autostart: AboutAutostart }> {
  const env = o.env ?? deps.env
  const orca = await orcaVersion(deps)
  const items: AboutItem[] = [
    { key: 'wingline.version', value: o.version, source: 'default' },
    orcaPathItem(deps, env),
    orca.version,
    orca.verified,
    env.WINGLINE_HOME
      ? { key: 'home.path', value: deps.home, source: 'env', note: 'WINGLINE_HOME' }
      : { key: 'home.path', value: deps.home, source: 'default' },
    { key: 'registry.migration', value: deps.registry.schemaVersion(), source: 'registry' },
    { key: 'logs.bytes', value: dirBytes(path.join(deps.home, 'logs')), source: 'file' },
    ...consoleItems(o.consoleFile),
  ]
  const teams = deps.registry.listTeams().map((t) => ({
    name: t.name,
    specPath: t.specPath,
    status: t.status,
    draft: fs.existsSync(draftPathOf(t.specPath)),
    dispatcher: dispatcherHealth(deps, t.name).state,
  }))
  return { items, teams, autostart: await autostartItem(deps, o.autostartSys ?? realAutostartSys()) }
}
