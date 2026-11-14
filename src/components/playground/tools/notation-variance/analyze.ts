/**
 * 表記ゆれの検出（画面とは切り離した純粋な関数）。
 * 形態素解析の結果（kuromoji のトークン）と元の文章から、書き方だけが違う語をグループにまとめる。
 */

/** analyze に渡すトークン（kuromoji の Token から使う項目だけ） */
export type TokenLike = {
  surface_form: string
  pos: string
  pos_detail_1: string
  conjugated_type: string
  conjugated_form: string
  basic_form: string
  reading?: string
}

export type Kind = 'okurigana' | 'kanji-kana' | 'choon' | 'width' | 'symbol'

export const kindLabels: Record<Kind, string> = {
  okurigana: '送り仮名',
  'kanji-kana': '漢字・かな',
  choon: 'カタカナの長音',
  width: '全角・半角',
  symbol: '記号の全角・半角',
}

/** 本文の中の 1 か所 */
export type Occurrence = {
  start: number
  end: number
  text: string
  /** どの表記（Variant.value）に当たるか */
  variant: string
}

export type Variant = {
  value: string
  /** 一覧に出す表記 */
  label: string
  count: number
}

export type Group = {
  id: string
  kind: Kind
  variants: Variant[]
  occurrences: Occurrence[]
}

// ---------------------------------------------------------------------------
// 文字の種類
// ---------------------------------------------------------------------------

const KANA_ONLY = /^[ぁ-ゖゝゞァ-ヺー-ヾ]+$/
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/
const KANJI_G = /[㐀-䶿一-鿿豈-﫿々〆]/g
const KANA_G = /[ぁ-ゖゝゞァ-ヺー-ヾ]/g

const isKanaOnly = (s: string) => KANA_ONLY.test(s)
const hasKanji = (s: string) => KANJI.test(s)
const kanjiOf = (s: string): string[] => s.match(KANJI_G) ?? []

/** ひらがなをカタカナにする */
const hiraToKata = (s: string) =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

/** 全角の英数字・記号を半角に、半角を全角にする */
const toHalf = (c: string) => c.normalize('NFKC')
const toFull = (c: string) => {
  const code = c.charCodeAt(0)
  return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : c
}

// ---------------------------------------------------------------------------
// 置き換え
// ---------------------------------------------------------------------------

/**
 * 1 か所を、選んだ表記に置き換えた文字列。
 * 活用する語（行っ → おこなっ）は、基本形の違いを活用語尾に当てはめる。
 */
export function replaceOccurrence(
  group: Group,
  occ: Occurrence,
  target: string,
): string {
  if (group.kind === 'symbol')
    return target === 'full' ? toFull(toHalf(occ.text)) : toHalf(occ.text)
  if (occ.variant === target) return occ.text
  if (occ.text === occ.variant) return target
  // 活用している語: 表層形と基本形の共通部分のあとが活用語尾
  let p = 0
  while (
    p < occ.text.length &&
    p < occ.variant.length &&
    occ.text[p] === occ.variant[p]
  )
    p++
  const drop = occ.variant.length - p
  if (drop > target.length) return target
  return target.slice(0, target.length - drop) + occ.text.slice(p)
}

/** 選んだ表記で文章を一括置換する。choices は グループ id → 表記（無いものはそのまま） */
export function applyChoices(
  text: string,
  groups: Group[],
  choices: Record<string, string>,
) {
  const edits: { start: number; end: number; to: string }[] = []
  for (const g of groups) {
    const target = choices[g.id]
    if (target === undefined) continue
    for (const o of g.occurrences) {
      const to = replaceOccurrence(g, o, target)
      if (to !== o.text) edits.push({ start: o.start, end: o.end, to })
    }
  }
  edits.sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  for (const e of edits) {
    out += text.slice(cursor, e.start) + e.to
    cursor = e.end
  }
  return { text: out + text.slice(cursor), count: edits.length }
}

// ---------------------------------------------------------------------------
// 検出
// ---------------------------------------------------------------------------

type Candidate = Occurrence & { key: string }

