import { useEffect, useState } from 'preact/hooks'

export interface ToastMsg {
  id: number
  text: string
  tone: 'ok' | 'err'
}

let seq = 0
let items: ToastMsg[] = []
const subs = new Set<(m: ToastMsg[]) => void>()

function publish(next: ToastMsg[]): void {
  items = next
  for (const f of subs) f(items)
}

/** 底部短暂提示（4 秒）。 */
export function toast(text: string, tone: 'ok' | 'err' = 'ok'): void {
  const m: ToastMsg = { id: ++seq, text, tone }
  publish([...items, m])
  setTimeout(() => publish(items.filter((x) => x.id !== m.id)), 4000)
}

export function Toaster() {
  const [list, setList] = useState<ToastMsg[]>(items)
  useEffect(() => {
    subs.add(setList)
    return () => {
      subs.delete(setList)
    }
  }, [])
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((m) => (
        <div key={m.id} class={`toast toast-${m.tone}`}>
          {m.text}
        </div>
      ))}
    </div>
  )
}
