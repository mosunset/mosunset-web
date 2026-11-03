import { ImagePlus, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Tile = { id: string; src: string; ratio: number; label: string }

/** 高さの違う見本の画像（外部の画像は使わず、その場で SVG を作る） */
function sampleTiles(): Tile[] {
  const ratios = [1.4, 0.8, 1.1, 1.6, 0.7, 1.25, 0.9, 1.5, 1, 0.75, 1.3, 1.05]
  return ratios.map((ratio, i) => {
    const hue = (i * 37) % 360
    const h = Math.round(300 * ratio)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 70%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 70% 50%)"/></linearGradient></defs><rect width="300" height="${h}" fill="url(#g)"/><text x="150" y="${h / 2}" font-family="sans-serif" font-size="56" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${i + 1}</text></svg>`
    return {
      id: `sample-${i}`,
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      ratio,
      label: `${i + 1}`,
    }
  })
}

/** 画像の縦横比を読む */
function loadRatio(src: string) {
  return new Promise<number>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 1)
    img.onerror = () => resolve(1)
    img.src = src
  })
}

/** いちばん低い列に順に足していく（左から右への順番が保たれる） */
function distribute(tiles: Tile[], columns: number) {
  const cols: Tile[][] = Array.from({ length: columns }, () => [])
  const heights = new Array<number>(columns).fill(0)
  for (const tile of tiles) {
    const i = heights.indexOf(Math.min(...heights))
    cols[i].push(tile)
    heights[i] += tile.ratio
  }
  return cols
}

type Mode = 'js' | 'css'

export function MasonryImage() {
  const [tiles, setTiles] = useState<Tile[]>(sampleTiles)
  const [columns, setColumns] = useState(3)
  const [gap, setGap] = useState(12)
  const [mode, setMode] = useState<Mode>('js')

  // 自分の写真を使ったときは、離れるときにメモリを返す
  useEffect(
    () => () => {
      for (const t of tiles)
        if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src)
    },
    [tiles],
  )

  const cols = useMemo(
    () =>
      distribute(tiles, columns).map((col, i) => ({
        id: `col-${i}`,
        tiles: col,
      })),
    [tiles, columns],
  )

  const loadOwnImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = await Promise.all(
      Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .map(async (f, i) => {
          const src = URL.createObjectURL(f)
          return {
            id: `own-${Date.now()}-${i}`,
            src,
            ratio: await loadRatio(src),
            label: f.name,
          }
        }),
    )
    setTiles(list)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">並べ方</legend>
          <div className="inline-flex rounded-md border p-0.5">
            {(
              [
                ['js', '左から順（JS）'],
                ['css', '上から順（CSS columns）'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs text-muted-foreground',
                  mode === m && 'bg-muted text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <Range
          label="列の数"
          value={columns}
          min={1}
          max={6}
          onChange={setColumns}
          unit="列"
        />
        <Range
          label="すき間"
          value={gap}
          min={0}
          max={32}
          onChange={setGap}
          unit="px"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="button" variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <ImagePlus />
              自分の写真で試す
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => loadOwnImages(e.target.files)}
              />
            </label>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTiles(sampleTiles())}
          >
            <RotateCcw />
            見本に戻す
          </Button>
          <span className="self-center text-xs text-muted-foreground">
            写真はブラウザの中だけで表示し、送信しません。
          </span>
        </div>
      </div>

      {mode === 'js' ? (
        <div className="flex items-start" style={{ gap }}>
          {cols.map((col) => (
            <div
              key={col.id}
              className="flex min-w-0 flex-1 flex-col"
              style={{ gap }}
            >
              {col.tiles.map((t) => (
                <TileView key={t.id} tile={t} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ columnCount: columns, columnGap: gap }}>
          {tiles.map((t) => (
            <div
              key={t.id}
              className="break-inside-avoid"
              style={{ marginBottom: gap }}
            >
              <TileView tile={t} />
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        「左から順」は、いちばん低い列に 1
        枚ずつ足していく方法で、番号が左から右へ読める順に並びます。「上から順」は
        CSS の columns だけで作る方法で、JavaScript
        がいらない代わりに、列ごとに上から下へ並びます。
      </p>
    </div>
  )
}

function TileView({ tile }: { tile: Tile }) {
  return (
    <figure className="overflow-hidden rounded-md border bg-muted/30">
      <img
        src={tile.src}
        alt={tile.label}
        loading="lazy"
        className="block h-auto w-full"
        style={{ aspectRatio: `1 / ${tile.ratio}` }}
      />
    </figure>
  )
}

function Range({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <label className="space-y-2">
      <span className="flex justify-between text-sm font-medium">
        {label}
        <span className="font-mono font-normal tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}