/** 先に見つかったグループと重なる箇所は、あとの検出では使わない */
class Claimed {
  private marks: boolean[]
  constructor(length: number) {
    this.marks = new Array<boolean>(length).fill(false)
  }
  overlaps(o: { start: number; end: number }) {
    for (let i = o.start; i < o.end; i++) if (this.marks[i]) return true
    return false
  }
  mark(o: { start: number; end: number }) {
    for (let i = o.start; i < o.end; i++) this.marks[i] = true
  }
  add(groups: Group[]) {
    for (const g of groups) for (const o of g.occurrences) this.mark(o)
  }
}

/** 同じ key の候補を、表記が 2 種類以上あるものだけグループにする */
function groupByKey(
  candidates: Candidate[],
  kind: (variants: string[]) => Kind,
  idPrefix: string,
  label: (v: string) => string = (v) => v,
): Group[] {
  const byKey = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const list = byKey.get(c.key)
    if (list) list.push(c)
    else byKey.set(c.key, [c])
  }
  const groups: Group[] = []
  for (const [key, list] of byKey) {
    const counts = new Map<string, number>()
    for (const c of list)
      counts.set(c.variant, (counts.get(c.variant) ?? 0) + 1)
    if (counts.size < 2) continue
    const variants = [...counts.entries()]
      .map(([value, count]) => ({ value, label: label(value), count }))
      .sort((a, b) => b.count - a.count)
    groups.push({
      id: `${idPrefix}:${key}`,
      kind: kind(variants.map((v) => v.value)),
      variants,
      occurrences: list.map(({ key: _k, ...o }) => o),
    })
  }
  return groups
}

/** 英数字の全角・半角（と大文字・小文字）のゆれ */
function findAlnum(text: string, claimed: Claimed): Group[] {
  const re = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]+/g
  const list: Candidate[] = []
  for (const m of text.matchAll(re)) {
    const o = { start: m.index, end: m.index + m[0].length }
    if (claimed.overlaps(o)) continue
    list.push({
      ...o,
      text: m[0],
      variant: m[0],
      key: m[0].normalize('NFKC').toLowerCase(),
    })
  }
  return groupByKey(list, () => 'width', 'alnum')
}

/** カッコなどの記号の全角・半角のゆれ（開きと閉じは 1 つのグループ） */
const SYMBOLS: Record<string, string> = {
  '(': 'paren',
  ')': 'paren',
  '[': 'bracket',
  ']': 'bracket',
  '{': 'brace',
  '}': 'brace',
  '!': '!',
  '?': '?',
  ':': ':',
  ';': ';',
  '%': '%',
  '&': '&',
  '#': '#',
  '+': '+',
  '=': '=',
  '/': '/',
  '~': '~',
  '@': '@',
}
function findSymbols(text: string, claimed: Claimed): Group[] {
  const list: Candidate[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const half = toHalf(c)
    const key = SYMBOLS[half]
    if (!key || half.length !== 1) continue
    const o = { start: i, end: i + 1 }
    if (claimed.overlaps(o)) continue
    list.push({ ...o, text: c, variant: c === half ? 'half' : 'full', key })
  }
  const groups = groupByKey(list, () => 'symbol', 'symbol')
  // 表記の見出しは、その記号の半角・全角を並べたもの（例: ( ) と （ ））
  for (const g of groups) {
    const chars = [...new Set(g.occurrences.map((o) => toHalf(o.text)))].sort()
    for (const v of g.variants)
      v.label = (v.value === 'full' ? chars.map(toFull) : chars).join(' ')
  }
  return groups
}

/** カタカナ語の長音（ー）のゆれ（半角カタカナも含める） */
function choonKey(s: string) {
  const t = s.normalize('NFKC').replace(/ー+$/, '')
  const u = t.replace(/ー/g, '')
  // 「ビル／ビール」のような短い語は別の語なので、語中の長音は長い語だけ無視する
  return u.length >= 4 ? u : t
}
function findKatakana(text: string, claimed: Claimed): Group[] {
  const re = /[ァ-ヺーｦ-ﾟ]+/g
  const list: Candidate[] = []
  for (const m of text.matchAll(re)) {
    const o = { start: m.index, end: m.index + m[0].length }
    if (claimed.overlaps(o) || m[0].normalize('NFKC').length < 2) continue
    list.push({ ...o, text: m[0], variant: m[0], key: choonKey(m[0]) })
  }
  return groupByKey(
    list,
    (vs) =>
      new Set(vs.map((v) => v.normalize('NFKC'))).size === 1
        ? 'width'
        : 'choon',
    'kata',
  )
}

