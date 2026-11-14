import { useNavigate } from '@tanstack/react-router'
import { LayoutGrid, List, Rows3, Search, X } from 'lucide-react'
import * as React from 'react'

import { Input } from '@/components/ui/input'
import {
  rememberListSearch,
  rememberListView,
  useRememberedListView,
} from '@/lib/list-memory'
import { normalizeForSearch } from '@/lib/search-text'
import { cn } from '@/lib/utils'

/**
 * 一覧ページの共通部品（検索・絞り込み・並べ替え・表示の切り替え）。
 * 状態は URL（?q=…&sort=…&view=…&<絞り込みのキー>=…）に入れるので、詳しいページから戻っても、
 * リンクを人に送っても、同じ一覧が出る
 */

export type ViewMode = 'card' | 'list' | 'table'
const viewModes: readonly ViewMode[] = ['card', 'list', 'table']

/** URL の一覧の状態。q・sort・view のほかは絞り込み（複数選んだものはカンマ区切り） */
export type ListSearch = {
  q?: string
  sort?: string
  view?: ViewMode
  [filter: string]: string | undefined
}

/**
 * URL の値を一覧の状態として読む関数を作る（知らないキーと変な値は捨てる）
 * @param filterKeys 絞り込みに使う URL のキー
 */
export function listSearchValidator(filterKeys: readonly string[] = []) {
  return (search: Record<string, unknown>): ListSearch => {
    const result: ListSearch = {}
    for (const key of ['q', 'sort', ...filterKeys]) {
      const value = searchString(search[key])
      if (value !== undefined) result[key] = value
    }
    const view = viewModes.find((v) => v === search.view)
    if (view) result.view = view
    return result
  }
}

/** URL の値を文字として読む（手で打った ?q=2026 は数として届くので文字に戻す） */
function searchString(value: unknown) {
  const text =
    typeof value === 'number' ? String(value) : (value as string | undefined)
  // 打っている途中の末尾の空白は残す（消すと「a b」と打てない）
  return typeof text === 'string' && text.trim() !== ''
    ? text.slice(0, 200)
    : undefined
}

/** 絞り込みの札の並び 1 列ぶんの定義 */
export type Facet<T> = {
  /** URL のキー（q・sort・view 以外） */
  key: string
  label: string
  /** そのものが持つ値（なければ空） */
  values: (item: T) => readonly string[]
  /** 札に出す名前（select のラベルなど） */
  display?: (value: string) => string
  /** 複数選べる（選んだものを全部持つものに絞る）。指定しなければ 1 つだけ選ぶ */
  multiple?: boolean
  /** 札の並び。指定しなければ多い順 */
  order?: readonly string[]
  /** 最初に見せる札の数（それより多ければ「ほか N 個」） */
  limit?: number
}

export type FacetOption = {
  value: string
  label: string
  /** それを選んだら（または足したら）何件になるか */
  count: number
}

/** 札の並び 1 列ぶんの今の状態 */
export type FacetState = {
  key: string
  label: string
  multiple: boolean
  limit?: number
  selected: readonly string[]
  options: readonly FacetOption[]
}

export type SortOption = { value: string; label: string }

/** 一覧の上の操作の欄に渡す、一覧の今の状態と操作 */
export type ListControls = {
  query: string
  setQuery: (q: string) => void
  sortOptions: readonly SortOption[]
  sort: string
  setSort: (sort: string) => void
  views: readonly ViewMode[]
  view: ViewMode
  setView: (view: ViewMode) => void
  facets: readonly FacetState[]
  /** 札を押したとき（1 つだけ選ぶ列では、選んでいるものを押すと外れる） */
  toggle: (key: string, value: string) => void
  /** その列の選択を外す（「すべて」） */
  clearFacet: (key: string) => void
  /** 検索語か絞り込みがかかっているか */
  filtering: boolean
  clearAll: () => void
  shown: number
  total: number
}

/**
 * 一覧の状態を URL から読み、検索・絞り込み・並べ替えをした結果（visible）と、操作の欄に渡すものを返す。
 * - URL を書くときは履歴を増やさない（戻るボタンで 1 文字ずつ戻らないように）
 * - 今の状態はブラウザにも覚えておき、詳しいページの「← 一覧へ」やパンくずで同じ一覧に戻れるようにする
 * - 札の件数は、ほかの条件（検索語やほかの列の選択）をかけたうえでの数
 */
