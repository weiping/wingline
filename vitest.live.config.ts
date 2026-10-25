import { defineConfig } from 'vitest/config'
import path from 'node:path'

// 真机集成测试：需要运行中的 Orca，不进默认的 pnpm test
export default defineConfig({
  resolve: { alias: { '@weiping/wingline-core': path.resolve(__dirname, 'packages/core/src/index.ts') } },
  test: { include: ['test/live/**/*.test.ts'], testTimeout: 300_000 },
})
