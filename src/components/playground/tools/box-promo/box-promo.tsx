import exifr from 'exifr'
import {
  ClipboardCopy,
  ClipboardPaste,
  Download,
  ImagePlus,
  Loader2,
  Magnet,
  Undo2,
} from 'lucide-react'
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HelpTip, RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  boxEdges,
  type CornerKey,
  type Corners,
  cornerKeys,
  estimateDims,
  focalFrom35mm,
  type Pt,
  type Raster,
  renderBox,
} from './render'
import { snapCorners } from './snap'

type Photo = {
  url: string
  name: string
  image: HTMLImageElement
  width: number
  height: number
  raster: Raster
  /** 写真の画素での焦点距離 */
  focal: number
  /** EXIF の 35mm 判換算の焦点距離（なければ null） */
  focal35: number | null
}

/** 角の名前（画面に出す短い名前と、読み上げ用の名前） */
const cornerLabels: Record<CornerKey, { short: string; long: string }> = {
  FTL: { short: '1', long: '正面の左上' },
  FTR: { short: '2', long: '正面の右上' },
  FBR: { short: '3', long: '正面の右下' },
  FBL: { short: '4', long: '正面の左下' },
  BTL: { short: '5', long: '上の面の奥の左' },
  BTR: { short: '6', long: '上の面の奥の右' },
  BBR: { short: '7', long: '側面の奥の下' },
}

/** 読み込む写真の上限（これより大きい写真は縮めてから使う） */
const MAX_SOURCE_PIXELS = 24_000_000
const PREVIEW_SIDE = 640
const DEFAULT_FOCAL_35 = 26

/** 写真の真ん中に、だいたいの箱の形で 7 つの角を置く */
function defaultCorners(w: number, h: number): Corners {
  const s = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const fw = s * 0.42
  const fh = s * 0.6
  const dx = s * 0.12
  const dy = s * 0.1
  const l = cx - fw / 2 - dx / 2
  const t = cy - fh / 2 + dy / 2
  return {
    FTL: { x: l, y: t },
    FTR: { x: l + fw, y: t },
    FBR: { x: l + fw, y: t + fh },
    FBL: { x: l, y: t + fh },
    BTL: { x: l + dx, y: t - dy },
    BTR: { x: l + fw + dx, y: t - dy },
    BBR: { x: l + fw + dx, y: t + fh - dy },
  }
}

function readRaster(image: HTMLImageElement, w: number, h: number): Raster {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas を使えません')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, w, h)
  return {
    data: ctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
    channels: 4,
  }
}

async function loadPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  await image.decode()
  // ブラウザは EXIF の向きに合わせて回した大きさを返す
  const W = image.naturalWidth
  const H = image.naturalHeight
  const k = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (W * H)))
  const raster = readRaster(
    image,
    Math.max(1, Math.round(W * k)),
    Math.max(1, Math.round(H * k)),
  )
  let focal35: number | null = null
  try {
    const exif = await exifr.parse(file, ['FocalLengthIn35mmFormat'])
    const v = exif?.FocalLengthIn35mmFormat
    if (typeof v === 'number' && v > 5 && v < 400) focal35 = v
  } catch {
    // EXIF がない・読めないときは、ふつうのスマホの広角として扱う
  }
  return {
    url,
    name: file.name.replace(/\.[^.]+$/, ''),
    image,
    width: W,
    height: H,
    raster,
    focal: focalFrom35mm(focal35 ?? DEFAULT_FOCAL_35, W, H),
    focal35,
  }
}

/** 写真の座標（表示の大きさ）→ 読み込んだ画素の座標 */
function toRaster(c: Corners, photo: Photo): Corners {
  const k = photo.raster.width / photo.width
  return Object.fromEntries(
    cornerKeys.map((key) => [key, { x: c[key].x * k, y: c[key].y * k }]),
  ) as Corners
}

function fromRaster(c: Corners, photo: Photo): Corners {
  const k = photo.width / photo.raster.width
  return Object.fromEntries(
    cornerKeys.map((key) => [key, { x: c[key].x * k, y: c[key].y * k }]),
  ) as Corners
}

