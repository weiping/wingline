import { expect, test, vi } from 'vitest'
import { autostartInstall, autostartStatusOf, autostartUninstall, type AutostartSys, type FsLike } from '../../../src/commands/autostart/index.js'
import type { CommandDeps } from '../../../src/commands/deps.js'

/** 内存里的文件系统（路径是 posix 形式的虚拟路径，与宿主平台无关）。 */
function memFs(files: Record<string, string>) {
  const map = new Map(Object.entries(files))
  const fsx = {
    existsSync: (p: string) => map.has(p),
    readFileSync: (p: string) => { if (!map.has(p)) throw new Error(`ENOENT ${p}`); return map.get(p)! },
    writeFileSync: (p: string, c: string) => { map.set(p, String(c)) },
    renameSync: (a: string, b: string) => { map.set(b, map.get(a)!); map.delete(a) },
    rmSync: (p: string) => { map.delete(p) },
    mkdirSync: () => undefined,
    statSync: (p: string) => ({ size: map.get(p)?.length ?? 0 }),
  }
  return { map, fsx: fsx as unknown as FsLike }
}

const UNIT = '/home/me/.config/systemd/user/wingline-restore.service'
const INSTALLED = '[Service]\nExecStart=/opt/node/bin/node /opt/wl/main.js restore --all\n'
// orca 是裸名、node / 脚本是相对路径：这样的环境装不了，但已经装好的文件仍然要能查看和卸载
const deps = { home: '/home/me/.wingline', orcaPath: 'orca' } as CommandDeps
const sys = (mem: ReturnType<typeof memFs>): AutostartSys => ({
  platform: 'linux', homeDir: '/home/me', uid: 501, user: 'me', node: 'node', script: 'main.js', fs: mem.fsx,
  exec: vi.fn(async () => ({ code: 0, stdout: 'Linger=yes', stderr: '' })),
})

test('install needs absolute paths, but uninstall and status work from the existing file without them', async () => {
  const mem = memFs({ [UNIT]: INSTALLED })
  await expect(autostartInstall(deps, sys(mem))).rejects.toMatchObject({ code: 'autostart_path_invalid' })
  expect(mem.map.get(UNIT)).toBe(INSTALLED)

  const status = await autostartStatusOf(deps, sys(mem))
  expect(status).toMatchObject({ installed: true, location: UNIT, command: ['/opt/node/bin/node', '/opt/wl/main.js', 'restore', '--all'], linger: true })

  expect(await autostartUninstall(deps, sys(mem))).toEqual({ file: UNIT, removed: true })
  expect(mem.map.has(UNIT)).toBe(false)
})

test('on an unsupported platform there is nothing to inspect or remove: still autostart_unsupported', async () => {
  const mem = memFs({})
  await expect(autostartStatusOf(deps, { ...sys(mem), platform: 'win32' })).rejects.toMatchObject({ code: 'autostart_unsupported' })
})
