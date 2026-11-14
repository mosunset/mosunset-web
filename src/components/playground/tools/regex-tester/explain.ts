// パターンを先頭から読んで、部分ごとの意味を日本語で説明する（かんたんな解説。厳密な構文チェックはしない）

export type ExplainKind =
  | 'literal'
  | 'class'
  | 'escape'
  | 'anchor'
  | 'group'
  | 'groupEnd'
  | 'quantifier'
  | 'alternation'
  | 'backref'

export type ExplainItem = {
  /** パターンの中の文字列 */
  token: string
  text: string
  kind: ExplainKind
  /** グループの入れ子の深さ（字下げに使う） */
  depth: number
  /** キャプチャグループの番号（色分けに使う） */
  group?: number
}

export type GroupDef = { number: number; name?: string }

const SIMPLE_ESCAPES: Record<string, string> = {
  d: '数字 1 文字（0〜9）',
  D: '数字以外の 1 文字',
  w: '英数字かアンダースコア（_）の 1 文字',
  W: '英数字とアンダースコア以外の 1 文字',
  s: '空白 1 文字（スペース・タブ・改行・全角スペースなど）',
  S: '空白以外の 1 文字',
  n: '改行（LF）',
  r: '復帰（CR）',
  t: 'タブ',
  f: '改ページ',
  v: '垂直タブ',
  '0': 'NUL 文字',
}

const ANCHOR_ESCAPES: Record<string, string> = {
  b: '単語の境目（文字は消費しない）',
  B: '単語の境目ではないところ（文字は消費しない）',
}

/** よく使う Unicode プロパティの日本語名 */
const PROPERTY_NAMES: Record<string, string> = {
  'Script=Han': '漢字',
  'Script=Hiragana': 'ひらがな',
  'Script=Katakana': 'カタカナ',
  'Script=Latin': 'ラテン文字（アルファベット）',
  'Script=Greek': 'ギリシャ文字',
  'Script=Cyrillic': 'キリル文字',
  'Script=Hangul': 'ハングル',
  L: '文字（Letter）',
  Letter: '文字（Letter）',
  Lu: '大文字',
  Ll: '小文字',
  N: '数字（Number）',
  Nd: '10 進数の数字',
  P: '句読点（Punctuation）',
  S: '記号（Symbol）',
  Emoji: '絵文字',
  Emoji_Presentation: '絵文字（絵として表示されるもの）',
  Extended_Pictographic: '絵文字・ピクトグラム',
  White_Space: '空白',
}

function propertyName(body: string) {
  const normalized = body
    .replace(/^(sc|scx|Script_Extensions)=/, 'Script=')
    .replace(/^General_Category=|^gc=/, '')
  return PROPERTY_NAMES[normalized] ?? `Unicode のプロパティ「${body}」`
}

/** \ から始まる 1 つの書き方を読む。読んだ長さと説明を返す */
function readEscape(
  s: string,
  i: number,
  unicode: boolean,
): { len: number; text: string; kind: ExplainKind; inClass?: string } {
  const c = s[i + 1]
  if (c === undefined)
    return { len: 1, text: '末尾の \\（書き方の誤り）', kind: 'escape' }
  if (c in ANCHOR_ESCAPES)
    return { len: 2, text: ANCHOR_ESCAPES[c], kind: 'anchor' }
  if (c in SIMPLE_ESCAPES)
    return { len: 2, text: SIMPLE_ESCAPES[c], kind: 'escape' }
  if (c === 'p' || c === 'P') {
    const m = /^\{([^}]*)\}/.exec(s.slice(i + 2))
    if (m) {
      const name = propertyName(m[1])
      return {
        len: 2 + m[0].length,
        text: c === 'p' ? `${name}の 1 文字` : `${name}以外の 1 文字`,
        kind: 'escape',
        inClass: c === 'p' ? name : `${name} 以外`,
      }
    }
  }
  if (c === 'k') {
    const m = /^<([^>]+)>/.exec(s.slice(i + 2))
    if (m)
      return {
        len: 2 + m[0].length,
        text: `グループ「${m[1]}」でマッチしたのと同じ文字列`,
        kind: 'backref',
      }
  }
  if (/[1-9]/.test(c)) {
    const m = /^\d+/.exec(s.slice(i + 1))
    const n = m ? m[0] : c
    return {
      len: 1 + n.length,
      text: `${n} 番目のグループでマッチしたのと同じ文字列`,
      kind: 'backref',
    }
  }
  if (c === 'x') {
    const m = /^[0-9a-fA-F]{2}/.exec(s.slice(i + 2))
    if (m)
      return {
        len: 4,
        text: `文字コード U+00${m[0].toUpperCase()} の文字「${String.fromCharCode(Number.parseInt(m[0], 16))}」`,
        kind: 'escape',
      }
  }
  if (c === 'u') {
    const braced = unicode ? /^\{([0-9a-fA-F]+)\}/.exec(s.slice(i + 2)) : null
    const plain = /^[0-9a-fA-F]{4}/.exec(s.slice(i + 2))
    const hex = braced ? braced[1] : plain?.[0]
    if (hex) {
      const code = Number.parseInt(hex, 16)
      const ch = code <= 0x10ffff ? String.fromCodePoint(code) : '?'
      return {
        len: 2 + (braced ? braced[0].length : 4),
        text: `文字コード U+${hex.toUpperCase().padStart(4, '0')} の文字「${ch}」`,
        kind: 'escape',
      }
    }
  }
  if (c === 'c' && /[A-Za-z]/.test(s[i + 2] ?? ''))
    return {
      len: 3,
      text: `制御文字（Ctrl+${s[i + 2].toUpperCase()}）`,
      kind: 'escape',
    }
  return { len: 2, text: `「${c}」という文字そのもの`, kind: 'literal' }
}

