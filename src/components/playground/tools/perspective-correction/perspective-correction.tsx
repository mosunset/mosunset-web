import {
  ClipboardCopy,
  Download,
  ImagePlus,
  Loader2,
  Magnet,
  RotateCw,
  Scan,
  ScanSearch,
  Sparkles,
  Spline,
} from 'lucide-react'
import type * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HelpTip, RangeSlider, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { autoDetect, CONFIDENT_SCORE, fitEdges } from './detect'
import { makeSamplePhoto, sampleQuad } from './sample'
import {
  arcLength,
  bezier,
  edgeControls,
  estimateAspect,
  handleBase,
  isConvex,
  isStraight,
  type Mapper,
  makeMapper,
  type Pt,
  type Quad,
  quadArea,
  render,
  type Source,
  straightHandles,
} from './warp'

type Photo = {
  url: string
  revoke: boolean
  name: string
  image: HTMLImageElement
  width: number
  height: number
  /** 書き出しに使う写真の画素 */
  full: Source
  /** プレビューに使う縮めた写真の画素 */
  preview: Source
}

/** ドラッグで動かすもの */
type Target =
  | { kind: 'corner'; i: number }
  | { kind: 'handle'; i: number; j: 0 | 1 }
  | { kind: 'mid'; i: number }

type AspectKey =
  | 'auto'
  | 'iso'
  | 'letter'
  | 'card'
  | 'postcard'
  | 'square'
  | '4:3'
  | '16:9'
  | 'custom'

/** 縦横比の候補（ratio は 短い辺 / 長い辺。縦長か横長かは写真から決める） */
const aspects: { value: AspectKey; label: string; ratio?: number }[] = [
  { value: 'auto', label: '写真から推定' },
  { value: 'iso', label: 'A判・B判（1:√2）', ratio: Math.SQRT1_2 },
  { value: 'letter', label: 'レター（8.5:11）', ratio: 8.5 / 11 },
  { value: 'card', label: '名刺（55:91）', ratio: 55 / 91 },
  { value: 'postcard', label: 'はがき（100:148）', ratio: 100 / 148 },
  { value: 'square', label: '正方形', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 3 / 4 },
  { value: '16:9', label: '16:9', ratio: 9 / 16 },
  { value: 'custom', label: '数値で指定' },
]

type Format = 'image/png' | 'image/jpeg' | 'image/webp'
const formats: { value: Format; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
]

const cornerNames = ['左上', '右上', '右下', '左下']
const edgeNames = ['上の辺', '右の辺', '下の辺', '左の辺']

/** 書き出す画像の上限（ブラウザの canvas が扱える大きさに収める） */
const MAX_OUTPUT_PIXELS = 40_000_000
const MAX_OUTPUT_SIDE = 12_000
/** 読み込む写真の上限（これより大きい写真は縮めてから使う） */
const MAX_SOURCE_PIXELS = 50_000_000
const PREVIEW_SOURCE_SIDE = 1600
const PREVIEW_SIDE = 900

function readPixels(
  image: HTMLImageElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas を使えません')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height).data
}

async function loadPhoto(
  url: string,
  name: string,
  revoke: boolean,
): Promise<Photo> {
  const image = new Image()
  image.src = url
  await image.decode()
  const width = image.naturalWidth
  const height = image.naturalHeight
  const fullK = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (width * height)))
  const fw = Math.max(1, Math.round(width * fullK))
  const fh = Math.max(1, Math.round(height * fullK))
  const prevK = Math.min(1, PREVIEW_SOURCE_SIDE / Math.max(width, height))
  const pw = Math.max(1, Math.round(width * prevK))
  const ph = Math.max(1, Math.round(height * prevK))
  return {
    url,
    revoke,
    name,
    image,
    width,
    height,
    full: {
      data: readPixels(image, fw, fh),
      width: fw,
      height: fh,
      scale: fullK,
    },
    preview: {
      data: readPixels(image, pw, ph),
      width: pw,
      height: ph,
      scale: prevK,
    },
  }
}

