import { Eye, RotateCcw, Trash2 } from 'lucide-react'

import { HelpTip } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PackResult } from './box-packing-solver'

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
  const currentValue = new Map(current.map((c) => [c.label, c.value]))
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
                    <div className="flex flex-wrap gap-1">
                      {s.summary.map((item) => (
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
