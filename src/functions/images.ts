import { createServerFn } from '@tanstack/react-start'
import { isNotNull } from 'drizzle-orm'

import { adminMiddleware } from '@/functions/auth'
import { IMAGE_KEY_PATTERN, imageExtensions } from '@/lib/images'
import { getDb, schema } from '@/server/db'
import { MAX_IMAGE_BYTES, validateImageBytes } from '@/server/images'
import {
  imageExists,
  keysWithoutThumbnail,
  putImage,
  putThumbnail,
} from '@/server/r2'

/** 送られてきた画像ファイルを確かめる（種類と大きさ） */
function checkImageFile(file: unknown, label = 'ファイル') {
  if (!(file instanceof File)) throw new Error(`${label}を選んでください`)
  if (!imageExtensions[file.type]) {
    throw new Error('JPEG / PNG / WebP / GIF / AVIF の画像を選んでください')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('画像は 10MB までです')
  return file
}

/** 画像の中身を読み、先頭のバイトでも種類を確かめる */
async function readImage(file: File) {
  const body = await file.arrayBuffer()
  const invalid = validateImageBytes(body, file.type)
  if (invalid) throw new Error(invalid)
  return body
}

/**
 * 画像を R2 にアップロードしてキーを返す（管理者のみ）。
 * thumb も送られてきたら、一覧用の小さい画像として一緒に保存する
 */
export const uploadImage = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('ファイルを送ってください')
    const file = checkImageFile(data.get('file'))
    const thumb = data.get('thumb')
    const folder = String(data.get('folder') ?? 'uploads')
    // thumbs/ は一覧用の小さい画像の置き場なので使わせない
    if (!/^[a-z0-9-]+$/.test(folder) || folder === 'thumbs') {
      throw new Error('保存先が不正です')
    }
    return {
      file,
      thumb: thumb ? checkImageFile(thumb, '小さい画像') : null,
      folder,
    }
  })
  .handler(async ({ data }) => {
    const body = await readImage(data.file)
    const thumb = data.thumb ? await readImage(data.thumb) : null
    const key = await putImage(data.folder, body, data.file.type)
    if (thumb && data.thumb) await putThumbnail(key, thumb, data.thumb.type)
    return { key }
  })

/** 一覧に出す画像（コレクションの写真・記事の表紙）のうち、一覧用の小さい画像がまだないもの（管理者のみ） */
export const listImagesWithoutThumbnail = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const db = getDb()
    const { collectionItems, posts } = schema
    const [items, covers] = await Promise.all([
      db
        .select({ key: collectionItems.imageKey })
        .from(collectionItems)
        .where(isNotNull(collectionItems.imageKey)),
      db
        .select({ key: posts.coverImageKey })
        .from(posts)
        .where(isNotNull(posts.coverImageKey)),
    ])
    const keys = [
      ...new Set(
        [...items, ...covers]
          .map((row) => row.key)
          .filter((key): key is string => !!key && IMAGE_KEY_PATTERN.test(key)),
      ),
    ]
    return { total: keys.length, missing: await keysWithoutThumbnail(keys) }
  })

/** 今ある画像の、一覧用の小さい画像を保存する（管理者のみ。ブラウザで縮小して送る） */
export const uploadThumbnail = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('ファイルを送ってください')
    const key = String(data.get('key') ?? '')
    if (!IMAGE_KEY_PATTERN.test(key)) throw new Error('画像のキーが不正です')
    return { key, file: checkImageFile(data.get('file')) }
  })
  .handler(async ({ data }) => {
    // 元の画像がないものの小さい画像だけが残らないように
    if (!(await imageExists(data.key))) throw new Error('元の画像がありません')
    const body = await readImage(data.file)
    await putThumbnail(data.key, body, data.file.type)
    return { ok: true }
  })
