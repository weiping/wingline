import path from 'node:path'
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

// 构建产物随 wingline 包发布到 packages/cli/dist/web；服务端按这个位置找前端（packages/cli/src/console.ts）。
export default defineConfig({
  plugins: [preact()],
  root: here,
  build: {
    outDir: path.resolve(here, '../cli/dist/web'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
