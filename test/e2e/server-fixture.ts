import { fileURLToPath } from 'node:url'
import { createConsoleServer, type ConsoleServer } from '../../packages/core/src/index.js'
import { FakeOrca, seedRunningTeam } from '../../packages/core/test/commands/fake-client.js'

export interface FixtureConsole {
  port: number
  loginUrl(): string
  close(): Promise<void>
}

/**
 * 用 FakeOrca 与临时 WINGLINE_HOME（由 seedRunningTeam 的 mkDeps 决定）起一个真实的控制台服务，
 * 并放入一条待回答的提问：收件箱里能看到它，回答后写一条 console: 前缀的审计事件。
 */
export async function startFixtureConsole(): Promise<FixtureConsole> {
  const o = new FakeOrca()
  const { deps } = seedRunningTeam(o)
  o.questions.set('msg-q1', { dispatchId: 'dispatch-1', taskId: 'task-1', asker: 'checker@duo', answered: false })
  deps.registry.recordQuestion({
    team: 'duo',
    messageId: 'msg-q1',
    taskId: 'task-1',
    dispatchId: 'dispatch-1',
    asker: 'checker@duo',
    body: '选哪个方案？',
    options: ['A', 'B'],
    relayedAt: new Date().toISOString(),
  })
  const webRoot = fileURLToPath(new URL('../../packages/cli/dist/web', import.meta.url))
  const srv: ConsoleServer = await createConsoleServer(deps, { port: 0, webRoot })
  return {
    port: srv.port,
    loginUrl: () => srv.loginUrl(),
    close: () => srv.close(),
  }
}
