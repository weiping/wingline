/** Screen 只需要能写字符串、知道窗口大小。 */
export interface ScreenOut {
  write(s: string): unknown
  columns: number
  rows: number
}

const ENTER = '\x1b[?1049h\x1b[?25l'
const LEAVE = '\x1b[?25h\x1b[?1049l'
const at = (row: number) => `\x1b[${row};1H`

/** 备用屏幕 + 按行差分重绘。restore 幂等，可以放心在 finally / exit / 信号处理里重复调用。 */
export class Screen {
  private prev: string[] = []
  private entered = false
  private restored = false
  private clearNext = false

  constructor(private readonly out: ScreenOut) {}

  enter(): void {
    this.out.write(ENTER)
    this.entered = true
    this.restored = false
  }

  /** 逐行比较上一帧，只重写变了的行；上一帧多出来的行清空。 */
  render(lines: string[]): void {
    if (this.restored) return
    let w = ''
    if (this.clearNext) {
      w = '\x1b[2J'
      this.prev = []
      this.clearNext = false
    }
    for (let i = 0; i < Math.max(lines.length, this.prev.length); i++) {
      const next = lines[i]
      if (next === this.prev[i]) continue
      w += `${at(i + 1)}${next ?? ''}\x1b[K`
    }
    this.prev = [...lines]
    if (w) this.out.write(w)
  }

  /** 尺寸变化时调用：下一帧先清屏再整屏重绘。 */
  invalidate(): void {
    this.clearNext = true
  }

  restore(): void {
    if (!this.entered || this.restored) return
    this.restored = true
    this.out.write(LEAVE)
  }

  size(): { cols: number; rows: number } {
    return { cols: this.out.columns, rows: this.out.rows }
  }
}
