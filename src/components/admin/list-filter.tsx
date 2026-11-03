import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type FilterOption<T extends string> = { value: T; label: string }

/** 管理画面の一覧の上に置く、検索欄と絞り込みボタン */
export function ListFilter<T extends string>({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  options,
  placeholder = '検索',
}: {
  query: string
  onQueryChange: (value: string) => void
  filter: T
  onFilterChange: (value: T) => void
  options: readonly FilterOption<T>[]
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
        {query && (
          <button
            type="button"
            aria-label="検索をクリア"
            onClick={() => onQueryChange('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <fieldset className="inline-flex rounded-md border p-0.5">
        <legend className="sr-only">絞り込み</legend>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={filter === o.value}
            onClick={() => onFilterChange(o.value)}
            className={cn(
              'rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
              filter === o.value && 'bg-muted font-medium text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

/** 検索語がどれかの文字列に含まれるか（大文字小文字・全角半角の違いはある程度無視する） */
export function matchesQuery(
  query: string,
  ...values: (string | null | undefined)[]
) {
  const q = query.trim().normalize('NFKC').toLowerCase()
  if (!q) return true
  return values.some((v) => v?.normalize('NFKC').toLowerCase().includes(q))
}
