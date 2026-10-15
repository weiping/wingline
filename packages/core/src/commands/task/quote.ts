/**
 * 重跑命令里的文本参数引号：POSIX 用单引号；win32 用 cmd 与 PowerShell 都能直接粘贴的双引号形式
 * （内部的双引号写成两个）。
 */
export function shellQuote(text: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return `"${text.replace(/"/g, '""')}"`
  return `'${text.replace(/'/g, "'\\''")}'`
}
