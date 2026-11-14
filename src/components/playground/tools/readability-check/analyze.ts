import type { Token, Tokenizer } from '@/components/playground/tools/kuromoji'

/** warn = 直したほうがよい、caution = 見直すとよい */
export type Level = 'warn' | 'caution'

export type CategoryKey =
  | 'long'
  | 'commaFew'
  | 'kanji'
  | 'ending'
  | 'negation'
  | 'commaMany'
  | 'noChain'
  | 'conjunction'
  | 'ga'

export type Range = { start: number; end: number }

export type Issue = {
  id: string
  category: CategoryKey
  level: Level
  /** 何番目の文か（0 から） */
  sentence: number
  /** 本文の中の位置（文字列の添字） */
  ranges: Range[]
  message: string
}

export type Settings = {
  /** この字数を超えたら「注意」 */
  cautionLength: number
  /** この字数を超えたら「警告」 */
  warnLength: number
  /** 漢字率の目安（%） */
  kanjiMin: number
  kanjiMax: number
  /** 同じ語尾がこの回数続いたら知らせる */
  endingRepeat: number
  /** 1 文の読点がこの数を超えたら知らせる */
  maxCommas: number
  /** 「の」がこの回数つながったら知らせる */
  noChain: number
}

export const defaultSettings: Settings = {
  cautionLength: 60,
  warnLength: 100,
  kanjiMin: 20,
  kanjiMax: 35,
  endingRepeat: 3,
  maxCommas: 4,
  noChain: 3,
}

/** 読点のない文として知らせる長さ（字） */
const NO_COMMA_LENGTH = 50
/** 文ごとの漢字率を見る最低の長さ（短い文は割合がぶれるので見ない） */
const KANJI_MIN_LETTERS = 15

export type Sentence = {
  start: number
  end: number
  text: string
  /** 空白を除いた字数 */
  length: number
  /** 記号・空白を除いた字数（漢字率の分母） */
  letters: number
  kanji: number
  /** 。！？ で終わっているか（見出しや箇条書きの行は false） */
  terminated: boolean
}

export type Result = {
  sentences: Sentence[]
  issues: Issue[]
  stats: {
    chars: number
    sentences: number
    averageLength: number
    longest: number
    /** 全体の漢字率（%） */
    kanjiRatio: number
  }
  score: number
}

const TERMINATORS = '。．！？!?'
const OPEN = '「『（(【［[〈《“'
const CLOSE = '」』）)】］]〉》”'
const COMMAS = '、，,'
const HAN = /[\p{Script=Han}々〆ヶ]/u
const NOT_LETTER = /[\s\p{P}\p{S}]/u

const charCount = (s: string) => Array.from(s.replace(/\s/g, '')).length

/**
 * 文に分ける。「」の中の。では区切らない（閉じかっこが同じ行にないときは区切る）。
 * 改行でも区切る
 */
export function splitSentences(
  text: string,
): Omit<Sentence, 'length' | 'letters' | 'kanji'>[] {
  const out: Omit<Sentence, 'length' | 'letters' | 'kanji'>[] = []
  let start = 0
  let depth = 0
  const push = (end: number, terminated: boolean) => {
    let s = start
    while (s < end && /\s/.test(text[s])) s++
    let e = end
    while (e > s && /\s/.test(text[e - 1])) e--
    if (e > s)
      out.push({ start: s, end: e, text: text.slice(s, e), terminated })
    start = end
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') {
      push(i, false)
      depth = 0
      i++
      start = i
      continue
    }
    if (OPEN.includes(ch)) {
      if (hasCloseBeforeNewline(text, i + 1)) depth++
    } else if (CLOSE.includes(ch)) {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && TERMINATORS.includes(ch)) {
      let j = i + 1
      while (
        j < text.length &&
        (TERMINATORS.includes(text[j]) || CLOSE.includes(text[j]))
      )
        j++
      push(j, true)
      i = j
      continue
    }
    i++
  }
  // 最後の文は。がなくても文として扱う
  push(text.length, true)
  return out
}

function hasCloseBeforeNewline(text: string, from: number) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\n') return false
    if (CLOSE.includes(text[i])) return true
  }
  return false
}

type PlacedToken = Token & { start: number; end: number }

/** 文を形態素に分け、本文の中の位置を付ける */
function placeTokens(
  tokenizer: Tokenizer,
  sentence: { start: number; text: string },
): PlacedToken[] {
  let pos = 0
  return tokenizer.tokenize(sentence.text).map((t) => {
    const found = sentence.text.indexOf(t.surface_form, pos)
    const at = found === -1 ? pos : found
    pos = at + t.surface_form.length
    return { ...t, start: sentence.start + at, end: sentence.start + pos }
  })
}

const isNounLike = (t: Token) => t.pos === '名詞' || t.pos === '接頭詞'

/** 文頭に来たら接続詞とみなす語（辞書で副詞などになるもの） */
const CONJUNCTION_WORDS = new Set([
  'また',
  'そして',
  'しかし',
  'でも',
  'だから',
  'なので',
  'さらに',
  'ただ',
  'つまり',
  'それで',
  'ですが',
  'だが',
  'けれども',
  'ところが',
  'ちなみに',
  'それから',
  'なお',
  'まず',
  '次に',
])

