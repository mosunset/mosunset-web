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

/** R2 の画像キーから配信用の URL を作る。キーが空でないと分かっている（truthy で絞り込んだ）ときに使う */
export function imagePath(key: string) {
  return `/images/${key}`
}

/** R2 の画像キーから配信用の URL を作る。キーがない（空文字を含む）ときは null */
export function imageUrl(key: string | null | undefined) {
  return key ? imagePath(key) : null
}

/** 一覧用の小さい画像の長い辺（px）。一覧のカードの、画面の画素の 2 倍くらい */
export const THUMBNAIL_SIZE = 640

/** 一覧用の小さい画像の R2 のキー（元の画像のキーの前に thumbs/ を付ける） */
export const thumbnailKey = (key: string) => `thumbs/${key}`

/**
 * 一覧用の小さい画像の URL。キーがないときは null。
 * まだ作っていない画像は、配信するときに元の画像で代わりに返す（src/server/r2.ts）
 */
export function thumbnailUrl(key: string | null | undefined) {
  return key ? imagePath(thumbnailKey(key)) : null
}
