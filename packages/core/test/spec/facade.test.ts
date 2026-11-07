import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createSpecFacade } from '../../src/spec/facade.js'
import { draftPathOf, fileHash } from '../../src/spec/draft.js'
import { DUO_YAML } from '../spec/helpers.js'
import { FakeOrca, seedRunningTeam } from '../commands/fake-client.js'

const EDITED = DUO_YAML.replace('model: opus', 'model: sonnet')

function seed(status: 'up' | 'stopped' = 'up') {
  const { deps, registry } = seedRunningTeam(new FakeOrca(), { files: { 'NORMS.md': '# duo 团队规范\n' } })
  const specPath = registry.getTeam('duo')!.specPath
  if (status === 'stopped') registry.setTeamStatus('duo', 'stopped')
  return { deps, registry, specPath }
}

test('createSpecFacade.readForEdit 与 readSpecForEdit 一致', () => {
  const { deps } = seed()
  const f = createSpecFacade(deps)
  const r = f.readForEdit('duo')
  expect(r).toMatchObject({ yaml: DUO_YAML, hash: fileHash(r.specPath), draft: null, running: true })
})

test('createSpecFacade.validate 不写盘并返回 preview', () => {
  const { deps, specPath } = seed()
  const f = createSpecFacade(deps)
  const ok = f.validate('duo', { yaml: EDITED })
  expect(ok.errors).toEqual([])
  expect(ok.preview?.commands).toContain(`wl up ${specPath} --draft`)
  expect(fs.readFileSync(specPath, 'utf8')).toBe(DUO_YAML)
})

test('createSpecFacade.save 经审计写草稿', async () => {
  const { deps, registry, specPath } = seed()
  const f = createSpecFacade(deps)
  const res = await f.save('duo', { yaml: EDITED, baseHash: null, running: true })
  expect(res.wrote).toBe('draft')
  expect(fs.readFileSync(draftPathOf(specPath), 'utf8')).toBe(EDITED)
  const audits = registry.listAudit('duo').filter((a) => a.command === 'spec save')
  expect(audits.length).toBeGreaterThan(0)
  expect(audits.at(-1)!.actor).toBe('human')
})
