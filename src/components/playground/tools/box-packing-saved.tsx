import { Eye, Play, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { HelpTip } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type Metric,
  metricLabels,
  metrics,
  type PackResult,
} from './box-packing-solver'

/** 設定の要点（比べるときに並べる項目）。box-packing.tsx の設定から作る */
export type SettingsSummary = { label: string; value: string }[]

export type SavedView = {
  id: string
  savedAt: number
  /** 何回目の探し方（乱数の種）で見つけたか */
  run: number
  summary: SettingsSummary
  result: PackResult
}

const percent = (v: number) => (v * 100).toFixed(1)
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * 保存した結果の一覧。設定を変えても、ページを読み込み直しても消えない。
 * 今の設定と違う項目には色を付けて、何を変えた結果なのかを分かるようにする
 */
export function SavedResults({
  saved,
  current,
  viewing,
  onView,
  onRestore,
  onDelete,
  onClear,
}: {
  saved: SavedView[]
  /** 今の設定の要点（違いに色を付けるため） */
  current: SettingsSummary
  viewing: string | null
  onView: (id: string | null) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 font-semibold">
          保存した結果（{saved.length} 件）
          <HelpTip>
            候補の「保存」で、ここに結果を残します。設定や探し方を変えても、ページを読み込み直しても消えないので、別の設定どうしで見比べられます。今の設定と違う項目には色を付けます。最大
            20 件で、古いものから消えます。
          </HelpTip>
        </h2>
        <div className="flex gap-2">
          {viewing !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onView(null)}
            >
              今の計算の結果を表示
            </Button>
          )}
          {saved.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    '保存した結果をすべて消します。よろしいですか？',
                  )
                )
                  onClear()
              }}
            >
              すべて消す
            </Button>
          )}
        </div>
      </div>
      <div className="h-64 overflow-auto rounded-md border">
        {saved.length === 0 && (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            候補の「保存」を押すと、ここに並びます。設定や探し方を変えた結果どうしを比べられます。
          </p>
        )}
        <table
          className={cn(
            'w-full min-w-[60rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:whitespace-nowrap',
            saved.length === 0 && 'hidden',
          )}
        >
          <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">保存</th>
              <th className="py-1 font-normal">探し方</th>
              <th className="py-1 font-normal">
                設定（色付きは今の設定と違う項目）
              </th>
              <th className="py-1 font-normal">高さ</th>
              <th className="py-1 font-normal">充填率</th>
              <th className="py-1 font-normal">1 段目</th>
              <th className="py-1 font-normal">置けた箱</th>
              <th className="py-1 font-normal">重心 x, y</th>
              <th className="py-1">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            {[...saved].reverse().map((s) => {
              const active = s.id === viewing
              const r = s.result
              return (
                <tr
                  key={s.id}
                  className={cn('border-t', active && 'bg-muted/60')}
                >
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {time(s.savedAt)}
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    #{s.run}
                  </td>
                  <td className="py-1.5">
                    <SummaryChips summary={s.summary} current={current} />
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {r.height.toLocaleString()} mm
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {percent(r.fillRate)}%
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {percent(r.floorCoverage)}%
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {r.placements.length}
                    {r.unplaced.length > 0 && (
                      <span className="ml-1 text-xs text-destructive">
                        （{r.unplaced.reduce((n, u) => n + u.count, 0)}{' '}
                        個置けず）
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                    {r.cog
                      ? `${Math.round(r.cog.x)}, ${Math.round(r.cog.y)}`
                      : '—'}
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant={active ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={active}
                      onClick={() => onView(active ? null : s.id)}
                    >
                      <Eye />
                      {active ? '表示中' : '表示'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title="この結果の設定を、下の設定欄に戻します"
                      onClick={() => onRestore(s.id)}
                    >
                      <RotateCcw />
                      設定に戻す
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="この保存を消す"
                      onClick={() => onDelete(s.id)}
                    >
                      <Trash2 />
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

/** 設定の要点を小さな札で並べる。今の設定と違う項目には色を付ける */
function SummaryChips({
  summary,
  current,
}: {
  summary: SettingsSummary
  current: SettingsSummary
}) {
  const currentValue = new Map(current.map((c) => [c.label, c.value]))
  return (
    <div className="flex flex-wrap gap-1">
      {summary.map((item) => (
        <span
          key={item.label}
          className={cn(
            'rounded px-1.5 py-0.5 text-xs',
            currentValue.get(item.label) === item.value
              ? 'bg-muted text-muted-foreground'
              : 'bg-amber-100 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
          )}
        >
          {item.label} {item.value}
        </span>
      ))}
    </div>
  )
}

export type BestView = {
  metric: Metric
  /** 見つけた探し方（#1）か、範囲で試した組み合わせ（範囲 3） */
  label: string
  foundAt: number
  summary: SettingsSummary
  result: PackResult
}

/**
 * 今の床と箱での、部門別（低さ・1 段目・重心）のいちばん。
 * ほかの設定や探し方が違っても、床の X・Y と箱が同じ結果は全部まとめて比べ、自動で記録する
 */
export function BestResults({
  bests,
  current,
  viewing,
  onView,
  onRestore,
  onContinue,
  onSave,
  onClear,
  children,
}: {
  bests: BestView[]
  current: SettingsSummary
  /** 表示している部門（なければ null） */
  viewing: Metric | null
  onView: (metric: Metric | null) => void
  onRestore: (metric: Metric) => void
  onContinue: (metric: Metric) => void
  onSave: (metric: Metric) => void
  onClear: () => void
  /** 表の上に差し込む中身（3D の横並び） */
  children?: ReactNode
}) {
  const byMetric = new Map(bests.map((b) => [b.metric, b]))
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 font-semibold">
          5. この床と箱での部門別ベスト
          <HelpTip>
            床の X・Y
            と箱（寸法・個数・使うかどうか）が今と同じ結果を、すき間・支え・優先・壁・横倒しの許可・探し方が違っても全部まとめて比べ、部門ごとのいちばんを自動で記録します。全部の箱を置けた結果だけが対象です。ページを読み込み直しても残ります。
          </HelpTip>
        </h2>
        {bests.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  'この床と箱の部門別ベストの記録を消します。よろしいですか？',
                )
              )
                onClear()
            }}
          >
            この記録を消す
          </Button>
        )}
      </div>
      {children}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[70rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_th]:whitespace-nowrap">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">部門</th>
              <th className="py-1 font-normal">探し方</th>
              <th className="py-1 font-normal">
                設定（色付きは今の設定と違う項目）
              </th>
              <th className="py-1 font-normal">高さ</th>
              <th className="py-1 font-normal">1 段目</th>
              <th className="py-1 font-normal">重心の高さ</th>
              <th className="py-1 font-normal">整い</th>
              <th className="py-1">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            {metrics.map((metric) => {
              const b = byMetric.get(metric)
              const active = viewing === metric
              return (
                <tr
                  key={metric}
                  className={cn('border-t', active && 'bg-muted/60')}
                >
                  <td className="py-1.5 font-medium whitespace-nowrap">
                    {metricLabels[metric]}
                  </td>
                  {b ? (
                    <>
                      <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                        {b.label}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {time(b.foundAt)}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <SummaryChips summary={b.summary} current={current} />
                      </td>
                      <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                        {b.result.height.toLocaleString()} mm
                      </td>
                      <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                        {percent(b.result.floorCoverage)}%
                      </td>
                      <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                        {b.result.cog
                          ? `${Math.round(b.result.cog.z)} mm`
                          : '—'}
                      </td>
                      <td className="py-1.5 font-mono whitespace-nowrap tabular-nums">
                        {percent(b.result.tidiness)}%
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant={active ? 'secondary' : 'ghost'}
                          size="sm"
                          aria-pressed={active}
                          onClick={() => onView(active ? null : metric)}
                        >
                          <Eye />
                          {active ? '表示中' : '表示'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="設定に戻す（この結果の設定を、下の設定欄に戻します）"
                          aria-label="設定に戻す"
                          onClick={() => onRestore(metric)}
                        >
                          <RotateCcw />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="この結果の設定に戻し、この結果の積む順番を出発点にして計算を続けます"
                          onClick={() => onContinue(metric)}
                        >
                          <Play />
                          続けて詰める
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="保存（下の「保存した結果」に残します）"
                          aria-label="保存"
                          onClick={() => onSave(metric)}
                        >
                          <Save />
                        </Button>
                      </td>
                    </>
                  ) : (
                    <td
                      colSpan={7}
                      className="py-1.5 text-xs text-muted-foreground"
                    >
                      まだ記録がありません（全部の箱を置けた結果から、自動で記録します）
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
