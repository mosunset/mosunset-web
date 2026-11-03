/** アップロード前に縮小する長い辺の最大値（px） */
const MAX_SIZE = 2000
const QUALITY = 0.85

/**
 * ブラウザで画像を縮小して WebP にする。
 * - GIF はアニメーションが消えるのでそのまま
 * - 変換しても小さくならないときは元のファイルを使う
 */
export async function resizeImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // ブラウザが読めない形式（HEIC など）はそのまま送り、サーバー側の検証に任せる
    return file
  }

  const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height))
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
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  )
  if (!blob || (scale === 1 && blob.size >= file.size)) return file

  const name = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${name}.webp`, { type: 'image/webp' })
}

/** ドラッグ＆ドロップや貼り付けから画像ファイルだけを取り出す */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files).filter((f) => f.type.startsWith('image/'))
}
