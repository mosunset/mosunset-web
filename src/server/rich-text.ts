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
