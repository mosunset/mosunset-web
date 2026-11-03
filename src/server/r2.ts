import { env } from 'cloudflare:workers'

// サーバー側の処理（server function の handler の中など）からだけ使う。
// 画面のコンポーネントから import されるファイルに置くと、ブラウザ用のバンドルに cloudflare:workers が入ってしまう

/** R2 から画像を消す */
export async function deleteImage(key: string | null | undefined) {
  if (key) await env.IMAGES.delete(key)
}

/** R2 から画像をまとめて消す */
export async function deleteImages(keys: (string | null | undefined)[]) {
  const targets = [...new Set(keys.filter((k): k is string => !!k))]
  if (targets.length > 0) await env.IMAGES.delete(targets)
}
