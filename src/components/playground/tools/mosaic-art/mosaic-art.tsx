import {
  Download,
  Eye,
  FolderOpen,
  ImagePlus,
  Images,
  Loader2,
  Maximize2,
  Minimize2,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HelpTip, RangeSlider, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MatchReply, MatchRequest } from './match.worker'
import {
  FEATURES,
  MAX_AREA,
  mirrorFeatures,
  TILE_PX,
  writeRegionFeatures,
} from './mosaic'

/** 素材の写真 1 枚（正方形に切り抜いて TILE_PX に縮めたもの） */
type Photo = { key: string; canvas: HTMLCanvasElement; features: Float32Array }

type Target = { url: string; image: HTMLImageElement; revoke: boolean }

/** マスごとの色（元の画像を cols × rows に分けたもの） */
type Grid = {
  cols: number
  rows: number
  /** マスごとの特徴（2×2 の平均色を OKLab で） */
  features: Float32Array
  /** マスごとの平均色（sRGB）。色の補正と単色のタイルに使う */
  colors: Uint8ClampedArray
}

type Mode = 'photos' | 'self' | 'solid'

const modes: { value: Mode; label: string; help: string }[] = [
  {
    value: 'photos',
    label: '写真で',
    help: '入れた写真の中から、マスの色にいちばん近い写真を選んで並べます。写真は多いほど（目安は 100 枚以上）元の画像に近づきます。',
  },
  {
    value: 'self',
    label: '元の画像で',
    help: '元の画像そのものを小さくしてタイルにし、マスの色を重ねて並べます。写真を用意しなくても作れます。',
  },
  {
    value: 'solid',
    label: '単色で',
    help: 'マスの平均の色で塗ったタイルを並べます（いわゆるモザイク・ドット絵）。',
  },
]

const SAMPLE = '/playground/mosaic-art/sample.webp'
const MAX_PHOTOS = 2000
const MAX_ROWS = 400
/** 元の画像を、1 マスあたり何 px にして色を測るか */
const SAMPLE_PX = 4

const imagePattern = /\.(jpe?g|png|webp|gif|avif|bmp)$/i

/** 画像の真ん中を正方形に切り抜いて TILE_PX に縮める */
function squareTile(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const size = Math.min(width, height)
  let from: CanvasImageSource = source
  let sx = (width - size) / 2
  let sy = (height - size) / 2
  let sSize = size
  // 大きな写真を一度に縮めるとギザギザになるので、いったん中くらいの大きさにする
  const mid = TILE_PX * 4
  if (size > mid * 2) {
    const step = document.createElement('canvas')
    step.width = mid
    step.height = mid
    const sctx = step.getContext('2d')
    if (sctx) {
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(source, sx, sy, size, size, 0, 0, mid, mid)
      from = step
      sx = 0
      sy = 0
      sSize = mid
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = TILE_PX
  canvas.height = TILE_PX
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas を使えません')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(from, sx, sy, sSize, sSize, 0, 0, TILE_PX, TILE_PX)
  return canvas
}

function tileFeatures(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const out = new Float32Array(FEATURES)
  if (!ctx) return out
  const { data } = ctx.getImageData(0, 0, TILE_PX, TILE_PX)
  writeRegionFeatures(data, TILE_PX, 0, 0, TILE_PX, TILE_PX, out, 0)
  return out
}

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

async function loadPhoto(file: File): Promise<Photo | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = squareTile(bitmap, bitmap.width, bitmap.height)
    bitmap.close()
    return { key: fileKey(file), canvas, features: tileFeatures(canvas) }
  } catch {
    return null
  }
}

/** 元の画像を cols 列のマスに分けて、マスごとの色を測る */
function analyzeTarget(image: HTMLImageElement, cols: number): Grid {
  const rows = Math.min(
    MAX_ROWS,
    Math.max(1, Math.round((cols * image.naturalHeight) / image.naturalWidth)),
  )
  const w = cols * SAMPLE_PX
  const h = rows * SAMPLE_PX
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas を使えません')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const count = cols * rows
  const features = new Float32Array(count * FEATURES)
  const colors = new Uint8ClampedArray(count * 3)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const cell = cy * cols + cx
      const x = cx * SAMPLE_PX
      const y = cy * SAMPLE_PX
      writeRegionFeatures(
        data,
        w,
        x,
        y,
        SAMPLE_PX,
        SAMPLE_PX,
        features,
        cell * FEATURES,
      )
      let r = 0
      let g = 0
      let b = 0
      for (let yy = y; yy < y + SAMPLE_PX; yy++) {
        for (let xx = x; xx < x + SAMPLE_PX; xx++) {
          const i = (yy * w + xx) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
        }
      }
      const n = SAMPLE_PX * SAMPLE_PX
      colors[cell * 3] = r / n
      colors[cell * 3 + 1] = g / n
      colors[cell * 3 + 2] = b / n
    }
  }
  return { cols, rows, features, colors }
}

