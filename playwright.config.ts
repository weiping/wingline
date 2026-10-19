import { defineConfig } from '@playwright/test'

// 端到端冒烟：需要先 pnpm build（前端产物在 packages/cli/dist/web）。
// 浏览器默认用 pnpm exec playwright install chromium 装的 Chromium；本机没有时可用 WL_E2E_CHROME 指向已装的 Chrome。
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    browserName: 'chromium',
    launchOptions: process.env.WL_E2E_CHROME ? { executablePath: process.env.WL_E2E_CHROME } : {},
  },
})