/** 形態素解析の区切り（語の始まりと終わりの位置） */
function tokenBounds(text: string, tokens: TokenLike[]) {
  const starts = new Set<number>()
  const ends = new Set<number>()
  /** 活用する語として使われているところの終わり（「受け付けます」の「受け付け」） */
  const verbalEnds = new Set<number>()
  const spans: { start: number; end: number }[] = []
  const verbal = tokens.map((t, i) => isVerbal(t, tokens[i + 1]))
  let cursor = 0
  tokens.forEach((t, i) => {
    const start = text.indexOf(t.surface_form, cursor)
    if (start < 0) {
      spans.push({ start: -1, end: -1 })
      return
    }
    cursor = start + t.surface_form.length
    starts.add(start)
    ends.add(cursor)
    if (verbal[i]) verbalEnds.add(cursor)
    spans.push({ start, end: cursor })
  })
  return { starts, ends, spans, verbal, verbalEnds }
}

/**
 * 活用する語として使われているか。
 * 連用形でも、後ろに助動詞・接続助詞などが続かないもの（「申込みを」）は名詞として扱う。
 */
function isVerbal(t: TokenLike, next: TokenLike | undefined) {
  if (t.conjugated_type === '*' || t.basic_form === '*') return false
  if (!t.conjugated_form.startsWith('連用')) return true
  return Boolean(
    next &&
      (next.pos === '助動詞' ||
        next.pos === '動詞' ||
        next.pos === '形容詞' ||
        (next.pos === '助詞' && next.pos_detail_1 === '接続助詞')),
  )
}

type Bounds = ReturnType<typeof tokenBounds>

/** 「申し込み」→「申込み」「申込」のように、送り仮名を省いた書き方を全部作る */
function okuriganaForms(word: string) {
  const parts = word.match(/[ぁ-ゖ]+|[^ぁ-ゖ]+/g) ?? []
  // 漢字のあいだ（と最後）のかなを、残すか省くかの組み合わせ
  const kanaIdx = parts.flatMap((p, i) =>
    i > 0 && /^[ぁ-ゖ]/.test(p) ? [i] : [],
  )
  if (kanaIdx.length === 0 || kanaIdx.length > 4) return []
  const forms = new Set<string>()
  for (let mask = 0; mask < 1 << kanaIdx.length; mask++) {
    forms.add(
      parts
        .filter((_, i) => {
          const k = kanaIdx.indexOf(i)
          return k < 0 || (mask >> k) & 1
        })
        .join(''),
    )
  }
  return [...forms]
}

/**
 * 送り仮名のゆれ（取り扱い／取扱い／取扱）。
 * 「申込みを」が「申＋込み」と分かれるように読みでは見つけにくいので、
 * 文章に出てくる名詞から送り仮名を省いた形を作り、語の区切りが合う場所を探す。
 */
function findOkurigana(
  text: string,
  tokens: TokenLike[],
  bounds: Bounds,
  claimed: Claimed,
): Group[] {
  const seeds = new Set<string>()
  for (const t of tokens) {
    const s = t.surface_form
    // 漢字で始まり、漢字のあいだに送り仮名がある名詞
    if (
      t.pos === '名詞' &&
      /^[㐀-鿿々]+[ぁ-ゖ]+[㐀-鿿々]/.test(s) &&
      /^[㐀-鿿々ぁ-ゖ]+$/.test(s)
    )
      seeds.add(s)
  }
  const used = new Claimed(text.length)
  const list: Candidate[] = []
  for (const seed of seeds) {
    const forms = okuriganaForms(seed).sort((a, b) => b.length - a.length)
    for (const form of forms) {
      for (let i = text.indexOf(form); i >= 0; i = text.indexOf(form, i + 1)) {
        const o = { start: i, end: i + form.length }
        if (
          !bounds.starts.has(o.start) ||
          !bounds.ends.has(o.end) ||
          bounds.verbalEnds.has(o.end)
        )
          continue
        if (claimed.overlaps(o) || used.overlaps(o)) continue
        list.push({ ...o, text: form, variant: form, key: seed })
        used.mark(o)
      }
    }
  }
  return groupByKey(list, () => 'okurigana', 'okuri')
}

