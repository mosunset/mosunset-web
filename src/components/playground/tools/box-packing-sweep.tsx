import { Eye, Loader2, Play, Square } from 'lucide-react'
import type { ReactNode } from 'react'

import { HelpTip, RangeSlider } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Objective, PackResult } from './box-packing-solver'

/** 範囲で試す数値の設定（on でなければ、今の設定の値で固定） */
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
  /** 1 つの組み合わせにかける時間（秒） */
  perComboSec: number
  /** all: 全部の組み合わせ / random: その中からランダムに randomCount 個 */
  mode: 'all' | 'random'
  randomCount: number
}

export const defaultSweep: SweepConfig = {
  gap: { on: false, min: 2, max: 10, step: 2 },
  edgeGap: { on: false, min: 2, max: 10, step: 2 },
  supportPercent: { on: false, min: 85, max: 100, step: 5 },
  wallBias: { on: false, min: 0, max: 100, step: 50 },
  bothObjectives: false,
  bothLayDown: false,
  perComboSec: 15,
  mode: 'all',
  randomCount: 20,
}

/** 範囲か「両方」を 1 つでも選んでいるか（選んでいれば、自動の計算はせず、まとめて試す） */
export function isSweepActive(c: SweepConfig) {
  return (
    c.gap.on ||
    c.edgeGap.on ||
    c.supportPercent.on ||
    c.wallBias.on ||
    c.bothObjectives ||
    c.bothLayDown
  )
}

/** 1 つの組み合わせ（今の設定から変える値） */
export type SweepCombo = {
  gap: number
  edgeGap: number
  supportPercent: number
  wallBias: number
  objective: Objective
  layDownAll: boolean
}

/** 範囲（最小〜最大、刻み）の値の一覧。範囲でなければ今の値だけ */
function valuesOf(r: SweepRange, current: number, lo: number, hi: number) {
  if (!r.on) return [current]
  const min = Math.max(lo, Math.min(r.min, r.max))
  const max = Math.min(hi, Math.max(r.min, r.max))
  const step = Math.max(1, r.step)
  const out: number[] = []
  for (let v = min; v <= max && out.length < 50; v += step) out.push(v)
  return out.length > 0 ? out : [current]
}

/** これより多い組み合わせは作らない（ランダムで選ぶ元にもこの数まで） */
export const MAX_COMBOS = 2000

/** 組み合わせを作る（全部、または全部の中からランダムに） */
export function buildCombos(
  config: SweepConfig,
  base: Omit<SweepCombo, 'layDownAll'>,
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
  if (config.mode === 'all' || config.randomCount >= all.length) return all
  // 全部の組み合わせを混ぜて、先頭から選ぶ（同じ組み合わせを 2 回選ばない）
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.max(1, config.randomCount))
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
  /** 全部の箱を置けた結果のうち、いちばん 1 段目が埋まったときの割合と、いちばん低い重心 */
  bestFloor?: number
  bestCogZ?: number
}

const percent = (v: number) => (v * 100).toFixed(1)

/**
 * 設定欄の数値の項目。「1 つの値」ならスライダー、「範囲」なら最小〜最大・刻みの入力を出す。
 * 範囲にした項目があると、自動の計算はせず、「範囲でまとめて試す」で組み合わせを計算する
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

/**
 * 範囲でまとめて試す。設定の範囲を決めると、その中の組み合わせを順に計算し、
 * 結果は「この床と箱での部門別ベスト」に自動で入る
 */
