/**
 * cron 式の読み取り・日本語の説明・次に動く日時の計算。
 * React に頼らない純粋な関数だけを置く（node で直接テストできるようにする）
 */

/** cron の書き方の違い */
export type Dialect = 'crontab' | 'github' | 'cloudflare' | 'seconds'

export type DialectInfo = {
  id: Dialect
  name: string
  /** 秒のフィールドがあるか（6 フィールド） */
  seconds: boolean
  /** @daily などのマクロを使えるか */
  macros: boolean
  /** L・W・# を使えるか */
  extensions: boolean
  /** 曜日の数字の振り方 */
  dowBase: 'sun0' | 'sun1'
  /** 決まったタイムゾーンで動くもの（null なら選べる） */
  fixedZone: string | null
  summary: string
}

export const dialects: readonly DialectInfo[] = [
  {
    id: 'crontab',
    name: 'Linux crontab',
    seconds: false,
    macros: true,
    extensions: false,
    dowBase: 'sun0',
    fixedZone: null,
    summary:
      '分 時 日 月 曜日 の 5 つ。曜日は 0〜7（0 と 7 が日曜）。@daily などのマクロも使えます。サーバーのタイムゾーン（または CRON_TZ）で動きます。',
  },
  {
    id: 'github',
    name: 'GitHub Actions',
    seconds: false,
    macros: false,
    extensions: false,
    dowBase: 'sun0',
    fixedZone: 'UTC',
    summary:
      'on.schedule の cron。分 時 日 月 曜日 の 5 つで、時刻は UTC。いちばん短い間隔は 5 分で、混んでいると遅れたり飛ばされたりします。',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers',
    seconds: false,
    macros: false,
    extensions: true,
    dowBase: 'sun1',
    fixedZone: 'UTC',
    summary:
      'Cron Triggers。分 時 日 月 曜日 の 5 つで、時刻は UTC。曜日は 1〜7 で 1 が日曜（crontab と 1 つずれます）。L・W・# も使えます。',
  },
  {
    id: 'seconds',
    name: '秒付き（6 フィールド）',
    seconds: true,
    macros: true,
    extensions: true,
    dowBase: 'sun0',
    fixedZone: null,
    summary:
      '秒 分 時 日 月 曜日 の 6 つ。node-cron・croner など、秒まで指定できるライブラリの書き方です。曜日は 0〜7（0 と 7 が日曜）。',
  },
]

export function getDialect(id: Dialect): DialectInfo {
  return dialects.find((d) => d.id === id) ?? dialects[0]
}

export type FieldKind = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow'

export const fieldLabels: Record<FieldKind, string> = {
  second: '秒',
  minute: '分',
  hour: '時',
  dom: '日',
  month: '月',
  dow: '曜日',
}

export const monthNames = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const
export const dowNames = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
] as const
export const dowJa = ['日', '月', '火', '水', '木', '金', '土'] as const

/** フィールドの範囲（曜日は書き方で変わる） */
export function fieldRange(kind: FieldKind, dialect: DialectInfo) {
  switch (kind) {
    case 'second':
    case 'minute':
      return { min: 0, max: 59 }
    case 'hour':
      return { min: 0, max: 23 }
    case 'dom':
      return { min: 1, max: 31 }
    case 'month':
      return { min: 1, max: 12 }
    case 'dow':
      return dialect.dowBase === 'sun1'
        ? { min: 1, max: 7 }
        : { min: 0, max: 7 }
  }
}

export const fieldOrder = (dialect: DialectInfo): FieldKind[] =>
  dialect.seconds
    ? ['second', 'minute', 'hour', 'dom', 'month', 'dow']
    : ['minute', 'hour', 'dom', 'month', 'dow']

