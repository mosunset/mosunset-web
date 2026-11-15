import { useServerFn } from '@tanstack/react-start'
import { uploadImage, uploadThumbnail } from '@/functions/images'
import { resizeImage, resizeImageWithSize } from '@/lib/image-resize'
import { imagePath, THUMBNAIL_SIZE } from '@/lib/images'

/** アップロードした画像の保存先のキーと、幅・高さ（px。分からなければ null） */
export type UploadedImage = {
  key: string
  width: number | null
  height: number | null
}

/**
 * 画像を縮小してから R2 の folder にアップロードし、保存先のキーと大きさを返す関数を作る。
 * thumbnail なら、一覧用の小さい画像も作って一緒に送る（コレクションの写真・記事の表紙）。
 * 失敗したときは例外をそのまま投げるので、呼ぶ側で知らせ方を決める
 */
export function useImageUpload(folder: string, { thumbnail = false } = {}) {
  const upload = useServerFn(uploadImage)

  return async (file: File): Promise<UploadedImage> => {
    const resized = await resizeImageWithSize(file)
    const form = new FormData()
    form.set('file', resized.file)
    form.set('folder', folder)
    if (thumbnail) {
      const thumb = await resizeImage(file, { maxSize: THUMBNAIL_SIZE })
      // 縮めても小さくならない（もともと小さい・GIF など）ときは、送る画像と同じものにする
      form.set('thumb', thumb.size < resized.file.size ? thumb : resized.file)
    }
    const { key } = await upload({ data: form })
    return { key, width: resized.width, height: resized.height }
  }
}

/**
 * R2 に保存済みの画像の、一覧用の小さい画像を作って送る関数を作る。
 * 元の画像をブラウザで読み込んで縮める（ISBN で取ってきた表紙や、前にアップロードした画像のぶん）。
 * 縮めても小さくならないものも、書き出し直したものを使う（元の画像の位置情報などを残さないため。GIF はそのまま）
 */
export function useThumbnailMaker() {
  const upload = useServerFn(uploadThumbnail)

  return async (key: string) => {
    const res = await fetch(imagePath(key))
    if (!res.ok) throw new Error(`画像を読めませんでした（${res.status}）`)
    const blob = await res.blob()
    const file = new File([blob], key.split('/').pop() ?? 'image', {
      type: blob.type,
    })
    const thumb = await resizeImage(file, { maxSize: THUMBNAIL_SIZE })
    const form = new FormData()
    form.set('key', key)
    form.set('file', thumb)
    await upload({ data: form })
  }
}