export function useList<T>({
  path,
  search,
  items,
  text,
  facets = [],
  sortOptions,
  sort: sortItems,
  views,
}: {
  /** 一覧ページのパス（/toys など） */
  path: string
  search: ListSearch
  items: readonly T[]
  /** 検索の対象にする文字 */
  text: (item: T) => readonly (string | null | undefined)[]
  facets?: readonly Facet<T>[]
  /** 並べ替えの選択肢（最初のものがふだんの並び） */
  sortOptions: readonly SortOption[]
  /** 並べ替えた新しい配列を返す */
  sort: (items: T[], sort: string) => T[]
  /** 選べる表示のしかた（最初のものがふだんの表示） */
  views: readonly ViewMode[]
}): ListControls & { visible: T[] } {
  const navigate = useNavigate()
  const set = (patch: Record<string, string | undefined>) =>
    navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch }
        for (const key of Object.keys(next)) {
          if (next[key] === undefined || next[key] === '') delete next[key]
        }
        return next
      },
      replace: true,
      resetScroll: false,
    } as never)

  const searchJson = JSON.stringify(search)
  React.useEffect(() => {
    rememberListSearch(path, searchJson)
  }, [path, searchJson])

  // 表示のしかたは URL の指定 → 前に選んだもの → ふだんの表示 の順に決める
  const savedView = useRememberedListView(path)
  const view =
    views.find((v) => v === search.view) ??
    views.find((v) => v === savedView) ??
    views[0]
  const sort =
    sortOptions.find((o) => o.value === search.sort)?.value ??
    sortOptions[0].value
  const query = search.q ?? ''

  const selected = facets.map((facet) => {
    const values = (search[facet.key] ?? '').split(',').filter(Boolean)
    return facet.multiple ? values : values.slice(0, 1)
  })

  // 数は多くても数百件なので、描画のたびに数え直す
  const textMatches = items.map((item) => matchesQuery(query, ...text(item)))
  const valuesOf = facets.map((facet) =>
    items.map((item) => facet.values(item)),
  )
  /** 条件に合うか（skip の列の選択は見ない。1 つだけ選ぶ列の件数を数えるため） */
  const passes = (i: number, skip = -1) =>
    textMatches[i] &&
    facets.every(
      (facet, f) =>
        (f === skip && !facet.multiple) ||
        selected[f].every((v) => valuesOf[f][i].includes(v)),
    )

  const visible = sortItems(
    items.filter((_, i) => passes(i)),
    sort,
  )

  const facetStates = facets.map((facet, f): FacetState => {
    const totals = new Map<string, number>()
    const counts = new Map<string, number>()
    items.forEach((_, i) => {
      const values = new Set(valuesOf[f][i])
      const ok = passes(i, f)
      for (const v of values) {
        totals.set(v, (totals.get(v) ?? 0) + 1)
        if (ok) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    })
    // 札の並びは条件によって動かさない（全体での順）
    const byCount = [...totals]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
      .map(([v]) => v)
    const order = facet.order
      ? [
          ...facet.order.filter((v) => totals.has(v)),
          ...byCount.filter((v) => !facet.order?.includes(v)),
        ]
      : byCount
    return {
      key: facet.key,
      label: facet.label,
      multiple: facet.multiple ?? false,
      limit: facet.limit,
      selected: selected[f],
      options: order.map((value) => ({
        value,
        label: facet.display?.(value) ?? value,
        count: counts.get(value) ?? 0,
      })),
    }
  })

  return {
    visible,
    query,
    setQuery: (q) => set({ q: q || undefined }),
    sortOptions,
    sort,
    setSort: (s) => set({ sort: s === sortOptions[0].value ? undefined : s }),
    views,
    view,
    /** 選んだ表示は次に来たときのために覚え、人に送れるよう URL にも入れる（ふだんの表示なら省く） */
    setView: (v) => {
      rememberListView(path, v)
      set({ view: v === views[0] ? undefined : v })
    },
    facets: facetStates,
    toggle: (key, value) => {
      const f = facets.findIndex((facet) => facet.key === key)
      if (f < 0) return
      const current = selected[f]
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : facets[f].multiple
          ? [...current, value]
          : [value]
      set({ [key]: next.join(',') || undefined })
    },
    clearFacet: (key) => set({ [key]: undefined }),
    filtering: query.trim() !== '' || selected.some((s) => s.length > 0),
    clearAll: () =>
      set({
        q: undefined,
        ...Object.fromEntries(facets.map((facet) => [facet.key, undefined])),
      }),
    shown: visible.length,
    total: items.length,
  }
}