/** フィールドの 1 つの要素（カンマで区切ったもの）。説明文を作るのに使う */
export type Part =
  | { type: 'all' }
  | { type: 'value'; value: number }
  | { type: 'range'; from: number; to: number }
  | { type: 'step'; from: number; to: number; step: number; star: boolean }
  /** 日: 月の最終日（offset 日前） */
  | { type: 'lastDay'; offset: number }
  /** 日: いちばん近い平日 */
  | { type: 'nearestWeekday'; day: number }
  /** 日: 月の最後の平日 */
  | { type: 'lastWeekday' }
  /** 曜日: 第 n 何曜日 */
  | { type: 'nth'; dow: number; n: number }
  /** 曜日: 月の最後の何曜日 */
  | { type: 'lastDow'; dow: number }

export type Field = {
  kind: FieldKind
  text: string
  parts: Part[]
  /** 当てはまる値（曜日は 0〜6 の日曜はじまりにそろえる） */
  values: Set<number>
  /** * や ? で始まる（crontab では日と曜日の組み合わせ方が変わる） */
  star: boolean
}

export type Schedule = {
  dialect: DialectInfo
  /** マクロ（@daily など）を展開する前の文字列 */
  macro: string | null
  fields: Record<FieldKind, Field>
  hasSeconds: boolean
}

export type CronError = {
  /** どのフィールドか（式全体の問題なら null） */
  field: FieldKind | null
  index: number | null
  message: string
}

export type ParseResult =
  | { ok: true; schedule: Schedule }
  | { ok: false; errors: CronError[]; reboot?: boolean }

export const macros: Record<string, { expr: string; label: string }> = {
  '@yearly': { expr: '0 0 1 1 *', label: '年に 1 回（1 月 1 日 0:00）' },
  '@annually': { expr: '0 0 1 1 *', label: '@yearly と同じ' },
  '@monthly': { expr: '0 0 1 * *', label: '月に 1 回（1 日 0:00）' },
  '@weekly': { expr: '0 0 * * 0', label: '週に 1 回（日曜 0:00）' },
  '@daily': { expr: '0 0 * * *', label: '1 日 1 回（0:00）' },
  '@midnight': { expr: '0 0 * * *', label: '@daily と同じ' },
  '@hourly': { expr: '0 * * * *', label: '1 時間に 1 回（毎時 0 分）' },
}

class FieldError extends Error {}

function toNumber(
  token: string,
  kind: FieldKind,
  dialect: DialectInfo,
): number {
  const upper = token.toUpperCase()
  if (kind === 'month') {
    const i = monthNames.indexOf(upper as (typeof monthNames)[number])
    if (i >= 0) return i + 1
  }
  if (kind === 'dow') {
    const i = dowNames.indexOf(upper as (typeof dowNames)[number])
    if (i >= 0) return dialect.dowBase === 'sun1' ? i + 1 : i
  }
  if (!/^\d+$/.test(token)) {
    if (/^[A-Z]{3}$/i.test(token)) {
      if (kind === 'month' || kind === 'dow')
        throw new FieldError(`「${token}」という名前はありません`)
      throw new FieldError(
        `「${token}」のような名前は${fieldLabels[kind]}では使えません（月と曜日だけ）`,
      )
    }
    throw new FieldError(`「${token}」は数字ではありません`)
  }
  const n = Number(token)
  const { min, max } = fieldRange(kind, dialect)
  if (n < min || n > max) {
    let hint = ''
    if (kind === 'dow' && dialect.dowBase === 'sun1' && n === 0)
      hint = '（Cloudflare では 1 が日曜、7 が土曜）'
    throw new FieldError(
      `「${token}」は範囲の外です。${fieldLabels[kind]}は ${min}〜${max}${hint}`,
    )
  }
  return n
}

/** 曜日の数字を 0〜6（0 が日曜）にそろえる */
function normalizeDow(n: number, dialect: DialectInfo) {
  if (dialect.dowBase === 'sun1') return n - 1
  return n % 7
}

