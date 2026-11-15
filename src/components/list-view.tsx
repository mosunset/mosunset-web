import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Grid3x3,
  LayoutGrid,
  List,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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

/** card: 大きめのカード、list: 縦に並べる、gallery: 写真を小さく多く並べる、table: 表 */
export type ViewMode = 'card' | 'list' | 'gallery' | 'table'
const viewModes: readonly ViewMode[] = ['card', 'list', 'gallery', 'table']

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
  /**
   * 一覧の上に札の列を出すか（ふだんは出す）。出さない列も、カードの中の値を押して絞り込める
   * （著者のように値の種類が多く、札にすると並びすぎるもの）
   */
  chips?: boolean
}

export type FacetOption = {
  value: string
  label: string
  /** それを選んだら（または足したら）何件になるか */
  count: number
  /** 全体で何件が持っているか */
  total: number
}

/** 札の並び 1 列ぶんの今の状態 */
export type FacetState = {
  key: string
  label: string
  multiple: boolean
  limit?: number
  chips: boolean
  selected: readonly string[]
  options: readonly FacetOption[]
}

export type SortOption = { value: string; label: string }

/** 表の見出しを押して並べ替えられる列 */
export type SortColumn<T> = {
  key: string
  label: string
  /** 並べ替えに使う値（空のものは、上り・下りどちらでも最後に回す） */
  value: (item: T) => string | null | undefined
}

/** 表の列での並べ替えは URL に sort=asc:<列> / desc:<列> で入れる */
export function parseColumnSort(sort: string) {
  const match = /^(asc|desc):(.+)$/.exec(sort)
  return match ? { dir: match[1] as 'asc' | 'desc', key: match[2] } : null
}

/** 列の値で並べ替える（数字は数として比べる。空のものは最後） */
function sortByColumn<T>(
  items: T[],
  dir: 'asc' | 'desc',
  value: (item: T) => string | null | undefined,
) {
  const sign = dir === 'asc' ? 1 : -1
  return items.sort((a, b) => {
    const x = value(a) || ''
    const y = value(b) || ''
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1)
    return sign * x.localeCompare(y, 'ja', { numeric: true })
  })
}

/** 一覧の上の操作の欄に渡す、一覧の今の状態と操作 */
export type ListControls = {
  query: string
  setQuery: (q: string) => void
  /** 並べ替えの選択欄の選択肢（表の列で並べ替えているときは、その並びも入る） */
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
  /** カードや表の中の値を押したとき、その値で絞り込む（もう選んでいれば何もしない） */
  filterBy: (key: string, value: string) => void
  /** その値を押して絞り込めるか（ほかにも同じ値を持つものがあり、全部が同じ値ではなく、まだ選んでいない） */
  filterable: (key: string, value: string | null | undefined) => boolean
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
  columns = [],
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
  /** 表の見出しを押して並べ替えられる列 */
  columns?: readonly SortColumn<T>[]
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
  const columnSort = parseColumnSort(search.sort ?? '')
  const sortColumn = columns.find((c) => c.key === columnSort?.key)
  const sort =
    sortOptions.find((o) => o.value === search.sort)?.value ??
    (sortColumn && search.sort) ??
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

  const filtered = items.filter((_, i) => passes(i))
  const visible =
    sortColumn && columnSort
      ? sortByColumn(filtered, columnSort.dir, sortColumn.value)
      : sortItems(filtered, sort)

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
      chips: facet.chips ?? true,
      selected: selected[f],
      options: order.map((value) => ({
        value,
        label: facet.display?.(value) ?? value,
        count: counts.get(value) ?? 0,
        total: totals.get(value) ?? 0,
      })),
    }
  })

  return {
    visible,
    query,
    setQuery: (q) => set({ q: q || undefined }),
    sortOptions:
      sortColumn && columnSort
        ? [
            ...sortOptions,
            {
              value: sort,
              label: `${sortColumn.label}の${columnSort.dir === 'asc' ? '昇順' : '降順'}`,
            },
          ]
        : sortOptions,
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
    filterBy: (key, value) => {
      const f = facets.findIndex((facet) => facet.key === key)
      if (f < 0 || selected[f].includes(value)) return
      const next = facets[f].multiple ? [...selected[f], value] : [value]
      set({ [key]: next.join(',') })
      // 一覧の下のほうで押したときは、絞り込んだ一覧の頭（操作の欄）まで戻る
      const top = document.getElementById(LIST_TOP_ID)
      // ヘッダー（3.5rem）の下に隠れていたら
      if (top && top.getBoundingClientRect().top < 56) {
        top.scrollIntoView({ block: 'start' })
      }
    },
    filterable: (key, value) => {
      if (!value) return false
      const facet = facetStates.find((fs) => fs.key === key)
      if (!facet || facet.selected.includes(value)) return false
      const total = facet.options.find((o) => o.value === value)?.total ?? 0
      return total > 1 && total < items.length
    },
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

const viewIcons = {
  card: LayoutGrid,
  list: Rows3,
  gallery: Grid3x3,
  table: List,
} as const
const viewLabels = {
  card: 'カード',
  list: 'リスト',
  gallery: '写真',
  table: '表',
} as const

/** 一覧の上の操作の欄の id（カードの中の値で絞り込んだとき、ここまで戻る） */
const LIST_TOP_ID = 'list-top'

/** 一覧の上の操作の欄（検索・並べ替え・表示・絞り込みの札・件数） */
/** 狭い画面（sm より狭い）か。サーバーと最初の描画では広い画面として扱う */
function useNarrowScreen() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia('(max-width: 639px)')
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  )
}

