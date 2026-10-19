import type { ComponentChildren } from 'preact'
import { isUnauthenticated } from './api.js'
import { useApi } from './hooks.js'
import { Layout, StreamBanner, TopBar } from './components/Layout.js'
import { ErrorBox, Loading } from './components/common.js'
import { Toaster } from './components/Toast.js'
import { Link } from './components/Link.js'
import { Inbox } from './pages/Inbox.js'
import { Overview } from './pages/Overview.js'
import { PostDetail } from './pages/PostDetail.js'
import { TaskBoard } from './pages/TaskBoard.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { Timeline } from './pages/Timeline.js'
import { type Route, teamPath, useRoute } from './router.js'
import { StreamProvider } from './stream.js'

interface Session {
  csrfToken: string
  version: string
  teams: string[]
}

function Expired() {
  return (
    <main class="expired">
      <h1>会话已过期</h1>
      <p>
        请在终端运行 <code>wl console --link</code> 获取新的登录链接。
      </p>
    </main>
  )
}

function Home({ teams }: { teams: string[] }) {
  if (teams.length === 0) {
    return (
      <p class="muted">
        还没有团队。先在终端运行 <code>wl up &lt;team.yaml&gt;</code>。
      </p>
    )
  }
  return (
    <section>
      <h1>团队</h1>
      <ul class="team-list">
        {teams.map((t) => (
          <li key={t}>
            <Link href={teamPath(t)}>{t}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Page({ route, team }: { route: Route; team: string }): ComponentChildren {
  switch (route.name) {
    case 'overview':
      return <Overview team={team} />
    case 'inbox':
      return <Inbox team={team} />
    case 'board':
      return <TaskBoard team={team} />
    case 'task':
      return <TaskDetail team={team} id={route.id} />
    case 'post':
      return <PostDetail team={team} post={route.post} />
    case 'log':
      return <Timeline team={team} />
    default:
      return <p class="muted">页面不存在。</p>
  }
}

function Routed({ route, teams }: { route: Route; teams: string[] }) {
  if (route.name === 'home') {
    return (
      <Layout teams={teams} team={null}>
        <Home teams={teams} />
      </Layout>
    )
  }
  if (route.name === 'notfound') {
    return (
      <Layout teams={teams} team={null}>
        <p class="muted">页面不存在。</p>
      </Layout>
    )
  }
  const team = 'team' in route ? route.team : ''
  return (
    <Layout teams={teams} team={team}>
      {/* key 随团队切换重建连接 */}
      <StreamProvider key={team} team={team}>
        <TopBar />
        <StreamBanner />
        <Page route={route} team={team} />
      </StreamProvider>
    </Layout>
  )
}

export function App() {
  const route = useRoute()
  const session = useApi<Session>('/api/session')
  let body: ComponentChildren
  if (isUnauthenticated(session.error)) body = <Expired />
  else if (session.error) body = <ErrorBox error={session.error} />
  else if (!session.data) body = <Loading />
  else body = <Routed route={route} teams={session.data.teams} />
  return (
    <>
      {body}
      <Toaster />
    </>
  )
}
