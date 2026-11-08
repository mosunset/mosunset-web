import { Eye, Loader2, Search, Square } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { HelpTip, RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Objective, PackResult } from './solver'

/** 範囲で試す数値の設定（on でなければ、設定欄の 1 つの値で固定） */
export type SweepRange = { on: boolean; min: number; max: number; step: number }

export type SweepConfig = {
  gap: SweepRange
  edgeGap: SweepRange
  supportPercent: SweepRange
  wallBias: SweepRange
  /** 見た目の整いを重視する度合い（0〜100） */
  tidyWeight: SweepRange
  /** 「全体の高さを低く」と「下の段から隙間なく」の両方を試す */
  bothObjectives: boolean
  /** 横倒しの許可を「今のまま」と「全部オン」の両方で試す */
  bothLayDown: boolean
}

/** 最初の条件。だいたいの範囲から始め、決めたい項目だけ「1 つの値」にする */
export const defaultSweep: SweepConfig = {
  gap: { on: true, min: 2, max: 10, step: 2 },
  edgeGap: { on: false, min: 2, max: 10, step: 2 },
  supportPercent: { on: true, min: 85, max: 100, step: 5 },
  wallBias: { on: false, min: 0, max: 100, step: 50 },
  tidyWeight: { on: false, min: 0, max: 100, step: 50 },
  bothObjectives: true,
  bothLayDown: true,
}

/**
 * 1 回に 1 つの組み合わせへかける時間。Worker ごとに別の組み合わせをこの時間だけ計算し、
 * 終わったら次の組み合わせを選び直す（まず全部に 1 回ずつ、そのあとは成績の良いもの・伸びているものを多めに）
 */
export const SLICE_SEC = 2

/** 止めなかったときに、自動で止めるまでの時間 */
export const MAX_SEARCH_MS = 60 * 60 * 1000

/** 1 つの組み合わせ（設定欄の値から変える値） */
export type SweepCombo = {
  gap: number
  edgeGap: number
  supportPercent: number
  wallBias: number
  tidyWeight: number
  objective: Objective
  layDownAll: boolean
}

/** 範囲（最小〜最大、刻み）の値の一覧。範囲でなければ 1 つの値だけ */
function valuesOf(r: SweepRange, current: number, lo: number, hi: number) {
  if (!r.on) return [current]
  const min = Math.max(lo, Math.min(r.min, r.max))
  const max = Math.min(hi, Math.max(r.min, r.max))
  const step = Math.max(1, r.step)
  const out: number[] = []
  for (let v = min; v <= max && out.length < 50; v += step) out.push(v)
  return out.length > 0 ? out : [current]
}

/** これより多い組み合わせは作らない */
const MAX_COMBOS = 2000

/** 条件の組み合わせを全部作る */
export function buildCombos(
  config: SweepConfig,
  base: Omit<SweepCombo, 'layDownAll'>,
): SweepCombo[] {
  const gaps = valuesOf(config.gap, base.gap, 0, 50)
  const edges = valuesOf(config.edgeGap, base.edgeGap, 0, 50)
  const supports = valuesOf(config.supportPercent, base.supportPercent, 50, 100)
  const biases = valuesOf(config.wallBias, base.wallBias, 0, 100)
  const tidies = valuesOf(config.tidyWeight, base.tidyWeight, 0, 100)
  const objectives: Objective[] = config.bothObjectives
    ? ['height', 'floor']
    : [base.objective]
  const layDowns = config.bothLayDown ? [false, true] : [false]
  const all: SweepCombo[] = []
  for (const objective of objectives)
    for (const supportPercent of supports)
      for (const gap of gaps)
        for (const edgeGap of edges)
          for (const wallBias of biases)
            for (const tidyWeight of tidies)
              for (const layDownAll of layDowns) {
                if (all.length >= MAX_COMBOS) break
                all.push({
                  gap,
                  edgeGap,
                  supportPercent,
                  wallBias,
                  tidyWeight,
                  objective,
                  layDownAll,
                })
              }
  return all
}

/**
 * 探し方の見込み。workers 並列で回るとき、全部の組み合わせに 1 回ずつ当たるまでの時間を返す
 */
export function planSearch(
  config: SweepConfig,
  base: Omit<SweepCombo, 'layDownAll'>,
  workers: number,
) {
  const all = buildCombos(config, base).length
  return { all, roundSec: Math.ceil(all / Math.max(1, workers)) * SLICE_SEC }
}

