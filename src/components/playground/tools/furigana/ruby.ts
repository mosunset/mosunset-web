import type { Token } from '@/components/playground/tools/kuromoji'
import { kataToHira } from '@/components/playground/tools/kuromoji'

import { gradeKanji, secondaryJoyoKanji } from './kanji-grades'

/** 漢字のように読みを付ける文字（々・〆・ヶ も含める） */
const KANJI = /[\p{Script=Han}々〆ヶ]/u
/** 学年を調べないおどり字など（これだけでルビの有無を決めない） */
const MARKS = /[々〆ヶ]/u

export const hasKanji = (s: string) => KANJI.test(s)

/**
 * 漢字ごとの「習う時期」。1〜6 は小学校の学年、7 は中学校以降の常用漢字、8 は常用外。
 */
const levelMap = new Map<string, number>()
gradeKanji.forEach((chars, i) => {
  for (const c of chars) levelMap.set(c, i + 1)
})
for (const c of secondaryJoyoKanji) levelMap.set(c, 7)

const kanjiLevel = (c: string) => levelMap.get(c) ?? 8

/** 文字列の中でいちばん難しい漢字の段階（おどり字だけなら 0） */
export function textLevel(s: string) {
  let max = 0
  for (const c of s) {
    if (KANJI.test(c) && !MARKS.test(c)) max = Math.max(max, kanjiLevel(c))
  }
  return max
}

/** ルビを付ける・付けない単位。reading があるのは漢字のかたまり */
export type Part = { text: string; reading?: string }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 語の表記と読みを突き合わせて、送り仮名をルビから外す。
 * 「食べる」+「たべる」→ [食(た)][べる]。合わないときは語全体に読みを付ける
 */
export function alignReading(surface: string, reading: string): Part[] {
  const runs: { text: string; kanji: boolean }[] = []
  for (const c of surface) {
    const kanji = KANJI.test(c)
    const last = runs.at(-1)
    if (last && last.kanji === kanji) last.text += c
    else runs.push({ text: c, kanji })
  }
  if (!runs.some((r) => r.kanji)) return [{ text: surface }]

  const pattern = runs
    .map((r) => (r.kanji ? '(.+?)' : escapeRegExp(kataToHira(r.text))))
    .join('')
  const m = new RegExp(`^${pattern}$`, 'u').exec(reading)
  if (!m) return [{ text: surface, reading }]

  let g = 1
  return runs.map((r) =>
    r.kanji ? { text: r.text, reading: m[g++] } : { text: r.text },
  )
}

/** 文章の 1 区切り（kuromoji の 1 語、または語のすき間の文字） */
export type Segment = {
  /** 読みを手で直したときに使う鍵（表記と元の読みの組。同じ語はまとめて直る） */
  key: string
  surface: string
  /** 辞書の読み（ひらがな）。辞書にない語は null */
  dictReading: string | null
  /** 今使っている読み（手で直したものを優先） */
  reading: string | null
  edited: boolean
  kanji: boolean
  parts: Part[]
}

export function buildSegments(
  text: string,
  tokens: Token[],
  overrides: Record<string, string>,
): Segment[] {
  const segs: Segment[] = []
  const plain = (s: string) => {
    if (s)
      segs.push({
        key: '',
        surface: s,
        dictReading: null,
        reading: null,
        edited: false,
        kanji: false,
        parts: [{ text: s }],
      })
  }
  let pos = 0
  for (const t of tokens) {
    const start = t.word_position - 1
    if (start > pos) plain(text.slice(pos, start))
    const surface = t.surface_form
    pos = start + surface.length
    if (!hasKanji(surface)) {
      plain(surface)
      continue
    }
    const dictReading =
      t.reading && t.reading !== '*' ? kataToHira(t.reading) : null
    const key = `${surface}\u0000${dictReading ?? ''}`
    const override = overrides[key]
    const reading =
      override !== undefined ? kataToHira(override.trim()) : dictReading
    segs.push({
      key,
      surface,
      dictReading,
      reading: reading || null,
      edited: override !== undefined,
      kanji: true,
      parts: reading ? alignReading(surface, reading) : [{ text: surface }],
    })
  }
  if (pos < text.length) plain(text.slice(pos))
  return segs
}

/** 漢字のかたまりにルビを付けるか（minLevel 以上の漢字を含むときだけ付ける） */
export const showRuby = (p: Part, minLevel: number) =>
  !!p.reading && textLevel(p.text) >= minLevel

export type OutputFormat = 'html' | 'paren' | 'aozora'

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )

export function formatOutput(
  segs: Segment[],
  minLevel: number,
  format: OutputFormat,
): string {
  let out = ''
  for (const s of segs) {
    for (const p of s.parts) {
      const ruby = showRuby(p, minLevel) ? p.reading : undefined
      if (format === 'html') {
        out += ruby
          ? `<ruby>${escapeHtml(p.text)}<rp>(</rp><rt>${escapeHtml(ruby)}</rt><rp>)</rp></ruby>`
          : escapeHtml(p.text).replace(/\r?\n/g, '<br>\n')
      } else if (format === 'paren') {
        out += ruby ? `${p.text}(${ruby})` : p.text
      } else {
        out += ruby ? `｜${p.text}《${ruby}》` : p.text
      }
    }
  }
  return out
}
