import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@wingline/core': path.resolve(__dirname, 'packages/core/src/index.ts') },
  },
  test: {
    // Windows CI 上首次打开 SQLite（WAL）和写临时文件偶尔超过默认 5 秒
    testTimeout: 20_000,
    include: ['packages/*/test/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/live/**', '**/node_modules/**'],
  },
})
