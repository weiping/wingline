import { useEffect, useState } from 'preact/hooks'
import { api } from './api.js'

export interface ApiState<T> {
  data: T | null
  error: Error | null
  reload: () => void
}

/** GET 一个接口；path 变化时重取，reload() 手动重取；path 为 null 时不取（用于互斥的两种视图）。 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (path === null) return
    let alive = true
    api.get<T>(path).then(
      (d) => {
        if (!alive) return
        setData(d)
        setError(null)
      },
      (e: Error) => {
        if (alive) setError(e)
      },
    )
    return () => {
      alive = false
    }
  }, [path, tick])
  return { data, error, reload: () => setTick((t) => t + 1) }
}
