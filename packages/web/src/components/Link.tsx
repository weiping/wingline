import type { ComponentChildren } from 'preact'
import { navigate } from '../router.js'

/** 站内链接：普通点击走 pushState，修饰键与中键保持浏览器默认行为。 */
export function Link(props: { href: string; class?: string; children?: ComponentChildren }) {
  return (
    <a
      href={props.href}
      class={props.class}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        navigate(props.href)
      }}
    >
      {props.children}
    </a>
  )
}
