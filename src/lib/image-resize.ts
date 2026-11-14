/** ファイル選択で受け付ける画像の形式 */
export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif'

/** アップロード前に縮小する長い辺の最大値（px） */
const MAX_SIZE = 2000
const QUALITY = 0.85

/**
 * ブラウザで画像を縮小して WebP にする。
 * - GIF はアニメーションが消えるのでそのまま
 * - 変換しても小さくならないときは元のファイルを使う
 * - WebP に書き出せないブラウザでは、ブラウザが書き出した形式（PNG など）になる
 * @param maxSize 長い辺の最大値（px）。一覧用の小さい画像を作るときは THUMBNAIL_SIZE
 */
export async function resizeImage(
  file: File,
  { maxSize = MAX_SIZE, quality = QUALITY } = {},
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // ブラウザが読めない形式（HEIC など）はそのまま送り、サーバー側の検証に任せる
    return file
  }

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!blob || (scale === 1 && blob.size >= file.size)) return file

  const name = file.name.replace(/\.[^.]+$/, '') || 'image'
  const ext = blob.type.replace('image/', '').replace('jpeg', 'jpg')
  return new File([blob], `${name}.${ext}`, { type: blob.type })
}

/** ドラッグ＆ドロップや貼り付けから画像ファイルだけを取り出す */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files).filter((f) => f.type.startsWith('image/'))
}
