import {
  ChevronDown,
  Grid3x3,
  LayoutGrid,
  List,
  Rows3,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import * as React from 'react'

import { ActiveFilters, FilterChips } from '@/components/list/filters'
import { LIST_TOP_ID, type ListControls } from '@/components/list/use-list'
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
import { cn } from '@/lib/utils'

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

/** 一覧の上の操作の欄（検索・並べ替え・表示・絞り込みの札・件数） */
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
          <div className="hidden space-y-3 sm:block">
            {/* 広い画面でも、出すのは最初の 1 種類だけ。残りは開いたときに出す（札が何段にもなって一覧が下に押されるため） */}
            {facetRows[0]}
            {facets.length > 1 && (
              <MoreFacets
                labels={facets.slice(1).map((f) => f.label)}
                // 残りの札で選んでいるものがあるときは、開いておく
                forceOpen={facets.slice(1).some((f) => f.selected.length > 0)}
              >
                {facetRows.slice(1)}
              </MoreFacets>
            )}
          </div>
        )}
        <ActiveFilters list={list} />
      </div>
    </>
  )
}

/** 広い画面で、2 種類目からの絞り込みの札を畳んでおく */
function MoreFacets({
  labels,
  forceOpen,
  children,
}: {
  labels: string[]
  forceOpen: boolean
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = React.useState(false)
  const open = expanded || forceOpen
  const id = React.useId()
  return (
    <>
      {!forceOpen && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
          {open ? '閉じる' : `${labels.join('・')}でも絞り込む`}
        </button>
      )}
      <div id={id} hidden={!open} className="space-y-3">
        {children}
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