/** 写真を開いたときの四角形（少し内側） */
function defaultQuad(w: number, h: number): Quad {
  const mx = w * 0.12
  const my = h * 0.12
  return {
    corners: [
      { x: mx, y: my },
      { x: w - mx, y: my },
      { x: w - mx, y: h - my },
      { x: mx, y: h - my },
    ],
    handles: straightHandles(),
  }
}

/** 四隅を写真の中に収める */
function clampQuad(q: Quad, w: number, h: number): Quad {
  return {
    corners: q.corners.map((p) => ({
      x: Math.min(w, Math.max(0, p.x)),
      y: Math.min(h, Math.max(0, p.y)),
    })) as Quad['corners'],
    handles: q.handles,
  }
}

/** 重い計算の前に、「調べています」を先に描かせる */
const nextPaint = () => new Promise((r) => setTimeout(r, 30))

function cloneQuad(q: Quad): Quad {
  return {
    corners: q.corners.map((p) => ({ ...p })) as Quad['corners'],
    handles: q.handles.map(([a, b]) => [{ ...a }, { ...b }]) as Quad['handles'],
  }
}

function targetPos(q: Quad, t: Target): Pt {
  if (t.kind === 'corner') return q.corners[t.i]
  if (t.kind === 'handle') {
    const base = handleBase(q, t.i, t.j)
    const h = q.handles[t.i][t.j]
    return { x: base.x + h.x, y: base.y + h.y }
  }
  return bezier(edgeControls(q, t.i), 0.5)
}

function moveTarget(
  q: Quad,
  t: Target,
  p: Pt,
  width: number,
  height: number,
): Quad {
  const next = cloneQuad(q)
  if (t.kind === 'corner') {
    next.corners[t.i] = {
      x: Math.min(width, Math.max(0, p.x)),
      y: Math.min(height, Math.max(0, p.y)),
    }
  } else if (t.kind === 'handle') {
    const base = handleBase(q, t.i, t.j)
    next.handles[t.i][t.j] = { x: p.x - base.x, y: p.y - base.y }
  } else {
    // 真ん中の点は、両方の持ち手を同じだけ動かす（B(0.5) は持ち手の和の 3/8 だけ動く）
    const now = targetPos(q, t)
    const dx = ((p.x - now.x) * 4) / 3
    const dy = ((p.y - now.y) * 4) / 3
    for (const j of [0, 1] as const) {
      next.handles[t.i][j] = {
        x: q.handles[t.i][j].x + dx,
        y: q.handles[t.i][j].y + dy,
      }
    }
  }
  return next
}

/** 出力を 90° 右に回す（結果の左上に、今の左下が来る） */
function rotateQuad(q: Quad): Quad {
  const c = cloneQuad(q)
  return {
    corners: [c.corners[3], c.corners[0], c.corners[1], c.corners[2]],
    handles: [c.handles[3], c.handles[0], c.handles[1], c.handles[2]],
  }
}

/** 書き出しの大きさ。写っている辺の長さを、縮めずに使える大きさにする */
function outputSize(q: Quad, curved: boolean, ratio: number, scale: number) {
  const len = [0, 1, 2, 3].map((i) => arcLength(edgeControls(q, i, curved)))
  let w = Math.max(len[0], len[2])
  let h = w / ratio
  const side = Math.max(len[1], len[3])
  if (h < side) {
    h = side
    w = h * ratio
  }
  w *= scale
  h *= scale
  const k = Math.min(
    1,
    Math.sqrt(MAX_OUTPUT_PIXELS / (w * h)),
    MAX_OUTPUT_SIDE / Math.max(w, h),
  )
  return {
    width: Math.max(1, Math.round(w * k)),
    height: Math.max(1, Math.round(h * k)),
    limited: k < 1,
  }
}

function fitSize(w: number, h: number, side: number) {
  const k = Math.min(1, side / Math.max(w, h))
  return {
    width: Math.max(1, Math.round(w * k)),
    height: Math.max(1, Math.round(h * k)),
  }
}

