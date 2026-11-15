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

/**
 * 一覧の写真の読み込み方。先頭から eager 枚はすぐ読み、ほかは近づいてから読む（lazy）。
 * 先頭の 1 枚はページでいちばん大きく出るもの（LCP）になりやすいので、優先して読む。
 * すぐ読む枚数を増やすと、JS や先頭の 1 枚と回線を取り合って、かえって遅くなるので、スマホでの 1 行目までにする
 */
export function listImageLoading(index: number, eager: number) {
  return {
    loading: index < eager ? ('eager' as const) : ('lazy' as const),
    fetchPriority: index === 0 && eager > 0 ? ('high' as const) : undefined,
  }
}

/**
 * 詳しいページなどで大きく出す写真の srcset。スマホには一覧用の小さい画像（長い辺 640px）、
 * 広い画面には元の画像を選ばせる（元の画像の幅はわからないので、上限の 2000px として書く）
 */
export function imageSrcSet(key: string) {
  return `${imagePath(thumbnailKey(key))} ${THUMBNAIL_SIZE}w, ${imagePath(key)} 2000w`
}