function parseField(
  text: string,
  kind: FieldKind,
  dialect: DialectInfo,
): Field {
  const { min, max } = fieldRange(kind, dialect)
  const values = new Set<number>()
  const parts: Part[] = []
  const add = (n: number) =>
    values.add(kind === 'dow' ? normalizeDow(n, dialect) : n)
  const star = text.startsWith('*') || text.startsWith('?')

  if (text === '') throw new FieldError('空になっています')
  const items = text.split(',')
  for (const item of items) {
    if (item === '')
      throw new FieldError(
        'カンマの前後に値がありません（「,,」や末尾の「,」）',
      )
    const upper = item.toUpperCase()

    if (item === '?') {
      if (kind !== 'dom' && kind !== 'dow')
        throw new FieldError('「?」は日と曜日でだけ使えます')
      if (!dialect.extensions)
        throw new FieldError(
          `「?」は ${dialect.name} では使えません。「*」と書きます`,
        )
      if (items.length > 1)
        throw new FieldError('「?」はほかの値と並べられません')
      for (let n = min; n <= max; n++) add(n)
      parts.push({ type: 'all' })
      continue
    }

    // L・W・#（Cloudflare・秒付きの書き方だけ）
    if (
      upper.includes('#') ||
      /^(L|L-\d+|LW|\d+W|\d+L|[A-Z]{3}L)$/.test(upper)
    ) {
      if (!dialect.extensions)
        throw new FieldError(
          `「${item}」の L・W・# は ${dialect.name} では使えません`,
        )
      if (kind === 'dom') {
        if (upper === 'L') {
          parts.push({ type: 'lastDay', offset: 0 })
          continue
        }
        const lastOffset = /^L-(\d+)$/.exec(upper)
        if (lastOffset) {
          const offset = Number(lastOffset[1])
          if (offset > 30)
            throw new FieldError(`「${item}」の日数が大きすぎます（30 まで）`)
          parts.push({ type: 'lastDay', offset })
          continue
        }
        if (upper === 'LW') {
          parts.push({ type: 'lastWeekday' })
          continue
        }
        const w = /^(\d+)W$/.exec(upper)
        if (w) {
          const day = toNumber(w[1], kind, dialect)
          parts.push({ type: 'nearestWeekday', day })
          continue
        }
        throw new FieldError(
          `「${item}」は読めません。日では L・L-3・15W・LW のように書きます`,
        )
      }
      if (kind === 'dow') {
        const nth = /^(\w+)#(\d)$/.exec(upper)
        if (nth) {
          const dow = normalizeDow(toNumber(nth[1], kind, dialect), dialect)
          const n = Number(nth[2])
          if (n < 1 || n > 5)
            throw new FieldError(`「${item}」の「#」のあとは 1〜5 です`)
          parts.push({ type: 'nth', dow, n })
          continue
        }
        const last = /^(\w+)L$/.exec(upper)
        if (last) {
          const dow = normalizeDow(toNumber(last[1], kind, dialect), dialect)
          parts.push({ type: 'lastDow', dow })
          continue
        }
        if (upper === 'L') {
          // 曜日の L だけなら土曜（最後の曜日）
          const sat = 6
          values.add(sat)
          parts.push({
            type: 'value',
            value: dialect.dowBase === 'sun1' ? 7 : 6,
          })
          continue
        }
        throw new FieldError(
          `「${item}」は読めません。曜日では FRI#2（第 2 金曜）・FRIL（最終金曜）のように書きます`,
        )
      }
      throw new FieldError(`「${item}」の L・W・# は日と曜日でだけ使えます`)
    }

    const [rangeText, stepText, ...rest] = item.split('/')
    if (rest.length > 0)
      throw new FieldError(`「${item}」に「/」が 2 つあります`)
    let step = 1
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) === 0)
        throw new FieldError(
          `「${item}」の「/」のあとは 1 以上の数字にします（例: */5）`,
        )
      step = Number(stepText)
    }

    let from: number
    let to: number
    let isStar = false
    if (rangeText === '*') {
      from = min
      to = kind === 'dow' ? (dialect.dowBase === 'sun1' ? 7 : 6) : max
      isStar = true
    } else if (rangeText.includes('-')) {
      const [a, b, ...more] = rangeText.split('-')
      if (more.length > 0 || a === '' || b === '')
        throw new FieldError(`「${item}」の範囲が読めません（例: 1-5）`)
      from = toNumber(a, kind, dialect)
      to = toNumber(b, kind, dialect)
      if (from > to)
        throw new FieldError(
          `「${item}」は始まりが終わりより大きくなっています`,
        )
    } else {
      from = toNumber(rangeText, kind, dialect)
      // 「5/15」は 5 から最後まで 15 ごと
      to = stepText !== undefined ? (kind === 'dow' ? 6 : max) : from
    }

    for (let n = from; n <= to; n += step) add(n)

    if (stepText !== undefined) {
      parts.push({ type: 'step', from, to, step, star: isStar })
    } else if (isStar) {
      parts.push({ type: 'all' })
    } else if (from === to) {
      parts.push({ type: 'value', value: from })
    } else {
      parts.push({ type: 'range', from, to })
    }
  }

  return { kind, text, parts, values, star }
}

