// 画像を縮小して、指定した形式で書き出す。Worker の中（OffscreenCanvas）と画面側（canvas）の両方から使う。
// canvas に描き直して書き出すので、EXIF・XMP などのメタデータは書き出した画像には入らない

export type OutputFormat =
  | 'image/webp'
  | 'image/jpeg'
  | 'image/png'
  | 'image/avif'

export type EncodeOptions = {
  format: OutputFormat
  /** 0〜1（PNG では使わない） */
  quality: number
  /** 0 は制限なし */
  maxWidth: number
  maxHeight: number
}

export type EncodeResult = {
  blob: Blob
  width: number
  height: number
  /** 向きを反映したあとの元の大きさ */
  sourceWidth: number
  sourceHeight: number
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: AnyCanvas): Context2D {
  const ctx = canvas.getContext('2d') as Context2D | null
  if (!ctx) throw new Error('canvas を使えません')
  return ctx
}

export function canvasToBlob(
  canvas: AnyCanvas,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('書き出せません'))),
      type,
      quality,
    ),
  )
}

/** 最大幅・最大高さに収まる大きさ（拡大はしない） */
export function fitSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  let scale = 1
  if (maxWidth > 0) scale = Math.min(scale, maxWidth / width)
  if (maxHeight > 0) scale = Math.min(scale, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * 画像を描き直して書き出す。source は向き（EXIF の Orientation）を反映済みのもの。
 * 大きく縮めるときは半分ずつ縮めて、ギザギザやモアレを抑える
 */
export async function encodeImage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: EncodeOptions,
): Promise<EncodeResult> {
  const { width, height } = fitSize(
    sourceWidth,
    sourceHeight,
    options.maxWidth,
    options.maxHeight,
  )

  let current: CanvasImageSource = source
  let cw = sourceWidth
  let ch = sourceHeight
  while (cw / 2 >= width && ch / 2 >= height) {
    const nw = Math.round(cw / 2)
    const nh = Math.round(ch / 2)
    const step = createCanvas(nw, nh)
    const ctx = getContext(step)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(current, 0, 0, nw, nh)
    current = step
    cw = nw
    ch = nh
  }

  const canvas = createCanvas(width, height)
  const ctx = getContext(canvas)
  // JPEG は透明を持てないので、透明なところは白にする
  if (options.format === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current, 0, 0, width, height)

  const blob = await canvasToBlob(
    canvas,
    options.format,
    options.format === 'image/png' ? undefined : options.quality,
  )
  return { blob, width, height, sourceWidth, sourceHeight }
}
