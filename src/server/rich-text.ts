import { renderToHTMLString } from '@tiptap/static-renderer'

import {
  allowedLinkProtocols,
  type RichTextDoc,
  richTextExtensions,
} from '@/lib/tiptap'

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

/** javascript: などの危険なリンクを取り除く（保存前と表示前の両方で通す） */
export function sanitizeDoc(node: RichTextDoc): RichTextDoc {
  return {
    ...node,
    marks: node.marks?.filter(
      (mark) => mark.type !== 'link' || isAllowedHref(mark.attrs?.href),
    ),
    content: node.content?.map(sanitizeDoc),
  }
}

/** Tiptap の JSON を HTML 文字列にする（サーバー側だけで使う） */
export function renderRichText(doc: RichTextDoc) {
  return renderToHTMLString({
    extensions: richTextExtensions,
    content: sanitizeDoc(doc),
  })
}
