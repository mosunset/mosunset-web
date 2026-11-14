/** 顔の枠（画像の画素の座標） */
export type FaceBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** auto: 自動で見つけた、manual: 手で描いた */
  source: 'auto' | 'manual'
  score: number
  /** クリックで外したものは false */
  enabled: boolean
}

export type FaceEffect = 'blur' | 'mosaic' | 'fill'
export type FaceShape = 'ellipse' | 'rect'
export type Background = 'transparent' | 'color' | 'image' | 'blur'

export type Settings = {
  removeBackground: boolean
  blurFaces: boolean
  /** 残すかどうかの境目（0〜1） */
  threshold: number
  /** 境目のなめらかさ（0〜0.5） */
  softness: number
  background: Background
  backgroundColor: string
  backgroundImage: HTMLImageElement | null
  backgroundBlur: number
  faceEffect: FaceEffect
  faceShape: FaceShape
  /** ぼかし・モザイクの強さ（1〜10） */
  strength: number
  fillColor: string
  /** 枠をどれだけ広げるか（割合） */
  padding: number
  /** これより信頼度の低い自動の枠は使わない */
  minScore: number
}

/** 画面に出す枠の一覧（信頼度で落としたものを除く） */
export function visibleFaces(faces: FaceBox[], minScore: number) {
  return faces.filter((f) => f.source === 'manual' || f.score >= minScore)
}

/** 枠を padding の割合だけ広げる（画像の外にははみ出させない） */
export function padBox(f: FaceBox, padding: number, w: number, h: number) {
  const px = f.w * padding
  const py = f.h * padding
  const x = Math.max(0, f.x - px)
  const y = Math.max(0, f.y - py * 1.4) // 髪の毛も隠れるよう上を多めに
  const r = Math.min(w, f.x + f.w + px)
  const b = Math.min(h, f.y + f.h + py)
  return { x, y, w: r - x, h: b - y }
}

const canvasFilterSupported = (() => {
  if (typeof document === 'undefined') return false
  const ctx = document.createElement('canvas').getContext('2d')
  return !!ctx && 'filter' in ctx
})()

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas が使えません')
  return [c, ctx] as const
}

/**
 * src の (x, y, w, h) をぼかした画像を返す（周りの画素も使うので、少し広めに切り出す）。
 * canvas の filter が使えないブラウザでは、縮めてから引き伸ばしてぼかす
 */
function blurredRegion(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const m = Math.ceil(radius * 2)
  const sx = Math.max(0, x - m)
  const sy = Math.max(0, y - m)
  const sw = Math.min(srcW, x + w + m) - sx
  const sh = Math.min(srcH, y + h + m) - sy
  const [c, ctx] = makeCanvas(sw, sh)
  if (canvasFilterSupported) {
    ctx.filter = `blur(${radius}px)`
    // 端が透けないよう、まず一度ぼかさずに描いてからぼかしを重ねる
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
    ctx.filter = 'none'
  } else {
    const scale = Math.max(1, radius / 2)
    const [small, sctx] = makeCanvas(sw / scale, sh / scale)
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(src, sx, sy, sw, sh, 0, 0, small.width, small.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(small, 0, 0, sw, sh)
  }
  return { canvas: c, ox: x - sx, oy: y - sy }
}

/** 顔の部分にぼかし・モザイク・塗りつぶしをかける（ctx には元の画像が描いてある前提） */
function applyFaces(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  faces: FaceBox[],
  s: Settings,
) {
  const W = source.width
  const H = source.height
  for (const f of visibleFaces(faces, s.minScore)) {
    if (!f.enabled) continue
    const b = padBox(f, s.padding, W, H)
    if (b.w < 1 || b.h < 1) continue
    const size = Math.max(b.w, b.h)
    ctx.save()
    ctx.beginPath()
    if (s.faceShape === 'ellipse') {
      ctx.ellipse(
        b.x + b.w / 2,
        b.y + b.h / 2,
        b.w / 2,
        b.h / 2,
        0,
        0,
        Math.PI * 2,
      )
    } else {
      ctx.rect(b.x, b.y, b.w, b.h)
    }
    ctx.clip()
    if (s.faceEffect === 'fill') {
      ctx.fillStyle = s.fillColor
      ctx.fillRect(b.x, b.y, b.w, b.h)
    } else if (s.faceEffect === 'mosaic') {
      // 強さ 1 で顔の幅を 24 マス、10 で 4 マスほどに分ける
      const cells = Math.max(3, Math.round(26 - s.strength * 2.2))
      const cell = Math.max(2, size / cells)
      const [small, sctx] = makeCanvas(b.w / cell, b.h / cell)
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(
        source,
        b.x,
        b.y,
        b.w,
        b.h,
        0,
        0,
        small.width,
        small.height,
      )
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(small, b.x, b.y, b.w, b.h)
      ctx.imageSmoothingEnabled = true
    } else {
      const radius = Math.max(2, (size * s.strength) / 60)
      const r = blurredRegion(source, W, H, b.x, b.y, b.w, b.h, radius)
      ctx.drawImage(r.canvas, r.ox, r.oy, b.w, b.h, b.x, b.y, b.w, b.h)
    }
    ctx.restore()
  }
}

/** 確からしさ（0〜255）から、境目となめらかさを使って透明度のマスクを作る */
function maskCanvas(
  conf: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number,
  softness: number,
) {
  const [c, ctx] = makeCanvas(w, h)
  const img = ctx.createImageData(w, h)
  const lo = (threshold - softness) * 255
  const hi = (threshold + softness) * 255
  // 0〜255 の値ごとに透明度を先に計算しておく
  const table = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    if (hi - lo < 1) table[v] = v >= threshold * 255 ? 255 : 0
    else {
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
      table[v] = Math.round(t * t * (3 - 2 * t) * 255)
    }
  }
  const d = img.data
  for (let i = 0; i < conf.length; i++) d[i * 4 + 3] = table[conf[i]]
  ctx.putImageData(img, 0, 0)
  return c
}

/** 背景の画像を、はみ出してもよいので全体を覆うように描く */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/**
 * 仕上がりの画像を描く。
 * 顔のぼかしを先にかけてから、背景を消す（差し替える）
 */
export function renderResult(
  source: HTMLCanvasElement,
  faces: FaceBox[],
  conf: Uint8ClampedArray | null,
  s: Settings,
) {
  const W = source.width
  const H = source.height
  const [base, bctx] = makeCanvas(W, H)
  bctx.drawImage(source, 0, 0)
  if (s.blurFaces) applyFaces(bctx, source, faces, s)
  if (!s.removeBackground || !conf) return base

  // 切り抜いた前景
  const [fg, fctx] = makeCanvas(W, H)
  fctx.drawImage(base, 0, 0)
  fctx.globalCompositeOperation = 'destination-in'
  fctx.drawImage(maskCanvas(conf, W, H, s.threshold, s.softness), 0, 0)

  if (s.background === 'transparent') return fg
  const [out, octx] = makeCanvas(W, H)
  if (s.background === 'color') {
    octx.fillStyle = s.backgroundColor
    octx.fillRect(0, 0, W, H)
  } else if (s.background === 'image' && s.backgroundImage) {
    drawCover(octx, s.backgroundImage, W, H)
  } else if (s.background === 'blur') {
    const radius = Math.max(2, (Math.max(W, H) * s.backgroundBlur) / 400)
    const r = blurredRegion(base, W, H, 0, 0, W, H, radius)
    octx.drawImage(r.canvas, r.ox, r.oy, W, H, 0, 0, W, H)
  }
  octx.drawImage(fg, 0, 0)
  return out
}
