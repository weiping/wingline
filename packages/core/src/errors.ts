export type ErrorKind = 'input' | 'orca' | 'uncertain' | 'internal'

export const EXIT_CODES = { ok: 0, input: 1, orca: 2, uncertain: 3, internal: 4 } as const

export class WinglineError extends Error {
  readonly kind: ErrorKind
  readonly code: string
  readonly hint?: string
  readonly detail?: unknown

  constructor(
    kind: ErrorKind,
    code: string,
    message: string,
    opts: { hint?: string; detail?: unknown; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause })
    this.name = 'WinglineError'
    this.kind = kind
    this.code = code
    this.hint = opts.hint
    this.detail = opts.detail
  }
}

export function exitCodeOf(err: unknown): number {
  return err instanceof WinglineError ? EXIT_CODES[err.kind] : EXIT_CODES.internal
}