function formatRatio(r: number) {
  return r >= 1 ? `${r.toFixed(3)} : 1` : `1 : ${(1 / r).toFixed(3)}`
}

/** 推定した比に近い、よくある紙の比 */
function nearPaper(r: number): string | null {
  const s = r > 1 ? 1 / r : r
  const near = aspects.find(
    (a) => a.ratio !== undefined && Math.abs(a.ratio - s) / a.ratio < 0.03,
  )
  return near ? near.label : null
}

export function PerspectiveCorrection() {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null)
  const [curved, setCurved] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [aspect, setAspect] = useState<AspectKey>('auto')
  const [customW, setCustomW] = useState(210)
  const [customH, setCustomH] = useState(297)
  const [scale, setScale] = useState(100)
  const [format, setFormat] = useState<Format>('image/png')
  const [quality, setQuality] = useState(92)
  const [jpegBg, setJpegBg] = useState('#ffffff')
  const [opening, setOpening] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)

  useEffect(
    () => () => {
      if (photo?.revoke) URL.revokeObjectURL(photo.url)
    },
    [photo],
  )

  const open = async (
    url: string,
    name: string,
    revoke: boolean,
    initial?: Quad,
  ) => {
    setOpening(true)
    try {
      const p = await loadPhoto(url, name, revoke)
      setPhoto(p)
      if (initial) {
        setQuad(cloneQuad(initial))
        if (!isStraight(initial)) setCurved(true)
      } else {
        // 開いたら、まず自動で四隅と辺を探す
        setQuad(defaultQuad(p.width, p.height))
        await detect(p, true)
      }
    } catch {
      if (revoke) URL.revokeObjectURL(url)
      toast.error(
        '画像を読み込めませんでした（HEIC などブラウザが開けない形式は使えません）',
      )
    } finally {
      setOpening(false)
    }
  }

  /** 写真の中の四角いものを自動で探す（quiet なら、見つかったときは何も言わない） */
  const detect = async (p: Photo, quiet = false) => {
    setDetecting(true)
    await nextPaint()
    try {
      const found = autoDetect(p.preview, p.width, p.height)
      if (!found) {
        toast.error(
          '四角いものを見つけられませんでした。角をドラッグして合わせてください',
        )
        return
      }
      setQuad(clampQuad(found.quad, p.width, p.height))
      if (!isStraight(found.quad)) setCurved(true)
      if (found.score < CONFIDENT_SCORE) {
        toast.warning(
          'はっきりした四角形が見つからなかったので、いちばん近いものに合わせました。角を確かめてください',
        )
      } else if (!quiet) {
        toast.success('四隅と辺を合わせました')
      }
    } catch {
      toast.error('自動で探せませんでした')
    } finally {
      setDetecting(false)
    }
  }

  /** 手で置いた四隅を手がかりに、辺の本当の位置へ寄せる */
  const snapEdges = async () => {
    if (!photo || !quad) return
    setDetecting(true)
    await nextPaint()
    try {
      const diag = Math.hypot(photo.width, photo.height)
      // 広く探すと、箱の側面の向こう側の辺まで行ってしまうので、近くだけを探す
      const fitted = fitEdges(photo.preview, quad, diag * 0.008)
      setQuad(clampQuad(fitted, photo.width, photo.height))
      if (!isStraight(fitted)) setCurved(true)
    } catch {
      toast.error('辺を合わせられませんでした')
    } finally {
      setDetecting(false)
    }
  }

  const openFile = (file: File | undefined) => {
    if (!file) return
    const name = file.name.replace(/\.[^.]+$/, '') || 'image'
    void open(URL.createObjectURL(file), name, true)
  }

  const openSample = async () => {
    try {
      const blob = await makeSamplePhoto()
      await open(URL.createObjectURL(blob), 'sample', true, sampleQuad)
    } catch {
      toast.error('サンプルの画像を作れませんでした')
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

  const convex = quad ? isConvex(quad.corners) : false
  const mapper = useMemo(
    () => (quad && convex ? makeMapper(quad, curved) : null),
    [quad, curved, convex],
  )
  const estimated = useMemo(
    () =>
      quad && photo && convex
        ? estimateAspect(quad.corners, photo.width, photo.height)
        : 1,
    [quad, photo, convex],
  )
  const ratio = useMemo(() => {
    if (aspect === 'auto') return estimated
    if (aspect === 'custom')
      return customW > 0 && customH > 0 ? customW / customH : estimated
    const r = aspects.find((a) => a.value === aspect)?.ratio ?? 1
    return estimated >= 1 ? 1 / r : r
  }, [aspect, estimated, customW, customH])
  const size = useMemo(
    () => (quad ? outputSize(quad, curved, ratio, scale / 100) : null),
    [quad, curved, ratio, scale],
  )

  // プレビュー（動かしている間は、描けるときにまとめて 1 回）
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !photo || !mapper || !size) return
    const id = requestAnimationFrame(() => {
      const { width, height } = fitSize(size.width, size.height, PREVIEW_SIDE)
      canvas.width = width
      canvas.height = height
      canvas
        .getContext('2d')
        ?.putImageData(render(mapper, photo.preview, width, height, 1), 0, 0)
    })
    return () => cancelAnimationFrame(id)
  }, [photo, mapper, size])

  const renderFull = async (): Promise<HTMLCanvasElement | null> => {
    if (!photo || !mapper || !size || !quad) return null
    setExporting(true)
    // 「書き出しています」を先に描かせる
    await new Promise((r) => setTimeout(r, 30))
    try {
      const { width, height } = size
      // 写真の何画素が出力の 1 画素になるか。大きく縮めるときは 1 画素を何点かで平均する
      const footprint = Math.sqrt(
        (quadArea(quad.corners) * photo.full.scale ** 2) / (width * height),
      )
      const ss = footprint > 3 ? 3 : footprint > 1.5 ? 2 : 1
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas を使えません')
      ctx.putImageData(render(mapper, photo.full, width, height, ss), 0, 0)
      return canvas
    } catch {
      toast.error(
        '書き出せませんでした（大きすぎるときは「大きさ」を下げてください）',
      )
      return null
    } finally {
      setExporting(false)
    }
  }

  const toBlob = (canvas: HTMLCanvasElement, type: Format) => {
    let target = canvas
    if (type === 'image/jpeg') {
      // JPEG は透明を持てないので、背景の色を敷く
      target = document.createElement('canvas')
      target.width = canvas.width
      target.height = canvas.height
      const ctx = target.getContext('2d')
      if (ctx) {
        ctx.fillStyle = jpegBg
        ctx.fillRect(0, 0, target.width, target.height)
        ctx.drawImage(canvas, 0, 0)
      }
    }
    return new Promise<Blob | null>((resolve) =>
      target.toBlob(resolve, type, quality / 100),
    )
  }

  const download = async () => {
    const canvas = await renderFull()
    if (!canvas || !photo) return
    const blob = await toBlob(canvas, format)
    if (!blob) {
      toast.error('書き出せませんでした')
      return
    }
    const ext = formats.find((f) => f.value === format)?.ext ?? 'png'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${photo.name}-corrected.${ext}`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const copy = async () => {
    const canvas = await renderFull()
    if (!canvas) return
    try {
      const blob = await toBlob(canvas, 'image/png')
      if (!blob) throw new Error()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      toast.success('画像をコピーしました')
    } catch {
      toast.error(
        'コピーできませんでした（ブラウザが対応していないかもしれません）',
      )
    }
  }

  const paper = nearPaper(estimated)

  return (
    <div className="space-y-6">
      <DropZone onFiles={(files) => openFile(files[0])}>
        <div className="flex flex-wrap items-center gap-2">
          <FileButton accept="image/*" onFiles={(f) => openFile(f[0])}>
            <ImagePlus />
            画像を選ぶ
          </FileButton>
          <Button type="button" variant="ghost" onClick={openSample}>
            <Sparkles />
            サンプルで試す
          </Button>
          {opening && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            ここにドロップ・Ctrl+V
            で貼り付けても開けます。画像はサーバーに送りません。
          </p>
        </div>
      </DropZone>

      {photo && quad ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="font-semibold">1. 四隅と辺を合わせる</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={curved}
                  onChange={(e) => setCurved(e.target.checked)}
                  className="accent-primary"
                />
                辺を曲げる（ベジエ曲線）
                <HelpTip>
                  紙の反りやページのたわみで辺が少しうねっているときに使います。辺の真ん中の丸で全体をふくらませ、両側の四角（持ち手）で
                  S
                  字のうねりも合わせられます。曲げた分は、遠近の縮みをくずさずに内側へなめらかに広げます。
                </HelpTip>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="accent-primary"
                />
                方眼を重ねる
              </label>
            </div>
            <Editor
              photo={photo}
              quad={quad}
              curved={curved}
              mapper={showGrid ? mapper : null}
              onChange={setQuad}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={detecting}
                onClick={() => detect(photo)}
              >
                {detecting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ScanSearch />
                )}
                自動で検出
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={detecting || !convex}
                onClick={snapEdges}
              >
                <Magnet />
                今の四隅から辺に吸着
              </Button>
              <HelpTip>
                「自動で検出」は、写真の中でいちばん大きく、まわりと色がはっきり違う四角いもの（紙・画面・看板など）を探し、辺のうねりもベジエ曲線で合わせます。うまく見つからないときは、角をだいたいの位置に置いてから「今の四隅から辺に吸着」を押すと、近くの辺に寄せて、角と曲がりを細かく合わせます。
              </HelpTip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQuad(rotateQuad(quad))}
              >
                <RotateCw />
                結果を 90° 回す
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setQuad({ ...cloneQuad(quad), handles: straightHandles() })
                }
                disabled={isStraight(quad)}
              >
                <Spline />
                辺をまっすぐに戻す
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQuad(defaultQuad(photo.width, photo.height))}
              >
                <Scan />
                四隅をやり直す
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              オレンジの辺が結果の上になります。点をクリックして選び、矢印キーで
              1 px（Shift で 10 px）ずつ動かせます。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">2. 結果</h2>
            {!convex ? (
              <p className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-sm">
                四隅がねじれています。左上・右上・右下・左下の順に、四角形になるよう角を並べ直してください。
              </p>
            ) : (
              <div className="flex justify-center rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
                <canvas
                  ref={previewRef}
                  className="block h-auto max-h-[70svh] w-auto max-w-full"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="書き出しの大きさ"
                value={size ? `${size.width}×${size.height}` : '—'}
                unit="px"
                hint={
                  size?.limited
                    ? `約 ${MAX_OUTPUT_PIXELS / 1e4} 万画素までに縮めています`
                    : undefined
                }
              />
              <Stat
                label="推定した縦横比（幅:高さ）"
                value={convex ? formatRatio(estimated) : '—'}
                hint={paper ? `${paper} に近い` : undefined}
              />
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-semibold">3. 出力の形</h3>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex items-center gap-1">
                  縦横比
                  <HelpTip>
                    「写真から推定」は、写真の真ん中をカメラの正面とみなして、四隅から本当の縦横比を計算します（トリミングした写真や、遠近がほとんどない写真では外れやすくなります）。分かっているときは紙の大きさを選ぶと確実です。縦長か横長かは写真から決めます。
                  </HelpTip>
                </span>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as AspectKey)}
                  className="h-8 rounded-md border bg-background px-2"
                >
                  {aspects.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                {aspect === 'custom' && (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={customW}
                      onChange={(e) => setCustomW(Number(e.target.value))}
                      aria-label="幅"
                      className="h-8 w-20 rounded-md border bg-background px-2"
                    />
                    ×
                    <input
                      type="number"
                      min={1}
                      value={customH}
                      onChange={(e) => setCustomH(Number(e.target.value))}
                      aria-label="高さ"
                      className="h-8 w-20 rounded-md border bg-background px-2"
                    />
                    <span className="text-muted-foreground">（幅 × 高さ）</span>
                  </span>
                )}
              </label>
              <RangeSlider
                label="大きさ"
                help="100% は、写真に写っている長いほうの辺の画素数に合わせた大きさです。上げても細かさは増えません。"
                value={scale}
                min={10}
                max={200}
                step={5}
                unit="%"
                onChange={setScale}
              />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="flex items-center gap-1">
                  {formats.map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      size="sm"
                      variant={format === f.value ? 'default' : 'outline'}
                      onClick={() => setFormat(f.value)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </span>
                {format !== 'image/png' && (
                  <label className="flex items-center gap-2">
                    画質
                    <input
                      type="range"
                      min={50}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-24 accent-primary"
                    />
                    <span className="font-mono tabular-nums">{quality}</span>
                  </label>
                )}
                {format === 'image/jpeg' && (
                  <label className="flex items-center gap-2">
                    写真の外の色
                    <input
                      type="color"
                      value={jpegBg}
                      onChange={(e) => setJpegBg(e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                    />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!mapper || exporting}
                  onClick={download}
                >
                  {exporting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  ダウンロード
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mapper || exporting}
                  onClick={copy}
                >
                  <ClipboardCopy />
                  コピー
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          斜めから撮った書類・ホワイトボード・看板・画面などの写真を開くと、ここで四隅を合わせて正面から見た形に直せます。
          <br />
          紙の反りなどで辺が少しうねっていても、辺をベジエ曲線で曲げて合わせられます。
        </p>
      )}
    </div>
  )
}

/** 写真の上で四隅・持ち手を動かす部分 */
function Editor({
  photo,
  quad,
  curved,
  mapper,
  onChange,
}: {
  photo: Photo
  quad: Quad
  curved: boolean
  /** 方眼を描くときだけ渡す */
  mapper: Mapper | null
  onChange: (q: Quad) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ target: Target; dx: number; dy: number } | null>(
    null,
  )
  const [displayScale, setDisplayScale] = useState(1)
  const [selected, setSelected] = useState<Target | null>(null)
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

  const loupePoint = dragging && selected ? targetPos(quad, selected) : null

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
    for (let i = 0; i < 4; i++) {
      const c = edgeControls(quad, i, curved)
      ctx.strokeStyle = i === 0 ? '#f97316' : '#22d3ee'
      ctx.beginPath()
      ctx.moveTo(c[0].x, c[0].y)
      ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y)
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

  const r = 8 / displayScale
  const hit = 20 / displayScale

  const pathD = (() => {
    let d = `M${quad.corners[0].x} ${quad.corners[0].y}`
    for (let i = 0; i < 4; i++) {
      const c = edgeControls(quad, i, curved)
      d += ` C${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`
    }
    return `${d}Z`
  })()

  const topD = (() => {
    const c = edgeControls(quad, 0, curved)
    return `M${c[0].x} ${c[0].y} C${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`
  })()

  const gridLines = useMemo(() => {
    if (!mapper) return []
    const lines: string[] = []
    const N = 8
    const steps = 24
    for (let k = 1; k < N; k++) {
      for (const dir of [0, 1]) {
        const pts: string[] = []
        for (let s = 0; s <= steps; s++) {
          const a = k / N
          const b = s / steps
          const p = dir === 0 ? mapper.map(b, a) : mapper.map(a, b)
          if (p) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        }
        lines.push(pts.join(' '))
      }
    }
    return lines
  }, [mapper])

  const startDrag = (t: Target) => (e: React.PointerEvent<SVGElement>) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const p = toImage(e)
    const now = targetPos(quad, t)
    dragRef.current = { target: t, dx: now.x - p.x, dy: now.y - p.y }
    setSelected(t)
    setDragging(true)
    ;(e.currentTarget as SVGElement).focus({ preventScroll: true })
  }
  const onMove = (e: React.PointerEvent<SVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const p = toImage(e)
    onChange(
      moveTarget(
        quad,
        drag.target,
        { x: p.x + drag.dx, y: p.y + drag.dy },
        W,
        H,
      ),
    )
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }
  const onKey = (t: Target) => (e: React.KeyboardEvent<SVGElement>) => {
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
    const now = targetPos(quad, t)
    onChange(moveTarget(quad, t, { x: now.x + d.x, y: now.y + d.y }, W, H))
  }

  const same = (a: Target | null, b: Target) =>
    !!a &&
    a.kind === b.kind &&
    a.i === b.i &&
    (a.kind !== 'handle' || (b.kind === 'handle' && a.j === b.j))

  const handleProps = (t: Target, label: string) => ({
    tabIndex: 0,
    role: 'button',
    'aria-label': `${label}（矢印キーで動かす）`,
    onPointerDown: startDrag(t),
    onPointerMove: onMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: onKey(t),
    onFocus: () => setSelected(t),
    className: 'cursor-grab outline-none active:cursor-grabbing',
    style: { touchAction: 'none' } as React.CSSProperties,
  })

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
          alt="元の画像"
          draggable={false}
          className="block h-auto w-full"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 size-full overflow-visible"
          aria-label="四隅と辺の持ち手"
        >
          {/* 四角形の外を暗くする */}
          <path
            d={`M0 0H${W}V${H}H0Z ${pathD}`}
            fillRule="evenodd"
            fill="rgba(0,0,0,0.35)"
            pointerEvents="none"
          />
          {gridLines.map((pts) => (
            <polyline
              key={pts}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
          <path
            d={pathD}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={topD}
            fill="none"
            stroke="#f97316"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />

          {curved &&
            [0, 1, 2, 3].map((i) => {
              const c = edgeControls(quad, i)
              const mid = bezier(c, 0.5)
              return (
                <g key={`edge-${i}`}>
                  {([0, 1] as const).map((j) => {
                    const from = j === 0 ? c[0] : c[3]
                    const p = c[j + 1]
                    const t: Target = { kind: 'handle', i, j }
                    return (
                      <g key={j}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={p.x}
                          y2={p.y}
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                        <g
                          {...handleProps(
                            t,
                            `${edgeNames[i]}の持ち手 ${j + 1}`,
                          )}
                        >
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={hit}
                            fill="transparent"
                          />
                          <rect
                            x={p.x - r * 0.7}
                            y={p.y - r * 0.7}
                            width={r * 1.4}
                            height={r * 1.4}
                            fill={same(selected, t) ? '#facc15' : '#ffffff'}
                            stroke="#0e7490"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      </g>
                    )
                  })}
                  <g
                    {...handleProps(
                      { kind: 'mid', i },
                      `${edgeNames[i]}の真ん中（ふくらませる）`,
                    )}
                  >
                    <circle cx={mid.x} cy={mid.y} r={hit} fill="transparent" />
                    <circle
                      cx={mid.x}
                      cy={mid.y}
                      r={r * 0.75}
                      fill={
                        same(selected, { kind: 'mid', i })
                          ? '#facc15'
                          : 'rgba(14,116,144,0.85)'
                      }
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                </g>
              )
            })}

          {quad.corners.map((p, i) => {
            const t: Target = { kind: 'corner', i }
            return (
              <g
                key={cornerNames[i]}
                {...handleProps(t, `${cornerNames[i]}の角`)}
              >
                <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={
                    same(selected, t)
                      ? 'rgba(250,204,21,0.5)'
                      : 'rgba(34,211,238,0.25)'
                  }
                  stroke={same(selected, t) ? '#facc15' : '#ffffff'}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={p.x} cy={p.y} r={r * 0.18} fill="#ffffff" />
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
