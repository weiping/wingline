import { useState } from 'preact/hooks'

/** 没有对应写接口的操作：显示一条可复制的命令，由人在终端里执行。 */
export function CommandHint({ command, note }: { command: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div class="cmd">
      {note && <span class="muted">{note}</span>}
      <code>{command}</code>
      <button
        type="button"
        class="btn ghost small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}
