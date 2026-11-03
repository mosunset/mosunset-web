import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'

import { adminMiddleware } from '@/server/auth'

const MAX_BYTES = 10 * 1024 * 1024

const allowedTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** 画像を R2 にアップロードしてキーを返す（管理者のみ） */
export const uploadImage = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('ファイルを送ってください')
    const file = data.get('file')
    const folder = String(data.get('folder') ?? 'uploads')
    if (!(file instanceof File)) throw new Error('ファイルを選んでください')
    if (!allowedTypes[file.type]) {
      throw new Error('JPEG / PNG / WebP / GIF / AVIF の画像を選んでください')
    }
    if (file.size > MAX_BYTES) throw new Error('画像は 10MB までです')
    if (!/^[a-z0-9-]+$/.test(folder)) throw new Error('保存先が不正です')
    return { file, folder }
  })
  .handler(async ({ data }) => {
    const key = `${data.folder}/${crypto.randomUUID()}.${allowedTypes[data.file.type]}`
    await env.IMAGES.put(key, await data.file.arrayBuffer(), {
      httpMetadata: { contentType: data.file.type },
    })
    return { key }
  })
