import type { ComponentChildren } from 'preact'
import { errorText } from '../api.js'

export function Loading({ what = '加载中…' }: { what?: string }) {
  return <p class="muted">{what}</p>
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <p class="error" role="alert">
      {errorText(error)}
    </p>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'neutral'; children: ComponentChildren }) {
  return <span class={`pill pill-${tone}`}>{children}</span>
}

export function Section({ title, count, children }: { title: string; count?: number; children: ComponentChildren }) {
  return (
    <section class="section">
      <h2>
        {title}
        {count !== undefined && <span class="count">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

/** 时间戳显示为本地时分秒；解析失败原样返回。 */
export function clock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 把地址 `builder@duo` 的岗位名拆出来（岗位页的路径用岗位名）。 */
export const postOf = (address: string): string => address.split('@')[0] ?? address

export const SOURCE_LABEL = { task: '任务', patrol: '巡查', command: '命令' } as const