const NEGATION_PATTERNS = [
  /(?:な[いく]|無[いく])(?:わけ|訳)(?:で|じゃ)(?:は|も)?(?:ない|無い|ありません|なかった)/g,
  /(?:な|無)く(?:は|も)(?:ない|無い|ありません|なかった)/g,
  /ない(?:こと|事)(?:は|も)(?:ない|無い|ありません|なかった)/g,
  /ないとは(?:言|い)え(?:ない|ません)/g,
  /ないとも限(?:らない|りません)/g,
  /ないと(?:は)?(?:言|い)い切れ(?:ない|ません)/g,
  /ないでは(?:い|お)られ(?:ない|ません)/g,
  /ずには(?:い|お)られ(?:ない|ません)/g,
  /ざるを(?:得|え)(?:ない|ません)/g,
  /ないもの(?:でも|では)(?:ない|ありません)/g,
  /ないわけにはいか(?:ない|なかった)|ないわけにはいきません/g,
]

/** 語尾として比べる部分（文末の記号を除いた最後の 2 字） */
function endingOf(s: { start: number; text: string }) {
  let e = s.text.length
  while (
    e > 0 &&
    (TERMINATORS.includes(s.text[e - 1]) ||
      CLOSE.includes(s.text[e - 1]) ||
      /\s/.test(s.text[e - 1]))
  )
    e--
  const body = Array.from(s.text.slice(0, e))
  if (body.length < 4) return null
  const key = body.slice(-2).join('')
  return { key, start: s.start + e - key.length, end: s.start + e }
}

