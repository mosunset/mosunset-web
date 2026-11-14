import { zip } from 'fflate'
import {
  Archive,
  CalendarClock,
  Camera,
  Check,
  Download,
  ImagePlus,
  Loader2,
  MapPin,
  Maximize2,
  RotateCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { RangeSlider, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import type { EncodeOptions, OutputFormat } from './encode'
import { detectFormats, encodeFile } from './encoder'
import { type MetaSummary, orientationLabels, readMetadata } from './metadata'

type Result = {
  blob: Blob
  url: string
  width: number
  height: number
  /** 書き出した画像からもう一度読み取ったメタデータの項目数（0 のはず） */
  metaAfter: number | null
}

type Item = {
  id: number
  file: File
  /** 元の画像の表示用 URL */
  url: string
  meta: MetaSummary | 'loading' | 'error'
  /** 向きを反映したあとの元の大きさ */
  sourceSize?: { width: number; height: number }
  result?: Result
  error?: string
  working: boolean
  /** result / error を作ったときの設定（設定が変わったら作り直す） */
  doneKey?: string
}

const formatList: { value: OutputFormat; label: string; ext: string }[] = [
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/avif', label: 'AVIF', ext: 'avif' },
]

const sizePresets = [0, 3840, 2560, 1920, 1280, 800]

const accept =
  'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif,image/bmp,.heic,.heif,.avif'

function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(file.name)
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 減った割合（増えたときはマイナス） */
function savedRate(before: number, after: number) {
  return before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0
}

function outputName(file: File, format: OutputFormat) {
  const ext = formatList.find((f) => f.value === format)?.ext ?? 'img'
  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${ext}`
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

let nextItemId = 0

export function ImageCompress() {
  const [items, setItems] = useState<Item[]>([])
  const [format, setFormat] = useState<OutputFormat>('image/webp')
  const [quality, setQuality] = useState(80)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [maxHeight, setMaxHeight] = useState(1920)
  const [supported, setSupported] = useState<Set<OutputFormat> | null>(null)
  const [dragging, setDragging] = useState(false)
  const [zipping, setZipping] = useState(false)
  const busyRef = useRef(false)
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    detectFormats().then((set) => {
      setSupported(set)
      // WebP を書き出せないブラウザでは JPEG を最初に選ぶ
      if (!set.has('image/webp')) setFormat('image/jpeg')
    })
  }, [])

  // ページを離れたら URL を片付ける
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.url)
        if (item.result) URL.revokeObjectURL(item.result.url)
      }
    },
    [],
  )

  // スライダーを動かしているあいだは変換し直さない
  const options: EncodeOptions = useDebounced(
    {
      format,
      quality: quality / 100,
      maxWidth: Number.isFinite(maxWidth) ? maxWidth : 0,
      maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
    },
    300,
  )
  const key = JSON.stringify(options)

  const update = (id: number, patch: (item: Item) => Partial<Item>) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch(item) } : item)),
    )

  // 設定と違う結果の画像を、1 枚ずつ順に変換する
  // biome-ignore lint/correctness/useExhaustiveDependencies: options は key と同じ内容。update は setItems だけを使う
  useEffect(() => {
    if (busyRef.current) return
    const next = items.find((item) => item.doneKey !== key)
    if (!next) return
    busyRef.current = true
    const runKey = key
    update(next.id, () => ({ working: true }))
    encodeFile(next.file, options)
      .then(async (r) => {
        const metaAfter = await readMetadata(r.blob)
          .then((m) => m.total)
          .catch(() => null)
        const result: Result = {
          blob: r.blob,
          url: URL.createObjectURL(r.blob),
          width: r.width,
          height: r.height,
          metaAfter,
        }
        busyRef.current = false
        if (!itemsRef.current.some((item) => item.id === next.id)) {
          URL.revokeObjectURL(result.url)
          setItems((prev) => [...prev])
          return
        }
        update(next.id, (item) => {
          if (item.result) URL.revokeObjectURL(item.result.url)
          return {
            result,
            error: undefined,
            working: false,
            doneKey: runKey,
            sourceSize: { width: r.sourceWidth, height: r.sourceHeight },
          }
        })
      })
      .catch(() => {
        busyRef.current = false
        update(next.id, () => ({
          error:
            'このブラウザでは読み込めない画像です（HEIC は Safari など対応しているブラウザでだけ変換できます）',
          working: false,
          doneKey: runKey,
        }))
      })
  }, [items, key])

  const addFiles = (files: Iterable<File>) => {
    const added: Item[] = []
    for (const file of files) {
      if (!isImageFile(file)) continue
      added.push({
        id: nextItemId++,
        file,
        url: URL.createObjectURL(file),
        meta: 'loading',
        working: false,
      })
    }
    if (added.length === 0) {
      toast.error('画像のファイルを選んでください')
      return
    }
    setItems((prev) => [...prev, ...added])
    for (const item of added) {
      readMetadata(item.file)
        .then((meta) => update(item.id, () => ({ meta })))
        .catch(() => update(item.id, () => ({ meta: 'error' })))
    }
  }

  const remove = (id: number) =>
    setItems((prev) =>
      prev.filter((item) => {
        if (item.id !== id) return true
        URL.revokeObjectURL(item.url)
        if (item.result) URL.revokeObjectURL(item.result.url)
        return false
      }),
    )

  const clear = () => {
    for (const item of items) {
      URL.revokeObjectURL(item.url)
      if (item.result) URL.revokeObjectURL(item.result.url)
    }
    setItems([])
  }

  const done = items.filter((item) => item.result && item.doneKey === key)
  const allDone = items.length > 0 && done.length === items.length
  const totalBefore = done.reduce((s, item) => s + item.file.size, 0)
  const totalAfter = done.reduce(
    (s, item) => s + (item.result?.blob.size ?? 0),
    0,
  )
  const remaining = items.filter((item) => item.doneKey !== key).length

  const saveZip = async () => {
    setZipping(true)
    try {
      const used = new Set<string>()
      const files: Record<string, [Uint8Array, { level: 0 }]> = {}
      for (const item of done) {
        if (!item.result) continue
        let name = outputName(item.file, options.format)
        // 同じ名前があれば「-2」「-3」と付ける
        for (let n = 2; used.has(name); n++) {
          name = outputName(item.file, options.format).replace(
            /(\.[^.]+)$/,
            `-${n}$1`,
          )
        }
        used.add(name)
        // 画像はもう圧縮されているので、ZIP では圧縮しない
        files[name] = [
          new Uint8Array(await item.result.blob.arrayBuffer()),
          { level: 0 },
        ]
      }
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(files, (err, out) => (err ? reject(err) : resolve(out))),
      )
      download(
        new Blob([data as Uint8Array<ArrayBuffer>], {
          type: 'application/zip',
        }),
        'images.zip',
      )
    } catch {
      toast.error('ZIP を作れませんでした')
    } finally {
      setZipping(false)
    }
  }

  const lossless = format === 'image/png'

  return (
    <div className="space-y-6">
      {/* 画像を入れるところ */}
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:bg-muted/40',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        <ImagePlus className="size-8 text-muted-foreground" />
        <span className="font-medium">
          ここに画像をドラッグ＆ドロップ（何枚でも）
        </span>
        <span className="text-sm text-muted-foreground">
          またはクリックして選ぶ ・ JPEG / PNG / WebP / AVIF
        </span>
        <input
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      <p className="-mt-3 text-xs text-muted-foreground">
        画像はブラウザの中だけで変換し、サーバーには送りません。
      </p>

      {/* 設定 */}
      <div className="grid gap-5 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm">書き出す形式</div>
          <div className="flex flex-wrap gap-2">
            {formatList.map((f) => {
              const ok = supported === null || supported.has(f.value)
              return (
                <Button
                  key={f.value}
                  type="button"
                  size="sm"
                  variant={format === f.value ? 'default' : 'outline'}
                  disabled={!ok}
                  title={ok ? undefined : 'このブラウザでは書き出せません'}
                  onClick={() => setFormat(f.value)}
                >
                  {f.label}
                </Button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {format === 'image/webp' &&
              'WebP は JPEG より小さくなりやすく、透明も使えます。'}
            {format === 'image/jpeg' &&
              'JPEG は写真向け。透明なところは白になります。'}
            {format === 'image/png' &&
              'PNG は画質が落ちませんが、写真だと元より大きくなりがちです。'}
            {format === 'image/avif' &&
              'AVIF はいちばん小さくなりやすい形式です（変換に少し時間がかかります）。'}
            {supported && !supported.has('image/avif') && (
              <> AVIF はこのブラウザでは書き出せません。</>
            )}
          </p>
        </div>

        <div className={cn(lossless && 'opacity-50')}>
          <RangeSlider
            label="画質"
            help="数字を下げるほどファイルは小さくなり、画質は落ちます。写真なら 70〜85 くらいが目安です。PNG では使いません。"
            value={quality}
            min={1}
            max={100}
            step={1}
            format={(v) => (lossless ? '—' : v)}
            onChange={setQuality}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="text-sm">
            大きさの上限（これより大きい画像だけ縮めます）
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="image-compress-max-width"
              className="flex items-center gap-1.5 text-sm"
            >
              幅
              <Input
                id="image-compress-max-width"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxWidth || ''}
                placeholder="制限なし"
                onChange={(e) =>
                  setMaxWidth(Math.max(0, Number(e.target.value)))
                }
                className="w-28"
              />
            </label>
            <label
              htmlFor="image-compress-max-height"
              className="flex items-center gap-1.5 text-sm"
            >
              高さ
              <Input
                id="image-compress-max-height"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxHeight || ''}
                placeholder="制限なし"
                onChange={(e) =>
                  setMaxHeight(Math.max(0, Number(e.target.value)))
                }
                className="w-28"
              />
            </label>
            <span className="text-sm text-muted-foreground">px</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sizePresets.map((n) => (
              <Button
                key={n}
                type="button"
                size="xs"
                variant={
                  maxWidth === n && maxHeight === n ? 'secondary' : 'ghost'
                }
                onClick={() => {
                  setMaxWidth(n)
                  setMaxHeight(n)
                }}
              >
                {n === 0 ? '縮めない' : n}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <>
          {/* 合計 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="画像"
              value={`${done.length}/${items.length}`}
              unit="枚"
              hint={remaining > 0 ? `変換中…あと ${remaining} 枚` : '変換済み'}
            />
            <Stat label="元の合計" value={formatBytes(totalBefore)} />
            <Stat label="変換後の合計" value={formatBytes(totalAfter)} />
            <Stat
              label="削減率"
              value={`${savedRate(totalBefore, totalAfter)}`}
              unit="%"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={saveZip}
              disabled={!allDone || zipping}
            >
              {zipping ? <Loader2 className="animate-spin" /> : <Archive />}
              まとめて ZIP で保存
            </Button>
            <Button type="button" variant="ghost" onClick={clear}>
              <Trash2 />
              すべて消す
            </Button>
            {!allDone && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                変換しています…
              </span>
            )}
          </div>

          <ul className="space-y-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                stale={item.doneKey !== key}
                name={outputName(item.file, options.format)}
                onRemove={() => remove(item.id)}
              />
            ))}
          </ul>
        </>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          書き出した画像は描き直して作るので、EXIF（撮影位置
          GPS・カメラの機種・撮影日時など）や XMP・IPTC
          のメタデータは入りません。写真の向き（Orientation）は、回した状態で保存します。
        </p>
        <p>
          HEIC（iPhone の写真）は、Safari など HEIC
          を表示できるブラウザでだけ変換できます。GIF のアニメーションは最初の 1
          コマだけになります。色のプロファイル（ICC）も外れるため、広い色域の写真は色が少し変わることがあります。
        </p>
        <p>
          EXIF の読み取りに exifr、ZIP の作成に fflate（どちらも MIT
          ライセンス）を使っています。
        </p>
      </div>
    </div>
  )
}

function ItemCard({
  item,
  stale,
  name,
  onRemove,
}: {
  item: Item
  stale: boolean
  name: string
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const r = item.result
  const rate = r ? savedRate(item.file.size, r.blob.size) : 0

  return (
    <li className="grid gap-4 rounded-lg border p-3 sm:grid-cols-[16rem_1fr] sm:p-4">
      <div className="space-y-2">
        {r && !item.error ? (
          <>
            <Compare
              before={item.url}
              after={r.url}
              width={r.width}
              height={r.height}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setOpen(true)}
            >
              <Maximize2 />
              大きくして比べる
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle className="truncate pr-8">
                    {item.file.name}
                  </DialogTitle>
                  <DialogDescription>
                    左右に動かして、元の画像（左）と変換後（右）を比べられます。
                  </DialogDescription>
                </DialogHeader>
                <Compare
                  before={item.url}
                  after={r.url}
                  width={r.width}
                  height={r.height}
                  large
                />
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground">
            {item.error ? (
              <TriangleAlert className="size-6 text-destructive" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={item.file.name}>
              {item.file.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              → {name}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="この画像を外す"
            title="この画像を外す"
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>

        {item.error ? (
          <p className="text-sm text-destructive">{item.error}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="font-mono tabular-nums">
              {formatBytes(item.file.size)}
              <span className="mx-1.5 text-muted-foreground">→</span>
              {r ? formatBytes(r.blob.size) : '…'}
            </div>
            {r && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  rate > 0
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                )}
              >
                {rate > 0 ? `−${rate}%` : `+${Math.abs(rate)}%`}
              </span>
            )}
            {item.sourceSize && r && (
              <div className="font-mono text-xs text-muted-foreground tabular-nums">
                {item.sourceSize.width}×{item.sourceSize.height}
                {(item.sourceSize.width !== r.width ||
                  item.sourceSize.height !== r.height) &&
                  ` → ${r.width}×${r.height}`}{' '}
                px
              </div>
            )}
            {(stale || item.working) && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
        {r && rate <= 0 && !item.error && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            元のファイルのほうが小さくなっています。画質を下げるか、ほかの形式を試してください。
          </p>
        )}

        <MetaView meta={item.meta} metaAfter={r?.metaAfter} />

        {r && !item.error && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stale}
            onClick={() => download(r.blob, name)}
          >
            <Download />
            保存
          </Button>
        )}
      </div>
    </li>
  )
}

/** 元の画像と変換後を、つまみを左右に動かして比べる */
function Compare({
  before,
  after,
  width,
  height,
  large = false,
}: {
  before: string
  after: string
  width: number
  height: number
  large?: boolean
}) {
  const [pos, setPos] = useState(50)
  return (
    <div
      className={cn(
        'relative mx-auto overflow-hidden rounded-md border bg-muted/40',
        large ? 'max-h-[70svh]' : 'max-h-64',
      )}
      style={{
        aspectRatio: `${width} / ${height}`,
        // 縦長の画像でも高さの上限に収まるよう、幅を縮める
        maxWidth: `calc(${large ? '70svh' : '16rem'} * ${width / height})`,
        width: '100%',
        backgroundImage:
          'conic-gradient(var(--color-muted) 25%, transparent 0 50%, var(--color-muted) 0 75%, transparent 0)',
        backgroundSize: '16px 16px',
      }}
    >
      <img
        src={after}
        alt="変換後"
        className="absolute inset-0 size-full object-contain"
        // 半透明の画像が左右で重ならないよう、変換後は右側だけ見せる
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        draggable={false}
      />
      <img
        src={before}
        alt="元の画像"
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
        style={{ left: `${pos}%` }}
      />
      <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        元
      </span>
      <span className="pointer-events-none absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        変換後
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="比べる位置"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  )
}

function MetaRow({
  icon,
  label,
  children,
  warn = false,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  warn?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        className={cn(
          'mt-0.5 shrink-0 [&>svg]:size-3.5',
          warn ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function MetaView({
  meta,
  metaAfter,
}: {
  meta: Item['meta']
  metaAfter: number | null | undefined
}) {
  if (meta === 'loading')
    return (
      <p className="text-xs text-muted-foreground">メタデータを読み取り中…</p>
    )
  if (meta === 'error' || meta.total === 0)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        元の画像にメタデータ（EXIF など）はありませんでした。
      </p>
    )

  const shown = [
    meta.gps,
    meta.camera,
    meta.lens,
    meta.taken,
    meta.shooting,
    meta.software,
    meta.author,
  ].filter(Boolean).length

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
      <div className="font-medium">
        元の画像に入っていたメタデータ（{meta.total} 項目）
      </div>
      <div className="grid gap-1.5">
        {meta.gps && (
          <MetaRow icon={<MapPin />} label="撮影位置" warn>
            <span className="font-mono">
              {meta.gps.latitude.toFixed(5)}, {meta.gps.longitude.toFixed(5)}
            </span>
            {meta.gps.altitude !== undefined &&
              `（高度 ${Math.round(meta.gps.altitude)}m）`}
          </MetaRow>
        )}
        {meta.camera && (
          <MetaRow icon={<Camera />} label="カメラ">
            {meta.camera}
            {meta.lens && ` / ${meta.lens}`}
          </MetaRow>
        )}
        {!meta.camera && meta.lens && (
          <MetaRow icon={<Camera />} label="レンズ">
            {meta.lens}
          </MetaRow>
        )}
        {meta.taken && (
          <MetaRow icon={<CalendarClock />} label="撮影日時">
            {meta.taken}
          </MetaRow>
        )}
        {meta.shooting && (
          <MetaRow icon={<Camera />} label="撮影設定">
            {meta.shooting}
          </MetaRow>
        )}
        {meta.software && (
          <MetaRow icon={<Check />} label="ソフト">
            {meta.software}
          </MetaRow>
        )}
        {meta.author && (
          <MetaRow icon={<Check />} label="作者・著作権">
            {meta.author}
          </MetaRow>
        )}
        {meta.orientation !== undefined && meta.orientation !== 1 && (
          <MetaRow icon={<RotateCw />} label="向き">
            {orientationLabels[meta.orientation] ?? meta.orientation}
            （回した状態で書き出します）
          </MetaRow>
        )}
        {meta.total > shown && (
          <div className="text-muted-foreground">
            ほかに解像度・色・露出などの項目があります。
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t pt-2 text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="size-3.5 shrink-0" />
        {metaAfter === undefined || metaAfter === null
          ? '書き出した画像には入りません。'
          : metaAfter === 0
            ? '書き出した画像を読み直して、メタデータが消えたことを確かめました。'
            : `書き出した画像に ${metaAfter} 項目が残っています。`}
      </div>
    </div>
  )
}
