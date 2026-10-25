import type { AboutItem, AboutTeam } from '@weiping/wingline-core'
import { useApi } from '../hooks.js'
import { Link } from '../components/Link.js'
import { teamPath } from '../router.js'
import { ErrorBox, Loading, Pill, Section } from '../components/common.js'

const SOURCE: Record<AboutItem['source'], string> = {
  env: '环境变量',
  default: '默认值',
  registry: '注册表',
  file: '文件',
  orca: 'Orca',
}

const LABEL: Record<string, string> = {
  'wingline.version': '雁阵版本',
  'orca.path': 'Orca 可执行文件',
  'orca.version': 'Orca 版本',
  'orca.verified': '在已验证的版本范围内',
  'home.path': '数据目录',
  'registry.migration': '注册表迁移版本',
  'logs.bytes': 'logs/ 占用',
  'console.pid': '控制台进程号',
  'console.port': '控制台端口',
  'console.startedAt': '控制台启动时间',
}

const DISPATCHER = { running: '运行中', stale: '失联', stopped: '已停止', never: '未启动' } as const

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function valueText(i: AboutItem): string {
  if (i.value === null) return '—'
  if (typeof i.value === 'boolean') return i.value ? '是' : '否'
  return i.key === 'logs.bytes' && typeof i.value === 'number' ? size(i.value) : String(i.value)
}

function TeamRows({ teams }: { teams: AboutTeam[] }) {
  return (
    <table class="table">
      <tbody>
        {teams.map((t) => (
          <tr key={t.name}>
            <td>
              <Link href={teamPath(t.name)}>{t.name}</Link>
            </td>
            <td>
              <code>{t.specPath}</code>
            </td>
            <td>{t.status === 'up' ? '运行中' : '已停止'}</td>
            <td>调度员 {DISPATCHER[t.dispatcher]}</td>
            <td>{t.draft ? <Pill tone="warn">有草稿</Pill> : <span class="muted small">无草稿</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 关于与诊断：只读，每一项标注来源，取不到的项显示“—”和原因。 */
export function Settings() {
  const about = useApi<{ items: AboutItem[]; teams: AboutTeam[] }>('/api/about')
  if (about.error) return <ErrorBox error={about.error} />
  if (!about.data) return <Loading />
  return (
    <div class="page">
      <header class="page-head">
        <h1>关于与诊断</h1>
      </header>
      <Section title="配置与环境" count={about.data.items.length}>
        <table class="table">
          <tbody>
            {about.data.items.map((i) => (
              <tr key={i.key}>
                <td>{LABEL[i.key] ?? i.key}</td>
                <td>{valueText(i)}</td>
                <td>
                  <Pill>{SOURCE[i.source]}</Pill>
                  {i.note && <span class="muted small">（{i.note}）</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="团队" count={about.data.teams.length}>
        {about.data.teams.length === 0 ? <p class="muted small">暂无</p> : <TeamRows teams={about.data.teams} />}
      </Section>
    </div>
  )
}
