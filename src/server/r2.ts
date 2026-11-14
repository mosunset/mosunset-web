import { env } from 'cloudflare:workers'

import { IMAGE_KEY_PATTERN, imageExtensions, thumbnailKey } from '@/lib/images'
import { collectImageKeys, type RichTextDoc } from '@/lib/tiptap'

// サーバー側の処理（server function の handler の中など）からだけ使う。
// 画面のコンポーネントから import されるファイルに置くと、ブラウザ用のバンドルに cloudflare:workers が入ってしまう

/**
 * R2 に保存した画像を返す（/images/$ から呼ぶ）。
 * キーは推測しにくい UUID で、中身は変わらないので長くキャッシュする。
 * thumbs/<キー> は一覧用の小さい画像で、まだ作っていなければ元の画像を返す
 * （あとで作ったときに入れ替わるよう、そのときはキャッシュを短くする）
 */
export async function imageResponse(path: string) {
  const original = path.startsWith('thumbs/')
    ? path.slice('thumbs/'.length)
    : null
  const key = original ?? path
  if (!IMAGE_KEY_PATTERN.test(key)) {
    return new Response('Not Found', { status: 404 })
  }

  const thumbnail = original ? await env.IMAGES.get(path) : null
  const object = thumbnail ?? (await env.IMAGES.get(key))
  if (!object) return new Response('Not Found', { status: 404 })
  const substitute = original !== null && !thumbnail

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set(
    'cache-control',
    substitute ? 'public, max-age=3600' : 'public, max-age=31536000, immutable',
  )
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

/** 一覧用の小さい画像を、元の画像のキーに対応する場所に保存する。種類は呼び出し側で確かめておく */
export async function putThumbnail(
  key: string,
  body: ArrayBuffer,
  contentType: string,
) {
  await env.IMAGES.put(thumbnailKey(key), body, {
    httpMetadata: { contentType },
  })
}

/** 元の画像が R2 にあるか */
export async function imageExists(key: string) {
  return (await env.IMAGES.head(key)) !== null
}

/** 一覧用の小さい画像がまだない画像のキー */
export async function keysWithoutThumbnail(keys: readonly string[]) {
  const heads = await Promise.all(
    keys.map((key) => env.IMAGES.head(thumbnailKey(key))),
  )
  return keys.filter((_, i) => heads[i] === null)
}

/** R2 から画像をまとめて消す（一覧用の小さい画像も一緒に） */
async function deleteImages(keys: (string | null | undefined)[]) {
  const targets = [...new Set(keys.filter((k): k is string => !!k))]
  if (targets.length > 0) {
    await env.IMAGES.delete([...targets, ...targets.map(thumbnailKey)])
  }
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
