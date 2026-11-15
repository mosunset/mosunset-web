import { X } from 'lucide-react'
import type * as React from 'react'

import type {
  FacetOption,
  FacetState,
  ListControls,
} from '@/components/list/use-list'
import { cn } from '@/lib/utils'

/**
 * 件数と、今かかっている条件の札（× で 1 つずつ外せる）。
 * 札の列の「ほか N 個」に隠れた選択や検索語も、ここを見ればわかる
 */
export function ActiveFilters({ list }: { list: ListControls }) {
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

/** 絞り込みの札の並び */
export function FilterChips({
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
