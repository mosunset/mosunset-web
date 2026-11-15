import { renderToHTMLString } from '@tiptap/static-renderer'
import { z } from 'zod'

import { IMAGE_KEY_PATTERN } from '@/lib/images'
import {
  allowedLinkProtocols,
  type RichTextDoc,
  richTextExtensions,
} from '@/lib/tiptap'

/** 送られてきた Tiptap の JSON。中身の細かい形は sanitizeDoc で整える */
export const richTextDocSchema = z.looseObject({ type: z.literal('doc') })

function isAllowedHref(href: unknown) {
  if (typeof href !== 'string') return false
  // サイト内リンク（/blog など）は許可
  if (href.startsWith('/') && !href.startsWith('//')) return true
  try {
    const protocol = new URL(href).protocol.replace(/:$/, '')
    return (allowedLinkProtocols as readonly string[]).includes(protocol)
  } catch {
    return false
  }
}

/** 画像は自分の R2（/images/〜）か https の画像だけ許可する */
function isAllowedImageSrc(src: unknown) {
  if (typeof src !== 'string') return false
  if (
    src.startsWith('/images/') &&
    IMAGE_KEY_PATTERN.test(src.slice('/images/'.length))
  ) {
    return true
  }
  try {
    return new URL(src).protocol === 'https:'
  } catch {
    return false
  }
}

/** javascript: などの危険なリンクや画像を取り除く（保存前と表示前の両方で通す） */
export function sanitizeDoc(node: RichTextDoc): RichTextDoc {
  return {
    ...node,
    marks: node.marks?.filter(
      (mark) => mark.type !== 'link' || isAllowedHref(mark.attrs?.href),
    ),
    content: node.content
      ?.filter(
        (child) =>
          child.type !== 'image' || isAllowedImageSrc(child.attrs?.src),
      )
      .map(sanitizeDoc),
  }
}

/** Tiptap の JSON を HTML 文字列にする（サーバー側だけで使う） */
export function renderRichText(doc: RichTextDoc) {
  return renderToHTMLString({
    extensions: richTextExtensions,
    content: sanitizeDoc(doc),
  })
}

/** 太字やリンクなど、文の途中に入るタグ */
const INLINE_TAG = /<\/?(?:strong|em|b|i|u|s|a|code|span|mark)\b[^>]*>/g

/** 本文の HTML から、description に使える短いプレーンテキストを作る */
export function htmlToSummary(html: string, max = 120) {
  const text = html
    // 文中のタグは詰め、段落や箇条書きの区切りは空白にする
    .replace(INLINE_TAG, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ---------------------------------------------------------------------------
// 記事の見出し（目次とリンク）と、読む時間の目安
// ---------------------------------------------------------------------------

/** 目次の 1 行 */
export type TocItem = { level: 2 | 3; id: string; text: string }

/** HTML の文字参照を戻す（見出しの文字を目次に出すため） */
function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 見出しの文字から id を作る（日本語はそのまま。空白は -、記号は取り除く） */
function headingId(text: string, used: Set<string>) {
  const base =
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s　]+/g, '-')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'section'
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

/**
 * 本文の HTML の h2・h3 に id と「#」のリンクを付け、目次を作る。
 * h4 は目次に入れず、id だけ付ける
 */
export function withHeadingAnchors(html: string): {
  html: string
  toc: TocItem[]
} {
  const used = new Set<string>()
  const toc: TocItem[] = []
  const out = html.replace(
    /<h([234])>([\s\S]*?)<\/h\1>/g,
    (_, level: string, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim()
      const id = headingId(text, used)
      if (level !== '4') toc.push({ level: Number(level) as 2 | 3, id, text })
      return `<h${level} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="この見出しへのリンク">#</a></h${level}>`
    },
  )
  return { html: out, toc }
}

/** 本文の文字数（コードは読む速さが違うので半分に数える） */
function countReadingChars(node: RichTextDoc, inCode = false): number {
  const code = inCode || node.type === 'codeBlock'
  const own = typeof node.text === 'string' ? node.text.length : 0
  const children = (node.content ?? []).reduce(
    (sum, child) => sum + countReadingChars(child, code),
    0,
  )
  return (code ? own / 2 : own) + children
}

/** 読む時間の目安（分）。日本語は 1 分に 500 字くらいで数える */
export function readingMinutes(doc: RichTextDoc) {
  return Math.max(1, Math.round(countReadingChars(doc) / 500))
}

/**
 * コードの塊に、上の帯（言語名と「コピー」のボタン）を付ける。
 * ボタンの動きは RichTextContent（src/components/image-viewer.tsx）がまとめて受け取る
 */
export function withCodeBlockToolbar(html: string) {
  return html
    .replace(
      /<pre><code(?: class="language-([\w+#.-]+)")?>/g,
      (_, lang: string | undefined) =>
        `<div class="code-block"><div class="code-block-bar"><span class="code-block-lang">${lang ?? ''}</span><button type="button" class="code-block-copy" data-copy-code aria-label="コードをコピー">コピー</button></div><pre><code${lang ? ` class="language-${lang}"` : ''}>`,
    )
    .replace(/<\/code><\/pre>/g, '</code></pre></div>')
}
