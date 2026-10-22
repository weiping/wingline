import { Document, Scalar, isScalar, parseDocument } from 'yaml'
import { WinglineError } from '../errors.js'

type Path = Array<string | number>

/** 新值是单行标量、旧值也是标量时，只替换那一段文字：其余字节（包括行尾注释前的空格）原样不动。 */
function spliceScalar(text: string, doc: Document, path: Path, value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null
  const node = doc.getIn(path, true)
  if (!isScalar(node) || !node.range) return null
  const next = new Scalar(value)
  if (typeof value === 'string' && typeof node.value === 'string') next.type = node.type
  const rendered = new Document(next).toString().trimEnd()
  if (rendered.includes('\n')) return null
  return text.slice(0, node.range[0]) + rendered + text.slice(node.range[1])
}

/** 把表单的一处修改写回 YAML：`value === null` 删除该字段。 */
export function setField(text: string, path: Path, value: unknown): string {
  const doc = parseDocument(text)
  const err = doc.errors[0]
  if (err) throw new WinglineError('input', 'spec_invalid', `YAML 有语法错误：${err.message}`)
  const spliced = value === null ? null : spliceScalar(text, doc, path, value)
  if (spliced !== null) return spliced
  if (value === null) doc.deleteIn(path)
  else doc.setIn(path, value)
  return doc.toString()
}
