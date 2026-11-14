import { Loader2 } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { CopyButton } from '@/components/playground/parts'
import {
  loadTokenizer,
  type Tokenizer,
} from '@/components/playground/tools/kuromoji'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  analyze,
  applyChoices,
  type Group,
  kindLabels,
  type Occurrence,
} from './analyze'

const SAMPLE = `新しいサーバの設定を行います。サーバーの再起動は、管理者がおこなうことができます。
ユーザーとユーザの違いに注意して下さい。設定は出来るだけ早く行ってください。
子供と子ども向けの取り扱い説明書と、取扱い説明書があります。
申し込みは無料です。申込みを受け付けたら、ＷＥＢサイトでお知らせします（平日のみ）。
Webサイトの受付時間は9時から18時まで(土日を除く)です。`

/** グループごとの色（ダークモードでも読めるように、薄い背景と濃い下線） */
const COLORS = [
  'bg-amber-200/70 decoration-amber-600 dark:bg-amber-500/30 dark:decoration-amber-300',
  'bg-sky-200/70 decoration-sky-600 dark:bg-sky-500/30 dark:decoration-sky-300',
  'bg-rose-200/70 decoration-rose-600 dark:bg-rose-500/30 dark:decoration-rose-300',
  'bg-emerald-200/70 decoration-emerald-600 dark:bg-emerald-500/30 dark:decoration-emerald-300',
  'bg-violet-200/70 decoration-violet-600 dark:bg-violet-500/30 dark:decoration-violet-300',
  'bg-orange-200/70 decoration-orange-600 dark:bg-orange-500/30 dark:decoration-orange-300',
  'bg-lime-200/70 decoration-lime-600 dark:bg-lime-500/30 dark:decoration-lime-300',
  'bg-fuchsia-200/70 decoration-fuchsia-600 dark:bg-fuchsia-500/30 dark:decoration-fuchsia-300',
]
const DOTS = [
  'bg-amber-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-lime-500',
  'bg-fuchsia-500',
]

/** 「そのまま」を選んだとき */
const KEEP = ''

const occId = (o: Occurrence) => `nv-occ-${o.start}`

export function NotationVariance() {
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState(SAMPLE)
  const deferred = useDeferredValue(text)
  /** グループ id → そろえる表記 */
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeOcc, setActiveOcc] = useState<number | null>(null)

  useEffect(() => {
    loadTokenizer()
      .then(setTokenizer)
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const groups = useMemo(
    () => (tokenizer ? analyze(deferred, tokenizer.tokenize(deferred)) : []),
    [tokenizer, deferred],
  )

  // 文章が変わってグループが消えたら、その選択も捨てる
  const validChoices = useMemo(() => {
    const out: Record<string, string> = {}
    for (const g of groups) {
      const c = choices[g.id]
      if (c && g.variants.some((v) => v.value === c)) out[g.id] = c
    }
    return out
  }, [groups, choices])

  const result = useMemo(
    () => applyChoices(deferred, groups, validChoices),
    [deferred, groups, validChoices],
  )

  const colorOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const [i, g] of groups.entries()) m.set(g.id, i % COLORS.length)
    return m
  }, [groups])

  /** 本文の該当箇所へスクロールして目立たせる */
  const jumpTo = (g: Group, o: Occurrence) => {
    setActiveGroup(g.id)
    setActiveOcc(o.start)
    document
      .getElementById(occId(o))
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const total = groups.reduce((n, g) => n + g.occurrences.length, 0)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="nv-text">チェックする文章</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setText(SAMPLE)}
            >
              例文
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setText('')}
              disabled={!text}
            >
              クリア
            </Button>
          </div>
        </div>
        <Textarea
          id="nv-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="表記ゆれを調べたい文章を貼り付けてください"
        />
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : !tokenizer ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          辞書を読み込んでいます（初回のみ・約 17MB）…
        </p>
      ) : (
        <>
          <p className="text-sm">
            {groups.length === 0 ? (
              <span className="text-muted-foreground">
                表記ゆれは見つかりませんでした。
              </span>
            ) : (
              <>
                <span className="font-semibold">{groups.length}</span>{' '}
                グループ・
                <span className="font-semibold">{total}</span>{' '}
                か所で表記ゆれが見つかりました。
              </>
            )}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-sm font-medium">本文（ゆれている語に色）</h2>
              <div className="relative max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border p-4 leading-loose">
                <Highlighted
                  text={deferred}
                  groups={groups}
                  colorOf={colorOf}
                  activeGroup={activeGroup}
                  activeOcc={activeOcc}
                  onPick={(g, o) => {
                    setActiveGroup(g.id)
                    setActiveOcc(o.start)
                    document
                      .getElementById(`nv-group-${groups.indexOf(g)}`)
                      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  }}
                />
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium">
                見つかった表記ゆれ
                <span className="ml-2 font-normal text-muted-foreground">
                  （箇所を押すと本文のその場所へ）
                </span>
              </h2>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 lg:max-h-[32rem]">
                {groups.map((g, i) => (
                  <GroupCard
                    key={g.id}
                    index={i}
                    group={g}
                    text={deferred}
                    color={colorOf.get(g.id) ?? 0}
                    active={g.id === activeGroup}
                    choice={validChoices[g.id] ?? KEEP}
                    onChoose={(v) => setChoices((c) => ({ ...c, [g.id]: v }))}
                    onJump={(o) => jumpTo(g, o)}
                  />
                ))}
              </div>
            </section>
          </div>

          <section className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                そろえた文章
                <span className="ml-2 font-normal text-muted-foreground">
                  {result.count} か所を置き換え
                </span>
              </h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={result.count === 0}
                  onClick={() => {
                    setText(result.text)
                    setChoices({})
                  }}
                >
                  入力欄に戻す
                </Button>
                <CopyButton value={result.text} label="コピー" />
              </div>
            </div>
            {result.count === 0 ? (
              <p className="text-sm text-muted-foreground">
                上のグループで「この表記にそろえる」を選ぶと、置き換えた文章がここに出ます。
              </p>
            ) : (
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                {result.text}
              </p>
            )}
          </section>

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">見つけ方</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                形態素解析（kuromoji）の読みと基本形を使い、読みが同じで書き方が違う語をまとめます。「行った」「おこなって」のように活用していても、基本形（行う／おこなう）でまとめます。
              </li>
              <li>
                「機械／機会」のように漢字だけの語どうしは、別の語としてまとめません。かなが入る書き方（子供／子ども）や、かなだけの書き方（出来る／できる）をゆれとして扱います。
              </li>
              <li>
                送り仮名は、文章に出てくる「取り扱い」「申し込み」などから送り仮名を省いた形（取扱い・取扱）を探します。
              </li>
              <li>
                カタカナ語は語末の長音（サーバ／サーバー）を、長い語は語中の長音（インタフェース／インターフェース）も無視して比べます。半角カタカナも同じ語として扱います。
              </li>
              <li>
                英数字は全角・半角と大文字・小文字の違いを、カッコなどの記号は全角・半角の違いを見ます。
              </li>
              <li>
                同じ読みの別の語（「要る／いる」など）がまとまることもあります。置き換える前に、箇所を見て確かめてください。
              </li>
            </ul>
          </details>
        </>
      )}
    </div>
  )
}

