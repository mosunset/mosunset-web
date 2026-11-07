import { createServerFn } from '@tanstack/react-start'

import { imageExtensions } from '@/lib/images'
import { adminMiddleware } from '@/server/auth'
import { putImage } from '@/server/r2'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * ファイルの先頭のバイトが、申告された画像の形式と合っているか。
 * ブラウザが付ける種類（file.type）は書き換えられるので、中身でも確かめる
 */
function matchesSignature(bytes: Uint8Array, type: string) {
  const starts = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b)
  const ascii = (text: string, offset = 0) =>
    starts(
      [...text].map((c) => c.charCodeAt(0)),
      offset,
    )

  switch (type) {
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff])
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return ascii('GIF87a') || ascii('GIF89a')
    case 'image/webp':
      return ascii('RIFF') && ascii('WEBP', 8)
    case 'image/avif':
      return ascii('ftyp', 4) && (ascii('avif', 8) || ascii('avis', 8))
    default:
      return false
  }
}

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
