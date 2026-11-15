/** ファイル選択で受け付ける画像の形式 */
export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif'

/** アップロード前に縮小する長い辺の最大値（px） */
const MAX_SIZE = 2000
const QUALITY = 0.85

/**
 * ブラウザで画像を縮小して WebP にする。
 * - 必ず書き出し直す。元のファイルには撮った場所（GPS）・日時・機種などが入っていることがあるので、
 *   小さくならなくても、元のファイルはそのまま送らない（サーバーでも src/server/image-metadata.ts で消す）
 * - GIF はアニメーションが消えるのでそのまま（GIF には撮影の情報を入れる場所がない）
 * - WebP に書き出せないブラウザでは、ブラウザが書き出した形式（PNG など）になる
 * - 読めない形式（HEIC など）や書き出しに失敗したときは、送らずにエラーにする
 * @param maxSize 長い辺の最大値（px）。一覧用の小さい画像を作るときは THUMBNAIL_SIZE
 */
export async function resizeImage(
  file: File,
  options: { maxSize?: number; quality?: number } = {},
): Promise<File> {
  return (await resizeImageWithSize(file, options)).file
}

/** 書き出した画像と、その幅・高さ（px）。GIF で大きさが読めなかったときは null */
export type ResizedImage = {
  file: File
  width: number | null
  height: number | null
}

/**
 * resizeImage と同じことをして、書き出した画像の幅・高さも返す。
 * 本文に入れる画像は幅と高さを書いておくと、読み込む前から場所が取られ、表示がずれない
 */
export async function resizeImageWithSize(
  file: File,
  { maxSize = MAX_SIZE, quality = QUALITY } = {},
): Promise<ResizedImage> {
  if (file.type === 'image/gif') {
    try {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return { file, ...size }
    } catch {
      return { file, width: null, height: null }
    }
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('画像のファイルを選んでください')
  }

  let bitmap: ImageBitmap
  try {
    // 写真の向き（Exif の Orientation）を反映してから描く
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      'この画像は読み込めませんでした。JPEG・PNG・WebP にしてから選んでください',
    )
  }

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('画像を書き出せませんでした')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!blob) throw new Error('画像を書き出せませんでした')

  const name = file.name.replace(/\.[^.]+$/, '') || 'image'
  const ext = blob.type.replace('image/', '').replace('jpeg', 'jpg')
  return {
    file: new File([blob], `${name}.${ext}`, { type: blob.type }),
    width,
    height,
  }
}

/** ドラッグ＆ドロップや貼り付けから画像ファイルだけを取り出す */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files).filter((f) => f.type.startsWith('image/'))
}
