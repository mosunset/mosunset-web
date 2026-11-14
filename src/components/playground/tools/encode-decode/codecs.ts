/**
 * エンコード・デコードの処理（画面から切り離した純粋な関数）。
 * デコードできないときは DecodeError を投げ、message をそのまま画面に出す
 */
import { encodeShiftJis, shiftJisSupported } from './shift-jis'

export class DecodeError extends Error {}

export type Charset = 'utf-8' | 'shift_jis'

export const charsetLabel: Record<Charset, string> = {
  'utf-8': 'UTF-8',
  shift_jis: 'Shift_JIS',
}

// ---- 文字コード ----

export function textToBytes(text: string, charset: Charset) {
  if (charset === 'utf-8')
    return { bytes: new TextEncoder().encode(text), unmappable: [] as string[] }
  if (!shiftJisSupported())
    throw new DecodeError('このブラウザは Shift_JIS に対応していません')
  return encodeShiftJis(text)
}

/** バイト列を文字にする。その文字コードとして読めないときは null */
export function bytesToText(bytes: Uint8Array, charset: Charset) {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** 「(5 文字目)」のような位置の表示。position は 0 始まり */
function at(position: number) {
  return `（${position + 1} 文字目）`
}

/** 1 文字を見やすく表示する（空白や制御文字はコードで出す） */
function show(ch: string) {
  const code = ch.codePointAt(0) ?? 0
  if (code <= 0x20 || code === 0x7f)
    return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
  return `「${ch}」`
}

// ---- Base64 ----

export type Base64Options = { urlSafe: boolean; padding: boolean }

export function bytesToBase64(bytes: Uint8Array, opts: Base64Options) {
  // String.fromCharCode(...bytes) は大きいと落ちるので、少しずつつなぐ
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  let s = btoa(binary)
  if (opts.urlSafe) s = s.replace(/\+/g, '-').replace(/\//g, '_')
  if (!opts.padding) s = s.replace(/=+$/, '')
  return s
}

/**
 * Base64 をバイト列に戻す。標準・URL-safe のどちらも、パディングの有無も受け付け、
 * 空白・改行は無視する。data URL（data:image/png;base64,...）なら MIME タイプも返す
 */
export function base64ToBytes(input: string): {
  bytes: Uint8Array
  mime?: string
} {
  let s = input.trim()
  let mime: string | undefined
  const dataUrl = /^data:([^,]*?),/i.exec(s)
  if (dataUrl) {
    const params = dataUrl[1].split(';')
    if (!params.some((p) => p.toLowerCase() === 'base64'))
      throw new DecodeError(
        'Base64 ではない data URL です（「;base64,」が入っていません）',
      )
    mime = params[0] || undefined
    s = s.slice(dataUrl[0].length)
  }
  s = s.replace(/\s+/g, '')
  const bad = /[^A-Za-z0-9+/\-_=]/.exec(s)
  if (bad)
    throw new DecodeError(
      `Base64 に使えない文字 ${show(bad[0])} が入っています${at(bad.index)}`,
    )
  const pad = /=+$/.exec(s)
  const body = pad ? s.slice(0, pad.index) : s
  const midPad = body.indexOf('=')
  if (midPad >= 0)
    throw new DecodeError(
      `「=」（パディング）は最後にだけ付けられます${at(midPad)}`,
    )
  if (pad && pad[0].length > 2)
    throw new DecodeError('「=」（パディング）が多すぎます（最大 2 個）')
  if (body.length % 4 === 1)
    throw new DecodeError(
      '文字数が合いません。最後の 1 文字が余っているので、途中で切れているかもしれません',
    )
  const std = body.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(std + '='.repeat((4 - (std.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, mime }
}

// ---- URL エンコード ----

export type UrlOptions = {
  /** component: encodeURIComponent と同じ / uri: encodeURI と同じ（: / ? # などを残す） */
  mode: 'component' | 'uri'
  /** 空白を + にする（フォーム送信の形式） */
  plus: boolean
}

const componentSafe = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()",
)
const uriSafe = new Set([...componentSafe, ...';,/?:@&=+$#'])

function percent(b: number) {
  return `%${b.toString(16).toUpperCase().padStart(2, '0')}`
}

export function urlEncode(text: string, opts: UrlOptions, charset: Charset) {
  const { bytes, unmappable } = textToBytes(text, charset)
  const safe = opts.mode === 'uri' ? uriSafe : componentSafe
  let out = ''
  for (const b of bytes) {
    const ch = String.fromCharCode(b)
    if (b === 0x20 && opts.plus) out += '+'
    // + を空白の意味で使うときは、もとの + を %2B にしないと区別できない
    else if (b === 0x2b && opts.plus) out += '%2B'
    else if (b < 0x80 && safe.has(ch)) out += ch
    else out += percent(b)
  }
  return { text: out, unmappable }
}

export function urlDecode(input: string, opts: UrlOptions, charset: Charset) {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '%') {
      const hex = input.slice(i + 1, i + 3)
      if (!/^[0-9a-fA-F]{2}$/.test(hex))
        throw new DecodeError(
          `「%」のあとには 16 進数 2 けた（%E3 など）が必要です${at(i)}`,
        )
      bytes.push(Number.parseInt(hex, 16))
      i += 2
    } else if (ch === '+' && opts.plus) {
      bytes.push(0x20)
    } else {
      const code = input.codePointAt(i) ?? 0
      const c = String.fromCodePoint(code)
      if (c.length === 2) i++
      bytes.push(...textToBytes(c, charset).bytes)
    }
  }
  const text = bytesToText(Uint8Array.from(bytes), charset)
  if (text === null)
    throw new DecodeError(
      `%XX の並びを ${charsetLabel[charset]} の文字として読めませんでした。文字コードの選び方が合っているか確かめてください`,
    )
  return text
}

// ---- 16 進数 ----

export type HexOptions = { upper: boolean; separator: '' | ' ' }

export function bytesToHex(bytes: Uint8Array, opts: HexOptions) {
  const parts: string[] = []
  for (const b of bytes) parts.push(b.toString(16).padStart(2, '0'))
  const s = parts.join(opts.separator)
  return opts.upper ? s.toUpperCase() : s
}

/** 16 進数をバイト列にする。空白・改行・「:」「-」「,」と、0x・\x の前置きは無視する */
export function hexToBytes(input: string) {
  const s = input.replace(/0x|\\x/gi, '').replace(/[\s:,-]+/g, '')
  const bad = /[^0-9a-fA-F]/.exec(s)
  if (bad)
    throw new DecodeError(
      `16 進数に使えない文字 ${show(bad[0])} が入っています（使えるのは 0〜9 と A〜F）`,
    )
  if (s.length % 2 === 1)
    throw new DecodeError(
      `けた数が奇数（${s.length} けた）です。1 バイトは 2 けたなので、1 けた足りないか多いようです`,
    )
  const bytes = new Uint8Array(s.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// ---- HTML エンティティ ----

export type HtmlOptions = {
  /** basic: & < > " ' だけ / all: ASCII 以外の文字も数値文字参照にする */
  target: 'basic' | 'all'
  numeric: 'hex' | 'dec'
}

const htmlBasic: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function htmlEncode(text: string, opts: HtmlOptions) {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (htmlBasic[ch]) out += htmlBasic[ch]
    else if (opts.target === 'all' && code > 0x7e)
      out +=
        opts.numeric === 'hex'
          ? `&#x${code.toString(16).toUpperCase()};`
          : `&#${code};`
    else out += ch
  }
  return out
}

/**
 * HTML エンティティを文字に戻す。&nbsp; などの名前付きも読めるよう、ブラウザの HTML パーサーを使う。
 * textarea の中身はタグとして解釈されないので、スクリプトなどが動くことはない
 */
export function htmlDecode(input: string) {
  if (typeof document === 'undefined') return input
  const el = document.createElement('textarea')
  el.innerHTML = input
  return el.value
}

// ---- Unicode エスケープ ----

export type UnicodeOptions = {
  /** nonascii: ASCII 以外だけ / all: すべての文字 */
  target: 'nonascii' | 'all'
  /** u4: \uXXXX（絵文字などはサロゲートペア 2 つ） / brace: \u{XXXXX}（ES2015 以降） */
  style: 'u4' | 'brace'
}

export function unicodeEncode(text: string, opts: UnicodeOptions) {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (opts.target === 'nonascii' && code < 0x80) {
      out += ch
    } else if (opts.style === 'brace') {
      out += `\\u{${code.toString(16)}}`
    } else {
      for (let i = 0; i < ch.length; i++)
        out += `\\u${ch.charCodeAt(i).toString(16).padStart(4, '0')}`
    }
  }
  return out
}

/** \uXXXX・\u{XXXXX}・\xXX を文字に戻す。それ以外のバックスラッシュはそのまま残す */
export function unicodeDecode(input: string) {
  return input.replace(
    /\\u\{([^}]*)\}|\\u(.{0,4})|\\x(.{0,2})/g,
    (whole, brace: string | undefined, u4: string | undefined, x, offset) => {
      if (brace !== undefined) {
        if (!/^[0-9a-fA-F]{1,6}$/.test(brace))
          throw new DecodeError(
            `${whole} の { } の中は 16 進数 1〜6 けたにしてください${at(offset)}`,
          )
        const code = Number.parseInt(brace, 16)
        if (code > 0x10ffff)
          throw new DecodeError(
            `${whole} は Unicode の範囲（10FFFF まで）を超えています${at(offset)}`,
          )
        return String.fromCodePoint(code)
      }
      if (u4 !== undefined) {
        if (!/^[0-9a-fA-F]{4}$/.test(u4))
          throw new DecodeError(
            `\\u のあとには 16 進数 4 けた（\\u3042 など）が必要です${at(offset)}`,
          )
        return String.fromCharCode(Number.parseInt(u4, 16))
      }
      if (!/^[0-9a-fA-F]{2}$/.test(x))
        throw new DecodeError(
          `\\x のあとには 16 進数 2 けた（\\x41 など）が必要です${at(offset)}`,
        )
      return String.fromCharCode(Number.parseInt(x, 16))
    },
  )
}

// ---- 画像の判定 ----

/** バイト列の先頭を見て、画像なら MIME タイプを返す */
export function detectImageMime(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to))
  if (b(0) === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12)))
    return 'image/avif'
  if (ascii(0, 2) === 'BM') return 'image/bmp'
  if (b(0) === 0 && b(1) === 0 && b(2) === 1 && b(3) === 0)
    return 'image/x-icon'
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 1024))
    .replace(/^﻿/, '')
    .trimStart()
  if (
    /^<svg[\s>]/i.test(head) ||
    (/^<\?xml/i.test(head) && /<svg[\s>]/i.test(head))
  )
    return 'image/svg+xml'
  return null
}

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/svg+xml': 'svg',
}

export function extensionFor(mime: string | undefined) {
  return (mime && extensions[mime]) ?? 'bin'
}
