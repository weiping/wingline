// 终端显示宽度：东亚宽字符与常见 emoji 占 2 列，组合字符与控制字符占 0 列。只处理纯文本（外部文本先经 plainText）。
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9:;<=>?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g

/** 占两列的码点区间（闭区间）。 */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff],
]

function charWidth(cp: number): 0 | 1 | 2 {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (cp >= 0x300 && cp <= 0x36f) return 0
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

/** 字符串占的终端列数；ANSI 序列不占列。 */
export function cellWidth(s: string): number {
  let w = 0
  for (const ch of s.replace(ANSI, '')) w += charWidth(ch.codePointAt(0)!)
  return w
}

/** 截到刚好 cols 列：放得下就补空格，放不下就截断并以 … 结尾（… 占最后一列，宽字符不会被切开）。 */
export function fit(s: string, cols: number): string {
  if (cols <= 0) return ''
  const total = cellWidth(s)
  if (total <= cols) return s + ' '.repeat(cols - total)
  let kept = ''
  let w = 0
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!)
    if (w + cw > cols - 1) break
    kept += ch
    w += cw
  }
  return `${kept}…${' '.repeat(cols - w - 1)}`
}
