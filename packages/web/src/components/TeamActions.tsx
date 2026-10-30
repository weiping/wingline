import { useState } from 'preact/hooks'
import type { RestoreResult, UpResult } from '@weiping/wingline-core'
import { ApiError, api, errorText } from '../api.js'
import { CommandHint } from './CommandHint.js'
import { Pill, postOf } from './common.js'

export type DispatcherState = 'running' | 'stale' | 'stopped' | 'never'

export interface TeamActionsView {
  status: 'up' | 'stopped'
  runId: string | null
  specPath: string
  hasDraft: boolean
  neverStarted?: boolean
}

/** 与 ActionDialog 相同的语义：失败显示 errorText；uncertain（retryRequest）绝不自动重试，等用户点「按原样重试」。 */
export function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ send: () => Promise<void> } | null>(null)
  const run = async (send: (rr?: string) => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await send()
      setRetry(null)
      onDone()
    } catch (err) {
      setError(errorText(err))
      if (err instanceof ApiError && err.retryRequest) {
        const rr = err.retryRequest
        setRetry({ send: () => send(rr) })
      }
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, retry, run }
}

/** 在途禁用显示「执行中…」；uncertain 时换成「按原样重试」的按钮渲染。 */
export function ActionButton(p: { label: string; kind?: string; busy: boolean; error: string | null; retry: { send: () => Promise<void> } | null; onSend: () => void }) {
  return (
    <>
      {p.error && <span class="error small">{p.error}</span>}
      {p.retry ? (
        <button type="button" class="btn" disabled={p.busy} onClick={() => void p.retry!.send()}>
          按原样重试
        </button>
      ) : (
        <button type="button" class={p.kind ?? 'btn'} disabled={p.busy} onClick={p.onSend}>
          {p.busy ? '执行中…' : p.label}
        </button>
      )}
    </>
  )
}

/** 链路里的一步：rr 携带服务端给的 retryRequest 原样重发本请求。 */
export type Step = (rr?: string) => Promise<unknown>

/** 依次执行；某步失败且错误带 retryRequest 时，把「失败请求原样重发 + 剩余步骤」记为按原样重试（不重跑整条链）。 */
export async function runSteps(steps: Step[], onFail: (err: unknown) => void, setRetry: (r: { send: () => Promise<void> } | null) => void): Promise<void> {
  setRetry(null)
  for (let i = 0; i < steps.length; i++) {
    try {
      await steps[i]!()
    } catch (err) {
      if (err instanceof ApiError && err.retryRequest) {
        const rr = err.retryRequest
        const rest = steps.slice(i)
        setRetry({ send: () => runSteps([() => rest[0]!(rr), ...rest.slice(1)], onFail, setRetry) })
      }
      onFail(err)
      return
    }
  }
}

/** 一键按钮（无确认框）：POST path，失败与 uncertain 的处理与 ActionDialog 一致。 */
export function DirectAction(props: { label: string; kind?: string; path: string; body?: () => Record<string, unknown>; onDone: () => void }) {
  const act = useAction(props.onDone)
  const send = (rr?: string) =>
    act.run(async () => {
      await api.post(props.path, { ...(props.body?.() ?? {}), ...(rr ? { retryRequest: rr } : {}) })
    })
  return <ActionButton label={props.label} kind={props.kind} busy={act.busy} error={act.error} retry={act.retry} onSend={() => void send()} />
}

/** 对话框底部：取消 + （有 retry 时）「按原样重试」，否则业务按钮。 */
function DialogFoot(p: { busy: boolean; retry: { send: () => Promise<void> } | null; onCancel: () => void; children?: unknown }) {
  return (
    <div class="dialog-actions">
      <button type="button" class="btn ghost" onClick={p.onCancel} disabled={p.busy}>
        取消
      </button>
      {p.retry ? (
        <button type="button" class="btn" disabled={p.busy} onClick={() => void p.retry!.send()}>
          按原样重试
        </button>
      ) : (
        p.children
      )}
    </div>
  )
}

const dialogError = (error: string | null) =>
  error && (
    <p class="error" role="alert">
      {error}
    </p>
  )

type Candidate = NonNullable<NonNullable<UpResult['run']>['candidates']>