/** 2 つの表記が「同じ語の書き方違い」と言えるか（読みが同じであることは確認済み） */
function isVariantPair(a: string, b: string) {
  if (isKanaOnly(a) || isKanaOnly(b)) return true
  const ka = kanjiOf(a)
  const shared = kanjiOf(b).some((c) => ka.includes(c))
  // 「機械／機会」のように漢字だけの語どうしは、別の語なのでまとめない
  const allKanji = (s: string) => kanjiOf(s).length === s.length
  return shared && !(allKanji(a) && allKanji(b))
}

const SKIP_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他'])

/**
 * 同じ読みで書き方が違う語（行う／おこなう、子供／子ども、取り扱い／取扱い）。
 * 活用する語は基本形で比べる。名詞のように使われている連用形（申込み）は表層形で比べる。
 */
function findReadings(
  tokens: TokenLike[],
  bounds: Bounds,
  claimed: Claimed,
): Group[] {
  const list: Candidate[] = []
  tokens.forEach((t, i) => {
    const s = t.surface_form
    const o = bounds.spans[i]
    if (
      o.start < 0 ||
      SKIP_POS.has(t.pos) ||
      t.pos_detail_1 === '数' ||
      !t.reading ||
      t.reading === '*' ||
      !(hasKanji(s) || /[ぁ-ゖ]/.test(s)) ||
      claimed.overlaps(o)
    )
      return

    if (!bounds.verbal[i]) {
      list.push({ ...o, text: s, variant: s, key: t.reading })
      return
    }
    if (s === t.basic_form) {
      list.push({ ...o, text: s, variant: s, key: `${verbKey(t)}${t.reading}` })
      return
    }
    // 活用している語: 読みの活用語尾を、基本形の語尾に置き換えて基本形の読みを作る
    const b = t.basic_form
    let p = 0
    while (p < s.length && p < b.length && s[p] === b[p]) p++
    const tail = hiraToKata(s.slice(p))
    if (!t.reading.endsWith(tail)) return
    const reading =
      t.reading.slice(0, t.reading.length - tail.length) +
      hiraToKata(b.slice(p))
    list.push({ ...o, text: s, variant: b, key: `${verbKey(t)}${reading}` })
  })

  // 読みが同じものの中で、書き方違いと言える表記どうしをつなぐ
  const byKey = new Map<string, Candidate[]>()
  for (const c of list) {
    const l = byKey.get(c.key)
    if (l) l.push(c)
    else byKey.set(c.key, [c])
  }
  const regrouped: Candidate[] = []
  for (const [key, cands] of byKey) {
    const writings = [...new Set(cands.map((c) => c.variant))]
    if (writings.length < 2) continue
    const parent = writings.map((_, i) => i)
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i]
      return i
    }
    for (let i = 0; i < writings.length; i++)
      for (let j = i + 1; j < writings.length; j++)
        if (isVariantPair(writings[i], writings[j])) parent[find(i)] = find(j)
    for (const c of cands)
      regrouped.push({
        ...c,
        key: `${key}#${find(writings.indexOf(c.variant))}`,
      })
  }
  return groupByKey(regrouped, readingKind, 'read')
}

/** 動詞は「している」の「いる」と「要る」を分けるため、自立・非自立も見る */
const verbKey = (t: TokenLike) =>
  t.pos === '動詞' ? `動詞/${t.pos_detail_1}/` : ''

function readingKind(variants: string[]): Kind {
  const skeleton = (s: string) => s.replace(KANA_G, '')
  const sk = variants.map(skeleton)
  return sk.every((s) => s !== '' && s === sk[0]) ? 'okurigana' : 'kanji-kana'
}

/** 文章とその形態素解析の結果から、表記ゆれのグループを出現順に返す */
export function analyze(text: string, tokens: TokenLike[]): Group[] {
  const claimed = new Claimed(text.length)
  const bounds = tokenBounds(text, tokens)
  const all: Group[] = []
  for (const find of [
    (c: Claimed) => findAlnum(text, c),
    (c: Claimed) => findSymbols(text, c),
    (c: Claimed) => findKatakana(text, c),
    (c: Claimed) => findOkurigana(text, tokens, bounds, c),
    (c: Claimed) => findReadings(tokens, bounds, c),
  ]) {
    const groups = find(claimed)
    claimed.add(groups)
    all.push(...groups)
  }
  for (const g of all) g.occurrences.sort((a, b) => a.start - b.start)
  return all.sort((a, b) => a.occurrences[0].start - b.occurrences[0].start)
}
