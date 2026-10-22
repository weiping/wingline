#!/usr/bin/env node
// 警告过滤必须先于 node:sqlite 的加载，所以 cli.js 用动态导入。
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return
  process.stderr.write(`(${w.name}) ${w.message}\n`)
})
const { run } = await import('./cli.js')
process.exitCode = await run(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, env: process.env, stdin: process.stdin })
