import { Eye, Loader2, Search, Square } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { HelpTip, RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Objective, PackResult } from './box-packing-solver'

/** 範囲で試す数値の設定（on でなければ、設定欄の 1 つの値で固定） */
export type SweepRange = { on: boolean; min: number; max: number; step: number }

export type SweepConfig = {
  gap: SweepRange
  edgeGap: SweepRange
  supportPercent: SweepRange
  wallBias: SweepRange
  /** 「全体の高さを低く」と「下の段から隙間なく」の両方を試す */
  bothObjectives: boolean
  /** 横倒しの許可を「今のまま」と「全部オン」の両方で試す */
  bothLayDown: boolean
  /** 「探す」にかける時間の合計（秒） */
  totalSec: number
}

/** 最初の条件。だいたいの範囲から始め、決めたい項目だけ「1 つの値」にする */
export const defaultSweep: SweepConfig = {
  gap: { on: true, min: 2, max: 10, step: 2 },
  edgeGap: { on: false, min: 2, max: 10, step: 2 },
  supportPercent: { on: true, min: 85, max: 100, step: 5 },
  wallBias: { on: false, min: 0, max: 100, step: 50 },
  bothObjectives: true,
  bothLayDown: true,
  totalSec: 300,
}

/** 1 つの組み合わせにかける時間の下限（これより短いと、良い並べ方を探しきれない） */
export const MIN_COMBO_SEC = 10

/** 1 つの組み合わせ（設定欄の値から変える値） */
export type SweepCombo = {
  gap: number
  edgeGap: number
  supportPercent: number
  wallBias: number
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

/**
 * 組み合わせを作る。limit を渡すと、全部の中からランダムに limit 個選ぶ
 * （同じ組み合わせを 2 回選ばない）
 */
export function buildCombos(
  config: SweepConfig,
  base: Omit<SweepCombo, 'layDownAll'>,
  limit?: number,
): SweepCombo[] {
  const gaps = valuesOf(config.gap, base.gap, 0, 50)
  const edges = valuesOf(config.edgeGap, base.edgeGap, 0, 50)
  const supports = valuesOf(config.supportPercent, base.supportPercent, 50, 100)
  const biases = valuesOf(config.wallBias, base.wallBias, 0, 100)
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
            for (const layDownAll of layDowns) {
              if (all.length >= MAX_COMBOS) break
              all.push({
                gap,
                edgeGap,
                supportPercent,
                wallBias,
                objective,
                layDownAll,
              })
            }
  if (limit === undefined || limit >= all.length) return all
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.max(1, limit))
}

/**
 * 合計時間から、試し方を決める。
 * 全部の組み合わせが時間内に収まれば全部を、収まらなければランダムに選んで試す
 */
export function planSearch(
  config: SweepConfig,
  base: Omit<SweepCombo, 'layDownAll'>,
) {
  const all = buildCombos(config, base).length
  const maxCount = Math.max(1, Math.floor(config.totalSec / MIN_COMBO_SEC))
  const count = Math.min(all, maxCount)
  return {
    all,
    count,
    random: count < all,
    perComboSec: config.totalSec / count,
  }
}

/** 組み合わせのうち、範囲で変えている値だけを札にする */
export function comboChips(config: SweepConfig, c: SweepCombo) {
  const chips: string[] = []
  if (config.gap.on) chips.push(`すき間 ${c.gap}`)
  if (config.edgeGap.on) chips.push(`端 ${c.edgeGap}`)
  if (config.supportPercent.on) chips.push(`支え ${c.supportPercent}%`)
  if (config.wallBias.on) chips.push(`寄せ ${c.wallBias}`)
  if (config.bothObjectives)
    chips.push(c.objective === 'height' ? '優先 高さ' : '優先 1 段目')
  if (config.bothLayDown)
    chips.push(c.layDownAll ? '横倒し 全部可' : '横倒し 今のまま')
  return chips
}

