export type Key = {
  name: 'up' | 'down' | 'enter' | 'tab' | 'escape' | 'backspace' | 'left' | 'right' | 'ctrl-c' | 'char'
  ch?: string
}

const ARROWS: Record<string, Key['name']> = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
}
/** CSI（ESC [ 参数 中间字节 终止字节）与 SS3（ESC O x）。 */
const SEQUENCE = /^\x1b(?:\[[0-9;?]*[ -/]*[@-~]|O[@-~])/

/** 把一次 stdin 数据拆成按键。认不出的转义序列整条丢掉，不会当成输入打出来。 */
export function parseKeys(chunk: string): Key[] {
  const keys: Key[] = []
  let i = 0
  while (i < chunk.length) {
    const c = chunk[i]!
    if (c === '\x1b') {
      if (i === chunk.length - 1) {
        keys.push({ name: 'escape' })
        break
      }
      const seq = SEQUENCE.exec(chunk.slice(i))
      const arrow = seq ? ARROWS[seq[0]] : undefined
      if (arrow) keys.push({ name: arrow })
      i += seq ? seq[0].length : 2
      continue
    }
    i += 1
    if (c === '\r' || c === '\n') keys.push({ name: 'enter' })
    else if (c === '\t') keys.push({ name: 'tab' })
    else if (c === '\x7f' || c === '\b') keys.push({ name: 'backspace' })
    else if (c === '\x03') keys.push({ name: 'ctrl-c' })
    else if (c >= ' ') {
      const ch = String.fromCodePoint(chunk.codePointAt(i - 1)!)
      i += ch.length - 1
      keys.push({ name: 'char', ch })
    }
  }
  return keys
}
