import { useNavigate } from '@tanstack/react-router'
import { LayoutGrid, List, Rows3, Search, X } from 'lucide-react'
import type * as React from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * 一覧ページの共通部品（検索・絞り込み・並べ替え・表示の切り替え）。
 * 状態は URL（?q=…&tag=…&sort=…&view=…）に入れるので、詳しいページから戻っても、
 * リンクを人に送っても、同じ一覧が出る
 */

export type ViewMode = 'card' | 'list' | 'table'

/** URL の一覧の状態 */
export type ListSearch = {
  q?: string
  /** 絞り込み（複数はカンマ区切り） */
  tag?: string
  /** 1 つだけ選ぶ絞り込み（カテゴリなど） */
  cat?: string
  sort?: string
  view?: ViewMode
}

/** URL の値を、一覧の状態として読む（変な値は捨てる） */
export function parseListSearch(search: Record<string, unknown>): ListSearch {
  const str = (v: unknown) =>
    typeof v === 'string' && v.trim() !== '' ? v.slice(0, 200) : undefined
  const view = search.view
  return {
    q: str(search.q),
    tag: str(search.tag),
    cat: str(search.cat),
    sort: str(search.sort),
    view:
      view === 'card' || view === 'list' || view === 'table' ? view : undefined,
  }
}

/** 一覧の状態を読み書きする。書くときは履歴を増やさない（戻るボタンで 1 文字ずつ戻らないように） */
export function useListSearch(search: ListSearch) {
  const navigate = useNavigate()
  const set = (patch: Partial<ListSearch>) =>
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
  const tags = search.tag ? search.tag.split(',').filter(Boolean) : []
  return {
    query: search.q ?? '',
    tags,
    cat: search.cat ?? null,
    set,
    setQuery: (q: string) => set({ q: q || undefined }),
    toggleTag: (tag: string) => {
      const next = tags.includes(tag)
        ? tags.filter((t) => t !== tag)
        : [...tags, tag]
      set({ tag: next.length > 0 ? next.join(',') : undefined })
    },
    clearTags: () => set({ tag: undefined }),
    setCat: (cat: string | null) => set({ cat: cat ?? undefined }),
    clearAll: () => set({ q: undefined, tag: undefined, cat: undefined }),
  }
}

/** 検索語で絞り込む（空白で区切った語が全部、どこかに含まれるもの。大文字・小文字、全角・半角を区別しない） */
export function matchesQuery(
  query: string,
  ...texts: (string | null | undefined)[]
) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize(texts.filter(Boolean).join(' '))
  return words.every((w) => haystack.includes(w))
}

const normalize = (s: string) => s.normalize('NFKC').toLowerCase()

const viewIcons = { card: LayoutGrid, list: Rows3, table: List } as const
const viewLabels = { card: 'カード', list: 'リスト', table: '表' } as const

/** 一覧の上の操作の欄 */
export function ListToolbar({
  query,
  onQuery,
  placeholder = '名前や説明で探す',
  sortOptions,
  sort,
  onSort,
  views,
  view,
  onView,
  shown,
  total,
  onClear,
  children,
}: {
  query: string
  onQuery: (q: string) => void
  placeholder?: string
  sortOptions: readonly { value: string; label: string }[]
  sort: string
  onSort: (sort: string) => void
  views: readonly ViewMode[]
  view: ViewMode
  onView: (view: ViewMode) => void
  /** 今出ている数と、全部の数 */
  shown: number
  total: number
  /** 絞り込みを全部外す（絞り込んでいるときだけ出す） */
  onClear?: () => void
  /** 絞り込みの札（タグ・カテゴリ） */
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="探す"
            value={query}
            placeholder={placeholder}
            onChange={(e) => onQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">並べ替え</span>
          <select
            aria-label="並べ替え"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {views.length > 1 && (
          <fieldset className="inline-flex rounded-md border p-0.5">
            <legend className="sr-only">表示のしかた</legend>
            {views.map((v) => {
              const Icon = viewIcons[v]
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  title={`${viewLabels[v]}で表示`}
                  onClick={() => onView(v)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground',
                    view === v && 'bg-muted text-foreground',
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
      {children}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {shown === total ? `${total} 件` : `${total} 件中 ${shown} 件`}
        </span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
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
export function FilterChips({
  label,
  options,
  selected,
  onToggle,
  onAll,
  limit,
}: {
  label: string
  options: readonly { value: string; label: string; count: number }[]
  selected: readonly string[]
  onToggle: (value: string) => void
  /** 「すべて」を押したとき（なければ「すべて」を出さない） */
  onAll?: () => void
  /** 最初に見せる数（それより多ければ「もっと見る」） */
  limit?: number
}) {
  const visible =
    limit && options.length > limit
      ? options.filter((o, i) => i < limit || selected.includes(o.value))
      : options
  const hidden = options.length - visible.length
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">{label}で絞り込む</legend>
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {onAll && (
        <Chip active={selected.length === 0} onClick={onAll}>
          すべて
        </Chip>
      )}
      {visible.map((o) => (
        <Chip
          key={o.value}
          active={selected.includes(o.value)}
          onClick={() => onToggle(o.value)}
        >
          {o.label}
          <span className="ml-1 text-[10px] opacity-60">{o.count}</span>
        </Chip>
      ))}
      {hidden > 0 && (
        <details className="contents">
          <summary className="cursor-pointer list-none rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            ほか {hidden} 個
          </summary>
          {options
            .filter((o) => !visible.includes(o))
            .map((o) => (
              <Chip
                key={o.value}
                active={selected.includes(o.value)}
                onClick={() => onToggle(o.value)}
              >
                {o.label}
                <span className="ml-1 text-[10px] opacity-60">{o.count}</span>
              </Chip>
            ))}
        </details>
      )}
    </fieldset>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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

/** タグなどの値を、出てくる数の多い順（同じなら名前順）に数える */
export function countValues(lists: readonly (readonly string[])[]) {
  const counts = new Map<string, number>()
  for (const list of lists)
    for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([value, count]) => ({ value, label: value, count }))
}
