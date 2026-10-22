import { Document, Scalar, isMap, isScalar, isSeq, parseDocument, type Node, type Pair, type YAMLMap } from 'yaml'
import { WinglineError } from '../errors.js'

type Path = Array<string | number>
type Doc = Document.Parsed

// 表单改一处，其余部分必须逐字节不变（评论前的空格、缩进写法、flow 列表、空行都是用户的）。
// yaml 库的 Document#toString() 会整篇重排这些，所以能定位到的修改一律按 AST 位置做文本手术；
// 定位不了的（flow 映射里新增、块序列整体替换等）才回退到 Document API。
const RENDER = { lineWidth: 0, flowCollectionPadding: false } as const

const isPlain = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
const isPlainList = (v: unknown): v is Array<string | number | boolean> => Array.isArray(v) && v.length > 0 && v.every(isPlain)

/** 含 pos 的那一行的行首下标。 */
const lineStart = (text: string, pos: number): number => text.lastIndexOf('\n', pos - 1) + 1

/** pos 所在行结束（含换行）之后的下标；没有换行则到文末。 */
function lineAfter(text: string, pos: number): number {
  const i = text.indexOf('\n', pos)
  return i === -1 ? text.length : i + 1
}

/** 节点内容结束的位置，不含它后面的换行。 */
function contentEnd(text: string, end: number): number {
  let e = end
  while (e > 0 && (text[e - 1] === '\n' || text[e - 1] === '\r')) e -= 1
  return e
}

function flowText(items: unknown[]): string {
  const d = new Document(items)
  ;(d.contents as { flow?: boolean }).flow = true
  return d.toString(RENDER).trimEnd()
}

/** `key: value` 的 YAML 文本（可能多行，无结尾换行）；纯标量列表写成 flow `[a, b]`，与模板的写法一致。 */
function pairText(chain: string[], value: unknown): string {
  const nested = chain.slice(1).reduceRight<unknown>((acc, k) => ({ [k]: acc }), value)
  const d = new Document({ [chain[0]!]: nested })
  const leaf = chain.reduce<unknown>((n, k) => (n as { get(k: string, keep: boolean): unknown }).get(k, true), d.contents)
  if (isPlainList(value) && isSeq(leaf)) leaf.flow = true
  return d.toString(RENDER).trimEnd()
}

/** 已有的单行值（标量 / flow 列表 / 空值）原地替换成新的单行值。 */
function replaceInline(text: string, doc: Doc, path: Path, value: unknown): string | null {
  const node = doc.getIn(path, true) as Node | null | undefined
  const range = node?.range
  if (!node || !range) return null
  const inline = isScalar(node) || (isSeq(node) && node.flow)
  if (!inline) return null
  let rendered: string
  if (isPlainList(value)) rendered = flowText(value)
  else if (isPlain(value)) {
    const next = new Scalar(value)
    if (typeof value === 'string' && isScalar(node) && typeof node.value === 'string') next.type = node.type
    rendered = new Document(next).toString(RENDER).trimEnd()
  } else return null
  if (rendered.includes('\n')) return null
  const [start, valueEnd] = range
  if (start !== valueEnd) return `${text.slice(0, start)}${rendered}${text.slice(valueEnd)}`
  // 键后面什么都没写（`a:` 或 `a:   # 注释`）：值节点是空的，紧挨着冒号补 " 值"，原有的空格和注释不动
  const parent = path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true)
  const pair = isMap(parent) ? pairIn(parent, path[path.length - 1]!) : undefined
  const keyEnd = (pair?.key as Node | null)?.range?.[1]
  const colon = keyEnd === undefined ? -1 : text.indexOf(':', keyEnd)
  return colon === -1 ? null : `${text.slice(0, colon + 1)} ${rendered}${text.slice(colon + 1)}`
}

const keyText = (p: Pair) => (isScalar(p.key) ? String(p.key.value) : null)
const pairIn = (map: YAMLMap, key: string | number): Pair | undefined => map.items.find((p) => keyText(p) === String(key))

/** pair 最后一行的结束位置（含换行）：含嵌套的块内容和行尾注释。 */
function pairEnd(text: string, p: Pair): number {
  const keyEnd = (p.key as Node | null)?.range?.[1] ?? 0
  const valueEnd = (p.value as Node | null)?.range?.[1] ?? 0
  return lineAfter(text, contentEnd(text, Math.max(keyEnd, valueEnd)))
}

