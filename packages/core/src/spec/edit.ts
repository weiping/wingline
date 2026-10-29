import { Document, Scalar, isMap, isScalar, isSeq, parseDocument, type Node, type Pair, type YAMLMap, type YAMLSeq } from 'yaml'
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
  const parent = path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true)
  const inFlow = (isMap(parent) || isSeq(parent)) && parent.flow === true
  let rendered: string
  if (isPlainList(value)) rendered = flowText(value)
  else if (isPlain(value)) {
    const next = new Scalar(value)
    // 沿用原来的引号写法；原值是空串时的引号是我们自己写的（清空必填项），不沿用
    if (typeof value === 'string' && isScalar(node) && typeof node.value === 'string' && node.value !== '') next.type = node.type
    // 写进 { } / [ ] 里的字符串要按 flow 上下文加引号：`c, d`、`x}` 在块上下文里是普通标量，在这里会截断或破坏语法
    rendered = inFlow ? flowText([next]).slice(1, -1) : new Document(next).toString(RENDER).trimEnd()
  } else return null
  if (rendered.includes('\n')) return null
  const [start, valueEnd] = range
  if (start !== valueEnd) return `${text.slice(0, start)}${rendered}${text.slice(valueEnd)}`
  // 键后面什么都没写（`a:` 或 `a:   # 注释`）：值节点是空的，紧挨着冒号补 " 值"，原有的空格和注释不动
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
  if (text.slice(start, keyStart).trim() === '') return text.slice(0, start) + text.slice(pairEnd(text, pair))
  return deleteFirstOfItem(text, parent, pair, keyStart, start)
}

/** `- key: v` 里序列元素的第一个键：只删这个键（连同下一个键前的缩进），保留 `- ` 与元素里的其他键。 */
function deleteFirstOfItem(text: string, parent: YAMLMap, pair: Pair, keyStart: number, lineBegin: number): string | null {
  if (!/^\s*-\s+$/.test(text.slice(lineBegin, keyStart))) return null
  const next = parent.items[parent.items.indexOf(pair) + 1]
  const nextStart = (next?.key as Node | null | undefined)?.range?.[0]
  // 下一个键必须正好在下一行行首的缩进之后，否则中间夹着别的内容，不敢删
  if (nextStart === undefined || lineStart(text, nextStart) !== pairEnd(text, pair)) return null
  return text.slice(0, keyStart) + text.slice(nextStart)
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
  try {
    if (value === null) doc.deleteIn(path)
    else {
      fillEmptySections(doc, path)
      doc.setIn(path, value)
    }
    return doc.toString()
  } catch (cause) {
    // yaml 库对放不下的位置抛普通 Error：这是表单给了不合理的路径，按输入错误处理，不是 500
    throw new WinglineError('input', 'spec_invalid', `表单修改无法写入：${path.join('.')}（${(cause as Error).message}）`, { cause })
  }
}

/** 路径经过的某一段是“只有键、没有值”（`patrol:` 后面什么都没写）：先补成空映射，setIn 才有地方放。 */
function fillEmptySections(doc: Doc, path: Path): void {
  for (let i = 1; i < path.length; i++) {
    const node = doc.getIn(path.slice(0, i), true)
    if (!isScalar(node) || node.value !== null) continue
    const empty = doc.createNode({}) as Node
    empty.comment = node.comment
    node.comment = undefined
    doc.setIn(path.slice(0, i), empty)
  }
}

type SpecPost = { id: string; agent: string; model?: string; launch?: string; worktree?: string; brief?: string[] }

export type SpecEditOp =
  | { op?: 'set'; path: Path; value: unknown }
  | { op: 'add_post'; post: SpecPost }
  | { op: 'remove_post'; index: number }

/** 解析规格文本；语法错误按输入错误报告（与 setField 同一口径）。 */
function specDoc(text: string): Doc {
  const doc = parseDocument(text)
  const err = doc.errors[0]
  if (err) throw new WinglineError('input', 'spec_invalid', `YAML 有语法错误：${err.message}`)
  return doc
}

/** 岗位增删都靠按行定位：posts 必须是块序列（不能是 flow 或缺失）。 */
function postsSeq(doc: Doc): YAMLSeq {
  const posts = doc.get('posts', true)
  if (!isSeq(posts) || posts.flow) throw new WinglineError('input', 'spec_invalid', 'posts 必须是块序列')
  return posts
}

/** 新岗位的节点：brief 保持模板的 flow 写法，undefined 与空数组字段不写入。 */
function postNode(doc: Doc, post: SpecPost): Node {
  const filled = Object.fromEntries(Object.entries(post).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)))
  const node = doc.createNode(filled)
  const brief = isMap(node) ? node.get('brief', true) : null
  if (isSeq(brief)) brief.flow = true
  return node
}

