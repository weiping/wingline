import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Windows CI 上每个测试都要建临时目录、开 SQLite（WAL），单个测试约 1 秒；默认并发下主进程偶尔 60 秒内
// 回应不了工作进程的进度上报，vitest 报 `[vitest-worker]: Timeout calling "onTaskUpdate"`（超时写死在 vitest 里，
// 不可配置），全部测试通过却以退出码 1 结束（CI #33、#40）。只在 Windows CI 上降低并发。
const windowsCi = process.platform === 'win32' && !!process.env.CI

export default defineConfig({
  resolve: {
    alias: { '@wingline/core': path.resolve(__dirname, 'packages/core/src/index.ts') },
  },
  // 控制台前端（packages/web）用 Preact 的自动 JSX 运行时
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    // Windows CI 上首次打开 SQLite（WAL）和写临时文件偶尔超过默认 5 秒
    testTimeout: 20_000,
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx', 'test/**/*.test.ts'],
    exclude: ['test/live/**', '**/node_modules/**'],
    ...(windowsCi ? { maxWorkers: 2, minWorkers: 1 } : {}),
  },
})