export function ListToolbar({
  list,
  placeholder = '名前や説明で探す',
  shortPlaceholder = '探す',
}: {
  list: ListControls
  placeholder?: string
  /** スマホで使う短い案内（長い案内は途中で切れてしまうため） */
  shortPlaceholder?: string
}) {
  const stuck = useStuck(LIST_TOP_ID)
  const narrow = useNarrowScreen()
  const facets = list.facets.filter(
    // 選べる値が 1 つしかない列は、絞り込む意味がないので出さない
    (f) => f.chips && (f.options.length > 1 || f.selected.length > 0),
  )
  const facetRows = facets.map((facet) => (
    <FilterChips
      key={facet.key}
      facet={facet}
      onToggle={(v) => list.toggle(facet.key, v)}
      onAll={facet.multiple ? undefined : () => list.clearFacet(facet.key)}
    />
  ))
  // 一覧の中で上に貼り付くよう、外側を包まずに返す（貼り付く範囲は親＝一覧全体）
  return (
    <>
      <div id={LIST_TOP_ID} className="scroll-mt-14" />
      {/* 検索欄の段は、スクロールしても画面の上に貼り付ける */}
      <div
        className={cn(
          // スマホでヘッダーを隠しているあいだは、画面のいちばん上に貼り付く（site-header.tsx の useHideOnScroll）
          'sticky top-[var(--header-offset,3.5rem)] z-20 -mx-6 flex items-center gap-2 border-b border-transparent bg-background/95 px-6 py-2 transition-[top,border-color,box-shadow] duration-200 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur',
          stuck && 'border-border shadow-sm',
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SearchInput
            value={list.query}
            onCommit={list.setQuery}
            placeholder={narrow ? shortPlaceholder : placeholder}
          />
        </div>
        <SortSelect list={list} className="hidden text-sm sm:flex" />
        <ViewSwitch list={list} />
        <MobileFilters list={list} facetCount={facets.length}>
          {facetRows}
        </MobileFilters>
      </div>
      <div className="mt-2 mb-6 space-y-3">
        {/* スマホでは札の列を「絞り込み」のボタンの中にしまう */}
        {facetRows.length > 0 && (
          <div className="hidden space-y-3 sm:block">{facetRows}</div>
        )}
        <ActiveFilters list={list} />
      </div>
    </>
  )
}

/**
 * id の要素が画面の上（ヘッダーの下）より上に出たか。
 * 検索欄の段が貼り付いているときだけ、下に線と影を付けるのに使う
 */
function useStuck(id: string) {
  const [stuck, setStuck] = React.useState(false)
  React.useEffect(() => {
    const target = document.getElementById(id)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) =>
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 60),
      // ヘッダー（3.5rem）の下の線を境にする
      { rootMargin: '-57px 0px 0px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [id])
  return stuck
}

/** 並べ替えの選択欄（見出しの「並べ替え」付き） */
function SortSelect({
  list,
  className,
  selectClassName,
}: {
  list: ListControls
  /** 外側（見出しと選択欄を並べる label）の見た目 */
  className?: string
  selectClassName?: string
}) {
  return (
    <label
      className={cn('items-center gap-2 text-muted-foreground', className)}
    >
      並べ替え
      <select
        value={list.sort}
        onChange={(e) => list.setSort(e.target.value)}
        className={cn(
          'h-9 rounded-md border bg-background px-2 text-sm text-foreground',
          selectClassName,
        )}
      >
        {list.sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ViewSwitch({ list }: { list: ListControls }) {
  if (list.views.length <= 1) return null
  return (
    <fieldset className="inline-flex shrink-0 rounded-md border p-0.5">
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
            <span className="sr-only sm:not-sr-only">{viewLabels[v]}</span>
          </button>
        )
      })}
    </fieldset>
  )
}

/**
 * スマホ用の「絞り込み」ボタンと、押すと下から出てくる並べ替え・絞り込みの欄。
 * 札の列が何段もあると一覧が下に押し出されるので、スマホではここにしまう
 */
function MobileFilters({
  list,
  facetCount,
  children,
}: {
  list: ListControls
  facetCount: number
  children: React.ReactNode
}) {
  const selected = list.facets.reduce((n, f) => n + f.selected.length, 0)
  const sorted = list.sort !== list.sortOptions[0].value
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs sm:hidden',
            selected > 0 || sorted
              ? 'text-foreground'
              : 'text-muted-foreground',
          )}
        >
          <SlidersHorizontal className="size-4" />
          <span className="sr-only">
            {facetCount > 0 ? '絞り込み・並べ替え' : '並べ替え'}
          </span>
          {selected > 0 && (
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums">
              {selected}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            {facetCount > 0 ? '絞り込み・並べ替え' : '並べ替え'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            一覧の並べ替えと絞り込みを選びます
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          <SortSelect
            list={list}
            className="flex text-xs"
            selectClassName="flex-1"
          />
          {children}
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t">
          {selected > 0 ? (
            <button
              type="button"
              onClick={list.clearAll}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              すべて外す
            </button>
          ) : (
            <span />
          )}
          <SheetClose asChild>
            <Button>{list.shown} 件を見る</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * 件数と、今かかっている条件の札（× で 1 つずつ外せる）。
 * 札の列の「ほか N 個」に隠れた選択や検索語も、ここを見ればわかる
 */
function ActiveFilters({ list }: { list: ListControls }) {
  const query = list.query.trim()
  const active = [
    ...(query
      ? [
          {
            id: 'q',
            prefix: '検索',
            label: `「${query}」`,
            remove: () => list.setQuery(''),
          },
        ]
      : []),
    ...list.facets.flatMap((facet) =>
      facet.selected.map((value) => ({
        id: `${facet.key}:${value}`,
        prefix: facet.label,
        label: facet.options.find((o) => o.value === value)?.label ?? value,
        remove: () => list.toggle(facet.key, value),
      })),
    ),
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-live="polite" className="mr-1">
        {list.shown === list.total
          ? `${list.total} 件`
          : `${list.total} 件中 ${list.shown} 件`}
      </span>
      {active.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.remove}
          aria-label={`${a.prefix}「${a.label}」の条件を外す`}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-1.5 pl-2.5 text-foreground hover:bg-muted"
        >
          <span className="text-muted-foreground">{a.prefix}:</span>
          {a.label}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
      {active.length > 1 && (
        <button
          type="button"
          onClick={list.clearAll}
          className="rounded px-1 underline-offset-2 hover:text-foreground hover:underline"
        >
          すべて外す
        </button>
      )}
    </div>
  )
}

/**
 * 検索欄。打った文字はまず手元に持ち、打つ手が少し止まってから URL に書く。
 * 日本語の変換中は書かず、確定したときに書く（変換中の文字で一覧が動いたり、1 文字ごとに URL を書き換えたりしないように）
 */
function SearchInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string
  onCommit: (q: string) => void
  placeholder: string
}) {
  const [draft, setDraft] = React.useState(value)
  const composing = React.useRef(false)
  /** 最後に URL に書いた（または URL から受け取った）検索語 */
  const committed = React.useRef(value)
  const commit = React.useEffectEvent((q: string) => {
    if (q === committed.current) return
    committed.current = q
    onCommit(q)
  })

  // 外で変わったとき（条件の札の × で検索語を外したときなど）は、入力欄も合わせる
  React.useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(value)
    }
  }, [value])

  React.useEffect(() => {
    if (composing.current) return
    const timer = setTimeout(() => commit(draft), 250)
    return () => clearTimeout(timer)
  }, [draft])

  return (
    <Input
      type="search"
      aria-label="探す"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        commit(e.currentTarget.value)
      }}
      onKeyDown={(e) => {
        // Enter ではすぐに探す（変換の確定の Enter は除く）
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(draft)
      }}
      className="h-9 pl-8"
    />
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
        <span className="ml-1 text-[10px] tabular-nums">{o.count}</span>
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

