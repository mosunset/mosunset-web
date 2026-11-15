import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'

import {
  rememberListSearch,
  rememberListView,
  useRememberedListView,
} from '@/lib/list-memory'
import { normalizeForSearch } from '@/lib/search-text'

/**
 * 一覧ページの共通部品（検索・絞り込み・並べ替え・表示の切り替え）。
 * 状態は URL（?q=…&sort=…&view=…&<絞り込みのキー>=…）に入れるので、詳しいページから戻っても、
 * リンクを人に送っても、同じ一覧が出る
 */

/** 一覧の上の操作の欄の id（カードの中の値で絞り込んだとき、ここまで戻る） */
export const LIST_TOP_ID = 'list-top'

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
