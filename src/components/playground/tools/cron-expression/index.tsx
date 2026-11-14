import { CircleAlert, Clock, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { CopyButton, HelpTip } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import {
  type Dialect,
  type DialectInfo,
  describeField,
  describeSchedule,
  dialects,
  dowNumber,
  type FieldKind,
  fieldLabels,
  fieldOrder,
  fieldRange,
  getDialect,
  macros,
  nextRuns,
  parseCron,
  warningsFor,
} from './cron'

const zones = [
  { id: 'Asia/Tokyo', label: '日本（Asia/Tokyo）' },
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: 'ニューヨーク（America/New_York）' },
  { id: 'America/Los_Angeles', label: 'ロサンゼルス（America/Los_Angeles）' },
  { id: 'Europe/London', label: 'ロンドン（Europe/London）' },
  { id: 'Europe/Berlin', label: 'ベルリン（Europe/Berlin）' },
  { id: 'Asia/Shanghai', label: '中国（Asia/Shanghai）' },
  { id: 'Asia/Singapore', label: 'シンガポール（Asia/Singapore）' },
  { id: 'Australia/Sydney', label: 'シドニー（Australia/Sydney）' },
] as const

/** 式全体のよく使う例（5 フィールド。秒付きのときは先頭に 0 を足す） */
const presets = [
  { label: '毎分', expr: '* * * * *' },
  { label: '5 分ごと', expr: '*/5 * * * *' },
  { label: '毎時 0 分', expr: '0 * * * *' },
  { label: '毎日 0:00', expr: '0 0 * * *' },
  { label: '平日 9:00', expr: '0 9 * * MON-FRI' },
  { label: '毎週月曜 9:00', expr: '0 9 * * MON' },
  { label: '毎月 1 日 0:00', expr: '0 0 1 * *' },
  { label: '平日の営業時間に 15 分ごと', expr: '*/15 9-17 * * MON-FRI' },
]

/** フィールドごとの入力補助のボタン */
function fieldExamples(kind: FieldKind, dialect: DialectInfo) {
  const ext = dialect.extensions
  switch (kind) {
    case 'second':
      return ['0', '*/10', '*/30', '*']
    case 'minute':
      return ['0', '*/5', '*/15', '0,30', '*']
    case 'hour':
      return ['0', '9', '9-17', '*/2', '9,12,18', '*']
    case 'dom':
      return ['*', '1', '15', '1,15', ...(ext ? ['L', '15W'] : [])]
    case 'month':
      return ['*', '1', 'JAN,JUL', '*/3', '4-9']
    case 'dow':
      return [
        '*',
        'MON-FRI',
        'SAT,SUN',
        'MON',
        String(dowNumber(0, dialect)),
        ...(ext ? ['FRI#2', 'FRIL'] : []),
      ]
  }
}

const exampleHint: Record<string, string> = {
  '*': 'すべて',
  '*/5': '5 ごと',
  L: '末日',
  '15W': '15 日に近い平日',
  'FRI#2': '第 2 金曜',
  FRIL: '最後の金曜',
}

/** 式をフィールドに分ける（マクロや数が合わないときは展開・補う） */
function splitFields(expr: string, dialect: DialectInfo) {
  const order = fieldOrder(dialect)
  // フィールドの入力欄を空にしたとき（空白が 2 つ続く）も、位置がずれないようにする
  const raw = expr.split(' ')
  if (raw.length === order.length) return raw
  let text = expr.trim()
  const macro = macros[text.toLowerCase()]
  if (macro) text = dialect.seconds ? `0 ${macro.expr}` : macro.expr
  const tokens = text === '' ? [] : text.split(/\s+/)
  if (tokens.length === order.length) return tokens
  const base = dialect.seconds
    ? ['0', '*', '*', '*', '*', '*']
    : ['*', '*', '*', '*', '*']
  return base.map((b, i) => tokens[i] ?? b)
}

/** 5 フィールドと 6 フィールドを切り替えるときに、秒を足す・外す */
function convertExpr(expr: string, from: DialectInfo, to: DialectInfo) {
  const text = expr.trim()
  if (text.startsWith('@') || from.seconds === to.seconds) return text
  const tokens = text.split(/\s+/)
  if (to.seconds && tokens.length === 5) return `0 ${text}`
  if (!to.seconds && tokens.length === 6) return tokens.slice(1).join(' ')
  return text
}

function formatIn(ms: number, zone: string, seconds: boolean) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const time = `${get('hour')}:${get('minute')}${seconds ? `:${get('second')}` : ''}`
  return {
    date: `${get('year')}/${get('month')}/${get('day')}（${get('weekday')}）`,
    time,
  }
}