/** 書き出すときの 1 タイルの大きさ（面積の上限に収まるよう小さくする） */
function exportTilePx(grid: Grid, wanted: number) {
  const fit = Math.floor(Math.sqrt(MAX_AREA / (grid.cols * grid.rows)))
  return Math.max(1, Math.min(wanted, fit, TILE_PX))
}

/** 値が止まってから少しして変わる値（スライダーを動かしている間に重い計算をしない） */
function useSettled<T>(value: T, delay = 200): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return settled
}

type MatchResult = {
  grid: Grid
  tiles: Float32Array
  assignment: Int32Array
}

export function MosaicArt() {
  const [target, setTarget] = useState<Target | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState<{ done: number; total: number }>()
  const [mode, setMode] = useState<Mode>('self')
  const [cols, setCols] = useState(60)
  const [blends, setBlends] = useState<Record<Mode, number>>({
    photos: 25,
    self: 60,
    solid: 0,
  })
  const [radius, setRadius] = useState(2)
  const [mirror, setMirror] = useState(true)
  const [gap, setGap] = useState(0)
  const [gapColor, setGapColor] = useState('#ffffff')
  const [tilePx, setTilePx] = useState(48)
  const [seed, setSeed] = useState(1)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [actualSize, setActualSize] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const busyRef = useRef(false)
  const requestRef = useRef(0)

  const settledCols = useSettled(cols)
  const blend = useSettled(blends[mode], 120)
  const settledGap = useSettled(gap, 120)
  const settledTilePx = useSettled(tilePx, 120)
  const settledRadius = useSettled(radius)

  const grid = useMemo(
    () => (target ? analyzeTarget(target.image, settledCols) : null),
    [target, settledCols],
  )

  /** タイルの候補の特徴（左右反転を使うときは、後ろに反転したものを足す） */
  const tiles = useMemo(() => {
    const n = photos.length
    const out = new Float32Array(n * FEATURES * (mirror ? 2 : 1))
    photos.forEach((p, i) => {
      out.set(p.features, i * FEATURES)
      if (mirror) out.set(mirrorFeatures(p.features), (n + i) * FEATURES)
    })
    return out
  }, [photos, mirror])

  /** 「元の画像で」のときのタイル */
  const selfTile = useMemo(
    () =>
      target
        ? squareTile(
            target.image,
            target.image.naturalWidth,
            target.image.naturalHeight,
          )
        : null,
    [target],
  )

  // ページを離れたら Worker を止め、読み込んだ画像の URL を手放す
  useEffect(() => () => workerRef.current?.terminate(), [])
  useEffect(
    () => () => {
      if (target?.revoke) URL.revokeObjectURL(target.url)
    },
    [target],
  )

  // 写真が入ったら「写真で」に、全部外したら「元の画像で」に切り替える
  const photoCount = photos.length
  useEffect(() => {
    setMode((m) =>
      photoCount > 0 && m === 'self'
        ? 'photos'
        : photoCount === 0 && m === 'photos'
          ? 'self'
          : m,
    )
  }, [photoCount])

  // タイル選び（Worker で）
  useEffect(() => {
    if (mode !== 'photos' || !grid || photos.length === 0) {
      setProgress(null)
      return
    }
    // 前の計算が終わっていなければ止めて、新しく始める
    if (busyRef.current) {
      workerRef.current?.terminate()
      workerRef.current = null
    }
    const worker =
      workerRef.current ??
      new Worker(new URL('./match.worker.ts', import.meta.url), {
        type: 'module',
      })
    workerRef.current = worker
    const id = ++requestRef.current
    const count = grid.cols * grid.rows
    busyRef.current = true
    setProgress(0)
    worker.onmessage = (e: MessageEvent<MatchReply>) => {
      const reply = e.data
      if (reply.id !== requestRef.current) return
      if (reply.type === 'progress') {
        setProgress(reply.done / count)
        return
      }
      busyRef.current = false
      setProgress(null)
      setResult({ grid, tiles, assignment: reply.assignment })
    }
    worker.onerror = () => {
      busyRef.current = false
      setProgress(null)
      toast.error('タイルを選べませんでした')
    }
    worker.postMessage({
      id,
      cells: grid.features,
      tiles,
      sources: photos.length,
      cols: grid.cols,
      rows: grid.rows,
      radius: settledRadius,
      seed,
    } satisfies MatchRequest)
  }, [mode, grid, tiles, photos.length, settledRadius, seed])

  // 描く
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !grid) return
    let photoAssignment: Int32Array | null = null
    if (mode === 'photos') {
      // 選び直している間は、前の絵をそのまま出しておく
      if (!result || result.grid !== grid || result.tiles !== tiles) return
      photoAssignment = result.assignment
    }
    const px = exportTilePx(grid, settledTilePx)
    canvas.width = grid.cols * px
    canvas.height = grid.rows * px
    const g = Math.min(px - 1, Math.round((px * settledGap) / 100))
    const inner = px - g
    const off = Math.floor(g / 2)
    ctx.fillStyle = gapColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    const n = photos.length
    const alpha = blend / 100
    for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
      const x = (cell % grid.cols) * px + off
      const y = Math.floor(cell / grid.cols) * px + off
      const color = `rgb(${grid.colors[cell * 3]},${grid.colors[cell * 3 + 1]},${grid.colors[cell * 3 + 2]})`
      ctx.fillStyle = color
      if (mode === 'solid') {
        ctx.fillRect(x, y, inner, inner)
        continue
      }
      let tile: HTMLCanvasElement | null = selfTile
      let mirrored = false
      if (photoAssignment) {
        const index = photoAssignment[cell]
        tile = photos[index % n]?.canvas ?? null
        mirrored = index >= n
      }
      if (!tile) continue
      if (mirrored) {
        ctx.save()
        ctx.translate(x + inner, y)
        ctx.scale(-1, 1)
        ctx.drawImage(tile, 0, 0, inner, inner)
        ctx.restore()
      } else {
        ctx.drawImage(tile, x, y, inner, inner)
      }
      if (alpha > 0) {
        ctx.globalAlpha = alpha
        ctx.fillRect(x, y, inner, inner)
        ctx.globalAlpha = 1
      }
    }
  }, [
    grid,
    mode,
    result,
    tiles,
    photos,
    selfTile,
    blend,
    settledGap,
    gapColor,
    settledTilePx,
  ])

  const openTarget = async (file: File | undefined) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      setTarget({ url, image, revoke: true })
    } catch {
      URL.revokeObjectURL(url)
      toast.error('画像を読み込めませんでした')
    }
  }

  const openSample = async () => {
    try {
      const image = new Image()
      image.src = SAMPLE
      await image.decode()
      setTarget({ url: SAMPLE, image, revoke: false })
    } catch {
      toast.error('サンプルの画像を読み込めませんでした')
    }
  }

  const addPhotos = async (files: File[]) => {
    const known = new Set(photos.map((p) => p.key))
    const images = files
      .filter((f) => f.type.startsWith('image/') || imagePattern.test(f.name))
      .filter((f) => !known.has(fileKey(f)))
      .slice(0, Math.max(0, MAX_PHOTOS - photos.length))
    if (images.length === 0) {
      if (photos.length >= MAX_PHOTOS)
        toast.error(`写真は ${MAX_PHOTOS} 枚までです`)
      return
    }
    setLoading({ done: 0, total: images.length })
    const loaded: Photo[] = []
    let failed = 0
    let next = 0
    // 4 枚ずつ並行して読み込む
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < images.length) {
          const file = images[next++]
          const photo = await loadPhoto(file)
          if (photo) loaded.push(photo)
          else failed++
          setLoading({ done: loaded.length + failed, total: images.length })
        }
      }),
    )
    setLoading(undefined)
    setPhotos((prev) => {
      const keys = new Set(prev.map((p) => p.key))
      return [...prev, ...loaded.filter((p) => !keys.has(p.key))]
    })
    if (failed > 0)
      toast.error(
        `${failed} 枚は読み込めませんでした（HEIC などブラウザが開けない形式は使えません）`,
      )
  }

  const download = (type: 'image/png' | 'image/jpeg') => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('書き出せませんでした')
          return
        }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `mosaic-art.${type === 'image/png' ? 'png' : 'jpg'}`
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      },
      type,
      0.92,
    )
  }

  const px = grid ? exportTilePx(grid, tilePx) : tilePx
  const used =
    mode === 'photos' && result && photos.length > 0
      ? new Set(Array.from(result.assignment, (i) => i % photos.length)).size
      : null
  const busy = progress !== null || loading !== undefined

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <DropZone onFiles={(files) => openTarget(files[0])}>
          <h2 className="font-semibold">1. 元の画像</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            モザイクアートにしたい画像を 1 枚選ぶか、ここにドロップします。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FileButton accept="image/*" onFiles={(f) => openTarget(f[0])}>
              <ImagePlus />
              画像を選ぶ
            </FileButton>
            <Button type="button" variant="ghost" onClick={openSample}>
              <Sparkles />
              サンプルで試す
            </Button>
          </div>
          {target && (
            <img
              src={target.url}
              alt="元の画像"
              className="mt-3 h-24 w-auto rounded border object-contain"
            />
          )}
        </DropZone>

        <DropZone onFiles={addPhotos}>
          <h2 className="flex items-center gap-1 font-semibold">
            2. 素材の写真
            <span className="text-sm font-normal text-muted-foreground">
              （なくても作れます）
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            タイルにする写真をまとめて選ぶか、ここにドロップします（{MAX_PHOTOS}{' '}
            枚まで）。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FileButton accept="image/*" multiple onFiles={addPhotos}>
              <Images />
              写真を選ぶ
            </FileButton>
            <FileButton directory onFiles={addPhotos}>
              <FolderOpen />
              フォルダを選ぶ
            </FileButton>
            {photos.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhotos([])
                  setResult(null)
                }}
              >
                <Trash2 />
                全部外す
              </Button>
            )}
          </div>
          {loading && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              読み込み中… {loading.done} / {loading.total} 枚
            </p>
          )}
          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {photos.slice(0, 23).map((p) => (
                <PhotoThumb key={p.key} canvas={p.canvas} />
              ))}
              <span className="ml-1 text-sm text-muted-foreground">
                {photos.length} 枚
              </span>
            </div>
          )}
        </DropZone>
      </div>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-semibold">3. 作り方</h2>
        <div className="flex flex-wrap items-center gap-2">
          {modes.map((m) => (
            <span key={m.value} className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={mode === m.value ? 'default' : 'outline'}
                disabled={m.value === 'photos' && photos.length === 0}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
              <HelpTip>{m.help}</HelpTip>
            </span>
          ))}
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <RangeSlider
            label="横のタイルの数"
            help="横に並べるタイルの数です。縦の数は元の画像の縦横比で決まります。多いほど細かくなり、写真で作るときの計算も長くなります。"
            value={cols}
            min={10}
            max={150}
            step={1}
            unit=" 個"
            onChange={setCols}
          />
          {mode !== 'solid' && (
            <RangeSlider
              label="色の補正"
              help="タイルの上に、そのマスの元の色を重ねる強さです。強くすると遠くから見たときに元の画像に近づき、弱くするとタイルの写真がよく見えます。"
              value={blends[mode]}
              min={0}
              max={90}
              step={5}
              unit="%"
              onChange={(v) => setBlends((b) => ({ ...b, [mode]: v }))}
            />
          )}
          {mode === 'photos' && (
            <RangeSlider
              label="同じ写真を近くに置かない"
              help="この距離（タイルの数）以内には、同じ写真を置かないようにします。0 にすると色の近さだけで選ぶので、同じ写真が固まりやすくなります。"
              value={radius}
              min={0}
              max={6}
              step={1}
              unit=" マス"
              onChange={setRadius}
            />
          )}
          <RangeSlider
            label="タイルのすき間"
            help="タイルとタイルの間をあけて、目地のように見せます。"
            value={gap}
            min={0}
            max={30}
            step={1}
            unit="%"
            onChange={setGap}
          />
          <RangeSlider
            label="書き出しのタイルの大きさ"
            help={`書き出す画像での 1 タイルの大きさです。画像が大きくなりすぎるとき（約 ${Math.round(MAX_AREA / 1e4)} 万画素まで）は、自動で小さくします。`}
            value={tilePx}
            min={8}
            max={TILE_PX}
            step={4}
            unit=" px"
            onChange={setTilePx}
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {gap > 0 && (
              <label className="flex items-center gap-2">
                すき間の色
                <input
                  type="color"
                  value={gapColor}
                  onChange={(e) => setGapColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                />
              </label>
            )}
            {mode === 'photos' && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mirror}
                    onChange={(e) => setMirror(e.target.checked)}
                    className="accent-primary"
                  />
                  左右反転した写真も使う
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSeed((s) => s + 1)}
                >
                  <Shuffle />
                  並べ直す
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {target && grid ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="タイルの数"
              value={(grid.cols * grid.rows).toLocaleString()}
              hint={`横 ${grid.cols} × 縦 ${grid.rows}`}
            />
            <Stat
              label="使った写真"
              value={used ?? '—'}
              unit={used !== null ? `/ ${photos.length} 枚` : undefined}
            />
            <Stat
              label="書き出しの大きさ"
              value={`${grid.cols * px}×${grid.rows * px}`}
              unit="px"
              className="col-span-2"
              hint={
                px < tilePx
                  ? `大きすぎるので 1 タイル ${px} px にしています`
                  : undefined
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActualSize((v) => !v)}
            >
              {actualSize ? <Minimize2 /> : <Maximize2 />}
              {actualSize ? '画面に合わせる' : '実際の大きさで見る'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPointerDown={() => setShowOriginal(true)}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') setShowOriginal(true)
              }}
              onKeyUp={() => setShowOriginal(false)}
            >
              <Eye />
              押している間は元の画像
            </Button>
            {progress !== null && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                タイルを選んでいます… {Math.round(progress * 100)}%
              </span>
            )}
            <span className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => download('image/png')}
              >
                <Download />
                PNG
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => download('image/jpeg')}
              >
                <Download />
                JPEG
              </Button>
            </span>
          </div>

          <div
            className={cn(
              'rounded-lg border bg-muted/30',
              actualSize ? 'max-h-[80svh] overflow-auto' : 'p-2',
            )}
          >
            <div
              className={cn(
                'relative',
                actualSize ? 'w-max' : 'mx-auto w-fit max-w-full',
              )}
            >
              <canvas
                ref={canvasRef}
                className={cn(
                  'block',
                  !actualSize && 'h-auto max-h-[75svh] w-auto max-w-full',
                )}
              />
              {showOriginal && (
                <img
                  src={target.url}
                  alt="元の画像"
                  className="absolute inset-0 size-full"
                />
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          元の画像を選ぶと、ここにモザイクアートが出ます。
          <br />
          画像も写真もブラウザの中だけで処理し、サーバーには送りません。
        </p>
      )}
    </div>
  )
}