function blockMap(node: unknown): YAMLMap | null {
  return isMap(node) && !node.flow && node.items.length > 0 ? node : null
}

/** 删除一个块映射里的键：只剩它一个键时返回 null（交给 Document API，写成 `{}`）。 */
function deleteKey(text: string, doc: Doc, path: Path): string | null {
  const parent = blockMap(path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true))
  const pair = parent && pairIn(parent, path[path.length - 1]!)
  const keyStart = (pair?.key as Node | undefined)?.range?.[0]
  if (!parent || !pair || keyStart === undefined || parent.items.length < 2) return null
  const start = lineStart(text, keyStart)
  if (text.slice(start, keyStart).trim() !== '') return null // 键和别的内容在同一行（如 `- id: x`）
  return text.slice(0, start) + text.slice(pairEnd(text, pair))
}

/** 沿路径往下走，返回最深的、已存在的块映射，以及路径里第一个缺失的元素下标。 */
function deepestMap(doc: Doc, path: Path): { map: YAMLMap; depth: number } | null {
  let node: unknown = doc.contents
  let found: { map: YAMLMap; depth: number } | null = null
  for (let i = 0; i < path.length; i++) {
    if (isMap(node)) found = { map: node, depth: i }
    if (!isMap(node) && !isSeq(node)) break
    const next = node.get(path[i]!, true)
    if (next === undefined) break
    node = next
  }
  return found
}

/** 在已有块映射的最后一个键之后插入一个（可能带缺失的上级的）新键。 */
function insertKey(text: string, doc: Doc, path: Path, value: unknown): string | null {
  const at = deepestMap(doc, path)
  const map = at && blockMap(at.map)
  const chain = at ? path.slice(at.depth) : []
  if (!at || !map || chain.some((k) => typeof k !== 'string') || pairIn(map, chain[0]!)) return null
  const last = map.items[map.items.length - 1]!
  const keyStart = (last.key as Node | null)?.range?.[0]
  if (keyStart === undefined) return null
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const indent = ' '.repeat(keyStart - lineStart(text, keyStart))
  const lines = pairText(chain as string[], value).split('\n').map((l) => `${indent}${l}${eol}`).join('')
  const pos = pairEnd(text, last)
  const needsBreak = pos === text.length && !text.endsWith('\n')
  return text.slice(0, pos) + (needsBreak ? eol : '') + lines + text.slice(pos)
}

/**
 * 路径必须落得下：序列只接受已有的整数下标，映射只接受字符串键，标量底下不能再有东西；
 * 缺失的部分之后只能是字符串键（会建出映射）。否则 yaml 库要么抛普通错误、要么悄悄造出带洞的序列。
 */
function assertPlaceable(doc: Doc, path: Path): void {
  let node: unknown = doc.contents
  for (let i = 0; i < path.length; i++) {
    const k = path[i]!
    if (node === undefined || node === null || (isScalar(node) && node.value === null)) {
      if (path.slice(i).every((x) => typeof x === 'string')) return
      break
    }
    if (isSeq(node) && Number.isInteger(k) && (k as number) >= 0 && (k as number) < node.items.length) node = node.get(k as number, true)
    else if (isMap(node) && typeof k === 'string') node = node.get(k, true)
    else break
    if (i === path.length - 1) return
  }
  throw new WinglineError('input', 'spec_invalid', `表单修改的路径不合法：${path.join('.')}`)
}

/** 把表单的一处修改写回 YAML：`value === null` 删除该字段。 */
export function setField(text: string, path: Path, value: unknown): string {
  const doc = parseDocument(text)
  const err = doc.errors[0]
  if (err) throw new WinglineError('input', 'spec_invalid', `YAML 有语法错误：${err.message}`)
  assertPlaceable(doc, path)
  const exists = doc.hasIn(path)
  const surgical = value === null ? deleteKey(text, doc, path) : (exists ? replaceInline(text, doc, path, value) : null) ?? (exists ? null : insertKey(text, doc, path, value))
  if (surgical !== null) return surgical
  if (value === null) doc.deleteIn(path)
  else doc.setIn(path, value)
  return doc.toString()
}
