// 阶段 0 探针公用代码。探针会在真实 Orca 中创建/关闭终端和 Run，只在测试仓库的专用 worktree 里运行：
//   WINGLINE_SPIKE_WORKTREE=<Orca worktree 选择器> pnpm tsx spikes/<探针>.ts
import fs from 'node:fs'
import path from 'node:path'
import {
  createCallLog, createOrcaClient, createOrcaRunner, resolveOrcaExecutable, winglineHome,
} from '../packages/core/src/index.js'

/** 占位进程：只挂着读 stdin，三个平台都有（Windows 没有 cat）。 */
export const IDLE_COMMAND = 'node -e "process.stdin.resume()"'

export type Verdict = '成立' | '不成立' | '部分成立'

export function setup() {
  const env = process.env
  const exe = resolveOrcaExecutable({
    env, platform: process.platform,
    which: (n) => (env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, n)).find((f) => fs.existsSync(f)) ?? null,
  })
  const runner = createOrcaRunner(exe, createCallLog(path.join(winglineHome(env), 'logs')))
  const worktree = env.WINGLINE_SPIKE_WORKTREE
  if (!worktree) throw new Error('请设置 WINGLINE_SPIKE_WORKTREE 为测试仓库专用 worktree 的选择器')
  return { runner, client: createOrcaClient(runner), worktree }
}

export function record(probe: string, name: string, data: unknown): void {
  const dir = path.join('spikes', 'out', probe, process.platform)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2))
}

export function finish(probe: string, verdict: Verdict, reason: string): void {
  console.log(`RESULT ${probe} ${verdict} ${reason}`)
}

/** 回执字段名在真实 Orca 里才能确定：按键名正则递归找第一个字符串值。 */
export function findString(obj: unknown, key: RegExp): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj)) {
    if (key.test(k) && typeof v === 'string') return v
    const nested = findString(v, key)
    if (nested) return nested
  }
  return undefined
}

export async function confirm(prompt: string): Promise<boolean> {
  const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${prompt} 输入 yes 继续：`)
  rl.close()
  return answer.trim() === 'yes'
}