/** 本文を、ゆれている箇所に色を付けて表示する */
function Highlighted({
  text,
  groups,
  colorOf,
  activeGroup,
  activeOcc,
  onPick,
}: {
  text: string
  groups: Group[]
  colorOf: Map<string, number>
  activeGroup: string | null
  activeOcc: number | null
  onPick: (g: Group, o: Occurrence) => void
}) {
  const marks = groups
    .flatMap((g) => g.occurrences.map((o) => ({ g, o })))
    .sort((a, b) => a.o.start - b.o.start)
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const { g, o } of marks) {
    if (o.start < cursor) continue
    if (o.start > cursor) parts.push(text.slice(cursor, o.start))
    const dim = activeGroup !== null && activeGroup !== g.id
    parts.push(
      <button
        type="button"
        key={o.start}
        id={occId(o)}
        title={`${kindLabels[g.kind]}: ${g.variants.map((v) => v.label).join('／')}`}
        onClick={() => onPick(g, o)}
        className={cn(
          'rounded-sm underline decoration-2 underline-offset-4 transition-opacity',
          COLORS[colorOf.get(g.id) ?? 0],
          dim && 'opacity-40',
          activeOcc === o.start &&
            'outline outline-2 outline-offset-1 outline-primary',
        )}
      >
        {o.text}
      </button>,
    )
    cursor = o.end
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

function GroupCard({
  index,
  group,
  text,
  color,
  active,
  choice,
  onChoose,
  onJump,
}: {
  index: number
  group: Group
  text: string
  color: number
  active: boolean
  choice: string
  onChoose: (value: string) => void
  onJump: (o: Occurrence) => void
}) {
  const name = `nv-choice-${index}`
  return (
    <div
      id={`nv-group-${index}`}
      className={cn(
        'space-y-3 rounded-lg border p-3 transition-colors',
        active && 'border-primary bg-muted/30',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('size-2.5 shrink-0 rounded-full', DOTS[color])} />
        <span className="font-medium break-all">
          {group.variants.map((v) => v.label).join('／')}
        </span>
        <Badge variant="secondary">{kindLabels[group.kind]}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {group.occurrences.length} か所
        </span>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs text-muted-foreground">
          この表記にそろえる
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {[
            { value: KEEP, label: 'そのまま', count: 0 },
            ...group.variants,
          ].map((v) => (
            <label
              key={v.value || 'keep'}
              className="flex items-center gap-1.5 text-sm"
            >
              <input
                type="radio"
                name={name}
                checked={choice === v.value}
                onChange={() => onChoose(v.value)}
                className="size-4 accent-primary"
              />
              {v.value === KEEP ? (
                <span className="text-muted-foreground">{v.label}</span>
              ) : (
                <>
                  <span className="break-all">{v.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {v.count}
                  </span>
                </>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-1.5">
        {group.occurrences.map((o) => (
          <button
            type="button"
            key={o.start}
            onClick={() => onJump(o)}
            className="max-w-full truncate rounded border bg-muted/40 px-2 py-0.5 text-left text-xs hover:bg-muted"
          >
            <span className="text-muted-foreground">
              {lineOf(text, o.start)} 行目 ·{' '}
            </span>
            …{text.slice(Math.max(0, o.start - 4), o.start).replace(/\s/g, ' ')}
            <span className="font-semibold text-foreground">{o.text}</span>
            {text.slice(o.end, o.end + 4).replace(/\s/g, ' ')}…
          </button>
        ))}
      </div>
    </div>
  )
}

const lineOf = (text: string, index: number) =>
  text.slice(0, index).split('\n').length