function cornersToJson(c: Corners) {
  return JSON.stringify(
    Object.fromEntries(
      cornerKeys.map((k) => [k, [Math.round(c[k].x), Math.round(c[k].y)]]),
    ),
  )
}

function parseCorners(text: string): Corners | null {
  try {
    const v = JSON.parse(text)
    const out: Partial<Corners> = {}
    for (const k of cornerKeys) {
      const p = v[k]
      if (Array.isArray(p) && p.length >= 2) out[k] = { x: +p[0], y: +p[1] }
      else if (p && typeof p === 'object') out[k] = { x: +p.x, y: +p.y }
      else return null
      if (!Number.isFinite(out[k]?.x) || !Number.isFinite(out[k]?.y))
        return null
    }
    return out as Corners
  } catch {
    return null
  }
}

/** 描いた結果を canvas にする */
function toCanvas(r: {
  data: Uint8ClampedArray
  width: number
  height: number
}) {
  const canvas = document.createElement('canvas')
  canvas.width = r.width
  canvas.height = r.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas を使えません')
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(r.data), r.width, r.height),
    0,
    0,
  )
  return canvas
}

const nextFrame = () => new Promise((r) => setTimeout(r, 30))

export function BoxPromo() {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [corners, setCorners] = useState<Corners | null>(null)
  const [undo, setUndo] = useState<Corners | null>(null)
  const [mmW, setMmW] = useState('')
  const [mmD, setMmD] = useState('')
  const [mmH, setMmH] = useState('')
  const [clean, setClean] = useState(true)
  const [sideDetail, setSideDetail] = useState(35)
  const [shadow, setShadow] = useState(100)
  const [yaw, setYaw] = useState(14)
  const [pitch, setPitch] = useState(11)
  const [outSide, setOutSide] = useState(1200)
  const [format, setFormat] = useState<'image/webp' | 'image/png'>('image/webp')
  const [busy, setBusy] = useState<'open' | 'snap' | 'export' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy('open')
    try {
      const p = await loadPhoto(file)
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return p
      })
      setCorners(defaultCorners(p.width, p.height))
      setUndo(null)
    } catch {
      toast.error('画像を開けませんでした')
    } finally {
      setBusy(null)
    }
  }

  // 画像の貼り付け（Ctrl+V）でも開く
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const file = [...(e.clipboardData?.files ?? [])].find((f) =>
        f.type.startsWith('image/'),
      )
      if (file) {
        e.preventDefault()
        openFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const mm = [mmW, mmD, mmH].map((v) => Number.parseFloat(v))
  const dims = mm.every((v) => Number.isFinite(v) && v > 0)
    ? { width: mm[0] / mm[2], depth: mm[1] / mm[2] }
    : undefined
  // 読み込んだ画素（縮めていることがある）での焦点距離
  const focal = photo ? photo.focal * (photo.raster.width / photo.width) : 1
  const estimated =
    photo && corners
      ? estimateDims(
          toRaster(corners, photo),
          focal,
          photo.raster.width,
          photo.raster.height,
        )
      : null

  const options = (maxSide: number) => ({
    focal,
    dims,
    maxSide,
    yaw,
    pitch,
    clean,
    sideDetail: sideDetail / 100,
    shadow: shadow / 100,
  })

  // 設定をまとめた文字列（これが変わったときだけ描き直す）
  const settings = JSON.stringify(options(PREVIEW_SIDE))

  // プレビュー（角を動かしている間は待ち、止まってから 1 回描く）
  useEffect(() => {
    if (!photo || !corners) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      try {
        const r = renderBox(
          photo.raster,
          toRaster(corners, photo),
          JSON.parse(settings),
        )
        const url = toCanvas(r).toDataURL('image/png')
        setPreview(url)
      } catch {
        setPreview(null)
      }
    }, 350)
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
  }, [photo, corners, settings])

  const snap = async () => {
    if (!photo || !corners) return
    setBusy('snap')
    await nextFrame()
    try {
      const range = Math.max(
        12,
        Math.max(photo.raster.width, photo.raster.height) * 0.007,
      )
      const r = snapCorners(photo.raster, toRaster(corners, photo), range)
      setUndo(corners)
      setCorners(fromRaster(r.corners, photo))
      const miss = r.snapped.filter((v) => !v).length
      toast.success(
        miss
          ? `辺に寄せました（はっきりした辺が見つからなかった ${miss} 本は、置いた位置のまま）`
          : '辺に寄せました',
      )
    } finally {
      setBusy(null)
    }
  }

  const exportImage = async () => {
    if (!photo || !corners) return
    setBusy('export')
    await nextFrame()
    try {
      const r = renderBox(
        photo.raster,
        toRaster(corners, photo),
        options(outSide),
      )
      const canvas = toCanvas(r)
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, format, 0.9),
      )
      if (!blob) throw new Error()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${photo.name}-box.${format === 'image/webp' ? 'webp' : 'png'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch {
      toast.error('書き出せませんでした')
    } finally {
      setBusy(null)
    }
  }

  const copyCorners = async () => {
    if (!corners) return
    try {
      await navigator.clipboard.writeText(cornersToJson(corners))
      toast.success('角の座標をコピーしました')
    } catch {
      toast.error('コピーできませんでした')
    }
  }
  const pasteCorners = async () => {
    try {
      const c = parseCorners(await navigator.clipboard.readText())
      if (!c) throw new Error()
      setUndo(corners)
      setCorners(c)
    } catch {
      toast.error('角の座標（JSON）を読めませんでした')
    }
  }

  return (
    <div className="space-y-6">
      <DropZone onFiles={(files) => openFile(files[0])}>
        <div className="flex flex-wrap items-center gap-2">
          <FileButton accept="image/*" onFiles={(f) => openFile(f[0])}>
            <ImagePlus />
            写真を選ぶ
          </FileButton>
          {busy === 'open' && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            箱の正面・上・右の側面が写った写真。ドロップ・Ctrl+V
            でも開けます。画像はサーバーに送りません。
          </p>
        </div>
      </DropZone>

      {photo && corners ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="font-semibold">1. 7 つの角を置く</h2>
            <p className="text-sm text-muted-foreground">
              1〜4 は正面の四隅（左上から時計回り）、5・6 は上の面の奥の左右、7
              は右の側面の奥の下です。だいたいの位置に置いて「辺に吸着」を押すと、近くの辺に寄せます。
            </p>
            <Editor photo={photo} corners={corners} onChange={setCorners} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={snap}
              >
                {busy === 'snap' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Magnet />
                )}
                辺に吸着
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!undo}
                onClick={() => {
                  if (!undo) return
                  setCorners(undo)
                  setUndo(null)
                }}
              >
                <Undo2 />
                元に戻す
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={copyCorners}
              >
                <ClipboardCopy />
                座標をコピー
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={pasteCorners}
              >
                <ClipboardPaste />
                座標を貼り付け
              </Button>
              <HelpTip>
                吸着は、置いた線のまわり（写真の長い辺の 0.7%
                くらい）で、両側の色がはっきり違う線を探します。箱に印刷された細い枠線には寄りにくくしていますが、机に溶けた奥の辺や、定規が重なった辺はずれることがあります。合わないときは「元に戻す」で戻して、角を手で直してください。座標は
                JSON（写真の画素）でコピー・貼り付けできます。
              </HelpTip>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">2. できあがり</h2>
            <div
              className="flex items-center justify-center rounded-lg border p-2"
              style={{
                backgroundImage:
                  'repeating-conic-gradient(#e5e7eb 0 25%, #ffffff 0 50%)',
                backgroundSize: '20px 20px',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="作った箱の画像のプレビュー"
                  className="max-h-[60svh] w-auto"
                />
              ) : (
                <p className="p-8 text-sm text-muted-foreground">
                  角が交差しているなどで描けません
                </p>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1 text-sm font-medium">
                箱の実寸（mm）
                <HelpTip>
                  分かれば入れてください。3
                  つとも入れると、その比で面を組み立てます。空のときは写真から推定しますが、側面がほとんど見えない写真や、ふたが反った箱では大きくずれることがあります。
                </HelpTip>
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['幅', mmW, setMmW],
                    ['奥行き', mmD, setMmD],
                    ['高さ', mmH, setMmH],
                  ] as const
                ).map(([label, v, set]) => (
                  <label key={label} className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      value={v}
                      onChange={(e) => set(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5"
                    />
                  </label>
                ))}
              </div>
              {estimated && (
                <p className="text-xs text-muted-foreground">
                  写真からの推定（高さを 1 として）: 幅{' '}
                  {estimated.width.toFixed(2)}・奥行き{' '}
                  {estimated.depth.toFixed(2)}
                  {dims &&
                    `／実寸の比: 幅 ${dims.width.toFixed(2)}・奥行き ${dims.depth.toFixed(2)}`}
                  。焦点距離は{' '}
                  {photo.focal35
                    ? `EXIF の ${photo.focal35}mm（35mm 判換算）`
                    : `EXIF がないので ${DEFAULT_FOCAL_35}mm（35mm 判換算）とみなしています`}
                </p>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <RangeSlider
                label="右へ回す角度"
                value={yaw}
                min={0}
                max={40}
                step={1}
                unit="°"
                onChange={setYaw}
              />
              <RangeSlider
                label="見下ろす角度"
                value={pitch}
                min={0}
                max={35}
                step={1}
                unit="°"
                onChange={setPitch}
              />
              <RangeSlider
                label="側面の映り込みを残す"
                help="側面の下半分にある細かい筋（机の木目などの映り込み）をどれだけ残すか。100% でそのまま。"
                value={sideDetail}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={setSideDetail}
              />
              <RangeSlider
                label="影の濃さ"
                value={shadow}
                min={0}
                max={150}
                step={10}
                unit="%"
                onChange={setShadow}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clean}
                onChange={(e) => setClean(e.target.checked)}
                className="accent-primary"
              />
              写り込み・光のむら・色味を補正する
            </label>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">長い辺</span>
                <select
                  value={outSide}
                  onChange={(e) => setOutSide(+e.target.value)}
                  className="block rounded-md border bg-background px-2 py-1.5"
                >
                  {[800, 1200, 1600, 2000].map((v) => (
                    <option key={v} value={v}>
                      {v}px
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">形式</span>
                <select
                  value={format}
                  onChange={(e) =>
                    setFormat(e.target.value as 'image/webp' | 'image/png')
                  }
                  className="block rounded-md border bg-background px-2 py-1.5"
                >
                  <option value="image/webp">WebP</option>
                  <option value="image/png">PNG</option>
                </select>
              </label>
              <Button
                type="button"
                disabled={busy !== null}
                onClick={exportImage}
              >
                {busy === 'export' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                ダウンロード
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

/** ドラッグで動かす 7 つの角と、9 本の辺 */
function Editor({
  photo,
  corners,
  onChange,
}: {
  photo: Photo
  corners: Corners
  onChange: (c: Corners) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ key: CornerKey; dx: number; dy: number } | null>(
    null,
  )
  const [displayScale, setDisplayScale] = useState(1)
  const [selected, setSelected] = useState<CornerKey | null>(null)
  const [dragging, setDragging] = useState(false)
  const { width: W, height: H } = photo

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => setDisplayScale(box.clientWidth / W))
    ro.observe(box)
    return () => ro.disconnect()
  }, [W])

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }
  const move = (key: CornerKey, p: Pt) =>
    onChange({
      ...corners,
      [key]: {
        x: Math.min(W, Math.max(0, p.x)),
        y: Math.min(H, Math.max(0, p.y)),
      },
    })

  const loupePoint = dragging && selected ? corners[selected] : null

  // ルーペ（ドラッグ中に、指やカーソルで隠れる所を拡大して出す）
  useEffect(() => {
    const canvas = loupeRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !loupePoint) return
    const size = canvas.width
    const z = Math.min(8, Math.max(2, displayScale * 4))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.setTransform(
      z,
      0,
      0,
      z,
      size / 2 - loupePoint.x * z,
      size / 2 - loupePoint.y * z,
    )
    ctx.imageSmoothingEnabled = z < 4
    ctx.drawImage(photo.image, 0, 0, W, H)
    ctx.lineWidth = 1.5 / z
    ctx.strokeStyle = '#22d3ee'
    for (const [a, b] of boxEdges) {
      ctx.beginPath()
      ctx.moveTo(corners[a].x, corners[a].y)
      ctx.lineTo(corners[b].x, corners[b].y)
      ctx.stroke()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(size / 2, size / 2 - 12)
    ctx.lineTo(size / 2, size / 2 + 12)
    ctx.moveTo(size / 2 - 12, size / 2)
    ctx.lineTo(size / 2 + 12, size / 2)
    ctx.stroke()
  })

  const r = 9 / displayScale
  const hit = 22 / displayScale
  const poly = (keys: CornerKey[]) =>
    keys.map((k) => `${corners[k].x},${corners[k].y}`).join(' ')

  const startDrag = (key: CornerKey) => (e: React.PointerEvent<SVGElement>) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const p = toImage(e)
    dragRef.current = {
      key,
      dx: corners[key].x - p.x,
      dy: corners[key].y - p.y,
    }
    setSelected(key)
    setDragging(true)
    ;(e.currentTarget as SVGElement).focus({ preventScroll: true })
  }
  const onMove = (e: React.PointerEvent<SVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const p = toImage(e)
    move(drag.key, { x: p.x + drag.dx, y: p.y + drag.dy })
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }
  const onKey = (key: CornerKey) => (e: React.KeyboardEvent<SVGElement>) => {
    const step = e.shiftKey ? 10 : 1
    const d =
      e.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : e.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : e.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : e.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null
    if (!d) return
    e.preventDefault()
    move(key, { x: corners[key].x + d.x, y: corners[key].y + d.y })
  }

  const loupeLeft =
    loupePoint !== null && !(loupePoint.x < W / 2 && loupePoint.y < H / 2)

  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <div
        ref={boxRef}
        className="relative mx-auto select-none"
        style={{ width: `min(100%, calc(70svh * ${W / H}))` }}
      >
        <img
          src={photo.url}
          alt="箱の写真"
          draggable={false}
          className="block h-auto w-full"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 size-full overflow-visible"
          aria-label="箱の 7 つの角"
        >
          <polygon
            points={poly(['FTL', 'FTR', 'FBR', 'FBL'])}
            fill="rgba(34,211,238,0.12)"
            pointerEvents="none"
          />
          <polygon
            points={poly(['BTL', 'BTR', 'FTR', 'FTL'])}
            fill="rgba(249,115,22,0.12)"
            pointerEvents="none"
          />
          <polygon
            points={poly(['FTR', 'BTR', 'BBR', 'FBR'])}
            fill="rgba(168,85,247,0.12)"
            pointerEvents="none"
          />
          {boxEdges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={corners[a].x}
              y1={corners[a].y}
              x2={corners[b].x}
              y2={corners[b].y}
              stroke="#22d3ee"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
          {cornerKeys.map((key) => {
            const p = corners[key]
            const on = selected === key
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG の中なので button 要素は置けない
              <g
                key={key}
                tabIndex={0}
                role="button"
                aria-label={`${cornerLabels[key].long}の角（矢印キーで動かす）`}
                onPointerDown={startDrag(key)}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKey(key)}
                onFocus={() => setSelected(key)}
                className="cursor-grab outline-none active:cursor-grabbing"
                style={{ touchAction: 'none' }}
              >
                <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={on ? 'rgba(250,204,21,0.5)' : 'rgba(34,211,238,0.25)'}
                  stroke={on ? '#facc15' : '#ffffff'}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={p.x} cy={p.y} r={r * 0.15} fill="#ffffff" />
                <text
                  x={p.x + r * 1.1}
                  y={p.y - r * 1.1}
                  fontSize={r * 1.6}
                  fontWeight={700}
                  fill="#ffffff"
                  stroke="#0e7490"
                  strokeWidth={r * 0.35}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {cornerLabels[key].short}
                </text>
              </g>
            )
          })}
        </svg>
        {loupePoint && (
          <canvas
            ref={loupeRef}
            width={160}
            height={160}
            className={cn(
              'pointer-events-none absolute top-2 size-40 rounded-full border-2 border-white shadow-lg',
              loupeLeft ? 'left-2' : 'right-2',
            )}
          />
        )}
      </div>
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

function FileButton({
  accept,
  onFiles,
  children,
}: {
  accept?: string
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
          className="hidden"
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
    </Button>
  )
}
