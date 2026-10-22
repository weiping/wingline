import type { Key } from './keys.js'
import { cellWidth, fit } from './width.js'

const PRINTABLE = /^[^\x00-\x1f\x7f-\x9f]+$/

/** 底部单行输入框：可打印字符、退格、左右移动；Enter 提交，Esc 取消。光标画成 `|`，不用任何终端样式。 */
export class LineInput {
  private chars: string[] = []
  private pos = 0

  constructor(private readonly prompt: string) {}

  get value(): string {
    return this.chars.join('')
  }

  /** reduce 是纯函数：按键作用在副本上。 */
  clone(): LineInput {
    const c = new LineInput(this.prompt)
    c.chars = [...this.chars]
    c.pos = this.pos
    return c
  }

  feed(k: Key): 'continue' | 'submit' | 'cancel' {
    if (k.name === 'enter') return 'submit'
    if (k.name === 'escape') return 'cancel'
    if (k.name === 'left') this.pos = Math.max(0, this.pos - 1)
    else if (k.name === 'right') this.pos = Math.min(this.chars.length, this.pos + 1)
    else if (k.name === 'backspace' && this.pos > 0) this.chars.splice(--this.pos, 1)
    else if (k.name === 'char' && k.ch && PRINTABLE.test(k.ch)) this.chars.splice(this.pos++, 0, k.ch)
    return 'continue'
  }

  /** 一行 cols 列：放不下时让光标附近的文字留在可见区里，被截的左侧以 … 开头。 */
  view(cols: number): string {
    const before = this.prompt + this.chars.slice(0, this.pos).join('')
    const after = this.chars.slice(this.pos).join('')
    if (cellWidth(before) + 1 + cellWidth(after) <= cols) return fit(`${before}|${after}`, cols)
    const room = Math.max(0, cols - 1)
    const afterShown = takeHead(after, Math.floor(room / 3))
    const beforeShown = takeTail(before, room - cellWidth(afterShown) - 1)
    return fit(`…${beforeShown}|${afterShown}`, cols)
  }
}

/** 从头取尽量多的字符，宽度不超过 budget。 */
function takeHead(s: string, budget: number): string {
  let out = ''
  for (const ch of s) {
    if (cellWidth(out + ch) > budget) break
    out += ch
  }
  return out
}

/** 从尾取尽量多的字符，宽度不超过 budget。 */
function takeTail(s: string, budget: number): string {
  let out = ''
  for (const ch of [...s].reverse()) {
    if (cellWidth(ch + out) > budget) break
    out = ch + out
  }
  return out
}
