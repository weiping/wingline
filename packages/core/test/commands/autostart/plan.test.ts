import { expect, test } from 'vitest'
import { planAutostart } from '../../../src/commands/autostart/plan.js'

const BASE = {
  homeDir: '/home/me', uid: 501, user: 'me', node: '/opt/node/bin/node', script: '/opt/wl/main.js',
  home: '/home/me/.wingline', orca: '/opt/orca/bin/orca', waitOrca: '15m',
}
const plan = (over: Record<string, unknown> = {}) => planAutostart({ platform: 'linux', ...BASE, ...over } as Parameters<typeof planAutostart>[0])
const unit = (p: ReturnType<typeof plan>) => p.file.content
const execStart = (p: ReturnType<typeof plan>) => unit(p).split('\n').find((l) => l.startsWith('ExecStart='))!.slice('ExecStart='.length)
const plistStrings = (content: string) => [...content.matchAll(/<string>(.*?)<\/string>/g)].map((m) => m[1]!)

test('macOS: a LaunchAgent with RunAtLoad, the absolute command, a PATH and the log paths; bootout (may fail) then bootstrap', () => {
  const p = plan({ platform: 'darwin', homeDir: '/Users/me', home: '/Users/me/.wingline' })
  expect(p.platform).toBe('darwin')
  expect(p.file.path).toBe('/Users/me/Library/LaunchAgents/wingline.restore.plist')
  expect(p.logPath).toBe('/Users/me/.wingline/logs/autostart.log')
  expect(p.file.content).toContain('<key>RunAtLoad</key>\n  <true/>')
  expect(plistStrings(p.file.content)).toEqual([
    'wingline.restore',
    '/opt/node/bin/node', '/opt/wl/main.js', 'restore', '--all', '--wait-orca', '15m', '--actor', 'autostart',
    '--home', '/Users/me/.wingline', '--orca', '/opt/orca/bin/orca',
    '/opt/node/bin:/opt/orca/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    '/Users/me/.wingline/logs/autostart.log', '/Users/me/.wingline/logs/autostart.log',
  ])
  expect(p.register).toEqual([
    { file: '/bin/launchctl', args: ['bootout', 'gui/501/wingline.restore'], allowFail: true },
    { file: '/bin/launchctl', args: ['bootstrap', 'gui/501', p.file.path], retries: 2 },
  ])
  expect(p.unregister).toEqual([{ file: '/bin/launchctl', args: ['bootout', 'gui/501/wingline.restore'], allowFail: true }])
})

test('macOS: plist text is XML-escaped (& < > " \')', () => {
  const p = plan({ platform: 'darwin', homeDir: '/Users/me', script: '/Users/a&b/<wl>/"x"\'s/main.js' })
  expect(p.file.content).toContain('/Users/a&amp;b/&lt;wl&gt;/&quot;x&quot;&apos;s/main.js')
  expect(p.file.content).not.toContain('a&b')
})

test('Linux: a oneshot user unit wanted by default.target with PATH and the log files; probe, daemon-reload, then enable', () => {
  const p = plan()
  expect(p.file.path).toBe('/home/me/.config/systemd/user/wingline-restore.service')
  expect(p.logPath).toBe('/home/me/.wingline/logs/autostart.log')
  expect(unit(p)).toContain('[Service]\nType=oneshot\n')
  expect(unit(p)).toContain('\n[Install]\nWantedBy=default.target')
  expect(unit(p)).toContain('Environment="PATH=/opt/node/bin:/opt/orca/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"')
  expect(unit(p)).toContain('StandardOutput=append:/home/me/.wingline/logs/autostart.log')
  expect(unit(p)).toContain('StandardError=append:/home/me/.wingline/logs/autostart.log')
  expect(execStart(p)).toBe('/opt/node/bin/node /opt/wl/main.js restore --all --wait-orca 15m --actor autostart --home /home/me/.wingline --orca /opt/orca/bin/orca')
  expect(p.probe).toEqual({ file: '/usr/bin/systemctl', args: ['--user', 'show-environment'] })
  expect(p.register).toEqual([
    { file: '/usr/bin/systemctl', args: ['--user', 'daemon-reload'] },
    { file: '/usr/bin/systemctl', args: ['--user', 'enable', 'wingline-restore.service'] },
  ])
  expect(p.unregister).toEqual([
    { file: '/usr/bin/systemctl', args: ['--user', 'disable', 'wingline-restore.service'], allowFail: true },
    { file: '/usr/bin/systemctl', args: ['--user', 'daemon-reload'], allowFail: true },
  ])
  expect(p.user).toBe('me')
})

test('Linux: ExecStart quotes arguments with spaces and escapes \\ " % $', () => {
  const spaced = plan({ node: '/opt/my node/bin/node', script: '/home/a b/wl/main.js', home: '/home/a b/.wingline' })
  expect(execStart(spaced)).toBe('"/opt/my node/bin/node" "/home/a b/wl/main.js" restore --all --wait-orca 15m --actor autostart --home "/home/a b/.wingline" --orca /opt/orca/bin/orca')
  const odd = plan({ script: '/home/me/50%/we"ird$/ba\\ck/main.js' })
  expect(execStart(odd)).toContain('"/home/me/50%%/we\\"ird$$/ba\\\\ck/main.js"')
})

test('the PATH lists each directory once, node first', () => {
  const p = plan({ node: '/usr/bin/node', orca: '/usr/bin/orca' })
  expect(unit(p)).toContain('Environment="PATH=/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin"')
})

test('win32 and other platforms are autostart_unsupported (Windows waits for probe 5)', () => {
  for (const platform of ['win32', 'freebsd']) {
    expect(() => plan({ platform })).toThrow(expect.objectContaining({ code: 'autostart_unsupported', kind: 'input' }))
  }
})

test('a relative node / home / orca path is autostart_path_invalid; macOS needs a uid', () => {
  for (const over of [{ node: 'node' }, { home: '.wingline' }, { orca: 'orca' }]) {
    expect(() => plan(over)).toThrow(expect.objectContaining({ code: 'autostart_path_invalid' }))
  }
  expect(() => plan({ platform: 'darwin', uid: undefined })).toThrow(expect.objectContaining({ code: 'autostart_unsupported' }))
})

test('the wait budget is written through; an invalid one is rejected before anything is planned', () => {
  expect(execStart(plan({ waitOrca: '2h' }))).toContain('--wait-orca 2h')
  expect(() => plan({ waitOrca: 'soon' })).toThrow(expect.objectContaining({ code: 'duration_invalid' }))
})

test('macOS: bootstrap is retried twice (bootout may not have finished unloading the old agent)', () => {
  const p = plan({ platform: 'darwin', homeDir: '/Users/me', home: '/Users/me/.wingline' })
  expect(p.register[1]).toMatchObject({ args: ['bootstrap', 'gui/501', p.file.path], retries: 2 })
})