/** 运行冲突接管：列出候选运行，选择后 up { adoptRun }；「新建运行」对应 up { newRun: true }。 */
function AdoptRunDialog(props: { team: string; candidates: Candidate; onClose: () => void; onChanged: () => void }) {
  const act = useAction(() => {
    props.onClose()
    props.onChanged()
  })
  const [pick, setPick] = useState(props.candidates[0]?.id ?? '')
  const up = (body: Record<string, unknown>, rr?: string) =>
    act.run(async () => {
      await api.post(`/api/teams/${encodeURIComponent(props.team)}/up`, { ...body, ...(rr ? { retryRequest: rr } : {}) })
    })
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="选择要接管的运行">
        <h3>选择要接管的运行</h3>
        <p class="muted small">发现多个可能的旧运行；接管可续跑旧任务，新建运行会丢弃它们。</p>
        <label class="field">
          <span>要接管的运行</span>
          <select value={pick} onChange={(e) => setPick((e.target as HTMLSelectElement).value)}>
            {props.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}（{c.createdAt}）
              </option>
            ))}
          </select>
        </label>
        {dialogError(act.error)}
        <DialogFoot busy={act.busy} retry={act.retry} onCancel={props.onClose}>
          <button type="button" class="btn ghost" disabled={act.busy || !pick} onClick={() => void up({ newRun: true })}>
            新建运行（丢弃旧任务）
          </button>
          <button type="button" class="btn" disabled={act.busy || !pick} onClick={() => void up({ adoptRun: pick })}>
            接管
          </button>
        </DialogFoot>
      </div>
    </div>
  )
}

/** 「启动团队 / 补齐岗位」：up 返回 ambiguous / lost 时弹「选择要接管的运行」。 */
export function UpButtons(props: { team: string; up: boolean; onChanged: () => void }) {
  const act = useAction(props.onChanged)
  const [adopt, setAdopt] = useState<Candidate | null>(null)
  const send = (rr?: string) =>
    act.run(async () => {
      const res = await api.post<UpResult>(`/api/teams/${encodeURIComponent(props.team)}/up`, rr ? { retryRequest: rr } : {})
      const run = res.run
      if (run && (run.outcome === 'ambiguous' || run.outcome === 'lost') && run.candidates?.length) setAdopt(run.candidates)
    })
  return (
    <>
      {adopt && <AdoptRunDialog team={props.team} candidates={adopt} onClose={() => setAdopt(null)} onChanged={props.onChanged} />}
      <ActionButton label={props.up ? '补齐岗位' : '启动团队'} busy={act.busy} error={act.error} retry={act.retry} onSend={() => void send()} />
    </>
  )
}

/** 停止团队确认框：勾选「同时关闭岗位终端」才传 close: true（后端缺省不关终端）。 */
function StopTeamDialog(props: { team: string; onClose: () => void; onChanged: () => void }) {
  const act = useAction(() => {
    props.onClose()
    props.onChanged()
  })
  const [close, setClose] = useState(false)
  const down = (rr?: string) =>
    act.run(async () => {
      await api.post(`/api/teams/${encodeURIComponent(props.team)}/down`, { ...(close ? { close: true } : {}), ...(rr ? { retryRequest: rr } : {}) })
    })
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="停止团队">
        <h3>停止团队</h3>
        <p class="muted small">停止调度与岗位，任务进度保留在账本里。</p>
        <label class="field inline check">
          <input type="checkbox" checked={close} onChange={(e) => setClose((e.target as HTMLInputElement).checked)} /> 同时关闭岗位终端
        </label>
        {dialogError(act.error)}
        <DialogFoot busy={act.busy} retry={act.retry} onCancel={props.onClose}>
          <button type="button" class="btn danger" disabled={act.busy} onClick={() => void down()}>
            {act.busy ? '执行中…' : '确认停止'}
          </button>
        </DialogFoot>
      </div>
    </div>
  )
}

/** 应用草稿并重启：down（可选关终端）→ up { draft: true }。 */
function DraftDialog(props: { team: string; onClose: () => void; onChanged: () => void }) {
  const act = useAction(() => {
    props.onClose()
    props.onChanged()
  })
  const [close, setClose] = useState(false)
  const apply = (rr?: string) =>
    act.run(async () => {
      await api.post(`/api/teams/${encodeURIComponent(props.team)}/down`, close ? { close: true } : {})
      await api.post(`/api/teams/${encodeURIComponent(props.team)}/up`, { draft: true, ...(rr ? { retryRequest: rr } : {}) })
    })
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="应用草稿并重启">
        <h3>应用草稿并重启</h3>
        <p class="muted small">校验草稿、替换正式规格，然后重启团队。</p>
        <label class="field inline check">
          <input type="checkbox" checked={close} onChange={(e) => setClose((e.target as HTMLInputElement).checked)} /> 同时关闭旧岗位终端
        </label>
        {dialogError(act.error)}
        <DialogFoot busy={act.busy} retry={act.retry} onCancel={props.onClose}>
          <button type="button" class="btn" disabled={act.busy} onClick={() => void apply()}>
            {act.busy ? '执行中…' : '确认重启'}
          </button>
        </DialogFoot>
      </div>
    </div>
  )
}

/** 「builder=sess-1」形式的会话绑定，逗号 / 空格分隔多对。 */
function parseSessions(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of text.split(/[,，\s]+/).filter(Boolean)) {
    const [k, v] = part.split('=')
    if (k && v) out[k.trim()] = v.trim()
  }
  return out
}

const RESTORE_OUTCOME: Record<string, string> = { kept: '已保留', resumed: '已接回', fresh: '重新启动', ambiguous: '待人工确认', uncertain: '结果不确定', failed: '失败' }

