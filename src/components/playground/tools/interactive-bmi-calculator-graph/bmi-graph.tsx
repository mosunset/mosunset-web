import { useRef, useState } from 'react'

import { Stat } from '@/components/playground/parts'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// 日本肥満学会（JASSO）の判定基準
const classes = [
  {
    max: 18.5,
    label: '低体重（やせ）',
    tone: 'text-sky-600 dark:text-sky-400',
  },
  {
    max: 25,
    label: '普通体重',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    max: 30,
    label: '肥満（1 度）',
    tone: 'text-amber-600 dark:text-amber-400',
  },
  {
    max: 35,
    label: '肥満（2 度）',
    tone: 'text-orange-600 dark:text-orange-400',
  },
  { max: 40, label: '肥満（3 度）', tone: 'text-rose-600 dark:text-rose-400' },
  {
    max: Number.POSITIVE_INFINITY,
    label: '肥満（4 度）',
    tone: 'text-rose-700 dark:text-rose-300',
  },
]

const bmiOf = (kg: number, cm: number) => kg / (cm / 100) ** 2
const weightAt = (bmi: number, cm: number) => bmi * (cm / 100) ** 2
const classify = (bmi: number) =>
  classes.find((c) => bmi < c.max) ?? classes[classes.length - 1]

// グラフの範囲
const H_MIN = 130
const H_MAX = 200
const W_MIN = 30
const W_MAX = 130
const LINES = [18.5, 22, 25, 30, 35, 40]

export function BmiGraph() {
  const [height, setHeight] = useState(170)
  const [weight, setWeight] = useState(65)
  const bmi = bmiOf(weight, height)
  const cls = classify(bmi)
  const standard = weightAt(22, height)
  const normalMin = weightAt(18.5, height)
  const normalMax = weightAt(25, height)
  const toNormal =
    weight < normalMin
      ? normalMin - weight
      : weight >= normalMax
        ? normalMax - weight
        : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SliderInput
          label="身長"
          unit="cm"
          value={height}
          min={H_MIN}
          max={H_MAX}
          step={0.5}
          onChange={setHeight}
        />
        <SliderInput
          label="体重"
          unit="kg"
          value={weight}
          min={W_MIN}
          max={W_MAX}
          step={0.1}
          onChange={setWeight}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="BMI" value={bmi.toFixed(1)} />
        <div className="rounded-lg border p-3 sm:p-4">
          <div className="text-xs text-muted-foreground">判定</div>
          <div className={cn('mt-1 text-lg font-bold', cls.tone)}>
            {cls.label}
          </div>
        </div>
        <Stat
          label="標準体重（BMI 22）"
          value={standard.toFixed(1)}
          unit="kg"
        />
        <Stat
          label="普通体重まで"
          value={
            toNormal === 0
              ? '範囲内'
              : `${toNormal > 0 ? '+' : ''}${toNormal.toFixed(1)}`
          }
          unit={toNormal === 0 ? undefined : 'kg'}
          hint={`${normalMin.toFixed(1)}〜${normalMax.toFixed(1)} kg`}
        />
      </div>

      <Chart
        height={height}
        weight={weight}
        onPick={(h, w) => {
          setHeight(Math.round(h * 2) / 2)
          setWeight(Math.round(w * 10) / 10)
        }}
      />

      <p className="text-xs text-muted-foreground">
        判定は日本肥満学会の基準です。BMI
        は体脂肪の量を直接は表さないので、目安として使ってください。
      </p>
    </div>
  )
}