/** 組み合わせのうち、範囲で変えている値だけを札にする */
export function comboChips(config: SweepConfig, c: SweepCombo) {
  const chips: string[] = []
  if (config.gap.on) chips.push(`すき間 ${c.gap}`)
  if (config.edgeGap.on) chips.push(`端 ${c.edgeGap}`)
  if (config.supportPercent.on) chips.push(`支え ${c.supportPercent}%`)
  if (config.wallBias.on) chips.push(`寄せ ${c.wallBias}`)
  if (config.tidyWeight.on) chips.push(`整い ${c.tidyWeight}`)
  if (config.bothObjectives)
    chips.push(c.objective === 'height' ? '優先 高さ' : '優先 1 段目')
  if (config.bothLayDown)
    chips.push(c.layDownAll ? '横倒し 全部可' : '横倒し 今のまま')
  return chips
}

/** 試した組み合わせ 1 つの結果 */
export type SweepRow = {
  chips: string[]
  /** 何回計算したか */
  visits: number
  /** 今、何個の Worker がこの組み合わせを計算しているか */
  active: number
  /**
   * 最後に良くなってから、計算に使った時間（ミリ秒）。計算していない時間は数えない。
   * 今計算しているときは、stallFrom からの時間を足して表示する
   */
  stallMs: number
  stallFrom?: number
  /** 全部の箱を置けた結果のうち、いちばん低いもの（表示用） */
  lowest?: PackResult
  /** 全部の箱を置けた結果のうち、1 段目のいちばん大きい割合と、いちばん低い重心 */
  bestFloor?: number
  bestCogZ?: number
}

const percent = (v: number) => (v * 100).toFixed(1)
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 設定欄の数値の項目。「1 つの値」ならスライダー、「範囲で試す」なら最小〜最大・刻みの入力を出す
 */
