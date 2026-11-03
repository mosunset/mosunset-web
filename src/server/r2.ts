import { env } from 'cloudflare:workers'

// サーバー側の処理（server function の handler の中など）からだけ使う。
// 画面のコンポーネントから import されるファイルに置くと、ブラウザ用のバンドルに cloudflare:workers が入ってしまう

/** R2 から画像を消す */
export async function deleteImage(key: string | null | undefined) {
  if (key) await env.IMAGES.delete(key)
}
