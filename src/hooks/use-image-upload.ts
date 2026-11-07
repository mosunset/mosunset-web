import { useServerFn } from '@tanstack/react-start'

import { resizeImage } from '@/lib/image-resize'
import { uploadImage } from '@/server/images'

/**
 * 画像を縮小してから R2 の folder にアップロードし、保存先のキーを返す関数を作る。
 * 失敗したときは例外をそのまま投げるので、呼ぶ側で知らせ方を決める
 */
export function useImageUpload(folder: string) {
  const upload = useServerFn(uploadImage)

  return async (file: File): Promise<string> => {
    const resized = await resizeImage(file)
    const form = new FormData()
    form.set('file', resized)
    form.set('folder', folder)
    const { key } = await upload({ data: form })
    return key
  }
}
