import type * as React from 'react'

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
  forceHeadings = false,
}: {
  groups: readonly Group<T>[]
  /** grouped のときは見出し（h2）の下に並ぶので、中の名前は h3 にする */
  children: (items: T[], grouped: boolean) => React.ReactNode
  /** まとまりが 1 つでも見出しを付ける（上にほかの見出し付きのまとまりがあるとき） */
  forceHeadings?: boolean
}) {
  if (groups.length <= 1 && !forceHeadings) {
    return <>{children(groups[0]?.items ?? [], false)}</>
  }
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