/**
 * カードや表の中の値。押すとその値で絞り込める（ほかに同じ値を持つものがなければただの文字）。
 * リンクの中には置けないので、カードではリンクの外に置く
 */
export function FilterValue({
  list,
  facetKey,
  value,
  children,
  className,
}: {
  list: ListControls
  facetKey: string
  value: string | null | undefined
  children: React.ReactNode
  className?: string
}) {
  if (!list.filterable(facetKey, value)) {
    return <span className={className}>{children}</span>
  }
  const facet = list.facets.find((f) => f.key === facetKey)
  const valueLabel =
    facet?.options.find((o) => o.value === value)?.label ?? value
  return (
    <button
      type="button"
      onClick={() => value && list.filterBy(facetKey, value)}
      title={`${facet?.label ?? ''}「${valueLabel}」で絞り込む`}
      className={cn(
        'relative z-10 cursor-pointer text-left underline-offset-2 hover:text-foreground hover:underline',
        className,
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

/** 一覧の中のまとまり（資格の「取得済み」、記事の「2026 年」など） */
export type Group<T> = { key: string; label: string; items: T[] }

/**
 * 並びを保ったまま、まとまりに分ける。
 * order を渡せばその順（値のないものは最後）、なければ最初に出てきた順
 */
export function groupItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  {
    label = (key) => key,
    order,
  }: { label?: (key: string) => string; order?: readonly string[] } = {},
): Group<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  const rank = (key: string) => {
    if (!order) return 0
    const i = order.indexOf(key)
    return i >= 0 ? i : key === '' ? order.length + 1 : order.length
  }
  // sort は同じ順位のものの並びを変えないので、order がなければ出てきた順のまま
  return [...groups]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([key, list]) => ({ key, label: label(key), items: list }))
}

/** まとまりごとに見出しを付けて並べる（まとまりが 1 つしかなければ見出しは付けない） */
export function GroupedSections<T>({
  groups,
  children,
}: {
  groups: readonly Group<T>[]
  /** grouped のときは見出し（h2）の下に並ぶので、中の名前は h3 にする */
  children: (items: T[], grouped: boolean) => React.ReactNode
}) {
  if (groups.length <= 1) return <>{children(groups[0]?.items ?? [], false)}</>
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.key}>
          <GroupHeading group={group} />
          {children(group.items, true)}
        </section>
      ))}
    </div>
  )
}

