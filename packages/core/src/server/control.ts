import fs from 'node:fs'
import path from 'node:path'

export interface ConsoleFile {
  pid: number
  port: number
  startedAt: string
  controlKey: string
}

export function readConsoleFile(home: string): ConsoleFile | null {
  const file = path.join(home, 'console.json')
  try {
    const text = fs.readFileSync(file, 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function writeConsoleFile(home: string, f: ConsoleFile): void {
  fs.mkdirSync(home, { recursive: true })
  const file = path.join(home, 'console.json')
  const tmp = path.join(home, `console.json.${process.pid}.${Date.now()}`)
  fs.writeFileSync(tmp, JSON.stringify(f, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function removeConsoleFileIfMine(home: string, pid: number): void {
  const f = readConsoleFile(home)
  if (f && f.pid === pid) {
    try {
      fs.unlinkSync(path.join(home, 'console.json'))
    } catch {}
  }
}

export async function requestLink(f: ConsoleFile, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${f.port}/_control/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Control-Key': f.controlKey,
      },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as any
    return data.url ?? null
  } catch {
    return null
  }
}
