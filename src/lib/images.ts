/** R2 の画像キー（<フォルダ>/<UUID>.<拡張子>）の形 */
export const IMAGE_KEY_PATTERN =
  /^[a-z0-9-]+\/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/

/** アップロードを受け付ける画像の種類と、保存するときの拡張子 */
export const imageExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/**
 * R2 の画像キーから配信用の URL を作る。
 * キーが空でないと分かっている（truthy で絞り込んだ）文字列なら string を返す型にしてある
 */
export function imageUrl(key: string): string
export function imageUrl(key: string | null | undefined): string | null
export function imageUrl(key: string | null | undefined) {
  return key ? `/images/${key}` : null
}
