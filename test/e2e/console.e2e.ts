import { expect, test, type Page } from '@playwright/test'
import { startFixtureConsole, type FixtureConsole } from './server-fixture.js'

let fx: FixtureConsole

const at = (p: string) => `http://127.0.0.1:${fx.port}${p}`

// —— 排查偶发失败用的诊断：失败时打印页面 URL、页面文字、各请求的状态码与控制台错误（日志里可见，不需要上传产物）——
const seen = new WeakMap<Page, string[]>()
const mask = (s: string) => s.replace(/token=[^&\s"]+/g, 'token=…')

test.beforeEach(({ page }) => {
  const log: string[] = []
  seen.set(page, log)
  const stamp = () => new Date().toISOString().slice(11, 23)
  page.on('response', (r) => log.push(`${stamp()} ${r.status()} ${r.request().method()} ${mask(r.url().replace(`http://127.0.0.1:${fx.port}`, ''))}`))
  page.on('requestfailed', (r) => log.push(`${stamp()} FAILED ${mask(r.url())} ${r.failure()?.errorText ?? ''}`))
  page.on('console', (m) => log.push(`${stamp()} console.${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => log.push(`${stamp()} pageerror: ${e.message}`))
})

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  const text = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '<no body>')
  console.log([`--- diagnostics for "${info.title}"`, `url: ${mask(page.url())}`, `body: ${text.replace(/\s+/g, ' ').slice(0, 400)}`, ...(seen.get(page) ?? [])].join('\n'))
})

test.beforeAll(async () => {
  fx = await startFixtureConsole()
})

test.afterAll(async () => {
  await fx.close()
})

test('login link → inbox → answer the question → the timeline shows the console audit event', async ({ page }) => {
  await page.goto(fx.loginUrl())
  // /auth 有意不用 302（cookie 是 SameSite=Strict），而是回一个带 <meta http-equiv="refresh" content="0;url=/"> 的 200 页面，
  // 由浏览器在 load 之后再跳到 /。goto 在 load 时就返回了，这时跳转可能还没发生；如果立刻去访问别的页面，
  // 跳转有时会在新导航发出之后才发起，把收件箱换回首页（CI 上抓到过：失败时 URL 是 /，请求顺序 /auth → /t/duo/inbox → /）。
  // 所以先等登录跳转落到 / 并确认会话生效，再去收件箱。
  await page.waitForURL(at('/'))
  await expect(page.getByRole('heading', { name: '团队' })).toBeVisible()
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