/** cron 式を読む。どこがおかしいかを、フィールドごとに返す */
export function parseCron(input: string, dialectId: Dialect): ParseResult {
  const dialect = getDialect(dialectId)
  let text = input.trim().replace(/\s+/g, ' ')
  let macro: string | null = null

  if (text === '')
    return {
      ok: false,
      errors: [
        { field: null, index: null, message: 'cron 式を入れてください' },
      ],
    }

  if (text.startsWith('@')) {
    const name = text.toLowerCase()
    if (!dialect.macros)
      return {
        ok: false,
        errors: [
          {
            field: null,
            index: null,
            message: `${dialect.name} では ${text} のようなマクロは使えません。${
              macros[name] ? `「${macros[name].expr}」と書きます` : ''
            }`,
          },
        ],
      }
    if (name === '@reboot')
      return {
        ok: false,
        reboot: true,
        errors: [
          {
            field: null,
            index: null,
            message:
              '@reboot は「起動したときに 1 回」なので、決まった日時はありません',
          },
        ],
      }
    const m = macros[name]
    if (!m)
      return {
        ok: false,
        errors: [
          {
            field: null,
            index: null,
            message: `「${text}」というマクロはありません。使えるのは ${Object.keys(macros).join('・')}・@reboot です`,
          },
        ],
      }
    macro = name
    text = dialect.seconds ? `0 ${m.expr}` : m.expr
  }

  const tokens = text.split(' ')
  const order = fieldOrder(dialect)
  if (tokens.length !== order.length) {
    let hint = ''
    if (!dialect.seconds && tokens.length === 6)
      hint =
        '6 つあるときは秒付きの書き方です。上で「秒付き（6 フィールド）」を選んでください'
    else if (dialect.seconds && tokens.length === 5)
      hint = '秒付きの書き方では、先頭に秒を足します（例: 0 を足す）'
    else if (tokens.length === 7) hint = '7 つ目（年）は使えません'
    return {
      ok: false,
      errors: [
        {
          field: null,
          index: null,
          message: `フィールドが ${tokens.length} つあります。${dialect.name} では ${order.length} つ（${order.map((k) => fieldLabels[k]).join(' ')}）です。${hint}`,
        },
      ],
    }
  }

  const errors: CronError[] = []
  const fields = {} as Record<FieldKind, Field>
  order.forEach((kind, index) => {
    try {
      fields[kind] = parseField(tokens[index], kind, dialect)
    } catch (e) {
      if (!(e instanceof FieldError)) throw e
      errors.push({ field: kind, index, message: e.message })
    }
  })
  if (errors.length > 0) return { ok: false, errors }

  if (!dialect.seconds) {
    fields.second = {
      kind: 'second',
      text: '0',
      parts: [{ type: 'value', value: 0 }],
      values: new Set([0]),
      star: false,
    }
  }

  if (dialect.extensions && fields.dom.text === '?' && fields.dow.text === '?')
    return {
      ok: false,
      errors: [
        {
          field: 'dow',
          index: order.indexOf('dow'),
          message: '日と曜日の両方を「?」にはできません',
        },
      ],
    }

  return {
    ok: true,
    schedule: { dialect, macro, fields, hasSeconds: dialect.seconds },
  }
}

