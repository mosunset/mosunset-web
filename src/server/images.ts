/** R2 に保存する画像の大きさの上限 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * 保存する前に画像の中身を確かめる。問題があれば理由を、なければ null を返す。
 * 申告された種類（file.type や Content-Type）は書き換えられるので、先頭のバイトでも確かめる
 */
export function validateImageBytes(
  body: ArrayBuffer,
  type: string,
): string | null {
  if (body.byteLength > MAX_IMAGE_BYTES) return '画像は 10MB までです'
  const head = new Uint8Array(body, 0, Math.min(16, body.byteLength))
  if (!matchesSignature(head, type)) return '画像として読み込めないファイルです'
  return null
}

/** ファイルの先頭のバイトが、申告された画像の形式と合っているか */
function matchesSignature(bytes: Uint8Array, type: string) {
  const starts = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b)
  const ascii = (text: string, offset = 0) =>
    starts(
      [...text].map((c) => c.charCodeAt(0)),
      offset,
    )

  switch (type) {
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff])
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return ascii('GIF87a') || ascii('GIF89a')
    case 'image/webp':
      return ascii('RIFF') && ascii('WEBP', 8)
    case 'image/avif':
      return ascii('ftyp', 4) && (ascii('avif', 8) || ascii('avis', 8))
    default:
      return false
  }
}
