import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { RangeSlider, Stat, VoiceButton } from '@/components/playground/parts'
import {
  loadTokenizer,
  type Tokenizer,
} from '@/components/playground/tools/kuromoji'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { cn } from '@/lib/utils'

import {
  analyze,
  type CategoryKey,
  defaultSettings,
  type Issue,
  type Result,
  type Settings,
} from './analyze'

const SAMPLE = `この文章は、読みやすさチェックの動きを確かめるための例文です。短い文は読みやすいです。長い文は読みにくいです。同じ語尾が続くと単調な印象になります。
しかし、二重否定は意味が取りにくくなります。しかし、この案に賛成しないわけではない。
私の友人の兄の会社の取引先が新しい商品を発表したが、評判は良かったが、売れ行きは今ひとつだった。
本稿に於ける検討対象は既存業務運用体制下での情報共有基盤整備に関する課題である。
まず、資料を集め、内容を読み、要点をまとめ、図を作り、最後に、発表しました。
ところで今回の新しい取り組みについては関係するすべての部署の担当者がそれぞれの立場から意見を出し合いながら少しずつ形にしてきたものであり今後もこの進め方を大切にしながら利用する人の声を聞いて改善を続けていく予定です。`

type CategoryMeta = {
  label: string
  /** sentence = 文全体に下線、inline = その部分に色 */
  scope: 'sentence' | 'inline'
  /** 本文での見た目 */
  mark: string
  /** 凡例の色見本 */
  swatch: string
  help: string
}

// 並び順が重なったときの優先順（先にあるものの色を出す）
const categories: Record<CategoryKey, CategoryMeta> = {
  negation: {
    label: '二重否定',
    scope: 'inline',
    mark: 'bg-red-500/25 dark:bg-red-500/35',
    swatch: 'bg-red-500/50',
    help: '「〜ないわけではない」「〜なくはない」など',
  },
  noChain: {
    label: '「の」の連続',
    scope: 'inline',
    mark: 'bg-emerald-500/25 dark:bg-emerald-500/35',
    swatch: 'bg-emerald-500/50',
    help: '「A の B の C の」のように「の」がつながる所',
  },
  ga: {
    label: '「が」の重なり',
    scope: 'inline',
    mark: 'bg-teal-500/25 dark:bg-teal-500/35',
    swatch: 'bg-teal-500/50',
    help: '1 つの文で、文をつなぐ「が」を 2 回以上使っている所',
  },
  conjunction: {
    label: '同じ接続詞の連続',
    scope: 'inline',
    mark: 'bg-fuchsia-500/20 dark:bg-fuchsia-500/35',
    swatch: 'bg-fuchsia-500/50',
    help: '続く文が同じ接続詞（しかし・また など）で始まる所',
  },
  ending: {
    label: '同じ語尾の連続',
    scope: 'inline',
    mark: 'bg-amber-400/35 dark:bg-amber-400/30',
    swatch: 'bg-amber-400/70',
    help: '「〜です。〜です。〜です。」のように同じ語尾が続く所',
  },
  commaMany: {
    label: '読点が多い',
    scope: 'inline',
    mark: 'bg-sky-500/30 dark:bg-sky-500/45',
    swatch: 'bg-sky-500/50',
    help: '1 つの文に読点（、）が多すぎる所',
  },
  long: {
    label: '長い文',
    scope: 'sentence',
    mark: 'decoration-rose-500',
    swatch: 'bg-rose-500',
    help: '字数が目安を超える文。警告は波線、注意は直線',
  },
  commaFew: {
    label: '読点が少ない',
    scope: 'sentence',
    mark: 'decoration-sky-500',
    swatch: 'bg-sky-500',
    help: `長いのに読点（、）が 1 つもない文`,
  },
  kanji: {
    label: '漢字の割合',
    scope: 'sentence',
    mark: 'decoration-violet-500',
    swatch: 'bg-violet-500',
    help: '漢字が多すぎる、または少なすぎる文',
  },
}
const categoryKeys = Object.keys(categories) as CategoryKey[]

const scoreLabel = (score: number) =>
  score >= 85
    ? '読みやすい'
    : score >= 70
      ? 'ふつう'
      : score >= 50
        ? 'やや読みにくい'
        : '読みにくい'