/** 身長（横）× 体重（縦）のグラフ。クリック・ドラッグで値を動かせる */
function Chart({
  height,
  weight,
  onPick,
}: {
  height: number
  weight: number
  onPick: (h: number, w: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 600
  const H = 380
  const pad = { l: 44, r: 16, t: 12, b: 32 }
  const x = (h: number) =>
    pad.l + ((h - H_MIN) / (H_MAX - H_MIN)) * (W - pad.l - pad.r)
  const y = (w: number) =>
    H - pad.b - ((w - W_MIN) / (W_MAX - W_MIN)) * (H - pad.t - pad.b)

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    const h = H_MIN + ((px - pad.l) / (W - pad.l - pad.r)) * (H_MAX - H_MIN)
    const w = W_MIN + ((H - pad.b - py) / (H - pad.t - pad.b)) * (W_MAX - W_MIN)
    onPick(
      Math.min(H_MAX, Math.max(H_MIN, h)),
      Math.min(W_MAX, Math.max(W_MIN, w)),
    )
  }

  const curve = (bmi: number) => {
    const pts: string[] = []
    for (let h = H_MIN; h <= H_MAX; h += 2) {
      const w = weightAt(bmi, h)
      if (w >= W_MIN && w <= W_MAX) pts.push(`${x(h)},${y(w)}`)
    }
    return pts.join(' ')
  }

  return (
    <div className="rounded-lg border p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label="身長と体重の BMI グラフ"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pick(e)
        }}
      >
        {/* 普通体重の範囲を塗る */}
        <polygon
          points={[
            ...Array.from({ length: 36 }, (_, i) => H_MIN + i * 2).map(
              (h) => `${x(h)},${y(Math.min(W_MAX, weightAt(25, h)))}`,
            ),
            ...Array.from({ length: 36 }, (_, i) => H_MAX - i * 2).map(
              (h) => `${x(h)},${y(Math.max(W_MIN, weightAt(18.5, h)))}`,
            ),
          ].join(' ')}
          className="fill-emerald-500/10"
        />
        {/* 目盛り */}
        {[130, 140, 150, 160, 170, 180, 190, 200].map((h) => (
          <g key={`h${h}`}>
            <line
              x1={x(h)}
              x2={x(h)}
              y1={pad.t}
              y2={H - pad.b}
              className="stroke-border"
            />
            <text
              x={x(h)}
              y={H - pad.b + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {h}
            </text>
          </g>
        ))}
        {[30, 50, 70, 90, 110, 130].map((w) => (
          <g key={`w${w}`}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(w)}
              y2={y(w)}
              className="stroke-border"
            />
            <text
              x={pad.l - 6}
              y={y(w) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {w}
            </text>
          </g>
        ))}
        <text
          x={W - pad.r}
          y={H - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          身長 cm
        </text>
        <text x={4} y={pad.t + 8} className="fill-muted-foreground text-[11px]">
          kg
        </text>
        {/* BMI の線 */}
        {LINES.map((bmi) => {
          const lastH =
            [...Array.from({ length: 36 }, (_, i) => H_MAX - i * 2)].find(
              (h) => weightAt(bmi, h) <= W_MAX,
            ) ?? H_MIN
          return (
            <g key={bmi}>
              <polyline
                points={curve(bmi)}
                fill="none"
                strokeWidth={bmi === 22 ? 2 : 1.25}
                strokeDasharray={bmi === 22 ? '6 4' : undefined}
                className={
                  bmi === 22
                    ? 'stroke-emerald-500'
                    : 'stroke-muted-foreground/60'
                }
              />
              <text
                x={x(lastH) - 4}
                y={y(weightAt(bmi, lastH)) - 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {bmi}
              </text>
            </g>
          )
        })}
        {/* 今の値 */}
        <line
          x1={x(height)}
          x2={x(height)}
          y1={pad.t}
          y2={H - pad.b}
          className="stroke-primary/30"
          strokeDasharray="3 3"
        />
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(weight)}
          y2={y(weight)}
          className="stroke-primary/30"
          strokeDasharray="3 3"
        />
        <circle
          cx={x(height)}
          cy={y(weight)}
          r={7}
          className="fill-primary stroke-background"
          strokeWidth={2}
        />
      </svg>
      <p className="px-2 pb-1 text-xs text-muted-foreground">
        グラフをクリック・ドラッグしても身長と体重を変えられます。数字の付いた線が
        BMI、緑の帯が普通体重の範囲です。
      </p>
    </div>
  )
}

function SliderInput({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v > 0) onChange(v)
            }}
            className="w-24 text-right"
            aria-label={label}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={`${label}のスライダー`}
      />
    </div>
  )
}
