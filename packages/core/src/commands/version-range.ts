type V = [number, number, number]

function parse(v: string): V {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  if (!m) return [NaN, NaN, NaN]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function cmp(a: V, b: V): number {
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1
  return 0
}

/** 支持空格分隔的比较器：>=1.4.214 <1.5.0；无法解析的版本一律视为不在范围内。 */
export function inRange(version: string, range: string): boolean {
  const v = parse(version)
  if (v.some(Number.isNaN)) return false
  return range.split(/\s+/).filter(Boolean).every((c) => {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(c)!
    const d = cmp(v, parse(m[2]!))
    switch (m[1] ?? '=') {
      case '>=': return d >= 0
      case '>': return d > 0
      case '<=': return d <= 0
      case '<': return d < 0
      default: return d === 0
    }
  })
}
