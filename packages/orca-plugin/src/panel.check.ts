// orca plugin check 会逐个渲染这里的场景：空账本、单个团队、展开后的岗位列表。
import { defineCheck } from 'orca/testing'

const TEAM = { name: 'duo', status: 'up', runId: 'r-12345678', posts: 2, specPath: '/tmp/duo/team.yaml' }
const POSTS = {
  posts: [
    { address: 'builder@duo', agent: 'claude', status: 'live', handle: 'term_1', isLead: true },
    { address: 'checker@duo', agent: 'codex', status: 'uncertain', handle: 'term_2', isLead: false }
  ]
}

export default defineCheck({
  empty: {
    requests: { 'teams.list': { teams: [] } }
  },
  teams: {
    requests: { 'teams.list': { teams: [TEAM] } }
  },
  posts: {
    requests: {
      'teams.list': { teams: [TEAM] },
      'team.posts': POSTS
    }
  }
})
