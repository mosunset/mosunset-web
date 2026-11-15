import { useMemo, useState } from 'react'

import { RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// データと計算
// ---------------------------------------------------------------------------

const CM_PER_INCH = 2.54

type Resolution = { name: string; w: number; h: number }

/** 横置きの中央モニタ（16:9 が中心） */
const centerResolutions: Resolution[] = [
  { name: 'FHD', w: 1920, h: 1080 },
  { name: 'WQHD', w: 2560, h: 1440 },
  { name: '4K', w: 3840, h: 2160 },
  { name: '5K', w: 5120, h: 2880 },
  { name: '8K', w: 7680, h: 4320 },
]
/** 縦置きのサイドモニタ */
const sideResolutions: Resolution[] = [
  { name: 'FHD', w: 1920, h: 1080 },
  { name: 'WUXGA', w: 1920, h: 1200 },
  { name: 'WQHD', w: 2560, h: 1440 },
  { name: 'WQXGA', w: 2560, h: 1600 },
  { name: 'UWQHD', w: 3440, h: 1440 },
  { name: '4K', w: 3840, h: 2160 },
  { name: 'DCI 4K', w: 4096, h: 2160 },
  { name: '5K', w: 5120, h: 2880 },
  { name: '6K', w: 6016, h: 3384 },
  { name: '8K', w: 7680, h: 4320 },
]
// 実際に売られているサイズ
const centerInches = [
  21.5, 23.8, 24, 24.5, 26.5, 27, 28, 29, 31.5, 32, 34, 37.5, 40, 43, 49, 50,
  55, 65, 70,
]
const sideInches = [
  13.3, 14, 15.6, 16, 17.3, 18.5, 21.5, 23.8, 24, 24.5, 26.5, 27, 28, 29, 31.5,
  32, 34, 37.5, 40,
]

/** 対角インチと解像度から、物理的な幅・高さ（cm）と PPI を出す */
function measure(inch: number, r: Resolution) {
  const diagPx = Math.hypot(r.w, r.h)
  return {
    widthCm: ((inch * r.w) / diagPx) * CM_PER_INCH,
    heightCm: ((inch * r.h) / diagPx) * CM_PER_INCH,
    ppi: diagPx / inch,
  }
}

type Pair = ReturnType<typeof buildPairs>[number]

function buildPairs() {
  const pairs = []
  for (const cInch of centerInches) {
    for (const cRes of centerResolutions) {
      const c = measure(cInch, cRes)
      for (const sInch of sideInches) {
        for (const sRes of sideResolutions) {
          const s = measure(sInch, sRes)
          // サイドは縦置きなので、横幅がそのまま高さになる
          const sideHeightCm = s.widthCm
          pairs.push({
            key: `${cInch}-${cRes.name}-${sInch}-${sRes.name}`,
            center: { inch: cInch, res: cRes, ...c },
            side: {
              inch: sInch,
              res: sRes,
              ...s,
              heightCm: sideHeightCm,
              widthCm: s.heightCm,
            },
            heightDiffCm: c.heightCm - sideHeightCm,
            ppiDiffPct: ((c.ppi - s.ppi) / s.ppi) * 100,
            // 中央の縦の画素数と、縦置きサイドの縦の画素数の差
            pxDiffPct: ((cRes.h - sRes.w) / cRes.h) * 100,
          })
        }
      }
    }
  }
  return pairs
}

const allPairs = buildPairs()

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

const PAGE = 100

export function MonitorPairing() {
  const [tolerance, setTolerance] = useState(1)
  const [maxPpiDiff, setMaxPpiDiff] = useState(20)
  const [maxPxDiff, setMaxPxDiff] = useState(20)
  const [centerInch, setCenterInch] = useState('all')
  const [sideInch, setSideInch] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mode, setMode] = useState<'physical' | 'pixel'>('physical')

  const results = useMemo(
    () =>
      allPairs
        .filter(
          (p) =>
            Math.abs(p.heightDiffCm) <= tolerance &&
            Math.abs(p.ppiDiffPct) <= maxPpiDiff &&
            Math.abs(p.pxDiffPct) <= maxPxDiff &&
            (centerInch === 'all' || p.center.inch === Number(centerInch)) &&
            (sideInch === 'all' || p.side.inch === Number(sideInch)),
        )
        .sort((a, b) => Math.abs(a.heightDiffCm) - Math.abs(b.heightDiffCm)),
    [tolerance, maxPpiDiff, maxPxDiff, centerInch, sideInch],
  )
  const selected =
    results.find((p) => p.key === selectedKey) ?? results[0] ?? null

  const resetLimit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setLimit(PAGE)
    }

  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 text-sm font-medium">条件</legend>
        <RangeSlider
          label="高さの差（まで）"
          value={tolerance}
          min={0.1}
          max={5}
          step={0.1}
          unit="cm"
          onChange={resetLimit(setTolerance)}
        />
        <RangeSlider
          label="PPI（細かさ）の差（まで）"
          value={maxPpiDiff}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={resetLimit(setMaxPpiDiff)}
        />
        <RangeSlider
          label="縦の画素数の差（まで）"
          value={maxPxDiff}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={resetLimit(setMaxPxDiff)}
        />
        <InchSelect
          label="中央モニタ"
          value={centerInch}
          options={centerInches}
          onChange={resetLimit(setCenterInch)}
        />
        <InchSelect
          label="サイドモニタ（縦置き）"
          value={sideInch}
          options={sideInches}
          onChange={resetLimit(setSideInch)}
        />
      </fieldset>

      {selected && (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {selected.center.inch}″ {selected.center.res.name} ＋{' '}
              {selected.side.inch}″ {selected.side.res.name}（縦）
            </h2>
            <fieldset className="inline-flex rounded-md border p-0.5">
              <legend className="sr-only">図の表示</legend>
              {(
                [
                  ['physical', '実際の大きさ'],
                  ['pixel', '画素数'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded px-3 py-1 text-xs text-muted-foreground',
                    mode === m && 'bg-muted text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          </div>
          <PairFigure pair={selected} mode={mode} />
        </section>
      )}

      <div>
        <p className="text-sm text-muted-foreground">
          {results.length.toLocaleString('ja-JP')}{' '}
          件（高さの差が小さい順。行をクリックすると図が変わります）
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">中央</th>
                <th className="px-3 py-2 font-medium">サイド（縦）</th>
                <th className="px-3 py-2 text-right font-medium">高さの差</th>
                <th className="px-3 py-2 text-right font-medium">PPI の差</th>
                <th className="px-3 py-2 text-right font-medium">画素数の差</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.slice(0, limit).map((p) => (
                <tr
                  key={p.key}
                  onClick={() => setSelectedKey(p.key)}
                  className={cn(
                    'cursor-pointer hover:bg-muted/30',
                    selected?.key === p.key && 'bg-muted/60',
                  )}
                >
                  <td className="px-3 py-2">
                    {p.center.inch}″ {p.center.res.name}
                  </td>
                  <td className="px-3 py-2">
                    {p.side.inch}″ {p.side.res.name}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {p.heightDiffCm.toFixed(2)} cm
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {p.ppiDiffPct.toFixed(1)} %
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {p.pxDiffPct.toFixed(1)} %
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground"
                  >
                    条件に合う組み合わせがありません。高さの差を広げてみてください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {results.length > limit && (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setLimit((l) => l + PAGE)}
          >
            もっと見る（残り {(results.length - limit).toLocaleString('ja-JP')}{' '}
            件）
          </Button>
        )}
      </div>
    </div>
  )
}

/** 2 台を下端をそろえて並べた図 */
function PairFigure({
  pair,
  mode,
}: {
  pair: Pair
  mode: 'physical' | 'pixel'
}) {
  const boxes =
    mode === 'physical'
      ? [
          { w: pair.center.widthCm, h: pair.center.heightCm },
          { w: pair.side.widthCm, h: pair.side.heightCm },
        ]
      : [
          { w: pair.center.res.w, h: pair.center.res.h },
          { w: pair.side.res.h, h: pair.side.res.w },
        ]
  const gap = (boxes[0].w + boxes[1].w) * 0.03
  const width = boxes[0].w + boxes[1].w + gap
  const height = Math.max(boxes[0].h, boxes[1].h)
  const label = (i: 0 | 1) => {
    const m = i === 0 ? pair.center : pair.side
    return mode === 'physical'
      ? `高さ ${m.heightCm.toFixed(1)} cm・${Math.round(m.ppi)} PPI`
      : `縦 ${i === 0 ? m.res.h : m.res.w} px`
  }

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto max-h-80 w-full"
        role="img"
        aria-label="モニタの大きさの比較"
      >
        {boxes.map((b, i) => {
          const x = i === 0 ? 0 : boxes[0].w + gap
          return (
            <rect
              key={i === 0 ? 'center' : 'side'}
              x={x}
              y={height - b.h}
              width={b.w}
              height={b.h}
              rx={height * 0.01}
              className={
                i === 0
                  ? 'fill-primary/15 stroke-primary'
                  : 'fill-sky-500/15 stroke-sky-500'
              }
              strokeWidth={height * 0.006}
            />
          )
        })}
      </svg>
      <figcaption className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>中央：{label(0)}</span>
        <span>サイド：{label(1)}</span>
      </figcaption>
    </figure>
  )
}

function InchSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: number[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm"
      >
        <option value="all">すべてのサイズ</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o} インチ
          </option>
        ))}
      </select>
    </div>
  )
}
