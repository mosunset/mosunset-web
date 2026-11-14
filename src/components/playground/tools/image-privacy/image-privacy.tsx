import {
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Package,
  Trash2,
  X,
} from 'lucide-react'
import type * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HelpTip, RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  type Background,
  type FaceBox,
  type FaceEffect,
  type FaceShape,
  padBox,
  renderResult,
  type Settings,
  visibleFaces,
} from './render'
import { detectFaces, type SegmentModel, segment } from './vision'
import { makeZip } from './zip'

/** これより大きい画像は、長い辺をこの大きさに縮めて扱う */
const MAX_SIDE = 4096

type Item = {
  id: string
  name: string
  /** 縮めた後の元画像 */
  source: HTMLCanvasElement
  thumb: string
  /** モデルごとの「残すもの」の確からしさ */
  conf: Partial<Record<SegmentModel, Uint8ClampedArray>>
  faces: FaceBox[] | null
  /** faces を探したときの「小さな顔も探す」 */
  facesSmall: boolean
  error: string | null
}

type Format = 'png' | 'jpeg'

const newId = () => Math.random().toString(36).slice(2, 10)

/** ファイルを読み込んで canvas にする（スマホの写真の向きはブラウザが直してくれる） */
async function loadItem(file: File): Promise<Item> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(
      1,
      MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
    )
    const source = document.createElement('canvas')
    source.width = Math.round(img.naturalWidth * scale)
    source.height = Math.round(img.naturalHeight * scale)
    source.getContext('2d')?.drawImage(img, 0, 0, source.width, source.height)
    const t = 160 / Math.max(source.width, source.height)
    const thumb = document.createElement('canvas')
    thumb.width = Math.max(1, Math.round(source.width * t))
    thumb.height = Math.max(1, Math.round(source.height * t))
    thumb.getContext('2d')?.drawImage(source, 0, 0, thumb.width, thumb.height)
    return {
      id: newId(),
      name: file.name,
      source,
      thumb: thumb.toDataURL('image/jpeg', 0.8),
      conf: {},
      faces: null,
      facesSmall: false,
      error: null,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const canvasToBlob = (c: HTMLCanvasElement, format: Format) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('書き出せませんでした'))),
      `image/${format}`,
      0.92,
    ),
  )

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const outputName = (name: string, format: Format) =>
  `${name.replace(/\.[^.]+$/, '') || 'image'}-edited.${format === 'jpeg' ? 'jpg' : 'png'}`

/** いくつかの中から 1 つ選ぶボタンの列 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-md border p-1"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 rounded px-2.5 py-1 text-xs whitespace-nowrap text-muted-foreground',
            value === v && 'bg-muted font-medium text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </fieldset>
  )
}

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-sm">
        {label}
        {help && <HelpTip>{help}</HelpTip>}
      </div>
      {children}
    </div>
  )
}

/** 背景を消す・顔をぼかすの切り替え */
function ModeToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

const checkerboard =
  'bg-[length:20px_20px] bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] dark:bg-[conic-gradient(#374151_25%,#1f2937_0_50%,#374151_0_75%,#1f2937_0)]'