export function ReadabilityCheck() {
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState(SAMPLE)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [hidden, setHidden] = useState<Set<CategoryKey>>(new Set())
  const [active, setActive] = useState<string | null>(null)
  const voice = useSpeechRecognition((t) => setText((prev) => prev + t))
  const deferredText = useDeferredValue(text)

  useEffect(() => {
    loadTokenizer()
      .then(setTokenizer)
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const result = useMemo(
    () => (tokenizer ? analyze(deferredText, tokenizer, settings) : null),
    [tokenizer, deferredText, settings],
  )

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton
            supported={voice.supported}
            listening={voice.listening}
            onToggle={voice.toggle}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={text === SAMPLE}
            onClick={() => setText(SAMPLE)}
          >
            <RotateCcw />
            例文に戻す
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!text}
            onClick={() => setText('')}
          >
            <Trash2 />
            クリア
          </Button>
          {(voice.listening || voice.error) && (
            <span
              className={
                voice.error
                  ? 'text-sm text-destructive'
                  : 'text-sm text-primary'
              }
            >
              {voice.error ?? `聞き取り中…${voice.interim}`}
            </span>
          )}
        </div>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(null)
          }}
          placeholder="チェックしたい文章を入力・貼り付け"
          rows={8}
          className="min-h-48 font-[inherit]"
        />
        <p className="text-xs text-muted-foreground">
          入力した文章はブラウザの中だけで調べ、サーバーには送りません。
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : !result ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          辞書を読み込んでいます（初回のみ・約 17MB）…
        </p>
      ) : result.stats.sentences === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          文章を入れると、読みにくい所を色で示します。
        </p>
      ) : (
        <>
          <Summary result={result} settings={settings} />

          <section className="space-y-3">
            <h2 className="text-sm font-medium">本文での位置</h2>
            <Legend
              result={result}
              hidden={hidden}
              onToggle={(key) =>
                setHidden((prev) => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }
            />
            <Highlighted
              text={deferredText}
              issues={result.issues.filter((i) => !hidden.has(i.category))}
              active={active}
            />
          </section>

          <IssueList
            text={deferredText}
            issues={result.issues.filter((i) => !hidden.has(i.category))}
            active={active}
            onSelect={setActive}
          />
        </>
      )}

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          判定の基準を変える
        </summary>
        <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
          <RangeSlider
            label="長い文（注意）"
            help="この字数を超える文に下線を引きます。新聞は 1 文 40〜50 字ほどが目安と言われます"
            value={settings.cautionLength}
            min={30}
            max={150}
            step={5}
            unit=" 字"
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                cautionLength: v,
                warnLength: Math.max(s.warnLength, v + 5),
              }))
            }
          />
          <RangeSlider
            label="長い文（警告）"
            help="この字数を超える文は「警告」にして、波線を引きます"
            value={settings.warnLength}
            min={40}
            max={200}
            step={5}
            unit=" 字"
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                warnLength: v,
                cautionLength: Math.min(s.cautionLength, v - 5),
              }))
            }
          />
          <RangeSlider
            label="漢字率の目安（下限）"
            help="全体の漢字率がこの範囲に入るとよいとされます。文ごとには、下限より 10% 少ない・上限より 15% 多いときに知らせます"
            value={settings.kanjiMin}
            min={0}
            max={50}
            step={1}
            unit="%"
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                kanjiMin: v,
                kanjiMax: Math.max(s.kanjiMax, v + 1),
              }))
            }
          />
          <RangeSlider
            label="漢字率の目安（上限）"
            value={settings.kanjiMax}
            min={10}
            max={80}
            step={1}
            unit="%"
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                kanjiMax: v,
                kanjiMin: Math.min(s.kanjiMin, v - 1),
              }))
            }
          />
          <RangeSlider
            label="同じ語尾が続く回数"
            help="文末の 2 字（です・ます・した など）が同じ文がこの数だけ続いたら知らせます"
            value={settings.endingRepeat}
            min={2}
            max={6}
            step={1}
            unit=" 回"
            onChange={(v) => set('endingRepeat', v)}
          />
          <RangeSlider
            label="1 文の読点の上限"
            help="読点（、）がこの数を超える文を知らせます"
            value={settings.maxCommas}
            min={2}
            max={10}
            step={1}
            unit=" 個"
            onChange={(v) => set('maxCommas', v)}
          />
          <RangeSlider
            label="「の」が続く回数"
            help="「A の B の C の」のように、名詞をつなぐ「の」がこの数だけ続いたら知らせます"
            value={settings.noChain}
            min={2}
            max={6}
            step={1}
            unit=" 回"
            onChange={(v) => set('noChain', v)}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSettings(defaultSettings)}
            >
              <RotateCcw />
              基準を元に戻す
            </Button>
          </div>
        </div>
      </details>
    </div>
  )
}

