import { Crown, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// 量の単位。同じ group どうしは base に換算して比べられる
const units = [
  { id: 'g', label: 'g', group: 'weight', toBase: 1 },
  { id: 'kg', label: 'kg', group: 'weight', toBase: 1000 },
  { id: 'ml', label: 'ml', group: 'volume', toBase: 1 },
  { id: 'l', label: 'L', group: 'volume', toBase: 1000 },
  { id: 'piece', label: '個・枚・本', group: 'count', toBase: 1 },
] as const
type UnitId = (typeof units)[number]['id']
type Group = (typeof units)[number]['group']

/** 結果を見せるときの基準（100g あたりなど） */
const per: Record<Group, { amount: number; label: string }> = {
  weight: { amount: 100, label: '100g あたり' },
  volume: { amount: 100, label: '100ml あたり' },
  count: { amount: 1, label: '1 個あたり' },
}

type Item = {
  id: number
  name: string
  price: string
  amount: string
  count: string
  unit: UnitId
}

let nextId = 1
const newItem = (unit: UnitId = 'g'): Item => ({
  id: nextId++,
  name: '',
  price: '',
  amount: '',
  count: '1',
  unit,
})

const yen = (v: number) =>
  `${v.toLocaleString('ja-JP', { maximumFractionDigits: v < 10 ? 2 : 1 })} 円`

export function UnitPriceComparison() {
  const [items, setItems] = useState<Item[]>(() => [newItem(), newItem()])

  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const bump = (id: number, key: 'price' | 'amount', by: number) =>
    setItems((list) =>
      list.map((i) =>
        i.id === id ? { ...i, [key]: String((Number(i[key]) || 0) + by) } : i,
      ),
    )

  const results = useMemo(() => {
    const computed = items.map((item) => {
      const unit = units.find((u) => u.id === item.unit) ?? units[0]
      const price = Number(item.price)
      const total =
        Number(item.amount) * (Number(item.count) || 1) * unit.toBase
      const valid = price > 0 && total > 0
      return {
        id: item.id,
        group: unit.group,
        unitPrice: valid ? price / total : null,
      }
    })
    const groups = new Set(
      computed.filter((c) => c.unitPrice !== null).map((c) => c.group),
    )
    const comparable = groups.size <= 1
    const prices = computed.flatMap((c) =>
      c.unitPrice === null ? [] : [c.unitPrice],
    )
    const best = prices.length >= 2 && comparable ? Math.min(...prices) : null
    return { computed, comparable, best }
  }, [items])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, index) => {
          const r = results.computed[index]
          const isBest = results.best !== null && r.unitPrice === results.best
          const diff =
            results.best !== null && r.unitPrice !== null && !isBest
              ? (r.unitPrice / results.best - 1) * 100
              : null
          return (
            <section
              key={item.id}
              className={cn(
                'relative space-y-3 rounded-xl border p-4 transition-colors',
                isBest &&
                  'border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={item.name}
                  onChange={(e) => update(item.id, { name: e.target.value })}
                  placeholder={`商品 ${String.fromCharCode(65 + index)}`}
                  aria-label="商品の名前"
                  className="font-medium"
                />
                {items.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="この商品を外す"
                    onClick={() =>
                      setItems((list) => list.filter((i) => i.id !== item.id))
                    }
                  >
                    <X />
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor={`price-${item.id}`}>価格（円）</Label>
                <Input
                  id={`price-${item.id}`}
                  inputMode="decimal"
                  value={item.price}
                  onChange={(e) => update(item.id, { price: e.target.value })}
                  placeholder="298"
                />
                <QuickButtons
                  values={[10, 100, 1000]}
                  onAdd={(v) => bump(item.id, 'price', v)}
                />
              </div>

              <div className="grid grid-cols-[1fr_auto_5rem] items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`amount-${item.id}`}>量</Label>
                  <Input
                    id={`amount-${item.id}`}
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) =>
                      update(item.id, { amount: e.target.value })
                    }
                    placeholder="500"
                  />
                </div>
                <select
                  value={item.unit}
                  onChange={(e) =>
                    update(item.id, { unit: e.target.value as UnitId })
                  }
                  aria-label="単位"
                  className="h-10 rounded-lg border bg-transparent px-2 text-base md:h-8 md:text-sm"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  <Label htmlFor={`count-${item.id}`}>入数</Label>
                  <Input
                    id={`count-${item.id}`}
                    inputMode="numeric"
                    value={item.count}
                    onChange={(e) => update(item.id, { count: e.target.value })}
                  />
                </div>
              </div>
              <QuickButtons
                values={[1, 10, 100]}
                onAdd={(v) => bump(item.id, 'amount', v)}
              />

              <div className="border-t pt-3">
                {r.unitPrice === null ? (
                  <p className="text-sm text-muted-foreground">
                    価格と量を入れると単価を計算します
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {per[r.group].label}
                    </p>
                    <p className="flex items-center gap-2 font-mono text-2xl font-bold tabular-nums">
                      {yen(r.unitPrice * per[r.group].amount)}
                      {isBest && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 font-sans text-xs text-white">
                          <Crown className="size-3" />
                          いちばんお得
                        </span>
                      )}
                    </p>
                    {diff !== null && (
                      <p className="text-sm text-muted-foreground">
                        いちばんお得なものより {diff.toFixed(1)}% 高い
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {!results.comparable && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          重さ・容量・個数がまざっているので比べられません。単位をそろえてください。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={items.length >= 6}
          onClick={() =>
            setItems((list) => [...list, newItem(list.at(-1)?.unit)])
          }
        >
          <Plus />
          商品を追加
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setItems([newItem(), newItem()])}
        >
          <RotateCcw />
          すべてリセット
        </Button>
      </div>
    </div>
  )
}

function QuickButtons({
  values,
  onAdd,
}: {
  values: number[]
  onAdd: (v: number) => void
}) {
  return (
    <div className="flex gap-1">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onAdd(v)}
          className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          +{v.toLocaleString('ja-JP')}
        </button>
      ))}
    </div>
  )
}
