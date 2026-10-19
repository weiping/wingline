import type { OrcaClient } from '../orca/types.js'

export type CachedOrca = OrcaClient & { invalidate(): void }

const READ_METHODS = new Set(['taskList', 'terminalList', 'terminalShow', 'workerList', 'runShow'])

const WRITE_METHODS = new Set([
  'terminalCreate', 'terminalSend', 'terminalClose',
  'runCreate', 'runUse', 'taskCreate', 'dispatch', 'workerDone',
  'gateCreate', 'gateResolve', 'reply', 'worktreeSet',
])

interface CacheEntry {
  promise: Promise<any>
  expiresAt: number
}

export function cachedOrca(inner: OrcaClient, o: { ttlMs?: number; now?: () => number } = {}): CachedOrca {
  const ttlMs = o.ttlMs ?? 5000
  const now = o.now ?? (() => Date.now())
  const cache = new Map<string, CacheEntry>()

  const invalidate = () => {
    cache.clear()
  }

  return new Proxy(inner as CachedOrca, {
    get(target, prop: string | symbol) {
      if (prop === 'invalidate') return invalidate
      const orig = (target as any)[prop]
      if (typeof orig !== 'function') return orig

      if (READ_METHODS.has(prop as string)) {
        return function (this: any, ...args: any[]) {
          const key = `${String(prop)}:${JSON.stringify(args)}`
          const cur = cache.get(key)
          const currentTime = now()
          if (cur && cur.expiresAt > currentTime) {
            return cur.promise
          }
          const p = Promise.resolve(orig.apply(target, args)).catch((err) => {
            cache.delete(key)
            throw err
          })
          cache.set(key, { promise: p, expiresAt: currentTime + ttlMs })
          return p
        }
      }

      if (WRITE_METHODS.has(prop as string)) {
        return async function (this: any, ...args: any[]) {
          try {
            return await orig.apply(target, args)
          } finally {
            invalidate()
          }
        }
      }

      return orig.bind(target)
    },
  })
}
