// 终端显示宽度：东亚宽字符与常见 emoji 占 2 列，组合字符与控制字符占 0 列。只处理纯文本（外部文本先经 plainText）。
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9:;<=>?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g

/** 占两列的码点区间（闭区间）。 */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff],
  // BMP 里默认就是 emoji 样式（占两列）的符号；⚠ ❄ ✓ ✔ ★ © 这类文本样式的符号占一列，不在这里
  [0x231a, 0x231b], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653],
  [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce],
  [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705],
  [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
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
