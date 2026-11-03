import Image from '@tiptap/extension-image'
import type { JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export type RichTextDoc = JSONContent

/** リンクとして許可するプロトコル */
export const allowedLinkProtocols = ['http', 'https', 'mailto'] as const

/**
 * エディタとサーバー側の HTML 変換で共通して使う拡張。
 * ここを変えると保存済みの記事の表示にも影響する。
 */
export const richTextExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: [...allowedLinkProtocols],
    },
  }),
  Image.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { loading: 'lazy', decoding: 'async' },
  }),
]

export const emptyDoc: RichTextDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

/** 本文の中で使っている R2 の画像キー（/images/〜） */
export function collectImageKeys(
  node: RichTextDoc | null | undefined,
): string[] {
  if (!node) return []
  const own =
    node.type === 'image' &&
    typeof node.attrs?.src === 'string' &&
    node.attrs.src.startsWith('/images/')
      ? [node.attrs.src.slice('/images/'.length)]
      : []
  return [...own, ...(node.content ?? []).flatMap(collectImageKeys)]
}
