import { useState } from 'preact/hooks'
import { ApiError, errorText } from '../api.js'
import { toast } from './Toast.js'

export interface FieldSpec {
  name: string
  label: string
  kind?: 'text' | 'textarea' | 'select' | 'number'
  options?: string[]
  required?: boolean
  initial?: string
}

export interface ActionDialogProps {
  /** 触发按钮的文字。 */
  label: string
  title: string
  fields?: FieldSpec[]
  submitLabel?: string
  danger?: boolean
  /** 收到表单值；带 retryRequest 时是“按原样重试”，调用方必须把它原样放进请求体。 */
  onSubmit: (values: Record<string, string>, retryRequest?: string) => Promise<unknown>
  onDone?: () => void
}

/**
 * 写操作入口：确认框 + 必填字段。失败时显示 hint；结果不确定（带 retryRequest）时给出“按原样重试”，
 * 绝不自动重试（spec 第 6 节）。
 */
export function ActionDialog(props: ActionDialogProps) {
  const fields = props.fields ?? []
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ values: Record<string, string>; retryRequest: string } | null>(null)

  const reset = () => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.name] = f.initial ?? ''
    setValues(init)
    setError(null)
    setRetry(null)
  }

  const send = async (payload: Record<string, string>, retryRequest?: string) => {
    const missing = fields.filter((f) => f.required && !payload[f.name]?.trim())
    if (missing.length > 0) {
      setError(`请填写：${missing.map((f) => f.label).join('、')}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await props.onSubmit(payload, retryRequest)
      toast(`${props.title}：已完成`)
      setOpen(false)
      setRetry(null)
      props.onDone?.()
    } catch (err) {
      setError(errorText(err))
      if (err instanceof ApiError && err.retryRequest) setRetry({ values: payload, retryRequest: err.retryRequest })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        class={props.danger ? 'btn danger' : 'btn'}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        {props.label}
      </button>
    )
  }

  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={props.title}>
        <h3>{props.title}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(values)
          }}
        >
          {fields.map((f) => (
            <label class="field" key={f.name}>
              <span>
                {f.label}
                {f.required ? ' *' : ''}
              </span>
              {f.kind === 'textarea' ? (
                <textarea
                  value={values[f.name] ?? ''}
                  onInput={(e) => setValues({ ...values, [f.name]: (e.target as HTMLTextAreaElement).value })}
                />
              ) : f.kind === 'select' ? (
                <select
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.name]: (e.target as HTMLSelectElement).value })}
                >
                  <option value="" />
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  value={values[f.name] ?? ''}
                  onInput={(e) => setValues({ ...values, [f.name]: (e.target as HTMLInputElement).value })}
                />
              )}
            </label>
          ))}
          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          <div class="dialog-actions">
            <button type="button" class="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </button>
            {retry ? (
              <button type="button" class="btn" disabled={busy} onClick={() => void send(retry.values, retry.retryRequest)}>
                按原样重试
              </button>
            ) : (
              <button type="submit" class={props.danger ? 'btn danger' : 'btn'} disabled={busy}>
                {props.submitLabel ?? '确认'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
