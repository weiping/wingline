import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { renderBriefing } from '../../src/brief/render.js'
import { loadTeamSpec } from '../../src/spec/load.js'

const spec = loadTeamSpec(path.resolve(__dirname, '../../../../teams/duo/team.yaml'))

test('duo template loads with two posts, builder leading', () => {
  expect(spec.posts.map((p) => p.id)).toEqual(['builder', 'checker'])
  expect(spec.lead).toBe('builder')
  expect(spec.posts[0]!.launch).toBe('claude --model opus')
})

test.each(['builder', 'checker'])('duo %s briefing renders within the limit and names its peers', (id) => {
  const text = renderBriefing(spec, id)
  expect(text.length).toBeLessThan(12000)
  expect(text).toContain(`你是 ${id}@duo`)
  expect(text).toContain('builder@duo（牵头）')
})

test('final-review m7: the commented-out patrol example in team.yaml is valid once uncommented', () => {
  const dir = path.resolve(__dirname, '../../../../teams/duo')
  const lines = fs.readFileSync(path.join(dir, 'team.yaml'), 'utf8').split('\n')
  const start = lines.findIndex((l) => l.startsWith('# patrol:'))
  expect(start).toBeGreaterThan(0)
  const body = lines.slice(start).filter((l) => l.startsWith('# ')).map((l) => l.slice(2))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-duo-'))
  fs.cpSync(dir, tmp, { recursive: true })
  fs.writeFileSync(path.join(tmp, 'team.yaml'), [...lines.slice(0, start), ...body].join('\n'))
  const loaded = loadTeamSpec(path.join(tmp, 'team.yaml'))
  expect(loaded.patrol).toMatchObject({ noProgressMinutes: 20, promptMinutes: 5, freezeLead: false, notify: { webhook: 'https://example.com/hook' } })
})
