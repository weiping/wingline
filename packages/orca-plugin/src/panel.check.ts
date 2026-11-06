// orca plugin check 会逐个渲染这里的场景：空账本 与 有团队。
import { defineCheck } from 'orca/testing'

export default defineCheck({
  empty: {
    requests: { 'teams.list': { teams: [] } }
  },
  teams: {
    requests: {
      'teams.list': {
        teams: [{ name: 'duo', status: 'up', runId: 'r1', posts: 2, specPath: '/tmp/duo.yaml' }]
      }
    }
  }
})
