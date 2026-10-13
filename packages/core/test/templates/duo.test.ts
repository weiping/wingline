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
