import { Writable } from 'node:stream'
import { expect, test } from 'vitest'
import { Screen } from '../../src/tui/screen.js'

class MemOut extends Writable {
  chunks: string[] = []
  columns = 80
  rows = 24
  _write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(chunk.toString())
    cb()
  }
  /** 取走从上一次调用以来写出的全部内容。 */
  take(): string {
    const s = this.chunks.join('')
    this.chunks = []
    return s
  }
}

const ENTER = '\x1b[?1049h\x1b[?25l'
const LEAVE = '\x1b[?25h\x1b[?1049l'
const at = (row: number) => `\x1b[${row};1H`

test('enter switches to the alternate screen and hides the cursor', () => {
  const out = new MemOut()
  new Screen(out).enter()
  expect(out.take()).toBe(ENTER)
})

test('render writes every line on the first frame', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.render(['aa', 'bb', 'cc'])
  const w = out.take()
  for (const [i, text] of ['aa', 'bb', 'cc'].entries()) expect(w).toContain(`${at(i + 1)}${text}`)
})

test('render writes only changed lines on the second frame', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.render(['aa', 'bb', 'cc'])
  out.take()
  s.render(['aa', 'XX', 'cc'])
  const w = out.take()
  expect(w).toContain(`${at(2)}XX`)
  expect(w).not.toContain(at(1))
  expect(w).not.toContain(at(3))
  s.render(['aa', 'XX', 'cc'])
  expect(out.take()).toBe('')
})

test('lines that disappear are blanked', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.render(['aa', 'bb', 'cc'])
  out.take()
  s.render(['aa'])
  const w = out.take()
  expect(w).toContain(`${at(2)}\x1b[K`)
  expect(w).toContain(`${at(3)}\x1b[K`)
})

test('each written line clears the rest of its row', () => {
  const out = new MemOut()
  new Screen(out).render(['aa'])
  expect(out.take()).toContain(`${at(1)}aa\x1b[K`)
})

test('invalidate makes the next render redraw every line', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.render(['aa', 'bb'])
  out.take()
  s.invalidate()
  s.render(['aa', 'bb'])
  const w = out.take()
  expect(w).toContain('\x1b[2J')
  expect(w).toContain(`${at(1)}aa`)
  expect(w).toContain(`${at(2)}bb`)
})

test('restore writes show-cursor and leave-alt-buffer once even if called twice', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.enter()
  out.take()
  s.restore()
  s.restore()
  const w = out.take()
  expect(w).toBe(LEAVE)
  expect(w.split('\x1b[?1049l')).toHaveLength(2)
})

test('restore before enter writes nothing', () => {
  const out = new MemOut()
  new Screen(out).restore()
  expect(out.take()).toBe('')
})

test('render after restore does nothing', () => {
  const out = new MemOut()
  const s = new Screen(out)
  s.enter()
  s.restore()
  out.take()
  s.render(['late'])
  expect(out.take()).toBe('')
})

test('size reports the stream columns and rows', () => {
  const out = new MemOut()
  out.columns = 100
  out.rows = 30
  expect(new Screen(out).size()).toEqual({ cols: 100, rows: 30 })
})