export function SweepPanel({
  config,
  onConfig,
  comboCount,
  running,
  active,
  disabled,
  rows,
  current,
  viewing,
  onStart,
  onStop,
  onView,
}: {
  config: SweepConfig
  onConfig: (c: SweepConfig) => void
  /** 今の範囲で試す組み合わせの数 */
  comboCount: number
  running: boolean
  /** 設定欄で、範囲か「両方」を 1 つでも選んでいるか */
  active: boolean
  /** 入力に誤りがあるときなど */
  disabled: boolean
  rows: SweepRow[]
  /** 計算中の組み合わせの番号 */
  current: number
  viewing: number | null
  onStart: () => void
  onStop: () => void
  onView: (index: number | null) => void
}) {
  const set = <K extends keyof SweepConfig>(key: K, value: SweepConfig[K]) =>
    onConfig({ ...config, [key]: value })
  const seconds = comboCount * config.perComboSec
  const minutes =
    seconds >= 60 ? `約 ${Math.ceil(seconds / 60)} 分` : `約 ${seconds} 秒`
  const done = rows.filter((r) => r.status === 'done').length

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="flex items-center gap-1 font-semibold">
        範囲でまとめて試す
        <HelpTip>
          上の「床と積み方」で「範囲で試す」にした項目（と、優先することの「両方」、横倒しの「全部オンでも試す」）の組み合わせを、順に計算します。床・箱・壁は今のままで、結果は「この床と箱での部門別ベスト」に自動で入ります。範囲にした項目があるあいだは、設定を変えても自動では計算しません。
        </HelpTip>
      </h2>
      {!active && (
        <p className="text-sm text-muted-foreground">
          上の「床と積み方」で、どれかの項目を「範囲で試す」にする（または、優先することを「両方」にする）と、ここでまとめて試せます。
        </p>
      )}

      <fieldset disabled={running} className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm">
          <span className="flex items-center gap-2">
            1 つの組み合わせに
            <Input
              aria-label="1 つの組み合わせにかける秒数"
              type="number"
              inputMode="numeric"
              min={5}
              max={300}
              value={config.perComboSec}
              onChange={(e) =>
                set(
                  'perComboSec',
                  Math.min(
                    300,
                    Math.max(5, Math.trunc(Number(e.target.value)) || 5),
                  ),
                )
              }
              className="h-8 w-20 px-2 text-right font-mono tabular-nums"
            />
            秒
          </span>
          <div className="inline-flex rounded-md border p-0.5">
            {(
              [
                ['all', '全部の組み合わせ'],
                ['random', 'ランダムに選ぶ'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={config.mode === value}
                onClick={() => set('mode', value)}
                className={cn(
                  'rounded px-3 py-1 text-xs text-muted-foreground',
                  config.mode === value && 'bg-muted text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {config.mode === 'random' && (
            <span className="flex items-center gap-2">
              <Input
                aria-label="ランダムに選ぶ数"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={config.randomCount}
                onChange={(e) =>
                  set(
                    'randomCount',
                    Math.min(
                      500,
                      Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                    ),
                  )
                }
                className="h-8 w-20 px-2 text-right font-mono tabular-nums"
              />
              個
            </span>
          )}
        </div>
      </fieldset>

      <div
        className={cn(
          'flex flex-wrap items-center gap-3 text-sm',
          !active && !running && 'hidden',
        )}
      >
        <span>
          {comboCount.toLocaleString()} 通り・{minutes}
          {config.mode === 'all' && comboCount > 60 && (
            <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
              多いので「ランダムに選ぶ」がおすすめです
            </span>
          )}
        </span>
        {running ? (
          <Button type="button" variant="outline" size="sm" onClick={onStop}>
            <Square />
            止める
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={disabled || comboCount === 0}
            onClick={onStart}
          >
            <Play />
            まとめて試す
          </Button>
        )}
        {running && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {current + 1} / {rows.length} 通り目を計算中
          </span>
        )}
        {!running && rows.length > 0 && (
          <span className="text-muted-foreground">
            {done} / {rows.length} 通りを試しました
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="h-64 overflow-auto rounded-md border">
          <table className="w-full min-w-[44rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">#</th>
                <th className="py-1 font-normal">変えた設定</th>
                <th className="py-1 font-normal">いちばん低い</th>
                <th className="py-1 font-normal">1 段目（最大）</th>
                <th className="py-1 font-normal">重心の高さ（最小）</th>
                <th className="py-1">
                  <span className="sr-only">表示</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const active = viewing === i
                return (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: 組み合わせの番号そのものが識別子
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
                            今の設定のまま
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
                        onClick={() => onView(active ? null : i)}
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
      )}
    </section>
  )
}