// ---------------------------------------------------------------------------
// 日付の判定

const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate()
const weekday = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d)).getUTCDay()

function nearestWeekday(y: number, m: number, day: number) {
  const last = daysInMonth(y, m)
  const d = Math.min(day, last)
  const w = weekday(y, m, d)
  if (w === 6) return d === 1 ? 3 : d - 1 // 土曜 → 金曜（1 日なら月曜）
  if (w === 0) return d === last ? d - 2 : d + 1 // 日曜 → 月曜（末日なら金曜）
  return d
}

function domMatches(field: Field, y: number, m: number, d: number) {
  const last = daysInMonth(y, m)
  for (const p of field.parts) {
    switch (p.type) {
      case 'lastDay':
        if (d === last - p.offset) return true
        break
      case 'nearestWeekday':
        if (p.day <= last && d === nearestWeekday(y, m, p.day)) return true
        break
      case 'lastWeekday':
        if (d === nearestWeekday(y, m, last)) return true
        break
      default:
        break
    }
  }
  return field.values.has(d)
}

function dowMatches(field: Field, y: number, m: number, d: number) {
  const w = weekday(y, m, d)
  for (const p of field.parts) {
    if (p.type === 'nth' && p.dow === w && Math.ceil(d / 7) === p.n) return true
    if (p.type === 'lastDow' && p.dow === w && d + 7 > daysInMonth(y, m))
      return true
  }
  return field.values.has(w)
}

/**
 * その日に動くか。日と曜日の両方を指定すると「どちらか」に当てはまれば動く（OR）。
 * どちらかが * で始まると「両方」に当てはまる日だけ（Vixie cron と同じ）
 */
export function dayMatches(s: Schedule, y: number, m: number, d: number) {
  if (!s.fields.month.values.has(m)) return false
  const { dom, dow } = s.fields
  const a = domMatches(dom, y, m, d)
  const b = dowMatches(dow, y, m, d)
  return dom.star || dow.star ? a && b : a || b
}

/** 日と曜日が OR で組み合わさるか */
export const isDomDowOr = (s: Schedule) =>
  !s.fields.dom.star && !s.fields.dow.star

// ---------------------------------------------------------------------------
// タイムゾーン

type Wall = {
  y: number
  m: number
  d: number
  h: number
  mi: number
  s: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function wallFormatter(zone: string) {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(zone, f)
  }
  return f
}

/** ある瞬間の、そのタイムゾーンでの日付と時刻 */
export function toWall(ms: number, zone: string): Wall {
  const parts = wallFormatter(zone).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour') % 24,
    mi: get('minute'),
    s: get('second'),
  }
}

const wallToNaive = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s)

/** そのタイムゾーンの UTC からのずれ（ミリ秒） */
export function zoneOffset(ms: number, zone: string) {
  const flooredMs = Math.floor(ms / 1000) * 1000
  return wallToNaive(toWall(flooredMs, zone)) - flooredMs
}

/**
 * そのタイムゾーンの日付と時刻を瞬間に直す。
 * 夏時間の切り替えで存在しない時刻なら null、2 回ある時刻なら早いほう
 */
export function fromWall(w: Wall, zone: string): number | null {
  const naive = wallToNaive(w)
  const candidates = new Set<number>()
  for (const probe of [naive - 864e5, naive, naive + 864e5]) {
    candidates.add(naive - zoneOffset(probe, zone))
  }
  const hits = [...candidates]
    .filter((ms) => wallToNaive(toWall(ms, zone)) === naive)
    .sort((a, b) => a - b)
  return hits[0] ?? null
}

