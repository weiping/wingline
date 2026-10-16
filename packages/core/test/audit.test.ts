import { expect, test } from 'vitest'
import { auditedCommands, clip } from '../src/audit.js'
import { send } from '../src/commands/send.js'
import type { CommandDeps } from '../src/commands/deps.js'
import { WinglineError } from '../src/errors.js'
import { FakeOrca, seedRunningTeam } from './commands/fake-client.js'

/** 与 cli 包 audit-table.ts 里 send 条目同形的测试替身。 */
const SEND = {
  command: 'send',
  team: (a: { address: string }) => a.address.split('@')[1] ?? '-',
  target: (a: { address: string }) => a.address,
  summary: (a: { message: string }) => ({ message: a.message }),
}

const ok = <A>(r: unknown) => async (_deps: CommandDeps, _a: A): Promise<unknown> => r

/** 100 字、含一个换行。 */
const BODY = 'A'.repeat(60) + '\n' + 'B'.repeat(39)

test('clip flattens control characters and truncates with the total length', () => {
  expect(clip('短消息')).toBe('短消息')
  expect(clip('一\n二\t三')).toBe('一 二 三')
  expect(clip(BODY)).toBe('A'.repeat(60) + '…（共 100 字）')
  expect(clip('x'.repeat(100), 10)).toBe('xxxxxxxxxx…（共 100 字）')
})

test('a wrapped command writes ok with actor, target and clipped summary', async () => {
  const made = seedRunningTeam(new FakeOrca())
  const wrapped = auditedCommands({ send }, { send: SEND })
  const r = await wrapped.send(made.deps, { address: 'builder@duo', message: BODY })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'delivered', handle: 'term-b' })

  const rows = made.registry.listAudit('duo')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    team: 'duo', actor: 'human', command: 'send', target: 'builder@duo', outcome: 'ok',
  })
  const detail = JSON.parse(rows[0]!.detail!)
  // 正文压成单行，只留前 60 字并标明原长
  expect(detail.message).toBe('A'.repeat(60) + '…（共 100 字）')
  expect(detail.message).not.toContain('\n')
})

test('the actor is the --as address when the command carries one', async () => {
  const made = seedRunningTeam(new FakeOrca())
  const wrapped = auditedCommands({ done: ok<{ id: string; as?: string }>({ status: 'done' }) }, {
    done: { command: 'task done', team: () => 'duo', target: (a) => a.id, summary: (a) => ({ as: a.as }) },
  })
  await wrapped.done(made.deps, { id: 'task-1', as: 'builder@duo' })
  expect(made.registry.listAudit('duo')[0]).toMatchObject({ actor: 'builder@duo', command: 'task done', target: 'task-1' })
  expect(JSON.parse(made.registry.listAudit('duo')[0]!.detail!)).toEqual({ as: 'builder@duo' })
})

test('an unreachable Orca while resolving the actor records unknown and is tried once', async () => {
  const made = seedRunningTeam(new FakeOrca())
  made.deps.env.ORCA_TERMINAL_HANDLE = 'term-b'
  let lists = 0
  made.deps.orca.terminalList = async () => {
    lists++
    throw new WinglineError('orca', 'runtime_unavailable', 'Orca 未运行或不可达')
  }
  const wrapped = auditedCommands({ ps: ok<Record<string, never>>({}) }, { ps: { command: 'ps', team: () => 'duo' } })
  await wrapped.ps(made.deps, {})
  expect(lists).toBe(1)
  expect(made.registry.listAudit('duo')[0]).toMatchObject({ actor: 'unknown', outcome: 'ok' })
})

test('a failing command writes <kind>:<code> and rethrows the same error', async () => {
  const made = seedRunningTeam(new FakeOrca())
  const boom = new WinglineError('orca', 'runtime_unavailable', 'Orca 未运行或不可达')
  const wrapped = auditedCommands({ send: async (_d: CommandDeps, _a: { address: string; message: string }): Promise<unknown> => { throw boom } }, { send: SEND })
  await expect(wrapped.send(made.deps, { address: 'builder@duo', message: '在' })).rejects.toBe(boom)
  expect(made.registry.listAudit('duo')[0]).toMatchObject({
    team: 'duo', command: 'send', target: 'builder@duo', outcome: 'orca:runtime_unavailable',
  })
})

test('audit write failure only warns and the command result is untouched', async () => {
  const made = seedRunningTeam(new FakeOrca())
  made.registry.appendAudit = () => { throw new Error('database is locked') }
  const warnings: string[] = []
  made.deps.warn = (m) => { warnings.push(m) }
  const wrapped = auditedCommands({ send }, { send: SEND })
  const r = await wrapped.send(made.deps, { address: 'builder@duo', message: '在' })
  expect(r).toEqual({ address: 'builder@duo', outcome: 'delivered', handle: 'term-b' })
  expect(made.registry.listAudit('duo')).toEqual([])
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toContain('审计')
})

test('restore --dry-run is not audited', async () => {
  const made = seedRunningTeam(new FakeOrca())
  const RESTORE = {
    command: 'restore',
    team: (a: { team: string; dryRun?: boolean }) => a.team,
    skip: (a: { team: string; dryRun?: boolean }) => !!a.dryRun,
    summary: (a: { team: string; dryRun?: boolean }) => ({ dryRun: !!a.dryRun }),
  }
  const wrapped = auditedCommands({ restore: ok<{ team: string; dryRun?: boolean }>({ team: 'duo' }) }, { restore: RESTORE })
  await wrapped.restore(made.deps, { team: 'duo', dryRun: true })
  expect(made.registry.listAudit('duo')).toEqual([])
  await wrapped.restore(made.deps, { team: 'duo' })
  const rows = made.registry.listAudit('duo')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ command: 'restore', team: 'duo', outcome: 'ok' })
  expect(JSON.parse(rows[0]!.detail!)).toEqual({ dryRun: false })
})
