/**
 * ファイルの先頭のバイトが、申告された画像の形式と合っているか。
 * ブラウザが付ける種類（file.type）は書き換えられるので、中身でも確かめる
 */
export function matchesSignature(bytes: Uint8Array, type: string) {
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
