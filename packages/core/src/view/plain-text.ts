/**
 * 剥除 ANSI CSI/OSC 控制序列，以及除换行与制表符以外的不可见控制字符。
 */
export function plainText(s: string): string {
  // OSC 序列: \x1b] ... (\x07 | \x1b\)
  let res = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  // CSI 序列: \x1b[ ... [0-9:;<=>?]* [ -/]* [@-~]
  res = res.replace(/\x1b\[[0-9:;<=>?]*[ -/]*[@-~]/g, '')
  // 单独的 ESC 组合 (例如 \x1b(B 等)
  res = res.replace(/\x1b[@-Z\\-_]/g, '')
  // \r\n 归一为 \n，保留 \t, \n，去除其余控制字符 ([\x00-\x08\x0b-\x1f\x7f])
  res = res.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  res = res.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
  return res
}
