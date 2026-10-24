// 3D-2 探针（spec 第 3 节探针 1、2、4）。
//   WINGLINE_SPIKE_WORKTREE=<专用测试 worktree 的选择器> pnpm tsx spikes/phase-3d2.ts read
//       探针 1：terminal show 的 preview 与 terminal read --screen --limit N 各能拿到多少行。会建一个临时终端并关闭。
//   WINGLINE_SPIKE_WORKTREE=<同上> pnpm tsx spikes/phase-3d2.ts sample <terminal-handle> <样本名> [--source <说明>]
//       探针 2：把一个正在运行的 claude / codex 终端当前的渲染画面（最后 40 行）存成 test/fixtures/screens/<样本名>.txt。
//       只读那个终端，不往里打字。请在画面上真的出现“上下文快满”或“用量上限”时运行；样本名建议
//       claude-context-low、claude-usage-limit、codex-context-low、codex-usage-limit。
//   WINGLINE_SPIKE_WORKTREE=<同上> pnpm tsx spikes/phase-3d2.ts remote <environment> <query> [agent]
//       探针 4：orca search --environment 的命中是否带 snippet / cwd。query 不用加引号，脚本会加。
import fs from 'node:fs'
import path from 'node:path'
import { finish, record, setup } from './lib.js'

const probe = 'phase-3d2'
const [mode, ...rest] = process.argv.slice(2)
const { runner, client, worktree } = setup()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** `terminal read --json` 的回执是 { terminal: { tail: string[], source, limited, returnedLineCount, … } }（探针 1 实测）。 */
function longestString(v: unknown): string {
  const tail = (v as { terminal?: { tail?: unknown } } | null)?.terminal?.tail
  return Array.isArray(tail) ? tail.join('\n') : ''
}
const rowsOf = (s: string) => (s === '' ? 0 : s.split(/\r?\n/).length)

async function read(): Promise<void> {
  const PRINT = `node -e "for(let i=1;i<=120;i++)console.log('LINE-'+String(i).padStart(3,'0'));process.stdin.resume()"`
  const created = await client.terminalCreate({ worktree, title: 'spike-3d2-read', command: PRINT })
  const rows: Record<string, unknown> = {}
  try {
    await sleep(3000)
    const show = await client.terminalShow({ handle: created.handle })
    rows['show.preview'] = { chars: show.preview.length, rows: rowsOf(show.preview), first: show.preview.split(/\r?\n/)[0] }
    record(probe, 'show', show)
    for (const limit of [8, 40, 80, 200]) {
      try {
        const r = await runner.json<Record<string, unknown>>(['terminal', 'read', '--terminal', created.handle, '--screen', '--limit', String(limit)])
        const text = longestString(r)
        record(probe, `read-screen-limit-${limit}`, r)
        rows[`read --screen --limit ${limit}`] = { source: (r.terminal as { source?: string } | undefined)?.source, returned: (r.terminal as { returnedLineCount?: number } | undefined)?.returnedLineCount, chars: text.length, rows: rowsOf(text), first: text.split(/\r?\n/)[0], last: text.split(/\r?\n/).filter(Boolean).at(-1) }
      } catch (e) {
        rows[`read --screen --limit ${limit}`] = { error: String(e) }
      }
    }
    try {
      const r = await runner.json<Record<string, unknown>>(['terminal', 'read', '--terminal', created.handle, '--screen'])
      record(probe, 'read-screen-nolimit', r)
      const text = longestString(r)
      rows['read --screen (no limit)'] = { source: (r.terminal as { source?: string } | undefined)?.source, returned: (r.terminal as { returnedLineCount?: number } | undefined)?.returnedLineCount, chars: text.length, rows: rowsOf(text) }
    } catch (e) {
      rows['read --screen (no limit)'] = { error: String(e) }
    }
  } finally {
    await client.terminalClose({ handle: created.handle })
  }
  record(probe, 'read-summary', rows)
  console.log(JSON.stringify(rows, null, 2))
  const got40 = (rows['read --screen --limit 40'] as { rows?: number } | undefined)?.rows ?? 0
  finish('phase-3d2-read', got40 >= 30 ? '成立' : got40 > 0 ? '部分成立' : '不成立', `show.rows=${(rows['show.preview'] as { rows: number }).rows} screen.limit40.rows=${got40}`)
}

async function sample(): Promise<void> {
  const [handle, name] = rest
  const srcIdx = rest.indexOf('--source')
  const source = srcIdx >= 0 ? rest[srcIdx + 1] : 'captured from a real terminal'
  if (!handle || !name) throw new Error('用法：phase-3d2.ts sample <terminal-handle> <样本名> [--source <说明>]')
  const r = await runner.json<Record<string, unknown>>(['terminal', 'read', '--terminal', handle, '--screen', '--limit', '40'])
  const text = longestString(r).replace(/\r\n/g, '\n').replace(/\s+$/, '')
  const dir = path.join('test', 'fixtures', 'screens')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.txt`)
  fs.writeFileSync(file, `# source: ${source}; ${new Date().toISOString()}; orca terminal read --screen --limit 40\n${text}\n`)
  record(probe, `sample-${name}`, r)
  console.log(`已写入 ${file}（${rowsOf(text)} 行）。检查内容里是否含对话正文或敏感信息后再提交。`)
}

async function remote(): Promise<void> {
  const [env, query, agent = 'claude'] = rest
  if (!env || !query) throw new Error('用法：phase-3d2.ts remote <environment> <query> [agent]')
  const r = await runner.json<{ hits?: Array<Record<string, unknown>> }>(['search', `"${query}"`, '--agent', agent, '--fresh', '--environment', env])
  record(probe, 'remote-search', r)
  const hits = r.hits ?? []
  const withSnippet = hits.filter((h) => typeof (h.evidence as { snippet?: unknown } | undefined)?.snippet === 'string').length
  const cwds = hits.map((h) => h.cwd ?? null)
  console.log(JSON.stringify({ hits: hits.length, withSnippet, cwds }, null, 2))
  finish('phase-3d2-remote', hits.length === 0 ? '不成立' : withSnippet === hits.length ? '成立' : '部分成立', `hits=${hits.length} withSnippet=${withSnippet} cwd=${JSON.stringify(cwds)}`)
}

if (mode === 'read') await read()
else if (mode === 'sample') await sample()
else if (mode === 'remote') await remote()
else throw new Error('用法：phase-3d2.ts read | sample | remote')

