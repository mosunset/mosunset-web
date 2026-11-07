import { createServerFn } from '@tanstack/react-start'

import { adminMiddleware } from '@/functions/auth'
import { imageExtensions } from '@/lib/images'
import { matchesSignature } from '@/server/images'
import { putImage } from '@/server/r2'

const MAX_BYTES = 10 * 1024 * 1024

/** 画像を R2 にアップロードしてキーを返す（管理者のみ） */
export const uploadImage = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('ファイルを送ってください')
    const file = data.get('file')
    const folder = String(data.get('folder') ?? 'uploads')
    if (!(file instanceof File)) throw new Error('ファイルを選んでください')
    if (!imageExtensions[file.type]) {
      throw new Error('JPEG / PNG / WebP / GIF / AVIF の画像を選んでください')
    }
    if (file.size > MAX_BYTES) throw new Error('画像は 10MB までです')
    if (!/^[a-z0-9-]+$/.test(folder)) throw new Error('保存先が不正です')
    return { file, folder }
  })
  .handler(async ({ data }) => {
    const body = await data.file.arrayBuffer()
    if (
      !matchesSignature(
        new Uint8Array(body, 0, Math.min(16, body.byteLength)),
        data.file.type,
      )
    ) {
      throw new Error('画像として読み込めないファイルです')
    }
    const key = await putImage(data.folder, body, data.file.type)
    return { key }
  })