export function ImagePrivacy() {
  const [items, setItems] = useState<Item[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [model, setModel] = useState<SegmentModel>('person')
  const [smallFaces, setSmallFaces] = useState(true)
  const [format, setFormat] = useState<Format>('png')
  const [showOriginal, setShowOriginal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    removeBackground: true,
    blurFaces: false,
    threshold: 0.5,
    softness: 0.15,
    background: 'transparent',
    backgroundColor: '#ffffff',
    backgroundImage: null,
    backgroundBlur: 4,
    faceEffect: 'blur',
    faceShape: 'ellipse',
    strength: 5,
    fillColor: '#111827',
    padding: 0.2,
    minScore: 0.5,
  })
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const transparent =
    settings.removeBackground && settings.background === 'transparent'
  const outFormat: Format = transparent ? 'png' : format

  /** その画像に、まだ済んでいない解析があるか */
  const needsWork = useCallback(
    (item: Item) =>
      !item.error &&
      ((settings.removeBackground && !item.conf[model]) ||
        (settings.blurFaces &&
          (!item.faces || item.facesSmall !== smallFaces))),
    [settings.removeBackground, settings.blurFaces, model, smallFaces],
  )

  // 解析（背景の分け方・顔の位置）は 1 枚ずつ順に行う
  const runningRef = useRef(false)
  useEffect(() => {
    if (runningRef.current) return
    const item = items.find(needsWork)
    if (!item) return
    runningRef.current = true
    setBusy(item.name)
    ;(async () => {
      // 画面に「処理中」を出してから重い処理を始める
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      const patch: Partial<Item> = {}
      try {
        if (settings.removeBackground && !item.conf[model]) {
          patch.conf = {
            ...item.conf,
            [model]: await segment(item.source, model),
          }
        }
        if (
          settings.blurFaces &&
          (!item.faces || item.facesSmall !== smallFaces)
        ) {
          const found = await detectFaces(item.source, smallFaces)
          // 手で描いた枠は残し、自動の枠だけ入れ替える
          patch.faces = [
            ...(item.faces ?? []).filter((f) => f.source === 'manual'),
            ...found.map((f) => ({
              ...f,
              id: newId(),
              source: 'auto' as const,
              enabled: true,
            })),
          ]
          patch.facesSmall = smallFaces
        }
      } catch (e) {
        console.error(e)
        patch.error = 'モデルを読み込めないか、この画像を処理できませんでした'
      }
      runningRef.current = false
      setBusy(null)
      setItems((list) =>
        list.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
      )
    })()
  }, [
    items,
    needsWork,
    settings.removeBackground,
    settings.blurFaces,
    model,
    smallFaces,
  ])

  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (list.length === 0) return
    const loaded: Item[] = []
    for (const f of list) {
      try {
        loaded.push(await loadItem(f))
      } catch {
        toast.error(`${f.name} を読み込めませんでした`)
      }
    }
    if (loaded.length === 0) return
    setItems((prev) => [...prev, ...loaded])
    setSelectedId(loaded[0].id)
  }

  const updateFaces = (id: string, fn: (faces: FaceBox[]) => FaceBox[]) =>
    setItems((list) =>
      list.map((i) => (i.id === id ? { ...i, faces: fn(i.faces ?? []) } : i)),
    )

  // ---- プレビュー ----
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const resultRef = useRef<HTMLCanvasElement | null>(null)
  const draftRef = useRef<{
    x0: number
    y0: number
    x1: number
    y1: number
    moved: boolean
    sx: number
    sy: number
  } | null>(null)

  const ready = selected ? !needsWork(selected) : false
  const editingFaces = settings.blurFaces && !!selected?.faces && !showOriginal

  /** 仕上がりの上に、顔の枠（編集用。書き出しには入らない）を描く */
  const drawDisplay = useCallback(() => {
    const canvas = canvasRef.current
    const result = resultRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !result || !selected) return
    if (canvas.width !== result.width || canvas.height !== result.height) {
      canvas.width = result.width
      canvas.height = result.height
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(result, 0, 0)
    if (!editingFaces) return
    const lw = Math.max(2, Math.max(canvas.width, canvas.height) / 400)
    ctx.lineWidth = lw
    for (const f of visibleFaces(selected.faces ?? [], settings.minScore)) {
      const b = padBox(f, settings.padding, canvas.width, canvas.height)
      ctx.setLineDash(f.enabled ? [] : [lw * 3, lw * 2])
      ctx.strokeStyle = !f.enabled
        ? '#f43f5e'
        : f.source === 'manual'
          ? '#f59e0b'
          : '#22c55e'
      ctx.strokeRect(b.x, b.y, b.w, b.h)
    }
    const d = draftRef.current
    if (d?.moved) {
      ctx.setLineDash([lw * 2, lw * 2])
      ctx.strokeStyle = '#f59e0b'
      ctx.strokeRect(
        Math.min(d.x0, d.x1),
        Math.min(d.y0, d.y1),
        Math.abs(d.x1 - d.x0),
        Math.abs(d.y1 - d.y0),
      )
    }
    ctx.setLineDash([])
  }, [selected, editingFaces, settings.minScore, settings.padding])

  // 設定が変わったら仕上がりを描き直す（スライダーを動かしている間は 1 コマに 1 回だけ）
  useEffect(() => {
    if (!selected || !ready) return
    const frame = requestAnimationFrame(() => {
      resultRef.current = showOriginal
        ? selected.source
        : renderResult(
            selected.source,
            selected.faces ?? [],
            selected.conf[model] ?? null,
            settings,
          )
      drawDisplay()
    })
    return () => cancelAnimationFrame(frame)
  }, [selected, ready, settings, model, showOriginal, drawDisplay])

  /** 画面上の位置を画像の画素の位置にする */
  const toImage = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editingFaces) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toImage(e)
    draftRef.current = {
      x0: p.x,
      y0: p.y,
      x1: p.x,
      y1: p.y,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = draftRef.current
    if (!d) return
    const p = toImage(e)
    d.x1 = p.x
    d.y1 = p.y
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true
    drawDisplay()
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = draftRef.current
    draftRef.current = null
    if (!d || !selected) return
    const canvas = e.currentTarget
    if (d.moved) {
      const x = Math.max(0, Math.min(d.x0, d.x1))
      const y = Math.max(0, Math.min(d.y0, d.y1))
      const w = Math.min(canvas.width, Math.max(d.x0, d.x1)) - x
      const h = Math.min(canvas.height, Math.max(d.y0, d.y1)) - y
      if (w >= 4 && h >= 4) {
        // 手で描いた枠は、そのままの大きさで隠れるよう広げる分を先に引いておく
        const p = settings.padding
        const fw = w / (1 + 2 * p)
        const fh = h / (1 + 2.4 * p)
        const box: FaceBox = {
          id: newId(),
          x: x + fw * p,
          y: y + fh * p * 1.4,
          w: fw,
          h: fh,
          source: 'manual',
          score: 1,
          enabled: true,
        }
        updateFaces(selected.id, (faces) => [...faces, box])
        return
      }
      drawDisplay()
      return
    }
    // クリック: いちばん上（後から足したもの）の枠を外す・戻す
    const hit = [...visibleFaces(selected.faces ?? [], settings.minScore)]
      .reverse()
      .find((f) => {
        const b = padBox(f, settings.padding, canvas.width, canvas.height)
        return (
          d.x0 >= b.x && d.x0 <= b.x + b.w && d.y0 >= b.y && d.y0 <= b.y + b.h
        )
      })
    if (!hit) return
    updateFaces(selected.id, (faces) =>
      hit.source === 'manual'
        ? faces.filter((f) => f.id !== hit.id)
        : faces.map((f) =>
            f.id === hit.id ? { ...f, enabled: !f.enabled } : f,
          ),
    )
  }

  // ---- 書き出し ----
  const exportItem = async (item: Item) => {
    const canvas = renderResult(
      item.source,
      item.faces ?? [],
      item.conf[model] ?? null,
      settings,
    )
    return {
      name: outputName(item.name, outFormat),
      blob: await canvasToBlob(canvas, outFormat),
    }
  }

  const downloadOne = async (item: Item) => {
    try {
      const { name, blob } = await exportItem(item)
      downloadBlob(blob, name)
    } catch {
      toast.error('書き出せませんでした')
    }
  }

  const allReady = items.length > 0 && !items.some(needsWork)
  const downloadAll = async () => {
    setExporting(true)
    try {
      const files: { name: string; blob: Blob }[] = []
      const used = new Set<string>()
      for (const item of items) {
        if (item.error) continue
        const f = await exportItem(item)
        // 同じ名前のファイルがあれば番号を付ける
        let name = f.name
        for (let n = 2; used.has(name); n++)
          name = f.name.replace(/(\.\w+)$/, `-${n}$1`)
        used.add(name)
        files.push({ name, blob: f.blob })
      }
      if (files.length === 1) downloadBlob(files[0].blob, files[0].name)
      else if (files.length > 1)
        downloadBlob(await makeZip(files), 'edited-images.zip')
    } catch {
      toast.error('書き出せませんでした')
    } finally {
      setExporting(false)
    }
  }

  const removeItem = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const setBackgroundImage = async (file: File | undefined) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    try {
      await img.decode()
      setSettings((s) => ({ ...s, backgroundImage: img, background: 'image' }))
    } catch {
      toast.error('背景の画像を読み込めませんでした')
    }
  }

  const autoCount = selected?.faces
    ? visibleFaces(selected.faces, settings.minScore).filter(
        (f) => f.source === 'auto',
      ).length
    : 0
  const manualCount =
    selected?.faces?.filter((f) => f.source === 'manual').length ?? 0

  const fileButton = (label: string) => (
    <Button type="button" asChild>
      <label className="cursor-pointer">
        <ImagePlus />
        {label}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
    </Button>
  )

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <ModeToggle
          active={settings.removeBackground}
          onClick={() => set('removeBackground', !settings.removeBackground)}
        >
          背景を消す
        </ModeToggle>
        <ModeToggle
          active={settings.blurFaces}
          onClick={() => set('blurFaces', !settings.blurFaces)}
        >
          顔をぼかす
        </ModeToggle>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 左: プレビューと画像の一覧 */}
        <div className="min-w-0 space-y-3">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: ファイルを落とす場所。ボタンからも選べる */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              addFiles(e.dataTransfer.files)
            }}
            className={cn(
              'relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/30',
              dragOver && 'border-primary bg-primary/5',
            )}
          >
            {!selected ? (
              <div className="space-y-4 p-8 text-center">
                {fileButton('画像を選ぶ')}
                <p className="text-sm text-muted-foreground">
                  ここに画像をドラッグしても追加できます（何枚でも）。
                  <br />
                  画像はブラウザの中だけで処理し、サーバーには送りません。
                </p>
              </div>
            ) : selected.error ? (
              <p className="p-8 text-sm text-destructive">{selected.error}</p>
            ) : !ready ? (
              <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                処理しています（初回はモデルの読み込みに少し時間がかかります）…
              </p>
            ) : (
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  draftRef.current = null
                  drawDisplay()
                }}
                className={cn(
                  'block h-auto max-h-[70svh] w-auto max-w-full',
                  checkerboard,
                  editingFaces && 'cursor-crosshair touch-none',
                )}
              />
            )}
          </div>

          {selected && ready && !selected.error && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={showOriginal}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadOne(selected)}
              >
                <Download />
                この画像を保存
              </Button>
              {settings.blurFaces && selected.faces && (
                <span className="text-xs text-muted-foreground">
                  見つけた顔 {autoCount} 件
                  {manualCount > 0 && `・手で足した枠 ${manualCount} 件`}
                </span>
              )}
            </div>
          )}

          {settings.blurFaces && selected?.faces && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-green-600 dark:text-green-400">
                緑の枠
              </span>
              は見つけた顔、
              <span className="font-medium text-amber-600 dark:text-amber-400">
                黄色の枠
              </span>
              は手で足した枠です。見落としがあれば画像の上をドラッグして四角を描き、間違いは枠をクリックすると外せます（
              <span className="font-medium text-rose-600 dark:text-rose-400">
                赤い点線
              </span>
              になります。もう一度クリックで戻ります）。枠は保存する画像には入りません。
            </p>
          )}

          {items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <div key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-label={`${item.name} を表示`}
                    aria-current={item.id === selected?.id}
                    className={cn(
                      'block size-16 overflow-hidden rounded-md border-2 sm:size-20',
                      item.id === selected?.id
                        ? 'border-primary'
                        : 'border-transparent',
                    )}
                  >
                    <img
                      src={item.thumb}
                      alt=""
                      className="size-full object-cover"
                    />
                    {needsWork(item) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="size-4 animate-spin" />
                      </span>
                    )}
                    {item.error && (
                      <span className="absolute inset-x-0 bottom-0 bg-destructive py-0.5 text-center text-[10px] text-white">
                        エラー
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`${item.name} を外す`}
                    className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                asChild
                className="size-16 sm:size-20"
              >
                <label className="cursor-pointer" aria-label="画像を足す">
                  <ImagePlus />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              </Button>
            </div>
          )}
        </div>

        {/* 右: 設定 */}
        <div className="space-y-5">
          {settings.removeBackground && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="font-medium">背景を消す</h2>
              <Field
                label="切り抜くもの"
                help="「人物」は人の形だけを、ていねいに切り抜きます。「人・動物・物」は人のほか、犬・猫・車・自転車・椅子など 20 種類を残します。"
              >
                <Segmented
                  label="切り抜くもの"
                  value={model}
                  onChange={setModel}
                  options={[
                    ['person', '人物'],
                    ['object', '人・動物・物'],
                  ]}
                />
              </Field>
              <RangeSlider
                label="残す範囲"
                help="右にすると、自信のある部分だけを残します（背景が少し残るときは右へ、体が欠けるときは左へ）。"
                value={settings.threshold}
                min={0.1}
                max={0.9}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set('threshold', v)}
              />
              <RangeSlider
                label="ふちのなめらかさ"
                value={settings.softness}
                min={0}
                max={0.4}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}`}
                onChange={(v) => set('softness', v)}
              />
              <Field label="背景">
                <Segmented<Background>
                  label="背景"
                  value={settings.background}
                  onChange={(v) => set('background', v)}
                  options={[
                    ['transparent', '透明'],
                    ['color', '色'],
                    ['image', '画像'],
                    ['blur', 'ぼかす'],
                  ]}
                />
              </Field>
              {settings.background === 'color' && (
                <label className="flex items-center gap-2 text-sm">
                  背景の色
                  <input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(e) => set('backgroundColor', e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border bg-transparent"
                  />
                </label>
              )}
              {settings.background === 'image' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      <ImagePlus />
                      背景の画像を選ぶ
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          setBackgroundImage(e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </Button>
                  {!settings.backgroundImage && (
                    <span className="text-xs text-muted-foreground">
                      選ぶまでは透明になります
                    </span>
                  )}
                </div>
              )}
              {settings.background === 'blur' && (
                <RangeSlider
                  label="背景のぼかし"
                  value={settings.backgroundBlur}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => set('backgroundBlur', v)}
                />
              )}
            </section>
          )}

          {settings.blurFaces && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="font-medium">顔をぼかす</h2>
              <Field label="隠し方">
                <Segmented<FaceEffect>
                  label="隠し方"
                  value={settings.faceEffect}
                  onChange={(v) => set('faceEffect', v)}
                  options={[
                    ['blur', 'ぼかし'],
                    ['mosaic', 'モザイク'],
                    ['fill', '塗りつぶし'],
                  ]}
                />
              </Field>
              {settings.faceEffect === 'fill' ? (
                <label className="flex items-center gap-2 text-sm">
                  塗る色
                  <input
                    type="color"
                    value={settings.fillColor}
                    onChange={(e) => set('fillColor', e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border bg-transparent"
                  />
                </label>
              ) : (
                <RangeSlider
                  label="強さ"
                  help="弱いぼかしやモザイクは、だれの顔か分かってしまうことがあります。人に見せる画像では強めにするか、塗りつぶしを使ってください。"
                  value={settings.strength}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => set('strength', v)}
                />
              )}
              <Field label="形">
                <Segmented<FaceShape>
                  label="形"
                  value={settings.faceShape}
                  onChange={(v) => set('faceShape', v)}
                  options={[
                    ['ellipse', '楕円'],
                    ['rect', '四角'],
                  ]}
                />
              </Field>
              <RangeSlider
                label="隠す範囲の広さ"
                value={settings.padding}
                min={0}
                max={0.6}
                step={0.05}
                format={(v) => `+${Math.round(v * 100)}%`}
                onChange={(v) => set('padding', v)}
              />
              <RangeSlider
                label="顔とみなす信頼度"
                help="下げると見落としが減りますが、顔でないものも拾いやすくなります。"
                value={settings.minScore}
                min={0.3}
                max={0.9}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set('minScore', v)}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={smallFaces}
                  onChange={(e) => setSmallFaces(e.target.checked)}
                  className="accent-primary"
                />
                小さな顔も探す
                <HelpTip>
                  画像を細かく分けても探して、集合写真などの小さな顔を拾います。少し時間がかかります。
                </HelpTip>
              </label>
            </section>
          )}

          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="font-medium">保存</h2>
            <Field label="形式">
              <Segmented<Format>
                label="形式"
                value={outFormat}
                onChange={setFormat}
                options={
                  transparent
                    ? [['png', 'PNG（透明を残す）']]
                    : [
                        ['png', 'PNG'],
                        ['jpeg', 'JPEG'],
                      ]
                }
              />
            </Field>
            <Button
              type="button"
              className="w-full"
              disabled={!allReady || exporting}
              onClick={downloadAll}
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Package />}
              {items.length > 1
                ? `${items.length} 枚をまとめて保存（ZIP）`
                : '保存する'}
            </Button>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setItems([])
                  setSelectedId(null)
                }}
              >
                <Trash2 />
                画像をすべて外す
              </Button>
            )}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {busy} を処理中…
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          画像はブラウザの中だけで処理し、サーバーには送りません。モデル（MediaPipe
          の Selfie Segmenter・DeepLab
          v3・BlazeFace）はこのサイトから読み込みます。
        </p>
        <p>
          保存した画像は描き直したものなので、撮影日時・カメラの機種・位置情報（GPS）などのメタデータ（EXIF）は入りません。
          {MAX_SIDE}px より大きな画像は、長い辺を {MAX_SIDE}px
          に縮めて扱います。
        </p>
        <p>
          自動で見つけた顔には見落としがあります（横顔・小さな顔・帽子やマスクで隠れた顔など）。人に見せる前に、必ず目で確かめてください。
        </p>
      </div>
    </div>
  )
}
