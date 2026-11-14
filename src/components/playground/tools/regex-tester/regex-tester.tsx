import { AlertTriangle, Loader2, Timer } from 'lucide-react'
import type * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { CopyButton, HelpTip, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { captureGroups, type ExplainItem, explainPattern } from './explain'
import { presets } from './presets'
import {
  MAX_MATCHES,
  type MatchResult,
  type RegexRequest,
  type RegexResponse,
} from './types'

// ---------------------------------------------------------------------------
// フラグ
// ---------------------------------------------------------------------------

const FLAGS = [
  {
    flag: 'g',
    label: 'すべて',
    help: 'すべてのマッチを探す（global）。ないと最初の 1 つだけ',
  },
  { flag: 'i', label: '大小無視', help: '大文字と小文字を区別しない' },
  {
    flag: 'm',
    label: '複数行',
    help: '^ と $ を、文字列全体ではなく各行の先頭・末尾にする',
  },
  { flag: 's', label: '. に改行', help: '. が改行にもマッチする（dotAll）' },
  {
    flag: 'u',
    label: 'Unicode',
    help: 'Unicode モード。\\p{…} や \\u{…} が使え、絵文字などを 1 文字として扱う',
  },
  {
    flag: 'v',
    label: '集合',
    help: 'u をさらに強くしたもの。文字クラスの中で [A--B]（引く）や [A&&B]（共通）が使える。u とは同時に使えない',
  },
  {
    flag: 'y',
    label: '続けて',
    help: '前のマッチの直後からだけ探す（sticky）。先頭から途切れずに続く分だけマッチする',
  },
  {
    flag: 'd',
    label: '位置',
    help: 'グループの位置（indices）も返す。このツールでは d がなくても位置を出す',
  },
] as const

const FLAG_ORDER = 'dgimsuvy'

/** このブラウザで使えるフラグか */
function supportsFlag(flag: string) {
  try {
    new RegExp('', flag)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 色分け
// ---------------------------------------------------------------------------

/** キャプチャグループの色（番号順にくり返す） */
const GROUP_COLORS = [
  'bg-sky-200 text-sky-950 dark:bg-sky-700/70 dark:text-sky-50',
  'bg-emerald-200 text-emerald-950 dark:bg-emerald-700/70 dark:text-emerald-50',
  'bg-violet-200 text-violet-950 dark:bg-violet-700/70 dark:text-violet-50',
  'bg-orange-200 text-orange-950 dark:bg-orange-700/70 dark:text-orange-50',
  'bg-pink-200 text-pink-950 dark:bg-pink-700/70 dark:text-pink-50',
  'bg-lime-200 text-lime-950 dark:bg-lime-700/70 dark:text-lime-50',
  'bg-cyan-200 text-cyan-950 dark:bg-cyan-700/70 dark:text-cyan-50',
  'bg-rose-200 text-rose-950 dark:bg-rose-700/70 dark:text-rose-50',
]
const groupColor = (n: number) => GROUP_COLORS[(n - 1) % GROUP_COLORS.length]

/** マッチ全体の色（となりのマッチと見分けられるよう 2 色を交互に） */
const MATCH_COLORS = [
  'bg-yellow-200 text-yellow-950 ring-yellow-500 dark:bg-yellow-500/35 dark:text-yellow-50 dark:ring-yellow-400/70',
  'bg-amber-200 text-amber-950 ring-amber-500 dark:bg-amber-500/35 dark:text-amber-50 dark:ring-amber-400/70',
]

/** テスト文字列に、マッチとグループの色を付けて並べる */
function highlight(text: string, matches: MatchResult[]) {
  const out: React.ReactNode[] = []
  let pos = 0
  matches.forEach((m, k) => {
    if (m.index < pos) return
    if (m.index > pos) out.push(text.slice(pos, m.index))
    if (m.end === m.index) {
      // 長さ 0 のマッチは縦線で示す
      out.push(
        <span
          key={`z${m.index}`}
          title={`マッチ ${k + 1}（長さ 0）`}
          className="mx-px inline-block h-[1.1em] w-0.5 rounded bg-red-500 align-text-bottom dark:bg-red-400"
        />,
      )
      return
    }
    // グループの範囲（マッチの外にはみ出す先読みのグループは、マッチの中だけに切る）
    const ranges = m.groups
      .filter((g) => g.start !== undefined && g.end !== undefined)
      .map((g) => ({
        n: g.number,
        s: Math.max(g.start ?? 0, m.index),
        e: Math.min(g.end ?? 0, m.end),
      }))
      .filter((r) => r.e > r.s)
    const points = [
      ...new Set([m.index, m.end, ...ranges.flatMap((r) => [r.s, r.e])]),
    ].sort((a, b) => a - b)
    const parts: React.ReactNode[] = []
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]
      const b = points[i + 1]
      // いちばん内側（短い）のグループの色にする
      let inner: (typeof ranges)[number] | undefined
      for (const r of ranges) {
        if (r.s > a || r.e < b) continue
        if (
          !inner ||
          r.e - r.s < inner.e - inner.s ||
          (r.e - r.s === inner.e - inner.s && r.n > inner.n)
        )
          inner = r
      }
      parts.push(
        <span
          key={a}
          className={inner ? cn('rounded-sm', groupColor(inner.n)) : undefined}
        >
          {text.slice(a, b)}
        </span>,
      )
    }
    out.push(
      <mark
        key={`m${m.index}`}
        title={`マッチ ${k + 1}`}
        className={cn(
          'rounded-sm ring-1 box-decoration-clone',
          MATCH_COLORS[k % 2],
        )}
      >
        {parts}
      </mark>,
    )
    pos = m.end
  })
  out.push(text.slice(pos))
  return out
}

// ---------------------------------------------------------------------------
// 実行（Web Worker・時間切れあり）
// ---------------------------------------------------------------------------

/** これより長くかかったら、Worker を止める */
const TIMEOUT_MS = 2000

type Run =
  | { status: 'idle' }
  | { status: 'done'; result: Extract<RegexResponse, { ok: true }> }
  | { status: 'error'; message: string }
  | { status: 'timeout' }

function createWorker() {
  return new Worker(new URL('./regex.worker.ts', import.meta.url), {
    type: 'module',
  })
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

/** 正規表現を Worker で実行する。終わらないときは Worker ごと止めて作り直す */
function useRegexRun(req: Omit<RegexRequest, 'id'> | null) {
  const workerRef = useRef<Worker | null>(null)
  const seq = useRef(0)
  const [run, setRun] = useState<Run>({ status: 'idle' })
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!req) {
      setRun({ status: 'idle' })
      setRunning(false)
      return
    }
    const id = ++seq.current
    let worker = workerRef.current
    if (!worker) {
      worker = createWorker()
      workerRef.current = worker
    }
    let pending = true
    const stopWorker = () => {
      worker?.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
    // すぐ終わるときは「計算中」を出さない（ちらつき防止）
    const slow = window.setTimeout(() => setRunning(true), 150)
    const timeout = window.setTimeout(() => {
      pending = false
      stopWorker()
      setRunning(false)
      setRun({ status: 'timeout' })
    }, TIMEOUT_MS)
    const finish = () => {
      pending = false
      window.clearTimeout(slow)
      window.clearTimeout(timeout)
      setRunning(false)
    }
    worker.onmessage = (e: MessageEvent<RegexResponse>) => {
      if (e.data.id !== id) return
      finish()
      const data = e.data
      setRun(
        data.ok
          ? { status: 'done', result: data }
          : { status: 'error', message: data.error },
      )
    }
    worker.onerror = (e) => {
      finish()
      stopWorker()
      setRun({ status: 'error', message: e.message || '実行できませんでした' })
    }
    worker.postMessage({ ...req, id } satisfies RegexRequest)
    return () => {
      window.clearTimeout(slow)
      window.clearTimeout(timeout)
      // 前の計算がまだ終わっていなければ、待たずに止めて次へ
      if (pending) stopWorker()
    }
  }, [req])

  useEffect(() => () => workerRef.current?.terminate(), [])

  return { run, running }
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

/** 改行や空文字も見えるようにする */
function Value({ value }: { value: string | null | undefined }) {
  if (value === undefined || value === null)
    return <span className="text-muted-foreground italic">（なし）</span>
  if (value === '')
    return <span className="text-muted-foreground italic">（空の文字列）</span>
  return (
    <span className="font-mono break-all whitespace-pre-wrap">{value}</span>
  )
}

function Section({
  title,
  help,
  actions,
  children,
}: {
  title: string
  help?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 text-sm font-medium">
          {title}
          {help && <HelpTip>{help}</HelpTip>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

const KIND_STYLE: Record<ExplainItem['kind'], string> = {
  literal: 'text-foreground',
  class: 'text-sky-700 dark:text-sky-300',
  escape: 'text-sky-700 dark:text-sky-300',
  anchor: 'text-violet-700 dark:text-violet-300',
  group: 'text-emerald-700 dark:text-emerald-300',
  groupEnd: 'text-emerald-700 dark:text-emerald-300',
  quantifier: 'text-orange-700 dark:text-orange-300',
  alternation: 'text-pink-700 dark:text-pink-300',
  backref: 'text-cyan-700 dark:text-cyan-300',
}

export function RegexTester() {
  const first = presets[4]
  const [source, setSource] = useState(first.source)
  const [flags, setFlags] = useState(first.flags)
  const [text, setText] = useState(first.text)
  const [replacement, setReplacement] = useState(first.replacement)
  const [note, setNote] = useState<string | undefined>(first.note)

  const supported = useMemo(
    () => Object.fromEntries(FLAGS.map((f) => [f.flag, supportsFlag(f.flag)])),
    [],
  )

  const toggleFlag = (flag: string) => {
    setFlags((prev) => {
      let next = prev.includes(flag) ? prev.replace(flag, '') : prev + flag
      // u と v は同時に使えないので、片方を入れたらもう片方を外す
      if (!prev.includes(flag) && flag === 'u') next = next.replace('v', '')
      if (!prev.includes(flag) && flag === 'v') next = next.replace('u', '')
      return [...next]
        .sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b))
        .join('')
    })
  }

  // 書き方の誤りは、Worker に送る前にここで見つける（コンパイルだけなら固まらない）
  const syntaxError = useMemo(() => {
    try {
      new RegExp(source, flags)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [source, flags])

  const explained = useMemo(
    () => (source ? explainPattern(source, flags) : []),
    [source, flags],
  )

  const input = useMemo(
    () => ({ source, flags, text, replacement }),
    [source, flags, text, replacement],
  )
  const debounced = useDebounced(input, 200)
  const request = useMemo(
    () => (syntaxError || !debounced.source ? null : debounced),
    [debounced, syntaxError],
  )
  const { run, running } = useRegexRun(request)
  const result = run.status === 'done' ? run.result : null
  const matches = result?.matches ?? []
  // 入力の途中（まだ実行していない）結果は少し薄くする
  const stale = running || debounced !== input

  const groupDefs = useMemo(() => captureGroups(source, flags), [source, flags])

  const applyPreset = (p: (typeof presets)[number]) => {
    setSource(p.source)
    setFlags(p.flags)
    setText(p.text)
    setReplacement(p.replacement)
    setNote(p.note)
  }

  const fmt = (n: number) => n.toLocaleString('ja-JP')

  return (
    <div className="space-y-8">
      {/* 例 */}
      <Section title="よく使う例">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </Section>

      {/* パターンとフラグ */}
      <div className="space-y-3">
        <Label htmlFor="regex-source">パターン</Label>
        <div className="flex items-center gap-1 font-mono">
          <span className="text-lg text-muted-foreground">/</span>
          <Input
            id="regex-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="例: \d+"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-invalid={syntaxError ? true : undefined}
            className="font-mono"
          />
          <span className="text-lg text-muted-foreground">/</span>
          <span className="min-w-8 text-lg">{flags}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FLAGS.map((f) => {
            const on = flags.includes(f.flag)
            const ok = supported[f.flag]
            return (
              <Button
                key={f.flag}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                aria-pressed={on}
                disabled={!ok}
                title={ok ? f.help : 'このブラウザでは使えません'}
                onClick={() => toggleFlag(f.flag)}
              >
                <span className="font-mono font-bold">{f.flag}</span>
                <span className="text-xs">{f.label}</span>
              </Button>
            )
          })}
          <HelpTip>
            <ul className="space-y-1">
              {FLAGS.map((f) => (
                <li key={f.flag}>
                  <span className="font-mono font-bold">{f.flag}</span>:{' '}
                  {f.help}
                </li>
              ))}
            </ul>
          </HelpTip>
        </div>
        {syntaxError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              パターンの書き方に誤りがあります。
              <br />
              <span className="font-mono text-xs break-all">{syntaxError}</span>
            </span>
          </p>
        )}
      </div>

      {/* テスト文字列 */}
      <div className="space-y-2">
        <Label htmlFor="regex-text">テスト文字列</Label>
        <Textarea
          id="regex-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここに調べたい文章を入力・貼り付け"
          rows={6}
          spellCheck={false}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          パターンも文章もブラウザの中だけで処理し、サーバーには送りません。
        </p>
      </div>

      {/* 状態 */}
      {run.status === 'timeout' && !syntaxError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <Timer className="mt-0.5 size-4 shrink-0" />
          <span>
            {TIMEOUT_MS / 1000} 秒たっても終わらないので止めました。
            <br />
            (a+)+
            のように「くり返しの中にくり返し」があると、マッチしないときに試す組み合わせが爆発的に増えます（破滅的バックトラック）。くり返しを
            1 段にするなど、パターンを見直してください。
          </span>
        </p>
      )}
      {run.status === 'error' && !syntaxError && (
        <p role="alert" className="text-sm text-destructive">
          実行できませんでした: {run.message}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="マッチ"
          value={result ? fmt(matches.length) : '-'}
          unit="件"
          hint={
            result?.truncated ? `${fmt(MAX_MATCHES)} 件で打ち切り` : undefined
          }
        />
        <Stat label="グループ" value={fmt(groupDefs.length)} unit="個" />
        <Stat
          label="かかった時間"
          value={
            running ? (
              <Loader2 className="size-5 animate-spin" />
            ) : result ? (
              result.elapsed < 1 ? (
                '<1'
              ) : (
                fmt(Math.round(result.elapsed))
              )
            ) : (
              '-'
            )
          }
          unit="ms"
        />
      </div>

      <div
        className={cn('space-y-8 transition-opacity', stale && 'opacity-60')}
      >
        {/* ハイライト */}
        <Section
          title="マッチした場所"
          help="黄色の枠がマッチした部分、色の付いた部分がキャプチャグループです。赤い縦線は長さ 0 のマッチです。"
        >
          <div className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
            {result ? highlight(text, matches) : text}
          </div>
          {groupDefs.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {groupDefs.map((g) => (
                <span
                  key={g.number}
                  className={cn('rounded px-1.5 py-0.5', groupColor(g.number))}
                >
                  {g.number}
                  {g.name && ` ${g.name}`}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* 一覧 */}
        <Section
          title="マッチの一覧"
          help="位置は JavaScript の文字列の位置（UTF-16 の単位）で、0 から数えます。絵文字などは 2 つ分になります。"
        >
          {matches.length === 0 ? (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              {result ? 'マッチしませんでした。' : 'まだ結果がありません。'}
            </p>
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      位置
                    </th>
                    <th className="px-3 py-2 font-medium">マッチ</th>
                    {groupDefs.length > 0 && (
                      <th className="px-3 py-2 font-medium">グループ</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matches.slice(0, 500).map((m, k) => (
                    <tr key={m.index} className="align-top">
                      <td className="px-3 py-2 font-mono text-muted-foreground tabular-nums">
                        {k + 1}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                        {m.index}–{m.end}
                      </td>
                      <td className="px-3 py-2">
                        <Value value={m.value} />
                      </td>
                      {groupDefs.length > 0 && (
                        <td className="px-3 py-2">
                          <ul className="space-y-1">
                            {m.groups.map((g) => (
                              <li
                                key={g.number}
                                className="flex flex-wrap items-baseline gap-x-2"
                              >
                                <span
                                  className={cn(
                                    'rounded px-1.5 text-xs',
                                    groupColor(g.number),
                                  )}
                                >
                                  {g.number}
                                  {g.name && ` ${g.name}`}
                                </span>
                                <Value value={g.value} />
                                {g.start !== undefined && (
                                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                    {g.start}–{g.end}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {matches.length > 500 && (
                <p className="border-t p-2 text-center text-xs text-muted-foreground">
                  一覧は最初の 500 件だけ出しています。
                </p>
              )}
            </div>
          )}
        </Section>

        {/* 置換 */}
        <Section
          title="置換のプレビュー"
          help={
            <>
              置き換える文字列では、$1・$2（番号のグループ）、$&lt;name&gt;（名前付きグループ）、$&amp;（マッチ全体）、$`（マッチの前）、$'（マッチの後ろ）、$$（$
              そのもの）が使えます。g フラグがないと、最初の 1
              か所だけ置き換えます。
            </>
          }
          actions={
            <CopyButton value={result?.replaced ?? ''} label="結果をコピー" />
          }
        >
          <Input
            aria-label="置き換える文字列"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="置き換える文字列（例: $1）"
            spellCheck={false}
            className="font-mono"
          />
          {!flags.includes('g') && (
            <p className="text-xs text-muted-foreground">
              g フラグがないので、最初の 1 か所だけ置き換えます。
            </p>
          )}
          <div className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
            {result ? result.replaced : ''}
          </div>
        </Section>

        {/* split */}
        <Section
          title="split の結果"
          help="text.split(パターン) で分けた結果です。パターンにグループがあると、グループの中身も結果に入ります。"
        >
          {result && (
            <ol className="max-h-72 divide-y overflow-auto rounded-lg border text-sm">
              {result.split.map((s, k) => (
                <li
                  // 同じ文字列がくり返し出てくるので、順番で区別する
                  // biome-ignore lint/suspicious/noArrayIndexKey: 並びは毎回作り直す
                  key={k}
                  className="flex gap-3 px-3 py-1.5"
                >
                  <span className="w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                    {k}
                  </span>
                  <Value value={s} />
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      {/* 解説 */}
      <Section
        title="パターンの解説"
        help="パターンを先から順に読んで、部分ごとの意味をかんたんに説明します。細かい書き方には対応していないことがあります。"
      >
        {explained.length === 0 ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            パターンを入力すると、ここに意味が出ます。
          </p>
        ) : (
          <ol className="divide-y rounded-lg border text-sm">
            {explained.map((it, k) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: パターンを読むたびに作り直す
                key={k}
                className="flex gap-3 px-3 py-1.5"
                style={{ paddingLeft: `${0.75 + it.depth * 1.25}rem` }}
              >
                <code
                  className={cn(
                    'max-w-[55%] shrink-0 font-mono font-bold break-all',
                    it.group !== undefined
                      ? cn('rounded px-1', groupColor(it.group))
                      : KIND_STYLE[it.kind],
                  )}
                >
                  {it.token}
                </code>
                <span className="text-muted-foreground">{it.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