export function analyze(
  text: string,
  tokenizer: Tokenizer,
  settings: Settings,
): Result {
  const sentences: Sentence[] = splitSentences(text).map((s) => {
    let letters = 0
    let kanji = 0
    for (const ch of s.text) {
      if (NOT_LETTER.test(ch)) continue
      letters++
      if (HAN.test(ch)) kanji++
    }
    return { ...s, length: charCount(s.text), letters, kanji }
  })
  const issues: Issue[] = []
  let seq = 0
  const add = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: `i${seq++}` })
  const whole = (s: Sentence): Range[] => [{ start: s.start, end: s.end }]

  // 同じ語尾・同じ接続詞は、続いている文をまとめて知らせる
  let endingRun: { key: string; items: { sentence: number; r: Range }[] } = {
    key: '',
    items: [],
  }
  let conjRun: { key: string; items: { sentence: number; r: Range }[] } = {
    key: '',
    items: [],
  }
  const flushEnding = () => {
    if (endingRun.items.length >= settings.endingRepeat) {
      for (const it of endingRun.items)
        add({
          category: 'ending',
          level: 'caution',
          sentence: it.sentence,
          ranges: [it.r],
          message: `「〜${endingRun.key}」で終わる文が ${endingRun.items.length} つ続いています。語尾を変えると単調さが減ります`,
        })
    }
    endingRun = { key: '', items: [] }
  }
  const flushConj = () => {
    if (conjRun.items.length >= 2) {
      for (const it of conjRun.items)
        add({
          category: 'conjunction',
          level: 'caution',
          sentence: it.sentence,
          ranges: [it.r],
          message: `「${conjRun.key}」で始まる文が ${conjRun.items.length} つ続いています。言い換えるか、どちらかを削れないか見直しましょう`,
        })
    }
    conjRun = { key: '', items: [] }
  }

  sentences.forEach((s, index) => {
    const tokens = placeTokens(tokenizer, s)

    // 一文の長さ
    if (s.length > settings.warnLength || s.length > settings.cautionLength) {
      const warn = s.length > settings.warnLength
      add({
        category: 'long',
        level: warn ? 'warn' : 'caution',
        sentence: index,
        ranges: whole(s),
        message: `${s.length} 字の文です（目安は ${settings.cautionLength} 字まで）。2 つの文に分けられないか見直しましょう`,
      })
    }

    // 漢字の割合（文ごと）
    if (s.letters >= KANJI_MIN_LETTERS) {
      const ratio = (s.kanji / s.letters) * 100
      if (ratio > settings.kanjiMax + 15)
        add({
          category: 'kanji',
          level: 'caution',
          sentence: index,
          ranges: whole(s),
          message: `漢字が ${Math.round(ratio)}% と多めです。ひらがなにできる言葉や、言い換えられる熟語がないか見直しましょう`,
        })
      else if (ratio < Math.max(0, settings.kanjiMin - 10))
        add({
          category: 'kanji',
          level: 'caution',
          sentence: index,
          ranges: whole(s),
          message: `漢字が ${Math.round(ratio)}% と少なめです。ひらがなが続くと、言葉の切れ目が分かりにくくなります`,
        })
    }

    // 読点
    const commaRanges: Range[] = []
    for (let i = 0; i < s.text.length; i++)
      if (COMMAS.includes(s.text[i]))
        commaRanges.push({ start: s.start + i, end: s.start + i + 1 })
    if (commaRanges.length > settings.maxCommas)
      add({
        category: 'commaMany',
        level: 'caution',
        sentence: index,
        ranges: commaRanges,
        message: `読点が ${commaRanges.length} つあります。文を分けるか、なくても読める読点を削りましょう`,
      })
    else if (commaRanges.length === 0 && s.length >= NO_COMMA_LENGTH)
      add({
        category: 'commaFew',
        level: 'caution',
        sentence: index,
        ranges: whole(s),
        message: `${s.length} 字の文に読点がありません。意味の切れ目に読点を打つと読みやすくなります`,
      })

    // 二重否定
    for (const re of NEGATION_PATTERNS) {
      re.lastIndex = 0
      for (const m of s.text.matchAll(re))
        add({
          category: 'negation',
          level: 'caution',
          sentence: index,
          ranges: [
            {
              start: s.start + (m.index ?? 0),
              end: s.start + (m.index ?? 0) + m[0].length,
            },
          ],
          message: `「${m[0]}」は二重否定です。肯定の形で言い切れないか見直しましょう`,
        })
    }

    // 「の」の連続（名詞 の 名詞 の 名詞 の …）
    let run: { start: number; end: number; count: number } | null = null
    let prevNoun = false
    const flushRun = () => {
      if (run && run.count >= settings.noChain)
        add({
          category: 'noChain',
          level: 'caution',
          sentence: index,
          ranges: [{ start: run.start, end: run.end }],
          message: `「の」が ${run.count} 回つながっています。「〜にある」「〜が持つ」などに言い換えると読みやすくなります`,
        })
      run = null
    }
    for (const t of tokens) {
      if (isNounLike(t)) {
        if (run) run.end = t.end
        else run = { start: t.start, end: t.end, count: 0 }
        prevNoun = true
        continue
      }
      if (run && prevNoun && t.surface_form === 'の' && t.pos === '助詞') {
        run.count++
        run.end = t.end
        prevNoun = false
        continue
      }
      flushRun()
      prevNoun = false
    }
    flushRun()

    // つなぎの「が」の重なり
    const ga = tokens.filter(
      (t) =>
        t.surface_form === 'が' &&
        t.pos === '助詞' &&
        t.pos_detail_1 === '接続助詞',
    )
    if (ga.length >= 2)
      add({
        category: 'ga',
        level: 'caution',
        sentence: index,
        ranges: ga.map((t) => ({ start: t.start, end: t.end })),
        message: `文をつなぐ「が」が ${ga.length} 回あります。「が」の所で文を分けると読みやすくなります`,
      })

    // 同じ語尾の連続（見出しや箇条書きの行で途切れる）
    const ending = s.terminated ? endingOf(s) : null
    if (ending && ending.key === endingRun.key)
      endingRun.items.push({ sentence: index, r: ending })
    else {
      flushEnding()
      if (ending)
        endingRun = {
          key: ending.key,
          items: [{ sentence: index, r: ending }],
        }
    }

    // 同じ接続詞の連続（文頭の接続詞）
    const first = tokens.find((t) => t.pos !== '記号')
    const conj =
      first &&
      (first.pos === '接続詞' || CONJUNCTION_WORDS.has(first.surface_form))
        ? first
        : null
    if (conj && conj.surface_form === conjRun.key)
      conjRun.items.push({ sentence: index, r: conj })
    else {
      flushConj()
      if (conj)
        conjRun = {
          key: conj.surface_form,
          items: [{ sentence: index, r: { start: conj.start, end: conj.end } }],
        }
    }
  })
  flushEnding()
  flushConj()

  issues.sort((a, b) => a.ranges[0].start - b.ranges[0].start)

  const letters = sentences.reduce((n, s) => n + s.letters, 0)
  const kanji = sentences.reduce((n, s) => n + s.kanji, 0)
  const total = sentences.reduce((n, s) => n + s.length, 0)
  const kanjiRatio = letters ? (kanji / letters) * 100 : 0
  const stats = {
    chars: charCount(text),
    sentences: sentences.length,
    averageLength: sentences.length ? total / sentences.length : 0,
    longest: sentences.reduce((n, s) => Math.max(n, s.length), 0),
    kanjiRatio,
  }

  return { sentences, issues, stats, score: scoreOf(issues, stats, settings) }
}

/**
 * 100 点から引いていく。文 1 つあたりの指摘の重さ（警告 1・注意 0.4）で最大 60 点、
 * 全体の漢字率が目安から外れた分（1% につき 1 点）で最大 10 点を引く
 */
function scoreOf(issues: Issue[], stats: Result['stats'], settings: Settings) {
  if (stats.sentences === 0) return 100
  const weight = issues.reduce((n, i) => n + (i.level === 'warn' ? 1 : 0.4), 0)
  const issuePenalty = Math.min(60, (60 * weight) / stats.sentences)
  const r = stats.kanjiRatio
  const off =
    r < settings.kanjiMin
      ? settings.kanjiMin - r
      : r > settings.kanjiMax
        ? r - settings.kanjiMax
        : 0
  return Math.max(0, Math.round(100 - issuePenalty - Math.min(10, off)))
}