// ---------------------------------------------------------------------------
// 次に動く日時

export type NextRunsResult = {
  runs: number[]
  /** 探す範囲の中で一度も動かなかった */
  never: boolean
}

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b)

/**
 * after より後（after は含まない）に動く日時を count 回分。
 * zone はスケジュールを読むタイムゾーン（GitHub・Cloudflare なら UTC）
 */
export function nextRuns(
  s: Schedule,
  after: number,
  zone: string,
  count: number,
  /** 何日先まで探すか（2 月 29 日の月曜なども見つかるよう 28 年） */
  searchDays = 366 * 28,
): NextRunsResult {
  const runs: number[] = []
  const hours = sorted(s.fields.hour.values)
  const minutes = sorted(s.fields.minute.values)
  const seconds = sorted(s.fields.second.values)

  const start = toWall(after, zone)
  let day = Date.UTC(start.y, start.m - 1, start.d)
  for (let i = 0; i < searchDays && runs.length < count; i++, day += 864e5) {
    const date = new Date(day)
    const y = date.getUTCFullYear()
    const m = date.getUTCMonth() + 1
    const d = date.getUTCDate()
    if (!dayMatches(s, y, m, d)) continue
    // 1 日目の、もう過ぎた時刻は飛ばす
    const first = i === 0
    for (const h of hours) {
      if (first && h < start.h) continue
      for (const mi of minutes) {
        if (first && h === start.h && mi < start.mi) continue
        for (const sec of seconds) {
          const ms = fromWall({ y, m, d, h, mi, s: sec }, zone)
          if (ms === null || ms <= after) continue
          runs.push(ms)
          if (runs.length >= count) break
        }
        if (runs.length >= count) break
      }
      if (runs.length >= count) break
    }
  }
  return { runs, never: runs.length === 0 }
}

// ---------------------------------------------------------------------------
// 日本語の説明

const pad2 = (n: number) => String(n).padStart(2, '0')

function dowLabel(n: number, dialect: DialectInfo) {
  return `${dowJa[normalizeDow(n, dialect)]}曜`
}

/** 1 つの値の読み方 */
function valueLabel(kind: FieldKind, n: number, dialect: DialectInfo) {
  switch (kind) {
    case 'second':
      return `${n} 秒`
    case 'minute':
      return `${n} 分`
    case 'hour':
      return `${n} 時`
    case 'dom':
      return `${n} 日`
    case 'month':
      return `${n} 月`
    case 'dow':
      return dowLabel(n, dialect)
  }
}

const unitOf: Record<FieldKind, string> = {
  second: '秒',
  minute: '分',
  hour: '時間',
  dom: '日',
  month: 'か月',
  dow: '日',
}

function partLabel(kind: FieldKind, p: Part, dialect: DialectInfo): string {
  const v = (n: number) => valueLabel(kind, n, dialect)
  switch (p.type) {
    case 'all':
      return `毎${fieldLabels[kind] === '曜日' ? '日' : fieldLabels[kind]}`
    case 'value':
      return v(p.value)
    case 'range':
      if (kind === 'dow')
        return `${v(p.from)}〜${v(p.to)}日`.replace('曜〜', '〜')
      return `${v(p.from)}〜${v(p.to)}`
    case 'step': {
      const every = `${p.step} ${unitOf[kind]}ごと`
      const { min, max } = fieldRange(kind, dialect)
      if (p.star) return every
      if (p.to === max || (kind === 'dow' && p.to >= 6 && p.from <= min + 1))
        return `${v(p.from)}から ${every}`
      return `${v(p.from)}〜${v(p.to)}の ${every}`
    }
    case 'lastDay':
      return p.offset === 0 ? '末日' : `末日の ${p.offset} 日前`
    case 'nearestWeekday':
      return `${p.day} 日に近い平日`
    case 'lastWeekday':
      return '最後の平日'
    case 'nth':
      return `第 ${p.n} ${dowJa[p.dow]}曜日`
    case 'lastDow':
      return `最後の${dowJa[p.dow]}曜日`
  }
}