/** ファイルを落とせる枠 */
function DropZone({
  onFiles,
  children,
}: {
  onFiles: (files: File[]) => void
  children: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ドロップは「選ぶ」ボタンの補助で、キーボードではボタンを使う
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
      className={cn(
        'rounded-lg border border-dashed p-4 transition-colors',
        over && 'border-primary bg-primary/5',
      )}
    >
      {children}
    </div>
  )
}

/** ファイルを選ぶボタン（directory ならフォルダごと） */
function FileButton({
  accept,
  multiple,
  directory,
  onFiles,
  children,
}: {
  accept?: string
  multiple?: boolean
  directory?: boolean
  onFiles: (files: File[]) => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" variant="outline" asChild>
      <label className="cursor-pointer">
        {children}
        <input
          type="file"
          accept={accept}
          multiple={multiple || directory}
          className="hidden"
          // webkitdirectory は React の型にないので、直接付ける
          ref={(el) => {
            if (el && directory) el.setAttribute('webkitdirectory', '')
          }}
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
    </Button>
  )
}

function PhotoThumb({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    ref.current?.getContext('2d')?.drawImage(canvas, 0, 0, 40, 40)
  }, [canvas])
  return (
    <canvas ref={ref} width={40} height={40} className="size-8 rounded-sm" />
  )
}