/**
 * 検索語で絞り込む（空白で区切った語が全部、どこかに含まれるもの。
 * 大文字・小文字、全角・半角、カタカナ・ひらがなを区別しない）
 */
export function matchesQuery(
  query: string,
  ...texts: (string | null | undefined)[]
) {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeForSearch(texts.filter(Boolean).join(' '))
  return words.every((w) => haystack.includes(w))
}

const viewIcons = { card: LayoutGrid, list: Rows3, table: List } as const
const viewLabels = { card: 'カード', list: 'リスト', table: '表' } as const

/** 一覧の上の操作の欄（検索・並べ替え・表示・絞り込みの札・件数） */
export function ListToolbar({
  list,
  placeholder = '名前や説明で探す',
}: {
  list: ListControls
  placeholder?: string
}) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="探す"
            value={list.query}
            placeholder={placeholder}
            onChange={(e) => list.setQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">並べ替え</span>
          <select
            aria-label="並べ替え"
            value={list.sort}
            onChange={(e) => list.setSort(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {list.sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {list.views.length > 1 && (
          <fieldset className="inline-flex rounded-md border p-0.5">
            <legend className="sr-only">表示のしかた</legend>
            {list.views.map((v) => {
              const Icon = viewIcons[v]
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={list.view === v}
                  title={`${viewLabels[v]}で表示`}
                  onClick={() => list.setView(v)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground',
                    list.view === v && 'bg-muted text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{viewLabels[v]}</span>
                </button>
              )
            })}
          </fieldset>
        )}
      </div>
      {list.facets
        // 選べる値が 1 つしかない列は、絞り込む意味がないので出さない
        .filter((f) => f.options.length > 1 || f.selected.length > 0)
        .map((facet) => (
          <FilterChips
            key={facet.key}
            facet={facet}
            onToggle={(v) => list.toggle(facet.key, v)}
            onAll={
              facet.multiple ? undefined : () => list.clearFacet(facet.key)
            }
          />
        ))}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {list.shown === list.total
            ? `${list.total} 件`
            : `${list.total} 件中 ${list.shown} 件`}
        </span>
        {list.filtering && (
          <button
            type="button"
            onClick={list.clearAll}
            className="inline-flex items-center gap-0.5 rounded px-1 hover:text-foreground"
          >
            <X className="size-3" />
            絞り込みを外す
          </button>
        )}
      </p>
    </div>
  )
}

/** 絞り込みの札の並び */
function FilterChips({
  facet,
  onToggle,
  onAll,
}: {
  facet: FacetState
  onToggle: (value: string) => void
  /** 「すべて」を押したとき（なければ「すべて」を出さない） */
  onAll?: () => void
}) {
  const { options, selected, limit } = facet
  // 数を絞って見せるときは、今の条件で押せる札を先に見せる
  const visible =
    limit && options.length > limit
      ? options
          .filter((o) => o.count > 0 || selected.includes(o.value))
          .filter((o, i) => i < limit || selected.includes(o.value))
      : options
  const hidden = options.filter((o) => !visible.includes(o))
  const chip = (o: FacetOption) => {
    const active = selected.includes(o.value)
    // 今の条件では 1 件もなくなる札は押せなくする
    const empty = o.count === 0 && !active
    return (
      <Chip
        key={o.value}
        active={active}
        disabled={empty}
        title={empty ? '今の条件では 0 件' : undefined}
        onClick={() => onToggle(o.value)}
      >
        {o.label}
        <span className="ml-1 text-[10px] tabular-nums opacity-60">
          {o.count}
        </span>
      </Chip>
    )
  }
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">{facet.label}で絞り込む</legend>
      <span className="mr-1 text-xs text-muted-foreground">{facet.label}</span>
      {onAll && (
        <Chip active={selected.length === 0} onClick={onAll}>
          すべて
        </Chip>
      )}
      {visible.map(chip)}
      {hidden.length > 0 && (
        <details className="contents">
          <summary className="cursor-pointer list-none rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            ほか {hidden.length} 個
          </summary>
          {hidden.map(chip)}
        </details>
      )}
    </fieldset>
  )
}

function Chip({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  )
}

/** 絞り込んだら何も残らなかったとき */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      条件に合うものがありません。
      <button
        type="button"
        onClick={onClear}
        className="ml-2 underline underline-offset-2 hover:text-foreground"
      >
        絞り込みを外す
      </button>
    </div>
  )
}