function Summary({ result, settings }: { result: Result; settings: Settings }) {
  const { stats, score, issues } = result
  const fmt = (n: number, digits = 0) =>
    n.toLocaleString('ja-JP', { maximumFractionDigits: digits })
  const kanjiOk =
    stats.kanjiRatio >= settings.kanjiMin &&
    stats.kanjiRatio <= settings.kanjiMax
  const warns = issues.filter((i) => i.level === 'warn').length
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat
        label="読みやすさスコア"
        value={score}
        unit="点"
        hint={scoreLabel(score)}
        className={cn(
          'col-span-2 sm:col-span-1',
          score >= 85
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : score >= 70
              ? 'border-sky-500/50 bg-sky-500/5'
              : score >= 50
                ? 'border-amber-500/50 bg-amber-500/5'
                : 'border-red-500/50 bg-red-500/5',
        )}
      />
      <Stat
        label="指摘"
        value={fmt(issues.length)}
        unit="件"
        hint={warns ? `うち警告 ${warns} 件` : '警告はありません'}
      />
      <Stat label="文の数" value={fmt(stats.sentences)} unit="文" />
      <Stat
        label="平均の文の長さ"
        value={fmt(stats.averageLength, 1)}
        unit="字"
        hint={`いちばん長い文は ${fmt(stats.longest)} 字`}
      />
      <Stat
        label="漢字率"
        value={fmt(stats.kanjiRatio, 1)}
        unit="%"
        hint={`目安 ${settings.kanjiMin}〜${settings.kanjiMax}%${
          kanjiOk
            ? '（範囲内）'
            : stats.kanjiRatio > settings.kanjiMax
              ? '（多め）'
              : '（少なめ）'
        }`}
      />
      <Stat
        label="文字数"
        value={fmt(stats.chars)}
        unit="字"
        hint="空白を除く"
      />
    </div>
  )
}