/** 在 posts 末尾按最后一项的既有缩进追加新岗位；插入点之后一个字节不动。定位不了缩进时返回 null。 */
function appendPost(text: string, posts: YAMLSeq, node: Node): string | null {
  const map = blockMap(posts.items[posts.items.length - 1])
  const keyStart = map ? (map.items[0]!.key as Node | null)?.range?.[0] : undefined
  if (!map || keyStart === undefined) return null
  const lineBegin = lineStart(text, keyStart)
  const indent = /^(\s*)- /.exec(text.slice(lineBegin, keyStart))
  if (!indent) return null
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const pad = ' '.repeat(indent[1]!.length)
  const body = new Document(node).toString(RENDER).trimEnd().split('\n')
    .map((l, i) => (i === 0 ? `${pad}- ${l}` : `${pad}  ${l}`)).join(eol)
  // 插在最后一项（含它的行尾注释）那行结束之后，原有的空行与注释留在新岗位后面
  const at = pairEnd(text, map.items[map.items.length - 1]!)
  return text.slice(0, at) + body + eol + text.slice(at)
}

function addPost(text: string, post: SpecPost): string {
  const doc = specDoc(text)
  const posts = postsSeq(doc)
  if (posts.items.some((it) => isMap(it) && it.get('id') === post.id)) {
    throw new WinglineError('input', 'spec_invalid', `岗位 id 重复：${post.id}`)
  }
  const node = postNode(doc, post)
  const out = appendPost(text, posts, node)
  if (out !== null) return out
  posts.add(node) // 最后一项不是块映射、算不出缩进：整篇交给 Document API，宁可重排不写坏
  return doc.toString()
}

/** 整段删除 posts 的第 index 个元素：从它首键所在行的行首删到内容结束（含换行）。 */
function deleteSeqItem(text: string, posts: YAMLSeq, index: number): string | null {
  const map = blockMap(posts.items[index])
  const keyStart = map ? (map.items[0]!.key as Node | null)?.range?.[0] : undefined
  if (!map || keyStart === undefined) return null
  const lineBegin = lineStart(text, keyStart)
  if (!/^\s*-\s+$/.test(text.slice(lineBegin, keyStart))) return null
  return text.slice(0, lineBegin) + text.slice(pairEnd(text, map.items[map.items.length - 1]!))
}

/** 删除一个键；父映射会因此变空时连父键一起删，一次删到能按行手术的层级，少触发 Document API 整篇重排。 */
function pruneExisting(text: string, path: Path): string {
  const doc = parseDocument(text)
  if (!doc.hasIn(path)) return text
  let cut = path
  for (let i = path.length - 1; i > 0; i--) {
    const parent = doc.getIn(path.slice(0, i), true)
    if (!isMap(parent) || parent.items.length !== 1) break
    cut = path.slice(0, i)
  }
  return setField(text, cut, null)
}

/** 从其余岗位的 links.*.(reviewed_by|hands_to|consults) 数组里剔除被删 id；剔空的数组连键清掉。 */
function stripPostRefs(text: string, doc: Doc, removedId: string): string {
  const links = doc.get('links', true)
  let out = text
  if (!isMap(links) || links.flow) return out
  for (const pair of links.items) {
    const postId = keyText(pair)
    const rels = isMap(pair.value) && !pair.value.flow ? pair.value : null
    if (!postId || postId === removedId || !rels) continue
    for (const rel of rels.items) {
      const name = keyText(rel)
      if (!name || !['reviewed_by', 'hands_to', 'consults'].includes(name) || !isSeq(rel.value)) continue
      const kept = rel.value.items.filter((n) => !(isScalar(n) && n.value === removedId)).map((n) => (n as Scalar).value)
      if (kept.length === rel.value.items.length) continue
      out = kept.length > 0 ? setField(out, ['links', postId, name], kept) : pruneExisting(out, ['links', postId, name])
    }
  }
  return out
}

function removePost(text: string, index: number): string {
  const doc = specDoc(text)
  const posts = postsSeq(doc)
  if (posts.items.length <= 1) throw new WinglineError('input', 'spec_invalid', '团队至少保留一个岗位')
  if (!Number.isInteger(index) || !posts.items[index]) throw new WinglineError('input', 'spec_invalid', `岗位下标不合法：${index}`)
  const removedId = isMap(posts.items[index]) ? posts.items[index]!.get('id') : undefined
  const firstLeft = posts.items[index === 0 ? 1 : 0]!
  const nextLead = isMap(firstLeft) ? firstLeft.get('id') : undefined
  const cut = deleteSeqItem(text, posts, index)
  let out = cut
  if (out === null) {
    doc.deleteIn(['posts', index]) // 被删项不是块映射、行定位不了：整篇交给 Document API，宁可重排不写坏
    out = doc.toString()
  }
  if (typeof removedId === 'string') {
    out = pruneExisting(out, ['links', removedId])
    out = pruneExisting(out, ['gates', removedId])
    out = stripPostRefs(out, doc, removedId)
  }
  if (typeof nextLead === 'string' && doc.get('lead') === removedId) out = setField(out, ['lead'], nextLead)
  return out
}

/** 把团队编辑页的一处规格修改写回 YAML：op 缺省是 set（等价 setField），add_post / remove_post 增删岗位。 */
export function applySpecOp(text: string, op: SpecEditOp): string {
  if (op.op === 'add_post') return addPost(text, op.post)
  if (op.op === 'remove_post') return removePost(text, op.index)
  return setField(text, op.path, op.value)
}
