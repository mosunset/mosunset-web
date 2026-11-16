import {
  type CollectionAttributes,
  type CollectionKind,
  relatedKeysOf,
} from '@/lib/collections/config'

const collator = new Intl.Collator('ja', { numeric: true })

/** （上）（中）（下）の巻は、この順に並ぶように数に置き換えて比べる（そのままだと 下・上・中 の順になる） */
const volumeKey = (title: string) =>
  title.replace(
    /[（(]([上中下])[）)]/g,
    (_, mark: string) => `（${'上中下'.indexOf(mark) + 1}）`,
  )

/** 名前の比べ方（日本語の並び。「2」と「10」は数として比べるので、巻数などが順に並ぶ） */
export const compareNames = (a: string, b: string) =>
  collator.compare(volumeKey(a), volumeKey(b))

/** 並べるのに使う値（一覧の 1 行のうち） */
type OrderRow = {
  title: string
  sortOrder: number
  acquiredAt: string | null
  createdAt: Date
  attributes: CollectionAttributes
}

/** 手で決めた順 → 日付の新しい順（日付のないものは後）→ 名前の順 → 登録の新しい順 */
function compareBase(a: OrderRow, b: OrderRow) {
  const dateA = a.acquiredAt ?? ''
  const dateB = b.acquiredAt ?? ''
  return (
    a.sortOrder - b.sortOrder ||
    (dateA === dateB ? 0 : dateA < dateB ? 1 : -1) ||
    compareNames(a.title, b.title) ||
    b.createdAt.getTime() - a.createdAt.getTime()
  )
}

/**
 * 一覧のふだんの並び（おすすめ順）。公開側の一覧・詳しいページの「前へ／次へ」・管理画面の一覧で同じ順にする。
 * 1. 管理画面のドラッグで決めた順で並べる（決めていないものは日付の新しい順、それもなければ名前の順）
 * 2. 種類ごとの relatedKeys（おもちゃなら作品 → 種類）が同じものを、そのまとまりのいちばん前のものの位置に寄せる。
 *    大きいまとまりから順に寄せ、値のないものどうしも 1 つのまとまりとして扱う。
 *    あとから足したものも、同じ作品のものの近くに並ぶ
 */
export function defaultOrder<T extends OrderRow>(
  kind: CollectionKind,
  rows: readonly T[],
): T[] {
  const keys = relatedKeysOf(kind)
  const gather = (list: T[], depth: number): T[] => {
    if (depth >= keys.length || list.length < 2) return list
    // Map は入れた順を保つので、まとまりはいちばん前のものの位置に並ぶ
    const groups = new Map<string, T[]>()
    for (const row of list) {
      const value = row.attributes[keys[depth]] ?? ''
      const group = groups.get(value)
      if (group) group.push(row)
      else groups.set(value, [row])
    }
    return [...groups.values()].flatMap((group) => gather(group, depth + 1))
  }
  return gather([...rows].sort(compareBase), 0)
}
