import { useEffect, useState } from 'preact/hooks'

export type Route =
  | { name: 'home' }
  | { name: 'overview'; team: string }
  | { name: 'inbox'; team: string }
  | { name: 'board'; team: string }
  | { name: 'task'; team: string; id: string }
  | { name: 'post'; team: string; post: string }
  | { name: 'log'; team: string }
  | { name: 'notfound' }

/** 路由表见 spec 第 7 节：/t/:team 下六个页面，/ 为团队列表。 */
export function matchRoute(path: string): Route {
  if (path === '/' || path === '') return { name: 'home' }
  const dec = (s: string): string | null => {
    try {
      return decodeURIComponent(s)
    } catch {
      return null
    }
  }
  const rules: Array<[RegExp, (m: RegExpMatchArray) => Route | null]> = [
    [/^\/t\/([^/]+)\/?$/, (m) => (dec(m[1]!) === null ? null : { name: 'overview', team: dec(m[1]!)! })],
    [/^\/t\/([^/]+)\/inbox$/, (m) => (dec(m[1]!) === null ? null : { name: 'inbox', team: dec(m[1]!)! })],
    [/^\/t\/([^/]+)\/tasks$/, (m) => (dec(m[1]!) === null ? null : { name: 'board', team: dec(m[1]!)! })],
    [/^\/t\/([^/]+)\/log$/, (m) => (dec(m[1]!) === null ? null : { name: 'log', team: dec(m[1]!)! })],
    [
      /^\/t\/([^/]+)\/tasks\/([^/]+)$/,
      (m) => (dec(m[1]!) === null || dec(m[2]!) === null ? null : { name: 'task', team: dec(m[1]!)!, id: dec(m[2]!)! }),
    ],
    [
      /^\/t\/([^/]+)\/posts\/([^/]+)$/,
      (m) => (dec(m[1]!) === null || dec(m[2]!) === null ? null : { name: 'post', team: dec(m[1]!)!, post: dec(m[2]!)! }),
    ],
  ]
  for (const [re, build] of rules) {
    const m = path.match(re)
    if (m) return build(m) ?? { name: 'notfound' }
  }
  return { name: 'notfound' }
}

export function navigate(href: string): void {
  if (location.pathname === href) return
  history.pushState(null, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [path, setPath] = useState(() => location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return matchRoute(path)
}

export const teamPath = (team: string, sub = '') => `/t/${encodeURIComponent(team)}${sub}`
export const postPath = (team: string, post: string) => teamPath(team, `/posts/${encodeURIComponent(post)}`)
export const taskPath = (team: string, id: string) => teamPath(team, `/tasks/${encodeURIComponent(id)}`)
