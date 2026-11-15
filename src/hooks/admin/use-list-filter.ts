import { useMemo, useState } from 'react'

import { matchesQuery } from '@/components/admin/list-filter'

/**
 * 管理画面の一覧の検索語と絞り込みの状態、それに合うものだけの一覧（visible）。
 * filterProps はそのまま ListFilter に渡せる。
 * matchesFilter と searchText は毎回作り直さないよう、コンポーネントの外で定義して渡す
 */
export function useListFilter<T, F extends string>(
  items: readonly T[],
  {
    initialFilter,
    matchesFilter,
    searchText,
  }: {
    initialFilter: F
    /** 絞り込みボタンの条件に合うか */
    matchesFilter: (item: T, filter: F) => boolean
    /** 検索の対象にする文字列 */
    searchText: (item: T) => (string | null | undefined)[]
  },
) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<F>(initialFilter)

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesFilter(item, filter) &&
          matchesQuery(query, ...searchText(item)),
      ),
    [items, query, filter, matchesFilter, searchText],
  )

  return {
    query,
    filter,
    visible,
    filterProps: {
      query,
      onQueryChange: setQuery,
      filter,
      onFilterChange: setFilter,
    },
  }
}
