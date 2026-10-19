import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { readConsoleFile, removeConsoleFileIfMine, requestLink, writeConsoleFile, type ConsoleFile } from '../../src/server/control.js'

test('writeConsoleFile writes 0600 permissions and readConsoleFile reads it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-ctrl-'))
  try {
    const file: ConsoleFile = {
      pid: 12345,
      port: 4100,
      startedAt: new Date().toISOString(),
      controlKey: 'secret-key-abc',
    }
    writeConsoleFile(dir, file)

    if (process.platform !== 'win32') {
      const stat = fs.statSync(path.join(dir, 'console.json'))
      expect(stat.mode & 0o777).toBe(0o600)
    }

    const read = readConsoleFile(dir)
    expect(read).toEqual(file)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test('removeConsoleFileIfMine only removes file with matching pid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-ctrl-'))
  try {
    const file: ConsoleFile = {
      pid: 12345,
      port: 4100,
      startedAt: new Date().toISOString(),
      controlKey: 'secret-key-abc',
    }
    writeConsoleFile(dir, file)

    // Different pid does nothing
    removeConsoleFileIfMine(dir, 99999)
    expect(readConsoleFile(dir)).not.toBeNull()

    // Matching pid deletes
    removeConsoleFileIfMine(dir, 12345)
    expect(readConsoleFile(dir)).toBeNull()
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test('requestLink returns null when port is unreachable or error occurs', async () => {
  const file: ConsoleFile = {
    pid: 12345,
    port: 65432, // Unused port
    startedAt: new Date().toISOString(),
    controlKey: 'secret',
  }
  const link = await requestLink(file)
  expect(link).toBeNull()
})
