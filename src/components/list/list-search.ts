/**
 * 一覧の状態を URL（?q=…&sort=…&view=…&<絞り込みのキー>=…）から読む部分。
 * ルートの validateSearch で使い、ルートの設定はどのページでも読まれるので、一覧の仕組み（use-list.ts）とは分けて軽く保つ
 */

/** card: 大きめのカード、list: 縦に並べる、gallery: 写真を小さく多く並べる、table: 表 */
export type ViewMode = 'card' | 'list' | 'gallery' | 'table'
export const viewModes: readonly ViewMode[] = [
  'card',
  'list',
  'gallery',
  'table',
]

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
