import { createServerFn } from '@tanstack/react-start'

import { adminMiddleware } from '@/functions/auth'
import { imageExtensions } from '@/lib/images'
import { MAX_IMAGE_BYTES, validateImageBytes } from '@/server/images'
import { putImage } from '@/server/r2'

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
    if (file.size > MAX_IMAGE_BYTES) throw new Error('画像は 10MB までです')
    if (!/^[a-z0-9-]+$/.test(folder)) throw new Error('保存先が不正です')
    return { file, folder }
  })
  .handler(async ({ data }) => {
    const body = await data.file.arrayBuffer()
    const invalid = validateImageBytes(body, data.file.type)
    if (invalid) throw new Error(invalid)
    const key = await putImage(data.folder, body, data.file.type)
    return { key }
  })
