import { expect, test } from '@playwright/test'
import { startFixtureConsole, type FixtureConsole } from './server-fixture.js'

let fx: FixtureConsole

const at = (p: string) => `http://127.0.0.1:${fx.port}${p}`

test.beforeAll(async () => {
  fx = await startFixtureConsole()
})

test.afterAll(async () => {
  await fx.close()
})

test('login link → inbox → answer the question → the timeline shows the console audit event', async ({ page }) => {
  await page.goto(fx.loginUrl())
  await page.goto(at('/t/duo/inbox'))
  await expect(page.getByText('选哪个方案？', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: '回答' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill('A')
  await dialog.getByRole('button', { name: '确认' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto(at('/t/duo/log'))
  await expect(page.getByText('console: dispatcher reply')).toBeVisible()
})

test('without a session the page says the session expired and how to get a new link', async ({ page }) => {
  await page.goto(at('/'))
  await expect(page.getByRole('heading', { name: '会话已过期' })).toBeVisible()
  await expect(page.getByText('wl console --link')).toBeVisible()
})

test('a login link opened a second time is rejected with 401', async ({ page }) => {
  const link = fx.loginUrl()
  await page.goto(link)
  // 第二次用 request 直接取，不经页面导航（同一 URL 的导航 Playwright 不返回响应）
  const again = await page.request.get(link)
  expect(again.status()).toBe(401)
  expect(await again.text()).toContain('链接已失效')
})