function relative(ms: number, now: number) {
  let sec = Math.max(0, Math.round((ms - now) / 1000))
  if (sec < 60) return `あと ${sec} 秒`
  const d = Math.floor(sec / 86400)
  sec -= d * 86400
  const h = Math.floor(sec / 3600)
  sec -= h * 3600
  const m = Math.floor(sec / 60)
  if (d > 0) return `あと ${d} 日${h > 0 ? ` ${h} 時間` : ''}`
  if (h > 0) return `あと ${h} 時間${m > 0 ? ` ${m} 分` : ''}`
  return `あと ${m} 分`
}

const selectClass =
  'h-10 w-full rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm disabled:opacity-60'

export function CronExpression() {
  const [dialectId, setDialectId] = useState<Dialect>('crontab')
  const [expr, setExpr] = useState('0 9 * * MON-FRI')
  const [serverZone, setServerZone] = useState('Asia/Tokyo')
  const [displayZone, setDisplayZone] = useState('Asia/Tokyo')
  const [count, setCount] = useState(10)
  const [now, setNow] = useState(() => Date.now())

  // 「あと何分」と次の日時が古くならないよう、30 秒ごとに今の時刻を取り直す
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const dialect = getDialect(dialectId)
  const zone = dialect.fixedZone ?? serverZone
  const order = fieldOrder(dialect)
  const parsed = useMemo(() => parseCron(expr, dialectId), [expr, dialectId])
  const tokens = splitFields(expr, dialect)

  const result = useMemo(() => {
    if (!parsed.ok) return null
    const { runs, never } = nextRuns(parsed.schedule, now, zone, count)
    return {
      schedule: parsed.schedule,
      runs,
      never,
      description: describeSchedule(parsed.schedule),
      warnings: warningsFor(parsed.schedule, runs),
    }
  }, [parsed, now, zone, count])

  const fieldErrors = new Map<FieldKind, string>(
    parsed.ok
      ? []
      : parsed.errors.flatMap((e) =>
          e.field ? [[e.field, e.message] as const] : [],
        ),
  )

  const setField = (index: number, value: string) => {
    const next = [...tokens]
    next[index] = value
    setExpr(next.join(' '))
  }

  const changeDialect = (id: Dialect) => {
    const to = getDialect(id)
    setExpr((e) => convertExpr(e, dialect, to))
    setDialectId(id)
  }

  return (
    <div className="space-y-6">
      {/* 書き方（実行する場所） */}
      <section className="space-y-2">
        <div className="flex items-center gap-1 text-sm font-medium">
          どこで使う cron か
          <HelpTip>
            cron
            は使う場所によって、使える書き方や曜日の数字、タイムゾーンが少しずつ違います。
          </HelpTip>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {dialects.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant={d.id === dialectId ? 'default' : 'outline'}
              onClick={() => changeDialect(d.id)}
              aria-pressed={d.id === dialectId}
              className="h-auto min-h-9 whitespace-normal py-1.5"
            >
              {d.name}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{dialect.summary}</p>
      </section>

      {/* 式の入力 */}
      <section className="space-y-3">
        <Label htmlFor="cron-expr">cron 式</Label>
        <div className="flex gap-2">
          <Input
            id="cron-expr"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!parsed.ok}
            className="h-12 font-mono text-lg md:h-12 md:text-lg"
          />
          <CopyButton value={expr.trim()} size="icon" label="式をコピー" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const value = dialect.seconds ? `0 ${p.expr}` : p.expr
            return (
              <Button
                key={p.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setExpr(value)}
                title={value}
              >
                {p.label}
              </Button>
            )
          })}
          {dialect.macros &&
            ['@hourly', '@daily', '@weekly', '@monthly'].map((m) => (
              <Button
                key={m}
                type="button"
                variant="secondary"
                size="sm"
                className="font-mono"
                onClick={() => setExpr(m)}
                title={macros[m].label}
              >
                {m}
              </Button>
            ))}
        </div>
      </section>

      {/* 説明 */}
      <section
        aria-live="polite"
        className={cn(
          'rounded-xl border p-4 sm:p-5',
          result
            ? 'border-primary/40 bg-primary/5'
            : 'border-destructive/50 bg-destructive/5',
        )}
      >
        {result ? (
          <>
            <div className="text-xs text-muted-foreground">この式の意味</div>
            <p className="mt-1 text-xl font-bold leading-relaxed sm:text-2xl">
              {result.description}
              <span className="text-base font-normal">実行</span>
            </p>
            {result.schedule.macro && (
              <p className="mt-1 text-sm text-muted-foreground">
                {result.schedule.macro} は「
                <span className="font-mono">
                  {macros[result.schedule.macro].expr}
                </span>
                」と同じです。
              </p>
            )}
          </>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <CircleAlert className="size-4" />
              この式は読めません
            </div>
            <ul className="space-y-1 text-sm">
              {(parsed.ok ? [] : parsed.errors).map((e) => (
                <li key={`${e.field}-${e.message}`}>
                  {e.field && (
                    <span className="font-medium">
                      {fieldLabels[e.field]}のフィールド:{' '}
                    </span>
                  )}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* フィールドごとの入力補助 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">フィールドごとに見る・直す</h2>
        <div
          className={cn(
            'grid grid-cols-2 gap-2 sm:grid-cols-3',
            order.length === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5',
          )}
        >
          {order.map((kind, index) => {
            const error = fieldErrors.get(kind)
            const field = result?.schedule.fields[kind]
            const { min, max } = fieldRange(kind, dialect)
            const token = tokens[index] ?? ''
            return (
              <div
                key={kind}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3',
                  error && 'border-destructive/60 bg-destructive/5',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {fieldLabels[kind]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {min}〜{max}
                    {kind === 'month' && '・JAN〜DEC'}
                    {kind === 'dow' && '・SUN〜SAT'}
                  </span>
                </div>
                <Input
                  value={token}
                  onChange={(e) =>
                    setField(index, e.target.value.replace(/\s+/g, ''))
                  }
                  aria-label={`${fieldLabels[kind]}のフィールド`}
                  aria-invalid={Boolean(error)}
                  spellCheck={false}
                  className="font-mono"
                />
                <p
                  className={cn(
                    'min-h-10 text-xs leading-relaxed',
                    error ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {error ?? (field ? describeField(field, dialect) : '')}
                </p>
                {kind === 'dow' && (
                  <p className="text-xs text-muted-foreground">
                    {dialect.dowBase === 'sun1'
                      ? '1 = 日曜 … 7 = 土曜'
                      : '0 = 日曜 … 6 = 土曜（7 も日曜）'}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-1">
                  {fieldExamples(kind, dialect).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setField(index, v)}
                      title={exampleHint[v]}
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-accent',
                        token === v && 'border-primary bg-primary/10',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* タイムゾーンと回数 */}
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="server-zone" className="flex items-center gap-1">
            式を読むタイムゾーン
            <HelpTip>
              cron が動くサーバーの時計のタイムゾーンです。GitHub Actions と
              Cloudflare Workers は UTC で決まっています。
            </HelpTip>
          </Label>
          <select
            id="server-zone"
            value={zone}
            disabled={dialect.fixedZone !== null}
            onChange={(e) => setServerZone(e.target.value)}
            className={selectClass}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          {dialect.fixedZone && (
            <p className="text-xs text-muted-foreground">
              {dialect.name} は UTC で動きます
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="display-zone">表示するタイムゾーン</Label>
          <select
            id="display-zone"
            value={displayZone}
            onChange={(e) => setDisplayZone(e.target.value)}
            className={selectClass}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="run-count">表示する回数</Label>
          <select
            id="run-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className={selectClass}
          >
            {[10, 20].map((n) => (
              <option key={n} value={n}>
                {n} 回
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 注意 */}
      {result && result.warnings.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4" />
            この式で気をつけること
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 次に動く日時 */}
      {result && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <Clock className="size-4" />
              次に動く日時
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setNow(Date.now())}
            >
              <RefreshCw />
              今の時刻から計算し直す
            </Button>
          </div>
          {result.never ? (
            <p className="rounded-lg border p-4 text-sm">
              この先 28 年のあいだに一度も動きません（2 月 31
              日のように、ない日付を指定していないか確かめてください）。
            </p>
          ) : (
            <ol className="divide-y rounded-lg border">
              {result.runs.map((ms, i) => {
                const shown = formatIn(
                  ms,
                  displayZone,
                  result.schedule.hasSeconds,
                )
                const server = formatIn(ms, zone, result.schedule.hasSeconds)
                return (
                  <li
                    key={ms}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2"
                  >
                    <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="font-mono tabular-nums">
                      {shown.date}{' '}
                      <span className="font-semibold">{shown.time}</span>
                    </span>
                    {zone !== displayZone && (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {zone === 'UTC' ? 'UTC' : zone}: {server.date.slice(5)}{' '}
                        {server.time}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {relative(ms, now)}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            {zones.find((z) => z.id === displayZone)?.label ?? displayZone}
            の時刻で表示しています（今: {(() => {
              const n = formatIn(now, displayZone, false)
              return `${n.date} ${n.time}`
            })()}
            ）。夏時間に切り替わる日に存在しない時刻は飛ばしています。
          </p>
        </section>
      )}
    </div>
  )
}
