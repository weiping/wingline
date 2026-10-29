import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AutostartSys } from './index.js'

/** 控制台服务在 core 内，需要同样的宿主信息：系统命令以参数数组启动（不经 shell），入口脚本取符号链接解析后的真实路径。 */
export function realAutostartSys(): AutostartSys {
  const exec: AutostartSys['exec'] = (file, args) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
  const entry = process.argv[1] ?? ''
  let script = path.resolve(entry)
  try { script = fs.realpathSync(entry) } catch { /* 保持 resolve 的结果 */ }
  return { platform: process.platform, homeDir: os.homedir(), uid: process.getuid?.(), user: os.userInfo().username, node: process.execPath, script, exec, fs }
}
