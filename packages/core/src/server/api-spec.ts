import { about } from '../commands/about.js'
import { readSpecForEdit, validateSpecEdit } from '../commands/spec.js'
import { WinglineError } from '../errors.js'
import type { HandlerContext, Router } from './http.js'
import { checkParam } from './http.js'
import { readConsoleFile } from './control.js'

function assertFields(body: unknown, allowed: readonly string[]): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new WinglineError('input', 'unknown_field', '请求体必须是 JSON 对象')
  }
  for (const k of Object.keys(body)) {
    if (!allowed.includes(k)) throw new WinglineError('input', 'unknown_field', `未知字段 ${k}`)
  }
}

function parseSet(raw: unknown): { path: Array<string | number>; value: unknown } | undefined {
  if (raw === undefined) return undefined
  const s = raw as { path?: unknown; value?: unknown }
  const ok = s && typeof s === 'object' && Array.isArray(s.path) && s.path.length > 0 && s.path.every((p) => typeof p === 'string' || Number.isInteger(p))
  if (!ok || !('value' in s)) throw new WinglineError('input', 'invalid_param', '参数 set 不合法')
  return { path: s.path as Array<string | number>, value: s.value }
}

/** 编辑器与“关于”页的只读 / 校验接口。validate 虽是 POST，但不写文件、不进审计。 */
export function registerSpecRoutes(r: Router, o: { version: string }): void {
  r.get('/api/teams/:team/spec', async (ctx: HandlerContext) => {
    checkParam('team', ctx.params.team)
    return readSpecForEdit(ctx.deps, ctx.params.team!)
  })

  r.post('/api/teams/:team/spec/validate', async (ctx: HandlerContext) => {
    checkParam('team', ctx.params.team)
    assertFields(ctx.body, ['yaml', 'set'])
    checkParam('yaml', ctx.body.yaml)
    return validateSpecEdit(ctx.deps, { team: ctx.params.team!, yaml: ctx.body.yaml as string, set: parseSet(ctx.body.set) })
  })

  r.get('/api/about', async (ctx: HandlerContext) =>
    about(ctx.deps, { version: o.version, consoleFile: readConsoleFile(ctx.deps.home) }),
  )
}