/** [ から対応する ] までの長さ（v フラグでは [ ] を入れ子にできる） */
function classLength(s: string, i: number, sets: boolean) {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === '[') {
      // v フラグがないとき、中の [ はただの文字
      if (depth === 0 || sets) depth++
    } else if (c === ']') {
      depth--
      if (depth === 0) return j - i + 1
    }
  }
  return s.length - i
}

/** 文字クラス [...] の中身を説明する */
function describeClass(token: string, unicode: boolean, sets: boolean) {
  let body = token.slice(1, -1)
  const negated = body.startsWith('^')
  if (negated) body = body.slice(1)
  if (sets && /\[|&&|--/.test(body))
    return negated
      ? '集合演算（入れ子・&&・--）で作った文字の集まりに含まれない 1 文字'
      : '集合演算（入れ子・&&・--）で作った文字の集まりのどれか 1 文字'
  if (body === '')
    return negated ? 'どんな 1 文字でも（改行も含む）' : '何にもマッチしない'

  // 1 文字ずつ（\ の書き方はまとめて）読む
  const atoms: { label: string; ch?: string }[] = []
  for (let j = 0; j < body.length; ) {
    if (body[j] === '\\') {
      const e = readEscape(body, j, unicode)
      const raw = body.slice(j, j + e.len)
      const simple = SIMPLE_ESCAPES[raw[1]]
      atoms.push(
        e.kind === 'literal'
          ? { label: raw[1], ch: raw[1] }
          : { label: e.inClass ?? simple?.replace(/(の)? ?1 文字/, '') ?? raw },
      )
      j += e.len
    } else {
      const ch = String.fromCodePoint(body.codePointAt(j) ?? 0)
      atoms.push({ label: ch, ch })
      j += ch.length
    }
  }
  const parts: string[] = []
  for (let k = 0; k < atoms.length; k++) {
    const a = atoms[k]
    const b = atoms[k + 2]
    if (a.ch && atoms[k + 1]?.ch === '-' && b?.ch) {
      parts.push(`${a.ch}〜${b.ch}`)
      k += 2
    } else parts.push(a.label === ' ' ? '半角スペース' : a.label)
  }
  const list = parts.map((p) => `「${p}」`).join('')
  return negated ? `${list}以外の 1 文字` : `${list}のどれか 1 文字`
}

const QUANTIFIER = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/

function describeQuantifier(q: string) {
  const lazy = q.length > 1 && q.endsWith('?')
  const base = lazy ? q.slice(0, -1) : q
  let text: string
  if (base === '*') text = '直前を 0 回以上くり返す'
  else if (base === '+') text = '直前を 1 回以上くり返す'
  else if (base === '?') text = '直前は あっても なくてもよい（0 回か 1 回）'
  else {
    const [min, max] = base.slice(1, -1).split(',')
    if (max === undefined) text = `直前をちょうど ${min} 回くり返す`
    else if (max === '') text = `直前を ${min} 回以上くり返す`
    else text = `直前を ${min}〜${max} 回くり返す`
  }
  if (base === '?' || /^\{\d+\}$/.test(base))
    return lazy ? `${text}（なるべく少なく）` : text
  return `${text}（${lazy ? 'なるべく少なく' : 'なるべく多く'}）`
}

const FLAG_NAMES: Record<string, string> = {
  i: '大文字と小文字を区別しない',
  m: '^ と $ を行ごとにする',
  s: '. が改行にもマッチする',
}

/** パターンを部分ごとに説明する */
export function explainPattern(source: string, flags: string) {
  const unicode = flags.includes('u') || flags.includes('v')
  const sets = flags.includes('v')
  const items: ExplainItem[] = []
  /** 開いているグループの番号（キャプチャしないものは undefined） */
  const stack: (number | undefined)[] = []
  let groupCount = 0
  /** まだ出していない、ふつうの文字の並び（ch は文字、raw はパターンでの書き方） */
  let literal: { ch: string; raw: string }[] = []

  const push = (item: Omit<ExplainItem, 'depth'>) =>
    items.push({ ...item, depth: stack.length })
  const flush = () => {
    if (literal.length === 0) return
    const text = literal.map((l) => l.ch).join('')
    push({
      token: literal.map((l) => l.raw).join(''),
      text:
        literal.length === 1
          ? `「${text === ' ' ? '半角スペース' : text}」という文字`
          : `「${text}」という文字列`,
      kind: 'literal',
    })
    literal = []
  }

  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    const c = source[i]

    // 直前の 1 文字だけにくり返しがかかるので、文字列の最後の 1 文字は分ける
    const q = QUANTIFIER.exec(rest)
    if (q) {
      if (literal.length > 1) {
        const last = literal.slice(-1)
        literal = literal.slice(0, -1)
        flush()
        literal = last
      }
      flush()
      push({ token: q[0], text: describeQuantifier(q[0]), kind: 'quantifier' })
      i += q[0].length
      continue
    }

    if (c === '\\') {
      const e = readEscape(source, i, unicode)
      if (e.kind === 'literal') {
        literal.push({
          ch: source[i + 1] ?? '',
          raw: source.slice(i, i + e.len),
        })
        i += e.len
        continue
      }
      flush()
      push({ token: source.slice(i, i + e.len), text: e.text, kind: e.kind })
      i += e.len
      continue
    }

    if (c === '[') {
      flush()
      const len = classLength(source, i, sets)
      const token = source.slice(i, i + len)
      push({ token, text: describeClass(token, unicode, sets), kind: 'class' })
      i += len
      continue
    }

    if (c === '(') {
      flush()
      const look = /^\(\?(<=|<!|=|!)/.exec(rest)
      const named = /^\(\?<([^>]+)>/.exec(rest)
      const modifiers = /^\(\?([ims]*)(?:-([ims]+))?:/.exec(rest)
      if (rest.startsWith('(?:')) {
        push({
          token: '(?:',
          text: 'グループ（番号を付けない。まとめるだけ）',
          kind: 'group',
        })
        stack.push(undefined)
        i += 3
      } else if (look) {
        const m = look
        const text = {
          '=': '先読み: この後ろに次の内容が続くところ（文字は消費しない）',
          '!': '否定の先読み: この後ろに次の内容が続かないところ',
          '<=': '後読み: この前に次の内容があるところ（文字は消費しない）',
          '<!': '否定の後読み: この前に次の内容がないところ',
        }[m[1]]
        push({ token: m[0], text: text ?? '', kind: 'group' })
        stack.push(undefined)
        i += m[0].length
      } else if (named) {
        const m = named
        groupCount++
        push({
          token: m[0],
          text: `グループ ${groupCount}「${m[1]}」（名前付き。マッチした部分を取り出せる）`,
          kind: 'group',
          group: groupCount,
        })
        stack.push(groupCount)
        i += m[0].length
      } else if (modifiers) {
        const m = modifiers
        const on = [...m[1]].map((f) => FLAG_NAMES[f]).join('・')
        const off = [...(m[2] ?? '')].map((f) => FLAG_NAMES[f]).join('・')
        push({
          token: m[0],
          text: `この中だけフラグを変える${on ? `（${on}）` : ''}${off ? `（やめる: ${off}）` : ''}`,
          kind: 'group',
        })
        stack.push(undefined)
        i += m[0].length
      } else {
        groupCount++
        push({
          token: '(',
          text: `グループ ${groupCount}（マッチした部分を取り出せる）`,
          kind: 'group',
          group: groupCount,
        })
        stack.push(groupCount)
        i += 1
      }
      continue
    }

    if (c === ')') {
      flush()
      const group = stack.pop()
      push({
        token: ')',
        text: group ? `グループ ${group} の終わり` : 'グループの終わり',
        kind: 'groupEnd',
        group,
      })
      i += 1
      continue
    }

    if (c === '|') {
      flush()
      push({
        token: '|',
        text: 'または（左右のどちらか）',
        kind: 'alternation',
      })
      i += 1
      continue
    }

    if (c === '^' || c === '$' || c === '.') {
      flush()
      const text = {
        '^': flags.includes('m')
          ? '行の先頭（文字は消費しない）'
          : '文字列の先頭（文字は消費しない）',
        $: flags.includes('m')
          ? '行の末尾（文字は消費しない）'
          : '文字列の末尾（文字は消費しない）',
        '.': flags.includes('s')
          ? 'どんな 1 文字でも（改行も含む）'
          : '改行以外のどんな 1 文字でも',
      }[c]
      push({ token: c, text, kind: c === '.' ? 'escape' : 'anchor' })
      i += 1
      continue
    }

    // ふつうの文字（サロゲートペアの絵文字などは 1 文字として扱う）
    const ch = String.fromCodePoint(source.codePointAt(i) ?? 0)
    literal.push({ ch, raw: ch })
    i += ch.length
  }
  flush()
  return items
}

/** キャプチャグループの番号と名前を、パターンに出てくる順に返す */
export function captureGroups(source: string, flags: string): GroupDef[] {
  return explainPattern(source, flags)
    .filter((it) => it.kind === 'group' && it.group !== undefined)
    .map((it) => {
      const name = /^\(\?<([^>]+)>$/.exec(it.token)?.[1]
      return { number: it.group ?? 0, name }
    })
}
