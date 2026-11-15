import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type * as React from 'react'
import type { Group } from '@/components/list/grouped-sections'
import { type ListControls, parseColumnSort } from '@/components/list/use-list'
import { cn } from '@/lib/utils'

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
