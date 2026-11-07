import { env } from 'cloudflare:workers'

import { IMAGE_KEY_PATTERN, imageExtensions } from '@/lib/images'
import { collectImageKeys, type RichTextDoc } from '@/lib/tiptap'

// サーバー側の処理（server function の handler の中など）からだけ使う。
// 画面のコンポーネントから import されるファイルに置くと、ブラウザ用のバンドルに cloudflare:workers が入ってしまう

/**
 * R2 に保存した画像を返す（/images/$ から呼ぶ）。
 * キーは推測しにくい UUID で、中身は変わらないので長くキャッシュする
 */
export async function imageResponse(key: string) {
  if (!IMAGE_KEY_PATTERN.test(key)) {
    return new Response('Not Found', { status: 404 })
  }

  const object = await env.IMAGES.get(key)
  if (!object) return new Response('Not Found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('x-content-type-options', 'nosniff')
  // 画像を直接開いたときにスクリプトなどが動かないようにする
  headers.set('content-security-policy', "default-src 'none'; sandbox")
  return new Response(object.body, { headers })
}

/** 画像を R2 に保存してキーを返す。種類は呼び出し側で確かめておく */
export async function putImage(
  folder: string,
  body: ArrayBuffer,
  contentType: string,
) {
  const ext = imageExtensions[contentType]
  if (!ext) throw new Error('保存できない画像の種類です')
  const key = `${folder}/${crypto.randomUUID()}.${ext}`
  await env.IMAGES.put(key, body, { httpMetadata: { contentType } })
  return key
}

/** R2 から画像をまとめて消す */
async function deleteImages(keys: (string | null | undefined)[]) {
  const targets = [...new Set(keys.filter((k): k is string => !!k))]
  if (targets.length > 0) await env.IMAGES.delete(targets)
}

/** 表紙などの画像と、本文の中で使っている画像をまとめて消す */
export async function deleteImagesOf(
  key: string | null | undefined,
  doc: RichTextDoc | null | undefined,
) {
  await deleteImages([key, ...collectImageKeys(doc)])
}

/** 画像を差し替えた・外したときに、古い画像を消す */
export async function deleteReplacedImage(
  oldKey: string | null | undefined,
  newKey: string | null | undefined,
) {
  if (oldKey && oldKey !== newKey) await deleteImages([oldKey])
}
