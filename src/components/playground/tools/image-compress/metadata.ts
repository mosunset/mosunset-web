// 画像に入っているメタデータ（EXIF・GPS・XMP・IPTC）を読み取って、見せる形にまとめる。
// 読み取りは exifr（MIT）。exifr が読めない WebP は、RIFF の EXIF チャンクを取り出して渡す
import exifr from 'exifr'

export type MetaSummary = {
  /** 読み取れた項目の数 */
  total: number
  gps?: { latitude: number; longitude: number; altitude?: number }
  camera?: string
  lens?: string
  taken?: string
  software?: string
  orientation?: number
  author?: string
  shooting?: string
}

const options = {
  tiff: true,
  exif: true,
  gps: true,
  xmp: true,
  iptc: true,
  icc: false,
  ifd1: false,
  interop: false,
  jfif: false,
  ihdr: false,
  translateValues: false,
  reviveValues: true,
  mergeOutput: true,
}

/** WebP（RIFF）から EXIF チャンクの中身（TIFF の形）を取り出す */
async function webpExif(file: Blob): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = (at: number) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])
  if (bytes.length < 12 || text(0) !== 'RIFF' || text(8) !== 'WEBP') return null
  const view = new DataView(bytes.buffer)
  let at = 12
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true)
    if (text(at) === 'EXIF') {
      let data = bytes.subarray(at + 8, at + 8 + size)
      // 「Exif\0\0」で始めるソフトもある
      if (data.length > 6 && text(at + 8) === 'Exif') data = data.subarray(6)
      return data
    }
    at += 8 + size + (size % 2)
  }
  return null
}

function isWebp(file: Blob) {
  return file.type === 'image/webp'
}

const fmtDate = (v: unknown) =>
  v instanceof Date && !Number.isNaN(v.getTime())
    ? v.toLocaleString('ja-JP')
    : typeof v === 'string'
      ? v
      : undefined

const str = (v: unknown) =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

function shootingText(o: Record<string, unknown>) {
  const parts: string[] = []
  const exposure = o.ExposureTime
  if (typeof exposure === 'number' && exposure > 0)
    parts.push(
      exposure >= 1 ? `${exposure} 秒` : `1/${Math.round(1 / exposure)} 秒`,
    )
  if (typeof o.FNumber === 'number') parts.push(`F${o.FNumber}`)
  if (typeof o.ISO === 'number') parts.push(`ISO ${o.ISO}`)
  if (typeof o.FocalLength === 'number') parts.push(`${o.FocalLength}mm`)
  return parts.length > 0 ? parts.join(' / ') : undefined
}

/** メタデータを読み取る。何も入っていなければ total が 0 */
export async function readMetadata(file: Blob): Promise<MetaSummary> {
  let input: Blob | Uint8Array | null = file
  if (isWebp(file)) input = await webpExif(file)
  if (!input) return { total: 0 }

  let out: Record<string, unknown> | undefined
  try {
    out = await exifr.parse(input, options)
  } catch {
    // 対応していない形式・壊れた EXIF は「なし」として扱う
    return { total: 0 }
  }
  if (!out) return { total: 0 }

  const lat = out.latitude
  const lon = out.longitude
  const make = str(out.Make)
  const model = str(out.Model)
  const camera =
    make && model && !model.startsWith(make)
      ? `${make} ${model}`
      : (model ?? make)
  const author = [str(out.Artist), str(out.Copyright)]
    .filter(Boolean)
    .join(' / ')

  return {
    // latitude / longitude は exifr が GPS の項目から作ったものなので数えない
    total: Object.keys(out).filter((k) => k !== 'latitude' && k !== 'longitude')
      .length,
    gps:
      typeof lat === 'number' && typeof lon === 'number'
        ? {
            latitude: lat,
            longitude: lon,
            altitude:
              typeof out.GPSAltitude === 'number' ? out.GPSAltitude : undefined,
          }
        : undefined,
    camera,
    lens: str(out.LensModel),
    taken: fmtDate(out.DateTimeOriginal ?? out.CreateDate ?? out.ModifyDate),
    software: str(out.Software),
    orientation:
      typeof out.Orientation === 'number' ? out.Orientation : undefined,
    author: author || undefined,
    shooting: shootingText(out),
  }
}

export const orientationLabels: Record<number, string> = {
  1: 'そのまま',
  2: '左右反転',
  3: '180° 回転',
  4: '上下反転',
  5: '左右反転して反時計回りに 90°',
  6: '時計回りに 90° 回転',
  7: '左右反転して時計回りに 90°',
  8: '反時計回りに 90° 回転',
}
