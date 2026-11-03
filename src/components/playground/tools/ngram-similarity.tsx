import { useMemo, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// 計算（画面とは切り離した純粋な関数）
// ---------------------------------------------------------------------------

type Options = {
  nfkc: boolean
  removeSpace: boolean
  lowerCase: boolean
  kana: boolean
}

/** カタカナをひらがなにする */
const kataToHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

export function normalize(text: string, o: Options) {
  let s = text
  if (o.nfkc) s = s.normalize('NFKC')
  if (o.removeSpace) s = s.replace(/\s+/g, '')
  if (o.lowerCase) s = s.toLowerCase()
  if (o.kana) s = kataToHira(s)
  return s
}

export function ngrams(text: string, n: number): string[] {
  const chars = Array.from(text)
  const out: string[] = []
  for (let i = 0; i + n <= chars.length; i++)
    out.push(chars.slice(i, i + n).join(''))
  return out
}

export function similarity(a: string, b: string, n: number) {
  const setA = new Set(ngrams(a, n))
  const setB = new Set(ngrams(b, n))
  const common = [...setA].filter((g) => setB.has(g)).sort()
  const union = setA.size + setB.size - common.length
  return {
    n,
    sizeA: setA.size,
    sizeB: setB.size,
    common,
    jaccard: union === 0 ? 0 : common.length / union,
    dice:
      setA.size + setB.size === 0
        ? 0
        : (2 * common.length) / (setA.size + setB.size),
  }
}

/** 共通の n-gram に含まれる文字の位置（強調表示用） */
function highlightMask(text: string, n: number, common: Set<string>) {
  const chars = Array.from(text)
  const mask = new Array<boolean>(chars.length).fill(false)
  for (let i = 0; i + n <= chars.length; i++) {
    if (common.has(chars.slice(i, i + n).join(''))) {
      for (let j = i; j < i + n; j++) mask[j] = true
    }
  }
  return chars.map((c, i) => ({ c, on: mask[i] }))
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

const N_RANGE = [2, 3, 4, 5, 6, 7, 8, 9, 10]

export function NgramSimilarity() {
  const [a, setA] = useState('今日はとても良い天気ですね。散歩に行きましょう。')
  const [b, setB] = useState('今日は良い天気なので、散歩に出かけましょう。')
  const [options, setOptions] = useState<Options>({
    nfkc: true,
    removeSpace: true,
    lowerCase: true,
    kana: false,
  })
  const [focusN, setFocusN] = useState(2)

  const na = useMemo(() => normalize(a, options), [a, options])
  const nb = useMemo(() => normalize(b, options), [b, options])
  const rows = useMemo(
    () => N_RANGE.map((n) => similarity(na, nb, n)),
    [na, nb],
  )
  const focused = rows.find((r) => r.n === focusN) ?? rows[0]
  const commonSet = useMemo(() => new Set(focused.common), [focused])

  const option = (key: keyof Options, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { id: 'a', label: 'テキスト A', value: a, set: setA, normalized: na },
          { id: 'b', label: 'テキスト B', value: b, set: setB, normalized: nb },
        ].map((t) => (
          <div key={t.id} className="space-y-2">
            <Label htmlFor={`ngram-${t.id}`}>
              {t.label}
              <span className="ml-2 font-normal text-muted-foreground">
                {Array.from(t.normalized).length} 文字（正規化後）
              </span>
            </Label>
            <Textarea
              id={`ngram-${t.id}`}
              value={t.value}
              onChange={(e) => t.set(e.target.value)}
              rows={5}
            />
          </div>
        ))}
      </div>

      <fieldset className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">比べる前の正規化</legend>
        {option('nfkc', '全角・半角をそろえる（NFKC）')}
        {option('removeSpace', '空白を取り除く')}
        {option('lowerCase', '小文字にする')}
        {option('kana', 'カタカナをひらがなにする')}
      </fieldset>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">n</th>
              <th className="px-3 py-2 font-medium">Jaccard</th>
              <th className="px-3 py-2 font-medium">Dice</th>
              <th className="px-3 py-2 font-medium">共通 / A / B</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.n}
                onClick={() => setFocusN(r.n)}
                className={cn(
                  'cursor-pointer hover:bg-muted/30',
                  r.n === focusN && 'bg-muted/50',
                )}
              >
                <td className="px-3 py-2 font-mono">{r.n}-gram</td>
                <td className="px-3 py-2">
                  <Score value={r.jaccard} />
                </td>
                <td className="px-3 py-2">
                  <Score value={r.dice} strong />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {r.common.length} / {r.sizeA} / {r.sizeB}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">
          {focusN}-gram で共通する部分
          <span className="ml-2 font-normal text-muted-foreground">
            （表の行をクリックすると n を切り替えられます）
          </span>
        </h2>
        {[
          { label: 'A', text: na },
          { label: 'B', text: nb },
        ].map((t) => (
          <p key={t.label} className="leading-relaxed">
            <span className="mr-2 text-xs text-muted-foreground">
              {t.label}
            </span>
            {highlightMask(t.text, focusN, commonSet).map((x, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 文字の位置そのものが識別子
                key={i}
                className={
                  x.on
                    ? 'rounded-sm bg-amber-200 dark:bg-amber-500/40'
                    : undefined
                }
              >
                {x.c}
              </span>
            ))}
          </p>
        ))}
        <div className="flex flex-wrap gap-1">
          {focused.common.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              共通する n-gram はありません
            </span>
          ) : (
            focused.common.map((g) => (
              <span
                key={g}
                className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs"
              >
                {g}
              </span>
            ))
          )}
        </div>
      </section>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">計算のしかた</summary>
        <p className="mt-2">
          A・B を n 文字ずつずらして切り出した集合を作り、Jaccard 係数 = |A∩B| ÷
          |A∪B|、Dice 係数 = 2|A∩B| ÷ (|A| + |B|) で計算します。Dice
          は共通部分を重く見るので、Jaccard より高めに出ます。
        </p>
      </details>
    </div>
  )
}

function Score({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-24">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className={cn('font-mono tabular-nums', strong && 'font-semibold')}>
        {value.toFixed(4)}
      </span>
    </div>
  )
}