export function RangeOrValue({
  label,
  help,
  unit,
  value,
  min,
  max,
  step,
  format,
  range,
  onValue,
  onRange,
}: {
  label: string
  help?: ReactNode
  unit: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => ReactNode
  range: SweepRange
  onValue: (v: number) => void
  onRange: (r: SweepRange) => void
}) {
  const num = (key: 'min' | 'max' | 'step') => (
    <Input
      aria-label={`${label}の${{ min: '最小', max: '最大', step: '刻み' }[key]}`}
      type="number"
      inputMode="numeric"
      value={range[key]}
      onChange={(e) =>
        onRange({ ...range, [key]: Math.trunc(Number(e.target.value)) || 0 })
      }
      className="h-8 w-16 px-2 text-right font-mono tabular-nums"
    />
  )
  return (
    <div className="space-y-2">
      {range.on ? (
        <>
          <span className="flex items-center gap-1 text-sm">
            {label}
            {help && <HelpTip>{help}</HelpTip>}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {num('min')}
            <span className="text-muted-foreground">〜</span>
            {num('max')}
            <span className="text-muted-foreground">{unit.trim()}・刻み</span>
            {num('step')}
          </div>
        </>
      ) : (
        <RangeSlider
          label={label}
          help={help}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          format={format}
          onChange={onValue}
        />
      )}
      <div className="inline-flex rounded-md border p-0.5">
        {(
          [
            [false, '1 つの値'],
            [true, '範囲で試す'],
          ] as const
        ).map(([on, text]) => (
          <button
            key={text}
            type="button"
            aria-pressed={range.on === on}
            onClick={() => onRange({ ...range, on })}
            className={cn(
              'rounded px-2 py-0.5 text-xs text-muted-foreground',
              range.on === on && 'bg-muted text-foreground',
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 「探す」の欄。止めるまで探し続け、進み具合（経過時間・回数）を出す */
export function SearchBar({
  plan,
  running,
  elapsedMs,
  avgVisits,
  activeCount,
  count,
  tried,
  workers,
  gpu,
  useGpu,
  onUseGpu,
  error,
  onStart,
  onStop,
}: {
  plan: ReturnType<typeof planSearch>
  running: boolean
  /** 探し始めてからの時間 */
  elapsedMs: number
  /** 組み合わせ 1 つあたりの平均の計算回数 */
  avgVisits: number
  /** 今計算している組み合わせの数 */
  activeCount: number
  /** 今回の組み合わせの数 */
  count: number
  tried: number
  workers: number
  /** GPU（WebGPU）が使えるか */
  gpu: { status: 'checking' | 'ready' | 'unavailable'; description?: string }
  useGpu: boolean
  onUseGpu: (on: boolean) => void
  /** 入力の誤り（あれば探せない） */
  error: string | null
  onStart: () => void
  onStop: () => void
}) {
  const minutes = (sec: number) =>
    sec >= 90 ? `約 ${Math.round(sec / 60)} 分` : `約 ${Math.round(sec)} 秒`
  const planText =
    plan.all === 1
      ? `条件はすべて 1 つの値なので、その 1 通りを ${workers} 並列で探し続けます。「止める」を押すまで続け、1 時間たったら自動で止めます`
      : `${plan.all} 通りの組み合わせを、${workers} 並列で少しずつ（1 回 ${SLICE_SEC} 秒）探し続けます（全部に当てたあとは、成績の良い組み合わせに時間を多く使います）。全部に 1 回ずつ当たるまで ${minutes(plan.roundSec)}で、そのあとも前の良い並べ方の続きから詰めていきます。「止める」を押すまで続け、1 時間たったら自動で止めます`
  return (
    <section className="space-y-3 rounded-lg border-2 border-primary/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1 font-semibold">
          4. 探す
          <HelpTip>
            並列で動く計算係（Worker）が、それぞれ別の組み合わせを {SLICE_SEC}{' '}
            秒ずつ受け持ち、終わったら次の組み合わせを選び直します（まず全部に 1
            回ずつ当て、そのあとは成績の良いものや、前回伸びたものを多めに）。同じ組み合わせにまた当たったときは、前に見つけた良い並べ方の続きから詰めるので、全部の組み合わせが同時に少しずつ良くなっていきます。結果は下の「部門別ベスト」に自動で入ります。
          </HelpTip>
        </h2>
        <label
          className={cn(
            'ml-auto flex items-center gap-2 text-sm',
            gpu.status !== 'ready' && 'text-muted-foreground',
          )}
          title={gpu.description}
        >
          <input
            type="checkbox"
            checked={useGpu && gpu.status === 'ready'}
            disabled={running || gpu.status !== 'ready'}
            onChange={(e) => onUseGpu(e.target.checked)}
            className="size-4 accent-primary"
          />
          GPU も使う
          <span className="text-xs text-muted-foreground">
            {gpu.status === 'checking'
              ? '（確認中）'
              : gpu.status === 'unavailable'
                ? '（この環境では使えません）'
                : ''}
          </span>
        </label>
        <HelpTip>
          WebGPU が使えるブラウザでは、計算係の 1 つを GPU
          にして、少しずつ入れ替えた並べ順を数千通りまとめて評価します（上位だけを
          CPU で正式に評価）。使えないブラウザや、オフにしたときは CPU
          だけで計算します。
        </HelpTip>
        {running ? (
          <Button type="button" variant="outline" onClick={onStop}>
            <Square />
            止める
          </Button>
        ) : (
          <Button type="button" disabled={!!error} onClick={onStart}>
            <Search />
            探す
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : running ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>経過 {clock(elapsedMs)}</span>
          {count > 1 && (
            <span>
              {count} 通りを並行して探索中（今 {activeCount} 通りを計算中・1
              通りあたり平均 {avgVisits.toFixed(1)} 回）
            </span>
          )}
          <span className="font-mono text-xs tabular-nums">
            {tried.toLocaleString()} 通りの並べ方を試行中・
            {useGpu && gpu.status === 'ready'
              ? `GPU ＋ CPU ${workers - 1} 並列`
              : `${workers} 並列`}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{planText}</p>
      )}
    </section>
  )
}

type SortKey = 'order' | 'height' | 'floor' | 'cog' | 'stall'

/** 試した組み合わせの一覧。高さ・1 段目・重心で並べ替えられる */
/** 最後に良くなってから、計算に使った時間（ミリ秒） */
export const stallOf = (r: SweepRow, now: number) =>
  r.stallMs + (r.stallFrom !== undefined ? Math.max(0, now - r.stallFrom) : 0)

/** 秒・分の表示 */
const duration = (ms: number) => {
  const sec = Math.floor(ms / 1000)
  return sec < 60
    ? `${sec} 秒`
    : `${Math.floor(sec / 60)} 分 ${String(sec % 60).padStart(2, '0')} 秒`
}

export function SweepTable({
  rows,
  viewing,
  onView,
  now,
}: {
  rows: SweepRow[]
  viewing: number | null
  onView: (index: number) => void
  /** 今の時刻（計算中の組み合わせの「変化なし」を進めて表示する） */
  now: number
}) {
  const [sort, setSort] = useState<SortKey>('order')
  const order = rows.map((r, i) => ({ r, i }))
  const inf = Number.POSITIVE_INFINITY
  if (sort === 'height')
    order.sort(
      (a, b) => (a.r.lowest?.height ?? inf) - (b.r.lowest?.height ?? inf),
    )
  if (sort === 'floor')
    order.sort((a, b) => (b.r.bestFloor ?? -1) - (a.r.bestFloor ?? -1))
  if (sort === 'cog')
    order.sort((a, b) => (a.r.bestCogZ ?? inf) - (b.r.bestCogZ ?? inf))
  if (sort === 'stall')
    order.sort((a, b) => stallOf(b.r, now) - stallOf(a.r, now))
  const head = (key: SortKey, text: string) => (
    <th className="py-1 font-normal">
      <button
        type="button"
        aria-pressed={sort === key}
        onClick={() => setSort(key)}
        className={cn(
          'hover:text-foreground',
          sort === key && 'font-semibold text-foreground',
        )}
      >
        {text}
        {sort === key && key !== 'order' && ' ▲'}
      </button>
    </th>
  )
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="flex items-center gap-1 font-semibold">
        試した組み合わせ（{rows.filter((r) => r.visits > 0).length} /{' '}
        {rows.length}）
        <HelpTip>
          今回の「探す」で試している条件の組み合わせです。「回数」は、その組み合わせを何回計算したか、「変化なし」は、最後に良くなってから計算に使った時間です（計算していない時間は数えません。良くなると
          0
          に戻ります）。水色の行は今計算している組み合わせです。見出しを押すと、その項目で並べ替えます。「表示」で、その組み合わせのいちばん低い結果を下の「詳しく見る」に出します。
        </HelpTip>
      </h2>
      <div className="h-64 overflow-auto rounded-md border">
        <table className="w-full min-w-[44rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
            <tr>
              {head('order', '#')}
              <th className="py-1 font-normal">変えた条件</th>
              <th className="py-1 font-normal">回数</th>
              {head('stall', '変化なし')}
              {head('height', 'いちばん低い')}
              {head('floor', '1 段目（最大）')}
              {head('cog', '重心の高さ（最小）')}
              <th className="py-1">
                <span className="sr-only">表示</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {order.map(({ r, i }) => {
              const active = viewing === i
              return (
                <tr
                  key={i}
                  className={cn(
                    'border-t',
                    r.active > 0 && 'bg-sky-50 dark:bg-sky-950/40',
                    active && 'bg-muted/60',
                  )}
                >
                  <td className="py-1 font-mono tabular-nums">{i + 1}</td>
                  <td className="py-1">
                    <div className="flex flex-wrap gap-1">
                      {r.chips.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          設定欄の値のまま
                        </span>
                      ) : (
                        r.chips.map((c) => (
                          <span
                            key={c}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs"
                          >
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap tabular-nums">
                    {r.visits}
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap tabular-nums">
                    {r.visits > 0 || r.active > 0
                      ? duration(stallOf(r, now))
                      : '—'}
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap tabular-nums">
                    {r.lowest
                      ? `${r.lowest.height.toLocaleString()} mm`
                      : r.active > 0
                        ? '計算中'
                        : r.visits > 0
                          ? '全部は置けず'
                          : 'まだ'}
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap tabular-nums">
                    {r.bestFloor !== undefined
                      ? `${percent(r.bestFloor)}%`
                      : '—'}
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap tabular-nums">
                    {r.bestCogZ !== undefined
                      ? `${Math.round(r.bestCogZ)} mm`
                      : '—'}
                  </td>
                  <td className="py-1 text-right">
                    <Button
                      type="button"
                      variant={active ? 'secondary' : 'ghost'}
                      size="sm"
                      disabled={!r.lowest}
                      aria-pressed={active}
                      onClick={() => onView(i)}
                    >
                      <Eye />
                      {active ? '表示中' : '表示'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
