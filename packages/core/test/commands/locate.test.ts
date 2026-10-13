import { expect, test } from 'vitest'
import { locatePost } from '../../src/commands/locate.js'
import { FakeOrca } from './fake-client.js'

const t = (handle: string, title: string | null) => ({ handle, title, connected: true, worktreeId: 'w' })

test('finds by exact title', async () => {
  const o = new FakeOrca()
  o.terminals = [t('1', 'builder@duo'), t('2', 'builder@duo2'), t('3', null)]
  expect(await locatePost(o, 'builder@duo')).toMatchObject({ handle: '1' })
})

test('no match is null', async () => {
  expect(await locatePost(new FakeOrca(), 'x@y')).toBeNull()
})

test('duplicate titles are uncertain', async () => {
  const o = new FakeOrca()
  o.terminals = [t('1', 'a@b'), t('2', 'a@b')]
  await expect(locatePost(o, 'a@b')).rejects.toMatchObject({ kind: 'uncertain', code: 'duplicate_post_terminal' })
})
