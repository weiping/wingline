import type { TeamRow } from '@weiping/wingline-core'
import { parseKeys } from '../keys.js'
import { oneLine } from '../text.js'
import { Screen } from '../screen.js'
import type { TuiIo } from '../types.js'
import { fit } from '../width.js'

/** 没有指定团队名且登记了多个团队时的选择列表：↑↓ 选择、Enter 进入、q 退出（返回 null）。 */
export function pickTeam(teams: TeamRow[], io: TuiIo): Promise<string | null> {
  return new Promise((resolve) => {
    const screen = new Screen(io.stdout)
    let sel = 0
    const draw = () => {
      const cols = Math.max(20, screen.size().cols)
      screen.render([
        fit('选择团队（↑↓ 选择，Enter 进入，q 退出）', cols),
        ...teams.map((t, i) => fit(`${i === sel ? '> ' : '  '}${oneLine(t.name)}  ${t.status === 'up' ? '运行中' : '已停止'}`, cols)),
      ])
    }
    const done = (value: string | null) => {
      io.stdin.off('data', onData)
      io.stdin.setRawMode?.(false)
      io.stdin.pause?.()
      screen.restore()
      resolve(value)
    }
    const onData = (chunk: Buffer | string) => {
      for (const k of parseKeys(String(chunk))) {
        if (k.name === 'up' || (k.name === 'char' && k.ch === 'k')) sel = Math.max(0, sel - 1)
        else if (k.name === 'down' || (k.name === 'char' && k.ch === 'j')) sel = Math.min(teams.length - 1, sel + 1)
        else if (k.name === 'enter') return done(teams[sel]!.name)
        else if (k.name === 'escape' || k.name === 'ctrl-c' || (k.name === 'char' && k.ch === 'q')) return done(null)
      }
      draw()
    }
    io.stdin.setRawMode?.(true)
    io.stdin.setEncoding?.('utf8')
    io.stdin.resume?.()
    screen.enter()
    draw()
    io.stdin.on('data', onData)
  })
}