function GroupHeading({ group }: { group: Group<unknown> }) {
  return (
    <h2 className="mb-4 flex items-baseline gap-2 border-b pb-2 text-lg font-semibold">
      {group.label}
      <span className="text-xs font-normal text-muted-foreground tabular-nums">
        {group.items.length} 件
      </span>
    </h2>
  )
}

/**
 * 押すと並べ替わる表の見出し。押すたびに 昇順 → 降順 → ふだんの並び と変わる
 * @param column useList に渡した columns の key
 */
export function SortableHeader({
  list,
  column,
  children,
  className,
}: {
  list: ListControls
  column: string
  children: React.ReactNode
  className?: string
}) {
  const current = parseColumnSort(list.sort)
  const dir = current?.key === column ? current.dir : null
  const Icon =
    dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <th
      aria-sort={
        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
      }
      className={cn('px-1.5 py-1 font-normal whitespace-nowrap', className)}
    >
      <button
        type="button"
        onClick={() =>
          list.setSort(
            dir === null
              ? `asc:${column}`
              : dir === 'asc'
                ? `desc:${column}`
                : list.sortOptions[0].value,
          )
        }
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground',
          dir && 'text-foreground',
        )}
      >
        {children}
        <Icon className={cn('size-3', !dir && 'opacity-40')} />
      </button>
    </th>
  )
}

/** 表の中のまとまりの見出しの行 */
export function TableGroupRow({
  group,
  colSpan,
}: {
  group: Group<unknown>
  colSpan: number
}) {
  return (
    <tr className="border-t bg-muted/20">
      <th
        colSpan={colSpan}
        scope="colgroup"
        className="px-3 py-1.5 text-left text-xs font-semibold"
      >
        {group.label}
        <span className="ml-2 font-normal text-muted-foreground tabular-nums">
          {group.items.length} 件
        </span>
      </th>
    </tr>
  )
}
