/**
 * 画像から、撮った場所（GPS）・日時・機種・ファイルの置き場所などのメタデータを取り除く。
 * ブラウザでは送る前に書き出し直している（src/lib/image-resize.ts）が、
 * それをすり抜けたもの（そのまま送られた画像・ISBN で取ってきた表紙など）も、ここで必ず消す。
 *
 * 画素のデータには触らず、メタデータの入れ物だけを抜くので、画質は変わらない。
 * 色の情報（ICC プロファイル）など、表示に必要なものは残す。
 */
export function stripImageMetadata(
  body: ArrayBuffer,
  type: string,
): ArrayBuffer {
  switch (type) {
    case 'image/jpeg':
      return stripJpeg(new Uint8Array(body))
    case 'image/png':
      return stripPng(new Uint8Array(body))
    case 'image/webp':
      return stripWebp(new Uint8Array(body))
    case 'image/avif':
      // AVIF の入れ物は複雑なので書き換えず、メタデータらしいものがあれば受け付けない
      // （ブラウザから送るときは WebP に書き出し直すので、ふつうはここまで来ない）
      if (containsAscii(new Uint8Array(body), 'Exif')) {
        throw new Error(
          '位置情報などが入った AVIF は保存できません。JPEG か PNG にしてから選んでください',
        )
      }
      return body
    default:
      // GIF には撮影の情報を入れる場所がない
      return body
  }
}

/** 中身の先頭から n バイトの中に、その文字列があるか */
function containsAscii(bytes: Uint8Array, text: string, limit = 512 * 1024) {
  const codes = [...text].map((c) => c.charCodeAt(0))
  const end = Math.min(bytes.length, limit) - codes.length
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (bytes[i + j] !== codes[j]) continue outer
    }
    return true
  }
  return false
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out.buffer
}

const startsWithAscii = (bytes: Uint8Array, offset: number, text: string) =>
  [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0))

/**
 * JPEG: APP1（Exif・XMP）、APP3〜APP13・APP15（各社の情報・IPTC・C2PA など）、コメントを抜く。
 * APP0（JFIF）、APP2 の ICC プロファイル、APP14（Adobe の色の変換）は表示に要るので残す。
 * 最初の画像の終わり（EOI）より後ろ（スマホが付ける別の画像など。中に Exif が入っている）も捨てる
 */
function stripJpeg(bytes: Uint8Array): ArrayBuffer {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error('JPEG として読めません')
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let p = 2
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new Error('JPEG として読めません')
    // 詰め物の 0xFF を飛ばす
    while (bytes[p + 1] === 0xff) p++
    const marker = bytes[p + 1]
    if (marker === 0xd9) {
      parts.push(bytes.subarray(p, p + 2))
      return concat(parts)
    }
    // 長さを持たない印（RSTn・TEM）
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(p, p + 2))
      p += 2
      continue
    }
    const length = (bytes[p + 2] << 8) | bytes[p + 3]
    const segmentEnd = p + 2 + length
    if (length < 2 || segmentEnd > bytes.length)
      throw new Error('JPEG として読めません')
    const isApp = marker >= 0xe0 && marker <= 0xef
    const keep =
      !isApp && marker !== 0xfe
        ? true
        : marker === 0xe0 ||
          marker === 0xee ||
          (marker === 0xe2 && startsWithAscii(bytes, p + 4, 'ICC_PROFILE'))
    if (keep) parts.push(bytes.subarray(p, segmentEnd))
    p = segmentEnd
    if (marker === 0xda) {
      // 画像のデータ。次の印（0xFF のあとが 0x00 と RSTn 以外）までそのまま写す
      let q = p
      while (q < bytes.length - 1) {
        if (bytes[q] === 0xff) {
          const next = bytes[q + 1]
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff)
            break
        }
        q++
      }
      parts.push(bytes.subarray(p, q))
      p = q
    }
  }
  throw new Error('JPEG の終わりが見つかりません')
}

/** PNG: eXIf・tEXt・zTXt・iTXt（文字の情報）・tIME（日時）・caBX（C2PA）を抜く */
function stripPng(bytes: Uint8Array): ArrayBuffer {
  const drop = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'caBX'])
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  let p = 8
  while (p + 8 <= bytes.length) {
    const length =
      ((bytes[p] << 24) |
        (bytes[p + 1] << 16) |
        (bytes[p + 2] << 8) |
        bytes[p + 3]) >>>
      0
    const type = String.fromCharCode(
      bytes[p + 4],
      bytes[p + 5],
      bytes[p + 6],
      bytes[p + 7],
    )
    const end = p + 12 + length
    if (end > bytes.length) throw new Error('PNG として読めません')
    if (!drop.has(type)) parts.push(bytes.subarray(p, end))
    p = end
    if (type === 'IEND') break
  }
  return concat(parts)
}

/** WebP: EXIF と XMP の塊を抜き、VP8X の印（あるかどうかの旗）も下ろす */
function stripWebp(bytes: Uint8Array): ArrayBuffer {
  if (
    !startsWithAscii(bytes, 0, 'RIFF') ||
    !startsWithAscii(bytes, 8, 'WEBP')
  ) {
    throw new Error('WebP として読めません')
  }
  const chunks: Uint8Array[] = []
  let p = 12
  while (p + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[p],
      bytes[p + 1],
      bytes[p + 2],
      bytes[p + 3],
    )
    const size =
      (bytes[p + 4] |
        (bytes[p + 5] << 8) |
        (bytes[p + 6] << 16) |
        (bytes[p + 7] << 24)) >>>
      0
    const end = p + 8 + size + (size % 2)
    if (p + 8 + size > bytes.length) throw new Error('WebP として読めません')
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = bytes.slice(p, Math.min(end, bytes.length))
      // VP8X の旗: 0x08 = EXIF あり、0x04 = XMP あり
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04)
      chunks.push(chunk)
    }
    p = end
  }
  const payload = chunks.reduce((s, c) => s + c.length, 0)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 12))
  const riffSize = 4 + payload
  header[4] = riffSize & 0xff
  header[5] = (riffSize >> 8) & 0xff
  header[6] = (riffSize >> 16) & 0xff
  header[7] = (riffSize >> 24) & 0xff
  return concat([header, ...chunks])
}