/** フィールド 1 つの説明（入力補助のカードに出す） */
export function describeField(f: Field, dialect: DialectInfo): string {
  if (f.kind === 'dow') {
    const special = dowShortcut(f)
    if (special) return special
  }
  const labels = f.parts.map((p) => partLabel(f.kind, p, dialect))
  return labels.join('・')
}

function dowShortcut(f: Field): string | null {
  if (f.parts.some((p) => p.type === 'nth' || p.type === 'lastDow')) return null
  const key = sorted(f.values).join(',')
  if (key === '1,2,3,4,5') return '平日（月〜金曜）'
  if (key === '0,6') return '土日'
  if (key === '0,1,2,3,4,5,6') return '毎日'
  return null
}

function dowPhrase(f: Field, dialect: DialectInfo) {
  const special = dowShortcut(f)
  if (special === '平日（月〜金曜）') return '平日（月〜金曜）'
  if (special === '土日') return '土日'
  const labels = f.parts.map((p) => {
    if (p.type === 'value') return `${dowLabel(p.value, dialect)}日`
    return partLabel('dow', p, dialect)
  })
  const monthly = f.parts.some((p) => p.type === 'nth' || p.type === 'lastDow')
  return `${monthly ? '毎月' : '毎週'} ${labels.join('・')}`
}

// すべての値が入っているか（* や 1 ごとなど）
const isEvery = (f: Field, dialect: DialectInfo) => {
  const { min, max } = fieldRange(f.kind, dialect)
  const size = f.kind === 'dow' ? 7 : max - min + 1
  return f.values.size === size
}

const singleValue = (f: Field) =>
  f.parts.length === 1 && f.parts[0].type === 'value' ? f.parts[0].value : null

function timePhrase(s: Schedule) {
  const { second, minute, hour } = s.fields
  const d = s.dialect
  const sec = singleValue(second)
  const min = singleValue(minute)
  const everyMin = isEvery(minute, d)
  const everyHour = isEvery(hour, d)
  const secSuffix = sec === null ? '' : sec === 0 ? '' : `${sec} 秒`
  const secPart = s.hasSeconds && sec === null ? describeField(second, d) : ''

  // 決まった時刻（9:00 や 9:00・12:00・18:00）
  if (min !== null && hour.values.size <= 6 && !everyHour) {
    const times = sorted(hour.values).map(
      (h) =>
        `${h}:${pad2(min)}${sec !== null && sec !== 0 ? `:${pad2(sec)}` : ''}`,
    )
    return `${times.join('・')}${secPart ? ` の${secPart}` : ''}`
  }

  // 秒だけを指定（10 秒ごと など）
  if (everyMin && everyHour && secPart) return secPart
  if (everyMin && everyHour && secSuffix) return `毎分 ${secSuffix}`

  const parts: string[] = []
  if (!everyHour) {
    const hp = describeField(hour, d)
    parts.push(
      hour.parts.every((p) => p.type === 'step')
        ? `${hp}（${sorted(hour.values)
            .slice(0, 4)
            .map((h) => `${h} 時`)
            .join('・')}${hour.values.size > 4 ? '…' : ''}）`
        : `${hp}台`,
    )
  }
  if (everyMin) {
    parts.push('毎分')
  } else if (min !== null) {
    parts.push(everyHour ? `毎時 ${min} 分` : `${min} 分`)
  } else {
    parts.push(describeField(minute, d))
  }
  if (secPart) parts.push(secPart)
  else if (secSuffix) parts.push(secSuffix)
  return parts.join('の ')
}