function Legend({
  result,
  hidden,
  onToggle,
}: {
  result: Result
  hidden: Set<CategoryKey>
  onToggle: (key: CategoryKey) => void
}) {
  const counts = new Map<CategoryKey, number>()
  for (const i of result.issues)
    counts.set(i.category, (counts.get(i.category) ?? 0) + 1)
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {categoryKeys.map((key) => {
        const c = categories[key]
        const off = hidden.has(key)
        return (
          <button
            key={key}
            type="button"
            title={`${c.help}（クリックで表示を切り替え）`}
            aria-pressed={!off}
            onClick={() => onToggle(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-opacity',
              off && 'opacity-40',
            )}
          >
            <span
              className={cn(
                'inline-block shrink-0',
                c.swatch,
                c.scope === 'sentence' ? 'h-0.5 w-3' : 'size-3 rounded-sm',
              )}
            />
            {c.label}
            <span className="font-mono tabular-nums text-muted-foreground">
              {counts.get(key) ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 指摘の範囲で本文を区切り、区切りごとに色と下線を付ける */
function Highlighted({
  text,
  issues,
  active,
}: {
  text: string
  issues: Issue[]
  active: string | null
}) {
  const segments = useMemo(() => {
    const cuts = new Set([0, text.length])
    for (const i of issues)
      for (const r of i.ranges) {
        cuts.add(r.start)
        cuts.add(r.end)
      }
    const points = [...cuts].sort((a, b) => a - b)
    const out: { start: number; end: number; hits: Issue[] }[] = []
    for (let k = 0; k < points.length - 1; k++) {
      const start = points[k]
      const end = points[k + 1]
      if (start === end) continue
      const hits = issues.filter((i) =>
        i.ranges.some((r) => r.start <= start && end <= r.end),
      )
      out.push({ start, end, hits })
    }
    return out
  }, [text, issues])

  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-lg border p-4 text-base leading-9 whitespace-pre-wrap break-words">
      {segments.map((seg) => {
        const content = text.slice(seg.start, seg.end)
        if (seg.hits.length === 0) return <span key={seg.start}>{content}</span>
        const inline = categoryKeys.find(
          (k) =>
            categories[k].scope === 'inline' &&
            seg.hits.some((h) => h.category === k),
        )
        const line = categoryKeys.find(
          (k) =>
            categories[k].scope === 'sentence' &&
            seg.hits.some((h) => h.category === k),
        )
        const lineIssue = seg.hits.find((h) => h.category === line)
        const isActive = seg.hits.some((h) => h.id === active)
        return (
          <mark
            key={seg.start}
            data-issues={seg.hits.map((h) => h.id).join(' ')}
            title={seg.hits
              .map((h) => `${categories[h.category].label}: ${h.message}`)
              .join('\n')}
            className={cn(
              'cursor-help rounded-sm bg-transparent text-inherit',
              inline && categories[inline].mark,
              line &&
                cn(
                  'underline decoration-2 underline-offset-[6px]',
                  categories[line].mark,
                  lineIssue?.level === 'warn' && 'decoration-wavy',
                ),
              isActive && 'outline-2 outline-primary',
            )}
          >
            {content}
          </mark>
        )
      })}
    </div>
  )
}

function IssueList({
  text,
  issues,
  active,
  onSelect,
}: {
  text: string
  issues: Issue[]
  active: string | null
  onSelect: (id: string | null) => void
}) {
  if (issues.length === 0)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        気になる所は見つかりませんでした。
      </p>
    )
  const groups = categoryKeys
    .map((key) => ({ key, items: issues.filter((i) => i.category === key) }))
    .filter((g) => g.items.length > 0)

  const select = (id: string) => {
    onSelect(id)
    // 本文の中の、その指摘の場所へ移る
    const el = document.querySelector<HTMLElement>(`mark[data-issues~="${id}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">項目ごとの一覧</h2>
      <div className="space-y-3">
        {groups.map(({ key, items }) => {
          const c = categories[key]
          return (
            <div key={key} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                <span
                  className={cn(
                    'inline-block shrink-0',
                    c.swatch,
                    c.scope === 'sentence' ? 'h-0.5 w-3' : 'size-3 rounded-sm',
                  )}
                />
                {c.label}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {items.length} 件
                </span>
              </div>
              <ul className="divide-y">
                {items.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => select(issue.id)}
                      className={cn(
                        'w-full space-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50',
                        active === issue.id && 'bg-muted',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            issue.level === 'warn'
                              ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                              : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
                          )}
                        >
                          {issue.level === 'warn' ? '警告' : '注意'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {issue.sentence + 1} 文目
                        </span>
                      </span>
                      <Excerpt text={text} issue={issue} mark={c.scope} />
                      <span className="block text-muted-foreground">
                        {issue.message}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 指摘の場所を前後の文字と一緒に短く見せる */
function Excerpt({
  text,
  issue,
  mark,
}: {
  text: string
  issue: Issue
  mark: 'sentence' | 'inline'
}) {
  const first = issue.ranges[0]
  const last = issue.ranges[issue.ranges.length - 1]
  if (mark === 'sentence') {
    const s = text.slice(first.start, first.end)
    return (
      <span className="block break-all">
        {s.length > 60 ? `${s.slice(0, 60)}…` : s}
      </span>
    )
  }
  const before = text.slice(Math.max(0, first.start - 12), first.start)
  const after = text.slice(last.end, last.end + 12)
  return (
    <span className="block break-all">
      {first.start > 12 && '…'}
      {before.replace(/\n/g, ' ')}
      <strong className="font-semibold underline decoration-primary underline-offset-4">
        {text.slice(first.start, last.end).replace(/\n/g, ' ')}
      </strong>
      {after.replace(/\n/g, ' ')}
      {last.end + 12 < text.length && '…'}
    </span>
  )
}
