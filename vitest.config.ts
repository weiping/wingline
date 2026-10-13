import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@wingline/core': path.resolve(__dirname, 'packages/core/src/index.ts') },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: process.env.WINGLINE_LIVE ? [] : ['test/live/**', '**/node_modules/**'],
  },
})