function datePhrase(s: Schedule) {
  const { dom, month, dow } = s.fields
  const d = s.dialect
  const domAll = dom.star && isEvery(dom, d)
  const dowAll = dow.star && isEvery(dow, d)
  const monthAll = isEvery(month, d)

  let day: string
  if (domAll && dowAll) day = monthAll ? '毎日' : ''
  else if (dowAll) day = describeField(dom, d)
  else if (domAll) day = dowPhrase(dow, d)
  else if (isDomDowOr(s))
    day = `${describeField(dom, d)}、または${dowPhrase(dow, d).replace(/^毎[週月] /, '')}`
  else
    day = `${describeField(dom, d)}で、しかも${dowPhrase(dow, d).replace(/^毎[週月] /, '')}`

  if (monthAll) {
    if (!domAll && dowAll) return `毎月 ${day}`
    return day
  }
  const months = describeField(month, d)
  if (domAll && dowAll) return `${months}の毎日`
  return `${months}の ${day}`
}

/** 式全体の日本語の説明（「平日の 9:00 に」など） */
export function describeSchedule(s: Schedule): string {
  const date = datePhrase(s)
  const time = timePhrase(s)
  // 決まった時刻（9:00 など）かどうか
  const fixed = /^\d+:\d\d/.test(time)
  if (date === '毎日') return fixed ? `毎日 ${time} に` : `${time}に`
  return `${date}の ${time}${fixed ? ' ' : ''}に`
}

/** 間違えやすいところの注意（この式に当てはまるものだけ） */
export function warningsFor(s: Schedule, runs: number[]): string[] {
  const out: string[] = []
  const { dom, dow, minute } = s.fields
  const d = s.dialect
  if (isDomDowOr(s))
    out.push(
      `日（${dom.text}）と曜日（${dow.text}）の両方を指定しているので、「どちらか」に当てはまる日に動きます（AND ではなく OR）。「${dom.text} 日で、しかも${dowPhrase(dow, d).replace(/^毎[週月] /, '')}」の日だけにしたいときは、cron だけでは書けないので、処理の中で日付を確かめます。`,
    )
  else if (
    (dom.star && !isEvery(dom, d)) ||
    (dow.star && !isEvery(dow, d) && !dom.star)
  )
    out.push(
      `「${dom.star && !isEvery(dom, d) ? dom.text : dow.text}」は * で始まるので、日と曜日の「両方」に当てはまる日だけ動きます（ほとんどの cron の実装。* で始まらない書き方にすると OR に変わります）。`,
    )
  if (d.id === 'cloudflare' && dow.parts.some((p) => p.type !== 'all'))
    out.push(
      'Cloudflare の曜日は 1 が日曜・7 が土曜で、Linux の crontab（0 が日曜）と 1 つずれます。数字ではなく MON・FRI のような名前で書くと間違えにくくなります。',
    )
  if (d.dowBase === 'sun0' && dow.text.split(/[,\-/]/).includes('7'))
    out.push('曜日の 7 は日曜（0 と同じ）として読んでいます。')
  if (d.id === 'github') {
    const gaps = runs.slice(1).map((t, i) => t - runs[i])
    if (gaps.some((g) => g < 5 * 60_000))
      out.push(
        'GitHub Actions のいちばん短い間隔は 5 分です。それより短く書いても 5 分より細かくは動きません。',
      )
    if (minute.values.has(0))
      out.push(
        'GitHub Actions は毎時 0 分に実行が集中して遅れやすいので、17 分など半端な分にずらすのがおすすめです。',
      )
  }
  const domDays = [...dom.values]
  if (
    !dom.star &&
    domDays.length > 0 &&
    domDays.every((n) => n >= 29) &&
    !dom.parts.some((p) => p.type === 'lastDay')
  )
    out.push(
      `${domDays.sort((a, b) => a - b).join('・')} 日がない月には動きません。月末に動かしたいなら ${d.extensions ? '「L」（末日）を使うか、' : ''}28〜31 日に動かして処理の中で翌日が 1 日かを確かめます。`,
    )
  return out
}

/** 曜日の数字を、ほかの書き方の数字に直す（入力補助のボタン用） */
export function dowNumber(sun0: number, dialect: DialectInfo) {
  return dialect.dowBase === 'sun1' ? sun0 + 1 : sun0
}