/** 試した組み合わせ 1 つの結果 */
export type SweepRow = {
  chips: string[]
  status: 'wait' | 'run' | 'done'
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

/** 「探す」の欄。かける時間の合計と、試し方の見込み、進み具合を出す */
export function SearchBar({
  totalSec,
  onTotalSec,
  plan,
  running,
  index,
  count,
  remainingMs,
  tried,
  workers,
  error,
  onStart,
  onStop,
}: {
  totalSec: number
  onTotalSec: (sec: number) => void
  plan: ReturnType<typeof planSearch>
  running: boolean
  /** 計算中の組み合わせの番号（0 から） */
  index: number
  /** 今回試す組み合わせの数 */
  count: number
  remainingMs: number
  tried: number
  workers: number
  /** 入力の誤り（あれば探せない） */
  error: string | null
  onStart: () => void
  onStop: () => void
}) {
  const planText =
    plan.all === 1
      ? '条件はすべて 1 つの値なので、1 通りをじっくり探します'
      : plan.random
        ? `${plan.all.toLocaleString()} 通りの組み合わせから、ランダムに ${plan.count} 通りを試します（1 通り約 ${Math.round(plan.perComboSec)} 秒）`
        : `${plan.all} 通りの組み合わせを全部試します（1 通り約 ${Math.round(plan.perComboSec)} 秒）`
  return (
    <section className="space-y-3 rounded-lg border-2 border-primary/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1 font-semibold">
          4. 探す
          <HelpTip>
            上の条件の組み合わせを、決めた時間の中で順に計算します。全部の組み合わせが時間内に収まれば全部を、収まらなければ範囲の中からランダムに選んで試します（1
            通りに最低 {MIN_COMBO_SEC}{' '}
            秒）。結果は下の「部門別ベスト」に自動で入ります。
          </HelpTip>
        </h2>
        <label className="ml-auto flex items-center gap-2 text-sm">
          かける時間
          <select
            value={totalSec}
            disabled={running}
            onChange={(e) => onTotalSec(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2"
          >
            {[60, 180, 300, 600, 900, 1800, 3600].map((s) => (
              <option key={s} value={s}>
                {s / 60} 分
              </option>
            ))}
          </select>
        </label>
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
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${Math.min(100, (index / Math.max(1, count)) * 100)}%`,
              }}
            />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>
              {Math.min(index + 1, count)} / {count} 通り目
            </span>
            <span>残り約 {clock(remainingMs)}</span>
            <span className="font-mono text-xs tabular-nums">
              {tried.toLocaleString()} 通りの並べ方を試行中・{workers} 並列
            </span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{planText}</p>
      )}
    </section>
  )
}

type SortKey = 'order' | 'height' | 'floor' | 'cog'

/** 試した組み合わせの一覧。高さ・1 段目・重心で並べ替えられる */
export function SweepTable({
  rows,
  viewing,
  onView,
}: {
  rows: SweepRow[]
  viewing: number | null
  onView: (index: number) => void
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
        試した組み合わせ（{rows.filter((r) => r.status === 'done').length} /{' '}
        {rows.length}）
        <HelpTip>
          今回の「探す」で試した条件の組み合わせです。見出しを押すと、その項目で並べ替えます。「表示」で、その組み合わせのいちばん低い結果を下の「詳しく見る」に出します。
        </HelpTip>
      </h2>
      <div className="h-64 overflow-auto rounded-md border">
        <table className="w-full min-w-[44rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
            <tr>
              {head('order', '#')}
              <th className="py-1 font-normal">変えた条件</th>
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
                    r.status === 'run' && 'bg-sky-50 dark:bg-sky-950/40',
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
                    {r.lowest
                      ? `${r.lowest.height.toLocaleString()} mm`
                      : r.status === 'wait'
                        ? '待ち'
                        : r.status === 'run'
                          ? '計算中'
                          : '全部は置けず'}
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