function RestoreResultList(props: { posts: RestoreResult['posts']; onClose: () => void }) {
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="接回结果">
        <h3>接回结果</h3>
        <ul>
          {props.posts.map((p) => (
            <li key={p.address}>
              {postOf(p.address)}：{RESTORE_OUTCOME[p.outcome] ?? p.outcome}
            </li>
          ))}
        </ul>
        <div class="dialog-actions">
          <button type="button" class="btn" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

/** 接回会话：可选「仅预览不执行」「不恢复任务」、显式会话绑定；完成后按岗位展示恢复结果。 */
function RestoreDialog(props: { team: string; onClose: () => void; onChanged: () => void }) {
  const act = useAction(props.onChanged)
  const [dry, setDry] = useState(false)
  const [noTasks, setNoTasks] = useState(false)
  const [sessions, setSessions] = useState('')
  const [result, setResult] = useState<RestoreResult['posts'] | null>(null)
  const go = (rr?: string) =>
    act.run(async () => {
      const sess = parseSessions(sessions)
      const res = await api.post<RestoreResult>(`/api/teams/${encodeURIComponent(props.team)}/restore`, {
        ...(dry ? { dryRun: true } : {}),
        ...(noTasks ? { noTasks: true } : {}),
        ...(Object.keys(sess).length ? { sessions: sess } : {}),
        ...(rr ? { retryRequest: rr } : {}),
      })
      setResult(res.posts)
    })
  if (result) return <RestoreResultList posts={result} onClose={props.onClose} />
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="接回会话">
        <h3>接回会话</h3>
        <label class="field inline check">
          <input type="checkbox" checked={dry} onChange={(e) => setDry((e.target as HTMLInputElement).checked)} /> 仅预览不执行
        </label>
        <label class="field inline check">
          <input type="checkbox" checked={noTasks} onChange={(e) => setNoTasks((e.target as HTMLInputElement).checked)} /> 不恢复任务
        </label>
        <label class="field">
          <span>会话绑定（如 builder=sess-1，多个用逗号分隔）</span>
          <input type="text" value={sessions} onInput={(e) => setSessions((e.target as HTMLInputElement).value)} />
        </label>
        {dialogError(act.error)}
        <DialogFoot busy={act.busy} retry={act.retry} onCancel={props.onClose}>
          <button type="button" class="btn" disabled={act.busy} onClick={() => void go()}>
            {act.busy ? '执行中…' : '执行'}
          </button>
        </DialogFoot>
      </div>
    </div>
  )
}

/** 总览页生命周期按钮组：状态徽标 + 启动/补齐/停止团队、应用草稿、接回会话。 */
export function TeamActions(props: { team: string; view: TeamActionsView; onChanged: () => void }) {
  const v = props.view
  const [open, setOpen] = useState<'stop' | 'draft' | 'restore' | null>(null)
  const done = () => setOpen(null)
  return (
    <div class="actions">
      <Pill tone={v.status === 'up' ? 'ok' : 'warn'}>{v.status === 'up' ? '运行中' : '已停止'}</Pill>
      <UpButtons team={props.team} up={v.status === 'up'} onChanged={props.onChanged} />
      {v.hasDraft && (
        <button type="button" class="btn" onClick={() => setOpen('draft')}>
          应用草稿并重启
        </button>
      )}
      <button type="button" class="btn ghost" onClick={() => setOpen('restore')}>
        接回会话
      </button>
      {v.status === 'up' && (
        <button type="button" class="btn danger" onClick={() => setOpen('stop')}>
          停止团队
        </button>
      )}
      <CommandHint note="命令对照：" command={`wl up ${v.specPath} ；wl restore ${props.team} ；wl down ${props.team}`} />
      {open === 'stop' && <StopTeamDialog team={props.team} onClose={done} onChanged={props.onChanged} />}
      {open === 'draft' && <DraftDialog team={props.team} onClose={done} onChanged={props.onChanged} />}
      {open === 'restore' && <RestoreDialog team={props.team} onClose={done} onChanged={props.onChanged} />}
    </div>
  )
}

/** 调度员启停：running / stale →「停止调度员」（后端缺省关终端）；否则「启动调度员」，neverStarted 时置灰。 */
export function DispatcherActions(props: { team: string; state: DispatcherState; neverStarted?: boolean; onChanged: () => void }) {
  const enc = encodeURIComponent(props.team)
  const live = props.state === 'running' || props.state === 'stale'
  return (
    <div class="actions">
      {live ? (
        <DirectAction label="停止调度员" kind="btn danger" path={`/api/teams/${enc}/dispatcher/down`} onDone={props.onChanged} />
      ) : props.neverStarted ? (
        <button type="button" class="btn" disabled title="先启动团队">
          启动调度员
        </button>
      ) : (
        <DirectAction label="启动调度员" kind="btn" path={`/api/teams/${enc}/dispatcher/up`} onDone={props.onChanged} />
      )}
      <CommandHint command={`wl dispatcher ${live ? 'down' : 'up'} ${props.team}`} />
    </div>
  )
}
