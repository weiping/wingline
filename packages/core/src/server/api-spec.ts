import { about } from '../commands/about.js'
import { readSpecForEdit, validateSpecEdit } from '../commands/spec.js'
import { WinglineError } from '../errors.js'
import type { SpecEditOp } from '../spec/edit.js'
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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** set 的三种形态：{ path, value }（op 缺省）、{ op: 'add_post', post }、{ op: 'remove_post', index }。 */
function parseSet(raw: unknown): SpecEditOp | undefined {
  if (raw === undefined) return undefined
  const bad = new WinglineError('input', 'invalid_param', '参数 set 不合法')
  if (!isObj(raw)) throw bad
  if (raw.op === 'add_post') {
    const p = raw.post
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || typeof p.agent !== 'string' || !p.agent) throw bad
    if (p.brief !== undefined && (!Array.isArray(p.brief) || !p.brief.every((b) => typeof b === 'string'))) throw bad
    for (const k of ['model', 'launch', 'worktree'] as const) {
      if (p[k] !== undefined && typeof p[k] !== 'string') throw bad
    }
    return { op: 'add_post', post: p as Extract<SpecEditOp, { op: 'add_post' }>['post'] }
  }
  if (raw.op === 'remove_post') {
    if (!Number.isInteger(raw.index) || (raw.index as number) < 0) throw bad
    return { op: 'remove_post', index: raw.index as number }
  }
  if (raw.op !== undefined && raw.op !== 'set') throw bad
  const ok = Array.isArray(raw.path) && raw.path.length > 0 && raw.path.every((p) => typeof p === 'string' || Number.isInteger(p))
  if (!ok || !('value' in raw)) throw bad
  return { path: raw.path as Array<string | number>, value: raw.value }
}

function parseFiles(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined
  if (!isObj(raw) || !Object.values(raw).every((v) => typeof v === 'string')) {
    throw new WinglineError('input', 'invalid_param', '参数 files 不合法')
  }
  return raw as Record<string, string>
}

/** 编辑器与“关于”页的只读 / 校验接口。validate 虽是 POST，但不写文件、不进审计。 */
export function registerSpecRoutes(r: Router, o: { version: string }): void {
  r.get('/api/teams/:team/spec', async (ctx: HandlerContext) => {
    checkParam('team', ctx.params.team)
    return readSpecForEdit(ctx.deps, ctx.params.team!)
  })

  r.post('/api/teams/:team/spec/validate', async (ctx: HandlerContext) => {
    checkParam('team', ctx.params.team)
    assertFields(ctx.body, ['yaml', 'set', 'files'])
    checkParam('yaml', ctx.body.yaml)
    return validateSpecEdit(ctx.deps, {
      team: ctx.params.team!,
      yaml: ctx.body.yaml as string,
      set: parseSet(ctx.body.set),
      files: parseFiles(ctx.body.files),
    })
  })

  r.get('/api/about', async (ctx: HandlerContext) =>
    about(ctx.deps, { version: o.version, consoleFile: readConsoleFile(ctx.deps.home) }),
  )
}
